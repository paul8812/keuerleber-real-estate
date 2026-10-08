import * as db from '../db.js';
import { html, raw, iso, today, fmtDate, download, esc } from '../util.js';
import { eventForm, taskForm } from '../forms.js';
import { cLink, empty } from '../ui.js';

let cur = new Date(); cur.setDate(1);
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function ics() {
  const z = d => d.replace(/-/g, ''), t = s => (s || '00:00').replace(':', '') + '00';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Keuerleber CRM//DE'];
  db.all('events').forEach(e => L.push('BEGIN:VEVENT', 'UID:' + e.id + '@kre-crm', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]|\.\d+/g, ''), `DTSTART:${z(e.datum)}T${t(e.start)}`, `DTEND:${z(e.datum)}T${t(e.ende || e.start)}`, 'SUMMARY:' + (e.titel || '').replace(/[,;\n]/g, ' '), 'LOCATION:' + (e.ort || '').replace(/[,;\n]/g, ' '), 'DESCRIPTION:' + (e.notiz || '').replace(/\n/g, '\\n'), 'END:VEVENT'));
  L.push('END:VCALENDAR'); download('termine.ics', L.join('\r\n'), 'text/calendar');
}
const gcal = e => { const z = d => d.replace(/-/g, ''), t = s => (s || '00:00').replace(':', '') + '00'; return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.titel)}&dates=${z(e.datum)}T${t(e.start)}/${z(e.datum)}T${t(e.ende || e.start)}&location=${encodeURIComponent(e.ort || '')}&details=${encodeURIComponent(e.notiz || '')}`; };

export function render(el) {
  const y = cur.getFullYear(), m = cur.getMonth(), first = new Date(y, m, 1), startOffset = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const evs = db.all('events'), tasks = db.all('tasks').filter(t => !t.done && t.faellig);
  const cells = []; for (let i = 0; i < startOffset; i++) cells.push(null); for (let d = 1; d <= days; d++) cells.push(iso(new Date(y, m, d)));
  const t0 = today(); const month = `${y}-${String(m + 1).padStart(2, '0')}`;
  const upcoming = evs.filter(e => e.datum >= t0).sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start)).slice(0, 8);
  el.innerHTML = html`<div class="head"><h1>Kalender</h1><div class="actions"><button class="btn" data-ics>.ics Export</button><button class="btn primary" data-new>+ Termin</button></div></div>
    <div class="split wide"><section class="card"><div class="calnav"><button class="btn" data-p>‹</button><b>${MON[m]} ${y}</b><button class="btn" data-n>›</button><button class="btn ghost" data-t>Heute</button></div>
      <div class="cal">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => html`<div class="dow">${d}</div>`)}
      ${cells.map(d => { if (!d) return html`<div class="day blank"></div>`; const de = evs.filter(e => e.datum === d).sort((a, b) => (a.start || '').localeCompare(b.start || '')), dt = tasks.filter(t => t.faellig === d);
        return html`<div class="day ${d === t0 ? 'today' : ''}" data-d="${d}"><span class="dn">${+d.slice(8)}</span>${de.slice(0, 3).map(e => html`<div class="ev" data-ev="${e.id}">${e.start || ''} ${e.titel}</div>`)}${de.length > 3 ? html`<div class="more">+${de.length - 3}</div>` : ''}${dt.length ? html`<div class="tk" data-dtask="${d}">✓ ${dt.length}</div>` : ''}</div>`; })}</div></section>
    <section class="card"><h2>Nächste Termine</h2>${upcoming.length ? html`<ul class="list">${upcoming.map(e => html`<li data-ev="${e.id}"><b class="when">${fmtDate(e.datum)}<br><small>${e.start || ''}</small></b><div class="grow"><div class="ttl">${e.titel}</div><div class="sub">${e.art}${e.contactId ? html` · ${cLink(e.contactId)}` : ''}${e.ort ? ' · ' + e.ort : ''}</div></div><a class="mini" target="_blank" rel="noopener" href="${gcal(e)}" title="In Google Kalender übernehmen">G</a></li>`)}</ul>` : empty('Keine kommenden Termine')}</section></div>`.s;
  el.querySelector('[data-p]').onclick = () => { cur.setMonth(m - 1); render(el); };
  el.querySelector('[data-n]').onclick = () => { cur.setMonth(m + 1); render(el); };
  el.querySelector('[data-t]').onclick = () => { cur = new Date(); cur.setDate(1); render(el); };
  el.querySelector('[data-new]').onclick = () => eventForm();
  el.querySelector('[data-ics]').onclick = ics;
  el.querySelectorAll('[data-ev]').forEach(x => x.onclick = e => { e.stopPropagation(); if (e.target.closest('a')) return; eventForm(db.get('events', x.dataset.ev)); });
  el.querySelectorAll('.day[data-d]').forEach(x => x.onclick = e => { if (e.target.closest('[data-ev]')) return; if (e.target.closest('[data-dtask]')) { location.hash = '#/aufgaben'; return; } eventForm({ datum: x.dataset.d }); });
}
