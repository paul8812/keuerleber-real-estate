// Vermietung: Mietobjekte aus dem Bestand. Pro Objekt ein gemeinsamer Live-Chat zwischen Vermieter und Vermittler,
// dazu Besichtigungen (mit Absagegründen), Anzeigen-Links, Mietdaten mit Unterlagen und der Vermietungsstand.
// Alles Inhaltliche ist Ende-zu-Ende verschlüsselt; der Speicherdienst sieht nur Zufallskennungen und Chiffretext.
import { openObjekte, openSlot } from './pkg.js';
import { neuester, verOf } from './quelle.js';
import { fetchEvents, getFile, postEvent, putFile } from '../handwerker/store.js';
import { ago, dlg, dt, dtm, esc, logo, lsGet, lsSet, shrinkImage, themaWechseln, toast } from '../handwerker/ui.js';

const app = document.getElementById('app');
const SESSION = 'nf-vm-session';
export const ctx = { pkg: null, sess: null, obj: [], ev: [], last: 0, view: 'start', oid: null, filter: 'alle', loading: false, err: '', admin: null, seg: 'objekt' };

document.addEventListener('click', (e) => { if (e.target.closest('.thema')) themaWechseln(); });

/* ---------- Begriffe ---------- */
export const STATUS = {
  vorbereitung: { l: 'In Vorbereitung', c: 'var(--schiefer)' },
  vermarktung: { l: 'In Vermarktung', c: 'var(--gold)' },
  reserviert: { l: 'Reserviert', c: 'var(--warn)' },
  vermietet: { l: 'Vermietet', c: 'var(--gut)' },
};
export const ERG = {
  geplant: { l: 'Geplant', c: 'var(--schiefer)' },
  interesse: { l: 'Interesse', c: 'var(--gold)' },
  zusage: { l: 'Zusage', c: 'var(--gut)' },
  absage: { l: 'Absage', c: 'var(--krit)' },
  nicht: { l: 'Nicht erschienen', c: 'var(--muted)' },
};
export const GRUENDE = ['Miete zu hoch', 'Lage / Umgebung', 'Größe / Grundriss', 'Zustand / Ausstattung', 'Kein Balkon / Stellplatz', 'Etage / kein Aufzug', 'Anderes Objekt gefunden', 'Bonität / Unterlagen nicht ausreichend', 'Haustiere / Personenzahl', 'Sonstiges'];
export const ROLLEN = ['Vermieter', 'Vermittler', 'Hausverwaltung', 'Mitarbeiter'];
const PORTALE = [[/immobilienscout24|is24/, 'ImmoScout24'], [/immowelt/, 'Immowelt'], [/immonet/, 'Immonet'], [/kleinanzeigen|ebay/, 'Kleinanzeigen'], [/wg-gesucht/, 'WG-Gesucht'], [/facebook|fb\.com/, 'Facebook'], [/instagram/, 'Instagram'], [/keuerleber|norderfranken/, 'Eigene Webseite']];
export const portalOf = (url) => { let h = ''; try { h = new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Link'; } return PORTALE.find(([re]) => re.test(h))?.[1] ?? h; };
export const eur = (n) => (n == null || n === '' || !Number.isFinite(Number(n)) ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(Number(n)));
export const num = (n, d = 0) => (Number.isFinite(Number(n)) ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: d }).format(Number(n)) : '–');
const tag = (t) => new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const uhr = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const sicherUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };

/* ---------- Daten ---------- */
export const isAdmin = () => ctx.sess?.r === 'admin';
export const tidOf = (oid) => Object.entries(ctx.sess.threads).find(([, t]) => t.oid === oid && t.on)?.[0];
export const evOf = (tid) => (tid ? ctx.ev.filter((e) => e.tid === tid) : []);
export const objOf = (oid) => ctx.obj.find((o) => o.id === oid);
const mine = (e) => e.von === ctx.sess.id;
const seenKey = () => 'nf-vm-seen-' + ctx.sess.id;
export const unread = (tid) => { const s = lsGet(seenKey()) ?? {}; return evOf(tid).filter((e) => !mine(e) && e.rid > (s[tid] ?? 0)).length; };
function markSeen(tid) { const s = lsGet(seenKey()) ?? {}, l = evOf(tid).at(-1); if (l && (s[tid] ?? 0) < l.rid) { s[tid] = l.rid; lsSet(seenKey(), s); } }

/** Abgeleiteter Stand eines Objekts aus seinem Verlauf. */
export function stand(oid) {
  const ev = evOf(tidOf(oid)), jetzt = Date.now();
  const st = ev.filter((e) => e.typ === 'status' && STATUS[e.status]).at(-1)?.status ?? objOf(oid)?.status0 ?? 'vermarktung';
  const upd = new Map(); for (const e of ev) if (e.typ === 'ergebnis') upd.set(e.ref, e);
  const bes = ev.filter((e) => e.typ === 'besichtigung').map((b) => { const u = upd.get(b.id); return u ? { ...b, ergebnis: u.ergebnis, grund: u.grund, notiz2: u.text, von2: u.n } : b; }).sort((a, b) => a.datum - b.datum);
  const weg = new Set(ev.filter((e) => e.typ === 'anzeige_weg').map((e) => e.ref));
  const anz = ev.filter((e) => e.typ === 'anzeige' && !weg.has(e.id));
  const md = ev.filter((e) => e.typ === 'mietdaten').at(-1);
  const gemacht = bes.filter((b) => b.datum <= jetzt || b.ergebnis !== 'geplant');
  const absagen = gemacht.filter((b) => b.ergebnis === 'absage');
  const gruende = {}; for (const b of absagen) gruende[b.grund || 'Ohne Angabe'] = (gruende[b.grund || 'Ohne Angabe'] ?? 0) + 1;
  return {
    ev, st, bes, anz, md, gemacht, absagen, gruende,
    naechste: bes.find((b) => b.datum > jetzt && b.ergebnis === 'geplant'),
    offen: bes.filter((b) => b.datum <= jetzt && b.ergebnis === 'geplant'), // Termin vorbei, Ergebnis fehlt
    interessenten: gemacht.reduce((a, b) => a + (Number(b.anzahl) || 0), 0),
    zusagen: gemacht.filter((b) => b.ergebnis === 'zusage').length,
  };
}

