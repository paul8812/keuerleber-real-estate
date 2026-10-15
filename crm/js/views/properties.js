import * as db from '../db.js';
import { html, raw, esc, fmtDate, fmtDT, eur, num, download, toCSV, today, daysBetween, pct, toast, confirmDlg } from '../util.js';
import { OBJEKT_ARTEN, OBJEKT_STATUS, STATUS_FARBE, sl } from '../consts.js';
import { propertyForm, taskForm, eventForm, dealForm, activityForm } from '../forms.js';
import { empty, timeline, cLink, statusBadge, badge, adresse, preisM2, matchesForProperty } from '../ui.js';
import { taskRow, bindTasks } from './tasks.js';
import * as W from '../website.js';

// Website: alle Objekte veröffentlichen, mit Fortschritt im Toast
export async function websiteVeroeffentlichen(btn) {
  if (!W.hasToken()) { toast('Zuerst den GitHub-Zugang unter Einstellungen → Website hinterlegen', 'err'); location.hash = '#/einstellungen'; return; }
  const alt = btn ? btn.textContent : '';
  try { if (btn) btn.disabled = true; const r = await W.publish(t => { if (btn) btn.textContent = t; }); toast(`Website aktualisiert: ${r.anzahl} Objekt(e) online – in ca. 1 Minute sichtbar`); }
  catch (e) { toast('Veröffentlichen fehlgeschlagen: ' + e.message, 'err'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = alt; } }
}

let q = '', st = '', art = '', verm = '';

function list(el) {
  const s = q.toLowerCase();
  const rows = db.all('properties').filter(p => (!st ? p.status !== 'Archiv' : p.status === st) && (!art || p.art === art) && (!verm || p.vermarktung === verm) && (!s || [p.titel, p.nr, p.ort, p.strasse, p.plz].join(' ').toLowerCase().includes(s)))
    .sort((a, b) => OBJEKT_STATUS.indexOf(a.status) - OBJEKT_STATUS.indexOf(b.status) || (b.created || '').localeCompare(a.created || ''));
  el.querySelector('#plist').innerHTML = rows.length ? html`<div class="pgrid">${rows.map(p => { let img = (p.bilder || '').split('\n')[0].trim(); if (img.startsWith('objektbilder/')) img = '../' + img; return html`<a class="pcard" href="#/objekte/${p.id}"><div class="pimg" style="${img ? `background-image:url('${img.replace(/['")\\]/g, '')}')` : ''}">${img ? '' : '⌂'}<span class="pst">${statusBadge(p.status)}</span>${p.webLive ? html`<span class="pweb" title="Auf der Website">🌐 online</span>` : ''}</div>
      <div class="pbody"><div class="pnr">${p.nr} · ${p.art}</div><h3>${p.titel}</h3><div class="sub">${[p.plz, p.ort].filter(Boolean).join(' ')}</div>
      <div class="pfacts"><b>${eur(p.preis)}${p.vermarktung === 'Miete' ? '/Monat' : ''}</b><span>${p.flaeche ? num(p.flaeche, 1) + ' m²' : ''}</span><span>${p.zimmer ? p.zimmer + ' Zi.' : ''}</span></div></div></a>`; })}</div>`.s : html`<div class="pad">${empty('Keine Objekte gefunden', 'Mit „+ Objekt“ das erste anlegen')}</div>`.s;
  el.querySelector('#pcount').textContent = rows.length + ' Objekte';
}

export function render(el, id) { id ? detail(el, id) : overview(el); }

