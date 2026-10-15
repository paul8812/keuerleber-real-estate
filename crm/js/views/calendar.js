// Kalender: Agenda (Standard), Woche (Zeitraster) und Monat – mit Schnelleingabe in normaler Sprache,
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
function evKarte(e, konf) {
  const c = e.contactId && db.get('contacts', e.contactId), tel = c && (c.mobil || c.tel), p = e.propertyId && db.get('properties', e.propertyId);
  const ort = e.ort || (p ? adresse(p) : '');
  return html`<li class="cev ${e.datum < today() ? 'vorbei' : ''}" data-ev="${e.id}" style="--c:${farbe(e)}">
    <div class="zeit">${e.start ? html`<b>${e.start}</b><small>${e.ende && e.ende !== e.start ? e.ende : ''}</small>` : html`<small>ganztägig</small>`}</div>
    <div class="grow"><div class="ttl">${e.titel}${konf.has(e.id) ? html` <span class="konf" title="Überschneidet sich mit einem anderen Termin">⚠ Überschneidung</span>` : ''}</div>
      <div class="sub"><span class="art">${e.art}</span>${c ? html` · ${cLink(c.id)}` : ''}${p ? html` · ${pLink(p.id)}` : ''}${ort && !p ? ' · ' + ort : ''}${e.source === 'google' ? ' · Google' : ''}</div></div>
    <span class="cact">${tel ? html`<a href="tel:${tel.replace(/[^0-9+]/g, '')}" title="Anrufen">📞</a>` : ''}${ort ? html`<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ort)}" title="Route">🧭</a>` : ''}</span></li>`;
}
function aufgabeZeile(t) { return html`<li class="ctask" data-task="${t.id}"><input type="checkbox" data-done="${t.id}"><span class="grow">${t.titel.replace(/^⚡ /, '')}</span>${t.contactId ? cLink(t.contactId) : ''}</li>`; }

function agenda(evs) {
  const t0 = today(), tage = [], aufgaben = db.all('tasks').filter(t => !t.done && t.faellig);
  const ueber = aufgaben.filter(t => t.faellig < t0);
  for (let i = 0; i < 21; i++) {
    const d = addDays(bezug, i), de = amTag(d, evs), dt = d === t0 ? aufgaben.filter(t => t.faellig === d) : aufgaben.filter(t => t.faellig === d);
    if (!de.length && !dt.length && d !== t0) continue;
    tage.push({ d, de, dt });
  }
  const frei = tage.length <= 1 && !tage[0]?.de.length;
  return html`${ueber.length && bezug <= t0 ? html`<section class="card ctag warnbox"><h2>Überfällige Aufgaben <span>${ueber.length}</span></h2><ul class="ctasks">${ueber.slice(0, 6).map(aufgabeZeile)}</ul>${ueber.length > 6 ? html`<a class="lnk small" href="#/aufgaben">alle ansehen</a>` : ''}</section>` : ''}
    ${tage.map(({ d, de, dt }) => { const k = konflikte(de); return html`<section class="card ctag ${d === t0 ? 'heute' : ''}" data-tag="${d}"><div class="ctagkopf"><b>${tagName(d)}</b><span>${fmtDate(d)}</span><button class="mini" data-neu="${d}" title="Termin an diesem Tag">+</button></div>
      ${de.length ? html`<ul class="cevs">${de.map(e => evKarte(e, k))}</ul>` : html`<p class="muted small">${d === t0 ? 'Heute keine Termine.' : ''}</p>`}
      ${dt.length ? html`<ul class="ctasks">${dt.map(aufgabeZeile)}</ul>` : ''}</section>`; })}
    ${frei ? empty('Keine Termine in den nächsten 3 Wochen', 'Oben einfach eintippen, z. B. „Fr 10 Uhr Beratung Herr Müller“') : ''}`;
}