export async function load(quiet = false) {
  if (!ctx.sess?.sb) { ctx.err = 'Der Speicherdienst ist noch nicht eingerichtet (Verwaltung → Einstellungen).'; return 0; }
  while (ctx.loading) await new Promise((r) => setTimeout(r, 60));
  ctx.loading = true; if (!quiet) ctx.err = '';
  try {
    const threads = Object.fromEntries(Object.entries(ctx.sess.threads));
    const neu = await fetchEvents(ctx.sess.sb, threads, ctx.last);
    if (neu.length) { ctx.ev = ctx.ev.concat(neu); ctx.last = ctx.ev.at(-1).rid; }
    ctx.err = ''; ctx.at = Date.now();
    return neu.length;
  } catch (e) { ctx.err = netMsg(e); return 0; } finally { ctx.loading = false; }
}
const netMsg = (e) => (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(e?.message || '') ? 'Keine Verbindung zum Speicherdienst. Bitte Internet prüfen – es wird automatisch erneut versucht.' : /nicht eingerichtet/.test(e?.message || '') ? 'Der Speicherdienst ist noch nicht vollständig eingerichtet (Verwaltung → Einstellungen → Einrichtungs-Skript).' : (e?.message || String(e)));

/** Eintrag im Verlauf eines Objekts speichern (verschlüsselt). */
export async function send(oid, ev) {
  if (!ctx.sess?.sb) throw new Error('Der Speicherdienst ist noch nicht eingerichtet (Verwaltung → Einstellungen).');
  const tid = tidOf(oid); if (!tid) throw new Error('Für dieses Objekt gibt es noch keinen Verlauf – bitte in der Verwaltung einmal veröffentlichen.');
  const t = ctx.sess.threads[tid];
  try { await postEvent(ctx.sess.sb, tid, t.k, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), t: Date.now(), von: ctx.sess.id, n: ctx.sess.n, rolle: ctx.sess.rolle || '', ...ev }); }
  catch (e) { throw new Error(netMsg(e)); }
  await load(true);
}

/** Dateien (Fotos, PDFs) verschlüsselt hochladen. Fotos werden verkleinert. */
const TYPEN = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf' };
async function upload(oid, files) {
  const tid = tidOf(oid), t = ctx.sess.threads[tid], out = [];
  if (files.length > 10) throw new Error('Bitte höchstens 10 Dateien auf einmal.');
  for (const f of files) {
    const ext = f.name.split('.').pop().toLowerCase(), type = TYPEN[ext] || f.type || 'application/octet-stream', bild = type.startsWith('image/');
    if (!bild && f.size > 12 * 1024 * 1024) throw new Error(`„${f.name}“ ist größer als 12 MB.`);
    const bytes = bild ? await shrinkImage(f, 2000) : new Uint8Array(await f.arrayBuffer());
    out.push({ p: await putFile(ctx.sess.sb, tid, t.k, bytes), n: f.name, t: bild ? 'image/jpeg' : type });
  }
  return out;
}

/* ---------- Anmeldung ---------- */
async function enter(payload, code, id) {
  ctx.sess = { ...payload, code, id };
  ctx.obj = await openObjekte(payload, ctx.pkg);
  ctx.ev = []; ctx.last = 0;
  try { sessionStorage.setItem(SESSION, JSON.stringify(ctx.sess)); } catch { /* egal */ }
  if (location.hash) history.replaceState(null, '', location.pathname);
  ctx.view = 'start'; render(); await load(); render();
}
function logout() {
  try { sessionStorage.removeItem(SESSION); } catch { /* egal */ }
  ctx.sess = null; ctx.ev = []; ctx.admin = null;
  history.replaceState(null, '', location.pathname); showLogin();
}
export function relogin(sess, obj) { ctx.sess = sess; ctx.obj = obj; try { sessionStorage.setItem(SESSION, JSON.stringify(sess)); } catch { /* egal */ } }

function showLogin(msg = '', busy = false) {
  app.innerHTML = `<main class="lg"><div class="lg-card">${logo('lg-logo')}
    <span class="eyebrow">Vermietung</span><h1>Mietobjekte</h1>
    <p class="lg-sub">Vertraulicher Bereich für Vermieter und Vermittler. Bitte Passwort eingeben.</p>
    <form class="lg-form" id="loginForm" autocomplete="off"><label for="pw">Passwort</label>
      <input id="pw" type="password" autocomplete="current-password" required maxlength="200" ${busy ? 'disabled' : ''}>
      ${msg ? `<p class="lg-err" role="alert">${esc(msg)}</p>` : ''}
      <button class="btn fill" ${busy ? 'disabled' : ''}>${busy ? 'Prüfe …' : 'Anmelden'}</button></form></div></main>`;
  document.getElementById('pw').focus();
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    let code = document.getElementById('pw').value.trim(), only = null;
    const dot = code.indexOf('.');
    if (dot > 0 && ctx.pkg.slots.some((s) => s.id === code.slice(0, dot))) { only = code.slice(0, dot); code = code.slice(dot + 1); }
    showLogin('', true);
    const todo = ctx.pkg.slots.filter((s) => !only || s.id === only); let n = 0;
    for (const slot of todo) {
      const b = document.querySelector('.lg-form .btn'); if (b) b.textContent = todo.length > 1 ? `Prüfe … ${++n}/${todo.length}` : 'Prüfe …';
      await new Promise((r) => setTimeout(r, 30));
      const payload = await openSlot(code, slot, ctx.pkg.iter);
      if (payload) return enter(payload, code, slot.id);
    }
    showLogin('Passwort nicht korrekt.');
  });
}

