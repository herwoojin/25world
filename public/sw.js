// 25world 서비스 워커 — 네트워크 우선, 실패 시 캐시 폴백 (오프라인 지원)
// 버전을 올리면 activate 단계에서 이전 캐시(잘못 저장됐을 수 있는 항목 포함)를
// 모두 비우고 새로 시작한다.
const CACHE = "25world-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 빌드 해시가 붙은 정적 자산(_next/static/*)은 그대로 두고 브라우저/CDN
  // 캐시에 맡긴다. 여기서 가로채면, 그 요청이 실패했을 때 아래 catch 가
  // 엉뚱하게 캐시된 "/" 문서(HTML)로 대체 응답을 주게 되어 — 브라우저가
  // 그 HTML을 JS/CSS 로 해석하려다 로딩이 깨지는 원인이 될 수 있다.
  // (그 상태로 새로고침해야 정상화되는 증상과 일치)
  if (url.pathname.startsWith("/_next/static/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