function woche(evs) {
  const mo = montag(bezug), tage = Array.from({ length: 7 }, (_, i) => addDays(mo, i)), t0 = today();
  const alle = tage.flatMap(d => amTag(d, evs)), von = Math.min(8 * 60, ...alle.filter(e => e.start).map(e => minuten(e.start))), bis = Math.max(20 * 60, ...alle.filter(e => e.ende || e.start).map(e => minuten(e.ende || e.start) + 30));
  const h0 = Math.floor(von / 60), h1 = Math.ceil(bis / 60), PX = 46, jetzt = new Date(), jm = jetzt.getHours() * 60 + jetzt.getMinutes();
  return html`<section class="card wochecard"><div class="woche" style="--h:${(h1 - h0) * PX}px">
    <div class="wzeit"><div class="wkopf"></div><div class="wganz"></div>${Array.from({ length: h1 - h0 }, (_, i) => html`<div class="wstd" style="height:${PX}px">${String(h0 + i).padStart(2, '0')}</div>`)}</div>
    ${tage.map(d => { const de = amTag(d, evs), k = konflikte(de), ganz = de.filter(e => !e.start), mit = de.filter(e => e.start);
      // Überlappende Termine nebeneinander setzen
      const spalten = []; mit.forEach(e => { const s = minuten(e.start); let i = spalten.findIndex(end => end <= s); if (i < 0) { i = spalten.length; spalten.push(0); } spalten[i] = Math.max(minuten(e.ende || e.start), s + 30); e._sp = i; });
      return html`<div class="wtag ${d === t0 ? 'heute' : ''}" data-tag="${d}"><div class="wkopf"><span>${WT[new Date(d + 'T12:00:00').getDay()]}</span><b>${+d.slice(8)}</b></div>
        <div class="wganz">${ganz.map(e => html`<div class="wev ganz" data-ev="${e.id}" style="--c:${farbe(e)}">${e.titel}</div>`)}</div>
        <div class="wraster" data-d="${d}" style="height:${(h1 - h0) * PX}px">${Array.from({ length: h1 - h0 }, () => html`<div class="wlinie" style="height:${PX}px"></div>`)}
        ${mit.map(e => { const s = minuten(e.start), en = Math.max(minuten(e.ende || e.start), s + 30), w = 100 / Math.max(1, spalten.length);
          return html`<div class="wev ${k.has(e.id) ? 'konfl' : ''}" data-ev="${e.id}" style="--c:${farbe(e)};top:${(s - h0 * 60) / 60 * PX}px;height:${Math.max(20, (en - s) / 60 * PX - 2)}px;left:${e._sp * w}%;width:calc(${w}% - 2px)"><b>${e.start}</b> ${e.titel}</div>`; })}
        ${d === t0 && jm >= h0 * 60 && jm <= h1 * 60 ? html`<div class="wjetzt" style="top:${(jm - h0 * 60) / 60 * PX}px"></div>` : ''}</div></div>`; })}
  </div></section>`;
}

function monat(evs) {
  const b = new Date(bezug + 'T12:00:00'), y = b.getFullYear(), m = b.getMonth(), off = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate(), t0 = today();
  const zellen = []; for (let i = 0; i < off; i++) zellen.push(null); for (let d = 1; d <= n; d++) zellen.push(iso(new Date(y, m, d)));
  const offen = db.all('tasks').filter(t => !t.done && t.faellig);
  return html`<section class="card"><div class="cal">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => html`<div class="dow">${d}</div>`)}
    ${zellen.map(d => { if (!d) return html`<div class="day blank"></div>`; const de = amTag(d, evs), nt = offen.filter(t => t.faellig === d).length;
      return html`<div class="day ${d === t0 ? 'today' : ''} ${d < t0 ? 'vorbei' : ''}" data-tag="${d}"><span class="dn">${+d.slice(8)}</span>${de.slice(0, 3).map(e => html`<div class="ev" data-ev="${e.id}" style="--c:${farbe(e)}">${e.start ? e.start + ' ' : ''}${e.titel}</div>`)}${de.length > 3 ? html`<div class="more">+${de.length - 3} weitere</div>` : ''}${nt ? html`<div class="tk">✓ ${nt}</div>` : ''}<div class="dots">${de.slice(0, 5).map(e => html`<i style="background:${farbe(e)}"></i>`)}</div></div>`; })}</div></section>`;
}