/* ---------- Kopf ---------- */
export function header(sub = 'Mietobjekte') {
  const hell = document.documentElement.getAttribute('data-theme') === 'light';
  return `<header class="p-kopf"><div class="wrap p-in"><div class="brand">${logo('top-logo')}<div><h1>Vermietung</h1><small><b></b>${esc(sub)}</small></div></div>
    <div class="top-r"><span class="top-user">${esc(ctx.sess.n)}${ctx.sess.rolle ? ` <em class="rolle">${esc(ctx.sess.rolle)}</em>` : ''}</span>
    ${ctx.view !== 'admin' ? '<button class="btn dark sm" id="toAdmin">Verwaltung</button>' : '<button class="btn dark sm" id="toStart">Zur Übersicht</button>'}
    <button class="btn dark sm" id="logout">Abmelden</button>
    <button class="thema" type="button" role="switch" aria-checked="${hell}" aria-label="Helle Darstellung"></button></div></div></header>`;
}
const wire = () => {
  document.getElementById('logout')?.addEventListener('click', logout);
  document.getElementById('toAdmin')?.addEventListener('click', () => go('admin'));
  document.getElementById('toStart')?.addEventListener('click', () => go('start'));
};

/* ---------- Ansichten ---------- */
export function render() {
  app.onclick = null; // Verwaltung setzt eigene Klickbehandlung
  if (!ctx.sess) return showLogin();
  titelZahl();
  if (ctx.view === 'admin') return import('./admin.js').then((m) => m.adminRender());
  if (ctx.view === 'objekt' && objOf(ctx.oid) && tidOf(ctx.oid)) return renderObjekt();
  ctx.view = 'start'; renderStart();
}
export const go = (view, oid = null) => { ctx.view = view; ctx.oid = oid; if (view !== 'objekt') ctx.seg = 'objekt'; render(); window.scrollTo(0, 0); };
function titelZahl() { const n = ctx.sess ? ctx.obj.reduce((a, o) => a + unread(tidOf(o.id)), 0) : 0; document.title = `${n ? `(${n}) ` : ''}Vermietung | Norderfranken Haus & Grund`; }

const stPill = (st) => `<span class="vm-st" style="--c:${STATUS[st]?.c}"><i></i>${esc(STATUS[st]?.l ?? st)}</span>`;
const bild = (o, cls = '') => (o.bild ? `<img src="${esc(o.bild)}" alt="${esc(o.titel)}" class="${cls}" loading="lazy">` : `<div class="vm-ph ${cls}" aria-hidden="true">${esc((o.titel || '?').slice(0, 1))}</div>`);
const warm = (o) => (Number(o.kaltmiete) || 0) + (Number(o.nk) || 0);
const meta = (o) => [o.ort, o.zimmer ? `${num(o.zimmer, 1)} Zi.` : '', o.flaeche ? `${num(o.flaeche, 1)} m²` : '', o.frei ? `frei ab ${dt(Date.parse(o.frei))}` : ''].filter(Boolean).join(' · ');

function karte(o) {
  const s = stand(o.id), tid = tidOf(o.id), u = unread(tid), l = s.ev.filter((e) => e.typ === 'chat').at(-1);
  return `<article class="card vm-card" data-oid="${esc(o.id)}" tabindex="0" role="link" aria-label="${esc(o.titel)} öffnen">
    <div class="photo">${bild(o)}${stPill(s.st)}${u ? `<span class="neu">${u} neu</span>` : ''}</div>
    <div class="body">
      <div class="head"><h2>${esc(o.titel)}${o.lage ? ` <span>· ${esc(o.lage)}</span>` : ''}</h2><span class="meta">${esc(meta(o))}</span></div>
      <div class="kpis">
        <div class="price"><small>Kaltmiete</small><b>${eur(o.kaltmiete)}</b></div>
        <div><small>Warmmiete</small><b>${o.nk != null && o.nk !== '' ? eur(warm(o)) : '–'}</b></div>
        <div><small>Besichtigungen</small><b>${s.gemacht.length}${s.absagen.length ? ` <u class="tag vm-abs">${s.absagen.length} Abs.</u>` : ''}</b></div>
        <div><small>Nächster Termin</small><b class="vm-n">${s.naechste ? `${tag(s.naechste.datum)} ${uhr(s.naechste.datum)}` : '–'}</b></div>
      </div>
      <p class="vm-last">${l ? `<b>${esc(mine(l) ? 'Sie' : l.n)}:</b> ${esc(l.text || (l.dateien?.length ? 'Datei gesendet' : ''))} <small>${ago(l.at)}</small>` : '<small>Noch keine Nachrichten.</small>'}</p>
      ${s.offen.length ? `<p class="vm-hinw">Ergebnis fehlt für ${s.offen.length} Besichtigung${s.offen.length > 1 ? 'en' : ''}</p>` : ''}
    </div></article>`;
}

