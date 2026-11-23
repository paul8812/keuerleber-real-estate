// Exposé-Generator: Verkäufer-/Partner-Exposé (PDF) hochladen → Keuerleber-Exposé in deinem Layout.
// Ablauf: 1. PDF hochladen (wird im Browser ausgelesen)  2. Provision einstellen, Daten prüfen, Titelbild wählen  3. PDF erstellen.
// Auslesen, Kalkulation und Layout stammen aus dem bisherigen Exposé-Tool (js/expose/*).
import * as db from '../db.js';
import { html, raw, esc, toast, modal, confirmDlg, uid, today, fmtDate } from '../util.js';
import { berechne, renderExpose, eur0, eur2, pct, sgn } from '../expose/layout.js';
import { parse, leer } from '../expose/parse.js';
import { haptik } from '../haptik.js';

const BASIS = new URL('../../expose/', import.meta.url).href;
export const STANDARD = {
  kontakt: { name: 'Paul Keuerleber', titel: 'Immobilienkaufmann (IHK) · Keuerleber Immobilien', adresse: 'Hauptstraße 12 · 95145 Oberkotzau', telefon: '0151 67692176', email: 'paul.keuerleber@keuerleber-immobilien.de', web: 'keuerleber-immobilien.de' },
  annahmen: { ek_quote: 20, zins: 4.6, tilgung: 1, nebenkosten: 5.5, steuersatz: 42, gebaeudeanteil: 75, afa_standard: 2, rundung: 100 },
  disclaimer_kurz: 'Alle Angaben nach Unterlagen des Verkäufers, ohne Gewähr. Kalkulation ist ein unverbindliches Rechenbeispiel und keine Zusicherung.',
  disclaimer_lang: 'Alle Angaben beruhen auf Unterlagen des Verkäufers und wurden nach bestem Wissen zusammengestellt; eine Haftung für Vollständigkeit und Richtigkeit ist ausgeschlossen. Die Kalkulation ist ein unverbindliches Rechenbeispiel und keine Zusicherung. Sie ersetzt keine Steuer-, Rechts- oder Anlageberatung. Zwischenverkauf und Irrtum vorbehalten. Für Käufer fällt keine Provision an.',
};
export function einstellungen() {
  const e = db.settings().expose || {};
  return { ...STANDARD, ...e, kontakt: { ...STANDARD.kontakt, ...(e.kontakt || {}) }, annahmen: { ...STANDARD.annahmen, ...(e.annahmen || {}) } };
}
const alle = () => [...(db.all('exposes') || [])].sort((a, b) => (b.created || '').localeCompare(a.created || ''));
const fehlend = p => ['kaufpreis_partner', 'kaltmiete', 'wohnflaeche'].filter(k => !(+(p.objekt || {})[k] > 0));
const dateiId = (p, bildId) => `exp-${p.id}-${bildId}`;
const zahl = v => parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0;
const de = v => v != null && v !== 0 && v !== '' ? String(v).replace('.', ',') : '';
function pdfName(p) {
  const o = p.objekt || {}; let et = (o.etage || '').replace(/\s*Obergeschoss/, '. OG').replace('..', '.'); if (/erdgeschoss/i.test(et)) et = 'EG';
  const t = (o.strasse || o.ort) ? `${o.strasse || ''} ${o.ort || ''} ${et}`.trim() : (p.name || 'Objekt');
  return `Expose ${t} - Keuerleber Immobilien`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ');
}

