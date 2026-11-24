// Kalender: Liste (Standard, mit kleinem Monat daneben), Woche (Zeitraster; am Handy Tagesstreifen) und Monat – mit Schnelleingabe in normaler Sprache,
// Farben je Termin-Art, Überschneidungs-Warnung, Aufgaben des Tages und Google-Abgleich.
import * as db from '../db.js';
import { html, raw, iso, today, addDays, fmtDate, download, esc, toast, fullName } from '../util.js';
import { eventForm } from '../forms.js';
import { cLink, pLink, empty, adresse } from '../ui.js';
import { completeTask } from './tasks.js';
import * as google from '../google.js';

const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], WTL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const FARBE = { 'Besichtigung': '#c9a96e', 'Beratungsgespräch': '#5fa8d3', 'Notartermin': '#e06a5a', 'Übergabe': '#5bbf8a', 'Bewertungstermin': '#8a7bd8', 'Fotoshooting': '#e0a84a', 'Energieausweis / Gutachter': '#9aa36b', 'Sonstiges': '#7d7a74' };
const farbe = e => FARBE[e.art] || FARBE.Sonstiges;
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };

let ansicht = ls('kre-cal-view') || 'agenda', bezug = today(), nurGeschaeft = ls('kre-cal-biz') === '1';
const minuten = t => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const montag = d => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return iso(x); };
const tagName = d => { const t0 = today(); if (d === t0) return 'Heute'; if (d === addDays(t0, 1)) return 'Morgen'; if (d === addDays(t0, -1)) return 'Gestern'; return WTL[new Date(d + 'T12:00:00').getDay()]; };
const istGeschaeft = e => e.source !== 'google' || e.contactId || e.propertyId || e.art !== 'Sonstiges';

function termine() { return db.all('events').filter(e => e.datum && (!nurGeschaeft || istGeschaeft(e))); }
function amTag(d, evs) { return evs.filter(e => e.datum === d).sort((a, b) => (a.start || '').localeCompare(b.start || '')); }
function konflikte(list) {
  const k = new Set(), t = list.filter(e => e.start);
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
    const a = t[i], b = t[j], ae = minuten(a.ende || a.start) || minuten(a.start) + 60, be = minuten(b.ende || b.start) || minuten(b.start) + 60;
    if (minuten(a.start) < be && minuten(b.start) < Math.max(ae, minuten(a.start) + 1)) { k.add(a.id); k.add(b.id); }
  }
  return k;
}