const FILTER = [['alle', 'Alle'], ['vermarktung', 'In Vermarktung'], ['reserviert', 'Reserviert'], ['vermietet', 'Vermietet'], ['vorbereitung', 'In Vorbereitung']];
function renderStart() {
  const alle = ctx.obj.filter((o) => tidOf(o.id)), st = (o) => stand(o.id).st, cnt = (k) => alle.filter((o) => st(o) === k).length;
  const list = alle.filter((o) => ctx.filter === 'alle' || st(o) === ctx.filter)
    .sort((a, b) => (unread(tidOf(b.id)) - unread(tidOf(a.id))) || ((evOf(tidOf(b.id)).at(-1)?.rid ?? 0) - (evOf(tidOf(a.id)).at(-1)?.rid ?? 0)));
  const monat = Date.now() - 30 * 864e5, bes30 = alle.reduce((a, o) => a + stand(o.id).gemacht.filter((b) => b.datum >= monat).length, 0);
  const neu = alle.reduce((a, o) => a + unread(tidOf(o.id)), 0);
  const gr = new Date().getHours() < 11 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Guten Tag' : 'Guten Abend';
  titelZahl();
  app.innerHTML = `${header()}<main class="wrap hw-main">
    <section class="held"><div><span class="eyebrow">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h2>${gr} <span>${esc(ctx.sess.n)}</span></h2></div></section>
    ${ctx.err ? `<p class="banner warn-b">${esc(ctx.err)} <button class="linkbtn" id="retry">Erneut versuchen</button></p>` : ''}
    <div class="kpis4 vm-kpis">
      <button class="kt" data-f="alle"><small>Objekte</small><b>${alle.length}</b></button>
      <button class="kt" data-f="vermarktung"><small>In Vermarktung</small><b>${cnt('vermarktung')}</b></button>
      <button class="kt" data-f="reserviert"><small>Reserviert</small><b class="${cnt('reserviert') ? 'warn-t' : ''}">${cnt('reserviert')}</b></button>
      <button class="kt" data-f="vermietet"><small>Vermietet</small><b class="${cnt('vermietet') ? 'ok-t' : ''}">${cnt('vermietet')}</b></button>
      <div class="kt"><small>Besichtigungen 30 Tage</small><b>${bes30}</b></div>
      <div class="kt"><small>Ungelesen</small><b class="${neu ? 'vm-gold' : ''}">${neu}</b></div>
    </div>
    <div class="bar"><div class="chips">${FILTER.map(([k, l]) => `<button class="chip${ctx.filter === k ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div></div>
    ${list.length ? `<div class="cards vm-cards">${list.map(karte).join('')}</div>`
      : `<p class="empty">${alle.length ? 'Keine Objekte in dieser Auswahl.' : 'Noch keine Mietobjekte. Unter „Verwaltung → Objekte“ anlegen und veröffentlichen.'}</p>`}
    <footer class="p-fuss wrap"><span>Norderfranken Haus und Grund GmbH · Am Gewerbegebiet 5 · 95185 Gattendorf</span><span>Vertraulich · Ende-zu-Ende verschlüsselt</span></footer></main>`;
  wire();
  document.getElementById('retry')?.addEventListener('click', async () => { await load(); render(); });
  app.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { ctx.filter = ctx.filter === b.dataset.f && b.classList.contains('kt') ? 'alle' : b.dataset.f; renderStart(); }));
  app.querySelectorAll('.vm-card').forEach((k) => { const f = () => go('objekt', k.dataset.oid); k.addEventListener('click', f); k.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } }); });
}

/* ---------- Objekt: Infos ---------- */
function infoHtml(o, s) {
  const max = Math.max(1, ...Object.values(s.gruende));
  const row = (b) => `<li class="vm-b"><div class="vm-b-d"><b>${tag(b.datum)}</b><small>${uhr(b.datum)}</small></div>
      <div class="vm-b-m"><span class="vm-erg" style="--c:${ERG[b.ergebnis]?.c}">${esc(ERG[b.ergebnis]?.l ?? b.ergebnis)}</span>${b.anzahl ? ` <small>${num(b.anzahl)} ${Number(b.anzahl) === 1 ? 'Interessent' : 'Interessenten'}</small>` : ''}
      ${b.grund ? `<small class="vm-gr">${esc(b.grund)}</small>` : ''}${b.text || b.notiz2 ? `<p>${esc([b.text, b.notiz2].filter(Boolean).join(' · '))}</p>` : ''}<small class="vm-von">${esc(b.n)}${b.von2 && b.von2 !== b.n ? ' · Ergebnis: ' + esc(b.von2) : ''}</small></div>
      ${b.ergebnis === 'geplant' || b.ergebnis === 'interesse' ? `<button class="btn ghost sm" data-erg="${esc(b.id)}">Ergebnis</button>` : ''}</li>`;
  const md = s.md;
  return `
  <section class="panel vm-sec"><div class="ph"><h2>Anzeigen</h2><button class="btn ghost sm" data-act="anzeige">+ Anzeige-Link</button></div>
    ${s.anz.length ? `<ul class="vm-links">${s.anz.map((a) => { const u = sicherUrl(a.url); return `<li><span class="chip2" style="--c:var(--gold)">${esc(a.portal || portalOf(a.url))}</span>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(a.text || u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))}</a>` : esc(a.url)}<small>seit ${dt(a.at)} · ${esc(a.n)}</small><button class="vm-x" data-weg="${esc(a.id)}" aria-label="Anzeige entfernen" title="Anzeige ist offline – entfernen">×</button></li>`; }).join('')}</ul>`
      : '<p class="hint">Noch keine Anzeige hinterlegt. Den Link zu ImmoScout24, Immowelt, Kleinanzeigen oder zur eigenen Seite hier eintragen.</p>'}</section>

  <section class="panel vm-sec"><div class="ph"><h2>Besichtigungen</h2><button class="btn fill sm" data-act="besichtigung">+ Besichtigung</button></div>
    <div class="vm-mini"><div><small>Durchgeführt</small><b>${s.gemacht.length}</b></div><div><small>Interessenten</small><b>${s.interessenten}</b></div><div><small>Zusagen</small><b class="${s.zusagen ? 'ok-t' : ''}">${s.zusagen}</b></div><div><small>Absagen</small><b class="${s.absagen.length ? 'krit-t' : ''}">${s.absagen.length}</b></div></div>
    ${s.naechste ? `<p class="vm-next">Nächster Termin: <b>${tag(s.naechste.datum)}, ${uhr(s.naechste.datum)} Uhr</b>${s.naechste.anzahl ? ` · ${num(s.naechste.anzahl)} Interessent${Number(s.naechste.anzahl) === 1 ? '' : 'en'}` : ''}</p>` : ''}
    ${s.offen.length ? `<p class="vm-hinw">Bei ${s.offen.length} vergangenen Termin${s.offen.length > 1 ? 'en' : ''} fehlt noch das Ergebnis.</p>` : ''}
    ${s.absagen.length ? `<div class="vm-gruende"><h3 class="sub-h">Absagegründe</h3>${Object.entries(s.gruende).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<div class="vm-g"><span>${esc(g)}</span><i style="width:${Math.round((n / max) * 100)}%"></i><b>${n}</b></div>`).join('')}</div>` : ''}
    ${s.bes.length ? `<ul class="vm-bes">${[...s.bes].reverse().map(row).join('')}</ul>` : '<p class="hint">Noch keine Besichtigungen eingetragen.</p>'}</section>

  <section class="panel vm-sec"><div class="ph"><h2>Mietdaten</h2><button class="btn ghost sm" data-act="mietdaten">${md ? 'Aktualisieren' : '+ Mietdaten'}</button></div>
    ${md ? `<dl class="kz vm-kz">${[['Mieter', md.mieter], ['Kontakt', md.kontakt], ['Personen', md.personen ? num(md.personen) : ''], ['Mietbeginn', md.beginn ? dt(md.beginn) : ''], ['Kaltmiete', md.kaltmiete != null ? eur(md.kaltmiete) : ''], ['Nebenkosten', md.nk != null ? eur(md.nk) : ''], ['Warmmiete', md.kaltmiete != null && md.nk != null ? eur(Number(md.kaltmiete) + Number(md.nk)) : ''], ['Kaution', md.kaution != null ? eur(md.kaution) : '']].filter(([, w]) => w).map(([l, w]) => `<div><dt>${l}</dt><dd>${esc(w)}</dd></div>`).join('')}</dl>
      ${md.text ? `<p class="vm-md-t">${esc(md.text)}</p>` : ''}${dateienHtml(md.dateien)}<p class="hint">Übermittelt von ${esc(md.n)} · ${dtm(md.at)}</p>`
      : '<p class="hint">Noch keine Mietdaten. Sobald ein Mieter feststeht: Name, Kontakt, Mietbeginn, Miete, Kaution und Unterlagen (Selbstauskunft, Schufa, Einkommensnachweise) hier übermitteln.</p>'}</section>

  <section class="panel vm-sec"><div class="ph"><h2>Objekt</h2></div>
    <div class="vm-od">${o.beschreibung ? `<p>${esc(o.beschreibung)}</p>` : ''}${o.ausstattung ? `<p class="vm-aus">${o.ausstattung.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}
    ${o.hinweis ? `<p class="note">${esc(o.hinweis)}</p>` : ''}${!o.beschreibung && !o.ausstattung && !o.hinweis ? '<p class="hint">Beschreibung, Ausstattung und interne Hinweise (Schlüssel, Ansprechpartner) unter „Verwaltung → Objekte“ ergänzen.</p>' : ''}</div></section>`;
}
const dateienHtml = (l) => (l?.length ? `<div class="vm-files">${l.map((f) => (f.t?.startsWith('image/') ? `<button class="foto" data-p="${esc(f.p)}" data-n="${esc(f.n)}" aria-label="Foto ${esc(f.n)} öffnen"><span>Foto lädt …</span></button>` : `<button class="vm-file" data-file="${esc(f.p)}" data-name="${esc(f.n)}" data-type="${esc(f.t)}"><b>${esc(f.n)}</b><small>öffnen</small></button>`)).join('')}</div>` : '');

