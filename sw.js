/*
 * Service worker SIPMUR EDU (GitHub Pages)
 * - Menyimpan kerangka aplikasi (HTML, CSS, JS, ikon) agar cepat dibuka.
 * - Permintaan ke Google Apps Script (data) TIDAK pernah disimpan: selalu langsung ke server.
 * - Strategi "jaringan dulu" untuk HTML/CSS/JS: setiap git push langsung terbawa ke HP pengguna.
 * - Menerima notifikasi kehadiran untuk orang tua (Firebase Cloud Messaging / Web Push) dan menampilkannya.
 * Naikkan VERSI bila mengganti ikon atau ingin memaksa semua HP mengambil ulang.
 */
const VERSI = 'sipmur-edu-v2.2.0';
const KERANGKA = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/firebase-config.js',
  './js/app.js',
  './js/ortu.js',
  './manifest.json',
  './icons/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSI).then(c => c.addAll(KERANGKA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSI).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API GAS, font, CDN: lewat apa adanya

  if (/\.(png|ico|svg|webp)$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }
  // HTML, CSS, JS, manifest: jaringan dulu, simpanan bila offline
  event.respondWith(
    fetch(req)
      .then(res => { if (res.ok) { const salin = res.clone(); caches.open(VERSI).then(c => c.put(req, salin)); } return res; })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});

/* ── Notifikasi kehadiran (Firebase Cloud Messaging / Web Push) ──
   Isi pesan FCM: { notification: {title, body}, data: {url, tag, nisn} }.
   iPhone mewajibkan setiap push menampilkan notifikasi, jadi notifikasi SELALU ditampilkan. */
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { notification: { body: event.data ? event.data.text() : '' } }; }
  const n = d.notification || d, x = d.data || {};
  const judul = n.title || x.title || 'SIPMUR EDU';
  event.waitUntil(Promise.all([
    self.registration.showNotification(judul, {
      body: n.body || x.body || 'Ada informasi kehadiran baru.',
      icon: 'icons/icon-192.png',
      badge: 'icons/favicon.png',
      tag: x.tag || n.tag || undefined,
      renotify: !!(x.tag || n.tag),
      data: { url: x.url || n.click_action || './?ortu=1' }
    }),
    // Portal yang sedang terbuka langsung memuat ulang status anak
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => list.forEach(c => c.postMessage({ tipe: 'notif' })))
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const tujuan = new URL((event.notification.data && event.notification.data.url) || './?ortu=1', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.postMessage({ tipe: 'notif' }); return c.focus(); }
      }
      return self.clients.openWindow(tujuan);
    })
  );
});