// ---------- Schnelleingabe: „Mo 14 Uhr Besichtigung Leopoldstraße mit Max Anleger“ ----------
export function parseTermin(text, basis = today()) {
  let t = ' ' + String(text || '').trim() + ' ';
  const low = () => t.toLowerCase(), weg = re => { t = t.replace(typeof re === 'string' ? new RegExp(re.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : re, ' '); };
  let datum = '', start = '', ende = '', dauer = 60;
  const wt = { so: 0, sonntag: 0, mo: 1, montag: 1, di: 2, dienstag: 2, mi: 3, mittwoch: 3, do: 4, donnerstag: 4, fr: 5, freitag: 5, sa: 6, samstag: 6 };
  let m;
  if ((m = low().match(/\s(übermorgen|morgen|heute)\s/))) { datum = addDays(basis, { heute: 0, morgen: 1, übermorgen: 2 }[m[1]]); weg(new RegExp('\\s' + m[1] + '\\s', 'i')); }
  else if ((m = low().match(/\s(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?\s/))) { const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : basis.slice(0, 4); datum = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (!m[3] && datum < basis) datum = `${+y + 1}${datum.slice(4)}`; weg(/\s\d{1,2}\.\d{1,2}\.?(\d{2,4})?\s/); }
  else if ((m = low().match(/\s(nächste[nrs]?\s+|kommende[nrs]?\s+)?(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag|so|mo|di|mi|do|fr|sa)\.?\s/))) {
    const ziel = wt[m[2]], heute = new Date(basis + 'T12:00:00').getDay(); let diff = (ziel - heute + 7) % 7; if (diff === 0) diff = 7;
    datum = addDays(basis, diff); weg(new RegExp('\\s(nächste[nrs]?\\s+|kommende[nrs]?\\s+)?' + m[2] + '\\.?\\s', 'i'));
  }
  if ((m = low().match(/\s(?:von\s+)?(\d{1,2})(?::|\.)(\d{2})\s*(?:uhr)?\s*(?:-|–|bis)\s*(\d{1,2})(?::|\.)?(\d{2})?\s*(?:uhr)?\s/))) { start = hhmm(+m[1] * 60 + +m[2]); ende = hhmm(+m[3] * 60 + +(m[4] || 0)); weg(m[0]); }
  else if ((m = low().match(/\s(?:um\s+|ab\s+)?(\d{1,2})(?:(?::|\.)(\d{2}))?\s*uhr\s/)) || (m = low().match(/\s(?:um\s+|ab\s+)?(\d{1,2})[:.](\d{2})\s/)) || (m = low().match(/\sum\s+(\d{1,2})()\s/))) { start = hhmm(+m[1] * 60 + +(m[2] || 0)); weg(m[0]); }
  if ((m = low().match(/\s(\d+(?:[.,]\d)?)\s*(h|std|stunden?)\s/))) { dauer = Math.round(parseFloat(m[1].replace(',', '.')) * 60); weg(m[0]); }
  else if ((m = low().match(/\s(\d+)\s*(min|minuten)\s/))) { dauer = +m[1]; weg(m[0]); }
  if (start && !ende) ende = hhmm(minuten(start) + dauer);
  const arten = [['Besichtigung', /besichtig\w*/i], ['Notartermin', /notar\w*/i], ['Beratungsgespräch', /beratung\w*|erstgespräch|kennenlernen/i], ['Übergabe', /übergabe|abnahme/i], ['Fotoshooting', /foto\w*|shooting|drohne\w*/i], ['Bewertungstermin', /bewertung\w*/i], ['Energieausweis / Gutachter', /gutacht\w*|energieausweis/i]];
  const a = arten.find(([, re]) => re.test(t)); const art = a ? a[0] : 'Sonstiges';
  const kontakt = db.all('contacts').filter(c => c.nachname && c.nachname.length > 2).find(c => new RegExp(`\\b${c.nachname}\\b`, 'i').test(t) && (!c.vorname || new RegExp(`\\b${c.vorname}\\b`, 'i').test(t) || db.all('contacts').filter(o => o.nachname === c.nachname).length === 1));
  const objekt = db.all('properties').filter(p => p.status !== 'Archiv').find(p => { const str = (p.strasse || '').replace(/\s*\d+\w?$/, '').trim(); return str.length > 3 && low().includes(str.toLowerCase().replace(/straße$/, '')); });
  if (kontakt) { t = t.replace(new RegExp(`\\s(mit|bei|für)?\\s*(herrn?|frau)?\\s*${kontakt.vorname ? kontakt.vorname + '\\s+' : ''}${kontakt.nachname}\\b`, 'i'), ' '); t = t.replace(new RegExp(`\\s(mit|bei|für)?\\s*(herrn?|frau)?\\s*${kontakt.nachname}\\b`, 'i'), ' '); }
  let titel = t.replace(/\s(mit|bei|für|in der|in|am|im)\s*$/i, ' ').replace(/\s+(mit|bei)\s*$/i, '').replace(/\s{2,}/g, ' ').trim().replace(/^(mit|bei|am|um)\s+/i, '');
  if (!titel) titel = [art !== 'Sonstiges' ? art : 'Termin', objekt ? objekt.strasse : ''].filter(Boolean).join(' ');
  if (kontakt) titel += ' – ' + fullName(kontakt);
  return { titel, datum: datum || basis, start, ende, art, contactId: kontakt?.id || '', propertyId: objekt?.id || '', ort: objekt ? adresse(objekt) : '', erkannt: !!(datum || start) };
}

// ---------- Darstellung ----------
const MONK = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'], PX = 52;
const schmal = () => matchMedia('(max-width:700px)').matches;
const wtag = d => new Date(d + 'T12:00:00').getDay();
const uhr = () => new Date().toTimeString().slice(0, 5);
const istVorbei = e => e.datum < today() || (e.datum === today() && !!e.start && (e.ende || e.start) < uhr());
const naechsterTermin = evs => { const t0 = today(), u = uhr(); return evs.filter(e => e.datum > t0 || (e.datum === t0 && (e.start || '99') >= u)).sort((a, b) => (a.datum + (a.start || '')).localeCompare(b.datum + (b.start || '')))[0]; };
const langDatum = d => `${WTL[wtag(d)]}, ${+d.slice(8)}. ${MON[+d.slice(5, 7) - 1]}`;

function evKarte(e, konf, nx) {
  const c = e.contactId && db.get('contacts', e.contactId), tel = c && (c.mobil || c.tel), p = e.propertyId && db.get('properties', e.propertyId);
  const ort = e.ort || (p ? adresse(p) : '');
  return html`<li class="cev ${istVorbei(e) ? 'vorbei' : ''} ${e.id === nx ? 'next' : ''}" data-ev="${e.id}" style="--c:${farbe(e)}">
    <div class="zeit">${e.start ? html`<b>${e.start}</b>${e.ende && e.ende !== e.start ? html`<small>bis ${e.ende}</small>` : ''}` : html`<small>ganztägig</small>`}</div>
    <div class="grow"><div class="ttl">${e.titel}${e.id === nx ? html` <span class="kal-next">als Nächstes</span>` : ''}${konf.has(e.id) ? html` <span class="konf" title="Überschneidet sich mit einem anderen Termin">⚠ Überschneidung</span>` : ''}</div>
      <div class="sub"><span class="art">${e.art}</span>${c ? html` · ${cLink(c.id)}` : ''}${p ? html` · ${pLink(p.id)}` : ''}${ort && !p ? ' · ' + ort : ''}${e.source === 'google' ? ' · Google' : ''}</div></div>
    <span class="cact">${tel ? html`<a href="tel:${tel.replace(/[^0-9+]/g, '')}" title="Anrufen" aria-label="Anrufen">📞</a>` : ''}${ort ? html`<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ort)}" title="Route" aria-label="Route">🧭</a>` : ''}<button type="button" data-akt="event:${e.id}" title="Weitere Aktionen" aria-label="Weitere Aktionen">⋯</button></span></li>`;
}
function aufgabeZeile(t) { return html`<li class="ctask" data-task="${t.id}"><input type="checkbox" data-kdone="${t.id}" aria-label="Erledigt: ${t.titel.replace(/^⚡ /, '')}"><span class="grow">${t.titel.replace(/^⚡ /, '')}</span>${t.contactId ? cLink(t.contactId) : ''}</li>`; }
// Aufgaben eines Tages: eingeklappt, damit die Termine im Vordergrund bleiben
function aufgabenBlock(dt, offen) { return dt.length ? html`<details class="kal-aufg" ${offen ? raw('open') : ''}><summary>✓ ${dt.length} Aufgabe${dt.length > 1 ? 'n' : ''} fällig</summary><ul class="ctasks">${dt.map(aufgabeZeile)}</ul></details>` : ''; }
function legende(evs) { const arten = [...new Set(evs.map(e => FARBE[e.art] ? e.art : 'Sonstiges'))]; return arten.length > 1 ? html`<div class="legende">${Object.keys(FARBE).filter(k => arten.includes(k)).map(k => html`<span><i style="background:${FARBE[k]}"></i>${k}</span>`)}</div>` : ''; }
const offeneAufgaben = () => db.all('tasks').filter(t => !t.done && t.faellig);

