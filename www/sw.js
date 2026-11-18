// Kijkdoos service worker: app-shell offline, streams altijd via netwerk.
const V = 'kijkdoos-v28';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'vendor/hls.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
// In de Android/Electron-app zit alles al in de app: een service worker is daar alleen een bron van oude versies
const IN_APP = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.port === '';
if (IN_APP) {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => self.registration.unregister()).then(() => self.clients.matchAll()).then(cs => cs.forEach(c => c.navigate(c.url)))));
} else {
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // netwerk eerst (altijd nieuwste versie), cache als je offline bent
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});
}
