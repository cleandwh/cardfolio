'use strict';
/* 라이프 기록 — 서비스 워커: 앱 파일을 폰에 저장해 두고 오프라인에서도 열리게 한다.
   저장 대상은 앱 파일(HTML/JS/아이콘)뿐이고 개인 기록(IndexedDB)은 건드리지 않는다.
   방식: 저장본을 먼저 보여주고 뒤에서 새 파일을 받아 다음 실행부터 반영(stale-while-revalidate).
   앱 파일을 크게 바꿔 배포할 때는 아래 CACHE 숫자를 올린다. */
const CACHE = 'life-v1';
const SHELL = ['./', 'index.html', 'core.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('life-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const hit = await cache.match(key, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok && res.type === 'basic') cache.put(key, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('오프라인이에요. 인터넷에 연결한 뒤 한 번 열어 주세요.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
