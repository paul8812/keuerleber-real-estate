// Partnerbereich: lädt die verschlüsselte Datei, entschlüsselt sie im Browser und zeigt die Übersicht.
import { openObjects, openSlot, sealFeedback, randomId } from './crypto.js';
import { STAGES, stageOf, chains } from './fb.js';
import { exportObjekte } from './export.js';

const app = document.getElementById('app');
const KONTAKT = { firma: 'Norderfranken Haus und Grund GmbH', adresse: 'Am Gewerbegebiet 5 · 95185 Gattendorf', tel: '+49 160 3636997', telHref: '+491603636997', mail: 'info@norderfranken.de', web: 'www.norderfranken.de' };
const SESSION = 'nf-partner-session';
const ANSP = { name: 'Sebastian Sultanow', tel: '+49 160 3636997', mail: 'info@norderfranken.de' }; // Standard-Ansprechpartner, pro Objekt im Admin überschreibbar
const REPO = 'paul8812/keuerleber-real-estate';
const VSTATUS = { frei: 'Frei', reserviert: 'Reserviert', notar: 'Notartermin', verkauft: 'Verkauft' };
export const waNr = (t) => { const d = String(t ?? '').replace(/\(0\)/g, '').replace(/[^\d+]/g, ''); return d.startsWith('+') ? d.slice(1) : d.startsWith('00') ? d.slice(2) : d.startsWith('0') ? '49' + d.slice(1) : d; };
const ansp = (o) => ({ name: o.ansp?.name || ANSP.name, tel: o.ansp?.tel || ANSP.tel, mail: o.ansp?.mail || (o.ansp?.tel ? '' : ANSP.mail) });
const isMobil = (t) => /^491[5-7]/.test(waNr(t));
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus */ } };
const safeDecode = (t) => { try { return decodeURIComponent(t); } catch { return t; } };
/** Bereinigt eingefügte Zugangsdaten: unsichtbare Zeichen, Leerraum an den Enden, komplett eingefügter Einladungslink. */
const cleanCode = (raw) => {
  let t = String(raw ?? '').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').trim();
  const h = t.indexOf('#');
  if (h >= 0 && /^https?:\/\//i.test(t)) t = safeDecode(t.slice(h + 1)).trim(); // Passwörter dürfen selbst „#“ enthalten
  return t;
};
const datum = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const eur = (n) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €';
const zim = (z) => esc(String(z).replace('.', ','));
const num = (n, d = 2) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

export function kennzahlen(o) {
  const jahresmiete = (o.miete + (o.zuschlag?.betrag ?? 0)) * 12;
  return { preisQm: o.preis / o.flaeche, mieteQm: o.miete / o.flaeche, rendite: (jahresmiete / o.preis) * 100, faktor: o.preis / jahresmiete, jahresmiete };
}

/* ---------- Einheitliche Begriffe und Reihenfolge ---------- */
// Nie „Kernsanierung“/„kernsaniert“, sondern „Sanierung“/„saniert“ – in allen Texten eines Objekts.
const ohneKern = (t) => t.replace(/\b([Kk])ern[-\s]?[Ss]anier/g, (m, k) => (k === 'K' ? 'S' : 's') + 'anier');
// Am Foto heißen abgeschlossene Objekte „Fertiggestellt“ – egal ob vorher „saniert“ oder „renoviert“ eingetragen war.
const fertig = (t) => t.replace(/\b(?:[Kk]ern[-\s]?)?([Ss]aniert|[Rr]enoviert)\b/g, (m) => (/^[A-ZÄÖÜ]/.test(m) ? 'F' : 'f') + 'ertiggestellt');
const tief = (v, key = '') => (typeof v === 'string' ? (key === 'bild' || key === 'd' ? v : ohneKern(v))
  : Array.isArray(v) ? v.map((x) => tief(x)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tief(x, k)])) : v);
/** Bereinigt entschlüsselte Objektdaten für die Anzeige (Bilder und Unterlagen bleiben unangetastet). */
export function pflege(d) {
  return { ...d, objekte: d.objekte.map((o) => { const n = tief(o); if (n.status) n.status = { ...n.status, label: fertig(String(n.status.label ?? '')) }; return n; }) };
}
// Reihenfolge überall (Übersicht, Registeransicht, Druck, Export): Frei zuerst, Reservierte (und Notartermin/Verkauft) am Ende.
const RANG = { frei: 0, reserviert: 1, notar: 2, verkauft: 3 };
const rang = (o) => RANG[o.vs || 'frei'] ?? 0;
export const nachStatus = (l) => [...l].sort((a, b) => rang(a) - rang(b));
const istRes = (o) => o.vs === 'reserviert' || o.vs === 'notar';
// Ausstattung, die unter der Adresse genannt wird (aus Ausstattungsliste und Zuschlag, z. B. „TG-Stellplatz“)
const EXTRAS = [['Stellplatz', /stellplatz|parkplatz|carport/i], ['Garage', /garage(?!n?stellplatz)/i], ['Balkon', /balkon/i]];
const ausstattung = (o) => { const t = [...(o.tags ?? []), o.zuschlag?.label ?? ''].join(' | '); return EXTRAS.filter(([, re]) => re.test(t)).map(([n]) => n); };

const logo = (cls) => `<img src="logo-weiss.svg" alt="Norderfranken Haus & Grund" class="${cls} logo-w"><img src="logo.svg" alt="Norderfranken Haus & Grund" class="${cls} logo-d">`;
const ICON = {
  haus: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  lupe: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  wecker: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="7"/><path d="M12 10.5v3.2l2.2 1.6M4.5 5.5l3-2.5M19.5 5.5l-3-2.5M7.5 19.5l-1.5 2M16.5 19.5l1.5 2"/></svg>',
  pfeil: '<svg class="ic chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  liste: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  kacheln: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></svg>',
  export: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3"/></svg>',
};
const grussZeit = () => { const h = new Date().getHours(); return h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend'; };
const tageLang = () => new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
function themaWechseln() {
  const h = document.documentElement, hell = h.getAttribute('data-theme') !== 'light';
  if (hell) h.setAttribute('data-theme', 'light'); else h.removeAttribute('data-theme');
  try { localStorage.setItem('cockpit-thema', hell ? 'light' : 'dark'); } catch { /* privater Modus */ }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', hell ? '#F1F1F2' : '#0E0E0F');
  document.querySelectorAll('.thema').forEach((b) => b.setAttribute('aria-checked', String(hell)));
}
document.addEventListener('click', (e) => { if (e.target.closest('.thema')) themaWechseln(); });
document.addEventListener('keydown', (e) => { if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && document.getElementById('q')) { e.preventDefault(); document.getElementById('q').focus(); } });

const ctx = { mode: 'karten', pkg: null, sess: null, data: null, view: 'start', filter: 'alle', sort: 'standard', q: '' };

async function loadPackage() {
  const r = await fetch('data.enc.json?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Daten konnten nicht geladen werden (' + r.status + ')');
  return r.json();
}

const sigOf = (pkg) => pkg.objekte.map((b) => b.b).join('|');

function note(text) {
  document.getElementById('toast')?.remove();
  const d = document.createElement('div');
  d.id = 'toast'; d.className = 'toast ok'; d.setAttribute('role', 'status'); d.textContent = text;
  document.body.append(d); setTimeout(() => d.remove(), 4500);
}

