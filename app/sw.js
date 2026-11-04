/* 此刻 · Service Worker
   策略：网络优先、离线回退缓存。这样开发时改了文件刷新就能看到；
   断网或装到主屏后照样能打开。 */

const CACHE = 'cike-v40';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/motion.js',
  './js/native.js',
  './js/i18n.js',
  './js/db.js',
  './js/store.js',
  './js/format.js',
  './js/ui.js',
  './js/editors.js',
  './js/views/now.js',
  './js/views/records.js',
  './js/views/stats.js',
  './js/views/me.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    // 网络优先，但最多等 3 秒：局域网抽风或者断网时，别让白屏一直挂着
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(req, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      // Service Worker 不知道界面语言，所以这句直接给中英双行
      return new Response('离线了，而且这份内容还没缓存。\nYou are offline and this resource was not cached yet.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
