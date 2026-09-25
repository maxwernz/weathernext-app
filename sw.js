// App-shell service worker: network first (so updates land immediately),
// falling back to the cache when offline. API calls are never cached here.

const CACHE = 'skycast-v3';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/auth.js',
  'js/chart.js',
  'js/config.js',
  'js/dayview.js',
  'js/metricchart.js',
  'js/format.js',
  'js/geo.js',
  'js/icons.js',
  'js/store.js',
  'js/weather.js',
  'js/providers/openmeteo.js',
  'js/providers/weathernext.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const cdn = url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (e.request.method !== 'GET' || !(sameOrigin || cdn)) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
