const CACHE = 'chor-doelau-v3';
const OFFLINE_FILES = ['/', '/index.html'];

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
  // Network first, fall back to cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
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
