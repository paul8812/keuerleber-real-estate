import * as db from '../db.js';
import { html, raw, esc, fmtDate, eur, num, download, toCSV, today, daysBetween, pct, toast } from '../util.js';
import { OBJEKT_ARTEN, OBJEKT_STATUS, STATUS_FARBE } from '../consts.js';
import { propertyForm, taskForm, eventForm, dealForm, activityForm } from '../forms.js';
import { empty, timeline, cLink, statusBadge, badge, adresse, preisM2, matchesForProperty } from '../ui.js';
import { taskRow, bindTasks } from './tasks.js';

let q = '', st = '', art = '', verm = '';

function list(el) {
  const s = q.toLowerCase();
  const rows = db.all('properties').filter(p => (!st ? p.status !== 'Archiv' : p.status === st) && (!art || p.art === art) && (!verm || p.vermarktung === verm) && (!s || [p.titel, p.nr, p.ort, p.strasse, p.plz].join(' ').toLowerCase().includes(s)))
    .sort((a, b) => OBJEKT_STATUS.indexOf(a.status) - OBJEKT_STATUS.indexOf(b.status) || (b.created || '').localeCompare(a.created || ''));
  el.querySelector('#plist').innerHTML = rows.length ? html`<div class="pgrid">${rows.map(p => { const img = (p.bilder || '').split('\n')[0].trim(); return html`<a class="pcard" href="#/objekte/${p.id}"><div class="pimg" style="${img ? `background-image:url('${img.replace(/['")\\]/g, '')}')` : ''}">${img ? '' : '⌂'}<span class="pst">${statusBadge(p.status)}</span></div>
      <div class="pbody"><div class="pnr">${p.nr} · ${p.art}</div><h3>${p.titel}</h3><div class="sub">${[p.plz, p.ort].filter(Boolean).join(' ')}</div>
      <div class="pfacts"><b>${eur(p.preis)}${p.vermarktung === 'Miete' ? '/Monat' : ''}</b><span>${p.flaeche ? num(p.flaeche, 1) + ' m²' : ''}</span><span>${p.zimmer ? p.zimmer + ' Zi.' : ''}</span></div></div></a>`; })}</div>`.s : html`<div class="pad">${empty('Keine Objekte gefunden', 'Mit „+ Objekt“ das erste anlegen')}</div>`.s;
  el.querySelector('#pcount').textContent = rows.length + ' Objekte';
}

export function render(el, id) { id ? detail(el, id) : overview(el); }

function overview(el) {
  el.innerHTML = html`<div class="head"><h1>Objekte <small id="pcount" class="muted"></small></h1><div class="actions"><button class="btn" data-exp>Export</button><button class="btn primary" data-new>+ Objekt</button></div></div>
    <div class="filters"><input type="search" id="pq" placeholder="Suchen (Titel, Nr., Ort, PLZ) …" value="${q}">
    <select id="ps"><option value="">Alle (ohne Archiv)</option>${OBJEKT_STATUS.map(s => html`<option ${s === st ? raw('selected') : ''}>${s}</option>`)}</select>
    <select id="pa"><option value="">Alle Arten</option>${OBJEKT_ARTEN.map(s => html`<option ${s === art ? raw('selected') : ''}>${s}</option>`)}</select>
    <select id="pv"><option value="">Kauf & Miete</option><option ${verm === 'Kauf' ? raw('selected') : ''}>Kauf</option><option ${verm === 'Miete' ? raw('selected') : ''}>Miete</option></select></div>
    <div id="plist"></div>`.s;
  list(el);
  el.querySelector('#pq').oninput = e => { q = e.target.value; list(el); };
  el.querySelector('#ps').onchange = e => { st = e.target.value; list(el); };
  el.querySelector('#pa').onchange = e => { art = e.target.value; list(el); };
  el.querySelector('#pv').onchange = e => { verm = e.target.value; list(el); };
  el.querySelector('[data-new]').onclick = () => propertyForm({}, p => location.hash = '#/objekte/' + p.id);
  el.querySelector('[data-exp]').onclick = () => download('objekte.csv', toCSV(db.all('properties'), [['nr', 'Nr'], ['titel', 'Titel'], ['vermarktung', 'Vermarktung'], ['art', 'Art'], ['status', 'Status'], ['strasse', 'Strasse'], ['plz', 'PLZ'], ['ort', 'Ort'], ['preis', 'Preis'], ['flaeche', 'Wohnflaeche'], ['zimmer', 'Zimmer'], ['baujahr', 'Baujahr']]), 'text/csv');
}