/* ---------- Objekt: Verlauf (Live-Chat) ---------- */
function eintrag(e) {
  const wer = mine(e) ? 'Sie' : e.n, rolle = e.rolle && !mine(e) ? ` <em class="rolle">${esc(e.rolle)}</em>` : '';
  const sys = (txt) => `<li class="sys vm-sys"><span>${txt}</span> <small>${esc(wer)} · ${dtm(e.at)}</small></li>`;
  if (e.typ === 'status') return sys(`Status: <b style="color:${STATUS[e.status]?.c}">${esc(STATUS[e.status]?.l ?? e.status)}</b>${e.text ? ' – ' + esc(e.text) : ''}`);
  if (e.typ === 'anzeige') return sys(`Anzeige hinzugefügt: <b>${esc(e.portal || portalOf(e.url))}</b>`);
  if (e.typ === 'anzeige_weg') return sys('Anzeige entfernt');
  if (e.typ === 'besichtigung') return sys(`Besichtigung ${esc(tag(e.datum))}, ${uhr(e.datum)} Uhr eingetragen – <b style="color:${ERG[e.ergebnis]?.c}">${esc(ERG[e.ergebnis]?.l ?? '')}</b>${e.grund ? ' (' + esc(e.grund) + ')' : ''}`);
  if (e.typ === 'ergebnis') { const b = evOf(e.tid).find((x) => x.id === e.ref); return sys(`Ergebnis${b ? ` Besichtigung ${esc(tag(b.datum))}` : ''}: <b style="color:${ERG[e.ergebnis]?.c}">${esc(ERG[e.ergebnis]?.l ?? '')}</b>${e.grund ? ' (' + esc(e.grund) + ')' : ''}`); }
  if (e.typ === 'mietdaten') return sys(`Mietdaten übermittelt${e.mieter ? ': <b>' + esc(e.mieter) + '</b>' : ''}${e.dateien?.length ? ` · ${e.dateien.length} Unterlage${e.dateien.length > 1 ? 'n' : ''}` : ''}`);
  if (e.typ !== 'chat') return '';
  return `<li class="bub ${mine(e) ? 'me' : 'h'}" style="--c:${mine(e) ? 'var(--rand)' : 'var(--gold)'}"><div class="bh"><b>${esc(wer)}</b>${rolle}<small>${dtm(e.at)}</small></div>${e.text ? `<p>${esc(e.text)}</p>` : ''}${dateienHtml(e.dateien)}</li>`;
}
const feedHtml = (s) => (s.ev.length ? s.ev.map(eintrag).join('') : '<li class="empty">Noch keine Nachrichten. Schreiben Sie die erste – Ihr Gegenüber sieht sie sofort.</li>');