/** Öffnet den eigenen Zugang im (neuen) Datenstand erneut – nötig, wenn zwischenzeitlich veröffentlicht wurde. */
async function reopen(pkg) {
  const slot = pkg.slots.find((s) => s.id === ctx.sess.id);
  const payload = slot && await openSlot(ctx.sess.code, slot, pkg.iter);
  if (!payload) return false;
  ctx.pkg = pkg;
  ctx.sess = { ...payload, code: ctx.sess.code, id: ctx.sess.id, sig: sigOf(pkg) };
  ctx.data = pflege(await openObjects(payload, pkg));
  try { sessionStorage.setItem(SESSION, JSON.stringify(ctx.sess)); } catch { /* egal */ }
  return true;
}

/** Holt den aktuellen Stand (z. B. wenn der Tab länger offen war) und aktualisiert die Übersicht. */
let lastCheck = Date.now();
async function refreshData() {
  lastCheck = Date.now();
  if (!ctx.sess) return;
  let pkg; try { pkg = await loadPackage(); } catch { return; }
  if (sigOf(pkg) === ctx.sess.sig) return;
  if (!(await reopen(pkg))) return leaveAndReload('Ihr Zugang wurde geändert. Bitte neu anmelden.');
  if (ctx.view === 'start' && !document.getElementById('ov')) {
    const y = window.scrollY; render(); window.scrollTo(0, y);
    note('Die Übersicht wurde aktualisiert.');
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60000) refreshData(); });
setInterval(() => { if (document.visibilityState === 'visible' && ctx.sess && Date.now() - lastCheck > 300000) refreshData(); }, 60000);

async function enter(payload, code, id) {
  ctx.sess = { ...payload, code, id, sig: sigOf(ctx.pkg) };
  const seen = lsGet('nf-seen-' + id);
  ctx.seen = seen ?? Date.now(); // erster Besuch: nichts als „neu“ markieren
  lsSet('nf-seen-' + id, Date.now());
  try { localStorage.removeItem('nf-expose-prof'); } catch { /* egal */ } // altes, für alle Zugänge gemeinsames Profil
  try { sessionStorage.setItem('nf-seen-ctx', String(ctx.seen)); } catch { /* egal */ }
  ctx.data = pflege(await openObjects(payload, ctx.pkg));
  try { sessionStorage.setItem(SESSION, JSON.stringify(ctx.sess)); } catch { /* privater Modus */ }
  if (location.hash) history.replaceState(null, '', location.pathname);
  ctx.view = 'start';
  render();
}

const FLASH = 'nf-flash';
const takeFlash = () => { try { const m = sessionStorage.getItem(FLASH) || ''; sessionStorage.removeItem(FLASH); return m; } catch { return ''; } };
/** Meldet ab und lädt die Seite neu: So verschwinden auch alle entschlüsselten Daten (inkl. Verwaltungsstand) aus dem Speicher. */
function leaveAndReload(msg = '') {
  try { sessionStorage.removeItem(SESSION); sessionStorage.removeItem('nf-seen-ctx'); if (msg) sessionStorage.setItem(FLASH, msg); } catch { /* egal */ }
  ctx.sess = ctx.data = null;
  location.replace(location.pathname);
}
function logout() { leaveAndReload(); }

/* ---------- Anmeldung ---------- */
function showLogin(msg = '', busy = false) {
  app.innerHTML = `
  <main class="lg"><div class="lg-card">
    ${logo('lg-logo')}
    <span class="eyebrow">Partnerbereich</span>
    <h1>Vertriebsübersicht</h1>
    <p class="lg-sub">Vertraulicher Zugang für unsere Vertriebspartner. Bitte Zugangscode oder Passwort eingeben.</p>
    <form class="lg-form" id="loginForm" autocomplete="off">
      <label for="pw">Zugangscode oder Passwort</label>
      <input id="pw" type="password" autocomplete="current-password" required maxlength="200" ${busy ? 'disabled' : ''}>
      ${msg ? `<p class="lg-err" role="alert">${esc(msg)}</p>` : ''}
      <button class="btn fill" ${busy ? 'disabled' : ''}>${busy ? 'Prüfe …' : 'Anmelden'}</button>
    </form>
    <p class="lg-foot">Kein Zugang? Rufen Sie Sebastian Sultanow an: <a class="nowrap" href="tel:${KONTAKT.telHref}">${KONTAKT.tel}</a></p>
  </div></main>`;
  const f = document.getElementById('loginForm');
  document.getElementById('pw').focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    let code = cleanCode(document.getElementById('pw').value);
    let only = null;
    const dot = code.indexOf('.');
    if (dot > 0 && ctx.pkg.slots.some((s) => s.id === code.slice(0, dot))) { only = code.slice(0, dot); code = code.slice(dot + 1); }
    showLogin('', true);
    const todo = ctx.pkg.slots.filter((s) => !only || s.id === only);
    let n = 0;
    for (const slot of todo) {
      const b = document.querySelector('.lg-form .btn'); if (b) b.textContent = todo.length > 1 ? `Prüfe … ${++n}/${todo.length}` : 'Prüfe …';
      await new Promise((r) => setTimeout(r, 30)); // Anzeige aktualisieren, bevor die Berechnung startet
      const payload = await openSlot(code, slot, ctx.pkg.iter);
      if (payload) return enter(payload, code, slot.id);
    }
    showLogin('Zugangscode oder Passwort nicht korrekt.');
  });
}

/* ---------- Übersicht ---------- */
const FILTER = [
  ['alle', 'Alle', () => true],
  ['frei', 'Frei', (o) => (o.vs || 'frei') === 'frei'],
  ['res', 'Reserviert', istRes],
  ['neu', 'Neu / geändert', (o) => isNeu(o)], // über die Kachel „Neu / geändert“ oder den Hinweis erreichbar
];
const CHIPS = ['alle', 'frei', 'res'];

const fbKey = () => 'nf-fb-' + ctx.sess.id;
const fbMine = () => lsGet(fbKey()) ?? [];

function fbBlock(o) {
  const mine = chains(fbMine().filter((e) => e.oid === o.id));
  if (!mine.length) return '';
  return `<div class="fbl"><small>Ihre Rückmeldungen</small>${mine.map((e) => { const s = stageOf(e.st); return `<span class="fbc" style="--c:${s.color}"><i></i><b>${esc(e.k || 'Interessent')}</b> ${esc(s.short)} <em>${datum(e.t)}${e.sent === false ? ' · nur lokal' : ''}</em>${e.sent === false && ctx.sess.fb?.token ? `<button type="button" class="linkbtn" data-retry="${esc(e.id)}">Erneut senden</button>` : ''}<button type="button" class="fbx" data-fbdel="${esc(fbKette(e))}" aria-label="Rückmeldung ${esc(e.k || 'Interessent')} hier ausblenden" title="Hier ausblenden">×</button></span>`; }).join('')}</div>`;
}

// Eine Rückmeldekette = derselbe Interessent zum selben Objekt (wie in chains())
const fbKette = (e) => `${e.pid}|${e.oid}|${String(e.k || '').trim().toLowerCase()}`;

const isNeu = (o) => o.t && o.t > (ctx.seen ?? Infinity);

/** Aufklappmenü (Export): Knopf + Liste. items: [{ a: 'data-…="…"', t: Titel, s: Zusatz }] oder { g: Gruppenüberschrift } */
function menu(label, items, cls = '') {
  return `<div class="dropdown ${cls}"><button type="button" class="btn fill sm" data-menu aria-haspopup="menu" aria-expanded="false">${ICON.export}<span>${label}</span>${ICON.pfeil}</button>
    <div class="dd-menu" role="menu" aria-label="${esc(label)}">${items.map((i) => (i.g ? `<p class="dd-g" role="presentation">${esc(i.g)}</p>`
      : `<button type="button" role="menuitem" ${i.a}><b>${esc(i.t)}</b>${i.s ? `<small>${esc(i.s)}</small>` : ''}</button>`)).join('')}</div></div>`;
}
const kb = (d) => Math.max(1, Math.round((String(d.d).length * 0.75) / 1024));

