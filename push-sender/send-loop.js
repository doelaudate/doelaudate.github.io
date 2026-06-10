// Läuft ~10 Minuten und prüft die Warteschlange alle 15 Sekunden.
// Durch überlappende Jobs (siehe Workflow) ergibt sich nahezu durchgehende Zustellung.
const webpush = require('web-push');

const DB = 'https://chor-doelau-default-rtdb.europe-west1.firebasedatabase.app';
const VAPID_PUBLIC = 'BOGiRzAjSW8eEWF8Q_vy_XXcq09OdlWs02cmpWMxIQLqF4WB0f7GwAd1Y-9f5JTNKcvcaZ4HE_GgruGV9vei7Jc';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
if (!VAPID_PRIVATE) { console.error('VAPID_PRIVATE fehlt'); process.exit(1); }
webpush.setVapidDetails('mailto:Doelaudate@martinwolff-tenor.de', VAPID_PUBLIC, VAPID_PRIVATE);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function jget(p) { const r = await fetch(DB + p + '.json'); return r.ok ? await r.json() : null; }
async function jdel(p) { await fetch(DB + p + '.json', { method: 'DELETE' }); }

async function sendOnce() {
  const queue = await jget('/pushqueue');
  if (!queue) return 0;
  const subs = (await jget('/pushsubs')) || {};
  const subList = Object.entries(subs);
  let n = 0;
  for (const [qkey, item] of Object.entries(queue)) {
    const payload = JSON.stringify({
      title: (item && item.title) || 'Chor Dölau',
      body: (item && item.body) || '',
      icon: 'https://doelaudate.github.io/icon-192.png',
      badge: 'https://doelaudate.github.io/icon-192.png',
      url: 'https://doelaudate.github.io'
    });
    for (const [skey, sval] of subList) {
      const sub = sval && sval.sub ? sval.sub : sval;
      if (!sub || !sub.endpoint) continue;
      try { await webpush.sendNotification(sub, payload); }
      catch (err) { if (err.statusCode === 404 || err.statusCode === 410) await jdel('/pushsubs/' + skey); }
    }
    await jdel('/pushqueue/' + qkey);
    n++;
    console.log(new Date().toISOString(), 'Gesendet:', item.title, '→', subList.length, 'Geräte');
  }
  return n;
}

(async () => {
  const endAt = Date.now() + 10 * 60 * 1000; // ~10 Minuten
  console.log('Sender gestartet, läuft ~10 Min …');
  while (Date.now() < endAt) {
    try { await sendOnce(); } catch (e) { console.error('Fehler:', e.message); }
    await sleep(15000);
  }
  console.log('Lauf beendet.');
})();
