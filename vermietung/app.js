// Vermietung: Mietobjekte aus dem Bestand. Pro Objekt ein gemeinsamer Live-Chat zwischen Vermieter und Vermittler,
// dazu Besichtigungen (mit Absagegründen), Anzeigen-Links, Mietdaten mit Unterlagen und der Vermietungsstand.
// Alles Inhaltliche ist Ende-zu-Ende verschlüsselt; der Speicherdienst sieht nur Zufallskennungen und Chiffretext.
import { openObjekte, openSlot } from './pkg.js';
import { AUSST, SEITEN, STP, fehlt as vFehlt, gesamt as vGesamt, ibanOk, ibanSchoen, schluesselEditor, schluesselLesen, schluesselPlus, vertragsdaten, vertragsname } from './mvfelder.js';
import { neuester, verOf } from './quelle.js';
import { fetchEvents, getFile, postEvent, putFile } from '../handwerker/store.js';
import { ago, confirmBox, dlg, dt, dtm, esc, logo, lsGet, lsSet, shrinkImage, themaWechseln, toast } from '../handwerker/ui.js';

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
/** Stand eines Interessenten (Reihenfolge = Sortierung in der Liste) */
export const KSTAND = {
  zusage: { l: 'Zusage', c: 'var(--gut)' },
  favorit: { l: 'Favorit', c: 'var(--warn)' },
  unterlagen: { l: 'Unterlagen da', c: 'var(--gold)' },
  besichtigung: { l: 'Besichtigung', c: 'var(--gold)' },
  anfrage: { l: 'Anfrage', c: 'var(--schiefer)' },
  absage: { l: 'Abgesagt', c: 'var(--krit)' },
};
const KRANG = Object.keys(KSTAND);
/** Unterlagen-Checkliste eines Interessenten: [Schlüssel, Bezeichnung, Kurzname, nötige Anzahl Dateien] */
export const DOKS = [
  ['selbstauskunft', 'Mieterselbstauskunft', 'Selbstauskunft', 1],
  ['einkommen', 'Letzte 3 Gehaltsnachweise', 'Gehaltsnachweis', 3],
  ['mietschulden', 'Mietschuldenfreiheitsbescheinigung', 'Mietschuldenfreiheit', 1],
  ['ausweis', 'Personalausweis', 'Ausweis', 1],
  ['haftpflicht', 'Nachweis Privathaftpflicht', 'Haftpflicht', 1],
  ['schufa', 'Schufa-Auskunft', 'Schufa', 1],
  ['sonstiges', 'Weitere Unterlagen', 'Sonstiges', 0],
  ['mietvertrag', 'Mietvertrag', 'Mietvertrag', 0],
];
const DOK_L = Object.fromEntries(DOKS.map(([k, , kurz]) => [k, kurz]));
const CHECK = DOKS.filter((x) => x[3]);
/** Art am Dateinamen erkennen – Spezielles zuerst („Haftpflicht-Versicherungsbescheid“ ist kein Einkommen) */
const ERKENNEN = [['selbstauskunft', /selbst.?auskunft|mieterauskunft|auskunft.?mieter/i], ['mietschulden', /mietschuld|schuldenfrei|vormieter|vermieterbesch/i], ['schufa', /schufa|bonit/i],
  ['haftpflicht', /haftpflicht|privathaft|versicherungs?(schein|nachweis|police|bestätigung)/i], ['ausweis', /ausweis|perso\b|personal|reisepass|pass\b|id.?card/i],
  ['einkommen', /gehalt|lohn|einkommen|verdienst|entgelt|abrechnung|rente|bafög|bafoeg|jobcenter|bescheid|kontoauszug/i]];
export const dokArt = (name) => ERKENNEN.find(([, re]) => re.test(name))?.[0] ?? 'sonstiges';
const dokListe = (k, key) => (k?.dateien ?? []).filter((f) => f.k === key);
/** Vollständig = genug Dateien hochgeladen oder als geprüft markiert (z. B. drei Gehaltsnachweise in einer PDF) */
export const dokZahl = (k) => CHECK.filter(([key, , , min]) => k?.geprueft?.[key] || dokListe(k, key).length >= min).length;
const geprueftZahl = (k) => CHECK.filter(([key]) => k?.geprueft?.[key]).length;
const QUELLEN = ['Kleinanzeigen', 'ImmoScout24', 'Immowelt', 'Eigene Webseite', 'Empfehlung', 'Aushang', 'Telefon', 'Sonstiges'];
const telHref = (t) => { const x = String(t || '').replace(/[^\d+]/g, ''); return x.replace(/\D/g, '').length >= 5 ? 'tel:' + x : ''; };
const mailOk = (m) => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(m || '');
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
  // Interessenten: jeder Eintrag ist der vollständige neue Stand, der letzte gilt
  const kon = new Map();
  for (const e of ev) {
    if (e.typ === 'kontakt' && e.kid) kon.set(e.kid, { ...e, erstellt: kon.get(e.kid)?.erstellt ?? e.at });
    else if (e.typ === 'kontakt_weg') kon.delete(e.ref);
  }
  const kontakte = [...kon.values()].sort((a, b) => (KRANG.indexOf(a.stand) - KRANG.indexOf(b.stand)) || (b.at - a.at));
  const kname = (id) => kon.get(id)?.name;
  const upd = new Map(), bweg = new Set(); for (const e of ev) { if (e.typ === 'ergebnis') upd.set(e.ref, e); else if (e.typ === 'besichtigung_weg') bweg.add(e.ref); }
  // Besichtigung: der jüngste Ergebnis-Eintrag gilt (Ergebnis, Grund, Name, Feedback); ältere Einträge mit „text“ bleiben lesbar
  const bes = ev.filter((e) => e.typ === 'besichtigung' && !bweg.has(e.id)).map((b) => {
    const u = upd.get(b.id), kids = u?.kids ?? b.kids ?? [], namen = kids.map(kname).filter(Boolean);
    return { ...b, ergebnis: u?.ergebnis ?? b.ergebnis, grund: u ? u.grund : b.grund, kids, namen,
      wer: namen.join(', ') || (u?.name ?? b.name) || '', fb: u && 'feedback' in u ? u.feedback : (u?.text || b.feedback || b.text || ''), von2: u?.n };
  }).sort((a, b) => a.datum - b.datum);
  const weg = new Set(ev.filter((e) => e.typ === 'anzeige_weg').map((e) => e.ref));
  const anz = ev.filter((e) => e.typ === 'anzeige' && !weg.has(e.id));
  const md = ev.filter((e) => e.typ === 'mietdaten').at(-1);
  const gemacht = bes.filter((b) => b.datum <= jetzt || b.ergebnis !== 'geplant');
  // Absagen aus Besichtigungen und von Interessenten – derselbe Interessent zählt nur einmal
  const absagen = [], erfasst = new Set();
  for (const k of kontakte) if (k.stand === 'absage') { absagen.push({ grund: k.grund || 'Ohne Angabe', wer: k.name, at: k.at, kid: k.kid }); erfasst.add(k.kid); }
  for (const b of gemacht) {
    if (b.ergebnis !== 'absage') continue;
    const ks = (b.kids ?? []).filter((id) => kon.has(id));
    if (ks.length && ks.every((id) => erfasst.has(id))) continue;
    absagen.push({ grund: b.grund || 'Ohne Angabe', wer: ks.filter((id) => !erfasst.has(id)).map(kname).join(', '), at: b.datum, bid: b.id });
  }
  absagen.sort((a, b) => b.at - a.at);
  const gruende = {}; for (const a of absagen) gruende[a.grund] = (gruende[a.grund] ?? 0) + 1;
  const aktiv = kontakte.filter((k) => k.stand !== 'absage');
  return {
    ev, st, bes, anz, md, gemacht, absagen, gruende, kontakte, aktiv,
    komplett: aktiv.filter((k) => dokZahl(k) === CHECK.length).length,
    geprueft: aktiv.filter((k) => geprueftZahl(k) === CHECK.length).length,
    mitDoks: aktiv.filter((k) => k.dateien?.length).length,
    naechste: bes.find((b) => b.datum > jetzt && b.ergebnis === 'geplant'),
    geplant: bes.filter((b) => b.datum > jetzt && b.ergebnis === 'geplant'),
    offen: bes.filter((b) => b.datum <= jetzt && b.ergebnis === 'geplant'), // Termin vorbei, Ergebnis fehlt
    interessenten: gemacht.reduce((a, b) => a + (Number(b.anzahl) || 0), 0),
    zusagen: gemacht.filter((b) => b.ergebnis === 'zusage').length,
  };
}
/** „Miete zu hoch (2) · Lage (1)“ */
const gruendeText = (g) => Object.entries(g).sort((a, b) => b[1] - a[1]).map(([x, n]) => `${esc(x)}${n > 1 ? ` (${n})` : ''}`).join(' · ');

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
async function upload(oid, files, art = '') {
  const tid = tidOf(oid), t = ctx.sess.threads[tid], out = [];
  if (files.length > 15) throw new Error('Bitte höchstens 15 Dateien auf einmal.');
  for (const f of files) {
    const ext = f.name.split('.').pop().toLowerCase(), type = TYPEN[ext] || f.type || 'application/octet-stream', bild = type.startsWith('image/');
    if (!bild && f.size > 12 * 1024 * 1024) throw new Error(`„${f.name}“ ist größer als 12 MB.`);
  }
  for (const f of files) {
    const ext = f.name.split('.').pop().toLowerCase(), type = TYPEN[ext] || f.type || 'application/octet-stream', bild = type.startsWith('image/');
    const bytes = bild ? await shrinkImage(f, 2000) : new Uint8Array(await f.arrayBuffer());
    const d = { p: await putFile(ctx.sess.sb, tid, t.k, bytes), n: f.name, t: bild ? 'image/jpeg' : type };
    if (art) d.k = art === 'auto' ? dokArt(f.name) : art;
    out.push(d);
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
    ${ctx.view !== 'admin' ? '<button class="btn dark sm" id="toAdmin">Verwaltung</button>' : '<button class="btn dark sm" id="toStart"><span class="vm-lang">Zur </span>Übersicht</button>'}
    <button class="btn dark sm" id="logout" aria-label="Abmelden"><svg class="vm-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="vm-lang">Abmelden</span></button>
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

const namenText = (l) => (l?.length ? ' · ' + esc(l.join(', ')) : '');
function karte(o) {
  const s = stand(o.id), tid = tidOf(o.id), u = unread(tid), l = s.ev.filter((e) => e.typ === 'chat').at(-1);
  const zahlen = [[s.gemacht.length, 'Besichtigung', 'Besichtigungen'], [s.aktiv.length, 'Interessent', 'Interessenten'], [s.mitDoks, 'mit Unterlagen', 'mit Unterlagen']]
    .filter(([n]) => n).map(([n, e, m]) => `<b>${n}</b> ${n === 1 ? e : m}`).join(' · ');
  return `<article class="card vm-card" data-oid="${esc(o.id)}" tabindex="0" role="link" aria-label="${esc(o.titel)}${o.lage ? ' ' + esc(o.lage) : ''} öffnen">
    <div class="photo">${bild(o)}${stPill(s.st)}${u ? `<span class="neu">${u} neu</span>` : ''}</div>
    <div class="body">
      <div class="head"><h2>${esc(o.titel)}${o.lage ? ` <span>· ${esc(o.lage)}</span>` : ''}</h2><span class="meta">${esc(meta(o))}</span></div>
      <div class="kpis">
        <div class="price"><small>Kaltmiete</small><b>${eur(o.kaltmiete)}</b></div>
        <div><small>Warmmiete</small><b>${o.nk != null && o.nk !== '' ? eur(warm(o)) : '–'}</b></div>
      </div>
      ${zahlen ? `<p class="vm-zahl">${zahlen}</p>` : ''}
      ${s.naechste ? `<p class="vm-nx">Nächster Termin: <b>${tag(s.naechste.datum)}, ${uhr(s.naechste.datum)} Uhr</b>${s.naechste.wer ? ' · ' + esc(s.naechste.wer) : ''}</p>` : ''}
      ${s.offen.length ? `<p class="vm-hinw">Ergebnis fehlt für ${s.offen.length} Besichtigung${s.offen.length > 1 ? 'en' : ''}</p>` : ''}
      ${s.absagen.length ? `<p class="vm-absz"><b>${s.absagen.length} ${s.absagen.length === 1 ? 'Absage' : 'Absagen'}:</b> ${gruendeText(s.gruende)}</p>` : ''}
      ${l ? `<p class="vm-last"><b>${esc(mine(l) ? 'Sie' : l.n)}:</b> ${esc(l.text || (l.dateien?.length ? 'Datei gesendet' : ''))} <small>${ago(l.at)}</small></p>` : ''}
    </div></article>`;
}

/** Was als Nächstes ansteht: Termine der nächsten 14 Tage und vergangene Termine ohne Ergebnis – über alle Objekte. */
function alsNaechstes(alle) {
  const bis = Date.now() + 14 * 864e5, l = [];
  for (const o of alle) {
    const s = stand(o.id);
    for (const b of s.offen) l.push({ o, b, t: b.datum, offen: true });
    for (const b of s.geplant) if (b.datum <= bis) l.push({ o, b, t: b.datum });
  }
  if (!l.length) return '';
  l.sort((a, b) => (b.offen - a.offen) || (a.t - b.t));
  return `<section class="panel vm-todo"><div class="ph"><h2>Als Nächstes</h2><small class="hint">${l.length} ${l.length === 1 ? 'Eintrag' : 'Einträge'}</small></div><ul>
    ${l.slice(0, 8).map(({ o, b, offen }) => `<li><button data-oid="${esc(o.id)}"><span class="vm-td"><b>${tag(b.datum)}</b><small>${uhr(b.datum)} Uhr</small></span>
      <span class="vm-tm"><b>${esc(o.titel)}${o.lage ? ` · ${esc(o.lage)}` : ''}</b><small>${offen ? '<em class="vm-warn">Ergebnis eintragen</em>' : 'Besichtigung'}${b.wer ? ` · <b class="vm-wer">${esc(b.wer)}</b>` : ''}</small></span><span class="vm-tp" aria-hidden="true">›</span></button></li>`).join('')}
  </ul></section>`;
}

const ORD = { vermarktung: 0, reserviert: 1, vorbereitung: 2, vermietet: 3 }; // Reihenfolge der Karten
const FILTER = [['alle', 'Alle Objekte'],['vorbereitung', 'In Vorbereitung'], ['vermarktung', 'In Vermarktung'], ['reserviert', 'Reserviert'], ['vermietet', 'Vermietet']];
function renderStart() {
  const alle = ctx.obj.filter((o) => tidOf(o.id)), st = (o) => stand(o.id).st, cnt = (k) => (k === 'alle' ? alle.length : alle.filter((o) => st(o) === k).length);
  const list = alle.filter((o) => ctx.filter === 'alle' || st(o) === ctx.filter)
    .sort((a, b) => (unread(tidOf(b.id)) - unread(tidOf(a.id))) || (ORD[st(a)] - ORD[st(b)]) || ((evOf(tidOf(b.id)).at(-1)?.rid ?? 0) - (evOf(tidOf(a.id)).at(-1)?.rid ?? 0)));
  const gr = new Date().getHours() < 11 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Guten Tag' : 'Guten Abend';
  titelZahl();
  app.innerHTML = `${header()}<main class="wrap hw-main">
    <section class="held"><div><span class="eyebrow">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h2>${gr} <span>${esc(ctx.sess.n)}</span></h2></div></section>
    ${ctx.err ? `<p class="banner warn-b">${esc(ctx.err)} <button class="linkbtn" id="retry">Erneut versuchen</button></p>` : ''}
    <div class="kpis4 vm-kpis" role="group" aria-label="Objekte filtern">
      ${FILTER.map(([k, l]) => `<button class="kt${ctx.filter === k ? ' on' : ''}" data-f="${k}" aria-pressed="${ctx.filter === k}" style="--c:${STATUS[k]?.c ?? 'var(--gold)'}"><small>${l}</small><b>${cnt(k)}</b></button>`).join('')}
    </div>
    ${alsNaechstes(alle)}
    ${list.length ? `<div class="cards vm-cards">${list.map(karte).join('')}</div>`
      : `<p class="empty">${alle.length ? 'Keine Objekte in dieser Auswahl.' : 'Noch keine Mietobjekte. Unter „Verwaltung → Objekte“ anlegen und veröffentlichen.'}</p>`}
    <footer class="p-fuss wrap"><span>Norderfranken Haus und Grund GmbH · Am Gewerbegebiet 5 · 95185 Gattendorf</span><span>Vertraulich · Ende-zu-Ende verschlüsselt</span></footer></main>`;
  wire();
  document.getElementById('retry')?.addEventListener('click', async () => { await load(); render(); });
  app.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { ctx.filter = ctx.filter === b.dataset.f ? 'alle' : b.dataset.f; renderStart(); }));
  app.querySelectorAll('.vm-todo [data-oid]').forEach((b) => b.addEventListener('click', () => go('objekt', b.dataset.oid)));
  app.querySelectorAll('.vm-card').forEach((k) => { const f = () => go('objekt', k.dataset.oid); k.addEventListener('click', f); k.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } }); });
}