// ---- Bilder: liegen als Dateien in der Cloud, im Browser als Blob-Adressen (schnell für Vorschau und Druck)
const bildUrl = new Map();
async function bildLaden(fid) {
  if (bildUrl.has(fid)) return bildUrl.get(fid);
  const f = await db.getFile(fid).catch(() => null); if (!f?.dataUrl) return '';
  // Data-URL von Hand in ein Blob wandeln (fetch auf data: ist durch die Sicherheitsrichtlinie des CRM gesperrt)
  const [kopf, b64] = f.dataUrl.split(','), bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const u = URL.createObjectURL(new Blob([bytes], { type: (kopf.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' })); bildUrl.set(fid, u); return u;
}
async function bilderVon(p) { await Promise.all((p.images || []).map(async i => { i.src = await bildLaden(dateiId(p, i.id)); })); return p; }
function listenBilder(root) { root.querySelectorAll('img[data-exbild]').forEach(async img => { const u = await bildLaden(img.dataset.exbild); if (u) img.src = u; else img.closest('.ex-cov')?.classList.add('leer'); }); }

// ---- Dokument (Vorschau + Druck)
const seitenHtml = p => renderExpose(p, einstellungen(), BASIS);
const dokument = p => `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(pdfName(p))}</title><link rel="stylesheet" href="${BASIS}expose.css"><style>html,body{margin:0;padding:0}body{overflow:hidden}</style></head><body>${seitenHtml(p)}</body></html>`;

let z = { id: '', busy: '', el: null };
let speichernT = 0, vorschauT = 0;

export function render(el, arg) {
  z.el = el;
  const p = arg && db.get('exposes', arg);
  if (arg && !p) { location.hash = '#/exposes'; return; }
  if (p) {
    if (el.querySelector(`.ex-detail[data-id="${p.id}"]`) && z.id === p.id) return aktualisieren(el, db.get('exposes', p.id), false);   // nicht neu aufbauen (Eingabe läuft)
    return detail(el, p);
  }
  z.id = '';
  const L = alle();
  el.innerHTML = String(html`<div class="ex">
    <div class="head"><div><h1>Exposés</h1><p class="muted">Verkäufer-Exposé hochladen – du bekommst es in deinem Keuerleber-Layout, mit deiner Provision und fertiger Kalkulation.</p></div></div>
    <label class="ex-drop ${z.busy ? 'busy' : ''}" id="ex-drop"><input type="file" accept="application/pdf,.pdf" hidden id="ex-file">
      <span class="ex-dropi" aria-hidden="true">${z.busy ? '⏳' : '⬆'}</span>
      <b>${z.busy || 'Verkäufer-Exposé (PDF) hierher ziehen'}</b><small>${z.busy ? 'Bitte kurz warten – das PDF wird direkt in deinem Browser ausgelesen.' : 'oder tippen zum Auswählen · Daten, Texte und Bilder werden automatisch übernommen'}</small></label>
    ${L.length ? html`<h2 class="ex-h">Deine Exposés</h2><div class="ex-liste">${L.map(karte)}</div>` : html`<div class="ex-schritte"><div><i>1</i><b>PDF hochladen</b><span>Das Exposé vom Verkäufer oder Bauträger.</span></div><div><i>2</i><b>Provision einstellen</b><span>Kaufpreis, Rendite und Cashflow rechnen sofort mit.</span></div><div><i>3</i><b>PDF erstellen</b><span>Fertiges Exposé in deinem Layout – zum Versenden.</span></div></div>`}
  </div>`);
  listenBilder(el);
  const drop = el.querySelector('#ex-drop'), file = el.querySelector('#ex-file');
  file.onchange = () => file.files[0] && hochladen(file.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = [...e.dataTransfer.files].find(x => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name)); if (f) hochladen(f); else toast('Bitte eine PDF-Datei ablegen', 'err'); };
  el.querySelectorAll('[data-exweg]').forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); loeschen(db.get('exposes', b.dataset.exweg)); });
}