export function exposee(p) {
  const s = db.settings(), o = db.get('contacts', p.eigentuemerId);
  const imgs = (p.bilder || '').split('\n').map(x => x.trim()).filter(Boolean);
  const abs = u => { try { return new URL(u, location.href.replace(/crm\/.*$/, '')).href; } catch { return u; } };
  const rows = [['Objektart', p.art], ['Vermarktung', p.vermarktung], [p.vermarktung === 'Miete' ? 'Kaltmiete' : 'Kaufpreis', p.preis && eur(p.preis)], ['Wohnfläche', p.flaeche && num(p.flaeche, 1) + ' m²'], ['Grundstück', p.grundstueck && num(p.grundstueck) + ' m²'], ['Zimmer', p.zimmer], ['Baujahr', p.baujahr], ['Etage', p.etage], ['Bäder', p.bad], ['Stellplätze', p.stellplaetze], ['Heizung', p.heizung], ['Hausgeld', p.hausgeld && eur(p.hausgeld)], ['Energieklasse', p.eKlasse], ['Energiekennwert', p.eWert && p.eWert + ' kWh/(m²·a)']].filter(r => r[1]);
  const prov = p.provisionGesamt != null && p.provisionGesamt !== '' ? p.provisionGesamt : null;
  const w = window.open('', '_blank'); if (!w) { toast('Pop-up blockiert', 'err'); return; }
  w.document.write(`<!doctype html><html lang="de"><meta charset="utf-8"><title>Exposé ${esc(p.titel)}</title><style>
  body{font-family:Helvetica,Arial,sans-serif;color:#222;max-width:820px;margin:0 auto;padding:32px}h1{font-size:28px;margin:0 0 4px}.sub{color:#777;margin-bottom:20px}
  .hero{width:100%;height:380px;object-fit:cover;border-radius:6px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0 20px}.g img{width:100%;height:150px;object-fit:cover;border-radius:4px}
  table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:7px 4px;border-bottom:1px solid #e5e5e5}td:first-child{color:#777;width:40%}h2{font-size:16px;text-transform:uppercase;letter-spacing:.1em;color:#a98a4f;margin:28px 0 6px}
  p{line-height:1.6;white-space:pre-wrap}.ft{margin-top:36px;padding-top:14px;border-top:2px solid #c9a96e;font-size:13px;color:#555}.pr{font-size:26px;font-weight:700;color:#a98a4f;margin:8px 0}
  @media print{body{padding:0}button{display:none}}</style><body><button onclick="print()" style="float:right">Drucken / PDF</button>
  <h1>${esc(p.titel)}</h1><div class="sub">${esc(adresse({ ...p, strasse: '' }))}</div>
  ${imgs[0] ? `<img class="hero" src="${esc(abs(imgs[0]))}">` : ''}${imgs.length > 1 ? `<div class="g">${imgs.slice(1, 7).map(i => `<img src="${esc(abs(i))}">`).join('')}</div>` : ''}
  <div class="pr">${p.preis ? eur(p.preis) + (p.vermarktung === 'Miete' ? ' mtl. kalt' : '') : 'Preis auf Anfrage'}</div>
  <table>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>
  ${p.beschreibung ? `<h2>Objektbeschreibung</h2><p>${esc(p.beschreibung)}</p>` : ''}${p.ausstattung ? `<h2>Ausstattung & Lage</h2><p>${esc(p.ausstattung)}</p>` : ''}
  ${prov != null && p.vermarktung === 'Kauf' ? `<h2>Käuferprovision</h2><p>${esc(String(prov))} % inkl. MwSt. des Kaufpreises.</p>` : ''}
  <div class="ft"><b>${esc(s.firma)}</b> · ${esc(s.inhaber)}<br>${esc([s.strasse, s.plz + ' ' + s.ort].filter(Boolean).join(', '))}<br>${esc([s.tel, s.email, s.web].filter(Boolean).join(' · '))}</div></body></html>`);
  w.document.close();
}

