const CACHE = 'chor-doelau-v6';
const OFFLINE_FILES = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  // Nur eigene Domain aus dem Cache bedienen; Firebase/Identity/API immer direkt aus dem Netz.
  if (url.origin !== self.location.origin) return;

  const isDocument = req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html');
  if (isDocument) {
    // Die App-Seite selbst: IMMER zuerst das Netz versuchen (neue Funktionen sofort sichtbar, kein Warten
    // auf den nächsten Öffnen-Zyklus). Nur bei fehlender Verbindung auf den Cache zurückfallen (Offline).
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          caches.open(CACHE).then(cache => cache.put(req, res.clone()));
        }
        return res;
      }).catch(() => caches.open(CACHE).then(cache => cache.match(req)))
    );
    return;
  }

  // Alles andere (Icons, Manifest …): stale-while-revalidate — sofort aus dem Cache (schnell),
  // im Hintergrund frische Version nachladen. Ändert sich selten, daher unkritisch.
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});

// ===== PUSH-BENACHRICHTIGUNGEN =====
// Wird auch ausgelöst, wenn die App geschlossen ist.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Chor Dölau';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    image: data.image || undefined,
    data: { url: data.url || 'https://doelaudate.github.io' },
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,   // bleibt auf dem Bildschirm, bis man tippt (wie WhatsApp)
    renotify: true,
    tag: 'chor-' + Date.now(),  // jede Nachricht einzeln anzeigen
    silent: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tippen auf die Benachrichtigung öffnet die App
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || 'https://doelaudate.github.io';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url.indexOf('doelaudate') !== -1 && 'focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