// Kleiner Monat neben der Liste: zeigt, an welchen Tagen etwas ansteht, ein Klick springt dorthin
function miniMonat(evs) {
  const b = new Date(bezug + 'T12:00:00'), y = b.getFullYear(), m = b.getMonth(), off = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate(), t0 = today();
  const belegt = new Set(evs.map(e => e.datum));
  return html`<section class="card kal-mini"><div class="kal-minikopf"><button type="button" data-mm="-1" aria-label="Monat zurück">‹</button><b>${MON[m]} ${y}</b><button type="button" data-mm="1" aria-label="Monat weiter">›</button></div>
    <div class="kal-minigrid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => html`<span>${d}</span>`)}${Array.from({ length: off }, () => html`<i></i>`)}
    ${Array.from({ length: n }, (_, i) => { const d = iso(new Date(y, m, i + 1)); return html`<button type="button" data-geh="${d}" class="${d === t0 ? 'heute' : ''} ${d === bezug ? 'sel' : ''} ${belegt.has(d) ? 'hat' : ''}" aria-label="${fmtDate(d)}${belegt.has(d) ? ', mit Terminen' : ''}">${i + 1}</button>`; })}</div></section>`;
}

function tagBlock(d, de, dt, nx) {
  const t0 = today(), k = konflikte(de), w = wtag(d);
  return html`<section class="kal-tag ${d === t0 ? 'heute' : ''} ${w === 0 || w === 6 ? 'we' : ''}" data-tag="${d}">
    <div class="kal-datum"><span>${d === t0 ? 'Heute' : d === addDays(t0, 1) ? 'Morgen' : WT[w]}</span><b>${+d.slice(8)}</b><small>${d === t0 || d === addDays(t0, 1) ? WT[w] + ' · ' : ''}${MONK[+d.slice(5, 7) - 1]}</small></div>
    <div class="kal-inhalt">${de.length ? html`<ul class="cevs">${de.map(e => evKarte(e, k, nx))}</ul>` : html`<p class="kal-frei">Keine Termine</p>`}${aufgabenBlock(dt, false)}</div>
    <button type="button" class="kal-plus" data-neu="${d}" title="Termin an diesem Tag eintragen" aria-label="Termin am ${fmtDate(d)} eintragen">+</button></section>`;
}

