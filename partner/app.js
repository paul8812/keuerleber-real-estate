// Partnerbereich: lädt die verschlüsselte Datei, entschlüsselt sie im Browser und zeigt die Übersicht.
import { openObjects, openSlot } from './crypto.js';

const app = document.getElementById('app');
const KONTAKT = { firma: 'Norderfranken Haus und Grund GmbH', adresse: 'Am Gewerbegebiet 5 · 95185 Gattendorf', tel: '09281 979 9759', telHref: '+4992819799759', mail: 'info@norderfranken.de', web: 'www.norderfranken.de' };
const SESSION = 'nf-partner-session';
const ANSP = { name: 'Sebastian Sultanow', tel: '09281 979 9759', mail: 'info@norderfranken.de' }; // Standard-Ansprechpartner, pro Objekt im Admin überschreibbar
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

const ctx = { pkg: null, sess: null, data: null, view: 'start', filter: 'alle', sort: 'standard', q: '', budget: 0, rend: 0, zi: 0 };

async function loadPackage() {
  const r = await fetch('data.enc.json?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Daten konnten nicht geladen werden (' + r.status + ')');
  return r.json();
}

async function enter(payload, code, id) {
  ctx.sess = { ...payload, code, id };
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
  ['frei', 'Frei', (o) => !o.vs || o.vs === 'frei'],
  ['neu', 'Neu / geändert', (o) => isNeu(o)],
  ['fertig', 'Saniert', (o) => o.fortschritt === 100],
  ['arbeit', 'In Sanierung', (o) => o.fortschritt > 0 && o.fortschritt < 100],
  ['vorbereitung', 'In Vorbereitung', (o) => o.fortschritt === 0],
];

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
    <div class="photo"><img src="${esc(o.bild)}" alt="${esc(o.strasse + ', ' + o.lage)}" loading="lazy"><span class="pill ${esc(o.status.tone)}"><i></i>${esc(o.status.label)}</span>${vBadge(o)}${isNeu(o) ? `<span class="neu">${esc(o.aend || 'Aktualisiert')}</span>` : ''}</div>
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
      <div class="cact">
        <button class="btn fill sm" data-mel="${esc(o.id)}" ${sold ? 'disabled' : ''}>Interessent melden</button>
        <button class="btn dark sm" data-ex="${esc(o.id)}">Kunden-Exposé</button>
        <a class="btn ghost sm" href="tel:+${waNr(a.tel)}">Anrufen</a>
        ${isMobil(a.tel) ? `<a class="btn ghost sm" href="https://wa.me/${waNr(a.tel)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : a.mail ? `<a class="btn ghost sm" href="mailto:${esc(a.mail)}">E-Mail</a>` : ''}
        <span class="who">Ansprechpartner: <b>${esc(a.name)}</b> · ${esc(a.tel)}</span>
      </div>
      ${docs.length ? `<details class="dd"><summary>Unterlagen (${docs.length})</summary><div class="doclist">${docs.map((d, i) => `<button class="doc" data-doc="${esc(o.id)}:${i}"><span>${esc(d.n)}</span><small>${Math.max(1, Math.round((d.d.length * 0.75) / 1024))} KB · herunterladen</small></button>`).join('')}</div></details>` : ''}
      <details class="dd calc"><summary>Rechner: Finanzierung &amp; Cashflow</summary>${calcHtml(o)}</details>
    </div>
  </article>`;
}

