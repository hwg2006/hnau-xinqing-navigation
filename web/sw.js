// ============================================================
// 华农心晴导航 - Service Worker (PWA)
// 职责：提供基础离线缓存，让 Web 版可"添加到桌面"当独立应用
// 说明：修改前端文件后需同步升 CACHE_NAME，否则用户会读到旧缓存
// ============================================================
const CACHE_NAME = 'xinqiang-nav-v3';
const PRECACHE_URLS = [
  './',
  './index.html',
  './config.js',
  './api.js',
  './app.js',
  './manifest.json',
];

// 安装时预缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 请求拦截: 缓存优先 + 网络回退
self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  // 跳过 API 请求（不缓存动态数据）
  if (event.request.url.includes('/v1/') || event.request.url.includes('localhost:11434')) return;

  // config.js 网络优先：改了 API 地址后刷新即生效，避免读到旧缓存
  if (event.request.url.includes('config.js')) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((resp) => {
          // 成功则更新缓存
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => cached); // 网络失败则返回缓存
      return cached || networkFetch;
    })
  );
});