function agenda(evs) {
  const t0 = today(), aufgaben = offeneAufgaben(), ueber = aufgaben.filter(t => t.faellig < t0), nx = naechsterTermin(evs)?.id, tage = [];
  for (let i = 0; i < 21; i++) { const d = addDays(bezug, i), de = amTag(d, evs), dt = aufgaben.filter(t => t.faellig === d); if (de.length || d === t0 || i === 0) tage.push({ d, de, dt }); }
  const frei = !tage.some(x => x.de.length); let kw = null;
  return html`<div class="kal-liste"><div class="kal-tage">
      ${tage.map(({ d, de, dt }) => { const mo = montag(d), neu = kw !== null && mo !== kw; kw = mo; return html`${neu ? html`<div class="kal-kw">KW ${kwVon(mo)} <span>${fmtDate(mo).slice(0, 6)} – ${fmtDate(addDays(mo, 6)).slice(0, 6)}</span></div>` : ''}${tagBlock(d, de, dt, nx)}`; })}
      ${frei ? empty('Keine Termine in den nächsten 3 Wochen', 'Oben einfach eintippen, z. B. „Fr 10 Uhr Beratung Herr Müller“') : ''}</div>
    <aside class="kal-seite">${miniMonat(evs)}
      ${ueber.length ? html`<details class="card kal-ueber" ${schmal() ? '' : raw('open')}><summary><h2>Überfällige Aufgaben <span>${ueber.length}</span></h2></summary><ul class="ctasks">${ueber.slice(0, 5).map(aufgabeZeile)}</ul>${ueber.length > 5 ? html`<a class="lnk small" href="#/aufgaben">Alle ${ueber.length} ansehen</a>` : ''}</details>` : ''}
      ${legende(tage.flatMap(x => x.de))}</aside></div>`;
}