/* ---------- Objekt: Infos ---------- */
const hat = (v) => v != null && v !== '';
const vorname = (n) => String(n || '').trim().split(/\s+/)[0];
const fileBtn = (f) => `<button class="vm-file" data-file="${esc(f.p)}" data-name="${esc(f.n)}" data-type="${esc(f.t)}"><b>${esc(f.n)}</b><small>${esc(DOK_L[f.k] ?? 'öffnen')}</small></button>`;
const dateienHtml = (l) => (l?.length ? `<div class="vm-files">${l.map((f) => (f.t?.startsWith('image/') ? `<button class="foto" data-p="${esc(f.p)}" data-n="${esc(f.n)}" aria-label="Foto ${esc(f.n)} öffnen"><span>Foto lädt …</span></button>` : `<button class="vm-file" data-file="${esc(f.p)}" data-name="${esc(f.n)}" data-type="${esc(f.t)}"><b>${esc(f.n)}</b><small>öffnen</small></button>`)).join('')}</div>` : '');
const auf = (k, std = false) => ((ctx.auf?.[k] ?? std) ? ' open' : '');

/** Checkliste der Unterlagen: je Punkt hochladen, herunterladen und als geprüft abhaken. */
function checkliste(k) {
  const g = k.geprueft ?? {}, z = dokZahl(k), gz = geprueftZahl(k), weitere = dokListe(k, 'sonstiges');
  const up = (key) => `<label class="btn ghost sm vm-up" title="Datei hochladen">+ Datei<input type="file" hidden multiple accept="application/pdf,image/*" data-kfile="${esc(k.kid)}" data-art="${key}"></label>`;
  const zeile = ([key, l, , min]) => {
    const fs = dokListe(k, key), ok = fs.length >= min, pr = g[key];
    const st = pr ? 'pr' : ok ? 'ok' : fs.length ? 'teil' : 'fehlt';
    const txt = pr ? `geprüft von ${esc(pr.n)} · ${dt(pr.at)}` : ok ? 'liegt vor – bitte prüfen' : fs.length ? `${fs.length} von ${min} – fehlt noch` : 'fehlt';
    return `<li class="vm-cl-${st}"><span class="vm-cl-i" aria-hidden="true">${pr ? '✓' : ok ? '●' : fs.length ? '◐' : '○'}</span>
      <div class="vm-cl-t"><b>${esc(l)}</b><small>${txt}</small>${fs.length ? `<div class="vm-files">${fs.map(fileBtn).join('')}</div>` : ''}</div>
      <span class="vm-cl-a">${up(key)}${fs.length ? `<button class="btn sm${pr ? ' ghost' : ' vm-pr'}" data-kpr="${esc(k.kid)}" data-art="${key}" aria-pressed="${!!pr}">${pr ? 'Zurücknehmen' : '✓ Geprüft'}</button>` : ''}</span></li>`;
  };
  return `<div class="vm-cl-d"><div class="vm-cl-h"><span>Unterlagen-Checkliste</span><b class="${z === CHECK.length ? 'ok-t' : ''}">${z}/${CHECK.length} da</b>${gz ? `<b class="ok-t">${gz}/${CHECK.length} geprüft</b>` : ''}</div>
    <ul class="vm-cl">${CHECK.map(zeile).join('')}
      <li class="vm-cl-x"><span class="vm-cl-i" aria-hidden="true">+</span><div class="vm-cl-t"><b>Weitere Unterlagen</b><small>${weitere.length ? `${weitere.length} Datei${weitere.length > 1 ? 'en' : ''}` : 'optional (z. B. Arbeitsvertrag, Bürgschaft)'}</small>${weitere.length ? `<div class="vm-files">${weitere.map(fileBtn).join('')}</div>` : ''}</div><span class="vm-cl-a">${up('sonstiges')}</span></li>
    </ul></div>`;
}

