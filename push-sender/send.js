// Versendet Web-Push-Nachrichten aus der Firebase-Warteschlange.
// Läuft als GitHub Action (alle paar Minuten).
const webpush = require('web-push');

const DB = 'https://chor-doelau-default-rtdb.europe-west1.firebasedatabase.app';
const VAPID_PUBLIC = 'BOGiRzAjSW8eEWF8Q_vy_XXcq09OdlWs02cmpWMxIQLqF4WB0f7GwAd1Y-9f5JTNKcvcaZ4HE_GgruGV9vei7Jc';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;

if (!VAPID_PRIVATE) { console.error('VAPID_PRIVATE fehlt'); process.exit(1); }
webpush.setVapidDetails('mailto:Doelaudate@martinwolff-tenor.de', VAPID_PUBLIC, VAPID_PRIVATE);

async function jget(path) {
  const r = await fetch(DB + path + '.json');
  if (!r.ok) return null;
  return await r.json();
}
async function jdel(path) {
  await fetch(DB + path + '.json', { method: 'DELETE' });
}

async function main() {
  const queue = await jget('/pushqueue');
  if (!queue) { console.log('Warteschlange leer.'); return; }
  const subs = (await jget('/pushsubs')) || {};
  const subList = Object.entries(subs);
  console.log('Nachrichten:', Object.keys(queue).length, '| Geräte:', subList.length);

  for (const [qkey, item] of Object.entries(queue)) {
    const payload = JSON.stringify({
      title: (item && item.title) || 'Chor Dölau',
      body: (item && item.body) || '',
      icon: 'https://doelaudate.github.io/icon-192.png',
      badge: 'https://doelaudate.github.io/icon-192.png',
      url: 'https://doelaudate.github.io'
    });
    let sent = 0;
    for (const [skey, sval] of subList) {
      const sub = sval && sval.sub ? sval.sub : sval;
      if (!sub || !sub.endpoint) continue;
      try {
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await jdel('/pushsubs/' + skey);
        } else {
          console.warn('Fehler bei Gerät:', err.statusCode);
        }
      }
    }
    await jdel('/pushqueue/' + qkey);
    console.log('Gesendet:', item.title, '→', sent, 'Geräte');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