// Ein einzelner Tag (Handy: unter dem Wochenstreifen bzw. unter dem Monat)
function tagDetail(d, evs) {
  const de = amTag(d, evs), dt = offeneAufgaben().filter(t => t.faellig === d);
  return html`<section class="card kal-tagdetail" data-tag="${d}"><div class="kal-tagkopf"><b>${d === today() ? 'Heute · ' : ''}${langDatum(d)}</b><button type="button" class="mini" data-neu="${d}">+ Termin</button></div>
    ${de.length ? html`<ul class="cevs">${de.map(e => evKarte(e, konflikte(de), naechsterTermin(evs)?.id))}</ul>` : html`<p class="kal-frei">Keine Termine an diesem Tag</p>`}${aufgabenBlock(dt, false)}</section>`;
}
function wocheSchmal(evs) {
  const mo = montag(bezug), t0 = today();
  return html`<div class="kal-strip">${Array.from({ length: 7 }, (_, i) => { const d = addDays(mo, i), n = amTag(d, evs).length; return html`<button type="button" data-geh="${d}" class="${d === bezug ? 'on' : ''} ${d === t0 ? 'heute' : ''}" aria-label="${langDatum(d)}, ${n} Termin${n === 1 ? '' : 'e'}"><span>${WT[wtag(d)]}</span><b>${+d.slice(8)}</b><i class="${n ? 'hat' : ''}"></i></button>`; })}</div>${tagDetail(bezug, evs)}`;
}

function woche(evs) {
  if (schmal()) return wocheSchmal(evs);
  const mo = montag(bezug), tage = Array.from({ length: 7 }, (_, i) => addDays(mo, i)), t0 = today();
  const alle = tage.flatMap(d => amTag(d, evs)), von = Math.min(8 * 60, ...alle.filter(e => e.start).map(e => minuten(e.start))), bis = Math.max(19 * 60, ...alle.filter(e => e.ende || e.start).map(e => minuten(e.ende || e.start) + 30));
  const h0 = Math.floor(von / 60), h1 = Math.ceil(bis / 60), jetzt = new Date(), jm = jetzt.getHours() * 60 + jetzt.getMinutes(), ganztags = alle.some(e => !e.start);
  return html`<section class="card wochecard"><div class="woche ${ganztags ? '' : 'ohneganz'}" data-h0="${h0}" style="--h:${(h1 - h0) * PX}px">
    <div class="wzeit"><div class="wkopf"></div><div class="wganz"></div>${Array.from({ length: h1 - h0 }, (_, i) => html`<div class="wstd" style="height:${PX}px">${String(h0 + i).padStart(2, '0')}:00</div>`)}</div>
    ${tage.map(d => { const de = amTag(d, evs), k = konflikte(de), ganz = de.filter(e => !e.start), mit = de.filter(e => e.start), w = wtag(d);
      // Überlappende Termine nebeneinander setzen
      let spalten = [], gruppe = [], gEnde = 0; const zu = () => { gruppe.forEach(e => e._n = spalten.length); spalten = []; gruppe = []; };
      mit.forEach(e => { const s = minuten(e.start), en = Math.max(minuten(e.ende || e.start), s + 30); if (gruppe.length && s >= gEnde) zu(); let i = spalten.findIndex(end => end <= s); if (i < 0) { i = spalten.length; spalten.push(0); } spalten[i] = en; e._sp = i; gruppe.push(e); gEnde = Math.max(gEnde, en); }); zu();
      return html`<div class="wtag ${d === t0 ? 'heute' : ''} ${w === 0 || w === 6 ? 'we' : ''}" data-tag="${d}"><div class="wkopf"><span>${WT[w]}</span><b>${+d.slice(8)}</b></div>
        <div class="wganz">${ganz.map(e => html`<div class="wev ganz" data-ev="${e.id}" style="--c:${farbe(e)}" title="${e.titel}">${e.titel}</div>`)}</div>
        <div class="wraster" data-d="${d}" style="height:${(h1 - h0) * PX}px">${Array.from({ length: h1 - h0 }, () => html`<div class="wlinie" style="height:${PX}px"></div>`)}
        ${mit.map(e => { const s = minuten(e.start), en = Math.max(minuten(e.ende || e.start), s + 30), br = 100 / Math.max(1, e._n || 1);
          return html`<div class="wev ${k.has(e.id) ? 'konfl' : ''} ${en - s < 45 ? 'kurz' : ''} ${istVorbei(e) ? 'vorbei' : ''}" data-ev="${e.id}" title="${e.start}${e.ende ? '–' + e.ende : ''} ${e.titel}" style="--c:${farbe(e)};--z:${en - s < 60 ? 1 : en - s < 90 ? 2 : 3};top:${(s - h0 * 60) / 60 * PX}px;height:${Math.max(22, (en - s) / 60 * PX - 2)}px;left:${e._sp * br}%;width:calc(${br}% - 3px)"><b>${e.start}</b><span>${e.titel}</span></div>`; })}
        ${d === t0 && jm >= h0 * 60 && jm <= h1 * 60 ? html`<div class="wjetzt" style="top:${(jm - h0 * 60) / 60 * PX}px"></div>` : ''}</div></div>`; })}
  </div></section>${legende(alle)}`;
}