/** Detailansicht eines Interessenten (eigenes Fenster): Kontakt, Checkliste, seine Besichtigungen, Aktionen */
function kontaktHtml(k, s) {
  const ks = KSTAND[k.stand] ?? KSTAND.anfrage, tel = telHref(k.tel);
  const meta = [esc(k.tel || ''), esc(k.mail || ''),
    k.personen ? `${num(k.personen)} ${Number(k.personen) === 1 ? 'Person' : 'Personen'}` : '', k.einzug ? `Einzug ab ${dt(Date.parse(k.einzug))}` : '', k.quelle ? `über ${esc(k.quelle)}` : ''].filter(Boolean);
  const bs = s.bes.filter((b) => b.kids.includes(k.kid)).reverse();
  return `<div class="vm-k vm-kd" style="--c:${ks.c}">
    <div class="sh-h vm-kd-h"><div><span class="eyebrow">Interessent · seit ${dt(k.erstellt)}</span><h2>${esc(k.name)} <span class="vm-erg" style="--c:${ks.c}">${esc(ks.l)}</span></h2></div><button type="button" class="btn ghost sm" data-a="kzu">Schließen</button></div>
    ${meta.length ? `<p class="vm-k-m">${meta.map((x) => `<span>${x}</span>`).join('')}</p>` : ''}
    ${tel || mailOk(k.mail) ? `<div class="vm-k-a vm-kontakt">${tel ? `<a class="btn sm" href="${esc(tel)}">Anrufen</a>` : ''}${tel ? `<a class="btn ghost sm" href="${esc(tel.replace('tel:', 'sms:'))}">SMS</a>` : ''}${mailOk(k.mail) ? `<a class="btn ghost sm" href="mailto:${esc(k.mail)}">E-Mail</a>` : ''}</div>` : ''}
    ${k.stand === 'absage' ? `<p class="vm-grund">Absagegrund: <b>${esc(k.grund || 'ohne Angabe')}</b></p>` : ''}
    ${k.text ? `<p class="vm-k-t">${esc(k.text)}</p>` : ''}
    <div class="vm-k-a">${k.stand === 'zusage' || k.stand === 'favorit' ? `<button class="btn fill sm" data-kmiet="${esc(k.kid)}">Als Mieter übernehmen</button>` : ''}${k.stand !== 'absage' ? `<button class="btn ghost sm" data-kbes="${esc(k.kid)}">+ Besichtigung</button>` : ''}<button class="btn ghost sm" data-k="${esc(k.kid)}">Bearbeiten</button></div>
    ${checkliste(k)}
    <div class="vm-mv"><div><h3 class="sub-h">Mietvertrag</h3><p class="hint">${(() => { const f = vFehlt(vertragsdaten(objOf(ctx.oid), k, ctx.obj)); return f.length ? `Für einen vollständigen Vertrag fehlen noch ${f.length} Angabe${f.length > 1 ? 'n' : ''}.` : 'Alle Angaben für den Vertrag sind da.'; })()}</p>
      ${dokListe(k, 'mietvertrag').length ? `<div class="vm-files">${dokListe(k, 'mietvertrag').slice(-3).reverse().map(fileBtn).join('')}</div>` : ''}</div><button class="btn fill sm" data-kvertrag="${esc(k.kid)}">Mietvertrag erstellen</button></div>
    <div class="vm-k-a">${k.dateien?.length ? `<button class="btn sm" data-kzip="${esc(k.kid)}">Alle Unterlagen laden (ZIP)</button>` : ''}<button class="btn ghost sm" data-kup="${esc(k.kid)}">Mehrere Dateien auf einmal hochladen</button></div>
    ${bs.length ? `<div class="vm-kd-b"><h3 class="sub-h">Besichtigungen</h3><ul>${bs.map((b) => `<li><b>${tag(b.datum)}, ${uhr(b.datum)} Uhr</b><span class="vm-erg" style="--c:${ERG[b.ergebnis]?.c}">${esc(ERG[b.ergebnis]?.l ?? b.ergebnis)}</span>${b.ergebnis === 'absage' ? `<em class="vm-bg">${esc(b.grund || '')}</em>` : ''}${b.fb ? `<small>${esc(b.fb)}</small>` : ''}</li>`).join('')}</ul></div>` : ''}
  </div>`;
}

function kZeile(k, s) {
  const ks = KSTAND[k.stand] ?? KSTAND.anfrage, z = dokZahl(k), gz = geprueftZahl(k), lb = s.bes.filter((b) => b.kids.includes(k.kid)).at(-1);
  return `<tr class="vm-klick${k.stand === 'absage' ? ' weg' : ''}" data-kopen="${esc(k.kid)}" tabindex="0" role="button" aria-label="${esc(k.name)} öffnen">
    <td class="n"><b>${esc(k.name)}</b>${k.tel || k.mail ? `<small>${esc(k.tel || k.mail)}</small>` : ''}</td>
    <td class="e"><span class="vm-erg" style="--c:${ks.c}">${esc(ks.l)}</span>${k.stand === 'absage' && k.grund ? `<small class="vm-bg">${esc(k.grund)}</small>` : ''}</td>
    <td class="u"><span class="vm-prog${z === CHECK.length ? ' voll' : ''}"><i style="width:${Math.round((z / CHECK.length) * 100)}%"></i></span><small>${z}/${CHECK.length} da${gz ? ` · <b class="ok-t">${gz} geprüft</b>` : ''}</small></td>
    <td class="b">${lb ? `<b>${tag(lb.datum)}</b><small style="color:${ERG[lb.ergebnis]?.c}">${esc(ERG[lb.ergebnis]?.l ?? '')}</small>` : '<span class="vm-mut">–</span>'}</td>
    <td class="a"><span class="vm-tp" aria-hidden="true">›</span></td></tr>`;
}

function kontaktOeffnen(kid) {
  const o = objOf(ctx.oid), s = stand(o.id), k = s.kontakte.find((x) => x.kid === kid), d = dlg('kdet', 'sheet');
  if (!k) { if (d.open) d.close(); return; }
  d.dataset.kid = kid; d.innerHTML = `<div class="panel form">${kontaktHtml(k, s)}</div>`;
  d.onclick = (e) => { if (e.target.closest('[data-a=kzu]') || e.target === d) return d.close(); klick(e); };
  d.onchange = dateiGewaehlt;
  if (!d.open) d.showModal();
  hydrate();
}

