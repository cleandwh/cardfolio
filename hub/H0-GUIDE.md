# H0 — 노트20 울트라 기초 세팅 & 속도 측정 가이드

목적: 실제로 만들기 전에 **① S25 ↔ 노트20 연결이 되는지, ② 노트20에서 LLM이 얼마나 빠른지, ③ SD 카드 사진을 읽을 수 있는지** 확인한다.
예상 소요: 1시간 내외 (모델 다운로드 시간 포함). 비용 0원.

각 단계에서 **오류 메시지가 나오면 화면을 캡처해서 그대로 보여 주세요.** 앱 이름·메뉴 위치는 버전에 따라 조금 다를 수 있습니다.

---

## 1. 노트20 기본 설정

1. 와이파이 연결, 충전기 연결.
2. 설정 검색창에 **"배터리 보호"** 검색 → 켜기 (85%에서 충전 멈춤).
3. 설정 검색창에 **"절전 예외"** 검색 → 나중에 설치할 **Termux, Tailscale**을 추가 (설치 후 다시 와서 추가).

## 2. Tailscale (두 폰 모두)

1. 노트20, S25 모두 Play 스토어에서 **Tailscale** 설치.
2. 두 폰 모두 **같은 계정**(예: 같은 구글 계정)으로 로그인 → 연결(Connect) 켜기.
3. 노트20의 Tailscale 앱에서 **이 기기의 이름**(예: `galaxy-note20-ultra`)과 **IP**(`100.`으로 시작)를 메모.

## 3. Termux 설치 (노트20)

> Play 스토어의 Termux는 오래된 버전이라 쓰지 않습니다.

1. 노트20 크롬에서 **F-Droid**(f-droid.org) 설치 → F-Droid에서 **Termux**, **Termux:Boot** 설치.
   (F-Droid가 어려우면 GitHub의 termux-app Releases에서 `arm64-v8a` apk 설치)
2. Termux 실행 후 한 줄씩 입력 (중간에 `Y/n` 물으면 Enter):

```sh
termux-setup-storage
pkg update -y && pkg upgrade -y
pkg install -y nodejs llama-cpp ffmpeg libvips
```

3. `termux-setup-storage`에서 저장소 권한 허용 팝업 → **허용**.

## 4. SD 카드 사진 확인

```sh
ls /storage
```
`emulated`, `self` 말고 `ABCD-1234` 같은 이름이 SD 카드입니다. 그 이름으로:

```sh
ls /storage/ABCD-1234
ls /storage/ABCD-1234/DCIM
find /storage/ABCD-1234 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.heic' -o -iname '*.png' \) | wc -l
find /storage/ABCD-1234 -type f \( -iname '*.mp4' -o -iname '*.mov' \) | wc -l
```
→ 폴더 목록과 사진·동영상 개수를 알려 주세요. (`Permission denied`가 나오면 그대로 캡처)

## 5. LLM 속도 측정

모델 2개를 받아서 각각 측정합니다 (각 1~2GB, **와이파이에서** 받기).

```sh
mkdir -p ~/models && cd ~/models
curl -L -o q15.gguf https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf
curl -L -o q3.gguf  https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf
ls -lh
```
(파일 크기가 1KB 정도로 작으면 주소가 바뀐 것 — 알려 주세요.)

```sh
llama-bench -m q15.gguf -p 512 -n 64
llama-bench -m q3.gguf  -p 512 -n 64
```
→ 결과 표 전체를 캡처해 주세요. (`pp512`=입력 읽는 속도, `tg64`=글자 생성 속도, 숫자가 클수록 빠름)

측정하는 동안 폰이 뜨거워지는 정도도 알려 주세요 (미지근 / 따뜻 / 뜨거움).

## 6. S25에서 접속 확인 (가장 중요)

노트20 Termux에서:
```sh
llama-server -m ~/models/q3.gguf --host 0.0.0.0 --port 8080
```
`listening on`이 보이면, **S25의 와이파이를 끄고(모바일 데이터만)** 크롬에서:

```
http://(2번에서 메모한 노트20 Tailscale IP):8080
```
→ 채팅 화면이 뜨면 성공. "경조사비 관리 팁 3가지 알려줘"라고 물어보고
**답이 시작될 때까지 걸린 시간**과 **한국어 품질**(자연스러움/어색함)을 알려 주세요.

끝나면 Termux에서 `Ctrl + C`(키보드 위 CTRL 버튼 + c)로 종료.

## 7. S25 사진 자동 백업 시험 (Syncthing)

> 목표: S25에서 찍은 사진이 노트20 SD로 복사되고, **S25에서 지워도 노트20 사본은 남는지** 확인.

노트20 Termux에서:
```sh
pkg install -y syncthing
df -h /storage/ABCD-1234                 # SD 남은 용량 확인 → 알려 주세요
mkdir -p ~/storage/external-1/S25-backup # SD 안의 Termux 전용 폴더
syncthing --gui-address=0.0.0.0:8384
```
(`~/storage/external-1`이 없다는 오류가 나오면 그대로 캡처)

S25:
1. F-Droid(또는 Play 스토어)에서 **Syncthing-Fork** 설치 → 실행, 권한 허용.
2. S25 크롬에서 `http://(노트20 Tailscale IP):8384` 접속 → 노트20 Syncthing 관리 화면.
3. 두 기기를 서로 추가(기기 ID 교환) → S25의 `DCIM/Camera` 폴더 공유:
   - S25 쪽: **보내기 전용(Send Only)**, Wi-Fi에서만 동기화
   - 노트20 쪽: 저장 경로 `~/storage/external-1/S25-backup/Camera`, **받기 전용(Receive Only)**
   - 노트20 폴더 → 고급(Advanced) → **Ignore Delete 켜기**
4. **시험**: S25로 사진 2장 촬영 → 노트20에 생겼는지 확인 → S25에서 1장 삭제 → **노트20에 2장 그대로 있는지** 확인.

이 단계가 어려우면 노트20/S25 화면 캡처만 보내 주세요. 다음 단계에서 화면 순서대로 다시 정리해 드립니다.

## 8. (선택) 노트20 원격 조작 — 게임용 RustDesk

1. 두 폰에 **RustDesk** 설치 (Play 스토어 또는 GitHub).
2. 노트20: RustDesk 실행 → 화면 공유·입력 제어(접근성) 권한 허용 → 설정에서 **직접 IP 접속 허용**.
3. S25: 와이파이 끄고 RustDesk에서 `노트20 Tailscale IP`로 접속 → 노트20 화면이 보이고 터치가 되는지, **반응 지연 체감**을 알려 주세요.

## 9. (선택) 공용 와이파이 보호 — Tailscale 출구 노드

1. 노트20 Tailscale 앱 → **Run as exit node(출구 노드로 사용)** 켜기.
2. S25 Tailscale 앱 → Exit node → 노트20 선택 → S25 인터넷이 집을 거쳐 나감. (평소에는 꺼 두기)

---

## 알려 주실 것 (체크리스트)

- [ ] Tailscale 두 폰 연결 됨/안 됨
- [ ] SD 카드 이름, 사진 개수, 동영상 개수
- [ ] `llama-bench` 결과 2개 (캡처)
- [ ] S25 모바일 데이터로 접속 됨/안 됨, 첫 답변까지 시간, 한국어 품질
- [ ] 발열 정도
- [ ] SD 남은 용량, Syncthing 백업 됨/안 됨, **S25 삭제 후 노트20 사본 유지 여부**
- [ ] (선택) RustDesk 접속·지연 체감