function monat(evs) {
  const b = new Date(bezug + 'T12:00:00'), y = b.getFullYear(), m = b.getMonth(), off = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate(), t0 = today();
  const zellen = Array.from({ length: Math.ceil((off + n) / 7) * 7 }, (_, i) => iso(new Date(y, m, i - off + 1))), im = d => +d.slice(5, 7) - 1 === m;
  return html`<section class="card kal-monat"><div class="kal-mgrid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => html`<div class="kal-dow">${d}</div>`)}
    ${zellen.map(d => { const de = amTag(d, evs), w = wtag(d), zeigen = de.length > 3 ? 2 : 3;
      return html`<div class="kal-zelle ${d === t0 ? 'heute' : ''} ${d < t0 ? 'vorbei' : ''} ${im(d) ? '' : 'fremd'} ${w === 0 || w === 6 ? 'we' : ''} ${d === bezug ? 'sel' : ''}" data-geh="${d}" role="button" tabindex="0" aria-label="${langDatum(d)}, ${de.length} Termin${de.length === 1 ? '' : 'e'}"><span class="kal-nr">${+d.slice(8)}</span>
        ${de.slice(0, zeigen).map(e => html`<div class="kal-mev" data-ev="${e.id}" style="--c:${farbe(e)}" title="${e.start ? e.start + ' ' : ''}${e.titel}">${e.start ? html`<b>${e.start}</b> ` : ''}${e.titel}</div>`)}${de.length > zeigen ? html`<div class="kal-mehrev">+ ${de.length - zeigen} weitere</div>` : ''}
        <div class="kal-punkte">${de.slice(0, 4).map(e => html`<i style="background:${farbe(e)}"></i>`)}</div></div>`; })}</div></section>
    ${schmal() ? tagDetail(bezug, evs) : legende(zellen.filter(im).flatMap(d => amTag(d, evs)))}`;
}

function titelZeile() {
  if (ansicht === 'monat') { const b = new Date(bezug + 'T12:00:00'); return `${MON[b.getMonth()]} ${b.getFullYear()}`; }
  if (ansicht === 'woche') { const mo = montag(bezug), so = addDays(mo, 6); const tm = d => `${+d.slice(8)}.${+d.slice(5, 7)}.`; return `KW ${kwVon(mo)} · ${mo.slice(5, 7) === so.slice(5, 7) ? +mo.slice(8) + '.' : tm(mo)}–${tm(so)}${so.slice(0, 4) === today().slice(0, 4) ? '' : ' ' + so.slice(0, 4)}`; }
  return bezug === today() ? 'Die nächsten 3 Wochen' : `Ab ${langDatum(bezug)}`;
}
function kwVon(d) { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + 3 - (x.getDay() + 6) % 7); const w1 = new Date(x.getFullYear(), 0, 4); return 1 + Math.round(((x - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7); }

function ics() {
  const z = d => d.replace(/-/g, ''), t = s => (s || '00:00').replace(':', '') + '00';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Keuerleber CRM//DE'];
  db.all('events').forEach(e => L.push('BEGIN:VEVENT', 'UID:' + e.id + '@kre-crm', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]|\.\d+/g, ''), `DTSTART:${z(e.datum)}T${t(e.start)}`, `DTEND:${z(e.datum)}T${t(e.ende || e.start)}`, 'SUMMARY:' + (e.titel || '').replace(/[,;\n]/g, ' '), 'LOCATION:' + (e.ort || '').replace(/[,;\n]/g, ' '), 'DESCRIPTION:' + (e.notiz || '').replace(/\n/g, '\\n'), 'END:VEVENT'));
  L.push('END:VCALENDAR'); download('termine.ics', L.join('\r\n'), 'text/calendar');
}