function overview(el) {
  el.innerHTML = html`<div class="head"><h1>Objekte <small id="pcount" class="muted"></small></h1><div class="actions"><button class="btn" data-exp>Export</button><button class="btn ${W.websiteAusstehend() ? 'primary' : ''}" data-pub>🌐 Website aktualisieren${W.websiteAusstehend() ? ' •' : ''}</button><button class="btn primary" data-new>+ Objekt</button></div></div>
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
  el.querySelector('[data-pub]').onclick = e => websiteVeroeffentlichen(e.currentTarget);
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
  @font-face{font-family:Jost;src:url(${abs('fonts/jost-var.woff2')}) format('woff2');font-weight:100 900}@font-face{font-family:'Cormorant Garamond';src:url(${abs('fonts/cormorant-600.woff2')}) format('woff2');font-weight:500 700}\n  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}.top{background:#080808;padding:16px 22px;margin:-32px -32px 26px;display:flex;align-items:center;justify-content:space-between}.lk{display:flex;align-items:center;gap:14px}.lk img{height:58px;width:auto}.lc{display:flex;flex-direction:column;gap:6px}.ln{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:23px;letter-spacing:.2em;padding-left:.2em;text-transform:uppercase;color:#d9c08a;line-height:1;text-align:center}.ls{display:flex;align-items:center;gap:9px;font-weight:500;font-size:11.5px;letter-spacing:.5em;text-transform:uppercase;color:#ede8e0;line-height:1}.ls i{flex:1;height:1px;background:rgba(201,169,110,.65);min-width:6px}.ls span{margin-right:-.5em}.top small{color:#c9a96e;letter-spacing:.2em;text-transform:uppercase;font-size:10px}\n  body{font-family:Jost,Helvetica,Arial,sans-serif;color:#222;max-width:820px;margin:0 auto;padding:32px}h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;font-weight:600;font-variant-numeric:lining-nums;margin:0 0 4px}.sub{color:#777;margin-bottom:20px}
  .hero{width:100%;height:380px;object-fit:cover;border-radius:6px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0 20px}.g img{width:100%;height:150px;object-fit:cover;border-radius:4px}
  table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:7px 4px;border-bottom:1px solid #e5e5e5}td:first-child{color:#777;width:40%}h2{font-family:Jost,sans-serif;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:#a98a4f;margin:28px 0 6px}
  p{line-height:1.6;white-space:pre-wrap}.ft{margin-top:36px;padding-top:14px;border-top:2px solid #c9a96e;font-size:13px;color:#555}.pr{font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:600;font-variant-numeric:lining-nums;color:#a98a4f;margin:8px 0}
  @media print{body{padding:0}button{display:none}}</style><body><div class="top"><div class="lk"><img src="${esc(abs('logo/Wappen_gold.svg'))}"><span class="lc"><span class="ln">Keuerleber</span><span class="ls"><i></i><span>Immobilien</span><i></i></span></span></div><small>Exposé · ${esc(p.nr || '')}</small></div><button onclick="print()" style="float:right">Drucken / PDF</button>
  <h1>${esc(p.titel)}</h1><div class="sub">${esc(adresse({ ...p, strasse: '' }))}</div>
  ${imgs[0] ? `<img class="hero" src="${esc(abs(imgs[0]))}">` : ''}${imgs.length > 1 ? `<div class="g">${imgs.slice(1, 7).map(i => `<img src="${esc(abs(i))}">`).join('')}</div>` : ''}
  <div class="pr">${p.preis ? eur(p.preis) + (p.vermarktung === 'Miete' ? ' mtl. kalt' : '') : 'Preis auf Anfrage'}</div>
  <table>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>
  ${p.beschreibung ? `<h2>Objektbeschreibung</h2><p>${esc(p.beschreibung)}</p>` : ''}${p.ausstattung ? `<h2>Ausstattung & Lage</h2><p>${esc(p.ausstattung)}</p>` : ''}
  ${p.vermarktung !== 'Miete' ? `<h2>Provision</h2><p>Für den Käufer provisionsfrei.</p>` : ''}
  <div class="ft"><b>${esc(s.firma)}</b> · ${esc(s.inhaber)}<br>${esc([s.strasse, s.plz + ' ' + s.ort].filter(Boolean).join(', '))}<br>${esc([s.tel, s.email, s.web].filter(Boolean).join(' · '))}</div></body></html>`);
  w.document.close();
}

