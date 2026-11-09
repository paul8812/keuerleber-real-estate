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
export const waNr = (t) => { const d = String(t ?? '').replace(/[^\d+]/g, ''); return d.startsWith('+') ? d.slice(1) : d.startsWith('00') ? d.slice(2) : d.startsWith('0') ? '49' + d.slice(1) : d; };
const ansp = (o) => ({ name: o.ansp?.name || ANSP.name, tel: o.ansp?.tel || ANSP.tel, mail: o.ansp?.mail || (o.ansp?.tel ? '' : ANSP.mail) });
const isMobil = (t) => /^(\+49|0049|0)\s*1[5-7]/.test(String(t).replace(/[\s()\-\/]/g, ''));
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus */ } };
const datum = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const eur = (n) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €';
const num = (n, d = 2) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

export function kennzahlen(o) {
  const jahresmiete = (o.miete + (o.zuschlag?.betrag ?? 0)) * 12;
  return { preisQm: o.preis / o.flaeche, mieteQm: o.miete / o.flaeche, rendite: (jahresmiete / o.preis) * 100, faktor: o.preis / jahresmiete };
}

const logo = (cls) => `<img src="logo-weiss.svg" alt="Norderfranken Haus & Grund" class="${cls} logo-w"><img src="logo.svg" alt="Norderfranken Haus & Grund" class="${cls} logo-d">`;
const ICON = {
  haus: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  lupe: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
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

const ctx = { mode: 'karten', pkg: null, sess: null, data: null, view: 'start', filter: 'alle', sort: 'standard', q: '', budget: 0, rend: 0, zi: 0 };

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
  ctx.data = await openObjects(payload, pkg);
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
  if (!(await reopen(pkg))) {
    try { sessionStorage.removeItem(SESSION); } catch { /* egal */ }
    ctx.sess = ctx.data = null;
    return showLogin('Ihr Zugang wurde geändert. Bitte neu anmelden.');
  }
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
  try { sessionStorage.setItem('nf-seen-ctx', String(ctx.seen)); } catch { /* egal */ }
  ctx.data = await openObjects(payload, ctx.pkg);
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
    <p class="lg-foot">Kein Zugang? Rufen Sie Sebastian Sultanow an: ${KONTAKT.tel}</p>
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
  ['frei', 'Frei', (o) => !o.vs || o.vs === 'frei'],
  ['neu', 'Neu / geändert', (o) => isNeu(o)],
  ['fav', '★ Favoriten', (o) => favs().includes(o.id)],
  ['fertig', 'Saniert', (o) => o.fortschritt === 100],
  ['arbeit', 'In Sanierung', (o) => o.fortschritt > 0 && o.fortschritt < 100],
  ['vorbereitung', 'In Vorbereitung', (o) => o.fortschritt === 0],
];

const favs = () => lsGet('nf-fav-' + ctx.sess.id) ?? [];
const fbKey = () => 'nf-fb-' + ctx.sess.id;
const fbMine = () => lsGet(fbKey()) ?? [];

function fbBlock(o) {
  const mine = chains(fbMine().filter((e) => e.oid === o.id));
  if (!mine.length) return '';
  return `<div class="fbl"><small>Ihre Rückmeldungen</small>${mine.map((e) => { const s = stageOf(e.st); return `<span class="fbc" style="--c:${s.color}"><i></i><b>${esc(e.k || 'Interessent')}</b> ${esc(s.short)} <em>${datum(e.t)}${e.sent === false ? ' · nur lokal' : ''}</em></span>`; }).join('')}</div>`;
}

const isNeu = (o) => o.t && o.t > (ctx.seen ?? Infinity);

