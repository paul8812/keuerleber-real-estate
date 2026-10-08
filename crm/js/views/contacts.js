import * as db from '../db.js';
import { html, raw, fullName, fmtDate, fmtDT, download, toCSV, parseCSV, toast, modal, today, daysBetween, eur } from '../util.js';
import { KONTAKT_ARTEN } from '../consts.js';
import { contactForm, dealForm, taskForm, eventForm, activityForm } from '../forms.js';
import { avatar, badge, empty, timeline, pLink, matchesForContact, lastContact, statusBadge, adresse } from '../ui.js';
import { taskRow, bindTasks } from './tasks.js';

let q = '', art = '', status = 'Aktiv', sort = 'name';

function dupes() {
  const g = {}; const add = (k, c) => { if (k) (g[k] ||= []).push(c); };
  db.all('contacts').forEach(c => { add('m:' + (c.email || '').toLowerCase(), c); add('t:' + (c.mobil || c.tel || '').replace(/\D/g, '').replace(/^(0049|49|0)/, ''), c); add('n:' + fullName(c).toLowerCase() + (c.plz || ''), c); });
  const seen = new Set(); return Object.values(g).filter(a => a.length > 1).filter(a => { const k = a.map(x => x.id).sort().join(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function list(el) {
  const s = q.toLowerCase();
  let rows = db.all('contacts').filter(c => (!art || c.kategorie === art) && (!status || c.status === status) && (!s || [fullName(c), c.firma, c.email, c.tel, c.mobil, c.ort, c.tags, c.plz].join(' ').toLowerCase().includes(s)));
  const key = { name: c => fullName(c).toLowerCase(), neu: c => '~' + (9e15 - Date.parse(c.created || 0)), kontakt: c => lastContact(c.id) || '0', follow: c => c.followup || '9999' }[sort];
  rows = rows.slice().sort((a, b) => String(key(a)).localeCompare(String(key(b)), 'de'));
  if (sort === 'kontakt') rows.reverse();
  el.querySelector('#clist').innerHTML = rows.length ? html`<table class="tbl"><thead><tr><th></th><th>Name</th><th>Art</th><th>Kontakt</th><th>Ort</th><th>Letzter Kontakt</th><th>Wiedervorlage</th></tr></thead><tbody>
    ${rows.slice(0, 300).map(c => { const lc = lastContact(c.id); return html`<tr data-id="${c.id}"><td>${avatar(c)}</td><td><b>${fullName(c)}</b>${c.firma && c.nachname ? html`<div class="sub">${c.firma}</div>` : ''}</td><td>${c.kategorie}</td><td>${c.mobil || c.tel || ''}<div class="sub">${c.email || ''}</div></td><td>${c.ort || ''}</td><td>${lc ? fmtDate(lc.slice(0, 10)) : '–'}</td><td class="${c.followup && c.followup <= today() ? 'late' : ''}">${c.followup ? fmtDate(c.followup) : ''}</td></tr>`; })}</tbody></table>
    ${rows.length > 300 ? html`<p class="muted pad">… ${rows.length - 300} weitere – Suche verfeinern</p>` : ''}`.s : html`<div class="pad">${empty('Keine Kontakte gefunden', 'Mit „+ Kontakt“ anlegen oder CSV importieren')}</div>`.s;
  el.querySelector('#ccount').textContent = rows.length + ' Kontakte';
  el.querySelectorAll('#clist tr[data-id]').forEach(tr => tr.onclick = () => location.hash = '#/kontakte/' + tr.dataset.id);
}

function importDlg() {
  modal('Kontakte aus CSV importieren', html`<p class="full muted">Spalten (Kopfzeile): vorname, nachname, firma, email, tel, mobil, strasse, plz, ort, kategorie, quelle, tags, notiz. Trennzeichen ; oder , – UTF-8.</p><label class="f full"><span>CSV-Datei</span><input type="file" name="file" accept=".csv,text/csv"></label>`, {
    saveLabel: 'Importieren', onSave: async (v, close, form) => {
      const f = form.querySelector('[type=file]').files[0]; if (!f) { toast('Bitte Datei wählen', 'err'); return false; }
      const rows = parseCSV(await f.text()); let n = 0;
      for (const r of rows) { if (!r.vorname && !r.nachname && !r.firma) continue; await db.save('contacts', { kategorie: r.kategorie || 'Interessent (Kauf)', anrede: r.anrede || '', vorname: r.vorname || '', nachname: r.nachname || '', firma: r.firma || '', email: r.email || '', tel: r.tel || '', mobil: r.mobil || '', strasse: r.strasse || '', plz: r.plz || '', ort: r.ort || '', quelle: r.quelle || '', tags: r.tags || '', notiz: r.notiz || '', status: 'Aktiv' }); n++; }
      toast(n + ' Kontakte importiert');
    }
  });
}

export function render(el, id) { id ? detail(el, id) : overview(el); }

function overview(el) {
  el.innerHTML = html`<div class="head"><h1>Kontakte <small id="ccount" class="muted"></small></h1><div class="actions"><button class="btn" data-dupe>Dubletten</button><button class="btn" data-imp>Import</button><button class="btn" data-exp>Export</button><button class="btn primary" data-new>+ Kontakt</button></div></div>
    <div class="filters"><input type="search" id="cq" placeholder="Suchen (Name, Firma, E-Mail, Telefon, Ort, Tags) …" value="${q}">
    <select id="ca"><option value="">Alle Arten</option>${KONTAKT_ARTEN.map(a => html`<option ${a === art ? raw('selected') : ''}>${a}</option>`)}</select>
    <select id="cs">${['Aktiv', 'Ruhend', 'Archiv', ''].map(a => html`<option value="${a}" ${a === status ? raw('selected') : ''}>${a || 'Alle Status'}</option>`)}</select>
    <select id="co">${[['name', 'Name A–Z'], ['neu', 'Neueste zuerst'], ['kontakt', 'Letzter Kontakt'], ['follow', 'Wiedervorlage']].map(([v, l]) => html`<option value="${v}" ${v === sort ? raw('selected') : ''}>${l}</option>`)}</select></div>
    <div class="card flush" id="clist"></div>`.s;
  list(el);
  el.querySelector('#cq').oninput = e => { q = e.target.value; list(el); };
  el.querySelector('#ca').onchange = e => { art = e.target.value; list(el); };
  el.querySelector('#cs').onchange = e => { status = e.target.value; list(el); };
  el.querySelector('#co').onchange = e => { sort = e.target.value; list(el); };
  el.querySelector('[data-new]').onclick = () => contactForm({}, c => location.hash = '#/kontakte/' + c.id);
  el.querySelector('[data-imp]').onclick = importDlg;
  el.querySelector('[data-exp]').onclick = () => download('kontakte.csv', toCSV(db.all('contacts'), [['kategorie', 'kategorie'], ['anrede', 'anrede'], ['vorname', 'vorname'], ['nachname', 'nachname'], ['firma', 'firma'], ['email', 'email'], ['tel', 'tel'], ['mobil', 'mobil'], ['strasse', 'strasse'], ['plz', 'plz'], ['ort', 'ort'], ['quelle', 'quelle'], ['tags', 'tags'], ['notiz', 'notiz']]), 'text/csv');
  el.querySelector('[data-dupe]').onclick = () => { const d = dupes(); modal('Mögliche Dubletten', d.length ? html`<div class="full">${d.map(g => html`<div class="dup">${g.map(c => html`<a class="lnk" href="#/kontakte/${c.id}">${fullName(c)} <small>${c.email || c.tel || c.mobil || ''}</small></a>`)}</div>`)}</div>` : html`<p class="full">Keine Dubletten gefunden 👍</p>`); };
}

function detail(el, id) {
  const c = db.get('contacts', id);
  if (!c) { el.innerHTML = html`<a href="#/kontakte" class="back">← Kontakte</a>${empty('Kontakt nicht gefunden')}`.s; return; }
  const acts = db.all('activities').filter(a => a.contactId === id);
  const tasks = db.all('tasks').filter(t => t.contactId === id).sort((a, b) => (a.done - b.done) || (a.faellig || '').localeCompare(b.faellig || ''));
  const deals = db.all('deals').filter(d => d.contactId === id);
  const evs = db.all('events').filter(e => e.contactId === id).sort((a, b) => b.datum.localeCompare(a.datum));
  const props = db.all('properties').filter(p => p.eigentuemerId === id);
  const matches = c.sp_aktiv ? matchesForContact(c) : [];
  const line = (l, v, href) => v ? html`<div class="kv"><span>${l}</span>${href ? html`<a href="${href}">${v}</a>` : html`<b>${v}</b>`}</div>` : '';
  const phone = (c.mobil || c.tel || '').replace(/[^\d+]/g, '');
  el.innerHTML = html`<a href="#/kontakte" class="back">← Kontakte</a>
    <div class="head"><div class="who">${avatar(c)}<div><h1>${fullName(c)}</h1><p class="muted">${c.kategorie}${c.firma && c.nachname ? ' · ' + c.firma : ''} ${c.status !== 'Aktiv' ? badge(c.status, '#777') : ''}</p></div></div>
      <div class="actions">${c.email ? html`<a class="btn" href="mailto:${c.email}">✉ E-Mail</a>` : ''}${phone ? html`<a class="btn" href="tel:${phone}">📞 Anrufen</a><a class="btn" target="_blank" rel="noopener" href="https://wa.me/${phone.replace(/^0/, '49').replace('+', '')}">WhatsApp</a>` : ''}<button class="btn" data-edit>Bearbeiten</button></div></div>
    <div class="split"><div>
      <section class="card"><h2>Stammdaten</h2>
        ${line('E-Mail', c.email, c.email && 'mailto:' + c.email)}${line('Telefon', c.tel, c.tel && 'tel:' + c.tel)}${line('Mobil', c.mobil, c.mobil && 'tel:' + c.mobil)}
        ${line('Adresse', adresse(c))}${line('Quelle', c.quelle)}${line('Tags', c.tags)}${line('Geburtstag', c.geburtstag && fmtDate(c.geburtstag))}
        ${line('Wiedervorlage', c.followup && fmtDate(c.followup))}${line('DSGVO', c.dsgvo ? 'Einwilligung liegt vor' : 'Keine Einwilligung vermerkt')}${line('Angelegt', c.created && fmtDT(c.created))}
        ${c.notiz ? html`<p class="note">${c.notiz}</p>` : ''}</section>
      ${c.sp_aktiv ? html`<section class="card"><h2>Suchprofil</h2>${line('Gesucht', [c.sp_vermarktung, c.sp_art].filter(Boolean).join(' · '))}${line('Budget bis', c.sp_budgetMax && eur(c.sp_budgetMax))}${line('Fläche ab', c.sp_flaecheMin && c.sp_flaecheMin + ' m²')}${line('Zimmer ab', c.sp_zimmerMin)}${line('Orte', c.sp_orte)}
        <h3>Passende Objekte</h3>${matches.length ? html`<ul class="list">${matches.slice(0, 6).map(x => html`<li><b class="when">${x.m.score}%</b><div class="grow"><div class="ttl">${pLink(x.p.id)}</div><div class="sub">${x.p.ort || ''} · ${eur(x.p.preis)}</div></div></li>`)}</ul>` : html`<p class="muted">Aktuell keine Treffer</p>`}</section>` : ''}
      ${props.length ? html`<section class="card"><h2>Objekte (Eigentümer)</h2><ul class="list">${props.map(p => html`<li><div class="grow"><div class="ttl">${pLink(p.id)}</div><div class="sub">${p.ort || ''} · ${eur(p.preis)}</div></div>${statusBadge(p.status)}</li>`)}</ul></section>` : ''}
      <section class="card"><h2>Vorgänge <button class="mini" data-deal>+</button></h2>${deals.length ? html`<ul class="list">${deals.map(d => html`<li data-deal-id="${d.id}"><div class="grow"><div class="ttl">${d.titel}</div><div class="sub">${d.stage} · ${eur(d.wert)}</div></div></li>`)}</ul>` : html`<p class="muted">Keine Vorgänge</p>`}</section>
    </div><div>
      <section class="card"><h2>Aufgaben <button class="mini" data-task>+</button></h2>${tasks.length ? html`<ul class="tasks">${tasks.map(taskRow)}</ul>` : html`<p class="muted">Keine Aufgaben</p>`}</section>
      <section class="card"><h2>Termine <button class="mini" data-event>+</button></h2>${evs.length ? html`<ul class="list">${evs.map(e => html`<li data-ev="${e.id}"><b class="when">${fmtDate(e.datum)}</b><div class="grow"><div class="ttl">${e.titel}</div><div class="sub">${e.art}${e.ort ? ' · ' + e.ort : ''}</div></div></li>`)}</ul>` : html`<p class="muted">Keine Termine</p>`}</section>
      <section class="card"><h2>Verlauf <button class="mini" data-act>+ Eintrag</button></h2>${timeline(acts)}</section>
    </div></div>`.s;
  bindTasks(el);
  el.querySelector('[data-edit]').onclick = () => contactForm(c);
  el.querySelector('[data-task]').onclick = () => taskForm({ contactId: id });
  el.querySelector('[data-event]').onclick = () => eventForm({ contactId: id });
  el.querySelector('[data-act]').onclick = () => activityForm({ contactId: id });
  el.querySelector('[data-deal]').onclick = () => dealForm({ contactId: id, titel: fullName(c) });
  el.querySelectorAll('[data-deal-id]').forEach(li => li.onclick = () => dealForm(db.get('deals', li.dataset.dealId)));
  el.querySelectorAll('[data-ev]').forEach(li => li.onclick = () => eventForm(db.get('events', li.dataset.ev)));
}