function titelZeile() {
  if (ansicht === 'monat') { const b = new Date(bezug + 'T12:00:00'); return `${MON[b.getMonth()]} ${b.getFullYear()}`; }
  if (ansicht === 'woche') { const mo = montag(bezug), so = addDays(mo, 6), kw = kwVon(mo); return `KW ${kw} · ${fmtDate(mo).slice(0, 6)} – ${fmtDate(so)}`; }
  return bezug === today() ? 'Ab heute' : `Ab ${fmtDate(bezug)}`;
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
  const woHeute = amTag(t0, evs), naechster = evs.filter(e => (e.datum > t0 || (e.datum === t0 && (e.start || '99') >= new Date().toTimeString().slice(0, 5)))).sort((a, b) => (a.datum + (a.start || '')).localeCompare(b.datum + (b.start || '')))[0];
  el.innerHTML = html`<div class="head"><div><h1>Kalender</h1><p class="muted">${woHeute.length ? `Heute ${woHeute.length} Termin${woHeute.length > 1 ? 'e' : ''}` : 'Heute frei'}${naechster ? ` · nächster: ${tagName(naechster.datum)}${naechster.start ? ' ' + naechster.start : ''} – ${naechster.titel}` : ''}</p></div>
      <div class="actions"><button class="btn" data-ics title="Alle Termine als .ics-Datei">Export</button><button class="btn primary" data-new>+ Termin</button></div></div>
    <form class="schnell" data-schnell><input name="q" autocomplete="off" placeholder="Schnell eintragen: „Mo 14 Uhr Besichtigung Leopoldstraße mit Max Anleger“"><button class="btn primary">Eintragen</button><div class="schnellvor muted small" data-vor></div></form>
    <div class="calbar"><div class="chips">${[['agenda', 'Agenda'], ['woche', 'Woche'], ['monat', 'Monat']].map(([k, l]) => html`<button class="chip ${k === ansicht ? 'on' : ''}" data-view="${k}">${l}</button>`)}</div>
      <div class="calnav"><button class="btn" data-p aria-label="zurück">‹</button><b>${titelZeile()}</b><button class="btn" data-n aria-label="weiter">›</button><button class="btn ghost" data-t>Heute</button></div>
      <label class="chk small"><input type="checkbox" data-biz ${nurGeschaeft ? raw('checked') : ''}> nur Geschäftliches</label>
      ${g ? html`<button class="btn ghost small" data-gsync title="${gl ? 'Zuletzt abgeglichen: ' + new Date(gl).toLocaleString('de-DE') : ''}">${gOn ? '↻ Google' : '🔗 Google verbinden'}</button>` : html`<a class="lnk small" href="#/automation">Google verbinden</a>`}</div>
    <div class="legende">${Object.entries(FARBE).slice(0, 6).map(([k, c]) => html`<span><i style="background:${c}"></i>${k}</span>`)}</div>
    <div class="calbody">${ansicht === 'woche' ? woche(evs) : ansicht === 'monat' ? monat(evs) : agenda(evs)}</div>`.s;

  const schritt = { agenda: 7, woche: 7 }[ansicht];
  el.querySelector('[data-p]').onclick = () => { bezug = ansicht === 'monat' ? iso(new Date(new Date(bezug + 'T12:00:00').getFullYear(), new Date(bezug + 'T12:00:00').getMonth() - 1, 1)) : addDays(bezug, -schritt); render(el); };
  el.querySelector('[data-n]').onclick = () => { bezug = ansicht === 'monat' ? iso(new Date(new Date(bezug + 'T12:00:00').getFullYear(), new Date(bezug + 'T12:00:00').getMonth() + 1, 1)) : addDays(bezug, schritt); render(el); };
  el.querySelector('[data-t]').onclick = () => { bezug = today(); render(el); };
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
    toast(`Termin eingetragen: ${tagName(rec.datum)}${rec.start ? ' ' + rec.start : ''}`); bezug = ansicht === 'monat' ? bezug : (rec.datum < bezug ? rec.datum : bezug); if (google.isConnected()) google.syncCalendar().catch(() => { }); return neu; };

  el.querySelectorAll('[data-ev]').forEach(x => x.onclick = e => { e.stopPropagation(); if (e.target.closest('a')) return; eventForm(db.get('events', x.dataset.ev)); });
  el.querySelectorAll('[data-neu]').forEach(b => b.onclick = e => { e.stopPropagation(); eventForm({ datum: b.dataset.neu }); });
  el.querySelectorAll('.day[data-tag]').forEach(x => x.onclick = e => { if (e.target.closest('[data-ev]')) return; bezug = x.dataset.tag; ansicht = 'agenda'; ls('kre-cal-view', ansicht); render(el); });
  el.querySelectorAll('.wraster').forEach(r => r.onclick = e => { if (e.target.closest('[data-ev]')) return; const h0 = +r.closest('.woche').querySelector('.wstd')?.textContent || 8, y = e.offsetY + (e.target === r ? 0 : e.target.offsetTop); const min = Math.round((h0 * 60 + y / 46 * 60) / 30) * 30; eventForm({ datum: r.dataset.d, start: hhmm(min), ende: hhmm(min + 60) }); });
  el.querySelectorAll('[data-done]').forEach(c => c.onchange = async () => { await completeTask(db.get('tasks', c.dataset.done), true); toast('Erledigt'); });
}
