// Läuft ~10 Minuten und prüft die Warteschlange alle 15 Sekunden.
// Meldet sich als Bot-Konto an (für geschützte Datenbank-Regeln).
const webpush = require('web-push');

const DB = 'https://chor-doelau-default-rtdb.europe-west1.firebasedatabase.app';
const API_KEY = 'AIzaSyDtiIn1UzexFOmjBgr12SAerbjw_n8_pLo';
const VAPID_PUBLIC = 'BOGiRzAjSW8eEWF8Q_vy_XXcq09OdlWs02cmpWMxIQLqF4WB0f7GwAd1Y-9f5JTNKcvcaZ4HE_GgruGV9vei7Jc';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const BOT_EMAIL = process.env.PUSH_BOT_EMAIL;
const BOT_PW = process.env.PUSH_BOT_PW;
if (!VAPID_PRIVATE) { console.error('VAPID_PRIVATE fehlt'); process.exit(1); }
webpush.setVapidDetails('mailto:Doelaudate@martinwolff-tenor.de', VAPID_PUBLIC, VAPID_PRIVATE);

let AUTH = ''; // ?auth=<idToken> für DB-Zugriffe

async function botLogin(){
  if (!BOT_EMAIL || !BOT_PW) { console.log('Kein Bot-Login (Secrets fehlen) – versuche ohne Auth.'); AUTH=''; return; }
  try{
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email:BOT_EMAIL, password:BOT_PW, returnSecureToken:true })
    });
    if(r.ok){ const d=await r.json(); AUTH='?auth='+d.idToken; console.log('Bot angemeldet.'); }
    else { console.log('Bot-Login fehlgeschlagen:', r.status); AUTH=''; }
  }catch(e){ console.log('Bot-Login-Fehler:', e.message); AUTH=''; }
}

async function jget(path){ const r=await fetch(DB+path+'.json'+AUTH); return r.ok?await r.json():null; }
async function jdel(path){ await fetch(DB+path+'.json'+AUTH, { method:'DELETE' }); }

async function sendOnce(){
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
  await botLogin();
  const endAt = Date.now() + 10 * 60 * 1000;
  console.log('Sender gestartet, läuft ~10 Min …');
  let n=0;
  while (Date.now() < endAt) {
    try { await sendOnce(); } catch (e) { console.error('Fehler:', e.message); }
    n++;
    if(n % 30 === 0) await botLogin(); // Token gelegentlich erneuern
    await new Promise(r => setTimeout(r, 15000));
  }
  console.log('Lauf beendet.');
})();
