const CACHE_NAME = 'technoidfix-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/contact.html',
  '/design.html',
  '/projects.html',
  '/web.html',
  '/assets/css/styles.css',
  '/assets/js/app.js',
  '/assets/favicon.jpeg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/repair.jpeg',
  '/assets/web.jpeg',
  '/assets/images.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
