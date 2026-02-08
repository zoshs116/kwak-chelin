/**
 * 과기대 맛집 가이드 - 네트워크 강제 동기화 서비스 워커 (v7)
 */

const CACHE_NAME = 'campus-food-master-v7';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/script.js',
  './manifest.json'
];

// 설치 시 대기 없이 즉시 활성화
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 활성화 시 이전의 모든 망가진 캐시 강제 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Old cache deleted:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 네트워크 우선 전략 (인터넷 연결 시 무조건 최신 데이터)
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('supabase') || event.request.url.includes('kakao')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