function objektMenu(o) {
  const id = esc(o.id), docs = o.docs ?? [];
  return menu('Export', [
    { a: `data-ex="${id}"`, t: 'Kunden-Exposé (PDF)', s: 'Mit Ihrem Aufschlag, ohne Abgabepreis' },
    { a: `data-blatt="${id}"`, t: 'Datenblatt (PDF)', s: 'Alle Angaben inkl. Abgabepreis' },
    { a: `data-oexp="xlsx" data-id="${id}"`, t: 'Excel', s: 'Kennzahlen als .xlsx' },
    { a: `data-oexp="csv" data-id="${id}"`, t: 'CSV', s: 'Kennzahlen als .csv' },
    { a: `data-oexp="investagon" data-id="${id}"`, t: 'Investagon', s: 'Einheit für den Import (CSV)' },
    ...(docs.length ? [{ g: `Unterlagen (${docs.length})` }, ...docs.map((d, i) => ({ a: `data-doc="${id}:${i}"`, t: d.n, s: `${kb(d)} KB · herunterladen` }))] : []),
  ], 'rechts');
}

function karte(o) {
  const k = kennzahlen(o);
  const steps = o.schritte.map((s) => `
    <li class="${esc(s.state)}"><span class="dot">${s.state === 'done' ? '✓' : ''}</span><b>${esc(s.label)}</b>
    <em>${s.state === 'current' && s.label === 'Sanierung' ? o.fortschritt + ' %' : esc(s.datum ?? '')}</em></li>`).join('');
  const a = ansp(o), vs = o.vs || 'frei', id = esc(o.id);
  const sold = vs === 'verkauft', extras = ausstattung(o);
  const MIETART = { IST: 'laut Mietvertrag', SOLL: 'kalkulierte Marktmiete', PLAN: 'Planwert vor Sanierung' };
  const kz = [
    ['Preis je m²', eur(k.preisQm)],
    ['Faktor', `${num(k.faktor, 1)}-fach`],
    ['Kaltmiete je m²', `${num(k.mieteQm)} €`],
    ['Jahreskaltmiete', eur(k.jahresmiete), o.zuschlag ? `inkl. ${o.zuschlag.label} ${eur(o.zuschlag.betrag)}/Mon.` : ''],
    ['Hausgeld / Mon.', eur(o.hausgeld)],
    ['Mietansatz', o.mieteTyp, MIETART[o.mieteTyp] ?? ''],
  ];
  return `
  <article class="card${sold ? ' sold' : ''}" data-oid="${id}">
    <div class="photo"><img src="${esc(o.bild)}" alt="${esc(o.strasse + ', ' + o.lage)}" loading="lazy"><span class="pill ${esc(o.status.tone)}"><i></i>${esc(o.status.label)}</span>${vBadge(o)}${isNeu(o) ? `<span class="neu">${esc(o.aend || 'Aktualisiert')}</span>` : ''}</div>
    <div class="body">
      <div class="head"><h2>${esc(o.strasse)} <span>· ${esc(o.lage)}</span></h2><span class="meta">${zim(o.zimmer)} Zi. · Bj. ${esc(o.baujahr)} · Energie ${esc(o.energie)}${extras.map((x) => ` · <b>${esc(x)}</b>`).join('')}</span></div>
      <div class="kpis">
        <div class="price"><small>Abgabepreis</small><b>${eur(o.preis)}</b></div>
        <div class="rend"><small>Rendite p. a.</small><b>${num(k.rendite)} %</b></div>
        <div><small>Wohnfläche</small><b>${num(o.flaeche)} m²</b></div>
        <div class="miete"><small>Kaltmiete / Mon.</small><span class="wert"><b>${eur(o.miete)}</b><u class="tag ${esc(o.mieteTyp.toLowerCase())}" title="${esc(MIETART[o.mieteTyp] ?? '')}">${esc(o.mieteTyp)}</u></span></div>
      </div>
      <div class="san-h"><small>Sanierungsstand</small><b class="${esc(o.status.tone)}">${o.fortschritt} %</b></div>
      <div class="bar-t"><i class="${esc(o.status.tone)}" style="width:${o.fortschritt}%"></i></div>
      <div class="cact">
        <button type="button" class="btn fill sm" data-det="${id}" aria-expanded="false" aria-controls="det-${id}"><span>Details</span>${ICON.pfeil}</button>
        <div class="cact-r">${objektMenu(o)}<button type="button" class="btn fill sm" data-fb="${id}" ${sold ? 'disabled' : ''}>Rückmeldung</button></div>
      </div>
      ${fbBlock(o)}
      <div class="more" id="det-${id}" hidden>
        <section class="mk" aria-label="Kennzahlen für den Vertrieb"><h3>Kennzahlen</h3>
          <dl class="kz">${kz.map(([l, w, z]) => `<div><dt>${esc(l)}</dt><dd>${esc(w)}${z ? `<small>${esc(z)}</small>` : ''}</dd></div>`).join('')}</dl>
          ${o.preisHinweis ? `<p class="kz-h">${esc(o.preisHinweis)}</p>` : ''}</section>
        <section class="beschr"><h3>Objektbeschreibung</h3>${o.ort ? `<p class="ort">${esc(o.ort)}</p>` : ''}${o.sanierung ? `<p>${esc(o.sanierung)}</p>` : ''}${o.hinweis ? `<p class="note">${esc(o.hinweis)}</p>` : ''}</section>
        <section class="zeit"><h3>Zeitplan</h3><ol class="steps">${steps}</ol></section>
        <p class="who">Ansprechpartner: <b>${esc(a.name)}</b> · ${esc(a.tel)}${a.mail ? ' · ' + esc(a.mail) : ''}</p>
      </div>
    </div>
  </article>`;
}

function vBadge(o) {
  const v = o.vs || 'frei';
  if (v === 'frei') return '';
  const bis = v === 'reserviert' && o.vbis ? ` · bis ${new Date(o.vbis).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}` : '';
  const abgelaufen = v === 'reserviert' && o.vbis && Date.parse(o.vbis) + 86400000 < Date.now();
  return `<span class="vs ${esc(v)}">${v === 'reserviert' ? ICON.wecker : ''}${abgelaufen ? 'Reservierung abgelaufen – bitte anfragen' : esc(VSTATUS[v] ?? v) + bis}</span>`;
}

