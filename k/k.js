// Kundenseite von Keuerleber Immobilien: Unterlagen zu einem Objekt, Besichtigungstermin buchen, Selbstauskunft ausfüllen.
// Der Teil hinter dem # ist der persönliche Link (wird nicht an den Webserver übertragen).
import { ABSCHNITTE, ERKLAERUNG, DATENSCHUTZ, sichtbar, fehlend, pdf, pdfName } from '/crm/js/selbstauskunft.js';

const API = 'https://silkguwwkfwoqdfisfky.supabase.co/functions/v1/kunde';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbGtndXd3a2Z3b3FkZmlzZmt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODQyNDQsImV4cCI6MjEwNzA2MDI0NH0.zetUJKtz6w4za2-M1yaEYPenE84ML0sPUXFS3DLaABA';
const [token = '', gast = ''] = decodeURIComponent(location.hash.slice(1)).split('.');
const vorschau = new URLSearchParams(location.search).has('v');
const seite = document.getElementById('seite'), fuss = document.getElementById('fuss');

/** h('div.klasse', {attr}, kind, …) – baut Elemente ohne innerHTML (Texte bleiben Texte) */
function h(sel, attr, ...kinder) {
  const [tag, ...kl] = sel.split('.'), e = document.createElement(tag || 'div');
  if (kl.length) e.className = kl.join(' ');
  if (attr && (typeof attr !== 'object' || attr instanceof Node || Array.isArray(attr))) { kinder.unshift(attr); attr = null; }
  for (const [k, v] of Object.entries(attr || {})) { if (v == null || v === false) continue; if (k.startsWith('on')) e[k] = v; else if (k in e && k !== 'list' && k !== 'form') e[k] = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const k of kinder.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}
async function api(a, mehr = {}) {
  let r;
  try { r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY, apikey: KEY }, body: JSON.stringify({ t: token, g: gast || undefined, a, v: vorschau || undefined, ...mehr }) }); }
  catch { throw Object.assign(new Error('Keine Verbindung – bitte Internet prüfen und noch einmal versuchen.'), { netz: true }); }
  const j = await r.json().catch(() => ({ ok: false, fehler: 'Das hat gerade nicht geklappt.' }));
  if (!j.ok) throw Object.assign(new Error(j.fehler || 'Das hat gerade nicht geklappt.'), { status: r.status, daten: j });
  return j;
}
const WT = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const tagText = d => WT.format(new Date(d + 'T12:00:00'));
const groesse = b => !b ? '' : b > 1048576 ? (b / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const setze = (...k) => { seite.replaceChildren(...k.flat().filter(Boolean)); window.scrollTo(0, 0); };
const meldung = t => h('p.meldung', { role: 'alert' }, t);

function fussZeile(a = {}) {
  fuss.replaceChildren(
    h('div', {}, [a.firma || 'Keuerleber Immobilien', a.name].filter(Boolean).join(' · ')),
    h('div', {}, a.tel ? h('a', { href: 'tel:' + String(a.tel).replace(/[^\d+]/g, '') }, a.tel) : null, a.tel && a.email ? ' · ' : null, a.email ? h('a', { href: 'mailto:' + a.email }, a.email) : null),
    h('div', {}, h('a', { href: '/#impressum' }, 'Impressum'), ' · ', h('a', { href: '/#datenschutz' }, 'Datenschutz')));
}
function kopf(D, ueber) {
  const vor = String(D.name || '').trim();
  return [h('p.ueber', {}, ueber), h('h1', {}, D.titel || 'Ihre Unterlagen'), D.adresse ? h('p.muted', {}, D.adresse) : null,
    D.bild && /^data:image\//.test(D.bild) ? h('img.bild', { src: D.bild, alt: '' }) : null,
    vor ? h('p', { style: null }, `Guten Tag ${vor},`) : null];
}

// ---------------------------------------------------------------- Alles auf einmal: ZIP im Browser bauen (unkomprimiert – PDFs und Fotos sind es schon)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(dateien) {   // [{ name, bytes: Uint8Array }]
  const enc = new TextEncoder(), teile = [], verz = []; let pos = 0;
  const kopf = (sig, n, crc, len, extra) => { const b = new DataView(new ArrayBuffer(extra)); b.setUint32(0, sig, true); return b; };
  for (const d of dateien) {
    const n = enc.encode(d.name), crc = crc32(d.bytes), len = d.bytes.length;
    const l = new DataView(new ArrayBuffer(30)); l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint32(14, crc, true); l.setUint32(18, len, true); l.setUint32(22, len, true); l.setUint16(26, n.length, true);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, len, true); c.setUint32(24, len, true); c.setUint16(28, n.length, true); c.setUint32(42, pos, true);
    teile.push(l.buffer, n, d.bytes); verz.push(c.buffer, n); pos += 30 + n.length + len;
  }
  const vl = verz.reduce((s, x) => s + (x.byteLength ?? x.length), 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, dateien.length, true); e.setUint16(10, dateien.length, true); e.setUint32(12, vl, true); e.setUint32(16, pos, true);
  void kopf; return new Blob([...teile, ...verz, e.buffer], { type: 'application/zip' });
}
async function allesLaden(D, knopf) {
  const U = D.unterlagen || [], alt = knopf.textContent; knopf.disabled = true; knopf.parentNode.querySelectorAll('.meldung').forEach(x => x.remove());
  try {
    const dateien = [], namen = new Set();
    for (let i = 0; i < U.length; i++) {
      knopf.textContent = `Lädt ${i + 1} von ${U.length} …`;
      const r = await api('datei', { id: U[i].id }), antw = await fetch(r.url); if (!antw.ok) throw new Error(`„${U[i].name}“ konnte nicht geladen werden.`);
      let name = String(U[i].name || 'Datei').replace(/[\\/:*?"<>|]/g, ' ').trim() || 'Datei'; for (let k = 2; namen.has(name.toLowerCase()); k++) name = name.replace(/(\.[a-z0-9]+)?$/i, ` (${k})$1`);
      namen.add(name.toLowerCase()); dateien.push({ name, bytes: new Uint8Array(await antw.arrayBuffer()) });
    }
    knopf.textContent = 'Wird zusammengestellt …';
    const a = h('a', { href: URL.createObjectURL(zip(dateien)), download: `Unterlagen ${String(D.titel || 'Objekt').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60)}.zip` }); document.body.append(a); a.click(); a.remove();
  } catch (e) { knopf.after(meldung(e.message + ' Sie können die Dateien auch einzeln öffnen.')); }
  knopf.disabled = false; knopf.textContent = alt;
}

// ---------------------------------------------------------------- Unterlagen zum Objekt
function objekt(D) {
  const gruppen = new Map();
  for (const u of D.unterlagen || []) { const k = u.kategorie || 'Unterlagen'; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(u); }
  const oeffnen = async (u, knopf) => {
    const w = window.open('', '_blank');   // sofort öffnen, sonst blockt der Browser das neue Fenster
    knopf.disabled = true;
    try { const r = await api('datei', { id: u.id }); if (w) w.location = r.url; else location.href = r.url; }
    catch (e) { if (w) w.close(); knopf.after(meldung(e.message)); }
    knopf.disabled = false;
  };
  setze(kopf(D, 'Ihre Unterlagen'),
    h('div.karte', {},
      h('p.text', {}, D.text || 'hier finden Sie die Unterlagen zu diesem Objekt. Ein Tipp auf eine Datei öffnet sie.'),
      (D.unterlagen || []).length > 1 ? (() => { const gr = (D.unterlagen || []).reduce((s, u) => s + (u.groesse || 0), 0), b = h('button.btn.haupt.breit', { type: 'button' }, `⬇ Alle ${D.unterlagen.length} Dateien herunterladen${gr ? ' (' + groesse(gr) + ')' : ''}`); b.onclick = () => allesLaden(D, b); return h('div.reihe', {}, b); })() : null,
      [...gruppen].map(([k, L]) => h('div.gruppe', {}, h('h3', {}, k),
        L.map(u => { const b = h('button.datei', { type: 'button' }, h('i', {}, (u.name.split('.').pop() || 'PDF').slice(0, 4).toUpperCase()), h('span', {}, u.name.replace(/\.[a-z0-9]{2,5}$/i, ''), h('small', {}, groesse(u.groesse))), h('b', {}, 'Öffnen')); b.onclick = () => oeffnen(u, b); return b; }))),
      !(D.unterlagen || []).length ? h('p.muted', {}, 'Zu diesem Link sind derzeit keine Unterlagen freigegeben.') : null),
    kontaktKarte(D));
}
function kontaktKarte(D) {
  const a = D.absender || {};
  if (!a.tel && !a.email) return null;
  return h('div.karte', {}, h('h2', {}, 'Fragen?'), h('p.muted', {}, `${a.name || 'Wir'} ${a.name ? 'ist' : 'sind'} gerne für Sie da.`),
    h('div.reihe', {}, a.tel ? h('a.btn', { href: 'tel:' + String(a.tel).replace(/[^\d+]/g, '') }, '📞 ' + a.tel) : null, a.email ? h('a.btn', { href: 'mailto:' + a.email }, '✉ E-Mail schreiben') : null));
}

// ---------------------------------------------------------------- Besichtigungstermin
function ics(D, t) {
  const z = s => s.replace(/[-:]/g, ''), ende = t.ende || `${String((Number(t.start.slice(0, 2)) + (Number(t.start.slice(3)) >= 30 ? 1 : 0)) % 24).padStart(2, '0')}:${Number(t.start.slice(3)) >= 30 ? String(Number(t.start.slice(3)) - 30).padStart(2, '0') : String(Number(t.start.slice(3)) + 30).padStart(2, '0')}`;
  const esc = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Keuerleber Immobilien//Termin//DE', 'BEGIN:VEVENT', `UID:${token.slice(0, 12)}-${z(t.datum)}${z(t.start)}@keuerleber-immobilien.de`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`,
    `DTSTART;TZID=Europe/Berlin:${z(t.datum)}T${z(t.start)}00`, `DTEND;TZID=Europe/Berlin:${z(t.datum)}T${z(ende)}00`, `SUMMARY:${esc('Besichtigung: ' + (D.titel || 'Wohnung'))}`, `LOCATION:${esc(D.ort || D.adresse)}`,
    `DESCRIPTION:${esc([D.absender?.firma, D.absender?.name, D.absender?.tel].filter(Boolean).join(' · '))}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/calendar' })), download: 'Besichtigung.ics' }); document.body.append(a); a.click(); a.remove();
}
function gebucht(D, t, neu) {
  setze(h('p.ueber', {}, 'Besichtigung'), h('h1', {}, D.titel || 'Besichtigungstermin'),
    h('div.karte', {},
      h('div.ok-kopf', {}, h('span.haken', { 'aria-hidden': 'true' }, '✓'), h('div', {}, h('h2', {}, neu ? 'Ihr Termin ist gebucht' : 'Ihr Termin'), h('p', {}, `${tagText(t.datum)}, ${t.start} Uhr`))),
      (D.ort || D.adresse) ? h('p.muted', { style: null }, 'Treffpunkt: ' + (D.ort || D.adresse)) : null,
      D.hinweis ? h('p.text.muted', {}, D.hinweis) : null,
      h('div.reihe', {},
        h('button.btn.haupt', { type: 'button', onclick: () => ics(D, t) }, 'In meinen Kalender'),
        gast ? h('button.btn', { type: 'button', onclick: () => termin({ ...D, mein: null, aendern: true }) }, 'Anderen Termin wählen') : null,
        gast ? h('button.btn', { type: 'button', onclick: async e => { if (!confirm('Termin wirklich absagen?')) return; e.target.disabled = true; try { await api('storno'); setze(h('p.ueber', {}, 'Besichtigung'), h('h1', {}, 'Termin abgesagt'), h('div.karte', {}, h('p', {}, 'Danke für die Rückmeldung. Wenn Sie doch einen Termin möchten, öffnen Sie diesen Link einfach noch einmal.')), kontaktKarte(D)); } catch (x) { e.target.disabled = false; e.target.after(meldung(x.message)); } } }, 'Termin absagen') : null)),
    kontaktKarte(D));
}
function termin(D) {
  if (D.mein && !D.aendern) return gebucht(D, D.mein, false);
  let wahl = null;
  const tage = new Map(); for (const s of D.slots || []) { if (!tage.has(s.datum)) tage.set(s.datum, []); tage.get(s.datum).push(s); }
  const g = D.gast || {}, form = h('form', { hidden: true, novalidate: true });
  const anzeige = h('p.gewaehlt', { hidden: true });
  const knoepfe = [];
  const waehle = (s, b) => { wahl = s; knoepfe.forEach(x => x.setAttribute('aria-pressed', x === b)); anzeige.hidden = false; anzeige.textContent = `Gewählt: ${tagText(s.datum)}, ${s.start} Uhr`; form.hidden = false; form.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  const feld = (name, label, typ, wert, mehr = {}) => h('label.f' + (mehr.breit ? '.breit' : ''), {}, h('span', {}, label), typ === 'lang' ? h('textarea', { name, rows: 3 }) : h('input', { name, type: typ, value: wert || '', ...mehr.attr }));
  const absenden = h('button.btn.haupt.breit', { type: 'submit' }, 'Termin verbindlich buchen');
  form.append(h('div.raster', {},
    feld('name', 'Ihr Name', 'text', g.name, { breit: true, attr: { autocomplete: 'name', required: true } }),
    feld('tel', 'Telefon', 'tel', g.tel, { attr: { autocomplete: 'tel', inputMode: 'tel' } }),
    feld('email', 'E-Mail', 'email', g.email, { attr: { autocomplete: 'email' } }),
    feld('nachricht', 'Nachricht (optional)', 'lang', '', { breit: true })),
    h('p.muted.klein', { style: null }, 'Ihre Angaben verwenden wir nur für diesen Termin.'), h('div.reihe', {}, absenden));
  form.onsubmit = async e => {
    e.preventDefault(); form.querySelectorAll('.meldung').forEach(x => x.remove());
    const v = Object.fromEntries(new FormData(form));
    if (!wahl) return;
    if (String(v.name).trim().length < 2) { form.append(meldung('Bitte Ihren Namen angeben.')); return; }
    if (!String(v.tel).trim() && !String(v.email).trim()) { form.append(meldung('Bitte Telefon oder E-Mail angeben, damit wir Sie erreichen.')); return; }
    absenden.disabled = true; absenden.textContent = 'Wird gebucht …';
    try { const r = await api('buche', { slot: wahl.id, ...v }); gebucht({ ...D, ort: r.ort || D.ort }, r.termin, true); }
    catch (x) { if (x.daten?.slots) { termin({ ...D, slots: x.daten.slots, mein: null, fehler: x.message }); return; } absenden.disabled = false; absenden.textContent = 'Termin verbindlich buchen'; form.append(meldung(x.message)); }
  };
  setze(kopf(D, 'Besichtigung'),
    h('div.karte', {},
      h('h2', {}, D.aendern ? 'Neuen Termin wählen' : 'Wählen Sie Ihren Termin'),
      (D.ort || D.adresse) ? h('p.muted', {}, 'Treffpunkt: ' + (D.ort || D.adresse)) : null,
      D.hinweis ? h('p.text.muted', {}, D.hinweis) : null,
      D.fehler ? meldung(D.fehler + ' Bitte wählen Sie einen anderen.') : null,
      tage.size ? [...tage].map(([d, L]) => h('div.tag', {}, h('h3', {}, tagText(d)), h('div.slots', {}, L.map(s => { const b = h('button.slot', { type: 'button', 'aria-pressed': 'false' }, s.start + ' Uhr'); b.onclick = () => waehle(s, b); knoepfe.push(b); return b; }))))
        : h('p', { style: null }, 'Im Moment sind alle Termine vergeben. Melden Sie sich gerne direkt – wir finden einen Termin.'),
      anzeige, form),
    kontaktKarte(D));
}

// ---------------------------------------------------------------- Selbstauskunft
const ENTWURF = 'kre-auskunft-' + token.slice(0, 16);
async function alsPdf(D, d, zeit, knopf) {
  const alt = knopf.textContent; knopf.disabled = true; knopf.textContent = 'PDF wird erstellt …';
  try {
    if (!window.jspdf) await new Promise((ok, nein) => { const s = document.createElement('script'); s.src = '/crm/vendor/jspdf.umd.min.js'; s.onload = ok; s.onerror = () => nein(new Error('PDF konnte nicht erstellt werden.')); document.head.append(s); });
    pdf(window.jspdf.jsPDF, d, { titel: D.titel, adresse: D.adresse, absender: D.absender, eingereicht: zeit }).save(pdfName(d));
  } catch (e) { knopf.after(meldung(e.message)); }
  knopf.disabled = false; knopf.textContent = alt;
}
function auskunftFertig(D, d, zeit, neu) {
  setze(h('p.ueber', {}, 'Selbstauskunft'), h('h1', {}, D.titel || 'Selbstauskunft'),
    h('div.karte', {},
      h('div.ok-kopf', {}, h('span.haken', { 'aria-hidden': 'true' }, '✓'), h('div', {}, h('h2', {}, neu ? 'Vielen Dank!' : 'Bereits übermittelt'), h('p', {}, `Ihre Selbstauskunft ist am ${new Date(zeit).toLocaleDateString('de-DE')} bei uns eingegangen.`))),
      h('p.muted', { style: null }, 'Wir melden uns bei Ihnen. Für Ihre Unterlagen können Sie die ausgefüllte Auskunft als PDF speichern.'),
      h('div.reihe', {},
        (() => { const b = h('button.btn.haupt', { type: 'button' }, 'Als PDF herunterladen'); b.onclick = () => alsPdf(D, d, zeit, b); return b; })(),
        h('button.btn', { type: 'button', onclick: () => auskunft({ ...D, eingereicht: '', antwort: d, korrektur: true }) }, 'Angaben korrigieren'))),
    kontaktKarte(D));
}
function auskunft(D) {
  if (D.eingereicht && D.antwort) return auskunftFertig(D, D.antwort, D.eingereicht, false);
  let d = {};
  try { d = JSON.parse(localStorage.getItem(ENTWURF) || '{}') || {}; } catch { /* kein Entwurf */ }
  if (D.antwort) d = { ...D.antwort, ...d };
  const v = D.vorgabe || {}, teile = String(v.name || '').trim().split(/\s+/);
  d = { vorname: teile.length > 1 ? teile.slice(0, -1).join(' ') : '', nachname: teile.length ? teile[teile.length - 1] : '', email: v.email || '', tel: v.tel || '', ...Object.fromEntries(Object.entries(d).filter(([, x]) => x !== '')) };
  const form = h('form', { novalidate: true }), pflicht = ABSCHNITTE.flatMap(a => a.felder.filter(f => f.pflicht)).length + 1;
  const balken = h('i'), stand = h('span', {});
  const merken = () => { try { localStorage.setItem(ENTWURF, JSON.stringify(d)); } catch { /* privater Modus */ } const offen = fehlend(d).length; balken.style.width = Math.round((1 - Math.min(offen, pflicht) / pflicht) * 100) + '%'; stand.textContent = offen ? `Noch ${offen} Pflichtangabe${offen === 1 ? '' : 'n'}` : 'Alles ausgefüllt – bereit zum Absenden'; };
  const bedingt = [];
  const eingabe = f => {
    const id = 'f-' + f.k, set = w => { d[f.k] = w; merken(); bedingt.forEach(x => x()); };
    if (f.typ === 'jn') {
      return h('fieldset.f' + (f.breit ? '.breit' : ''), { 'data-k': f.k }, h('legend', {}, f.l, f.pflicht ? h('em', {}, ' *') : null),
        h('div.jn', {}, ['ja', 'nein'].map(o => h('label', {}, h('input', { type: 'radio', name: f.k, value: o, checked: d[f.k] === o, onchange: () => set(o) }), o === 'ja' ? 'Ja' : 'Nein'))));
    }
    let e;
    if (f.typ === 'wahl') e = h('select', { id, name: f.k, onchange: x => set(x.target.value) }, h('option', { value: '' }, 'Bitte wählen'), f.opt.map(o => h('option', { value: o, selected: d[f.k] === o }, o)));
    else if (f.typ === 'lang') e = h('textarea', { id, name: f.k, rows: 4, oninput: x => set(x.target.value) }, d[f.k] || '');
    else e = h('input', { id, name: f.k, type: f.typ === 'datum' ? 'date' : f.typ === 'tel' ? 'tel' : f.typ === 'email' ? 'email' : 'text', inputMode: f.typ === 'zahl' ? 'numeric' : f.typ === 'euro' ? 'decimal' : null, value: d[f.k] || '', placeholder: f.ph || '', autocomplete: f.ac || 'off', oninput: x => set(x.target.value) });
    return h('label.f' + (f.breit || f.typ === 'lang' ? '.breit' : ''), { 'data-k': f.k, for: id }, h('span', {}, f.l, f.pflicht ? h('em', {}, ' *') : null), e);
  };
  for (const a of ABSCHNITTE) {
    const raster = h('div.raster', {});
    for (const f of a.felder) { const el = eingabe(f); raster.append(el); if (f.wenn) bedingt.push(() => { el.hidden = !sichtbar(f, d); }); }
    form.append(h('fieldset', {}, h('legend', {}, a.titel), a.hinweis ? h('p.muted.klein', {}, a.hinweis) : null, raster));
  }
  bedingt.forEach(x => x());
  const richtig = h('input', { type: 'checkbox', checked: !!d.richtig, onchange: e => { d.richtig = e.target.checked; merken(); } });
  const zeileR = h('label.haken-zeile', { 'data-k': 'richtig' }, richtig, h('span', {}, ERKLAERUNG));
  const absenden = h('button.btn.haupt.breit', { type: 'submit' }, 'Selbstauskunft absenden');
  form.append(zeileR, h('p.muted.klein', { style: null }, DATENSCHUTZ), h('div.reihe', {}, absenden));
  form.onsubmit = async e => {
    e.preventDefault(); form.querySelectorAll('.meldung').forEach(x => x.remove()); form.querySelectorAll('.fehler').forEach(x => x.classList.remove('fehler'));
    const offen = fehlend(d);
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) offen.push('email');
    if (offen.length) { offen.forEach(k => form.querySelector(`[data-k="${k}"]`)?.classList.add('fehler')); const erst = form.querySelector('.fehler'); absenden.parentNode.after(meldung(`Bitte noch ${offen.length} Angabe${offen.length === 1 ? '' : 'n'} ergänzen (rot markiert).`)); erst?.scrollIntoView({ behavior: 'smooth', block: 'center' }); erst?.querySelector('input,select,textarea')?.focus({ preventScroll: true }); return; }
    absenden.disabled = true; absenden.textContent = 'Wird übermittelt …';
    const sauber = Object.fromEntries(Object.entries(d).filter(([k, x]) => x !== '' && x != null && (k === 'richtig' || ABSCHNITTE.some(a => a.felder.some(f => f.k === k && sichtbar(f, d))))));
    try { const r = await api('auskunft', { daten: sauber }); try { localStorage.removeItem(ENTWURF); } catch { /* egal */ } auskunftFertig(D, sauber, r.eingereicht, true); }
    catch (x) { absenden.disabled = false; absenden.textContent = 'Selbstauskunft absenden'; absenden.parentNode.after(meldung(x.message)); }
  };
  setze(kopf(D, 'Selbstauskunft'),
    h('p', {}, D.text || 'für die Wohnung benötigen wir eine kurze Selbstauskunft. Das dauert etwa 5 Minuten – Ihre Eingaben bleiben auf diesem Gerät gespeichert, bis Sie absenden.'),
    h('div.fort', {}, h('div', {}, balken), stand),
    form);
  merken();
}

// ---------------------------------------------------------------- Start
(async () => {
  if (!/^[a-z0-9]{20,48}$/.test(token)) { setze(h('h1', {}, 'Link unvollständig'), h('div.karte', {}, h('p', {}, 'Bitte öffnen Sie den Link noch einmal direkt aus unserer Nachricht.'))); fussZeile(); return; }
  try {
    const D = await api('hole'); fussZeile(D.absender);
    document.title = `${D.typ === 'termin' ? 'Besichtigung' : D.typ === 'auskunft' ? 'Selbstauskunft' : 'Unterlagen'} – ${D.absender?.firma || 'Keuerleber Immobilien'}`;
    (D.typ === 'termin' ? termin : D.typ === 'auskunft' ? auskunft : objekt)(D);
  } catch (e) {
    fussZeile(e.daten?.absender || {});
    const abg = e.status === 410;
    setze(h('h1', {}, abg ? 'Dieser Link ist abgelaufen' : e.netz ? 'Keine Verbindung' : 'Link nicht gefunden'),
      h('div.karte', {}, h('p', {}, abg ? 'Melden Sie sich gerne bei uns – wir schicken Ihnen einen neuen Link.' : e.netz ? e.message : 'Bitte öffnen Sie den Link noch einmal direkt aus unserer Nachricht oder melden Sie sich bei uns.'),
        e.netz ? h('div.reihe', {}, h('button.btn.haupt', { type: 'button', onclick: () => location.reload() }, 'Noch einmal versuchen')) : null));
  }
})();
window.addEventListener('hashchange', () => location.reload());
