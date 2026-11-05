// Partnerbereich: lädt die verschlüsselte Datei, entschlüsselt sie im Browser und zeigt die Übersicht.
import { openJson, openSlot } from './crypto.js';

const app = document.getElementById('app');
const KONTAKT = { firma: 'Norderfranken Haus und Grund GmbH', adresse: 'Am Gewerbegebiet 5 · 95185 Gattendorf', tel: '09281 979 9759', telHref: '+4992819799759', mail: 'info@norderfranken.de', web: 'www.norderfranken.de' };
const SESSION = 'nf-partner-session';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const eur = (n) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €';
const num = (n, d = 2) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

export function kennzahlen(o) {
  const jahresmiete = (o.miete + (o.zuschlag?.betrag ?? 0)) * 12;
  return { preisQm: o.preis / o.flaeche, mieteQm: o.miete / o.flaeche, rendite: (jahresmiete / o.preis) * 100, faktor: o.preis / jahresmiete };
}

const ctx = { pkg: null, sess: null, data: null, view: 'start', filter: 'alle', sort: 'standard', q: '' };

async function loadPackage() {
  const r = await fetch('data.enc.json?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Daten konnten nicht geladen werden (' + r.status + ')');
  return r.json();
}

async function enter(payload, code, id) {
  ctx.sess = { ...payload, code, id };
  ctx.data = await openJson(payload.k, ctx.pkg.data);
  try { sessionStorage.setItem(SESSION, JSON.stringify(ctx.sess)); } catch { /* privater Modus */ }
  if (location.hash) history.replaceState(null, '', location.pathname);
  ctx.view = 'start';
  render();
}

function logout() {
  try { sessionStorage.removeItem(SESSION); } catch { /* egal */ }
  ctx.sess = ctx.data = null;
  history.replaceState(null, '', location.pathname);
  showLogin();
}

/* ---------- Anmeldung ---------- */
function showLogin(msg = '', busy = false) {
  app.innerHTML = `
  <main class="lg"><div class="lg-card">
    <img src="logo.svg" alt="Norderfranken Haus & Grund" class="lg-logo">
    <span class="eyebrow">Partnerbereich</span>
    <h1>Vertriebsübersicht</h1>
    <p class="lg-sub">Vertraulicher Zugang für unsere Vertriebspartner. Bitte Zugangscode oder Passwort eingeben.</p>
    <form class="lg-form" id="loginForm" autocomplete="off">
      <label for="pw">Zugangscode oder Passwort</label>
      <input id="pw" type="password" autocomplete="current-password" required maxlength="200" ${busy ? 'disabled' : ''}>
      ${msg ? `<p class="lg-err" role="alert">${esc(msg)}</p>` : ''}
      <button class="btn fill" ${busy ? 'disabled' : ''}>${busy ? 'Prüfe …' : 'Anmelden'}</button>
    </form>
    <p class="lg-foot">Kein Zugang? Rufen Sie uns an: ${KONTAKT.tel}</p>
  </div></main>`;
  const f = document.getElementById('loginForm');
  document.getElementById('pw').focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    let code = document.getElementById('pw').value.trim();
    let only = null;
    const dot = code.indexOf('.');
    if (dot > 0 && ctx.pkg.slots.some((s) => s.id === code.slice(0, dot))) { only = code.slice(0, dot); code = code.slice(dot + 1); }
    showLogin('', true);
    for (const slot of ctx.pkg.slots) {
      if (only && slot.id !== only) continue;
      const payload = await openSlot(code, slot, ctx.pkg.iter);
      if (payload) return enter(payload, code, slot.id);
    }
    showLogin('Zugangscode oder Passwort nicht korrekt.');
  });
}

/* ---------- Übersicht ---------- */
const FILTER = [
  ['alle', 'Alle', () => true],
  ['fertig', 'Saniert', (o) => o.fortschritt === 100],
  ['arbeit', 'In Sanierung', (o) => o.fortschritt > 0 && o.fortschritt < 100],
  ['vorbereitung', 'In Vorbereitung', (o) => o.fortschritt === 0],
];