/** Suchtext vereinheitlichen: Groß-/Kleinschreibung, ß/ss, Umlaute, Bindestriche und Punkte egal. */
const norm = (t) => String(t ?? '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-–—·.,/]+/g, ' ').replace(/\s+/g, ' ').trim();
function filtered() {
  const t = FILTER.find((f) => f[0] === ctx.filter)[2];
  const terms = norm(ctx.q).split(' ').filter(Boolean);
  const hay = (o) => norm(`${o.strasse} ${o.lage} ${o.tags.join(' ')} ${o.status.label} ${o.vs ? VSTATUS[o.vs] ?? '' : 'frei'}`);
  return ctx.data.objekte.filter((o) => t(o) && (!terms.length || terms.every((w) => hay(o).includes(w))));
}

function tabelle(l) {
  const rows = l.map((o) => {
    const k = kennzahlen(o), v = o.vs || 'frei';
    return `<tr data-go="${esc(o.id)}" tabindex="0" class="${v === 'verkauft' ? 'sold' : ''}"><td class="t-o" data-l="Objekt"><b>${esc(o.strasse)}</b><small>${esc(o.lage)}</small>${isNeu(o) ? '<span class="neu-s">neu</span>' : ''}</td>
      <td data-l="Fläche">${num(o.flaeche)} m²<small>${zim(o.zimmer)} Zimmer</small></td><td data-l="Kaltmiete">${eur(o.miete)}<small>${esc(o.mieteTyp)}${o.zuschlag ? ' · + ' + esc(o.zuschlag.label) : ''}</small></td><td class="t-p" data-l="Abgabepreis">${eur(o.preis)}</td>
      <td data-l="Preis/m²">${eur(k.preisQm)}</td><td data-l="Rendite">${num(k.rendite)} %</td>
      <td data-l="Status"><span class="tvs ${esc(v)}">${esc(VSTATUS[v] ?? v)}</span><small>${esc(o.status.label)}</small></td></tr>`;
  }).join('');
  return `<div class="tbl-w"><table class="tbl"><thead><tr><th>Objekt</th><th>Fläche</th><th>Kaltmiete</th><th>Abgabepreis</th><th>Preis/m²</th><th>Rendite</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint tbl-h">Zeile antippen für Details, Export und Rückmeldung.</p>`;
}

function visible() {
  const l = filtered();
  if (ctx.sort === 'preis') l.sort((a, b) => a.preis - b.preis);
  if (ctx.sort === 'rendite') l.sort((a, b) => kennzahlen(b).rendite - kennzahlen(a).rendite);
  if (ctx.sort === 'flaeche') l.sort((a, b) => b.flaeche - a.flaeche);
  return nachStatus(l); // Reservierte immer am Ende – auch in Druck und Export
}

function listeHtml() {
  const l = visible();
  if (!ctx.data.objekte.length) return '<p class="empty">Für Sie sind aktuell keine Objekte freigegeben. Bitte sprechen Sie Sebastian Sultanow an: ' + KONTAKT.tel + '</p>';
  return l.length ? (ctx.mode === 'tabelle' ? tabelle(l) : l.map(karte).join('')) : '<p class="empty">Keine Objekte für diese Auswahl.<br><button class="btn ghost sm" data-reset>Filter zurücksetzen</button></p>';
}

const isAdmin = () => ctx.sess?.r === 'admin' && !!ctx.sess.a; // ohne Admin-Schlüssel (z. B. veränderte Sitzungsdaten) gibt es keine Verwaltung
function header() {
  const hell = document.documentElement.getAttribute('data-theme') === 'light';
  const name = ctx.sess.n || (ctx.sess.r === 'admin' ? 'Master' : 'Partner');
  return `<header class="p-kopf"><div class="wrap p-in"><div class="brand">${logo('top-logo')}
    <div><h1>Partnerbereich</h1><small><b></b>Vertriebsübersicht · Stand <span class="num">${esc(ctx.data.stand || '')}</span></small></div></div>
    <div class="top-r"><span class="top-user">Angemeldet: <b>${esc(name)}</b></span>
    ${isAdmin() ? '<button class="btn dark sm" id="toAdmin">Verwaltung</button>' : ''}
    <button class="btn dark sm" id="logout">Abmelden</button>
    <button class="thema" type="button" role="switch" aria-checked="${hell}" aria-label="Helle Darstellung"></button></div></div></header>`;
}

function render() {
  if (ctx.view === 'admin' && !isAdmin()) ctx.view = 'start';
  if (ctx.view === 'admin') return import('./admin.js').then((m) => m.mount({ app, ctx, render: () => { ctx.view = 'start'; render(); }, logout, header }));
  const objs = ctx.data.objekte;
  const n = objs.length;
  const sp = (t, w, u, o = {}) => `<button type="button" data-f="${o.f}" class="sp${ctx.filter === o.f ? ' on' : ''}" aria-pressed="${ctx.filter === o.f}"><div class="sp-t">${t}</div><div class="sp-w${o.null ? ' null' : ''}">${w}</div><div class="sp-u">${u}</div></button>`;
  const cnt = (f) => objs.filter(FILTER.find((x) => x[0] === f)[2]).length;
  const nNeu = cnt('neu'), nFrei = cnt('frei'), nRes = cnt('res');
  const chips = [...CHIPS, ...(ctx.filter === 'neu' ? ['neu'] : [])].map((id) => FILTER.find((f) => f[0] === id));
  const exportMenu = menu('Export', [
    { a: 'data-exp="pdf"', t: 'PDF / Drucken', s: 'Übersicht der angezeigten Objekte' },
    { a: 'data-exp="xlsx"', t: 'Excel', s: 'Alle angezeigten Objekte mit Kennzahlen' },
    { a: 'data-exp="csv"', t: 'CSV', s: 'Alle angezeigten Objekte mit Kennzahlen' },
    { a: 'data-exp="investagon"', t: 'Investagon', s: 'Einheitentabelle für den Import (CSV)' },
  ], 'rechts');
  app.innerHTML = `${header()}
  <div class="wrap">
  <section class="held">
    <div><h2>${grussZeit()} <span>${esc(ctx.sess.n || '')}</span></h2><p>${esc(tageLang())} · <span class="num">${n}</span> ${n === 1 ? 'Wohnung' : 'Wohnungen'}</p></div>
    <div class="leit"><p class="eyebrow slogan">Gemeinsam mehr erreichen.</p>
      <label class="suche">${ICON.lupe}<input type="search" id="q" placeholder="Objekt suchen, z. B. Straße, Garage …" value="${esc(ctx.q)}" aria-label="Suchen" autocomplete="off"><kbd>/</kbd></label></div>
  </section>
  <div class="kopfbild" role="img" aria-label="Bürogebäude Norderfranken im Abendlicht"><div class="k-stage"><img src="kopfbild.webp" alt="">
    <svg viewBox="0 0 2000 1125" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="kw" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter><filter id="kl" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"/></filter></defs>
      <polygon class="k-rahmen" points="565,243 936,370 936,516 564,419" pathLength="100" filter="url(#kw)"/>
      <polygon class="k-lauf" points="565,243 936,370 936,516 564,419" pathLength="100" filter="url(#kl)"/></svg></div></div>
  <section class="lage">
    <div class="zeile blau"><div class="z-titel"><span class="z-ic">${ICON.haus}</span><span class="z-txt"><b>Aktiv im Vertrieb</b><small>${n} ${n === 1 ? 'Wohnung' : 'Wohnungen'} in Hof</small></span></div>
      <div class="z-inhalt"><div class="spalten s3">
        ${sp('Frei', nFrei, 'sofort anfragbar', { f: 'frei', null: !nFrei })}
        ${sp('Reserviert', nRes, 'in Abwicklung', { f: 'res', null: !nRes })}
        ${sp('Neu / geändert', nNeu, 'seit Ihrem letzten Besuch', { f: 'neu', null: !nNeu })}
      </div></div></div>
  </section>
  </div>
  <main class="wrap list-wrap">
    <div class="banner">Objekte in Hof <span>${n} ${n === 1 ? 'Einheit' : 'Einheiten'}</span></div>
    ${nNeu ? `<p class="newbanner"><b>${nNeu} ${nNeu === 1 ? 'Objekt' : 'Objekte'} neu oder geändert</b> seit Ihrem letzten Besuch. <button class="linkbtn" id="showNeu">Anzeigen</button></p>` : ''}
    <div class="bar"><div class="chips" id="chips">${chips.map((f) => `<button class="chip${ctx.filter === f[0] ? ' on' : ''}" data-f="${f[0]}">${f[1]}</button>`).join('')}</div>
      <div class="tools">
      <select id="sort" aria-label="Sortieren">${[['standard', 'Sortierung: Standard'], ['preis', 'Preis aufsteigend'], ['rendite', 'Rendite absteigend'], ['flaeche', 'Wohnfläche absteigend']].map(([v, l]) => `<option value="${v}"${ctx.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <div class="tools-r"><button type="button" class="btn fill sm" id="mode">${ctx.mode === 'karten' ? `${ICON.liste}<span>Registeransicht</span>` : `${ICON.kacheln}<span>Kartenansicht</span>`}</button>
      ${exportMenu}</div></div></div>
    <div class="cards" id="cards">${listeHtml()}</div>
    <p class="legend">Kaltmiete: <b>IST</b> = laut Mietvertrag · <b>SOLL</b> = kalkulierte Marktmiete (unvermietet) · <b>PLAN</b> = Planwert vor Sanierung. Rendite = Jahreskaltmiete inkl. Garage/Stellplatz ÷ Abgabepreis. Alle Angaben laut Exposés und Objektunterlagen, ohne Gewähr. Der Abgabepreis ist der Preis für Sie als Vertrieb; Ihren eigenen Aufschlag legen Sie selbst fest (Export → „Kunden-Exposé“).</p>
  </main>
  <footer class="wrap"><div class="p-fuss"><span><b>${KONTAKT.firma}</b> · ${KONTAKT.adresse}</span><span><a href="tel:${KONTAKT.telHref}">${KONTAKT.tel}</a> · <a href="mailto:${KONTAKT.mail}">${KONTAKT.mail}</a> · ${KONTAKT.web}</span></div></footer>
  <p class="leitzeile">Unternehmen · Vertrauen · Zukunft</p>`;
  const refresh = () => { menuZu(); document.getElementById('cards').innerHTML = listeHtml(); };
  /** Filter wechseln: Reiter und Kacheln oben zeigen denselben Stand. */
  const setFilter = (f) => {
    ctx.filter = f;
    const c = document.getElementById('chips');
    c.innerHTML = [...CHIPS, ...(f === 'neu' ? ['neu'] : [])].map((id) => FILTER.find((x) => x[0] === id)).map((x) => `<button class="chip${f === x[0] ? ' on' : ''}" data-f="${x[0]}">${x[1]}</button>`).join('');
    document.querySelectorAll('.lage [data-f]').forEach((b) => { b.classList.toggle('on', b.dataset.f === f); b.setAttribute('aria-pressed', String(b.dataset.f === f)); });
    refresh();
  };
  refresh();
  document.getElementById('showNeu')?.addEventListener('click', () => { setFilter('neu'); document.getElementById('chips').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'center' }); });
  document.querySelector('.lage').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    setFilter(ctx.filter === b.dataset.f ? 'alle' : b.dataset.f);
    document.getElementById('chips').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  });
  const cards = document.getElementById('cards');
  cards.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      ctx.mode = 'karten'; render();
      const k = document.querySelector(`[data-oid="${CSS.escape(go.dataset.go)}"]`);
      if (k) { details(k, true); const kopf = document.querySelector('.p-kopf'); k.style.scrollMarginTop = (kopf && getComputedStyle(kopf).position === 'sticky' ? kopf.offsetHeight : 0) + 12 + 'px'; k.scrollIntoView({ block: 'start' }); }
      return;
    }
    const b = e.target.closest('[data-det],[data-doc],[data-ex],[data-blatt],[data-oexp],[data-fb],[data-fbdel],[data-reset],[data-retry]'); if (!b) return;
    if (b.dataset.det) return details(b.closest('.card'));
    menuZu();
    if (b.dataset.retry) return fbRetry(b);
    if (b.dataset.fbdel) { // nur die Anzeige in diesem Browser – im Master-Dashboard bleibt die Rückmeldung erhalten
      lsSet(fbKey(), fbMine().filter((x) => fbKette(x) !== b.dataset.fbdel));
      const k = b.closest('.card'), y = window.scrollY; refresh(); window.scrollTo(0, y);
      document.querySelector(`[data-oid="${CSS.escape(k?.dataset.oid ?? '')}"] [data-fb]`)?.focus({ preventScroll: true });
      return note('Rückmeldung ausgeblendet.');
    }
    if (b.dataset.reset !== undefined) { Object.assign(ctx, { filter: 'alle', q: '' }); return render(); }
    if (b.dataset.doc) return download(b.dataset.doc);
    const o = ctx.data.objekte.find((x) => x.id === (b.dataset.ex || b.dataset.blatt || b.dataset.id || b.dataset.fb)); if (!o) return;
    if (b.dataset.ex) return exposeOpen(o);
    if (b.dataset.blatt) return printOpen([o]);
    if (b.dataset.oexp) return exportObjekte([o], kennzahlen, b.dataset.oexp, `${o.strasse} ${o.lage}`);
    feedbackOpen(o);
  });
  document.getElementById('chips').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) setFilter(b.dataset.f); });
  document.getElementById('mode').addEventListener('click', () => {
    ctx.mode = ctx.mode === 'karten' ? 'tabelle' : 'karten';
    document.getElementById('mode').innerHTML = ctx.mode === 'karten' ? `${ICON.liste}<span>Registeransicht</span>` : `${ICON.kacheln}<span>Kartenansicht</span>`;
    refresh();
  });
  cards.addEventListener('keydown', (e) => { const r = e.target.closest?.('tr[data-go]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
  document.getElementById('q').addEventListener('input', (e) => { ctx.q = e.target.value; refresh(); });
  document.getElementById('sort').addEventListener('change', (e) => { ctx.sort = e.target.value; refresh(); });
  document.querySelector('.bar .dropdown').addEventListener('click', (e) => {
    const x = e.target.closest('[data-exp]'); if (!x) return;
    menuZu();
    if (x.dataset.exp === 'pdf') return printOpen();
    if (!exportObjekte(visible(), kennzahlen, x.dataset.exp)) alert('Keine Objekte zum Exportieren – bitte Filter anpassen.');
  });
  document.getElementById('logout').addEventListener('click', logout);
  document.getElementById('toAdmin')?.addEventListener('click', () => { ctx.view = 'admin'; render(); window.scrollTo(0, 0); });
}

/** Details einer Karte auf- oder zuklappen (offen = true erzwingt „auf“). */
function details(k, offen) {
  const b = k?.querySelector('[data-det]'), box = k?.querySelector('.more'); if (!b || !box) return;
  const auf = offen ?? box.hidden;
  box.hidden = !auf; b.setAttribute('aria-expanded', String(auf)); k.classList.toggle('det-auf', auf);
}

/* ---------- Aufklappmenüs (Export) ---------- */
function menuZu(ausser) {
  document.querySelectorAll('.dropdown.offen').forEach((m) => {
    if (m === ausser) return;
    m.classList.remove('offen', 'hoch', 'links'); m.querySelector('[data-menu]').setAttribute('aria-expanded', 'false');
    m.closest('.card')?.classList.remove('menu-auf');
  });
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-menu]');
  if (!t) { if (!e.target.closest('.dd-menu')) menuZu(); return; }
  const m = t.closest('.dropdown'), auf = !m.classList.contains('offen');
  menuZu(m);
  m.classList.toggle('offen', auf); t.setAttribute('aria-expanded', String(auf));
  m.closest('.card')?.classList.toggle('menu-auf', auf);
  if (!auf) return;
  // Platz prüfen: nach oben öffnen, wenn unten kein Raum ist; linksbündig, wenn rechtsbündig über den Rand ragt
  const box = m.querySelector('.dd-menu'), r = box.getBoundingClientRect();
  if (r.left < 8) m.classList.add('links');
  if (r.bottom > innerHeight - 8 && m.getBoundingClientRect().top - r.height > 8) m.classList.add('hoch');
  if (e.detail === 0) box.querySelector('[role=menuitem]')?.focus(); // per Tastatur geöffnet: gleich zum ersten Eintrag
});
document.addEventListener('keydown', (e) => {
  const m = document.querySelector('.dropdown.offen'); if (!m) return;
  const items = [...m.querySelectorAll('[role=menuitem]')], i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { e.stopPropagation(); menuZu(); m.querySelector('[data-menu]').focus(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[e.key === 'ArrowDown' ? (i + 1) % items.length : i <= 0 ? items.length - 1 : i - 1]?.focus(); }
  else if (e.key === 'Tab') menuZu();
}, true);

/* ---------- Unterlagen ---------- */
function download(ref) {
  const [id, i] = [ref.slice(0, ref.lastIndexOf(':')), +ref.slice(ref.lastIndexOf(':') + 1)];
  const d = ctx.data.objekte.find((o) => o.id === id)?.docs?.[i]; if (!d) return;
  const [head, b64] = String(d.d).split(',');
  let bin; try { bin = atob(b64); } catch { return alert('Die Unterlage „' + d.n + '“ konnte nicht geöffnet werden. Bitte beim Ansprechpartner anfragen.'); }
  const u = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([u], { type: /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream' }));
  a.download = d.n; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- Overlay-Hilfe ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
function overlay(html, cls = '', label = '') {
  document.getElementById('ov')?.remove();
  const back = document.activeElement;
  const d = document.createElement('div');
  d.id = 'ov'; d.className = 'ov ' + cls; d.innerHTML = html;
  d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.tabIndex = -1;
  d.setAttribute('aria-label', label || d.querySelector('h1,h2')?.textContent.trim() || 'Fenster');
  document.body.appendChild(d); document.body.classList.add('ovopen');
  app.inert = true;
  const keys = (e) => {
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return;
    const f = [...d.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  };
  const close = () => { d.remove(); app.inert = false; document.body.classList.remove('ovopen', 'pe'); document.removeEventListener('keydown', keys); if (back?.isConnected) back.focus(); };
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', keys);
  d.focus(); // Fokus in den Dialog, ohne auf dem Handy die Tastatur zu öffnen; Tab führt zum ersten Feld
  return { d, close };
}

/* ---------- Rückmeldung zum Objekt (Prüfung / Finanzierung / Reservierung) ---------- */
async function fbSend(ev) {
  const body = await sealFeedback(ctx.sess.fb.pub, ev);
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  let r;
  try {
    r = await fetch(`https://api.github.com/repos/${REPO}/issues`, { method: 'POST', signal: ctl.signal, headers: { Authorization: 'Bearer ' + ctx.sess.fb.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Rückmeldung', body }) });
  } catch (x) {
    throw new Error(x?.name === 'AbortError' ? 'Die Übermittlung dauert zu lange.' : 'Keine Verbindung zum Server – bitte Internetverbindung prüfen.');
  } finally { clearTimeout(timer); }
  if (r.ok) return;
  const limit = r.status === 429 || (r.status === 403 && (r.headers.get('x-ratelimit-remaining') === '0' || r.headers.get('retry-after')));
  throw new Error(limit ? 'Gerade gehen zu viele Rückmeldungen ein – bitte in ein paar Minuten erneut versuchen.'
    : r.status === 401 || r.status === 403 ? 'Der Zugang für die Direktübermittlung ist abgelaufen oder gesperrt – bitte melden Sie das Ihrem Ansprechpartner.'
    : r.status === 404 ? 'Der Empfangskanal wurde nicht gefunden – bitte melden Sie das Ihrem Ansprechpartner.'
    : r.status === 422 ? 'Die Rückmeldung wurde abgelehnt.'
    : r.status >= 500 ? 'Der Server ist gerade nicht erreichbar.'
    : `Die Rückmeldung konnte nicht übermittelt werden (Fehler ${r.status}).`);
}

async function fbRetry(b) {
  const l = fbMine(), e = l.find((x) => x.id === b.dataset.retry);
  if (!e || !ctx.sess.fb?.token || b.disabled) return;
  b.disabled = true; b.textContent = 'Sende …';
  try {
    const { sent, ...ev } = e; await fbSend(ev);
    lsSet(fbKey(), fbMine().map((x) => (x.id === e.id ? { ...x, sent: true } : x)));
    note('Rückmeldung übermittelt.');
  } catch (x) { b.disabled = false; b.textContent = 'Erneut senden'; return alert(x.message); }
  const y = window.scrollY; render(); window.scrollTo(0, y);
}

function feedbackOpen(o) {
  const a = ansp(o), direct = !!ctx.sess.fb?.token;
  const mine = chains(fbMine().filter((e) => e.oid === o.id));
  const { d, close } = overlay(`<form class="ov-box" id="fbF"><button type="button" class="x" data-close aria-label="Schließen">×</button>
    <span class="eyebrow">Rückmeldung</span><h2>${esc(o.strasse)} · ${esc(o.lage)}</h2>
    <p class="hint">Teilen Sie uns den Stand Ihres Interessenten mit – ${esc(a.name)} sieht das sofort im Überblick.</p>
    <fieldset class="stg">${STAGES.map((s, i) => `<label class="stgo" style="--c:${s.color}"><input type="radio" name="st" value="${s.id}"${i === 0 ? ' checked' : ''}><span><b>${esc(s.label)}</b><small>${esc(s.hint)}</small></span></label>`).join('')}</fieldset>
    ${mine.length ? `<div class="fbq"><small>Bestehenden Interessenten aktualisieren:</small>${mine.map((e) => `<button type="button" class="chip" data-k="${esc(e.k)}">${esc(e.k || 'Interessent')}</button>`).join('')}</div>` : ''}
    <label class="f"><span>Interessent (Name oder Kürzel, z. B. „Fam. M.“)</span><input name="k" maxlength="60" autocomplete="off" required></label>
    <label class="f"><span>Notiz (optional)</span><textarea name="n" rows="3" maxlength="400" placeholder="z. B. Finanzierungszusage bis Freitag, Besichtigung am 14.11. …"></textarea></label>
    <p class="lg-err hidden" id="fbErr" role="alert"></p>
    <div class="acts"><button class="btn fill" id="fbGo">${direct ? 'Rückmeldung senden' : 'Rückmeldung speichern'}</button></div></form>`);
  const form = d.querySelector('#fbF'), err = (t) => { const p = d.querySelector('#fbErr'); p.textContent = t; p.classList.toggle('hidden', !t); };
  d.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { form.k.value = b.dataset.k; }));
  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err('');
    const st = form.st.value, k = form.k.value.trim(), n = form.n.value.trim();
    if (!k) return err(st === 'reserviert' ? 'Bitte Namen oder Kürzel des Kunden angeben, der zugesagt hat.' : 'Bitte Namen oder Kürzel des Interessenten angeben.');
    if (busy) return; busy = true;
    const ev = { id: Date.now().toString(36) + randomId(), t: Date.now(), pid: ctx.sess.id, pn: ctx.sess.n || 'Partner', oid: o.id, on: `${o.strasse} · ${o.lage}`, st, k, n };
    const go = d.querySelector('#fbGo'); go.disabled = true; go.textContent = 'Sende …';
    let sent = false, problem = '';
    if (direct) { try { await fbSend(ev); sent = true; } catch (x) { problem = x.message; } }
    lsSet(fbKey(), [...fbMine(), { ...ev, sent }]);
    const text = `Rückmeldung zum Objekt ${ev.on}\nStand: ${stageOf(st).label}${k ? '\nInteressent: ' + k : ''}\nVertrieb: ${ev.pn}${n ? '\n' + n : ''}\n(${datum(ev.t)})`;
    const wa = isMobil(a.tel) ? `<a class="btn ${sent ? 'ghost' : 'fill'}" target="_blank" rel="noopener noreferrer" href="https://wa.me/${waNr(a.tel)}?text=${encodeURIComponent(text)}">${sent ? 'Zusätzlich per WhatsApp an ' + esc(a.name.split(' ')[0]) : 'Per WhatsApp senden'}</a>` : '';
    const mail = a.mail ? `<a class="btn ${sent || wa ? 'ghost' : 'fill'}" href="mailto:${esc(a.mail)}?subject=${encodeURIComponent('Rückmeldung ' + o.strasse)}&body=${encodeURIComponent(text)}">Per E-Mail senden</a>` : '';
    form.outerHTML = `<div class="ov-box"><button type="button" class="x" data-close aria-label="Schließen">×</button><span class="eyebrow">${sent ? 'Gesendet' : 'Gespeichert'}</span><h2>${sent ? '✓ Danke – ist angekommen' : 'Bitte noch abschicken'}</h2>
      <p class="hint">${sent ? `Ihre Rückmeldung „${esc(stageOf(st).short)}“ ist bei ${esc(a.name)} im Überblick. Für eilige Fälle (z. B. Reservierung) können Sie zusätzlich direkt schreiben.` : esc(problem || 'Die Direktübermittlung ist noch nicht eingerichtet.') + ' Damit die Rückmeldung ankommt, schicken Sie sie bitte jetzt direkt:'}</p>
      <div class="acts">${wa}${mail}<a class="btn ghost" href="tel:+${waNr(a.tel)}">Anrufen</a><button class="btn dark" data-close>Fertig</button></div></div>`;
    d.focus();
    if (document.getElementById('cards')) { const y = window.scrollY; render(); window.scrollTo(0, y); }
  });
}

