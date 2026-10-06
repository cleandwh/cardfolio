# 카드폴리오

보유 카드의 혜택(적립·할인)과 실적 인정 여부를 결제 전에 바로 조회하는 개인용 도구.

- 실행: https://cleandwh.github.io/cardfolio/
- 코드: `index.html` 한 파일 (CSS·JS·규칙 DB 포함)
- 운영 문서: `HANDOFF.md` — 카드 규칙, 설계 원칙, AI에게 카드 추가 시킬 때 요청 가이드

## 수정 방법
1. `index.html` 열기 → 연필(Edit) → 전체 내용을 새 코드로 교체 → Commit changes
2. 1~2분 후 위 주소 새로고침

수정 대상은 `<script>` 안의 `CATS`(가맹점 사전) · `CARDS`(카드 규칙) · `EVENTS`(이벤트) 세 배열. 나머지 코드는 건드리지 않음.
