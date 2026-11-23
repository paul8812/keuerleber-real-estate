import * as db from '../db.js';
import { html, today, addDays, fmtDate, fmtDateShort, eur, daysBetween, fullName } from '../util.js';
import { PIPELINES, DEFAULT_PROB } from '../consts.js';
import { cLink, pLink, empty, timeline, matchesForProperty, lastContact, dealProvision, avatar } from '../ui.js';
import { taskRow, bindTasks } from './tasks.js';
import { schnellerfassung } from '../schnellerfassung.js';
import { fokusKarte, bindFokus } from '../crmplus.js';
import { heuteKarte, nachfassenKarte, nachfassenListe } from '../kontakt.js';
import { eventForm, taskForm, contactForm, propertyForm, activityForm } from '../forms.js';
import { newCount as mailsNeu } from './inbox.js';
import { neuAnzahl as anfragenNeu } from '../portal.js';
import { istUeberfaellig } from '../finanzen.js';
import { offene as fahrtenOffen } from '../fahrtenbuch.js';
import { assistent as ueberfaelligAssistent } from '../ueberfaellig.js';

/** Was heute ansteht – als antippbare Zähler (nur was es wirklich gibt) */
export function tagesleiste() {
  const t0 = today(), T = db.all('tasks');
  const offen = T.filter(t => !t.done && t.faellig), heute = offen.filter(t => t.faellig === t0).length, ueber = offen.filter(t => t.faellig < t0).length;
  const erledigt = T.filter(t => t.done && (t.doneAt || '').slice(0, 10) === t0).length;
  const termine = db.all('events').filter(e => e.datum === t0).length;
  const wv = db.all('contacts').filter(c => c.status !== 'Archiv' && c.followup && c.followup <= t0).length;
  const belege = (db.all('buchungen') || []).filter(b => b.pruefen).length;
  const rechn = (db.all('rechnungen') || []).filter(istUeberfaellig).length;
  const C = [
    [termine, termine === 1 ? 'Termin heute' : 'Termine heute', '#/kalender', 'gold'],
    [heute, heute === 1 ? 'Aufgabe heute' : 'Aufgaben heute', '#/aufgaben', ''],
    [ueber, 'überfällig – ordnen', 'uf', 'dringend'],
    [anfragenNeu(), anfragenNeu() === 1 ? 'neue Anfrage' : 'neue Anfragen', '#/anfragen', 'gold'],
    [mailsNeu(), 'neue Mails', '#/posteingang', ''],
    [fahrtenOffen().length, fahrtenOffen().length === 1 ? 'Fahrt benennen' : 'Fahrten benennen', '#/fahrten/benennen', ''],
    [wv, wv === 1 ? 'Wiedervorlage' : 'Wiedervorlagen', '#/kontakte', ''],
    [belege, belege === 1 ? 'Beleg prüfen' : 'Belege prüfen', '#/finanzen', ''],
    [rechn, rechn === 1 ? 'Rechnung überfällig' : 'Rechnungen überfällig', '#/finanzen', 'dringend'],
    [erledigt, 'heute erledigt', '', 'ok'],
  ].filter(c => c[0]);
  if (!C.length) return html`<div class="tagesleiste"><span class="tagok">✓ Heute steht nichts an.</span></div>`;
  return html`<div class="tagesleiste" aria-label="Heute">${C.map(([n, l, h, cls]) => h === 'uf' ? html`<button type="button" class="tchip ${cls}" data-uf><b>${n > 999 ? '999+' : n}</b><span>${l}</span></button>` : h ? html`<a class="tchip ${cls}" href="${h}"><b>${n > 999 ? '999+' : n}</b><span>${l}</span></a>` : html`<span class="tchip ${cls}"><b>${n}</b><span>${l}</span></span>`)}</div>`;
}

export const prob = d => d.wahrscheinlichkeit !== '' && d.wahrscheinlichkeit != null ? d.wahrscheinlichkeit : (DEFAULT_PROB[d.stage] ?? 0);
export const isOpen = d => { const P = PIPELINES[d.board]; return P && d.stage !== P.won && d.stage !== P.lost; };

