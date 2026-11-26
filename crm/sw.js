// Keuerleber CRM – App-Dateien fürs Öffnen ohne Netz (Handy im Funkloch, Zug, Keller).
// Immer zuerst frisch aus dem Netz; nur wenn kein Netz da ist (oder es länger als 4 s hängt), die zuletzt geladene Fassung.
// Daten (Supabase), Telegram usw. werden nie angefasst – die laufen über den Gerätespeicher der App.
const CACHE = 'kre-crm-app-v30';
const START = ['./', './index.html', './style.css', './css/social.css', './css/haptik.css', './css/fahrten.css', './css/politur.css', './css/anfragen.css', './css/dashboard.css', './css/expose.css', './css/unterlagen.css', './css/posteingang.css', './css/kundenlinks.css', './css/angebote.css', './css/kalender.css', './css/vorlagen.css', './css/assistent.css', './manifest.webmanifest', './vendor/supabase.js?v=2.45.4'];
const eigen = u => { try { return new URL(u, self.location.href).origin === self.location.origin; } catch { return false; } };

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(START)).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
// Die App meldet nach dem Start, welche Dateien sie geladen hat (alle Module) → beim nächsten Öffnen ohne Netz vollständig
self.addEventListener('message', e => {
  const urls = (e.data?.cache || []).filter(eigen).slice(0, 200);
  if (urls.length) e.waitUntil(caches.open(CACHE).then(c => Promise.all(urls.map(u => c.match(u).then(hit => hit || c.add(u)).catch(() => {})))));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || !eigen(r.url)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const alt = await c.match(r) || (r.mode === 'navigate' ? (await c.match('./index.html')) || (await c.match('./')) : null);
    const netz = fetch(r).then(res => { if (res.ok && res.type === 'basic') c.put(r, res.clone()).catch(() => {}); return res; });
    if (!alt) return netz;
    // Mit gespeicherter Fassung als Rückfall: Netz bevorzugen, bei Ausfall oder Hängen die gespeicherte nehmen
    e.waitUntil(netz.catch(() => {}));
    return Promise.race([netz.catch(() => alt), new Promise(res => setTimeout(() => res(alt), 4000))]);
  })());
});