export function render(el) {
  const evs = termine(), t0 = today(), g = google.clientId(), gOn = google.isConnected(), gl = ls('kre-g-last');
  const woHeute = amTag(t0, evs), naechster = naechsterTermin(evs);
  el.innerHTML = html`<div class="head kal-head"><h1>Kalender</h1><p class="muted kal-status">${woHeute.length ? `Heute ${woHeute.length} Termin${woHeute.length > 1 ? 'e' : ''}` : 'Heute frei'}${naechster ? ` · nächster: ${tagName(naechster.datum)}${naechster.start ? ' ' + naechster.start : ''} – ${naechster.titel}` : ''}</p>
      <div class="actions kal-akt"><details class="pe-mehr kal-mehr"><summary class="btn ghost">Mehr ▾</summary><div class="pe-mehr-m">
          <label class="kal-chk"><input type="checkbox" data-biz ${nurGeschaeft ? raw('checked') : ''}><span>Nur Geschäftliches zeigen</span></label>
          ${g ? html`<button type="button" data-gsync title="${gl ? 'Zuletzt abgeglichen: ' + new Date(gl).toLocaleString('de-DE') : ''}">${gOn ? '↻ Mit Google-Kalender abgleichen' : '🔗 Google-Kalender verbinden'}</button>` : html`<a href="#/automation">🔗 Google-Kalender verbinden</a>`}
          <button type="button" data-ics>⇩ Termine exportieren (.ics)</button></div></details>
        <button class="btn primary" data-new>+ Termin</button></div></div>
    <form class="schnell kal-schnell" data-schnell><input name="q" autocomplete="off" aria-label="Termin schnell eintragen" placeholder="Schnell eintragen: „Mo 14 Uhr Besichtigung Leopoldstraße mit Max Anleger“"><button class="btn" aria-label="Eintragen"><span>Eintragen</span></button><div class="schnellvor muted small" data-vor></div></form>
    <div class="kal-bar"><div class="kal-nav"><button class="btn" data-p aria-label="zurück">‹</button><button class="btn" data-t ${bezug === t0 ? raw('disabled') : ''}>Heute</button><button class="btn" data-n aria-label="weiter">›</button><b>${titelZeile()}</b></div>
      <div class="kal-seg" role="tablist" aria-label="Ansicht">${[['agenda', 'Liste'], ['woche', 'Woche'], ['monat', 'Monat']].map(([k, l]) => html`<button type="button" role="tab" aria-selected="${k === ansicht}" class="${k === ansicht ? 'on' : ''}" data-view="${k}">${l}</button>`)}</div></div>
    <div class="calbody kal-${ansicht}">${ansicht === 'woche' ? woche(evs) : ansicht === 'monat' ? monat(evs) : agenda(evs)}</div>`.s;

  const monatsErster = n => { const b = new Date(bezug + 'T12:00:00'), d = iso(new Date(b.getFullYear(), b.getMonth() + n, 1)); return d.slice(0, 7) === t0.slice(0, 7) ? t0 : d; };
  el.querySelector('[data-p]').onclick = () => { bezug = ansicht === 'monat' ? monatsErster(-1) : addDays(bezug, -7); render(el); };
  el.querySelector('[data-n]').onclick = () => { bezug = ansicht === 'monat' ? monatsErster(1) : addDays(bezug, 7); render(el); };
  el.querySelector('[data-t]').onclick = () => { bezug = today(); render(el); };
  el.querySelectorAll('[data-mm]').forEach(b => b.onclick = () => { bezug = monatsErster(+b.dataset.mm); render(el); });
  el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { ansicht = b.dataset.view; ls('kre-cal-view', ansicht); render(el); });
  el.querySelector('[data-biz]').onchange = e => { nurGeschaeft = e.target.checked; ls('kre-cal-biz', nurGeschaeft ? '1' : '0'); render(el); };
  el.querySelector('[data-new]').onclick = () => eventForm({ datum: bezug > t0 ? bezug : t0 });
  el.querySelector('[data-ics]').onclick = ics;
  el.querySelector('[data-gsync]')?.addEventListener('click', async e => { const b = e.currentTarget; b.disabled = true; b.textContent = '↻ …'; try { const r = await google.syncCalendar(); ls('kre-g-last', new Date().toISOString()); toast(`Google: ${r.pushed} gesendet, ${r.pulled} neu, ${r.updated} aktualisiert`); } catch (x) { toast(x.message, 'err'); } render(el); });

  // Schnelleingabe mit Live-Vorschau
  const f = el.querySelector('[data-schnell]'), vor = el.querySelector('[data-vor]');
  f.q.oninput = () => { const v = f.q.value.trim(); if (!v) { vor.textContent = ''; return; } const r = parseTermin(v); vor.innerHTML = html`→ <b>${r.titel}</b> · ${tagName(r.datum)} ${fmtDate(r.datum)}${r.start ? ' · ' + r.start + '–' + r.ende : ' · ganztägig'} · ${r.art}${r.contactId ? ' · ' + fullName(db.get('contacts', r.contactId)) : ''}${r.propertyId ? ' · ' + db.get('properties', r.propertyId).titel : ''}`.s; };
  f.onsubmit = async e => { e.preventDefault(); const v = f.q.value.trim(); if (!v) return; const r = parseTermin(v); const { erkannt, ...rec } = r;
    const neu = await db.save('events', rec); if (rec.contactId) await db.log(rec.art === 'Besichtigung' ? 'besichtigung' : 'meeting', `${rec.art} geplant am ${fmtDate(rec.datum)}${rec.start ? ' ' + rec.start : ''}`, { contactId: rec.contactId, propertyId: rec.propertyId });
    toast(`Termin eingetragen: ${tagName(rec.datum)}${rec.start ? ' ' + rec.start : ''}`); bezug = ansicht === 'monat' ? bezug : (rec.datum < bezug ? rec.datum : bezug); if (google.isConnected()) google.syncCalendar().catch(() => { }); render(el); return neu; };

  el.querySelectorAll('[data-ev]').forEach(x => x.onclick = e => { e.stopPropagation(); if (e.target.closest('a,[data-akt]')) return; eventForm(db.get('events', x.dataset.ev)); });
  el.querySelectorAll('[data-neu]').forEach(b => b.onclick = e => { e.stopPropagation(); eventForm({ datum: b.dataset.neu }); });
  // Tag antippen: am Handy bleibt die Ansicht (Tag steht darunter), am Rechner springt der Monat in die Liste ab diesem Tag
  const geh = x => { bezug = x.dataset.geh; if (ansicht === 'monat' && !schmal()) { ansicht = 'agenda'; ls('kre-cal-view', ansicht); } render(el); };
  el.querySelectorAll('[data-geh]').forEach(x => { x.onclick = e => { if (e.target.closest('[data-ev]')) return; geh(x); }; if (x.tagName !== 'BUTTON') x.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); geh(x); } }; });
  el.querySelectorAll('.wraster').forEach(r => r.onclick = e => { if (e.target.closest('[data-ev]')) return; const h0 = +r.closest('.woche').dataset.h0 || 8, y = e.offsetY + (e.target === r ? 0 : e.target.offsetTop); const min = Math.round((h0 * 60 + y / PX * 60) / 30) * 30; eventForm({ datum: r.dataset.d, start: hhmm(min), ende: hhmm(min + 60) }); });
  el.querySelectorAll('[data-kdone]').forEach(c => c.onchange = async () => { await completeTask(db.get('tasks', c.dataset.kdone), true, true); toast('Erledigt'); });
}