export function render(el) {
  const t0 = today(), s = db.settings();
  const tasks = db.all('tasks').filter(t => !t.done && t.faellig && t.faellig <= t0).sort((a, b) => a.faellig.localeCompare(b.faellig));
  const events = db.all('events').filter(e => e.datum >= t0 && e.datum <= addDays(t0, 7)).sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start));
  const props = db.all('properties'), deals = db.all('deals'), contacts = db.all('contacts');
  const open = deals.filter(isOpen);
  const pipeVal = open.reduce((s, d) => s + (d.wert || 0), 0);
  const forecast = open.reduce((s, d) => s + dealProvision(d) * prob(d) / 100, 0);
  const year = t0.slice(0, 4);
  const won = deals.filter(d => PIPELINES[d.board] && d.stage === PIPELINES[d.board].won && d.board === 'vertrieb' && (d.closedAt || '').startsWith(year));
  const umsatz = won.reduce((s, d) => s + dealProvision(d), 0);
  const nachfassen = nachfassenListe();
  const expiring = [];
  props.filter(p => !['Archiv', 'Verkauft / Vermietet'].includes(p.status)).forEach(p => {
    if (p.auftragBis && p.auftragBis >= t0 && p.auftragBis <= addDays(t0, 60)) expiring.push({ p, txt: `Vertriebsvereinbarung endet ${fmtDate(p.auftragBis)}` });
    if (p.auftragBis && p.auftragBis < t0) expiring.push({ p, txt: `Vertriebsvereinbarung abgelaufen ${fmtDate(p.auftragBis)}` });
    if (p.eGueltig && p.eGueltig <= addDays(t0, 60)) expiring.push({ p, txt: `Energieausweis ${p.eGueltig < t0 ? 'abgelaufen' : 'läuft ab'} ${fmtDate(p.eGueltig)}` });
    if (p.status === 'Aktiv' && !p.preis) expiring.push({ p, txt: 'Aktiv ohne Preis' });
  });
  const bdays = contacts.filter(c => c.geburtstag).map(c => { const [, m, d] = c.geburtstag.split('-'); let n = `${year}-${m}-${d}`; if (n < t0) n = `${+year + 1}-${m}-${d}`; return { c, n }; }).filter(x => x.n <= addDays(t0, 14)).sort((a, b) => a.n.localeCompare(b.n));
  const matches = props.filter(p => p.status === 'Aktiv').flatMap(p => matchesForProperty(p).slice(0, 2).map(x => ({ p, ...x }))).slice(0, 6);
  const hour = new Date().getHours(), greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const kpi = (v, l, href, cls = '') => html`<a class="kpi ${cls}" href="${href}"><b>${v}</b><span>${l}</span></a>`;
  const ueber = tasks.filter(t => t.faellig < t0).length, neu = db.all('tasks').filter(t => !t.done && /^ni:/.test(t.auto || '')).length, termHeute = events.filter(e => e.datum === t0).length;
  const satz = [tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'Aufgabe steht' : 'Aufgaben stehen'} an${ueber ? `, davon ${ueber} überfällig` : ''}` : 'Keine Aufgaben fällig',
    termHeute ? `${termHeute} ${termHeute === 1 ? 'Termin' : 'Termine'} heute` : events.length ? `nächster Termin ${fmtDateShort(events[0].datum)}${events[0].start ? ' um ' + events[0].start : ''}` : 'keine Termine diese Woche',
    neu ? `${neu} neue ${neu === 1 ? 'Anfrage wartet' : 'Anfragen warten'}` : ''].filter(Boolean).join(', ') + '.';
  const SEK = [
    ['Termine (7 Tage)', events.length, () => html`<ul class="list">${events.slice(0, 10).map(e => html`<li data-ev="${e.id}"><b class="when">${fmtDateShort(e.datum)} ${e.start || ''}</b><div class="grow"><div class="ttl">${e.titel}</div><div class="sub">${e.art}${e.contactId ? html` · ${cLink(e.contactId)}` : ''}${e.ort ? ' · ' + e.ort : ''}</div></div></li>`)}</ul>${events.length > 10 ? html`<a class="fokusmehr" href="#/kalender">Alle ${events.length} Termine im Kalender</a>` : ''}`],
    ['Neue Objekt-Treffer', matches.length, () => html`<ul class="list">${matches.map(x => html`<li><b class="when">${x.m.score}%</b><div class="grow"><div class="ttl">${cLink(x.c.id)} ↔ ${pLink(x.p.id)}</div><div class="sub">passt: ${x.m.hits.join(', ')}</div></div></li>`)}</ul>`],
    ['Achtung bei Objekten', expiring.length, () => html`<ul class="list">${expiring.slice(0, 8).map(x => html`<li><span class="ic">⚠️</span><div class="grow"><div class="ttl">${pLink(x.p.id)}</div><div class="sub">${x.txt}</div></div></li>`)}</ul>`],
    ['Geburtstage (14 Tage)', bdays.length, () => html`<ul class="list">${bdays.map(x => html`<li><span class="ic">🎂</span><div class="grow"><div class="ttl">${cLink(x.c.id)}</div><div class="sub">${fmtDate(x.n)}</div></div></li>`)}</ul>`],
  ];
  const voll = SEK.filter(x => x[1]), leer = [...(nachfassen.length ? [] : ['Nachfassen']), ...SEK.filter(x => !x[1]).map(x => x[0].replace(/ \(.*\)/, ''))];
  const acts = db.all('activities').filter(a => a.art !== 'system').sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 6);
  el.innerHTML = html`<div class="head dashhead"><div><p class="datum">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>${greet}, ${(s.inhaber || '').split(' ')[0]}</h1><p class="briefing">${satz}</p></div>
      <div class="actions"><button class="btn primary" data-q="anfrage">Anfrage einfügen</button></div></div>
    ${tagesleiste()}
    ${fokusKarte()}
    <div class="kpis strip">
      ${kpi(props.filter(p => p.status === 'Aktiv').length, 'Aktive Objekte', '#/objekte')}
      ${kpi(contacts.filter(c => c.status !== 'Archiv').length, 'Kontakte', '#/kontakte')}
      ${kpi(open.length, 'Offene Vorgänge', '#/pipeline')}
      ${kpi(eur(pipeVal), 'Pipeline-Volumen', '#/pipeline')}
      ${kpi(eur(forecast), 'Prognose Vergütung', '#/pipeline')}
      ${kpi(eur(umsatz), `Vergütung ${year}`, '#/statistik')}
    </div>
    <div class="cols dashcols">
      ${heuteKarte()}${nachfassen.length ? nachfassenKarte(nachfassen) : ''}
      ${voll.map(([t, , f]) => html`<section class="card"><h2>${t}</h2>${f()}</section>`)}
      ${acts.length ? html`<section class="card"><h2>Zuletzt passiert</h2>${timeline(acts, { showRefs: true })}</section>` : ''}
    </div>
    ${leer.length ? html`<p class="ruhig">Nichts offen bei ${leer.join(', ').replace(/, ([^,]*)$/, ' und $1')}.</p>` : ''}`.s;
  bindTasks(el); bindFokus(el);
  el.querySelector('[data-uf]')?.addEventListener('click', ueberfaelligAssistent);
  el.querySelectorAll('[data-ev]').forEach(li => li.onclick = e => { if (!e.target.closest('a')) eventForm(db.get('events', li.dataset.ev)); });
  const q = { anfrage: () => schnellerfassung(), contact: () => contactForm({}, c => location.hash = '#/kontakte/' + c.id), property: () => propertyForm({}, p => location.hash = '#/objekte/' + p.id), task: () => taskForm(), event: () => eventForm(), note: () => activityForm() };
  el.querySelectorAll('[data-q]').forEach(b => b.onclick = q[b.dataset.q]);
}
