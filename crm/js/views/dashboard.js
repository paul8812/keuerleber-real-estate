import * as db from '../db.js';
import { html, today, addDays, fmtDate, fmtDateShort, eur, daysBetween, fullName } from '../util.js';
import { PIPELINES, DEFAULT_PROB } from '../consts.js';
import { cLink, pLink, empty, timeline, matchesForProperty, lastContact, dealProvision, avatar } from '../ui.js';
import { taskRow, bindTasks } from './tasks.js';
import { eventForm, taskForm, contactForm, propertyForm, activityForm } from '../forms.js';

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
  const followups = contacts.filter(c => c.followup && c.followup <= t0 && c.status !== 'Archiv');
  const cold = contacts.filter(c => c.status === 'Aktiv' && ['Eigentümer', 'Investor', 'Verkäufer', 'Vermieter'].includes(c.kategorie)).map(c => ({ c, last: lastContact(c.id) || (c.created || '').slice(0, 10) })).filter(x => x.last && daysBetween(x.last.slice(0, 10), t0) > (s.nachfassTage || 60)).sort((a, b) => a.last.localeCompare(b.last)).slice(0, 6);
  const expiring = [];
  props.filter(p => !['Archiv', 'Verkauft / Vermietet'].includes(p.status)).forEach(p => {
    if (p.auftragBis && p.auftragBis >= t0 && p.auftragBis <= addDays(t0, 60)) expiring.push({ p, txt: `Maklervertrag endet ${fmtDate(p.auftragBis)}` });
    if (p.auftragBis && p.auftragBis < t0) expiring.push({ p, txt: `Maklervertrag abgelaufen ${fmtDate(p.auftragBis)}` });
    if (p.eGueltig && p.eGueltig <= addDays(t0, 60)) expiring.push({ p, txt: `Energieausweis ${p.eGueltig < t0 ? 'abgelaufen' : 'läuft ab'} ${fmtDate(p.eGueltig)}` });
    if (p.status === 'Aktiv' && !p.preis) expiring.push({ p, txt: 'Aktiv ohne Preis' });
  });
  const bdays = contacts.filter(c => c.geburtstag).map(c => { const [, m, d] = c.geburtstag.split('-'); let n = `${year}-${m}-${d}`; if (n < t0) n = `${+year + 1}-${m}-${d}`; return { c, n }; }).filter(x => x.n <= addDays(t0, 14)).sort((a, b) => a.n.localeCompare(b.n));
  const matches = props.filter(p => p.status === 'Aktiv').flatMap(p => matchesForProperty(p).slice(0, 2).map(x => ({ p, ...x }))).slice(0, 6);
  const hour = new Date().getHours(), greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const kpi = (v, l, href, cls = '') => html`<a class="kpi ${cls}" href="${href}"><b>${v}</b><span>${l}</span></a>`;
  el.innerHTML = html`<div class="head"><div><h1>${greet}, ${(s.inhaber || '').split(' ')[0]}</h1><p class="muted">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
      <div class="actions"><button class="btn" data-q="contact">+ Kontakt</button><button class="btn" data-q="property">+ Objekt</button><button class="btn" data-q="task">+ Aufgabe</button><button class="btn" data-q="event">+ Termin</button><button class="btn" data-q="note">+ Notiz</button></div></div>
    <div class="kpis">
      ${kpi(props.filter(p => p.status === 'Aktiv').length, 'Aktive Objekte', '#/objekte')}
      ${kpi(contacts.length, 'Kontakte', '#/kontakte')}
      ${kpi(tasks.length, 'Fällige Aufgaben', '#/aufgaben', tasks.length ? 'warn' : '')}
      ${kpi(eur(pipeVal), 'Pipeline-Volumen', '#/pipeline')}
      ${kpi(eur(forecast), 'Provisions-Prognose (gewichtet)', '#/pipeline')}
      ${kpi(eur(umsatz), `Provision ${year} (abgeschlossen)`, '#/statistik')}
    </div>
    <div class="cols">
      <section class="card"><h2>Heute & überfällig</h2>${tasks.length ? html`<ul class="tasks">${tasks.slice(0, 10).map(taskRow)}</ul>` : empty('Alles erledigt 🎉')}</section>
      <section class="card"><h2>Termine (7 Tage)</h2>${events.length ? html`<ul class="list">${events.map(e => html`<li data-ev="${e.id}"><b class="when">${fmtDateShort(e.datum)} ${e.start || ''}</b><div class="grow"><div class="ttl">${e.titel}</div><div class="sub">${e.art}${e.contactId ? html` · ${cLink(e.contactId)}` : ''}${e.ort ? ' · ' + e.ort : ''}</div></div></li>`)}</ul>` : empty('Keine Termine in den nächsten 7 Tagen')}</section>
      <section class="card"><h2>Wiedervorlagen</h2>${followups.length ? html`<ul class="list">${followups.slice(0, 8).map(c => html`<li>${avatar(c)}<div class="grow"><div class="ttl">${cLink(c.id)}</div><div class="sub">fällig ${fmtDate(c.followup)} · ${c.kategorie}</div></div></li>`)}</ul>` : empty('Keine Wiedervorlagen fällig')}</section>
      <section class="card"><h2>Lange nicht kontaktiert</h2>${cold.length ? html`<ul class="list">${cold.map(x => html`<li>${avatar(x.c)}<div class="grow"><div class="ttl">${cLink(x.c.id)}</div><div class="sub">${x.c.kategorie} · seit ${daysBetween(x.last.slice(0, 10), t0)} Tagen kein Kontakt</div></div></li>`)}</ul>` : empty('Alle Eigentümer-Kontakte sind aktuell')}</section>
      <section class="card"><h2>Neue Objekt-Treffer</h2>${matches.length ? html`<ul class="list">${matches.map(x => html`<li><b class="when">${x.m.score}%</b><div class="grow"><div class="ttl">${cLink(x.c.id)} ↔ ${pLink(x.p.id)}</div><div class="sub">passt: ${x.m.hits.join(', ')}</div></div></li>`)}</ul>` : empty('Keine Treffer', 'Suchprofile bei Interessenten hinterlegen')}</section>
      <section class="card"><h2>Achtung bei Objekten</h2>${expiring.length ? html`<ul class="list">${expiring.slice(0, 8).map(x => html`<li><span class="ic">⚠️</span><div class="grow"><div class="ttl">${pLink(x.p.id)}</div><div class="sub">${x.txt}</div></div></li>`)}</ul>` : empty('Nichts Kritisches')}</section>
      <section class="card"><h2>Geburtstage (14 Tage)</h2>${bdays.length ? html`<ul class="list">${bdays.map(x => html`<li><span class="ic">🎂</span><div class="grow"><div class="ttl">${cLink(x.c.id)}</div><div class="sub">${fmtDate(x.n)}</div></div></li>`)}</ul>` : empty('Keine Geburtstage')}</section>
      <section class="card"><h2>Letzte Aktivitäten</h2>${timeline(db.all('activities').slice().sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 6), { showRefs: true })}</section>
    </div>`.s;
  bindTasks(el);
  el.querySelectorAll('[data-ev]').forEach(li => li.onclick = e => { if (!e.target.closest('a')) eventForm(db.get('events', li.dataset.ev)); });
  const q = { contact: () => contactForm({}, c => location.hash = '#/kontakte/' + c.id), property: () => propertyForm({}, p => location.hash = '#/objekte/' + p.id), task: () => taskForm(), event: () => eventForm(), note: () => activityForm() };
  el.querySelectorAll('[data-q]').forEach(b => b.onclick = q[b.dataset.q]);
}