function karte(p) {
  const s = einstellungen(), ok = !fehlend(p).length, c = ok ? berechne(p, s) : null, o = p.objekt || {};
  return html`<a class="ex-karte" href="#/exposes/${p.id}">
    <div class="ex-cov">${p.bilder?.titel ? html`<img data-exbild="${dateiId(p, p.bilder.titel)}" alt="" loading="lazy">` : ''}${p.pdfDatum ? html`<span class="ex-fertig">✓ PDF erstellt</span>` : html`<span class="ex-offen">Entwurf</span>`}</div>
    <div class="ex-kt"><b>${p.name || 'Exposé'}</b><small>${[o.zimmer ? de(o.zimmer) + ' Zi.' : '', o.wohnflaeche ? de(o.wohnflaeche) + ' m²' : '', o.etage].filter(Boolean).join(' · ')}</small>
      <div class="ex-kz">${c ? html`<span><i>Kaufpreis</i>${eur0(c.kp)}</span><span><i>Provision</i>${de(p.aufschlag || 0)} % · ${eur0(c.marge)}</span><span><i>Rendite</i>${pct(c.rendite)}</span>` : html`<span class="warn">Daten ergänzen</span>`}</div>
      <div class="ex-kf"><small class="muted">${p.pdfDatum ? 'PDF vom ' + fmtDate(p.pdfDatum) : 'eingelesen ' + fmtDate((p.created || '').slice(0, 10))}</small><button type="button" class="btn ghost small" data-exweg="${p.id}" aria-label="Exposé ${p.name} löschen">Löschen</button></div></div>
  </a>`;
}

async function hochladen(file) {
  if (z.busy) return;
  if (file.size > 60 * 1024 * 1024) return toast('Die PDF ist größer als 60 MB.', 'err');
  const neu = t => { z.busy = t; if (z.el && !z.id) render(z.el); };
  try {
    neu('PDF wird geöffnet …');
    const { pdfLesen } = await import('../expose/lesen.js');
    const x = await pdfLesen(await file.arrayBuffer(), neu);
    if (!x.pages.some(t => t.trim()) && !x.images.length) throw new Error('Die PDF enthält weder Text noch Bilder.');
    neu('Daten und Texte werden übernommen …');
    let r; try { r = parse(x.pages, x.images); } catch (e) { console.warn('Exposé-Parser:', e); r = leer(x.pages, x.images); }
    const id = 'exp-' + uid(), o = r.objekt;
    const p = { id, name: `${o.strasse || ''} ${o.ort || ''}`.trim() || file.name.replace(/\.pdf$/i, ''), quelle: file.name, aufschlag: 8, objekt: o, texte: r.texte, bilder: r.bilder, annahmen: {}, seiten: x.seiten, pages: x.pages,
      images: x.images.map(({ dataUrl, ...i }) => i) };
    let n = 0;
    for (const i of x.images) { neu(`Bilder werden gespeichert … ${++n} von ${x.images.length}`); await db.putFile(dateiId(p, i.id), i.dataUrl, { name: `${p.name} ${i.id}.jpg`, typ: 'image/jpeg' }); }
    await db.save('exposes', p);
    z.busy = ''; haptik('erfolg'); toast(fehlend(p).length ? 'Exposé eingelesen – bitte die rot markierten Werte ergänzen' : 'Exposé eingelesen');
    location.hash = '#/exposes/' + id;
  } catch (e) { z.busy = ''; if (z.el && !z.id) render(z.el); toast(e.message || 'Das Exposé konnte nicht gelesen werden', 'err'); }
}

async function loeschen(p) {
  if (!p || !(await confirmDlg(`Exposé „${p.name}“ löschen? Die eingelesenen Bilder werden mit gelöscht. Ein bereits gespeichertes PDF auf deinem Gerät bleibt.`))) return;
  for (const i of p.images || []) db.delFile(dateiId(p, i.id)).catch(() => {});
  await db.del('exposes', p.id); toast('Exposé gelöscht');
  if (location.hash !== '#/exposes') location.hash = '#/exposes'; else if (z.el) render(z.el);
}

