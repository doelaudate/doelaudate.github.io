// Läuft ~10 Minuten, prüft die Warteschlange alle 15 Sekunden.
// Meldet sich als Bot an (geschützte DB). Sendet Absagen nur an Admins und verschickt Erinnerungen.
const webpush = require('web-push');

const DB = 'https://chor-doelau-default-rtdb.europe-west1.firebasedatabase.app';
const API_KEY = 'AIzaSyDtiIn1UzexFOmjBgr12SAerbjw_n8_pLo';
const VAPID_PUBLIC = 'BOGiRzAjSW8eEWF8Q_vy_XXcq09OdlWs02cmpWMxIQLqF4WB0f7GwAd1Y-9f5JTNKcvcaZ4HE_GgruGV9vei7Jc';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const BOT_EMAIL = process.env.PUSH_BOT_EMAIL;
const BOT_PW = process.env.PUSH_BOT_PW;
if (!VAPID_PRIVATE) { console.error('VAPID_PRIVATE fehlt'); process.exit(1); }
webpush.setVapidDetails('mailto:Doelaudate@martinwolff-tenor.de', VAPID_PUBLIC, VAPID_PRIVATE);

let AUTH = '';
let adminUids = new Set();

async function botLogin(){
  if (!BOT_EMAIL || !BOT_PW) { AUTH=''; return; }
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
async function jput(path,val){ await fetch(DB+path+'.json'+AUTH,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(val)}); }
async function jdel(path){ await fetch(DB+path+'.json'+AUTH,{method:'DELETE'}); }

async function loadAdmins(){
  const profs = (await jget('/userprofiles')) || {};
  adminUids = new Set(Object.entries(profs).filter(([,p])=>p && p.isAdmin).map(([uid])=>uid));
}
function payload(title, body){
  return JSON.stringify({ title:title||'Chor Dölau', body:body||'',
    icon:'https://doelaudate.github.io/icon-192.png', badge:'https://doelaudate.github.io/icon-192.png',
    url:'https://doelaudate.github.io' });
}
async function sendToSubs(subList, pl){
  let sent=0;
  for (const [skey, sval] of subList){
    const sub = sval && sval.sub ? sval.sub : sval;
    if (!sub || !sub.endpoint) continue;
    try { await webpush.sendNotification(sub, pl); sent++; }
    catch (err){ if (err.statusCode===404 || err.statusCode===410) await jdel('/pushsubs/'+skey); }
  }
  return sent;
}

async function sendOnce(){
  const queue = await jget('/pushqueue');
  if (!queue) return;
  const subs = (await jget('/pushsubs')) || {};
  const allSubs = Object.entries(subs);
  for (const [qkey, item] of Object.entries(queue)){
    let target = allSubs;
    if (item && item.adminsOnly) target = allSubs.filter(([uid])=>adminUids.has(uid));
    const sent = await sendToSubs(target, payload(item&&item.title, item&&item.body));
    await jdel('/pushqueue/' + qkey);
    console.log(new Date().toISOString(), 'Gesendet:', item&&item.title, '→', sent, item&&item.adminsOnly?'(nur Chorleitung)':'Geräte');
  }
}

function dateInDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fmtDE(iso){ if(!iso) return ''; const p=iso.split('-'); return p[2]+'.'+p[1]+'.'+p[0]; }

async function sendReminders(){
  const settings = (await jget('/settings/push')) || {};
  const days = parseInt(settings.remindDays) || 0;
  if (!days) return;
  const target = dateInDays(days);
  const subs = (await jget('/pushsubs')) || {};
  const allSubs = Object.entries(subs);
  if (!allSubs.length) return;
  const sent = (await jget('/reminders-sent')) || {};
  const wann = days===1 ? 'morgen' : 'in '+days+' Tagen';
  const events = [];
  const termine = await jget('/termine');
  if (Array.isArray(termine)) termine.forEach(t=>{ if(t && t.datum===target) events.push({ id:'t-'+t.id, title:'🔔 Erinnerung: '+(t.titel||'Termin'), body:wann+' ('+fmtDE(target)+')'+(t.uhrzeit?' um '+t.uhrzeit+' Uhr':'') }); });
  const plan = await jget('/probenplan');
  if (Array.isArray(plan)) plan.forEach(p=>{ if(p && p.datum===target) events.push({ id:'p-'+p.id, title:'🔔 Erinnerung: Probe', body:wann+' ('+fmtDE(target)+')' }); });
  for (const ev of events){
    if (sent[ev.id]) continue;
    await sendToSubs(allSubs, payload(ev.title, ev.body));
    await jput('/reminders-sent/'+ev.id, Date.now());
    console.log('Erinnerung gesendet:', ev.title);
  }
}

(async () => {
  await botLogin();
  await loadAdmins();
  console.log('Sender gestartet, läuft ~10 Min …');
  try { await sendReminders(); } catch (e) { console.error('Reminder-Fehler:', e.message); }
  const endAt = Date.now() + 10 * 60 * 1000;
  let n = 0;
  while (Date.now() < endAt) {
    try { await sendOnce(); } catch (e) { console.error('Fehler:', e.message); }
    n++;
    if (n % 30 === 0) { await botLogin(); await loadAdmins(); }
    await new Promise(r => setTimeout(r, 15000));
  }
  console.log('Lauf beendet.');
})();