/* ---------- Druckansicht der Projekte ---------- */
const printTitle = document.title;
window.addEventListener('afterprint', () => { document.body.classList.remove('pe'); document.getElementById('ov-auto')?.remove(); document.title = printTitle; });
// Strg+P / Menü „Drucken“ direkt auf der Übersicht: sauberes Druckdokument (wie „Drucken / PDF“) statt der dunklen Bildschirmansicht
window.addEventListener('beforeprint', () => {
  if (!ctx.sess || !ctx.data?.objekte?.length || ctx.view === 'admin' || document.body.classList.contains('pe') || document.getElementById('ov')) return;
  const d = document.createElement('div'); d.id = 'ov-auto'; d.className = 'ov ov-ex';
  d.innerHTML = `<div class="ex-wrap"><article class="ex pv">${printHtml(visible(), true)}</article></div>`;
  document.body.appendChild(d); document.body.classList.add('pe');
  document.title = `Vertriebsübersicht Hof – Stand ${ctx.data.stand || datum(Date.now())}`;
});

function printHtml(list, det) {
  const stand = ctx.data.stand || datum(Date.now());
  const rows = list.map((o) => {
    const k = kennzahlen(o), v = o.vs || 'frei';
    return `<tr><td><b>${esc(o.strasse)}</b><small>${esc(o.lage)}</small></td><td>${num(o.flaeche)} m²<small>${zim(o.zimmer)} Zimmer</small></td><td>${eur(o.miete)}<small>${esc(o.mieteTyp)}</small></td><td><b>${eur(o.preis)}</b><small>${eur(k.preisQm)} / m²</small></td><td>${num(k.rendite)} %<small>Faktor ${num(k.faktor, 1)}</small></td><td>${esc(VSTATUS[v] ?? v)}<small>${esc(o.status.label)}</small></td></tr>`;
  }).join('');
  const details = det ? list.map((o) => {
    const k = kennzahlen(o);
    const steps = o.schritte.map((s) => `<li class="${esc(s.state)}"><span class="dot">${s.state === 'done' ? '✓' : ''}</span><b>${esc(s.label)}</b><em>${s.state === 'current' && s.label === 'Sanierung' ? o.fortschritt + ' %' : esc(s.datum ?? '')}</em></li>`).join('');
    return `<section class="pv-o"><img src="${esc(o.bild)}" alt=""><div><h2>${esc(o.strasse)} <span>· ${esc(o.lage)}</span></h2><p class="pv-m">Bj. ${esc(o.baujahr)} · Energie ${esc(o.energie)} · Hausgeld ${eur(o.hausgeld)} · ${num(o.flaeche)} m² · ${zim(o.zimmer)} Zimmer</p>
      <p>${esc(o.ort)}</p><p class="pv-m">${o.tags.map(esc).join(' · ')}</p>
      <p class="pv-k"><span>Kaltmiete <b>${eur(o.miete)}</b> (${esc(o.mieteTyp)})</span><span>Abgabepreis <b>${eur(o.preis)}</b></span><span>Rendite <b>${num(k.rendite)} %</b></span></p>
      <p>${esc(o.sanierung)}</p>${o.hinweis ? `<p class="note">${esc(o.hinweis)}</p>` : ''}<ol class="steps">${steps}</ol></div></section>`;
  }).join('') : '';
  return `<header class="ex-h"><div><small>Vertriebsübersicht · Stand ${esc(stand)}</small><h1>Eigentumswohnungen in Hof</h1><p>Kapitalanlage-Objekte · ${list.length} ${list.length === 1 ? 'Einheit' : 'Einheiten'}</p></div>
    <div class="ex-by"><b>${esc(KONTAKT.firma)}</b><span>Ansprechpartner: ${esc(ANSP.name)}</span><span>${esc(ANSP.tel)}</span></div></header>
    ${list.length ? `<table class="pv-t"><thead><tr><th>Objekt</th><th>Fläche</th><th>Kaltmiete</th><th>Abgabepreis</th><th>Rendite p. a.</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="hint">Keine Objekte für diese Auswahl.</p>'}
    ${details}
    <p class="ex-f">Kaltmiete: IST = laut Mietvertrag · SOLL = kalkulierte Marktmiete · PLAN = Planwert vor Sanierung. Rendite = Jahreskaltmiete inkl. Garage/Stellplatz ÷ Abgabepreis. Alle Angaben laut Exposés und Objektunterlagen, ohne Gewähr. Der Abgabepreis gilt für Vertriebspartner und ist vertraulich. Stand ${datum(Date.now())}.</p>`;
}

function printOpen(auswahl) {
  const einzel = Array.isArray(auswahl), list = nachStatus(einzel ? auswahl : visible());
  const titel = einzel && list.length === 1 ? `Datenblatt ${list[0].strasse} ${list[0].lage}` : `Vertriebsübersicht Hof – Stand ${ctx.data.stand || datum(Date.now())}`;
  const { d } = overlay(`<button class="ex-x" data-close aria-label="Schließen">×</button><div class="ex-wrap"><div class="ex-bar">
      <label class="chk"><input type="checkbox" id="pvDet" checked> Mit Objektdetails (Foto, Sanierung, Zeitplan)</label>
      <div class="acts"><button class="btn fill sm" id="pvPrint">Drucken / als PDF speichern</button><button class="btn ghost sm" data-close>Schließen</button></div>
      <p class="hint">${einzel ? 'Datenblatt für dieses Objekt.' : 'Es wird die aktuell gefilterte und sortierte Auswahl gedruckt (freie Objekte zuerst, reservierte am Ende).'} Im Druckdialog „Als PDF sichern“ wählen, um eine Datei zu erhalten. Die Abgabepreise sind vertraulich.</p></div>
    <article class="ex pv" id="pvDoc"></article></div>`, 'ov-ex', einzel ? 'Datenblatt' : 'Drucken / PDF');
  const doc = d.querySelector('#pvDoc'), det = d.querySelector('#pvDet');
  const draw = () => { doc.innerHTML = printHtml(list, det.checked); };
  det.addEventListener('change', draw);
  d.querySelector('#pvPrint').addEventListener('click', () => {
    document.body.classList.add('pe'); document.title = titel;
    window.print();
  });
  draw();
}

/* ---------- Kunden-Exposé mit eigenem Aufschlag ---------- */
function exposeOpen(o) {
  const profKey = 'nf-expose-prof-' + ctx.sess.id;
  const prof = lsGet(profKey) ?? { firma: ctx.sess.r === 'partner' ? ctx.sess.n : '', tel: '', mail: '', pct: 3.57 };
  const { d } = overlay(`<button class="ex-x" data-close aria-label="Schließen">×</button><div class="ex-wrap"><div class="ex-bar"><div class="ex-form">
      <label class="f"><span>Ihre Firma / Name</span><input data-p="firma" value="${esc(prof.firma)}"></label>
      <label class="f"><span>Telefon</span><input data-p="tel" value="${esc(prof.tel)}" inputmode="tel"></label>
      <label class="f"><span>E-Mail</span><input data-p="mail" value="${esc(prof.mail)}" inputmode="email"></label>
      <label class="f"><span>Ihr Aufschlag (% auf den Abgabepreis)</span><input data-p="pct" type="text" inputmode="decimal" autocomplete="off" value="${esc(String(prof.pct).replace('.', ','))}" aria-describedby="exPctErr"></label>
      <p class="lg-err hidden" id="exPctErr" role="alert">Bitte einen Aufschlag zwischen 0 und 50 % eintragen, z. B. 3,57.</p></div>
      <div class="acts"><button class="btn fill sm" id="exPrint">Drucken / als PDF speichern</button><button class="btn ghost sm" data-close>Schließen</button></div>
      <p class="hint">Der Kunde sieht nur den Kaufpreis inklusive Ihres Aufschlags – Abgabepreis und Aufschlag werden nicht getrennt ausgewiesen. Ihre Eingaben bleiben nur in diesem Browser.</p></div>
    <article class="ex" id="exDoc"></article></div>`, 'ov-ex', 'Kunden-Exposé');
  const doc = d.querySelector('#exDoc');
  const pctOf = (v) => { const t = v.trim().replace(/\s|%/g, '').replace(',', '.'); const n = /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN; return n >= 0 && n <= 50 ? n : null; };
  const read = () => { const g = (k) => d.querySelector(`[data-p=${k}]`).value.trim(); return { firma: g('firma'), tel: g('tel'), mail: g('mail'), pct: pctOf(g('pct')) }; };
  const draw = () => {
    const p = read(), bad = p.pct === null;
    d.querySelector('#exPctErr').classList.toggle('hidden', !bad); d.querySelector('#exPrint').disabled = bad;
    if (bad) { doc.innerHTML = '<p class="hint">Bitte oben einen gültigen Aufschlag eintragen – ohne ihn wird kein Kaufpreis angezeigt.</p>'; return; }
    lsSet(profKey, p); doc.innerHTML = exposeHtml(o, p);
  };
  d.querySelector('.ex-form').addEventListener('input', draw);
  d.querySelector('#exPrint').addEventListener('click', () => { document.body.classList.add('pe'); window.print(); });
  draw();
}
function exposeHtml(o, p) {
  const preis = Math.round(o.preis * (1 + p.pct / 100)), kz = kennzahlen({ ...o, preis });
  const steps = o.schritte.map((s) => `<li class="${esc(s.state)}"><span class="dot">${s.state === 'done' ? '✓' : ''}</span><b>${esc(s.label)}</b><em>${s.state === 'current' && s.label === 'Sanierung' ? o.fortschritt + ' %' : esc(s.datum ?? '')}</em></li>`).join('');
  return `<header class="ex-h"><div><small>Kapitalanlage · Eigentumswohnung in Hof</small><h1>${esc(o.strasse)} <span>· ${esc(o.lage)}</span></h1><p>${esc(o.ort)}</p></div>
    ${p.firma || p.tel || p.mail ? `<div class="ex-by">${p.firma ? `<b>${esc(p.firma)}</b>` : ''}${p.tel ? `<span>${esc(p.tel)}</span>` : ''}${p.mail ? `<span>${esc(p.mail)}</span>` : ''}</div>` : ''}</header>
    <img class="ex-img" src="${esc(o.bild)}" alt="">
    <ul class="tags">${o.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <div class="kpis ex-k"><div><small>Wohnfläche</small><b>${num(o.flaeche)} m²</b></div>
      <div class="price"><small>Kaufpreis</small><b>${eur(preis)}</b><em>${eur(kz.preisQm)} pro m²</em></div>
      <div><small>Kaltmiete / Mon.</small><b>${eur(o.miete)}</b><em>${esc(o.mieteTyp)}${o.zuschlag ? ` · + ${esc(o.zuschlag.label)} ${eur(o.zuschlag.betrag)}` : ''}</em></div>
      <div><small>Rendite p. a.</small><b>${num(kz.rendite)} %</b><em>Faktor ${num(kz.faktor, 1)}</em></div>
      <div><small>Hausgeld</small><b>${eur(o.hausgeld)}</b><em>pro Monat</em></div></div>
    <div class="ex-cols"><section><h2>Sanierung</h2><p>${esc(o.sanierung)}</p>${o.hinweis ? `<p class="note">${esc(o.hinweis)}</p>` : ''}<p>Baujahr ${esc(o.baujahr)} · Energieklasse ${esc(o.energie)}</p></section>
      <section><h2>Zeitplan</h2><ol class="steps">${steps}</ol></section></div>
    <p class="ex-f">Alle Angaben laut Objektunterlagen, ohne Gewähr. Die Rendite ist eine Beispielrechnung (Jahreskaltmiete ÷ Kaufpreis) und keine Steuer- oder Anlageberatung. Stand ${datum(Date.now())}.</p>`;
}

/* ---------- Start ---------- */
(async () => {
  try {
    ctx.pkg = await loadPackage();
  } catch (e) {
    app.innerHTML = `<main class="lg"><div class="lg-card"><h1>Nicht erreichbar</h1><p class="lg-sub">${esc(e.message)}. Bitte später erneut versuchen.</p></div></main>`;
    return;
  }
  // 1) Einladungslink: #<id>.<code>
  const h = safeDecode(location.hash.slice(1));
  const dot = h.indexOf('.');
  if (dot > 0) {
    const slot = ctx.pkg.slots.find((s) => s.id === h.slice(0, dot));
    if (slot) {
      app.innerHTML = '<main class="lg"><div class="lg-card"><p class="lg-sub">Zugang wird geprüft …</p></div></main>';
      const code = h.slice(dot + 1).replace(/[\u200b-\u200d\u2060\ufeff]/g, '').trim();
      const payload = await openSlot(code, slot, ctx.pkg.iter);
      if (payload) return enter(payload, code, slot.id);
      history.replaceState(null, '', location.pathname);
      return showLogin('Dieser Einladungslink ist nicht mehr gültig.');
    }
  }
  // 2) laufende Sitzung in diesem Tab
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
    if (s?.keys) {
      ctx.sess = s;
      ctx.seen = Number(sessionStorage.getItem('nf-seen-ctx')) || Date.now();
      if (s.sig === sigOf(ctx.pkg)) ctx.data = pflege(await openObjects(s, ctx.pkg));
      else if (!(await reopen(ctx.pkg))) { ctx.sess = null; try { sessionStorage.removeItem(SESSION); } catch { /* egal */ } return showLogin('Ihr Zugang wurde geändert. Bitte neu anmelden.'); }
      return render();
    }
  } catch { try { sessionStorage.removeItem(SESSION); } catch { /* egal */ } }
  showLogin(takeFlash());
})();