// ------------------------------------------------------------------ Bearbeiten
const FELDER = [
  ['strasse', 'Straße und Hausnummer', 'text', 'full'], ['plz', 'PLZ', 'text'], ['ort', 'Ort', 'text'],
  ['kaufpreis_partner', 'Preis vom Verkäufer (€)', 'zahl'], ['kaltmiete', 'Kaltmiete / Monat (€)', 'zahl'], ['wohnflaeche', 'Wohnfläche (m²)', 'zahl'], ['zimmer', 'Zimmer', 'zahl'],
  ['hausgeld_nicht_umlagefaehig', 'Hausgeld nicht umlagef. (€)', 'zahl'], ['restnutzungsdauer', 'Restnutzungsdauer (Jahre)', 'zahl'],
];
const FINANZ = [['zins', 'Sollzins (%)'], ['tilgung', 'Tilgung (%)'], ['ek_quote', 'Eigenkapital (%)'], ['steuersatz', 'Steuersatz (%)']];

function detail(el, p) {
  z.id = p.id;
  const o = p.objekt || {}, s = einstellungen(), miss = fehlend(p);
  if (!o.vermietung_status) o.vermietung_status = /unvermietet|frei/i.test(o.vermietung || '') ? 'unvermietet' : 'vermietet';
  const prop = p.propertyId && db.get('properties', p.propertyId);
  el.innerHTML = String(html`<div class="ex ex-detail" data-id="${p.id}">
    <div class="ex-kopf"><a class="btn ghost small" href="#/exposes">← Alle Exposés</a><div class="ex-kopft"><h1>${p.name || 'Exposé'}</h1><small class="muted">aus „${p.quelle || 'PDF'}“ · ${p.seiten || '?'} Seiten · ${(p.images || []).length} Bilder</small></div></div>
    <div class="ex-zwei">
      <div class="ex-links">
        <section class="card ex-s"><h2><i>1</i>Deine Provision</h2>
          <div class="ex-prov"><input type="range" id="ex-range" min="0" max="15" step="0.5" value="${p.aufschlag ?? 8}" aria-label="Provision in Prozent"><label><input type="text" id="ex-pct" inputmode="decimal" value="${de(p.aufschlag ?? 8) || '0'}" aria-label="Provision in Prozent"> %</label></div>
          <div class="ex-zahlen" id="ex-zahlen"></div>
        </section>
        <section class="card ex-s"><details id="ex-daten" ${miss.length ? raw('open') : ''}><summary><h2><i>2</i>Objektdaten prüfen<span class="ex-st" id="ex-dst"></span></h2></summary>
          <p class="muted small">Automatisch aus dem Verkäufer-Exposé gelesen. Nur ändern, wenn etwas nicht stimmt – Vorschau und Rechnung passen sich sofort an.</p>
          <div class="ex-felder">${FELDER.map(([k, l, t, cls]) => html`<label class="${cls || ''}"><span>${l}</span><input data-k="${k}" data-t="${t}" value="${t === 'text' ? o[k] || '' : de(o[k])}" ${t === 'zahl' ? raw('inputmode="decimal"') : ''}></label>`)}
            <label class="full"><span>RND-Gutachten</span><select data-k="rnd_angenommen" data-t="bool"><option value="false" ${o.rnd_angenommen ? '' : raw('selected')}>liegt vor</option><option value="true" ${o.rnd_angenommen ? raw('selected') : ''}>in Vorbereitung / angenommen</option></select></label>
            <label class="full"><span>Vermietung</span><select data-k="vermietung_status" data-t="wahl">${[['unvermietet', 'unvermietet / sofort frei'], ['frisch', 'frisch vermietet'], ['vermietet', 'vermietet']].map(([v, l]) => html`<option value="${v}" ${o.vermietung_status === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
            <div class="full ex-fin">Finanzierung im Rechenbeispiel</div>
            ${FINANZ.map(([k, l]) => html`<label><span>${l}</span><input data-k="${k}" data-t="annahme" inputmode="decimal" value="${de((p.annahmen || {})[k] ?? s.annahmen[k])}"></label>`)}</div>
        </details></section>
        <section class="card ex-s"><details id="ex-bilder"><summary><h2><i>3</i>Titelbild wählen</h2></summary><div class="ex-pics" id="ex-pics"></div></details></section>
        <section class="card ex-s ex-fertigs"><button type="button" class="btn primary ex-go" id="ex-go">Exposé als PDF erstellen</button>
          <p class="muted small" id="ex-goh">Öffnet das fertige Exposé in einem neuen Fenster – dort „Als PDF sichern“.</p>
          <div class="ex-mehr">${prop ? html`<a class="lnk small" href="#/objekte/${prop.id}">⌂ Objekt „${prop.titel}“ öffnen →</a>` : html`<button type="button" class="btn small" id="ex-objekt">⌂ Als Objekt im CRM anlegen</button>`}<button type="button" class="btn ghost small" id="ex-weg">Exposé löschen</button></div></section>
      </div>
      <div class="ex-rechts"><div class="ex-vbar"><b>Vorschau</b><span class="muted small" id="ex-vinfo">wird geladen …</span></div><div class="ex-vwrap" id="ex-vwrap"><iframe id="ex-frame" title="Vorschau des Exposés" scrolling="no"></iframe></div></div>
    </div></div>`);
  const $ = q => el.querySelector(q), range = $('#ex-range'), pctIn = $('#ex-pct');
  const akt = () => db.get('exposes', p.id);
  const sichern = (patch, sofort) => { const neu = Object.assign(akt(), patch); clearTimeout(speichernT); const f = () => db.save('exposes', neu); if (sofort) return f(); speichernT = setTimeout(f, 600); aktualisieren(el, neu, true); };
  const setzeProv = v => { v = Math.min(15, Math.max(0, v)); range.value = v; range.style.setProperty('--p', v / 15 * 100 + '%'); if (document.activeElement !== pctIn) pctIn.value = de(v) || '0'; sichern({ aufschlag: v }); };
  range.oninput = () => setzeProv(parseFloat(range.value) || 0);
  pctIn.oninput = () => setzeProv(zahl(pctIn.value));
  range.style.setProperty('--p', (p.aufschlag ?? 8) / 15 * 100 + '%');
  el.querySelectorAll('.ex-felder [data-k]').forEach(f => f.addEventListener('input', () => {
    const neu = akt(), k = f.dataset.k, t = f.dataset.t; neu.objekt = { ...neu.objekt }; neu.annahmen = { ...(neu.annahmen || {}) };
    if (t === 'annahme') { const v = parseFloat(f.value.replace(',', '.')); if (isNaN(v)) delete neu.annahmen[k]; else neu.annahmen[k] = v; }
    else neu.objekt[k] = t === 'text' ? f.value.trim() : t === 'bool' ? f.value === 'true' : t === 'wahl' ? f.value : zahl(f.value);
    if (k === 'restnutzungsdauer') neu.objekt[k] = Math.round(neu.objekt[k]);
    if (k === 'strasse' || k === 'ort') { neu.name = `${neu.objekt.strasse || ''} ${neu.objekt.ort || ''}`.trim() || neu.name; el.querySelector('.ex-kopft h1').textContent = neu.name; }
    if (k === 'vermietung_status' && neu.pages) {      // Texte passend neu schreiben, eigene Zahlen behalten
      try { const r = parse(neu.pages, (neu.images || []).map(i => ({ ...i })), f.value); neu.texte = r.texte; neu.objekt.vermietung = r.objekt.vermietung; } catch { /* Texte bleiben */ }
    }
    sichern({ objekt: neu.objekt, annahmen: neu.annahmen, name: neu.name, texte: neu.texte });
  }));
  $('#ex-go').onclick = async () => {
    const cur = akt(); if (fehlend(cur).length) { $('#ex-daten').open = true; return toast('Bitte erst die rot markierten Werte ergänzen', 'err'); }
    // Druckansicht ist eine eigene Seite (crm/expose/druck.html); sie holt sich die fertigen Seiten aus diesem Fenster
    await bilderVon(cur); window.__exposeDruck = { titel: pdfName(cur), html: seitenHtml(cur) };
    const w = window.open(BASIS + 'druck.html', '_blank'); if (!w) return toast('Das Fenster wurde blockiert – bitte Pop-ups für das CRM erlauben', 'err');
    const c = berechne(cur, einstellungen()); clearTimeout(speichernT);
    await db.save('exposes', Object.assign(akt(), { pdfDatum: today(), pdfKaufpreis: c.kp, pdfAufschlag: cur.aufschlag })); haptik('erfolg');
  };
  $('#ex-weg').onclick = () => loeschen(akt());
  const ob = $('#ex-objekt'); if (ob) ob.onclick = () => objektAnlegen(akt());
  $('#ex-bilder').addEventListener('toggle', () => zeigeBilder(el, akt()));
  window.addEventListener('resize', skalieren);
  aktualisieren(el, p, true);
}

/** Zahlen, Markierungen und Vorschau auf den Stand von p bringen (ohne die Eingabefelder neu aufzubauen) */
function aktualisieren(el, p, mitVorschau) {
  if (!p) return;
  const s = einstellungen(), miss = fehlend(p), ok = !miss.length, c = berechne(p, s);
  const zl = el.querySelector('#ex-zahlen'); if (!zl) return;
  const z2 = (l, v, cls = '') => `<div class="${cls}"><span>${l}</span><b>${v}</b></div>`;
  zl.innerHTML = z2('Preis vom Verkäufer', ok ? eur0(c.basis) : '–') + z2('Dein Kaufpreis', ok ? eur0(c.kp) : '–', 'haupt') + z2('Deine Provision', ok ? '+ ' + eur0(c.marge) : '–', 'gold')
    + z2('Brutto-Rendite', ok ? pct(c.rendite) : '–') + z2('Cashflow vor Steuern', ok ? sgn(c.vorSt, eur2) : '–', ok ? (c.vorSt < 0 ? 'neg' : 'pos') : '') + z2('Cashflow nach Steuern', ok ? sgn(c.nachSt, eur2) : '–', ok ? (c.nachSt < 0 ? 'neg' : 'pos') : '');
  el.querySelectorAll('.ex-felder input[data-k]').forEach(i => i.classList.toggle('miss', miss.includes(i.dataset.k)));
  const st = el.querySelector('#ex-dst'); st.textContent = ok ? '✓ vollständig' : `${miss.length} Wert${miss.length === 1 ? '' : 'e'} fehl${miss.length === 1 ? 't' : 'en'}`; st.className = 'ex-st ' + (ok ? 'ok' : 'warn');
  const go = el.querySelector('#ex-go'); go.textContent = p.pdfDatum ? 'Exposé neu als PDF erstellen' : 'Exposé als PDF erstellen';
  el.querySelector('#ex-goh').textContent = p.pdfDatum ? `Zuletzt erstellt am ${fmtDate(p.pdfDatum)}${p.pdfKaufpreis ? ' · ' + eur0(p.pdfKaufpreis) : ''}${p.pdfAufschlag != null ? ' · ' + de(p.pdfAufschlag) + ' % Provision' : ''}.` : 'Öffnet das fertige Exposé in einem neuen Fenster – dort „Als PDF sichern“.';
  if (mitVorschau) { clearTimeout(vorschauT); vorschauT = setTimeout(() => vorschau(el, p), 180); }
}

async function vorschau(el, p) {
  const fr = el.querySelector('#ex-frame'); if (!fr || z.id !== p.id) return;
  await bilderVon(p);
  const info = el.querySelector('#ex-vinfo'), fertig = () => { try { const d = fr.contentDocument, n = d.querySelectorAll('.page').length; fr.style.height = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight) + 'px'; if (info) info.textContent = `${n} Seiten · ${de(p.aufschlag || 0) || '0'} % Provision`; skalieren(); } catch { /* Rahmen weg */ } };
  if (fr.contentDocument?.querySelector('.page')) { fr.contentDocument.body.innerHTML = seitenHtml(p); fertig(); setTimeout(fertig, 400); }
  else { fr.onload = () => { fertig(); setTimeout(fertig, 500); setTimeout(fertig, 1500); }; fr.srcdoc = dokument(p); }
}
function skalieren() {
  const w = z.el?.querySelector('#ex-vwrap'), fr = z.el?.querySelector('#ex-frame'); if (!w || !fr) return window.removeEventListener('resize', skalieren);
  const s = Math.min(1, w.clientWidth / 794); fr.style.transform = `scale(${s})`; w.style.height = (parseFloat(fr.style.height) || 1123) * s + 'px';
}
function zeigeBilder(el, p) {
  const box = el.querySelector('#ex-pics'); if (!box || !el.querySelector('#ex-bilder').open) return;
  const L = (p.images || []).filter(i => i.cat !== 'energie' && i.cat !== 'lage' && !i.karte);
  box.innerHTML = L.length ? String(html`${L.map(i => html`<button type="button" class="${p.bilder.titel === i.id ? 'sel' : ''}" data-id="${i.id}" title="${i.caption || ''}" aria-label="Als Titelbild: ${i.caption || i.id}"><img data-exbild="${dateiId(p, i.id)}" alt=""></button>`)}`) : '<p class="muted small">Im PDF wurden keine Fotos gefunden.</p>';
  listenBilder(box);
  box.querySelectorAll('button').forEach(b => b.onclick = async () => {
    const cur = db.get('exposes', p.id), bl = { ...cur.bilder }, neu = b.dataset.id, alt = bl.titel; if (neu === alt) return;
    // das neue Titelbild tauscht den Platz mit dem alten (damit kein Bild doppelt oder verloren ist)
    let getauscht = false;
    for (const k of ['seite1', 'seite2', 'seite4', 'galerie']) { bl[k] = (bl[k] || []).map(x => x === neu ? (getauscht = true, alt) : x).filter(Boolean); }
    if (!getauscht && alt) bl.galerie = [alt, ...(bl.galerie || [])];
    bl.titel = neu; clearTimeout(speichernT); const s = Object.assign(cur, { bilder: bl }); await db.save('exposes', s); aktualisieren(el, s, true); zeigeBilder(el, s);
  });
}

/** Aus dem Exposé ein Objekt im CRM machen (Kauf, mit deinem Kaufpreis) und verknüpfen */
async function objektAnlegen(p) {
  if (fehlend(p).length) return toast('Bitte erst die fehlenden Werte ergänzen', 'err');
  const o = p.objekt, c = berechne(p, einstellungen());
  const vorhanden = db.all('properties').find(x => o.strasse && (x.strasse || '').toLowerCase() === o.strasse.toLowerCase() && (x.ort || '') === (o.ort || ''));
  if (vorhanden) { await db.save('exposes', Object.assign(db.get('exposes', p.id), { propertyId: vorhanden.id })); toast(`Mit vorhandenem Objekt „${vorhanden.titel}“ verknüpft`); z.id = ''; return render(z.el, p.id); }
  const pr = await db.save('properties', { nr: db.nextNr ? db.nextNr('OBJ-', 'properties') : '', titel: (p.texte?.titel || '').split('\n')[0] || `${o.zimmer}-Zimmer-Wohnung ${o.ort || ''}`.trim(), vermarktung: 'Kauf', art: 'Eigentumswohnung', status: 'Aktiv',
    strasse: o.strasse || '', plz: o.plz || '', ort: o.ort || '', preis: c.kp, flaeche: o.wohnflaeche || '', zimmer: o.zimmer || '', baujahr: o.baujahr || '', etage: o.etage || '', hausgeld: o.hausgeld || '',
    eKlasse: o.energie?.klasse || '', beschreibung: (p.texte?.objekt_text || []).join('\n\n'), eingestelltAm: today(), exposeId: p.id });
  await db.save('exposes', Object.assign(db.get('exposes', p.id), { propertyId: pr.id }));
  toast('Objekt angelegt und mit dem Exposé verknüpft', 'ok', { label: 'Öffnen', fn: () => { location.hash = '#/objekte/' + pr.id; } });
  z.id = ''; render(z.el, p.id);
}