function vBadge(o) {
  const v = o.vs || 'frei';
  return v === 'frei' ? '' : `<span class="vs ${esc(v)}">${esc(VSTATUS[v] ?? v)}</span>`;
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

function listeHtml() {
  const l = filtered();
  if (ctx.sort === 'preis') l.sort((a, b) => a.preis - b.preis);
  if (ctx.sort === 'rendite') l.sort((a, b) => kennzahlen(b).rendite - kennzahlen(a).rendite);
  if (ctx.sort === 'flaeche') l.sort((a, b) => b.flaeche - a.flaeche);
  if (!ctx.data.objekte.length) return '<p class="empty">Für Sie sind aktuell keine Objekte freigegeben. Bitte sprechen Sie uns an: ' + KONTAKT.tel + '</p>';
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
    <p class="lead">Unsere aktuellen Kapitalanlage-Objekte auf einen Blick – mit Kennzahlen, Sanierungsstand, Zeitplan und Unterlagen zum Download.</p>
    ${(() => { const n = ctx.data.objekte.filter(isNeu).length; return n ? `<p class="newbanner"><b>${n} ${n === 1 ? 'Objekt' : 'Objekte'} neu oder geändert</b> seit Ihrem letzten Besuch. <button class="linkbtn" id="showNeu">Anzeigen</button></p>` : ''; })()}
    <dl class="stats"><div><dt>Wohnungen</dt><dd>${stats.n}</dd></div><div><dt>Wohnfläche</dt><dd>${stats.min}–${stats.max} m²</dd></div><div><dt>Abgabepreis ab</dt><dd>${eur(stats.ab)}</dd></div></dl></div></section>
  <main class="wrap list-wrap">
    <div class="bar"><div class="chips" id="chips">${FILTER.map((f) => `<button class="chip${ctx.filter === f[0] ? ' on' : ''}" data-f="${f[0]}">${f[1]}</button>`).join('')}</div>
      <div class="tools"><input type="search" id="q" placeholder="Suchen, z. B. Straße, Garage …" value="${esc(ctx.q)}" aria-label="Suchen">
      <select id="sort" aria-label="Sortieren">${[['standard', 'Sortierung: Standard'], ['preis', 'Preis aufsteigend'], ['rendite', 'Rendite absteigend'], ['flaeche', 'Wohnfläche absteigend']].map(([v, l]) => `<option value="${v}"${ctx.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="tools2"><label>Budget bis<select id="fb">${[[0, 'egal'], [130000, '130.000 €'], [160000, '160.000 €'], [200000, '200.000 €'], [250000, '250.000 €']].map(([v, l]) => `<option value="${v}"${ctx.budget === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Rendite ab<select id="fr">${[[0, 'egal'], [4, '4 %'], [4.5, '4,5 %'], [5, '5 %'], [5.5, '5,5 %']].map(([v, l]) => `<option value="${v}"${ctx.rend === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Zimmer<select id="fz">${[[0, 'alle'], [2, '2'], [3, '3'], [4, '4 und mehr']].map(([v, l]) => `<option value="${v}"${ctx.zi === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="cards" id="cards">${listeHtml()}</div>
    <p class="legend">Kaltmiete: <b>IST</b> = laut Mietvertrag · <b>SOLL</b> = kalkulierte Marktmiete (unvermietet) · <b>PLAN</b> = Planwert vor Sanierung. Rendite = Jahreskaltmiete inkl. Garage/Stellplatz ÷ Abgabepreis. Alle Angaben laut Exposés und Objektunterlagen, ohne Gewähr. Der Abgabepreis ist der Preis für Sie als Vertrieb; Ihren eigenen Aufschlag legen Sie selbst fest (siehe „Kunden-Exposé“).</p>
  </main>
  <footer class="foot"><div class="wrap foot-in"><span><b>${KONTAKT.firma}</b> · ${KONTAKT.adresse}</span><span><a href="tel:${KONTAKT.telHref}">${KONTAKT.tel}</a> · <a href="mailto:${KONTAKT.mail}">${KONTAKT.mail}</a> · ${KONTAKT.web}</span></div></footer>`;
  const refresh = () => { document.getElementById('cards').innerHTML = listeHtml(); document.querySelectorAll('.calc-in').forEach(calcUpdate); };
  refresh();
  for (const [id, key, conv] of [['fb', 'budget', Number], ['fr', 'rend', Number], ['fz', 'zi', Number]]) document.getElementById(id).addEventListener('change', (e) => { ctx[key] = conv(e.target.value); refresh(); });
  document.getElementById('showNeu')?.addEventListener('click', () => { ctx.filter = 'neu'; render(); });
  const cards = document.getElementById('cards');
  cards.addEventListener('input', (e) => { const b = e.target.closest('.calc-in'); if (b) calcUpdate(b); });
  cards.addEventListener('click', (e) => {
    const b = e.target.closest('[data-doc],[data-ex],[data-mel]'); if (!b) return;
    if (b.dataset.doc) return download(b.dataset.doc);
    const o = ctx.data.objekte.find((x) => x.id === (b.dataset.ex || b.dataset.mel));
    if (b.dataset.ex) exposeOpen(o); else melden(o);
  });
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
  const close = () => { d.remove(); document.body.classList.remove('ovopen', 'pe'); };
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
  return { d, close };
}

/* ---------- Interessent melden (WhatsApp / Anruf, ohne Server) ---------- */
function melden(o) {
  const a = ansp(o), me = ctx.sess.n || 'Partner';
  const { d } = overlay(`<form class="ov-box" id="melF"><button type="button" class="x" data-close aria-label="Schließen">×</button>
    <span class="eyebrow">Reservierungsanfrage</span><h2>${esc(o.strasse)} · ${esc(o.lage)}</h2>
    <p class="hint">Sie melden einen Interessenten. Die Nachricht geht direkt an ${esc(a.name)} – wer zuerst meldet, wird zuerst berücksichtigt.</p>
    <label class="f"><span>Interessent (Name)</span><input name="k" required maxlength="80" autocomplete="off"></label>
    <label class="f"><span>Nachricht (optional)</span><textarea name="n" rows="3" maxlength="400" placeholder="z. B. Finanzierung steht, Besichtigung gewünscht …"></textarea></label>
    <div class="acts">${isMobil(a.tel) ? '<button class="btn fill" data-w>Per WhatsApp senden</button>' : ''}${a.mail ? `<button type="button" class="btn ${isMobil(a.tel) ? 'dark' : 'fill'}" data-m>Per E-Mail senden</button>` : ''}<a class="btn ghost" href="tel:+${waNr(a.tel)}">Anrufen</a></div></form>`);
  const text = () => { const f = new FormData(d.querySelector('#melF')); return `Reservierungsanfrage\nObjekt: ${o.strasse}, ${o.lage}\nInteressent: ${String(f.get('k')).trim()}\nVertrieb: ${me}${String(f.get('n')).trim() ? '\n' + String(f.get('n')).trim() : ''}\n(${datum(Date.now())})`; };
  d.querySelector('#melF').addEventListener('submit', (e) => { e.preventDefault(); if (!isMobil(a.tel)) return; window.open(`https://wa.me/${waNr(a.tel)}?text=${encodeURIComponent(text())}`, '_blank', 'noopener'); });
  d.querySelector('[data-m]')?.addEventListener('click', () => { const f = d.querySelector('#melF'); if (!f.reportValidity()) return; location.href = `mailto:${a.mail}?subject=${encodeURIComponent('Reservierungsanfrage ' + o.strasse)}&body=${encodeURIComponent(text())}`; });
}

/* ---------- Kunden-Exposé mit eigenem Aufschlag ---------- */
function exposeOpen(o) {
  const prof = lsGet('nf-expose-prof') ?? { firma: ctx.sess.r === 'partner' ? ctx.sess.n : '', tel: '', mail: '', pct: 3.57 };
  const { d } = overlay(`<div class="ex-wrap"><div class="ex-bar"><div class="ex-form">
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
    <div class="kpis ex-k"><div><small>Wohnfläche</small><b>${num(o.flaeche)} m²</b><em>${esc(o.zimmer)} Zimmer</em></div>
      <div class="price"><small>Kaufpreis</small><b>${eur(preis)}</b><em>${num(kz.preisQm)} € pro m²</em></div>
      <div><small>Kaltmiete / Mon.</small><b>${eur(o.miete)}</b><em>${esc(o.mieteTyp)}${o.zuschlag ? ` · + ${esc(o.zuschlag.label)} ${esc(o.zuschlag.betrag)} €` : ''}</em></div>
      <div><small>Rendite p. a.</small><b>${num(kz.rendite)} %</b><em>Faktor ${num(kz.faktor, 1)}</em></div>
      <div><small>Hausgeld</small><b>${eur(o.hausgeld)}</b><em>pro Monat</em></div></div>
    <div class="ex-cols"><section><h2>Sanierung</h2><p>${esc(o.sanierung)}</p><p class="note">${esc(o.hinweis)}</p><p>Baujahr ${esc(o.baujahr)} · Energieklasse ${esc(o.energie)}</p></section>
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
      ctx.data = await openObjects(s, ctx.pkg);
      ctx.sess = s;
      ctx.seen = Number(sessionStorage.getItem('nf-seen-ctx')) || Date.now();
      return render();
    }
  } catch { try { sessionStorage.removeItem(SESSION); } catch { /* egal */ } }
  showLogin();
})();
