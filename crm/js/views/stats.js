import * as db from '../db.js';
import { html, raw, eur, num, pct, daysBetween, today } from '../util.js';
import { PIPELINES, OBJEKT_STATUS, STATUS_FARBE } from '../consts.js';
import { dealProvision, empty } from '../ui.js';

const bars = (rows, fmt = num) => { const max = Math.max(1, ...rows.map(r => r[1])); return rows.length ? html`<div class="bars">${rows.map(([l, v, c]) => html`<div class="bar"><span class="bl">${l}</span><div class="bt"><i style="width:${v / max * 100}%;background:${c || 'var(--gold)'}"></i></div><b>${fmt(v)}</b></div>`)}</div>` : empty('Noch keine Daten'); };

export function render(el) {
  const deals = db.all('deals'), contacts = db.all('contacts'), props = db.all('properties');
  const year = today().slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const MN = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const wonV = deals.filter(d => d.board === 'vertrieb' && d.stage === PIPELINES.vertrieb.won);
  const rev = months.map((m, i) => [MN[i], wonV.filter(d => (d.closedAt || '').startsWith(m)).reduce((s, d) => s + dealProvision(d), 0)]);
  const sources = Object.entries(contacts.reduce((a, c) => { const k = c.quelle || 'Unbekannt'; a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const aq = PIPELINES.akquise, lead = deals.filter(d => d.board === 'akquise'), won = lead.filter(d => d.stage === aq.won).length, lost = lead.filter(d => d.stage === aq.lost).length;
  const funnel = (P, b) => P.stages.filter(s => s !== P.lost).map(s => [s, deals.filter(d => d.board === b && d.stage === s).length]);
  const sold = props.filter(p => p.status === 'Verkauft / Vermietet' && p.eingestelltAm);
  const avgDays = sold.length ? Math.round(sold.reduce((s, p) => s + daysBetween(p.eingestelltAm, (p.updated || '').slice(0, 10) || today()), 0) / sold.length) : null;
  const volWon = wonV.reduce((s, d) => s + (d.wert || 0), 0);
  const lostReasons = Object.entries(deals.filter(d => d.verlustGrund).reduce((a, d) => { a[d.verlustGrund] = (a[d.verlustGrund] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  el.innerHTML = html`<div class="head"><h1>Statistik</h1></div>
    <div class="kpis"><div class="kpi"><b>${eur(rev.reduce((s, r) => s + r[1], 0))}</b><span>Provision ${year}</span></div><div class="kpi"><b>${eur(volWon)}</b><span>Verkaufsvolumen (gesamt)</span></div>
      <div class="kpi"><b>${won + lost ? pct(won / (won + lost) * 100, 0) : '–'}</b><span>Akquise-Erfolgsquote</span></div><div class="kpi"><b>${avgDays != null ? avgDays + ' Tage' : '–'}</b><span>Ø Vermarktungsdauer</span></div></div>
    <div class="cols">
      <section class="card"><h2>Provision je Monat ${year}</h2>${bars(rev, eur)}</section>
      <section class="card"><h2>Objekte nach Status</h2>${bars(OBJEKT_STATUS.map(s => [s, props.filter(p => p.status === s).length, STATUS_FARBE[s]]).filter(r => r[1]))}</section>
      <section class="card"><h2>Trichter Akquise</h2>${bars(funnel(aq, 'akquise'))}</section>
      <section class="card"><h2>Trichter Vertrieb</h2>${bars(funnel(PIPELINES.vertrieb, 'vertrieb'))}</section>
      <section class="card"><h2>Kontakte nach Quelle</h2>${bars(sources)}</section>
      <section class="card"><h2>Verlustgründe</h2>${bars(lostReasons)}</section>
    </div>`.s;
}
