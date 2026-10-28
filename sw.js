// Service Worker: يخزّن ملفات التطبيق مؤقتًا ليعمل بدون إنترنت.
// لا يتعامل مع البيانات المالية إطلاقًا: البيانات في IndexedDB ولا تمر عبر الشبكة.
const VERSION = '1.0.0-0f1f19d5';
const CACHE = `fulusi-${VERSION}`;
const ASSETS = [
  "./",
  "./css/app.css",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./index.html",
  "./js/app.js",
  "./js/calc.js",
  "./js/db.js",
  "./js/demo.js",
  "./js/version.js",
  "./manifest.webmanifest"
]; // تُحقن أثناء البناء

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
  );
  // لا نفعّل الإصدار الجديد تلقائيًا أثناء استخدام التطبيق؛ الواجهة تعرض زر «تحديث».
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('fulusi-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // التطبيق لا يطلب أي مورد خارجي
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