function karte(o) {
  const k = kennzahlen(o);
  const subject = encodeURIComponent(`Anfrage ${o.strasse}, ${o.lage}`);
  const steps = o.schritte.map((s) => `
    <li class="${esc(s.state)}"><span class="dot">${s.state === 'done' ? '✓' : ''}</span><b>${esc(s.label)}</b>
    <em>${s.state === 'current' && s.label === 'Sanierung' ? o.fortschritt + ' %' : esc(s.datum ?? '')}</em></li>`).join('');
  return `
  <article class="card">
    <div class="photo"><img src="${esc(o.bild)}" alt="${esc(o.strasse + ', ' + o.lage)}" loading="lazy"><span class="pill ${esc(o.status.tone)}"><i></i>${esc(o.status.label)}</span></div>
    <div class="body">
      <div class="head"><h2>${esc(o.strasse)} <span>· ${esc(o.lage)}</span></h2><span class="meta">Bj. ${esc(o.baujahr)} · Energie ${esc(o.energie)} · Hausgeld ${eur(o.hausgeld)}</span></div>
      <p class="ort">${esc(o.ort)}</p>
      <ul class="tags">${o.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <div class="kpis">
        <div><small>Wohnfläche</small><b>${num(o.flaeche)} m²</b><em>${esc(o.zimmer)} Zimmer</em></div>
        <div><small>Kaltmiete / Mon.</small><b>${eur(o.miete)} <u class="tag ${esc(o.mieteTyp.toLowerCase())}">${esc(o.mieteTyp)}</u></b><em>${num(k.mieteQm)} €/m²${o.zuschlag ? ` · + ${esc(o.zuschlag.label)} ${esc(o.zuschlag.betrag)} €` : ''}</em></div>
        <div class="price"><small>Abgabepreis</small><b>${eur(o.preis)}</b><em>${esc(o.preisHinweis)}</em></div>
        <div><small>Abgabepreis / m²</small><b>${eur(k.preisQm)}</b><em>pro m² Wohnfläche</em></div>
        <div><small>Rendite p. a.</small><b>${num(k.rendite)} %</b><em>Faktor ${num(k.faktor, 1)}</em></div>
      </div>
      <div class="lower">
        <div class="san">
          <div class="san-h"><small>Sanierungsstand</small><b class="${esc(o.status.tone)}">${o.fortschritt} %</b></div>
          <div class="bar-t"><i class="${esc(o.status.tone)}" style="width:${o.fortschritt}%"></i></div>
          <p>${esc(o.sanierung)}</p><p class="note">${esc(o.hinweis)}</p>
        </div>
        <ol class="steps">${steps}</ol>
      </div>
      <a class="ask" href="mailto:${KONTAKT.mail}?subject=${subject}">Objekt anfragen →</a>
    </div>
  </article>`;
}

function listeHtml() {
  const t = FILTER.find((f) => f[0] === ctx.filter)[2];
  const s = ctx.q.trim().toLowerCase();
  const l = ctx.data.objekte.filter((o) => t(o) && (!s || `${o.strasse} ${o.lage} ${o.tags.join(' ')}`.toLowerCase().includes(s)));
  if (ctx.sort === 'preis') l.sort((a, b) => a.preis - b.preis);
  if (ctx.sort === 'rendite') l.sort((a, b) => kennzahlen(b).rendite - kennzahlen(a).rendite);
  if (ctx.sort === 'flaeche') l.sort((a, b) => b.flaeche - a.flaeche);
  return l.length ? l.map(karte).join('') : '<p class="empty">Keine Objekte für diese Auswahl.</p>';
}

function header() {
  return `<header class="top"><div class="wrap top-in"><img src="logo.svg" alt="Norderfranken Haus & Grund" class="top-logo">
    <div class="top-r"><span class="top-user">Angemeldet: ${esc(ctx.sess.n || (ctx.sess.r === 'admin' ? 'Master' : 'Partner'))}</span>
    ${ctx.sess.r === 'admin' ? '<button class="btn dark sm" id="toAdmin">Verwaltung</button>' : ''}
    <button class="btn ghost sm" id="print">Drucken / PDF</button><button class="btn dark sm" id="logout">Abmelden</button></div></div></header>`;
}