function karte(o) {
  const k = kennzahlen(o);
  const steps = o.schritte.map((s) => `
    <li class="${esc(s.state)}"><span class="dot">${s.state === 'done' ? '✓' : ''}</span><b>${esc(s.label)}</b>
    <em>${s.state === 'current' && s.label === 'Sanierung' ? o.fortschritt + ' %' : esc(s.datum ?? '')}</em></li>`).join('');
  const a = ansp(o), docs = o.docs ?? [], vs = o.vs || 'frei';
  const sold = vs === 'verkauft';
  return `
  <article class="card${sold ? ' sold' : ''}" data-oid="${esc(o.id)}">
    <div class="photo"><img src="${esc(o.bild)}" alt="${esc(o.strasse + ', ' + o.lage)}" loading="lazy"><button class="fav${favs().includes(o.id) ? ' on' : ''}" data-fav="${esc(o.id)}" aria-pressed="${favs().includes(o.id)}" aria-label="Als Favorit merken">★</button><span class="pill ${esc(o.status.tone)}"><i></i>${esc(o.status.label)}</span>${vBadge(o)}${isNeu(o) ? `<span class="neu">${esc(o.aend || 'Aktualisiert')}</span>` : ''}</div>
    <div class="body">
      <div class="head"><h2>${esc(o.strasse)} <span>· ${esc(o.lage)}</span></h2><span class="meta">${esc(o.zimmer)} Zi. · Bj. ${esc(o.baujahr)} · Energie ${esc(o.energie)} · Hausgeld ${eur(o.hausgeld)}</span></div>
      <div class="kpis">
        <div><small>Wohnfläche</small><b>${num(o.flaeche)} m²</b></div>
        <div><small>Kaltmiete / Mon.</small><b>${eur(o.miete)} <u class="tag ${esc(o.mieteTyp.toLowerCase())}">${esc(o.mieteTyp)}</u></b></div>
        <div class="price"><small>Abgabepreis</small><b>${eur(o.preis)}</b></div>
        <div><small>Rendite p. a.</small><b>${num(k.rendite)} %</b></div>
      </div>
      <div class="san-h"><small>Sanierungsstand</small><b class="${esc(o.status.tone)}">${o.fortschritt} %</b></div>
      <div class="bar-t"><i class="${esc(o.status.tone)}" style="width:${o.fortschritt}%"></i></div>
      <div class="cact">
        <button class="btn fill sm" data-fb="${esc(o.id)}" ${sold ? 'disabled' : ''}>Rückmeldung</button>
        <button class="btn dark sm" data-ex="${esc(o.id)}">Exposé</button>
        <a class="btn ghost sm" href="tel:+${waNr(a.tel)}">Anrufen</a>
        ${isMobil(a.tel) ? `<a class="btn ghost sm" href="https://wa.me/${waNr(a.tel)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : a.mail ? `<a class="btn ghost sm" href="mailto:${esc(a.mail)}">E-Mail</a>` : ''}
      </div>
      ${fbBlock(o)}
      <details class="dd more"><summary>Details, Zeitplan &amp; Unterlagen</summary>
        <div class="mb">
          <ul class="tags">${o.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
          <p class="ort">${esc(o.ort)}</p>
          <div class="san"><p>${esc(o.sanierung)}</p>${o.hinweis ? `<p class="note">${esc(o.hinweis)}</p>` : ''}<p class="hint">Kaltmiete ${num(k.mieteQm)} €/m²${o.zuschlag ? ` · + ${esc(o.zuschlag.label)} ${esc(o.zuschlag.betrag)} €` : ''} · Abgabepreis ${eur(k.preisQm)}/m²${o.preisHinweis ? ' (' + esc(o.preisHinweis) + ')' : ''} · Faktor ${num(k.faktor, 1)}</p></div>
          <ol class="steps">${steps}</ol>
          <p class="who">Ansprechpartner: <b>${esc(a.name)}</b> · ${esc(a.tel)}</p>
          ${docs.length ? `<details class="dd"><summary>Unterlagen (${docs.length})</summary><div class="doclist">${docs.map((d, i) => `<button class="doc" data-doc="${esc(o.id)}:${i}"><span>${esc(d.n)}</span><small>${Math.max(1, Math.round((d.d.length * 0.75) / 1024))} KB · herunterladen</small></button>`).join('')}</div></details>` : ''}
          <details class="dd calc"><summary>Rechner: Finanzierung &amp; Cashflow</summary>${calcHtml(o)}</details>
        </div>
      </details>
    </div>
  </article>`;
}

function vBadge(o) {
  const v = o.vs || 'frei';
  if (v === 'frei') return '';
  const bis = v === 'reserviert' && o.vbis ? ` · bis ${new Date(o.vbis).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}` : '';
  const abgelaufen = v === 'reserviert' && o.vbis && Date.parse(o.vbis) + 86400000 < Date.now();
  return `<span class="vs ${esc(v)}">${abgelaufen ? 'Reservierung abgelaufen – bitte anfragen' : esc(VSTATUS[v] ?? v) + bis}</span>`;
}

/* ---------- Rechner ---------- */
function calcHtml(o) {
  const nk = 6.5, ek = Math.round((o.preis * nk) / 100 / 100) * 100;
  return `<div class="calc-in" data-p="${o.preis}" data-m="${o.miete + (o.zuschlag?.betrag ?? 0)}" data-h="${o.hausgeld}">
    <label class="f"><span>Kaufnebenkosten (%)</span><input type="number" step="0.1" inputmode="decimal" data-c="nk" value="${nk}"></label>
    <label class="f"><span>Eigenkapital (€)</span><input type="number" step="500" inputmode="numeric" data-c="ek" value="${ek}"></label>
    <label class="f"><span>Zins (% p. a.)</span><input type="number" step="0.05" inputmode="decimal" data-c="zins" value="3.8"></label>
    <label class="f"><span>Tilgung (% p. a.)</span><input type="number" step="0.1" inputmode="decimal" data-c="til" value="2"></label>
    <dl class="c-out"></dl>
    <p class="hint">Vereinfachte, unverbindliche Beispielrechnung vor Steuern (Cashflow = Kaltmiete − Rate − Hausgeld; das Hausgeld ist teilweise umlagefähig). Keine Steuer- oder Finanzierungsberatung.</p></div>`;
}
function calcUpdate(box) {
  const v = (k) => parseFloat(box.querySelector(`[data-c=${k}]`).value.replace(',', '.')) || 0;
  const p = +box.dataset.p, m = +box.dataset.m, h = +box.dataset.h;
  const gesamt = p * (1 + v('nk') / 100), darlehen = Math.max(0, gesamt - v('ek'));
  const rate = (darlehen * (v('zins') + v('til'))) / 100 / 12, cf = m - rate - h;
  const row = (l, x, cls = '') => `<div class="${cls}"><dt>${l}</dt><dd>${x}</dd></div>`;
  box.querySelector('.c-out').innerHTML = row('Gesamtinvestition', eur(gesamt)) + row('Darlehen', eur(darlehen)) + row('Rate / Monat', eur(rate)) +
    row('Kaltmiete / Monat', eur(m)) + row('Hausgeld / Monat', eur(h)) + row('Cashflow / Monat', (cf >= 0 ? '+' : '−') + eur(Math.abs(cf)), cf >= 0 ? 'pos' : 'neg');
}

function filtered() {
  const t = FILTER.find((f) => f[0] === ctx.filter)[2];
  const s = ctx.q.trim().toLowerCase();
  return ctx.data.objekte.filter((o) => t(o) && (!s || `${o.strasse} ${o.lage} ${o.tags.join(' ')}`.toLowerCase().includes(s))
    && (!ctx.budget || o.preis <= ctx.budget) && (!ctx.rend || kennzahlen(o).rendite >= ctx.rend)
    && (!ctx.zi || (ctx.zi === 4 ? o.zimmer >= 4 : o.zimmer === ctx.zi)));
}

function tabelle(l) {
  const rows = l.map((o) => {
    const k = kennzahlen(o), v = o.vs || 'frei';
    return `<tr data-go="${esc(o.id)}" tabindex="0" class="${v === 'verkauft' ? 'sold' : ''}"><td class="t-o" data-l="Objekt"><b>${esc(o.strasse)}</b><small>${esc(o.lage)}</small>${isNeu(o) ? '<span class="neu-s">neu</span>' : ''}</td>
      <td data-l="Fläche">${num(o.flaeche)} m²<small>${esc(o.zimmer)} Zimmer</small></td><td data-l="Kaltmiete">${eur(o.miete)}</td><td class="t-p" data-l="Abgabepreis">${eur(o.preis)}</td>
      <td data-l="€/m²">${eur(k.preisQm)}</td><td data-l="Rendite">${num(k.rendite)} %</td>
      <td data-l="Status"><span class="tvs ${esc(v)}">${esc(VSTATUS[v] ?? v)}</span><small>${esc(o.status.label)}</small></td></tr>`;
  }).join('');
  return `<div class="tbl-w"><table class="tbl"><thead><tr><th>Objekt</th><th>Fläche</th><th>Kaltmiete</th><th>Abgabepreis</th><th>€/m²</th><th>Rendite</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint tbl-h">Zeile antippen für alle Details, Unterlagen und Rechner.</p>`;
}

function visible() {
  const l = filtered();
  if (ctx.sort === 'preis') l.sort((a, b) => a.preis - b.preis);
  if (ctx.sort === 'rendite') l.sort((a, b) => kennzahlen(b).rendite - kennzahlen(a).rendite);
  if (ctx.sort === 'flaeche') l.sort((a, b) => b.flaeche - a.flaeche);
  return l;
}

function listeHtml() {
  const l = visible();
  if (!ctx.data.objekte.length) return '<p class="empty">Für Sie sind aktuell keine Objekte freigegeben. Bitte sprechen Sie Sebastian Sultanow an: ' + KONTAKT.tel + '</p>';
  return l.length ? (ctx.mode === 'tabelle' ? tabelle(l) : l.map(karte).join('')) : '<p class="empty">Keine Objekte für diese Auswahl.<br><button class="btn ghost sm" data-reset>Filter zurücksetzen</button></p>';
}

function header() {
  const hell = document.documentElement.getAttribute('data-theme') === 'light';
  const name = ctx.sess.n || (ctx.sess.r === 'admin' ? 'Master' : 'Partner');
  return `<header class="p-kopf"><div class="wrap p-in"><div class="brand">${logo('top-logo')}
    <div><h1>Partnerbereich</h1><small><b></b>Vertriebsübersicht · Stand <span class="num">${esc(ctx.data.stand || '')}</span></small></div></div>
    <div class="top-r"><span class="top-user">Angemeldet: <b>${esc(name)}</b></span>
    ${ctx.sess.r === 'admin' ? '<button class="btn dark sm" id="toAdmin">Verwaltung</button>' : ''}
    <button class="btn dark sm" id="logout">Abmelden</button>
    <button class="thema" type="button" role="switch" aria-checked="${hell}" aria-label="Helle Darstellung"></button></div></div></header>`;
}

function render() {
  if (ctx.view === 'admin') return import('./admin.js').then((m) => m.mount({ app, ctx, render: () => { ctx.view = 'start'; render(); }, logout, header }));
  const objs = ctx.data.objekte;
  const fl = objs.map((o) => o.flaeche);
  const stats = objs.length ? { n: objs.length, min: Math.round(Math.min(...fl)), max: Math.round(Math.max(...fl)), ab: Math.min(...objs.map((o) => o.preis)) } : { n: 0, min: 0, max: 0, ab: 0 };
  const sp = (t, w, u, q = '', o = {}) => `<${o.f ? 'button type="button" data-f="' + o.f + '"' : 'div'} class="sp${o.summe ? ' summe' : ''}"><div class="sp-t">${t}</div><div class="sp-w${o.null ? ' null' : ''}">${w}</div><div class="sp-u">${u}</div><div class="sp-q">${q || '&nbsp;'}</div></${o.f ? 'button' : 'div'}>`;
  const cnt = (f) => objs.filter(FILTER.find((x) => x[0] === f)[2]).length;
  const rend = objs.length ? objs.reduce((a, o) => a + kennzahlen(o).rendite, 0) / objs.length : 0;
  const nNeu = cnt('neu'), nFrei = cnt('frei'), nRes = objs.filter((o) => ['reserviert', 'notar'].includes(o.vs)).length, nFav = cnt('fav');
  app.innerHTML = `${header()}
  <div class="wrap">
  <section class="held">
    <div><h2>${grussZeit()} <span>${esc(ctx.sess.n || '')}</span></h2><p>${esc(tageLang())} · <span class="num">${stats.n}</span> ${stats.n === 1 ? 'Wohnung' : 'Wohnungen'}</p></div>
    <div class="leit"><p class="eyebrow slogan">Gemeinsam mehr erreichen.</p>
      <label class="suche">${ICON.lupe}<input type="search" id="q" placeholder="Objekt suchen, z. B. Straße, Garage …" value="${esc(ctx.q)}" aria-label="Suchen" autocomplete="off"><kbd>/</kbd></label></div>
  </section>
  <div class="kopfbild" role="img" aria-label="Bürogebäude Norderfranken im Abendlicht"><div class="k-stage"><img src="kopfbild.webp" alt="">
    <svg viewBox="0 0 2000 1125" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="kw" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter><filter id="kl" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"/></filter></defs>
      <polygon class="k-rahmen" points="565,243 936,370 936,516 564,419" pathLength="100" filter="url(#kw)"/>
      <polygon class="k-lauf" points="565,243 936,370 936,516 564,419" pathLength="100" filter="url(#kl)"/></svg></div></div>
  <section class="lage">
    <div class="zeile blau"><div class="z-titel"><span class="z-ic">${ICON.haus}</span><span class="z-txt"><b>Bestand</b><small>Eigentumswohnungen in Hof</small></span></div>
      <div class="z-inhalt"><div class="spalten">
        ${sp('Wohnungen', stats.n, 'für Sie freigegeben', 'Stand ' + esc(ctx.data.stand || ''), { summe: true })}
        ${sp('Wohnfläche', `${stats.min}–${stats.max} <small>&nbsp;m²</small>`, 'je Einheit')}
        ${sp('Abgabepreis ab', eur(stats.ab), 'für Vertriebspartner')}
        ${sp('Ø Rendite', `${num(rend)} <small>&nbsp;%</small>`, 'Jahreskaltmiete ÷ Abgabepreis')}
      </div></div></div>
    <div class="zeile"><div class="z-titel"><span class="z-ic">${ICON.chart}</span><span class="z-txt"><b>Verfügbarkeit</b><small>Antippen zum Filtern</small></span></div>
      <div class="z-inhalt"><div class="spalten">
        ${sp('Frei', nFrei, 'sofort anfragbar', '', { f: 'frei', null: !nFrei })}
        ${sp('Reserviert / Notar', nRes, 'in Abwicklung', '', { null: !nRes })}
        ${sp('Neu / geändert', nNeu, 'seit Ihrem letzten Besuch', '', { f: 'neu', null: !nNeu })}
        ${sp('Favoriten', nFav, 'von Ihnen gemerkt', '', { f: 'fav', null: !nFav })}
      </div></div></div>
  </section>
  </div>
  <main class="wrap list-wrap">
    <div class="banner">Objekte in Hof <span>${stats.n} ${stats.n === 1 ? 'Einheit' : 'Einheiten'}</span></div>
    ${nNeu ? `<p class="newbanner"><b>${nNeu} ${nNeu === 1 ? 'Objekt' : 'Objekte'} neu oder geändert</b> seit Ihrem letzten Besuch. <button class="linkbtn" id="showNeu">Anzeigen</button></p>` : ''}
    <div class="bar"><div class="chips" id="chips">${FILTER.map((f) => `<button class="chip${ctx.filter === f[0] ? ' on' : ''}" data-f="${f[0]}">${f[1]}</button>`).join('')}</div>
      <div class="tools">
      <select id="sort" aria-label="Sortieren">${[['standard', 'Sortierung: Standard'], ['preis', 'Preis aufsteigend'], ['rendite', 'Rendite absteigend'], ['flaeche', 'Wohnfläche absteigend']].map(([v, l]) => `<option value="${v}"${ctx.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <div class="seg" id="mode" role="group" aria-label="Ansicht"><button data-m="karten" aria-pressed="${ctx.mode === 'karten'}">Karten</button><button data-m="tabelle" aria-pressed="${ctx.mode === 'tabelle'}">Tabelle</button></div>
      <button class="btn ghost sm" id="print">Drucken / PDF</button><button class="btn ghost sm" data-exp="xlsx" title="Alle angezeigten Objekte mit Kennzahlen als Excel-Datei">Excel</button><button class="btn ghost sm" data-exp="csv" title="Alle angezeigten Objekte mit Kennzahlen als CSV-Datei">CSV</button><button class="btn ghost sm" data-exp="investagon" title="Einheitentabelle für den Import in Investagon (CSV)">Investagon</button></div></div>
    <div class="tools2"><label>Budget bis<select id="fb">${[[0, 'egal'], [130000, '130.000 €'], [160000, '160.000 €'], [200000, '200.000 €'], [250000, '250.000 €']].map(([v, l]) => `<option value="${v}"${ctx.budget === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Rendite ab<select id="fr">${[[0, 'egal'], [4, '4 %'], [4.5, '4,5 %'], [5, '5 %'], [5.5, '5,5 %']].map(([v, l]) => `<option value="${v}"${ctx.rend === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Zimmer<select id="fz">${[[0, 'alle'], [2, '2'], [3, '3'], [4, '4 und mehr']].map(([v, l]) => `<option value="${v}"${ctx.zi === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="cards" id="cards">${listeHtml()}</div>
    <p class="legend">Kaltmiete: <b>IST</b> = laut Mietvertrag · <b>SOLL</b> = kalkulierte Marktmiete (unvermietet) · <b>PLAN</b> = Planwert vor Sanierung. Rendite = Jahreskaltmiete inkl. Garage/Stellplatz ÷ Abgabepreis. Alle Angaben laut Exposés und Objektunterlagen, ohne Gewähr. Der Abgabepreis ist der Preis für Sie als Vertrieb; Ihren eigenen Aufschlag legen Sie selbst fest (siehe „Kunden-Exposé“).</p>
  </main>
  <footer class="wrap"><div class="p-fuss"><span><b>${KONTAKT.firma}</b> · ${KONTAKT.adresse}</span><span><a href="tel:${KONTAKT.telHref}">${KONTAKT.tel}</a> · <a href="mailto:${KONTAKT.mail}">${KONTAKT.mail}</a> · ${KONTAKT.web}</span></div></footer>
  <p class="leitzeile">Unternehmen · Vertrauen · Zukunft</p>`;
  const refresh = () => { document.getElementById('cards').innerHTML = listeHtml(); document.querySelectorAll('.calc-in').forEach(calcUpdate); };
  refresh();
  for (const [id, key, conv] of [['fb', 'budget', Number], ['fr', 'rend', Number], ['fz', 'zi', Number]]) document.getElementById(id).addEventListener('change', (e) => { ctx[key] = conv(e.target.value); refresh(); });
  document.getElementById('showNeu')?.addEventListener('click', () => { ctx.filter = 'neu'; render(); });
  document.querySelector('.lage').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    ctx.filter = ctx.filter === b.dataset.f ? 'alle' : b.dataset.f;
    document.querySelectorAll('#chips .chip').forEach((c) => c.classList.toggle('on', c.dataset.f === ctx.filter));
    refresh(); document.getElementById('chips').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  const cards = document.getElementById('cards');
  cards.addEventListener('input', (e) => { const b = e.target.closest('.calc-in'); if (b) calcUpdate(b); });
  cards.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { ctx.mode = 'karten'; render(); document.querySelector(`[data-oid="${CSS.escape(go.dataset.go)}"]`)?.scrollIntoView({ block: 'start' }); return; }
    const b = e.target.closest('[data-doc],[data-ex],[data-fb],[data-fav],[data-reset]'); if (!b) return;
    if (b.dataset.fav) {
      const l = favs(), id = b.dataset.fav, on = !l.includes(id);
      lsSet('nf-fav-' + ctx.sess.id, on ? [...l, id] : l.filter((x) => x !== id));
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      const ft = document.querySelector('.lage [data-f=fav] .sp-w'); if (ft) { const n = ctx.data.objekte.filter((x) => favs().includes(x.id)).length; ft.textContent = n; ft.classList.toggle('null', !n); }
      if (ctx.filter === 'fav') refresh();
      return;
    }
    if (b.dataset.reset !== undefined) { Object.assign(ctx, { filter: 'alle', q: '', budget: 0, rend: 0, zi: 0 }); return render(); }
    if (b.dataset.doc) return download(b.dataset.doc);
    const o = ctx.data.objekte.find((x) => x.id === (b.dataset.ex || b.dataset.fb));
    if (b.dataset.ex) exposeOpen(o); else feedbackOpen(o);
  });
  document.getElementById('chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    ctx.filter = b.dataset.f;
    document.querySelectorAll('#chips .chip').forEach((c) => c.classList.toggle('on', c === b));
    refresh();
  });
  document.getElementById('mode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]'); if (!b || ctx.mode === b.dataset.m) return;
    ctx.mode = b.dataset.m;
    document.querySelectorAll('#mode button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    refresh();
  });
  cards.addEventListener('keydown', (e) => { const r = e.target.closest?.('tr[data-go]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
  document.getElementById('q').addEventListener('input', (e) => { ctx.q = e.target.value; refresh(); });
  document.getElementById('sort').addEventListener('change', (e) => { ctx.sort = e.target.value; refresh(); });
  document.getElementById('print').addEventListener('click', printOpen);
  document.querySelectorAll('[data-exp]').forEach((x) => x.addEventListener('click', () => { if (!exportObjekte(visible(), kennzahlen, x.dataset.exp)) alert('Keine Objekte zum Exportieren – bitte Filter anpassen.'); }));
  document.getElementById('logout').addEventListener('click', logout);
  document.getElementById('toAdmin')?.addEventListener('click', () => { ctx.view = 'admin'; render(); window.scrollTo(0, 0); });
}

/* ---------- Unterlagen ---------- */
function download(ref) {
  const [id, i] = [ref.slice(0, ref.lastIndexOf(':')), +ref.slice(ref.lastIndexOf(':') + 1)];
  const d = ctx.data.objekte.find((o) => o.id === id)?.docs?.[i]; if (!d) return;
  const [head, b64] = d.d.split(',');
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([u], { type: /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream' }));
  a.download = d.n; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- Overlay-Hilfe ---------- */
function overlay(html, cls = '') {
  document.getElementById('ov')?.remove();
  const d = document.createElement('div');
  d.id = 'ov'; d.className = 'ov ' + cls; d.innerHTML = html;
  document.body.appendChild(d); document.body.classList.add('ovopen');
  const esc2 = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { d.remove(); document.body.classList.remove('ovopen', 'pe'); document.removeEventListener('keydown', esc2); };
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', esc2);
  return { d, close };
}

/* ---------- Rückmeldung zum Objekt (Prüfung / Finanzierung / Reservierung) ---------- */
async function fbSend(ev) {
  const body = await sealFeedback(ctx.sess.fb.pub, ev);
  const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, { method: 'POST', headers: { Authorization: 'Bearer ' + ctx.sess.fb.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Rückmeldung', body }) });
  if (!r.ok) throw new Error(`Die Rückmeldung konnte nicht übermittelt werden (Fehler ${r.status}).`);
}

function feedbackOpen(o) {
  const a = ansp(o), direct = !!ctx.sess.fb?.token;
  const mine = chains(fbMine().filter((e) => e.oid === o.id));
  const { d, close } = overlay(`<form class="ov-box" id="fbF"><button type="button" class="x" data-close aria-label="Schließen">×</button>
    <span class="eyebrow">Rückmeldung</span><h2>${esc(o.strasse)} · ${esc(o.lage)}</h2>
    <p class="hint">Teilen Sie uns den Stand Ihres Interessenten mit – ${esc(a.name)} sieht das sofort im Überblick.</p>
    <fieldset class="stg">${STAGES.map((s, i) => `<label class="stgo" style="--c:${s.color}"><input type="radio" name="st" value="${s.id}"${i === 0 ? ' checked' : ''}><span><b>${esc(s.label)}</b><small>${esc(s.hint)}</small></span></label>`).join('')}</fieldset>
    ${mine.length ? `<div class="fbq"><small>Bestehenden Interessenten aktualisieren:</small>${mine.map((e) => `<button type="button" class="chip" data-k="${esc(e.k)}">${esc(e.k || 'Interessent')}</button>`).join('')}</div>` : ''}
    <label class="f"><span>Interessent (Name oder Kürzel, z. B. „Fam. M.“)</span><input name="k" maxlength="60" autocomplete="off"></label>
    <label class="f"><span>Notiz (optional)</span><textarea name="n" rows="3" maxlength="400" placeholder="z. B. Finanzierungszusage bis Freitag, Besichtigung am 14.11. …"></textarea></label>
    <p class="lg-err hidden" id="fbErr" role="alert"></p>
    <div class="acts"><button class="btn fill" id="fbGo">${direct ? 'Rückmeldung senden' : 'Rückmeldung speichern'}</button></div></form>`);
  const form = d.querySelector('#fbF'), err = (t) => { const p = d.querySelector('#fbErr'); p.textContent = t; p.classList.toggle('hidden', !t); };
  d.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { form.k.value = b.dataset.k; }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err('');
    const st = form.st.value, k = form.k.value.trim(), n = form.n.value.trim();
    if (st === 'reserviert' && !k) return err('Bitte Namen oder Kürzel des Kunden angeben, der zugesagt hat.');
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
    if (document.getElementById('cards')) { const y = window.scrollY; render(); window.scrollTo(0, y); }
  });
}

/* ---------- Druckansicht der Projekte ---------- */
const printTitle = document.title;
window.addEventListener('afterprint', () => { document.body.classList.remove('pe'); document.title = printTitle; });

function printHtml(list, det) {
  const stand = ctx.data.stand || datum(Date.now());
  const rows = list.map((o) => {
    const k = kennzahlen(o), v = o.vs || 'frei';
    return `<tr><td><b>${esc(o.strasse)}</b><small>${esc(o.lage)}</small></td><td>${num(o.flaeche)} m²<small>${esc(o.zimmer)} Zimmer</small></td><td>${eur(o.miete)}<small>${esc(o.mieteTyp)}</small></td><td><b>${eur(o.preis)}</b><small>${eur(k.preisQm)} / m²</small></td><td>${num(k.rendite)} %<small>Faktor ${num(k.faktor, 1)}</small></td><td>${esc(VSTATUS[v] ?? v)}<small>${esc(o.status.label)}</small></td></tr>`;
  }).join('');
  const details = det ? list.map((o) => {
    const k = kennzahlen(o);
    const steps = o.schritte.map((s) => `<li class="${esc(s.state)}"><span class="dot">${s.state === 'done' ? '✓' : ''}</span><b>${esc(s.label)}</b><em>${s.state === 'current' && s.label === 'Sanierung' ? o.fortschritt + ' %' : esc(s.datum ?? '')}</em></li>`).join('');
    return `<section class="pv-o"><img src="${esc(o.bild)}" alt=""><div><h2>${esc(o.strasse)} <span>· ${esc(o.lage)}</span></h2><p class="pv-m">Bj. ${esc(o.baujahr)} · Energie ${esc(o.energie)} · Hausgeld ${eur(o.hausgeld)} · ${num(o.flaeche)} m² · ${esc(o.zimmer)} Zimmer</p>
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

function printOpen() {
  const list = visible();
  const { d } = overlay(`<button class="ex-x" data-close aria-label="Schließen">×</button><div class="ex-wrap"><div class="ex-bar">
      <label class="chk"><input type="checkbox" id="pvDet" checked> Mit Objektdetails (Foto, Sanierung, Zeitplan)</label>
      <div class="acts"><button class="btn fill sm" id="pvPrint">Drucken / als PDF speichern</button><button class="btn ghost sm" data-close>Schließen</button></div>
      <p class="hint">Es wird die aktuell gefilterte und sortierte Auswahl gedruckt. Im Druckdialog „Als PDF sichern“ wählen, um eine Datei zu erhalten. Die Abgabepreise sind vertraulich.</p></div>
    <article class="ex pv" id="pvDoc"></article></div>`, 'ov-ex');
  const doc = d.querySelector('#pvDoc'), det = d.querySelector('#pvDet');
  const draw = () => { doc.innerHTML = printHtml(list, det.checked); };
  det.addEventListener('change', draw);
  d.querySelector('#pvPrint').addEventListener('click', () => {
    document.body.classList.add('pe'); document.title = `Vertriebsübersicht Hof – Stand ${ctx.data.stand || datum(Date.now())}`;
    window.print();
  });
  draw();
}

/* ---------- Kunden-Exposé mit eigenem Aufschlag ---------- */
function exposeOpen(o) {
  const prof = lsGet('nf-expose-prof') ?? { firma: ctx.sess.r === 'partner' ? ctx.sess.n : '', tel: '', mail: '', pct: 3.57 };
  const { d } = overlay(`<button class="ex-x" data-close aria-label="Schließen">×</button><div class="ex-wrap"><div class="ex-bar"><div class="ex-form">
      <label class="f"><span>Ihre Firma / Name</span><input data-p="firma" value="${esc(prof.firma)}"></label>
      <label class="f"><span>Telefon</span><input data-p="tel" value="${esc(prof.tel)}" inputmode="tel"></label>
      <label class="f"><span>E-Mail</span><input data-p="mail" value="${esc(prof.mail)}" inputmode="email"></label>
      <label class="f"><span>Ihr Aufschlag (% auf den Abgabepreis)</span><input data-p="pct" type="number" step="0.01" inputmode="decimal" value="${esc(prof.pct)}"></label></div>
      <div class="acts"><button class="btn fill sm" id="exPrint">Drucken / als PDF speichern</button><button class="btn ghost sm" data-close>Schließen</button></div>
      <p class="hint">Der Kunde sieht nur den Kaufpreis inklusive Ihres Aufschlags – Abgabepreis und Aufschlag werden nicht getrennt ausgewiesen. Ihre Eingaben bleiben nur in diesem Browser.</p></div>
    <article class="ex" id="exDoc"></article></div>`, 'ov-ex');
  const doc = d.querySelector('#exDoc');
  const read = () => { const g = (k) => d.querySelector(`[data-p=${k}]`).value.trim(); return { firma: g('firma'), tel: g('tel'), mail: g('mail'), pct: Math.max(0, parseFloat(g('pct').replace(',', '.')) || 0) }; };
  const draw = () => { const p = read(); lsSet('nf-expose-prof', p); doc.innerHTML = exposeHtml(o, p); };
  d.querySelector('.ex-form').addEventListener('input', draw);
  d.querySelector('#exPrint').addEventListener('click', () => { document.body.classList.add('pe'); window.print(); });
  window.addEventListener('afterprint', () => document.body.classList.remove('pe'), { once: false });
  draw();
}
function exposeHtml(o, p) {
  const preis = Math.round(o.preis * (1 + p.pct / 100)), kz = kennzahlen({ ...o, preis });
  const steps = o.schritte.map((s) => `<li class="${esc(s.state)}"><span class="dot">${s.state === 'done' ? '✓' : ''}</span><b>${esc(s.label)}</b><em>${s.state === 'current' && s.label === 'Sanierung' ? o.fortschritt + ' %' : esc(s.datum ?? '')}</em></li>`).join('');
  return `<header class="ex-h"><div><small>Kapitalanlage · Eigentumswohnung in Hof</small><h1>${esc(o.strasse)} <span>· ${esc(o.lage)}</span></h1><p>${esc(o.ort)}</p></div>
    ${p.firma ? `<div class="ex-by"><b>${esc(p.firma)}</b>${p.tel ? `<span>${esc(p.tel)}</span>` : ''}${p.mail ? `<span>${esc(p.mail)}</span>` : ''}</div>` : ''}</header>
    <img class="ex-img" src="${esc(o.bild)}" alt="">
    <ul class="tags">${o.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <div class="kpis ex-k"><div><small>Wohnfläche</small><b>${num(o.flaeche)} m²</b></div>
      <div class="price"><small>Kaufpreis</small><b>${eur(preis)}</b><em>${num(kz.preisQm)} € pro m²</em></div>
      <div><small>Kaltmiete / Mon.</small><b>${eur(o.miete)}</b><em>${esc(o.mieteTyp)}${o.zuschlag ? ` · + ${esc(o.zuschlag.label)} ${esc(o.zuschlag.betrag)} €` : ''}</em></div>
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
    if (s?.keys) {
      ctx.sess = s;
      ctx.seen = Number(sessionStorage.getItem('nf-seen-ctx')) || Date.now();
      if (s.sig === sigOf(ctx.pkg)) ctx.data = await openObjects(s, ctx.pkg);
      else if (!(await reopen(ctx.pkg))) { ctx.sess = null; try { sessionStorage.removeItem(SESSION); } catch { /* egal */ } return showLogin('Ihr Zugang wurde geändert. Bitte neu anmelden.'); }
      return render();
    }
  } catch { try { sessionStorage.removeItem(SESSION); } catch { /* egal */ } }
  showLogin();
})();