function detail(el, id) {
  const p = db.get('properties', id);
  if (!p) { el.innerHTML = html`<a href="#/objekte" class="back">← Objekte</a>${empty('Objekt nicht gefunden')}`.s; return; }
  const acts = db.all('activities').filter(a => a.propertyId === id);
  const tasks = db.all('tasks').filter(t => t.propertyId === id).sort((a, b) => (a.done - b.done) || (a.faellig || '').localeCompare(b.faellig || ''));
  const deals = db.all('deals').filter(d => d.propertyId === id);
  const evs = db.all('events').filter(e => e.propertyId === id).sort((a, b) => b.datum.localeCompare(a.datum));
  const matches = matchesForProperty(p);
  const imgs = (p.bilder || '').split('\n').map(x => x.trim()).filter(Boolean);
  const m2 = preisM2(p), tage = p.eingestelltAm ? daysBetween(p.eingestelltAm, today()) : null;
  const rend = p.preis && p.mieteJahr && p.vermarktung === 'Kauf' ? p.mieteJahr / p.preis * 100 : null;
  const kv = (l, v) => v || v === 0 ? html`<div class="kv"><span>${l}</span><b>${v}</b></div>` : '';
  const erl = deals.filter(d => d.board === 'vertrieb' && d.stage === 'Besichtigung').length;
  el.innerHTML = html`<a href="#/objekte" class="back">← Objekte</a>
    <div class="head"><div><p class="muted">${p.nr} · ${p.art} · ${p.vermarktung}</p><h1>${p.titel}</h1><p class="muted">${adresse(p)}</p></div><div class="actions">${statusBadge(p.status)}<button class="btn" data-expose>Exposé</button><button class="btn" data-edit>Bearbeiten</button></div></div>
    ${imgs.length ? html`<div class="gallery">${imgs.slice(0, 6).map(i => html`<img src="${i}" loading="lazy" alt="">`)}</div>` : ''}
    <div class="kpis small">
      <div class="kpi"><b>${eur(p.preis)}</b><span>${p.vermarktung === 'Miete' ? 'Kaltmiete' : 'Kaufpreis'}</span></div>
      <div class="kpi"><b>${m2 ? eur(m2) : '–'}</b><span>pro m²</span></div>
      <div class="kpi"><b>${rend ? pct(rend, 2) : '–'}</b><span>Bruttorendite (Ist)</span></div>
      <div class="kpi"><b>${tage != null ? tage + ' Tage' : '–'}</b><span>online</span></div>
      <div class="kpi"><b>${matches.length}</b><span>passende Interessenten</span></div>
    </div>
    <div class="split"><div>
      <section class="card"><h2>Objektdaten</h2>${kv('Wohnfläche', p.flaeche && num(p.flaeche, 1) + ' m²')}${kv('Grundstück', p.grundstueck && num(p.grundstueck) + ' m²')}${kv('Zimmer', p.zimmer)}${kv('Baujahr', p.baujahr)}${kv('Etage', p.etage)}${kv('Bäder', p.bad)}${kv('Stellplätze', p.stellplaetze)}${kv('Heizung', p.heizung)}${kv('Hausgeld', p.hausgeld && eur(p.hausgeld))}
        ${kv('Energieklasse', p.eKlasse && `${p.eKlasse}${p.eWert ? ' · ' + p.eWert + ' kWh/m²a' : ''}${p.eGueltig ? ' · bis ' + fmtDate(p.eGueltig) : ''}`)}
        ${p.eigentuemerId ? html`<div class="kv"><span>Eigentümer</span><b>${cLink(p.eigentuemerId)}</b></div>` : ''}
        ${kv('Maklervertrag', p.auftragVon || p.auftragBis ? `${p.alleinauftrag ? 'Alleinauftrag · ' : ''}${fmtDate(p.auftragVon)} – ${fmtDate(p.auftragBis)}` : '')}${kv('Provision', p.provisionGesamt && p.provisionGesamt + ' %')}
        ${p.beschreibung ? html`<h3>Beschreibung</h3><p class="note">${p.beschreibung}</p>` : ''}${p.ausstattung ? html`<h3>Ausstattung / Lage</h3><p class="note">${p.ausstattung}</p>` : ''}${p.notiz ? html`<h3>Interne Notiz</h3><p class="note">${p.notiz}</p>` : ''}</section>
      <section class="card"><h2>Passende Interessenten</h2>${matches.length ? html`<ul class="list">${matches.slice(0, 10).map(x => html`<li><b class="when">${x.m.score}%</b><div class="grow"><div class="ttl">${cLink(x.c.id)}</div><div class="sub">passt: ${x.m.hits.join(', ')}${x.c.sp_budgetMax ? ' · Budget ' + eur(x.c.sp_budgetMax) : ''}</div></div></li>`)}</ul>` : html`<p class="muted">Keine Treffer. Suchprofile bei Interessenten pflegen.</p>`}</section>
    </div><div>
      <section class="card"><h2>Vorgänge <button class="mini" data-deal>+</button></h2>${deals.length ? html`<ul class="list">${deals.map(d => html`<li data-deal-id="${d.id}"><div class="grow"><div class="ttl">${d.titel}</div><div class="sub">${d.stage} ${d.contactId ? '· ' : ''}${d.contactId ? cLink(d.contactId) : ''}</div></div></li>`)}</ul>` : html`<p class="muted">Keine Vorgänge</p>`}</section>
      <section class="card"><h2>Aufgaben <button class="mini" data-task>+</button></h2>${tasks.length ? html`<ul class="tasks">${tasks.map(taskRow)}</ul>` : html`<p class="muted">Keine Aufgaben</p>`}</section>
      <section class="card"><h2>Termine <button class="mini" data-event>+</button></h2>${evs.length ? html`<ul class="list">${evs.map(e => html`<li data-ev="${e.id}"><b class="when">${fmtDate(e.datum)}</b><div class="grow"><div class="ttl">${e.titel}</div><div class="sub">${e.art}${e.contactId ? html` · ${cLink(e.contactId)}` : ''}</div></div></li>`)}</ul>` : html`<p class="muted">Keine Termine</p>`}</section>
      <section class="card"><h2>Verlauf <button class="mini" data-act>+ Eintrag</button></h2>${timeline(acts, { showRefs: true })}</section>
    </div></div>`.s;
  bindTasks(el);
  el.querySelector('[data-edit]').onclick = () => propertyForm(p);
  el.querySelector('[data-expose]').onclick = () => exposee(p);
  el.querySelector('[data-task]').onclick = () => taskForm({ propertyId: id });
  el.querySelector('[data-event]').onclick = () => eventForm({ propertyId: id, titel: 'Besichtigung ' + p.titel });
  el.querySelector('[data-act]').onclick = () => activityForm({ propertyId: id });
  el.querySelector('[data-deal]').onclick = () => dealForm({ propertyId: id, board: 'vertrieb', stage: 'Anfrage', titel: p.titel, wert: p.preis });
  el.querySelectorAll('[data-deal-id]').forEach(li => li.onclick = e => { if (!e.target.closest('a')) dealForm(db.get('deals', li.dataset.dealId)); });
  el.querySelectorAll('[data-ev]').forEach(li => li.onclick = e => { if (!e.target.closest('a')) eventForm(db.get('events', li.dataset.ev)); });
}