function render() {
  if (ctx.view === 'admin') return import('./admin.js').then((m) => m.mount({ app, ctx, render: () => { ctx.view = 'start'; render(); }, logout, header }));
  const objs = ctx.data.objekte;
  const fl = objs.map((o) => o.flaeche);
  const stats = objs.length ? { n: objs.length, min: Math.round(Math.min(...fl)), max: Math.round(Math.max(...fl)), ab: Math.min(...objs.map((o) => o.preis)) } : { n: 0, min: 0, max: 0, ab: 0 };
  app.innerHTML = `${header()}
  <section class="hero"><div class="wrap"><span class="eyebrow">Vertriebsübersicht · Stand ${esc(ctx.data.stand)}</span>
    <h1>Eigentumswohnungen in Hof</h1>
    <p class="lead">Unsere aktuellen Kapitalanlage-Objekte auf einen Blick – provisionsfrei für Ihre Käufer, mit Kennzahlen, Sanierungsstand und Zeitplan.</p>
    <dl class="stats"><div><dt>Wohnungen</dt><dd>${stats.n}</dd></div><div><dt>Wohnfläche</dt><dd>${stats.min}–${stats.max} m²</dd></div><div><dt>Abgabepreis ab</dt><dd>${eur(stats.ab)}</dd></div></dl></div></section>
  <main class="wrap list-wrap">
    <div class="bar"><div class="chips" id="chips">${FILTER.map((f) => `<button class="chip${ctx.filter === f[0] ? ' on' : ''}" data-f="${f[0]}">${f[1]}</button>`).join('')}</div>
      <div class="tools"><input type="search" id="q" placeholder="Suchen, z. B. Jahnstraße, Garage …" value="${esc(ctx.q)}" aria-label="Suchen">
      <select id="sort" aria-label="Sortieren">${[['standard', 'Sortierung: Standard'], ['preis', 'Preis aufsteigend'], ['rendite', 'Rendite absteigend'], ['flaeche', 'Wohnfläche absteigend']].map(([v, l]) => `<option value="${v}"${ctx.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="cards" id="cards">${listeHtml()}</div>
    <p class="legend">Kaltmiete: <b>IST</b> = laut Mietvertrag · <b>SOLL</b> = kalkulierte Marktmiete (unvermietet) · <b>PLAN</b> = Planwert vor Sanierung. Rendite = Jahreskaltmiete inkl. Garage/Stellplatz ÷ Abgabepreis. Alle Angaben laut Exposés und Objektunterlagen, ohne Gewähr. Vollständige Unterlagen im Datenraum.</p>
  </main>
  <footer class="foot"><div class="wrap foot-in"><span><b>${KONTAKT.firma}</b> · ${KONTAKT.adresse}</span><span><a href="tel:${KONTAKT.telHref}">${KONTAKT.tel}</a> · <a href="mailto:${KONTAKT.mail}">${KONTAKT.mail}</a> · ${KONTAKT.web}</span></div></footer>`;
  const refresh = () => { document.getElementById('cards').innerHTML = listeHtml(); };
  document.getElementById('chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    ctx.filter = b.dataset.f;
    document.querySelectorAll('#chips .chip').forEach((c) => c.classList.toggle('on', c === b));
    refresh();
  });
  document.getElementById('q').addEventListener('input', (e) => { ctx.q = e.target.value; refresh(); });
  document.getElementById('sort').addEventListener('change', (e) => { ctx.sort = e.target.value; refresh(); });
  document.getElementById('print').addEventListener('click', () => window.print());
  document.getElementById('logout').addEventListener('click', logout);
  document.getElementById('toAdmin')?.addEventListener('click', () => { ctx.view = 'admin'; render(); window.scrollTo(0, 0); });
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
  const h = decodeURIComponent(location.hash.slice(1));
  const dot = h.indexOf('.');
  if (dot > 0) {
    const slot = ctx.pkg.slots.find((s) => s.id === h.slice(0, dot));
    if (slot) {
      app.innerHTML = '<main class="lg"><div class="lg-card"><p class="lg-sub">Zugang wird geprüft …</p></div></main>';
      const code = h.slice(dot + 1);
      const payload = await openSlot(code, slot, ctx.pkg.iter);
      if (payload) return enter(payload, code, slot.id);
      history.replaceState(null, '', location.pathname);
      return showLogin('Dieser Einladungslink ist nicht mehr gültig.');
    }
  }
  // 2) laufende Sitzung in diesem Tab
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
    if (s?.k) {
      ctx.data = await openJson(s.k, ctx.pkg.data);
      ctx.sess = s;
      return render();
    }
  } catch { try { sessionStorage.removeItem(SESSION); } catch { /* egal */ } }
  showLogin();
})();