function webCard(p) {
  const soll = W.sollOnline(p), offen = W.ausstehend(p), tok = W.hasToken();
  const status = p.webLive ? (offen ? (soll ? '🟡 Online – Änderungen noch nicht veröffentlicht' : '🟡 Online – wird beim Veröffentlichen entfernt') : '🟢 Online auf keuerleber-immobilien.de')
    : soll ? '🟡 Noch nicht veröffentlicht' : '⚪ Nicht auf der Website';
  return html`<section class="card webcard"><div class="webrow"><div><h2>Website</h2><p>${status}${p.webPublished ? html` <span class="muted small">· zuletzt ${fmtDT(p.webPublished)}</span>` : ''}</p>
      ${p.webTeaser ? html`<p class="muted small">Teaser-Modus: Preis, Adresse und Zahlen nur auf Anfrage · ${Math.min(W.bilderListe(p).length, Number(p.webTeaserBilder) || 4)} Fotos öffentlich${W.toImmo(p).bilderMehr ? `, „+${W.toImmo(p).bilderMehr} weitere auf Anfrage“` : ''}</p>` : ''}
      <p class="muted small">Hochgeladene Fotos liegen im öffentlichen Website-Repository – nur Fotos hochladen, die gezeigt werden dürfen.</p>
      ${W.NICHT_ONLINE.includes(p.status) && p.webOnline ? html`<p class="muted small">Status „${p.status}“ – erscheint nicht auf der Website.</p>` : ''}
      ${tok ? '' : html`<p class="bad small">Zum Veröffentlichen einmal den GitHub-Zugang unter <a class="lnk" href="#/einstellungen">Einstellungen → Website</a> hinterlegen.</p>`}</div>
    <div class="actions wrap">${!p.webOnline ? html`<button class="btn primary" data-web="on">🌐 Auf Website veröffentlichen</button>` : html`${offen ? html`<button class="btn primary" data-web="pub">Änderungen veröffentlichen</button>` : ''}<button class="btn" data-web="off">Von Website entfernen</button>`}
      ${p.webLive ? html`<a class="btn ghost" target="_blank" rel="noopener" href="${W.SITE}#immobilien">Ansehen ↗</a>` : ''}
      <label class="btn fotolbl">+ Fotos hochladen<input type="file" accept="image/*" multiple data-web="fotos" hidden></label></div></div></section>`;
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
    ${imgs.length ? html`<div class="gallery">${imgs.map((i, n) => html`<div class="gimg"><img src="${i.startsWith('objektbilder/') ? '../' + i : i}" loading="lazy" alt="">${p.webTeaser && n < (Number(p.webTeaserBilder) || 4) ? html`<span>öffentlich</span>` : n === 0 ? html`<span>Titelbild</span>` : ''}</div>`)}</div>` : ''}
    ${webCard(p)}
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
        ${p.eigentuemerId ? html`<div class="kv"><span>Verkäufer / Bauträger</span><b>${cLink(p.eigentuemerId)}</b></div>` : ''}
        ${kv('Vertriebsvereinbarung', p.auftragVon || p.auftragBis ? `${p.alleinauftrag ? 'Exklusiv · ' : ''}${fmtDate(p.auftragVon)} – ${fmtDate(p.auftragBis)}` : '')}${kv('Deine Vergütung', eur(Number(p.verguetung) || Number(db.settings().verguetung) || 8000) + ' netto' + (p.verguetung ? '' : ' (Standard)'))}
        ${p.beschreibung ? html`<h3>Beschreibung</h3><p class="note">${p.beschreibung}</p>` : ''}${p.ausstattung ? html`<h3>Ausstattung / Lage</h3><p class="note">${p.ausstattung}</p>` : ''}${p.notiz ? html`<h3>Interne Notiz</h3><p class="note">${p.notiz}</p>` : ''}</section>
      <section class="card"><h2>Passende Interessenten</h2>${matches.length ? html`<ul class="list">${matches.slice(0, 10).map(x => html`<li><b class="when">${x.m.score}%</b><div class="grow"><div class="ttl">${cLink(x.c.id)}</div><div class="sub">passt: ${x.m.hits.join(', ')}${x.c.sp_budgetMax ? ' · Budget ' + eur(x.c.sp_budgetMax) : ''}</div></div></li>`)}</ul>` : html`<p class="muted">Keine Treffer. Suchprofile bei Interessenten pflegen.</p>`}</section>
    </div><div>
      <section class="card"><h2>Vorgänge <button class="mini" data-deal>+</button></h2>${deals.length ? html`<ul class="list">${deals.map(d => html`<li data-deal-id="${d.id}"><div class="grow"><div class="ttl">${d.titel}</div><div class="sub">${sl(d.stage)} ${d.contactId ? '· ' : ''}${d.contactId ? cLink(d.contactId) : ''}</div></div></li>`)}</ul>` : html`<p class="muted">Keine Vorgänge</p>`}</section>
      <section class="card"><h2>Aufgaben <button class="mini" data-task>+</button></h2>${tasks.length ? html`<ul class="tasks">${tasks.map(taskRow)}</ul>` : html`<p class="muted">Keine Aufgaben</p>`}</section>
      <section class="card"><h2>Termine <button class="mini" data-event>+</button></h2>${evs.length ? html`<ul class="list">${evs.map(e => html`<li data-ev="${e.id}"><b class="when">${fmtDate(e.datum)}</b><div class="grow"><div class="ttl">${e.titel}</div><div class="sub">${e.art}${e.contactId ? html` · ${cLink(e.contactId)}` : ''}</div></div></li>`)}</ul>` : html`<p class="muted">Keine Termine</p>`}</section>
      <section class="card"><h2>Verlauf <button class="mini" data-act>+ Eintrag</button></h2>${timeline(acts, { showRefs: true })}</section>
    </div></div>`.s;
  bindTasks(el);
  el.querySelector('[data-edit]').onclick = () => propertyForm(p);
  const wc = el.querySelector('.webcard');
  wc.querySelector('[data-web=pub]')?.addEventListener('click', e => websiteVeroeffentlichen(e.currentTarget));
  wc.querySelector('[data-web=on]')?.addEventListener('click', async e => { await db.save('properties', { ...p, webOnline: true }); websiteVeroeffentlichen(e.currentTarget); });
  wc.querySelector('[data-web=off]')?.addEventListener('click', async e => { if (await confirmDlg('Objekt von der Website entfernen?')) { await db.save('properties', { ...db.get('properties', p.id), webOnline: false }); websiteVeroeffentlichen(e.currentTarget); } });
  wc.querySelector('[data-web=fotos]')?.addEventListener('change', async e => {
    const files = [...e.target.files]; if (!files.length) return;
    if (!W.hasToken()) { toast('Zuerst den GitHub-Zugang unter Einstellungen → Website hinterlegen', 'err'); return; }
    const lbl = wc.querySelector('.fotolbl'); try {
      const neu = await W.uploadPhotos(p, files, (i, n) => { lbl.firstChild.textContent = `Lade Foto ${i}/${n} …`; });
      const cur = db.get('properties', p.id); await db.save('properties', { ...cur, bilder: [...W.bilderListe(cur), ...neu].join('\n') });
      toast(`${neu.length} Foto(s) hochgeladen`);
    } catch (x) { toast('Upload fehlgeschlagen: ' + x.message, 'err'); lbl.firstChild.textContent = '+ Fotos hochladen'; }
  });
  el.querySelector('[data-expose]').onclick = () => exposee(p);
  el.querySelector('[data-task]').onclick = () => taskForm({ propertyId: id });
  el.querySelector('[data-event]').onclick = () => eventForm({ propertyId: id, titel: 'Besichtigung ' + p.titel });
  el.querySelector('[data-act]').onclick = () => activityForm({ propertyId: id });
  el.querySelector('[data-deal]').onclick = () => dealForm({ propertyId: id, board: 'vertrieb', stage: 'Anfrage', titel: p.titel, wert: p.preis });
  el.querySelectorAll('[data-deal-id]').forEach(li => li.onclick = e => { if (!e.target.closest('a')) dealForm(db.get('deals', li.dataset.dealId)); });
  el.querySelectorAll('[data-ev]').forEach(li => li.onclick = e => { if (!e.target.closest('a')) eventForm(db.get('events', li.dataset.ev)); });
}