function renderObjekt() {
  const o = objOf(ctx.oid), s = stand(o.id), tid = tidOf(o.id), u = unread(tid);
  app.innerHTML = `${header(o.titel)}<main class="wrap hw-main vm-obj" data-seg="${ctx.seg}">
    <button class="linkbtn back" id="back">← Alle Objekte</button>
    <nav class="vm-seg" aria-label="Bereich"><button data-seg="objekt" aria-pressed="${ctx.seg === 'objekt'}">Übersicht</button><button data-seg="chat" aria-pressed="${ctx.seg === 'chat'}">Chat${u ? ` <span class="vm-u">${u}</span>` : ''}</button></nav>
    <section class="panel vm-top"><div class="vm-hero">${bild(o)}</div>
      <div class="vm-top-b"><span class="eyebrow">${esc(o.typ || 'Mietobjekt')}</span><h2 class="big">${esc(o.titel)}</h2><p class="hint">${esc([o.lage, o.ort].filter(Boolean).join(' · '))}</p>
        <label class="vm-stsel"><span>Status</span><select id="stSel" aria-label="Status ändern">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${s.st === k ? ' selected' : ''}>${v.l}</option>`).join('')}</select></label>
        <div class="vm-fakten">${[['Kaltmiete', eur(o.kaltmiete), 'p'], ['Nebenkosten', o.nk != null && o.nk !== '' ? eur(o.nk) : '–'], ['Warmmiete', o.nk != null && o.nk !== '' ? eur(warm(o)) : '–'], ['Kaution', o.kaution ? eur(o.kaution) : '–'], ['Wohnfläche', o.flaeche ? num(o.flaeche, 1) + ' m²' : '–'], ['Zimmer', o.zimmer ? num(o.zimmer, 1) : '–'], ['Frei ab', o.frei ? dt(Date.parse(o.frei)) : '–']].map(([l, w, c]) => `<div class="${c === 'p' ? 'price' : ''}"><small>${l}</small><b>${w}</b></div>`).join('')}</div>
        <div class="acts vm-acts"><button class="btn fill sm" data-act="besichtigung">+ Besichtigung</button><button class="btn sm" data-act="mietdaten">Mietdaten</button><button class="btn sm" data-act="anzeige">Anzeige-Link</button></div></div></section>
    ${ctx.err ? `<p class="banner warn-b">${esc(ctx.err)}</p>` : ''}
    <div class="vm-cols"><div class="vm-info" id="info">${infoHtml(o, s)}</div>
      <section class="panel vm-chat" aria-label="Chat zu diesem Objekt"><div class="ph"><h2>Chat</h2><small class="vm-live" id="live">● live</small></div>
        <ul class="feed2 vm-feed" id="feed" aria-live="polite">${feedHtml(s)}</ul>
        <button class="vm-neu hidden" id="neuNach">Neue Nachricht ↓</button>
        <form class="composer vm-comp" id="chatForm"><textarea name="text" rows="1" placeholder="Nachricht schreiben …" maxlength="4000" aria-label="Nachricht"></textarea>
          <label class="btn ghost attach" title="Fotos oder PDF anhängen"><input type="file" accept="image/*,application/pdf" multiple hidden id="chatFiles">Datei</label><button class="btn fill">Senden</button></form>
        <p class="hint pics-h" id="filesInfo"></p></section></div></main>`;
  wire();
  markSeen(tid); titelZahl();
  document.getElementById('back').addEventListener('click', () => go('start'));
  app.querySelectorAll('.vm-seg [data-seg]').forEach((b) => b.addEventListener('click', () => { ctx.seg = b.dataset.seg; app.querySelector('.vm-obj').dataset.seg = ctx.seg; app.querySelectorAll('.vm-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.seg === ctx.seg))); if (ctx.seg === 'chat') { app.querySelector('.vm-u')?.remove(); zumEnde(true); } }));
  document.getElementById('stSel').addEventListener('change', async (e) => {
    const v = e.target.value; e.target.disabled = true;
    try { await send(o.id, { typ: 'status', status: v }); toast(`Status: ${STATUS[v].l}`); } catch (x) { toast(x.message, false); }
    aktualisieren(true);
  });
  app.querySelector('.vm-obj').addEventListener('click', klick);
  const files = document.getElementById('chatFiles');
  files.addEventListener('change', () => { document.getElementById('filesInfo').textContent = files.files.length ? `${files.files.length} Datei${files.files.length > 1 ? 'en' : ''} angehängt` : ''; });
  const ta = document.querySelector('#chatForm textarea');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); e.target.form.requestSubmit(); } });
  document.getElementById('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, text = f.text.value.trim(), l = [...files.files];
    if (!text && !l.length) return;
    const btn = f.querySelector('.fill'); btn.disabled = true; btn.textContent = 'Sende …';
    try { await send(o.id, { typ: 'chat', text, dateien: l.length ? await upload(o.id, l) : undefined }); f.text.value = ''; ta.style.height = ''; files.value = ''; document.getElementById('filesInfo').textContent = ''; aktualisieren(true); }
    catch (x) { toast(x.message, false); }
    btn.disabled = false; btn.textContent = 'Senden'; ta.focus();
  });
  document.getElementById('neuNach').addEventListener('click', () => zumEnde(true));
  document.getElementById('feed').addEventListener('scroll', () => { if (nahUnten()) document.getElementById('neuNach').classList.add('hidden'); });
  hydrate(); zumEnde(true);
}
const nahUnten = () => { const f = document.getElementById('feed'); return !f || f.scrollHeight - f.scrollTop - f.clientHeight < 80; };
function zumEnde(immer = false) { const f = document.getElementById('feed'); if (f && (immer || nahUnten())) { f.scrollTop = f.scrollHeight; document.getElementById('neuNach')?.classList.add('hidden'); } }

/** Neue Einträge einblenden, ohne Eingaben oder Formulare zu stören. */
function aktualisieren(eigene = false) {
  if (ctx.view !== 'objekt') return;
  const o = objOf(ctx.oid); if (!o) return;
  const s = stand(o.id), unten = nahUnten();
  const feed = document.getElementById('feed'); if (!feed) return renderObjekt();
  feed.innerHTML = feedHtml(s);
  if (!document.getElementById('sheet')?.open) { const info = document.getElementById('info'); if (info) info.innerHTML = infoHtml(o, s); }
  const sel = document.getElementById('stSel'); if (sel) { sel.value = s.st; sel.disabled = false; }
  hydrate();
  if (unten || eigene) zumEnde(true); else document.getElementById('neuNach')?.classList.remove('hidden');
  if (document.visibilityState === 'visible') markSeen(tidOf(o.id));
  titelZahl();
}

async function klick(e) {
  const b = e.target.closest('[data-act],[data-erg],[data-weg],[data-file],.foto'); if (!b || b.closest('.vm-seg')) return;
  const o = objOf(ctx.oid);
  if (b.dataset.act) return formular(b.dataset.act, o);
  if (b.dataset.erg) return formular('ergebnis', o, b.dataset.erg);
  if (b.dataset.weg) { b.disabled = true; try { await send(o.id, { typ: 'anzeige_weg', ref: b.dataset.weg }); aktualisieren(true); } catch (x) { toast(x.message, false); b.disabled = false; } return; }
  if (b.dataset.file) { b.disabled = true; try { const u = await getFile(ctx.sess.sb, b.dataset.file, ctx.sess.threads[tidOf(o.id)].k, b.dataset.type); const a = document.createElement('a'); a.href = u; a.download = b.dataset.name; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); } catch (x) { toast(x.message, false); } b.disabled = false; }
}
/** Fotos erst beim Anzeigen laden und entschlüsseln. */
function hydrate() {
  const tid = tidOf(ctx.oid), k = ctx.sess.threads[tid]?.k;
  app.querySelectorAll('.foto:not([data-ok])').forEach(async (b) => {
    b.dataset.ok = '1';
    try { const u = await getFile(ctx.sess.sb, b.dataset.p, k, 'image/jpeg'); b.innerHTML = `<img src="${u}" alt="${esc(b.dataset.n || 'Foto')}" loading="lazy">`; b.onclick = () => lightbox(u); } catch { b.innerHTML = '<span>nicht ladbar</span>'; }
  });
}
function lightbox(u) {
  const d = dlg('lb', 'lb'); d.innerHTML = `<form method="dialog"><button class="lb-x" aria-label="Schließen">×</button></form><img src="${u}" alt="Foto">`;
  d.onclick = (e) => { if (e.target === d) d.close(); }; d.showModal();
}

/* ---------- Formulare ---------- */
/** „1.250,50“, „650“, „650.5“ → Zahl; leer → null; Unsinn → NaN */
export function zahl(v) {
  let x = String(v ?? '').replace(/[€\s]/g, ''); if (!x) return null;
  if (!/^\d[\d.,]*$/.test(x)) return NaN;
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else if (!/^\d+\.\d{1,2}$/.test(x)) x = x.replace(/\./g, '');
  const n = Number(x); return Number.isFinite(n) ? n : NaN;
}
const lokal = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
function formular(art, o, ref) {
  const d = dlg('sheet', 'sheet'), s = stand(o.id), md = s.md ?? {}, b = ref ? s.bes.find((x) => x.id === ref) : null;
  const jetzt = new Date(); jetzt.setMinutes(Math.round(jetzt.getMinutes() / 15) * 15, 0, 0);
  const ergSel = (v) => `<label class="f"><span>Ergebnis</span><select name="ergebnis" id="ergSel">${Object.entries(ERG).map(([k, x]) => `<option value="${k}"${v === k ? ' selected' : ''}>${x.l}</option>`).join('')}</select></label>
    <label class="f" id="grundF"><span>Absagegrund</span><select name="grund"><option value="">– bitte wählen –</option>${GRUENDE.map((g) => `<option${b?.grund === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>`;
  const F = {
    besichtigung: ['Besichtigung eintragen', `<label class="f"><span>Datum und Uhrzeit</span><input name="datum" type="datetime-local" required value="${lokal(jetzt.getTime())}"></label>
      <label class="f"><span>Anzahl Interessenten</span><input name="anzahl" type="number" min="0" max="99" step="1" value="1" required></label>
      ${ergSel('geplant')}
      <label class="f wide"><span>Notiz (z. B. Namen, Eindruck, Rückfragen)</span><textarea name="text" rows="3" maxlength="1500"></textarea></label>`],
    ergebnis: ['Ergebnis eintragen', `<p class="hint wide">Besichtigung ${b ? `${tag(b.datum)}, ${uhr(b.datum)} Uhr${b.anzahl ? ' · ' + num(b.anzahl) + ' Interessent' + (Number(b.anzahl) === 1 ? '' : 'en') : ''}` : ''}</p>${ergSel(b?.ergebnis === 'geplant' ? 'interesse' : b?.ergebnis)}
      <label class="f wide"><span>Notiz</span><textarea name="text" rows="3" maxlength="1500"></textarea></label>`],
    mietdaten: ['Mietdaten übermitteln', `<label class="f"><span>Mieter (Name)</span><input name="mieter" maxlength="120" value="${esc(md.mieter || '')}"></label>
      <label class="f"><span>Kontakt (Telefon / E-Mail)</span><input name="kontakt" maxlength="160" value="${esc(md.kontakt || '')}"></label>
      <label class="f"><span>Personen im Haushalt</span><input name="personen" type="number" min="0" max="20" value="${esc(md.personen ?? '')}"></label>
      <label class="f"><span>Mietbeginn</span><input name="beginn" type="date" value="${md.beginn ? new Date(md.beginn).toISOString().slice(0, 10) : ''}"></label>
      <label class="f"><span>Kaltmiete (€)</span><input name="kaltmiete" inputmode="decimal" value="${esc(md.kaltmiete ?? o.kaltmiete ?? '')}"></label>
      <label class="f"><span>Nebenkosten (€)</span><input name="nk" inputmode="decimal" value="${esc(md.nk ?? o.nk ?? '')}"></label>
      <label class="f"><span>Kaution (€)</span><input name="kaution" inputmode="decimal" value="${esc(md.kaution ?? o.kaution ?? '')}"></label>
      <label class="f wide"><span>Notiz (z. B. Staffelmiete, Haustiere, Besonderheiten)</span><textarea name="text" rows="3" maxlength="2000">${esc(md.text || '')}</textarea></label>
      <label class="f wide"><span>Unterlagen (Selbstauskunft, Schufa, Einkommensnachweise, Ausweis – PDF oder Foto)</span><input name="files" type="file" accept="application/pdf,image/*" multiple></label>
      ${md.dateien?.length ? `<p class="hint wide">Bereits übermittelt: ${md.dateien.map((f) => esc(f.n)).join(', ')} – bleiben erhalten.</p>` : ''}`],
    anzeige: ['Anzeige-Link hinzufügen', `<label class="f wide"><span>Link zur Anzeige</span><input name="url" type="url" required placeholder="https://www.immobilienscout24.de/expose/…" maxlength="600"></label>
      <label class="f wide"><span>Bezeichnung (optional)</span><input name="text" maxlength="120" placeholder="z. B. ImmoScout24 – Premium bis 30.11."></label>`],
  }[art];
  d.innerHTML = `<form class="panel form" id="vmForm"><div class="sh-h"><h2>${F[0]}</h2><button type="button" class="btn ghost sm" data-a="close">Abbrechen</button></div><div class="grid">${F[1]}</div>
    <p class="lg-err hidden" id="vmErr" role="alert"></p><div class="acts sticky-save"><button class="btn fill">Speichern</button></div></form>`;
  const ergS = d.querySelector('#ergSel'), grundF = d.querySelector('#grundF');
  const zeigGrund = () => { if (grundF) grundF.hidden = ergS.value !== 'absage'; };
  ergS?.addEventListener('change', zeigGrund); zeigGrund();
  d.onclick = (e) => { if (e.target.closest('[data-a=close]')) d.close(); };
  d.querySelector('#vmForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('.sticky-save .btn'), err = f.querySelector('#vmErr');
    const fehler = (t) => { err.textContent = t; err.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Speichern'; };
    btn.disabled = true; btn.textContent = 'Wird gespeichert …'; err.classList.add('hidden');
    try {
      const text = f.text?.value.trim() || undefined;
      if (art === 'besichtigung' || art === 'ergebnis') {
        const ergebnis = f.ergebnis.value, grund = ergebnis === 'absage' ? f.grund.value : '';
        if (ergebnis === 'absage' && !grund) return fehler('Bitte einen Absagegrund wählen.');
        if (art === 'besichtigung') {
          const datum = new Date(f.datum.value).getTime();
          if (!Number.isFinite(datum)) return fehler('Bitte Datum und Uhrzeit angeben.');
          await send(o.id, { typ: 'besichtigung', datum, anzahl: Number(f.anzahl.value) || 0, ergebnis, grund: grund || undefined, text });
        } else await send(o.id, { typ: 'ergebnis', ref, ergebnis, grund: grund || undefined, text });
      } else if (art === 'mietdaten') {
        const w = {}; for (const k of ['kaltmiete', 'nk', 'kaution']) { w[k] = zahl(f[k].value); if (Number.isNaN(w[k])) return fehler('Bitte Beträge als Zahl eingeben, z. B. 650 oder 1.250,50.'); }
        const neu = [...f.files.files], dateien = [...(md.dateien ?? []), ...(neu.length ? await upload(o.id, neu) : [])];
        await send(o.id, { typ: 'mietdaten', mieter: f.mieter.value.trim(), kontakt: f.kontakt.value.trim(), personen: f.personen.value ? Number(f.personen.value) : undefined, beginn: f.beginn.value ? Date.parse(f.beginn.value) : undefined, ...w, text, dateien: dateien.length ? dateien : undefined });
      } else if (art === 'anzeige') {
        const url = sicherUrl(f.url.value.trim()); if (!url) return fehler('Bitte einen gültigen Link mit https:// eingeben.');
        await send(o.id, { typ: 'anzeige', url, portal: portalOf(url), text });
      }
      d.close(); toast('Gespeichert.'); aktualisieren(true);
    } catch (x) { fehler(x.message || String(x)); }
  };
  d.showModal();
  d.querySelector('input:not([type=hidden]),select,textarea')?.focus();
}

/* ---------- Live: neue Einträge holen ---------- */
let busy = false, lastPkg = Date.now();
async function tick() {
  if (busy || !ctx.sess || document.visibilityState !== 'visible') return;
  busy = true;
  try {
    const n = await load(true);
    if (Date.now() - lastPkg > 300000) { lastPkg = Date.now(); await paketPruefen(); }
    if (!n) { const l = document.getElementById('live'); if (l) l.classList.toggle('aus', !!ctx.err); return; }
    if (ctx.view === 'objekt') aktualisieren();
    else if (ctx.view === 'start' && !document.getElementById('sheet')?.open) { const y = window.scrollY; renderStart(); window.scrollTo(0, y); }
    else if (ctx.view === 'admin') titelZahl();
  } finally { busy = false; }
}
// Im geöffneten Objekt alle 4 Sekunden, sonst alle 15 Sekunden
setInterval(() => { if (ctx.view === 'objekt') tick(); }, 4000);
setInterval(() => { if (ctx.view !== 'objekt') tick(); }, 15000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tick(); if (ctx.view === 'objekt') markSeen(tidOf(ctx.oid)); } });