function infoHtml(o, s) {
  const max = Math.max(1, ...Object.values(s.gruende));
  const zeile = (b) => {
    const zuk = b.datum > Date.now() && b.ergebnis === 'geplant', fehlt = !zuk && b.ergebnis === 'geplant';
    const gf = b.ergebnis === 'absage' ? `<b class="vm-bg">${esc(b.grund || 'Grund fehlt')}</b>` : '';
    const leer = zuk ? '<span class="vm-mut">Termin steht</span>' : fehlt ? '<span class="vm-warn">Ergebnis fehlt noch</span>' : '<span class="vm-mut">–</span>';
    return `<tr class="${b.ergebnis === 'absage' ? 'abs' : zuk ? 'zuk' : ''}">
      <td class="d"><b>${tag(b.datum)}</b><small>${uhr(b.datum)} Uhr</small></td>
      <td class="n">${b.wer ? `<b>${esc(b.wer)}</b>` : '<span class="vm-mut">ohne Name</span>'}<small>von ${esc(vorname(b.n))}${b.von2 && b.von2 !== b.n ? ' · Ergebnis ' + esc(vorname(b.von2)) : ''}</small></td>
      <td class="e"><span class="vm-erg" style="--c:${ERG[b.ergebnis]?.c}">${esc(ERG[b.ergebnis]?.l ?? b.ergebnis)}</span></td>
      <td class="g">${gf}${b.fb ? `<p>${esc(b.fb)}</p>` : gf ? '' : leer}</td>
      <td class="a"><button class="btn ${zuk || fehlt ? 'fill' : 'ghost'} sm" data-erg="${esc(b.id)}">${zuk || fehlt ? 'Ergebnis' : 'Ändern'}</button></td></tr>`;
  };
  const md = s.md, abgesagt = s.kontakte.filter((k) => k.stand === 'absage');

  const blick = `<section class="panel vm-sec vm-blick"><div class="ph"><h2>Auf einen Blick</h2></div>
    <div class="vm-mini">
      <div><small>Besichtigungen</small><b>${s.gemacht.length}</b>${s.geplant.length ? `<em>+ ${s.geplant.length} geplant</em>` : ''}</div>
      <div><small>Interessenten</small><b>${s.aktiv.length}</b>${s.zusagen ? `<em class="ok-t">${s.zusagen} ${s.zusagen === 1 ? 'Zusage' : 'Zusagen'}</em>` : ''}</div>
      <div><small>Unterlagen komplett</small><b class="${s.komplett ? 'ok-t' : ''}">${s.komplett}</b>${s.geprueft ? `<em class="ok-t">${s.geprueft} geprüft</em>` : s.mitDoks > s.komplett ? `<em>${s.mitDoks - s.komplett} teilweise</em>` : ''}</div>
      <div><small>Absagen</small><b class="${s.absagen.length ? 'krit-t' : ''}">${s.absagen.length}</b></div>
    </div>
    ${s.naechste ? `<p class="vm-next">Nächster Termin: <b>${tag(s.naechste.datum)}, ${uhr(s.naechste.datum)} Uhr</b>${s.naechste.wer ? ` · ${esc(s.naechste.wer)}` : ''}</p>` : ''}
    ${s.offen.length ? `<p class="vm-hinw">Bei ${s.offen.length} vergangenen Termin${s.offen.length > 1 ? 'en' : ''} fehlt noch das Ergebnis.</p>` : ''}
    ${s.absagen.length ? `<div class="vm-gruende"><h3 class="sub-h">Absagegründe</h3>${Object.entries(s.gruende).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<div class="vm-g"><span>${esc(g)}</span><i style="width:${Math.round((n / max) * 100)}%"></i><b>${n}</b></div>`).join('')}
      <ul class="vm-abl">${s.absagen.slice(0, 4).map((a) => `<li><b>${esc(a.grund)}</b>${a.wer ? ` – ${esc(a.wer)}` : ''} <small>${dt(a.at)}</small></li>`).join('')}</ul></div>` : ''}
  </section>`;

  const kontakte = `<section class="panel vm-sec"><div class="ph"><h2>Interessenten${s.aktiv.length ? ` <small class="vm-anz">${s.aktiv.length}</small>` : ''}</h2><button class="btn fill sm" data-act="kontakt">+ Interessent</button></div>
    ${s.kontakte.length ? `<table class="vm-btab vm-ktab"><thead><tr><th>Name</th><th>Stand</th><th>Unterlagen</th><th>Letzte Besichtigung</th><th><span class="sr">Öffnen</span></th></tr></thead>
      <tbody>${[...s.aktiv, ...abgesagt].map((k) => kZeile(k, s)).join('')}</tbody></table><p class="hint vm-tipp">Zeile antippen: Kontakt, Unterlagen-Checkliste und Besichtigungen der Person.</p>`
      : '<p class="hint">Noch keine Interessenten. Mit „+ Interessent“ anlegen – oder einfach eine Besichtigung mit Namen eintragen, dann wird der Interessent automatisch angelegt.</p>'}</section>`;

  const besichtigungen = `<section class="panel vm-sec"><div class="ph"><h2>Besichtigungen${s.bes.length ? ` <small class="vm-anz">${s.bes.length}</small>` : ''}</h2><button class="btn fill sm" data-act="besichtigung">+ Besichtigung</button></div>
    ${s.bes.length ? `<table class="vm-btab"><thead><tr><th>Datum</th><th>Name</th><th>Ergebnis</th><th>Absagegrund / Feedback</th><th><span class="sr">Aktion</span></th></tr></thead>
      <tbody>${[...s.bes].reverse().map(zeile).join('')}</tbody></table>` : '<p class="hint">Noch keine Besichtigungen. Mit „+ Besichtigung“ Datum, Name, Ergebnis und Feedback bzw. Absagegrund eintragen.</p>'}</section>`;

  const anzeigen = s.anz.length ? `<section class="panel vm-sec"><div class="ph"><h2>Anzeigen <small class="vm-anz">${s.anz.length}</small></h2><button class="btn ghost sm" data-act="anzeige">+ Anzeige-Link</button></div>
    <ul class="vm-links">${s.anz.map((a) => { const u = sicherUrl(a.url); return `<li><span class="chip2" style="--c:var(--gold)">${esc(a.portal || portalOf(a.url))}</span>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(a.text || u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))}</a>` : esc(a.url)}<small>seit ${dt(a.at)} · ${esc(a.n)}</small><button class="vm-x" data-weg="${esc(a.id)}" aria-label="Anzeige entfernen" title="Anzeige ist offline – entfernen">×</button></li>`; }).join('')}</ul></section>` : '';

  const mietdaten = md || s.st === 'reserviert' || s.st === 'vermietet' ? `<section class="panel vm-sec"><div class="ph"><h2>Mietdaten</h2><button class="btn ghost sm" data-act="mietdaten">${md ? 'Aktualisieren' : '+ Mietdaten'}</button></div>
    ${md ? `<dl class="kz vm-kz">${[['Mieter', md.mieter], ['Kontakt', md.kontakt], ['Personen', md.personen ? num(md.personen) : ''], ['Mietbeginn', md.beginn ? dt(md.beginn) : ''], ['Kaltmiete', md.kaltmiete != null ? eur(md.kaltmiete) : ''], ['Nebenkosten', md.nk != null ? eur(md.nk) : ''], ['Warmmiete', md.kaltmiete != null && md.nk != null ? eur(Number(md.kaltmiete) + Number(md.nk)) : ''], ['Kaution', md.kaution != null ? eur(md.kaution) : '']].filter(([, w]) => w).map(([l, w]) => `<div><dt>${l}</dt><dd>${esc(w)}</dd></div>`).join('')}</dl>
      ${md.text ? `<p class="vm-md-t">${esc(md.text)}</p>` : ''}${md.dateien?.length ? `<div class="vm-files">${md.dateien.map(fileBtn).join('')}</div>` : ''}<p class="hint">Übermittelt von ${esc(md.n)} · ${dtm(md.at)}</p>`
      : '<p class="hint">Steht der Mieter fest? Beim Interessenten „Als Mieter übernehmen“ – Name, Kontakt und Unterlagen werden übernommen.</p>'}</section>` : '';

  const leer = !o.beschreibung && !o.ausstattung && !o.hinweis;
  const objekt = `<details class="panel vm-sec vm-det" data-det="objekt"${auf('objekt')}><summary><h2>Objektbeschreibung &amp; Hinweise</h2></summary>
    <div class="vm-od">${o.hinweis ? `<p class="note">${esc(o.hinweis)}</p>` : ''}${o.beschreibung ? `<p>${esc(o.beschreibung)}</p>` : ''}${o.ausstattung ? `<p class="vm-aus">${o.ausstattung.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}
    ${leer ? '<p class="hint">Beschreibung, Ausstattung und interne Hinweise (Schlüssel, Ansprechpartner) unter „Verwaltung → Objekte“ ergänzen.</p>' : ''}</div></details>`;

  const mietdatenOben = md && (s.st === 'reserviert' || s.st === 'vermietet');
  return [blick, mietdatenOben ? mietdaten : '', kontakte, besichtigungen, anzeigen, mietdatenOben ? '' : mietdaten, objekt].join('');
}

/* ---------- Objekt: Verlauf (Live-Chat) ---------- */
const kName = (tid, kid) => evOf(tid).filter((x) => x.typ === 'kontakt' && x.kid === kid).at(-1)?.name;
function eintrag(e) {
  const wer = mine(e) ? 'Sie' : e.n, rolle = e.rolle && !mine(e) ? ` <em class="rolle">${esc(e.rolle)}</em>` : '';
  const sys = (txt) => `<li class="sys vm-sys"><span>${txt}</span> <small>${esc(wer)} · ${dtm(e.at)}</small></li>`;
  const namen = () => namenText((e.kids ?? []).map((k) => kName(e.tid, k)).filter(Boolean));
  if (e.typ === 'status') return sys(`Status: <b style="color:${STATUS[e.status]?.c}">${esc(STATUS[e.status]?.l ?? e.status)}</b>${e.text ? ' – ' + esc(e.text) : ''}`);
  if (e.typ === 'anzeige') return sys(`Anzeige hinzugefügt: <b>${esc(e.portal || portalOf(e.url))}</b>`);
  if (e.typ === 'anzeige_weg') return sys('Anzeige entfernt');
  const weg = (id) => evOf(e.tid).some((x) => x.typ === 'besichtigung_weg' && x.ref === id);
  if (e.typ === 'besichtigung') return weg(e.id) ? '' : sys(`Besichtigung ${esc(tag(e.datum))}, ${uhr(e.datum)} Uhr eingetragen${e.name && !e.kids?.length ? ' · ' + esc(e.name) : namen()} – <b style="color:${ERG[e.ergebnis]?.c}">${esc(ERG[e.ergebnis]?.l ?? '')}</b>${e.grund ? ' (' + esc(e.grund) + ')' : ''}`);
  if (e.typ === 'ergebnis') { if (weg(e.ref)) return ''; const b = evOf(e.tid).find((x) => x.id === e.ref); return sys(`Ergebnis${b ? ` Besichtigung ${esc(tag(b.datum))}` : ''}${e.name ? ' · ' + esc(e.name) : ''}: <b style="color:${ERG[e.ergebnis]?.c}">${esc(ERG[e.ergebnis]?.l ?? '')}</b>${e.grund ? ' (' + esc(e.grund) + ')' : ''}`); }
  if (e.typ === 'besichtigung_weg') { const b = evOf(e.tid).find((x) => x.id === e.ref); return sys(`Besichtigung${b ? ` vom ${esc(tag(b.datum))}` : ''} gelöscht`); }
  if (e.typ === 'mietdaten') return sys(`Mietdaten übermittelt${e.mieter ? ': <b>' + esc(e.mieter) + '</b>' : ''}${e.dateien?.length ? ` · ${e.dateien.length} Unterlage${e.dateien.length > 1 ? 'n' : ''}` : ''}`);
  if (e.typ === 'kontakt') {
    const ohneMv = (l) => (l ?? []).filter((f) => f.k !== 'mietvertrag').length, alt = evOf(e.tid).filter((x) => x.typ === 'kontakt' && x.kid === e.kid && x.rid < e.rid).at(-1), nd = ohneMv(e.dateien) - ohneMv(alt?.dateien), ks = KSTAND[e.stand];
    const t = [];
    if (!alt) t.push(`Interessent angelegt: <b>${esc(e.name)}</b>`);
    if (nd > 0) t.push(`${alt ? `<b>${esc(e.name)}</b>: ` : ''}${nd} Unterlage${nd > 1 ? 'n' : ''} hochgeladen`);
    if (alt && alt.stand !== e.stand && ks) t.push(`${nd > 0 ? '' : `<b>${esc(e.name)}</b>: `}<b style="color:${ks.c}">${esc(ks.l)}</b>${e.stand === 'absage' && e.grund ? ' (' + esc(e.grund) + ')' : ''}`);
    if (alt) {
      const pr = Object.keys(e.geprueft ?? {}).filter((x) => !alt.geprueft?.[x]), zur = Object.keys(alt.geprueft ?? {}).filter((x) => !e.geprueft?.[x] && nd <= 0);
      if (pr.length) t.push(`<b>${esc(e.name)}</b>: ${pr.map((x) => esc(DOK_L[x] ?? x)).join(', ')} <b style="color:var(--gut)">geprüft ✓</b>`);
      if (zur.length) t.push(`<b>${esc(e.name)}</b>: Prüfung zurückgenommen (${zur.map((x) => esc(DOK_L[x] ?? x)).join(', ')})`);
    }
    if (!t.length && alt && JSON.stringify(alt.vertrag ?? null) !== JSON.stringify(e.vertrag ?? null)) t.push(`Vertragsdaten für <b>${esc(e.name)}</b> gespeichert`);
    if (!t.length && alt && ohneMv(alt.dateien) === ohneMv(e.dateien) && (alt.dateien?.length ?? 0) !== (e.dateien?.length ?? 0)) return '';
    return sys(t.join(' · ') || `Interessent <b>${esc(e.name)}</b> aktualisiert`);
  }
  if (e.typ === 'vertrag') return sys(`Mietvertrag erstellt${e.name ? ' für <b>' + esc(e.name) + '</b>' : ''}${e.fehlt ? ` <small>(Entwurf – ${e.fehlt} Angaben offen)</small>` : ''}`);
  if (e.typ === 'kontakt_weg') { const n = kName(e.tid, e.ref); return sys(`Interessent entfernt${n ? ': <b>' + esc(n) + '</b>' : ''}`); }
  if (e.typ !== 'chat') return '';
  return `<li class="bub ${mine(e) ? 'me' : 'h'}" style="--c:${mine(e) ? 'var(--rand)' : 'var(--gold)'}"><div class="bh"><b>${esc(wer)}</b>${rolle}<small>${dtm(e.at)}</small></div>${e.text ? `<p>${esc(e.text)}</p>` : ''}${dateienHtml(e.dateien)}</li>`;
}
const feedHtml = (s) => (s.ev.length ? s.ev.map(eintrag).join('') : '<li class="empty">Noch keine Nachrichten. Schreiben Sie die erste – Ihr Gegenüber sieht sie sofort.</li>');

const PLUS = [['besichtigung', 'Besichtigung', 'Termin oder Ergebnis eintragen'], ['kontakt', 'Interessent', 'Name, Telefon, E-Mail anlegen'], ['unterlagen', 'Unterlagen hochladen', 'Selbstauskunft, Einkommen, Schufa …'],
  ['anzeige', 'Anzeige-Link', 'ImmoScout24, Kleinanzeigen …'], ['mietdaten', 'Mietdaten', 'Wenn der Mieter feststeht']];
function menuZu() { app.querySelectorAll('.dropdown.offen').forEach((d) => { d.classList.remove('offen'); d.querySelector('[data-menu]')?.setAttribute('aria-expanded', 'false'); }); }
document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown')) menuZu(); });
document.addEventListener('keydown', (e) => {
  const dd = document.querySelector('.dropdown.offen'); if (!dd) return;
  const items = [...dd.querySelectorAll('[role=menuitem]')], i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { menuZu(); dd.querySelector('[data-menu]')?.focus(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
});

function renderObjekt() {
  const o = objOf(ctx.oid), s = stand(o.id), tid = tidOf(o.id), u = unread(tid);
  app.innerHTML = `${header(o.titel)}<main class="wrap hw-main vm-obj" data-seg="${ctx.seg}">
    <button class="linkbtn back" id="back">← Alle Objekte</button>
    <nav class="vm-seg" aria-label="Bereich"><button data-seg="objekt" aria-pressed="${ctx.seg === 'objekt'}">Übersicht</button><button data-seg="chat" aria-pressed="${ctx.seg === 'chat'}">Chat${u ? ` <span class="vm-u">${u}</span>` : ''}</button></nav>
    <section class="panel vm-top"><div class="vm-hero">${bild(o)}</div>
      <div class="vm-top-b"><span class="eyebrow">${esc(o.typ || 'Mietobjekt')}</span><h2 class="big">${esc(o.titel)}</h2><p class="hint">${esc([o.lage, o.ort].filter(Boolean).join(' · '))}</p>
        <label class="vm-stsel"><span>Status</span><select id="stSel" aria-label="Status ändern">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${s.st === k ? ' selected' : ''}>${v.l}</option>`).join('')}</select></label>
        <div class="vm-fakten">${[['Kaltmiete', eur(o.kaltmiete), 'p'], ['Nebenkosten', hat(o.nk) ? eur(o.nk) : ''], ['Warmmiete', hat(o.nk) ? eur(warm(o)) : ''], ['Kaution', o.kaution ? eur(o.kaution) : ''], ['Wohnfläche', o.flaeche ? num(o.flaeche, 1) + ' m²' : ''], ['Zimmer', o.zimmer ? num(o.zimmer, 1) : ''], ['Frei ab', o.frei ? dt(Date.parse(o.frei)) : '']].filter(([, w, c]) => c || w).map(([l, w, c]) => `<div class="${c === 'p' ? 'price' : ''}"><small>${l}</small><b>${w}</b></div>`).join('')}</div>
        <div class="acts vm-acts"><div class="dropdown links"><button type="button" class="btn fill sm" data-menu aria-haspopup="menu" aria-expanded="false">+ Hinzufügen</button>
          <div class="dd-menu" role="menu" aria-label="Hinzufügen">${PLUS.map(([a, l, h]) => `<button type="button" role="menuitem" data-act="${a}"><b>${l}</b><small>${h}</small></button>`).join('')}</div></div></div></div></section>
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
  app.querySelector('.vm-obj').addEventListener('change', dateiGewaehlt);
  app.querySelector('.vm-obj').addEventListener('keydown', (e) => { const r = e.target.closest?.('[data-kopen]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); kontaktOeffnen(r.dataset.kopen); } });
  // Auf-/Zuklappen merken, damit es bei neuen Einträgen nicht zurückspringt
  document.getElementById('info').addEventListener('toggle', (e) => { const k = e.target.dataset?.det; if (k) (ctx.auf ??= {})[k] = e.target.open; }, true);
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
  const kd = document.getElementById('kdet'); if (kd?.open && !document.getElementById('sheet')?.open) kontaktOeffnen(kd.dataset.kid);
  const sel = document.getElementById('stSel'); if (sel) { sel.value = s.st; sel.disabled = false; }
  hydrate();
  if (unten || eigene) zumEnde(true); else document.getElementById('neuNach')?.classList.remove('hidden');
  if (document.visibilityState === 'visible') markSeen(tidOf(o.id));
  titelZahl();
}

async function klick(e) {
  const m = e.target.closest('[data-menu]');
  if (m) { const dd = m.closest('.dropdown'), zu = dd.classList.contains('offen'); menuZu(); if (!zu) { dd.classList.add('offen'); m.setAttribute('aria-expanded', 'true'); dd.querySelector('[role=menuitem]')?.focus(); } return; }
  const b = e.target.closest('[data-act],[data-erg],[data-weg],[data-file],[data-k],[data-kup],[data-kbes],[data-kmiet],[data-kpr],[data-kzip],[data-kopen],[data-kvertrag]'); if (!b || b.closest('.vm-seg')) return;
  if (b.dataset.kopen) return kontaktOeffnen(b.dataset.kopen);
  if (b.dataset.kvertrag) { menuZu(); return vertragFormular(objOf(ctx.oid), b.dataset.kvertrag); }
  menuZu();
  const o = objOf(ctx.oid), d = b.dataset;
  if (d.kpr) {
    const k = stand(o.id).kontakte.find((x) => x.kid === d.kpr); if (!k) return;
    const g = { ...(k.geprueft ?? {}) }, war = !!g[d.art];
    if (war) delete g[d.art]; else g[d.art] = { n: ctx.sess.n, at: Date.now() };
    b.disabled = true;
    try { await sendKontakt(o.id, k, { geprueft: g }); toast(war ? 'Prüfung zurückgenommen.' : `${DOK_L[d.art]} als geprüft markiert.`); aktualisieren(true); } catch (x) { toast(x.message, false); b.disabled = false; }
    return;
  }
  if (d.kzip) return zipLaden(o, d.kzip, b);
  if (d.act) return formular(d.act, o);
  if (d.erg) return formular('ergebnis', o, d.erg);
  if (d.k) return formular('kontakt', o, d.k);
  if (d.kup) return formular('unterlagen', o, d.kup);
  if (d.kbes) return formular('besichtigung', o, null, d.kbes);
  if (d.kmiet) return formular('mietdaten', o, null, d.kmiet);
  if (d.weg) { b.disabled = true; try { await send(o.id, { typ: 'anzeige_weg', ref: d.weg }); aktualisieren(true); } catch (x) { toast(x.message, false); b.disabled = false; } return; }
  if (d.file) {
    b.disabled = true;
    try {
      const u = await getFile(ctx.sess.sb, d.file, ctx.sess.threads[tidOf(o.id)].k, d.type);
      if (d.type?.startsWith('image/')) lightbox(u);
      else { const a = document.createElement('a'); a.href = u; a.download = d.name; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); }
    } catch (x) { toast(x.message, false); }
    b.disabled = false;
  }
}
/** „+ Datei“ in der Checkliste: sofort hochladen und dem Punkt zuordnen. */
async function dateiGewaehlt(e) {
  const i = e.target.closest?.('[data-kfile]'); if (!i || !i.files.length) return;
  const o = objOf(ctx.oid), k = stand(o.id).kontakte.find((x) => x.kid === i.dataset.kfile), files = [...i.files], art = i.dataset.art;
  i.value = ''; if (!k) return;
  const lab = i.closest('label'); if (lab) { lab.classList.add('busy'); lab.firstChild.textContent = 'Lädt …'; }
  try { await dokHinzu(o.id, k, files, art); toast(`${files.length > 1 ? files.length + ' Dateien' : 'Datei'} bei „${DOK_L[art]}“ abgelegt.`); }
  catch (x) { toast(x.message, false); }
  aktualisieren(true);
}

/* ---------- Alle Unterlagen eines Interessenten als ZIP (ohne Kompression, Dateien sind schon komprimiert) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zipBlob(dateien) {
  const enc = new TextEncoder(), jetzt = new Date(), teile = [], zentral = []; let off = 0;
  const zeit = (jetzt.getHours() << 11) | (jetzt.getMinutes() << 5) | (jetzt.getSeconds() >> 1), datum = ((jetzt.getFullYear() - 1980) << 9) | ((jetzt.getMonth() + 1) << 5) | jetzt.getDate();
  for (const { name, bytes } of dateien) {
    const n = enc.encode(name), crc = crc32(bytes), h = new DataView(new ArrayBuffer(30)), c = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, zeit, true); h.setUint16(12, datum, true);
    h.setUint32(14, crc, true); h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, n.length, true);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, zeit, true); c.setUint16(14, datum, true);
    c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    teile.push(h, n, bytes); zentral.push(c, n); off += 30 + n.length + bytes.length;
  }
  const groesse = zentral.reduce((a, x) => a + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, dateien.length, true); e.setUint16(10, dateien.length, true); e.setUint32(12, groesse, true); e.setUint32(16, off, true);
  return new Blob([...teile, ...zentral, e], { type: 'application/zip' });
}
const dateiname = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
async function zipLaden(o, kid, btn) {
  const k = stand(o.id).kontakte.find((x) => x.kid === kid); if (!k?.dateien?.length) return;
  const tk = ctx.sess.threads[tidOf(o.id)].k, label = btn.textContent, nr = Object.fromEntries(DOKS.map(([key], i) => [key, String(i + 1).padStart(2, '0')])), schon = new Set(), out = [];
  btn.disabled = true;
  try {
    for (const [i, f] of k.dateien.entries()) {
      btn.textContent = `Lädt ${i + 1}/${k.dateien.length} …`;
      const u = await getFile(ctx.sess.sb, f.p, tk, f.t), bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
      let name = dateiname(`${nr[f.k] ?? '07'} ${DOK_L[f.k] ?? 'Sonstiges'} – ${f.n}`);
      for (let j = 2; schon.has(name.toLowerCase()); j++) name = name.replace(/(\.[^.]+)?$/, (m) => ` (${j})${m}`);
      schon.add(name.toLowerCase()); out.push({ name, bytes });
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(zipBlob(out)); a.download = dateiname(`Unterlagen ${k.name} – ${o.titel}${o.lage ? ' ' + o.lage : ''}`) + '.zip';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(`${out.length} Unterlagen als ZIP geladen.`);
  } catch (x) { toast('ZIP konnte nicht erstellt werden: ' + (x.message || x), false); }
  btn.disabled = false; btn.textContent = label;
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
const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const MAX_DOKS = 60;
/** Felder eines Interessenten – jeder gespeicherte Eintrag enthält den vollständigen Stand. Leere Werte fallen weg. */
const KFELD = ['kid', 'name', 'tel', 'mail', 'personen', 'einzug', 'quelle', 'stand', 'grund', 'text', 'dateien', 'geprueft', 'vname', 'vname2', 'anschrift', 'vertrag'];
function kSnap(k, neu = {}) {
  const x = {};
  for (const f of KFELD) { const v = f in neu ? neu[f] : k?.[f]; if (v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) x[f] = v; }
  if (x.stand !== 'absage') delete x.grund;
  return x;
}
const sendKontakt = (oid, k, neu) => send(oid, { typ: 'kontakt', ...kSnap(k, neu) });
/** Ändern sich die Dateien eines Punkts, gilt er wieder als ungeprüft. */
function pruefAnpassen(k, neu) {
  const x = { ...(k?.geprueft ?? {}) }, ps = (l, key) => (l ?? []).filter((f) => f.k === key).map((f) => f.p).join();
  for (const key of Object.keys(x)) if (ps(k?.dateien, key) !== ps(neu, key)) delete x[key];
  return x;
}
/** Dateien zu einem Interessenten hinzufügen (Checkliste oder Sammel-Upload). */
async function dokHinzu(oid, k, files, art) {
  if ((k.dateien?.length ?? 0) + files.length > MAX_DOKS) throw new Error(`Höchstens ${MAX_DOKS} Unterlagen pro Interessent.`);
  const dateien = [...(k.dateien ?? []), ...await upload(oid, files, art)];
  await sendKontakt(oid, k, { dateien, geprueft: pruefAnpassen(k, dateien), stand: art !== 'mietvertrag' && (k.stand === 'anfrage' || k.stand === 'besichtigung') ? 'unterlagen' : k.stand });
}
/** Interessent zum Namen aus der Besichtigung finden. Gibt es keinen, wird der bisher verknüpfte umbenannt
 *  (z. B. „Frau Linda“ → „Frau Linda Narr“) – nur ohne bisherigen wird ein neuer angelegt. */
async function kontaktFuer(oid, name, ergebnis, grund, bisher = []) {
  const gleich = (x) => x.trim().toLocaleLowerCase('de'), s = stand(oid);
  const k = s.kontakte.find((x) => gleich(x.name) === gleich(name));
  if (k) return k.kid;
  const alt = bisher.length === 1 ? s.kontakte.find((x) => x.kid === bisher[0]) : null;
  if (alt) { await sendKontakt(oid, alt, { name }); return alt.kid; }
  const kid = neueId();
  await sendKontakt(oid, null, { kid, name, stand: ergebnis === 'absage' ? 'absage' : ergebnis === 'zusage' ? 'zusage' : 'besichtigung', grund: ergebnis === 'absage' ? grund : '' });
  return kid;
}
/** Ergebnis einer Besichtigung auf die verknüpften Interessenten übertragen. */
async function kontakteNachziehen(oid, kids, ergebnis, grund) {
  if (!kids?.length) return;
  const s = stand(oid);
  for (const kid of kids) {
    const k = s.kontakte.find((x) => x.kid === kid); if (!k) continue;
    const neu = ergebnis === 'absage' && k.stand !== 'absage' ? { stand: 'absage', grund }
      : ergebnis === 'zusage' && k.stand !== 'zusage' ? { stand: 'zusage' }
        : (ergebnis === 'geplant' || ergebnis === 'interesse') && k.stand === 'anfrage' ? { stand: 'besichtigung' } : null;
    if (neu) await sendKontakt(oid, k, neu);
  }
}

function formular(art, o, ref, kidVorwahl) {
  const d = dlg('sheet', 'sheet'), s = stand(o.id), b = art === 'ergebnis' ? s.bes.find((x) => x.id === ref) : null;
  const k = (art === 'kontakt' || art === 'unterlagen') && ref ? s.kontakte.find((x) => x.kid === ref) : null;
  const mk = art === 'mietdaten' && kidVorwahl ? s.kontakte.find((x) => x.kid === kidVorwahl) : null;
  const md = mk ? { ...(s.md ?? {}), mieter: mk.name, kontakt: [mk.tel, mk.mail].filter(Boolean).join(' · '), personen: mk.personen, beginn: mk.einzug ? Date.parse(mk.einzug) : s.md?.beginn, dateien: mk.dateien ?? [], kid: mk.kid } : (s.md ?? {});
  const jetzt = new Date(); jetzt.setMinutes(Math.round(jetzt.getMinutes() / 15) * 15, 0, 0);
  const opt = (l, v) => l.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
  const ergSel = (v) => `<label class="f"><span>Ergebnis</span><select name="ergebnis" id="ergSel">${Object.entries(ERG).map(([key, x]) => `<option value="${key}"${v === key ? ' selected' : ''}>${x.l}</option>`).join('')}</select></label>
    <label class="f" id="grundF"><span>Absagegrund</span><select name="grund"><option value="">– bitte wählen –</option>${opt(GRUENDE, b?.grund)}</select></label>`;
  const vorK = kidVorwahl ? s.kontakte.find((x) => x.kid === kidVorwahl) : null;
  const nameFeld = (v) => `<label class="f"><span>Name des Interessenten</span><input name="bname" list="kListe" maxlength="120" value="${esc(v || '')}" autocomplete="off" placeholder="z. B. Frau Müller"><datalist id="kListe">${s.kontakte.map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist></label>`;
  const fbFeld = (v) => `<label class="f wide"><span>Feedback / Rückmeldung</span><textarea name="feedback" rows="3" maxlength="1500" placeholder="z. B. Wohnung gefällt, Küche etwas klein, schickt Unterlagen bis Freitag">${esc(v || '')}</textarea></label>`;
  const dokFelder = (pflicht) => `<label class="f"><span>Art der Unterlagen</span><select name="art"><option value="auto">Automatisch (nach Dateiname)</option>${DOKS.map(([key, l]) => `<option value="${key}">${l}</option>`).join('')}</select></label>
    <label class="f"><span>${pflicht ? 'Dateien (PDF oder Foto)' : 'Unterlagen hinzufügen (optional)'}</span><input name="files" type="file" accept="application/pdf,image/*" multiple${pflicht ? ' required' : ''}></label>
    <ul class="vm-vor wide hidden" id="vor" aria-live="polite"></ul>`;
  const quellen = [...new Set([...s.anz.map((a) => a.portal || portalOf(a.url)), ...QUELLEN])];
  const F = {
    besichtigung: ['Besichtigung eintragen', `<label class="f"><span>Datum und Uhrzeit</span><input name="datum" type="datetime-local" step="60" required value="${lokal(jetzt.getTime())}"></label>
      ${nameFeld(vorK?.name)}
      ${ergSel('geplant')}
      ${fbFeld('')}
      <p class="hint wide">Pro Interessent eine Besichtigung eintragen. Neue Namen werden automatisch als Interessent angelegt – dort sammelt ihr die Unterlagen.</p>`],
    ergebnis: [b?.ergebnis === 'geplant' ? 'Ergebnis eintragen' : 'Besichtigung bearbeiten', `<p class="hint wide">Besichtigung am <b>${b ? `${tag(b.datum)}, ${uhr(b.datum)} Uhr` : ''}</b></p>
      ${nameFeld(b?.wer)}
      ${ergSel(b?.ergebnis === 'geplant' ? 'interesse' : b?.ergebnis)}
      ${fbFeld(b?.fb)}
      <p class="wide"><button type="button" class="linkbtn vm-del" data-a="bdel">Besichtigung löschen</button></p>`],
    kontakt: [k ? 'Interessent bearbeiten' : 'Interessent anlegen', `<label class="f"><span>Name</span><input name="kname" required maxlength="120" value="${esc(k?.name || '')}" autocomplete="off" placeholder="z. B. Anna Müller"></label>
      <label class="f"><span>Telefon</span><input name="tel" type="tel" maxlength="40" value="${esc(k?.tel || '')}" autocomplete="off"></label>
      <label class="f"><span>E-Mail</span><input name="mail" type="email" maxlength="160" value="${esc(k?.mail || '')}" autocomplete="off"></label>
      <label class="f"><span>Personen im Haushalt</span><input name="personen" type="number" min="1" max="20" value="${esc(k?.personen ?? '')}"></label>
      <label class="f"><span>Einzug ab</span><input name="einzug" type="date" value="${esc(k?.einzug || '')}"></label>
      <label class="f"><span>Gefunden über</span><select name="quelle"><option value="">–</option>${opt(quellen, k?.quelle)}</select></label>
      <label class="f"><span>Stand</span><select name="stand" id="kStand">${Object.entries(KSTAND).map(([key, x]) => `<option value="${key}"${(k?.stand ?? 'anfrage') === key ? ' selected' : ''}>${x.l}</option>`).join('')}</select></label>
      <label class="f" id="kGrundF"><span>Absagegrund</span><select name="grund"><option value="">– bitte wählen –</option>${opt(GRUENDE, k?.grund)}</select></label>
      <label class="f wide"><span>Notiz (Beruf, Haustiere, Eindruck …)</span><textarea name="text" rows="2" maxlength="1500">${esc(k?.text || '')}</textarea></label>
      <h3 class="sub-h wide vm-fh">Für den Mietvertrag</h3>
      <label class="f"><span>Name im Vertrag (Name, Vorname)</span><input name="vname" maxlength="120" value="${esc(k?.vname || '')}" placeholder="${esc(vertragsname(k?.name) || 'Müller, Anna')}" autocomplete="off"></label>
      <label class="f"><span>2. Mieter (Name, Vorname) – optional</span><input name="vname2" maxlength="120" value="${esc(k?.vname2 || '')}" autocomplete="off"></label>
      <label class="f wide"><span>Bisherige Anschrift</span><input name="anschrift" maxlength="200" value="${esc(k?.anschrift || '')}" placeholder="Straße Nr., PLZ Ort" autocomplete="off"></label>
      ${dokFelder(false)}
      ${k?.dateien?.length ? `<fieldset class="f wide vm-chk vm-keep"><legend>Vorhandene Unterlagen – Haken entfernen zum Löschen</legend>${k.dateien.map((f, i) => `<label><input type="checkbox" name="keep" value="${i}" checked> ${esc(f.n)} <small>${esc(DOK_L[f.k] ?? '')}</small></label>`).join('')}</fieldset>` : ''}
      ${k ? '<p class="wide"><button type="button" class="linkbtn vm-del" data-a="kdel">Interessent entfernen</button></p>' : ''}`],
    unterlagen: ['Unterlagen hochladen', `<label class="f"><span>Interessent</span><select name="kid" id="uKid">${s.kontakte.map((x) => `<option value="${esc(x.kid)}"${x.kid === ref ? ' selected' : ''}>${esc(x.name)}${x.stand === 'absage' ? ' (abgesagt)' : ''}</option>`).join('')}<option value="">+ Neuer Interessent …</option></select></label>
      <label class="f" id="uNeu"><span>Name des neuen Interessenten</span><input name="neuname" maxlength="120" autocomplete="off"></label>
      ${dokFelder(true)}
      <p class="hint wide">Mehrere Dateien auf einmal: Die Art wird am Dateinamen erkannt (z. B. „Schufa.pdf“, „Gehaltsnachweis_Oktober.pdf“) – die Vorschau zeigt die Zuordnung. Passt etwas nicht, oben die Art wählen. Einzelne Punkte gehen auch direkt in der Checkliste mit „+ Datei“.</p>`],
    mietdaten: ['Mietdaten übermitteln', `${mk ? `<p class="hint wide">Übernommen von Interessent <b>${esc(mk.name)}</b>${mk.dateien?.length ? ` – mit ${mk.dateien.length} Unterlage${mk.dateien.length > 1 ? 'n' : ''}` : ''}. Bitte Miete und Beginn prüfen.</p>` : ''}
      <label class="f"><span>Mieter (Name)</span><input name="mieter" maxlength="120" value="${esc(md.mieter || '')}"></label>
      <label class="f"><span>Kontakt (Telefon / E-Mail)</span><input name="kontakt" maxlength="160" value="${esc(md.kontakt || '')}"></label>
      <label class="f"><span>Personen im Haushalt</span><input name="personen" type="number" min="0" max="20" value="${esc(md.personen ?? '')}"></label>
      <label class="f"><span>Mietbeginn</span><input name="beginn" type="date" value="${md.beginn ? new Date(md.beginn).toISOString().slice(0, 10) : ''}"></label>
      <label class="f"><span>Kaltmiete (€)</span><input name="kaltmiete" inputmode="decimal" value="${esc(md.kaltmiete ?? o.kaltmiete ?? '')}"></label>
      <label class="f"><span>Nebenkosten (€)</span><input name="nk" inputmode="decimal" value="${esc(md.nk ?? o.nk ?? '')}"></label>
      <label class="f"><span>Kaution (€)</span><input name="kaution" inputmode="decimal" value="${esc(md.kaution ?? o.kaution ?? '')}"></label>
      <label class="f wide"><span>Notiz (z. B. Staffelmiete, Haustiere, Besonderheiten)</span><textarea name="text" rows="3" maxlength="2000">${esc(md.text || '')}</textarea></label>
      <label class="f wide"><span>Weitere Unterlagen (Mietvertrag, Übergabeprotokoll … – PDF oder Foto)</span><input name="files" type="file" accept="application/pdf,image/*" multiple></label>
      ${md.dateien?.length ? `<p class="hint wide">Bereits dabei: ${md.dateien.map((f) => esc(f.n)).join(', ')} – bleiben erhalten.</p>` : ''}`],
    anzeige: ['Anzeige-Link hinzufügen', `<label class="f wide"><span>Link zur Anzeige</span><input name="url" type="url" required placeholder="https://www.immobilienscout24.de/expose/…" maxlength="600"></label>
      <label class="f wide"><span>Bezeichnung (optional)</span><input name="text" maxlength="120" placeholder="z. B. ImmoScout24 – Premium bis 30.11."></label>`],
  }[art];
  d.innerHTML = `<form class="panel form" id="vmForm" novalidate><div class="sh-h"><h2>${F[0]}</h2><button type="button" class="btn ghost sm" data-a="close">Abbrechen</button></div><div class="grid">${F[1]}</div>
    <p class="lg-err hidden" id="vmErr" role="alert"></p><div class="acts sticky-save"><button class="btn fill">${art === 'unterlagen' ? 'Hochladen' : 'Speichern'}</button></div></form>`;
  const form = d.querySelector('#vmForm');
  // Absagegrund nur bei Absage zeigen
  const zeig = (sel, feld, wert) => { const a = d.querySelector(sel), g = d.querySelector(feld); if (!a || !g) return; const f = () => { g.hidden = a.value !== wert; }; a.addEventListener('change', f); f(); };
  form.kname?.addEventListener('input', () => { if (form.vname) form.vname.placeholder = vertragsname(form.kname.value) || 'Müller, Anna'; });
  zeig('#ergSel', '#grundF', 'absage'); zeig('#kStand', '#kGrundF', 'absage'); zeig('#uKid', '#uNeu', '');
  // Vorschau: welche Datei als welche Unterlage abgelegt wird
  const vor = d.querySelector('#vor');
  const vorschau = () => { const l = [...(form.files?.files ?? [])]; vor.classList.toggle('hidden', !l.length); vor.innerHTML = l.map((f) => `<li><span>${esc(f.name)}</span><b>${esc(DOK_L[form.art.value === 'auto' ? dokArt(f.name) : form.art.value])}</b></li>`).join(''); };
  if (vor) { form.files.addEventListener('change', vorschau); form.art.addEventListener('change', vorschau); }
  d.onclick = async (e) => {
    if (e.target.closest('[data-a=close]')) d.close();
    if (e.target.closest('[data-a=kdel]') && k && await confirmBox({ title: `${k.name} entfernen?`, text: 'Der Interessent verschwindet aus der Liste. Im Chat-Verlauf bleibt vermerkt, dass er entfernt wurde.', ok: 'Entfernen', danger: true })) {
      try { await send(o.id, { typ: 'kontakt_weg', ref: k.kid }); d.close(); toast('Interessent entfernt.'); aktualisieren(true); } catch (x) { toast(x.message, false); }
    }
    if (e.target.closest('[data-a=bdel]') && b && await confirmBox({ title: 'Besichtigung löschen?', text: `Die Besichtigung vom ${tag(b.datum)}${b.wer ? ` (${b.wer})` : ''} verschwindet aus der Liste und aus der Auswertung. Der Interessent selbst bleibt erhalten.`, ok: 'Löschen', danger: true })) {
      try { await send(o.id, { typ: 'besichtigung_weg', ref: b.id }); d.close(); toast('Besichtigung gelöscht.'); aktualisieren(true); } catch (x) { toast(x.message, false); }
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('.sticky-save .btn'), err = f.querySelector('#vmErr'), label = btn.textContent;
    const fehler = (t) => { err.textContent = t; err.classList.remove('hidden'); btn.disabled = false; btn.textContent = label; };
    btn.disabled = true; btn.textContent = 'Wird gespeichert …'; err.classList.add('hidden');
    try {
      const text = f.text?.value.trim() || undefined;
      if (art === 'besichtigung' || art === 'ergebnis') {
        const ergebnis = f.ergebnis.value, grund = ergebnis === 'absage' ? f.grund.value : '';
        if (ergebnis === 'absage' && !grund) return fehler('Bitte einen Absagegrund wählen.');
        const name = f.bname.value.trim(), feedback = f.feedback.value.trim(), datum = art === 'besichtigung' ? new Date(f.datum.value).getTime() : b?.datum;
        if (!Number.isFinite(datum)) return fehler('Bitte Datum und Uhrzeit angeben.');
        const kid = name ? await kontaktFuer(o.id, name, ergebnis, grund, art === 'ergebnis' ? b?.kids ?? [] : []) : '', kids = kid ? [kid] : [];
        if (art === 'besichtigung') await send(o.id, { typ: 'besichtigung', datum, anzahl: 1, ergebnis, grund: grund || undefined, name, feedback, kids: kids.length ? kids : undefined });
        else await send(o.id, { typ: 'ergebnis', ref, ergebnis, grund: grund || undefined, name, feedback, kids });
        await kontakteNachziehen(o.id, kids, ergebnis, grund);
      } else if (art === 'kontakt') {
        const name = f.kname.value.trim(), mail = f.mail.value.trim(), st = f.stand.value, grund = st === 'absage' ? f.grund.value : '';
        if (!name) return fehler('Bitte den Namen eingeben.');
        if (mail && !mailOk(mail)) return fehler('Die E-Mail-Adresse sieht nicht vollständig aus.');
        if (st === 'absage' && !grund) return fehler('Bitte einen Absagegrund wählen.');
        const keep = k ? [...f.querySelectorAll('[name=keep]:checked')].map((x) => k.dateien[Number(x.value)]).filter(Boolean) : [], neu = [...f.files.files];
        if (keep.length + neu.length > MAX_DOKS) return fehler(`Höchstens ${MAX_DOKS} Unterlagen pro Interessent.`);
        const dateien = [...keep, ...(neu.length ? await upload(o.id, neu, f.art.value) : [])];
        // Neue Unterlagen bei Anfrage/Besichtigung → „Unterlagen da“, sofern der Stand nicht bewusst geändert wurde
        const stNeu = neu.length && st === (k?.stand ?? 'anfrage') && (st === 'anfrage' || st === 'besichtigung') ? 'unterlagen' : st;
        await sendKontakt(o.id, k, { kid: k?.kid ?? neueId(), name, tel: f.tel.value.trim(), mail, personen: f.personen.value ? Number(f.personen.value) : '', einzug: f.einzug.value, quelle: f.quelle.value, stand: stNeu, grund, text: text ?? '', dateien, geprueft: pruefAnpassen(k, dateien), vname: f.vname.value.trim(), vname2: f.vname2.value.trim(), anschrift: f.anschrift.value.trim() });
      } else if (art === 'unterlagen') {
        const neu = [...f.files.files];
        if (!neu.length) return fehler('Bitte mindestens eine Datei auswählen.');
        let kk = s.kontakte.find((x) => x.kid === f.kid.value);
        if (!kk) { const name = f.neuname.value.trim(); if (!name) return fehler('Bitte den Namen des Interessenten eingeben.'); kk = { kid: neueId(), name, stand: 'anfrage' }; }
        await dokHinzu(o.id, kk, neu, f.art.value);
      } else if (art === 'mietdaten') {
        const w = {}; for (const key of ['kaltmiete', 'nk', 'kaution']) { w[key] = zahl(f[key].value); if (Number.isNaN(w[key])) return fehler('Bitte Beträge als Zahl eingeben, z. B. 650 oder 1.250,50.'); }
        const neu = [...f.files.files], dateien = [...(md.dateien ?? []), ...(neu.length ? await upload(o.id, neu) : [])];
        await send(o.id, { typ: 'mietdaten', mieter: f.mieter.value.trim(), kontakt: f.kontakt.value.trim(), personen: f.personen.value ? Number(f.personen.value) : undefined, beginn: f.beginn.value ? Date.parse(f.beginn.value) : undefined, ...w, text, dateien: dateien.length ? dateien : undefined, kid: md.kid || undefined });
        if (mk && mk.stand !== 'zusage') await sendKontakt(o.id, mk, { stand: 'zusage' });
      } else if (art === 'anzeige') {
        const url = sicherUrl(f.url.value.trim()); if (!url) return fehler('Bitte einen gültigen Link mit https:// eingeben.');
        await send(o.id, { typ: 'anzeige', url, portal: portalOf(url), text });
      }
      d.close(); toast(art === 'unterlagen' ? 'Unterlagen hochgeladen.' : 'Gespeichert.'); aktualisieren(true);
    } catch (x) { fehler(x.message || String(x)); }
  };
  d.showModal();
  d.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea')?.focus();
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

/* ---------- Mietvertrag erstellen (Daten aus Objekt + Interessent, fehlende Angaben ergänzen, PDF herunterladen) ---------- */
function vertragFormular(o, kid) {
  const s = stand(o.id), k = s.kontakte.find((x) => x.kid === kid); if (!k) return;
  const d0 = vertragsdaten(o, k, ctx.obj), dlgEl = dlg('sheet', 'sheet');
  const inp = (n, l, o2 = {}) => `<label class="f${o2.wide ? ' wide' : ''}"><span>${l}</span><input name="${n}" value="${esc(d0[n] ?? '')}"${o2.type ? ` type="${o2.type}"` : ''}${o2.mode ? ` inputmode="${o2.mode}"` : ''} maxlength="${o2.max ?? 200}" placeholder="${esc(o2.ph ?? '')}" autocomplete="off"></label>`;
  const sel = (n, l, liste) => `<label class="f"><span>${l}</span><select name="${n}">${liste.map(([v, t]) => `<option value="${esc(v)}"${String(d0[n] ?? '') === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const kopf = (t) => `<h3 class="sub-h wide vm-fh">${t}</h3>`;
  dlgEl.innerHTML = `<form class="panel form" id="vtForm" novalidate><div class="sh-h"><div><span class="eyebrow">${esc(o.titel)}${o.lage ? ' · ' + esc(o.lage) : ''}</span><h2>Mietvertrag für ${esc(k.name)}</h2></div><button type="button" class="btn ghost sm" data-a="close">Abbrechen</button></div>
    <div class="vm-fehlt wide" id="vtFehlt" aria-live="polite"></div>
    <div class="grid">
      ${kopf('Mieter')}
      ${inp('vname', 'Name, Vorname', { ph: 'Müller, Anna' })}${inp('vname2', '2. Mieter (Name, Vorname) – optional')}
      ${inp('anschrift', 'Bisherige Anschrift', { wide: true, ph: 'Straße Nr., PLZ Ort' })}${inp('tel', 'Telefon', { type: 'tel' })}${inp('mail', 'E-Mail', { type: 'email' })}
      ${kopf('Vermieter')}
      ${inp('mvName', 'Name, Vorname bzw. Firma', { ph: 'Sultanow, Sebastian' })}${inp('mvAnschrift', 'Anschrift', { ph: 'Straße Nr., PLZ Ort' })}${inp('mvTel', 'Telefon', { type: 'tel' })}${inp('mvMail', 'E-Mail', { type: 'email' })}
      ${kopf('Wohnung (§ 1)')}
      ${inp('adresse', 'Straße, PLZ, Ort', { wide: true })}${inp('geschoss', 'Geschoss', { ph: 'z. B. 2. OG, EG, DG' })}${sel('seite', 'Lage im Geschoss', SEITEN)}
      ${inp('zimmer', 'Zimmer', { mode: 'decimal' })}${inp('flaeche', 'Wohnfläche (m²)', { mode: 'decimal' })}${inp('nutzflaeche', 'Nutzfläche (m², optional)', { mode: 'decimal' })}
      <fieldset class="f wide vm-chk"><legend>Ausstattung</legend>${AUSST.map(([key, l]) => `<label><input type="checkbox" name="au_${key}"${d0.ausst?.[key] ? ' checked' : ''}> ${l}</label>`).join('')}</fieldset>
      ${sel('stp', 'Stellplatz / Garage / Carport', STP.map((x) => [x, x || 'keiner']))}${inp('stpNr', 'Stellplatz-Nummer')}
      ${schluesselEditor(d0.schluessel, 'sl')}
      ${kopf('Miete und Kaution (§ 2, § 5)')}
      ${inp('kalt', 'Kaltmiete (€)', { mode: 'decimal' })}${inp('nk', 'Betriebskosten-Vorauszahlung (€)', { mode: 'decimal' })}
      ${inp('stpKosten', 'Stellplatz / Garage (€ mtl.)', { mode: 'decimal' })}${inp('kuecheKosten', 'Küche / Mobiliar (€ mtl.)', { mode: 'decimal' })}
      ${inp('kaution', 'Kaution (€)', { mode: 'decimal' })}<div class="f vm-kbtn"><span>Kaution aus Kaltmiete</span><div class="vm-kbtn-r"><button type="button" class="btn ghost sm" data-kaution="2">2 KM</button><button type="button" class="btn ghost sm" data-kaution="2.5">2,5 KM</button><button type="button" class="btn ghost sm" data-kaution="3">3 KM</button></div><small id="vtKz"></small></div>
      <p class="f vm-summe" id="vtSumme"></p>
      ${kopf('Mietkonto (§ 3)')}
      ${inp('bank', 'Bank')}${inp('iban', 'IBAN', { ph: 'DE00 0000 0000 0000 0000 00' })}${inp('bic', 'BIC')}
      ${kopf('Vertrag (§ 4, § 6, § 18, § 20)')}
      ${inp('beginn', 'Mietbeginn', { type: 'date' })}${inp('kv', 'Kündigungsverzicht (Monate, 0 = keiner)', { mode: 'numeric' })}
      ${inp('arbBis', 'Arbeiten des Vermieters bis (optional)', { type: 'date' })}${inp('arbWas', 'Welche Arbeiten (optional)', { ph: 'z. B. Bad streichen, Silikonfugen erneuern' })}
      ${inp('hv', 'Hausverwaltung (leer = Absatz entfällt)', { wide: true })}
      <label class="f wide"><span>Individuelle Vereinbarungen (§ 20)</span><textarea name="vereinbarungen" rows="3" maxlength="2500" placeholder="z. B. Haltung einer Katze gestattet. Einbauküche wird mitvermietet.">${esc(d0.vereinbarungen || '')}</textarea></label>
      ${inp('ort', 'Ort für die Unterschrift', { ph: 'Hof' })}
    </div>
    <p class="lg-err hidden" id="vtErr" role="alert"></p>
    <div class="acts sticky-save"><button type="button" class="btn" data-a="nurspeichern">Nur speichern</button><button class="btn fill">PDF erstellen</button></div></form>`;
  const form = dlgEl.querySelector('#vtForm');
  const NUM = ['zimmer', 'flaeche', 'nutzflaeche', 'kalt', 'nk', 'stpKosten', 'kuecheKosten', 'kaution', 'kv'];
  const lesen = () => {
    const f = form, v = {};
    for (const n of ['vname', 'vname2', 'anschrift', 'tel', 'mail', 'mvName', 'mvAnschrift', 'mvTel', 'mvMail', 'adresse', 'geschoss', 'seite', 'stp', 'stpNr', 'bank', 'iban', 'bic', 'beginn', 'arbBis', 'arbWas', 'hv', 'vereinbarungen', 'ort']) v[n] = f[n].value.trim();
    for (const n of NUM) { const z = zahl(f[n].value); v[n] = z == null ? '' : z; }
    v.ausst = Object.fromEntries(AUSST.map(([key]) => [key, f['au_' + key].checked]));
    v.schluessel = schluesselLesen(f, 'sl');
    v.deckblatt = false;
    if (v.iban) v.iban = ibanSchoen(v.iban);
    return v;
  };
  const pruefen = () => {
    const v = lesen(), fe = vFehlt(v), box = dlgEl.querySelector('#vtFehlt'), falsch = NUM.filter((n) => Number.isNaN(v[n]));
    const ib = v.iban && !ibanOk(v.iban);
    // Kaution in Kaltmieten anzeigen; mehr als drei Kaltmieten sind nach § 551 BGB nicht zulässig
    const kf = Number(v.kalt) > 0 && Number(v.kaution) > 0 ? Number(v.kaution) / Number(v.kalt) : 0, zuHoch = kf > 3.001;
    dlgEl.querySelector('#vtKz').textContent = kf ? `= ${kf.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Kaltmieten${zuHoch ? ' – höchstens 3 erlaubt (§ 551 BGB)' : ''}` : '';
    dlgEl.querySelector('#vtKz').classList.toggle('warn', zuHoch);
    box.className = 'vm-fehlt wide ' + (fe.length || falsch.length || ib || zuHoch ? 'offen' : 'ok');
    box.innerHTML = fe.length || falsch.length || ib || zuHoch
      ? `<b>${fe.length ? `Für den Vertrag fehlt noch (${fe.length}):` : 'Bitte prüfen:'}</b> ${[...fe, ...falsch.map((n) => `${n} ist keine Zahl`), ib ? 'IBAN-Prüfziffer stimmt nicht' : '', zuHoch ? 'Kaution über 3 Kaltmieten' : ''].filter(Boolean).map(esc).join(' · ')}<small>Leere Felder erscheinen im PDF als Linie zum Ausfüllen von Hand.</small>`
      : '<b>Alle Pflichtangaben sind da.</b> <small>Der Vertrag kann erstellt werden.</small>';
    const sum = dlgEl.querySelector('#vtSumme'); sum.innerHTML = `<span>Monatlich gesamt</span><b>${v.kalt !== '' && v.nk !== '' && !Number.isNaN(v.kalt) && !Number.isNaN(v.nk) ? eur(vGesamt(v)) : '–'}</b>`;
    form.querySelectorAll('input,select,textarea').forEach((el) => el.classList.toggle('vm-leer', fe.length > 0 && ['vname', 'anschrift', 'mvName', 'mvAnschrift', 'adresse', 'geschoss', 'zimmer', 'flaeche', 'kalt', 'nk', 'kaution', 'beginn', 'iban', 'bank'].includes(el.name) && !el.value.trim()));
    return { v, fe, ok: !falsch.length };
  };
  form.addEventListener('input', pruefen); form.addEventListener('change', pruefen); pruefen();
  const speichern = async (v) => {
    const { deckblatt, ...rest } = v;
    await sendKontakt(o.id, k, { vertrag: { ...rest, deckblatt }, vname: v.vname, vname2: v.vname2, anschrift: v.anschrift, tel: v.tel, mail: v.mail });
  };
  const fehler = (t) => { const e = dlgEl.querySelector('#vtErr'); e.textContent = t; e.classList.remove('hidden'); };
  dlgEl.onclick = async (e) => {
    if (e.target.closest('[data-a=close]')) return dlgEl.close();
    const plus = e.target.closest('[data-sl-plus]'); if (plus) return schluesselPlus(form, plus.dataset.slPlus);
    const kb = e.target.closest('[data-kaution]');
    if (kb) { const km = zahl(form.kalt.value); if (!km) { form.kalt.focus(); return fehler('Bitte zuerst die Kaltmiete eintragen.'); } form.kaution.value = String(Math.round(km * Number(kb.dataset.kaution) * 100) / 100).replace('.', ','); return pruefen(); }
    const nur = e.target.closest('[data-a=nurspeichern]'); if (!nur) return;
    const { v, ok } = pruefen(); if (!ok) return fehler('Bitte Beträge und Flächen als Zahl eingeben.');
    nur.disabled = true; try { await speichern(v); dlgEl.close(); toast('Vertragsdaten gespeichert.'); aktualisieren(true); } catch (x) { fehler(x.message); nur.disabled = false; }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const { v, fe, ok } = pruefen(); if (!ok) return fehler('Bitte Beträge und Flächen als Zahl eingeben.');
    if (fe.length && !(await confirmBox({ title: 'Vertrag mit offenen Angaben erstellen?', text: `Es fehlen noch: ${fe.join(', ')}. Diese Stellen erscheinen im PDF als Linie zum Ausfüllen von Hand.`, ok: 'Trotzdem erstellen' }))) return;
    const btn = form.querySelector('.sticky-save .fill'); btn.disabled = true; btn.textContent = 'PDF wird erstellt …';
    try {
      await speichern(v);
      const kk = stand(o.id).kontakte.find((x) => x.kid === kid) ?? k;
      // Im PDF steht nur, ob eine Unterlage vorliegt – nicht, wer sie geprüft hat
      const unterlagen = CHECK.map(([key, l, , min]) => { const fs = dokListe(kk, key), da = kk.geprueft?.[key] || fs.length >= min; return { l, st: da ? 'ok' : fs.length ? 'teil' : 'fehlt', txt: da ? 'vorhanden' : fs.length ? `${fs.length} von ${min}` : 'fehlt' }; });
      const { vertragPdf } = await import('./vertrag.js');
      const bytes = await vertragPdf(v, { titel: o.titel, lage: o.lage, ort: o.ort, bild: o.bild, unterlagen, erstellt: Date.now() });
      const name = dateiname(`Mietvertrag ${o.titel}${v.geschoss ? ' ' + v.geschoss : ''} – ${(v.vname || k.name).replace(',', '')} ${new Date().toLocaleDateString('de-DE')}`) + '.pdf';
      const file = new File([bytes], name, { type: 'application/pdf' });
      // Herunterladen
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      // Beim Interessenten ablegen, damit beide ihn haben
      btn.textContent = 'Wird abgelegt …';
      try { await dokHinzu(o.id, kk, [file], 'mietvertrag'); } catch (x) { toast('PDF geladen, Ablage beim Interessenten fehlgeschlagen: ' + x.message, false); }
      await send(o.id, { typ: 'vertrag', kid, name: v.vname || k.name, fehlt: fe.length || undefined });
      dlgEl.close(); toast(fe.length ? `Vertrag als Entwurf erstellt (${fe.length} Angaben offen).` : 'Mietvertrag erstellt und beim Interessenten abgelegt.'); aktualisieren(true);
    } catch (x) { fehler('PDF konnte nicht erstellt werden: ' + (x.message || x)); btn.disabled = false; btn.textContent = 'PDF erstellen'; }
  };
  dlgEl.showModal();
}