/** Neue Objekte oder Zugänge (von der Verwaltung veröffentlicht) übernehmen – nie auf einen älteren Stand zurück. */
export async function paketPruefen() {
  if (!ctx.sess) return;
  let pkg; try { pkg = await neuester(verOf(ctx.pkg), true); } catch { return; }
  if (verOf(pkg) <= verOf(ctx.pkg)) return;
  const slot = pkg.slots.find((x) => x.id === ctx.sess.id), payload = slot && await openSlot(ctx.sess.code, slot, pkg.iter);
  if (!payload) { logout(); return showLogin('Ihr Zugang wurde geändert. Bitte neu anmelden.'); }
  ctx.pkg = pkg; relogin({ ...payload, code: ctx.sess.code, id: ctx.sess.id }, await openObjekte(payload, pkg));
  await load(true);
  if (ctx.view === 'start') renderStart();
}

/* ---------- Start ---------- */
(async () => {
  try { ctx.pkg = await neuester(0, true); } catch (e) { app.innerHTML = `<main class="lg"><div class="lg-card"><h1>Nicht erreichbar</h1><p class="lg-sub">${esc(e.message)}. Bitte später erneut versuchen.</p></div></main>`; return; }
  const hash = location.hash.slice(1);
  if (!hash) {
    const s = (() => { try { return JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch { return null; } })();
    if (s?.id && s.code) {
      const slot = ctx.pkg.slots.find((x) => x.id === s.id), payload = slot && await openSlot(s.code, slot, ctx.pkg.iter);
      if (payload) { ctx.sess = { ...payload, code: s.code, id: s.id }; ctx.obj = await openObjekte(payload, ctx.pkg).catch(() => []); render(); await load(); render(); return; }
    }
  }
  showLogin();
  if (hash) { const i = hash.indexOf('.'); if (i > 0) { const pw = document.getElementById('pw'); pw.value = (() => { try { return decodeURIComponent(hash); } catch { return hash; } })(); pw.form.requestSubmit(); } }
})();
