// Exposé-Generator: Verkäufer-/Partner-Exposé (PDF) hochladen → Keuerleber-Exposé in deinem Layout.
// Ablauf: 1. PDF hochladen (wird im Browser ausgelesen)  2. Provision einstellen, Daten prüfen, Titelbild wählen  3. PDF erstellen.
// Auslesen, Kalkulation und Layout stammen aus dem bisherigen Exposé-Tool (js/expose/*).
import * as db from '../db.js';
import { html, raw, esc, toast, modal, confirmDlg, uid, today, fmtDate } from '../util.js';
import { berechne, kontrolle, einpassen, renderExpose, eur0, eur2, pct, sgn } from '../expose/layout.js';
import { parse, leer } from '../expose/parse.js';
import { renderStory, renderAd } from '../expose/social.js';
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
/** Eingabe als Zahl lesen: „156.500“ und „156.500,00“ sind Tausenderpunkte, „64.26“ und „64,26“ Dezimalstellen */
export function zahl(v) {
  let t = String(v ?? '').replace(/[^\d.,-]/g, ''); if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  const n = parseFloat(t); return Number.isFinite(n) ? n : 0;
}
const de = v => v != null && v !== 0 && v !== '' ? String(v).replace('.', ',') : '';
export function pdfName(p) {
  const o = p.objekt || {}; let et = (o.etage || '').replace(/\s*Obergeschoss/, '. OG').replace('..', '.'); if (/erdgeschoss/i.test(et)) et = 'EG';
  const t = (o.strasse || o.ort) ? `${o.strasse || ''} ${o.ort || ''} ${et}`.trim() : (p.name || 'Objekt');
  return `Expose ${t} - Keuerleber Immobilien`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ');
}

// ---- Bilder: liegen als Dateien in der Cloud, im Browser als Blob-Adressen (schnell für Vorschau und Druck)
const bildUrl = new Map(), datenVon = new Map();   // Datei-ID → Blob-Adresse, Blob-Adresse → Data-URL (für den Bild-Export)
async function bildLaden(fid) {
  if (bildUrl.has(fid)) return bildUrl.get(fid);
  const f = await db.getFile(fid).catch(() => null); if (!f?.dataUrl) return '';
  // Data-URL von Hand in ein Blob wandeln (fetch auf data: ist durch die Sicherheitsrichtlinie des CRM gesperrt)
  const [kopf, b64] = f.dataUrl.split(','), bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const u = URL.createObjectURL(new Blob([bytes], { type: (kopf.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' })); bildUrl.set(fid, u); datenVon.set(u, f.dataUrl); return u;
}
async function bilderVon(p) { await Promise.all((p.images || []).map(async i => { i.src = await bildLaden(dateiId(p, i.id)); })); return p; }
function listenBilder(root) { root.querySelectorAll('img[data-exbild]').forEach(async img => { const u = await bildLaden(img.dataset.exbild); if (u) img.src = u; else img.closest('.ex-cov')?.classList.add('leer'); }); }

/** Titelbild für den Druck: Foto + Abdunklung (wie in der Vorschau) zu EINEM Bild verrechnen. verh = Höhe/Breite der Titelfläche. */
async function titelbildFertig(p, verh) {
  const bild = (p.images || []).find(i => i.id === p.bilder?.titel); if (!bild?.src) return '';
  const img = new Image(); await new Promise((ja, nein) => { img.onload = ja; img.onerror = () => nein(new Error('Titelbild nicht lesbar')); img.src = bild.src; });
  if (!(verh > 0.3 && verh < 1.6)) verh = 0.82;
  const W = 1654, H = Math.round(W * verh), mm = W / 210, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#222'; x.fillRect(0, 0, W, H);
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight), bw = img.naturalWidth * s, bh = img.naturalHeight * s; x.drawImage(img, (W - bw) / 2, (H - bh) / 2, bw, bh);   // wie background-size: cover, mittig
  const g = x.createLinearGradient(0, 0, 0, H); for (const [o, a] of [[0, .6], [.14, .35], [.32, 0], [.45, 0], [1, .78]]) g.addColorStop(o, `rgba(0,0,0,${a})`); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.save(); x.translate(37 * mm, 20 * mm); x.scale(72 * mm, 30 * mm); const r = x.createRadialGradient(0, 0, 0, 0, 0, 1); for (const [o, a] of [[0, .62], [.45, .4], [1, 0]]) r.addColorStop(o, `rgba(0,0,0,${a})`); x.fillStyle = r; x.beginPath(); x.arc(0, 0, 1, 0, Math.PI * 2); x.fill(); x.restore();
  return c.toDataURL('image/jpeg', 0.9);
}

// ---- Dokument (Vorschau + Druck)
const FORMATE = { expose: ['Exposé', 794], story: ['Insta-Story', 1080], ad: ['Werbeanzeige', 1080] };
const seitenHtml = (p, f = 'expose') => f === 'story' ? renderStory(p, einstellungen(), BASIS) : f === 'ad' ? renderAd(p, einstellungen(), BASIS) : renderExpose(p, einstellungen(), BASIS);
const dokument = (p, f = 'expose') => `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(pdfName(p))}</title><link rel="stylesheet" href="${BASIS}expose.css"><link rel="stylesheet" href="${BASIS}social.css">
<style>html,body{margin:0;padding:0}body{overflow:hidden;background:${f === 'expose' ? '#fff' : '#2a2a2d'}}#out{display:flex;flex-direction:column;gap:${f === 'story' ? 28 : 0}px}</style></head><body><div id="out">${seitenHtml(p, f)}</div></body></html>`;

// ---- Story / Anzeige als Bilder speichern (1080 px breit, wie im bisherigen Tool)
let h2cP = null;
const h2c = () => h2cP || (h2cP = new Promise((res, rej) => { if (window.html2canvas) return res(window.html2canvas); const sc = document.createElement('script'); sc.src = new URL('../../vendor/html2canvas.min.js', import.meta.url).href; sc.onload = () => res(window.html2canvas); sc.onerror = () => { h2cP = null; rej(new Error('Bild-Werkzeug konnte nicht geladen werden')); }; document.head.appendChild(sc); }));
const alsDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
const festeDaten = new Map();   // Logo, Porträt, Stylesheet – einmal laden
async function fest(url, text) { if (!festeDaten.has(url)) { const r = await fetch(url); if (!r.ok) throw new Error('Vorlage nicht erreichbar'); festeDaten.set(url, text ? await r.text() : await alsDataUrl(await r.blob())); } return festeDaten.get(url); }
/** Ein Story-/Anzeigen-Element exakt so als Bild ausgeben, wie der Browser es zeichnet (SVG mit eingebettetem HTML → Leinwand) */
async function alsBild(sec, css) {
  const w = sec.offsetWidth, h = sec.offsetHeight;
  let xhtml = new XMLSerializer().serializeToString(sec);
  const urls = new Set([...xhtml.matchAll(/(?:url\((?:&quot;|'|")?|src=")((?:blob:|https?:)[^"')&]+)/g)].map(m => m[1]));
  for (const u of urls) { const d = datenVon.get(u) || (u.startsWith('blob:') ? '' : await fest(u)); if (d) xhtml = xhtml.split(u).join(d); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px"><style>${css.replace(/</g, '&lt;').replace(/&(?!lt;)/g, '&amp;')}</style>${xhtml}</div></foreignObject></svg>`;
  const img = new Image(); img.decoding = 'sync';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Bild konnte nicht aufgebaut werden')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  // Safari zeichnet eingebettete Fotos manchmal erst beim zweiten Mal → kurz warten und noch einmal zeichnen
  x.drawImage(img, 0, 0); await new Promise(r => setTimeout(r, 250)); x.clearRect(0, 0, w, h); x.fillStyle = '#080808'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0);
  return await new Promise((res, rej) => { try { c.toBlob(b => b ? res(b) : rej(new Error('leer')), 'image/png'); } catch (e) { rej(e); } });
}
async function bilderErzeugen(p, f) {
  await bilderVon(p);
  const css = await fest(BASIS + 'social.css', true);
  const fr = document.createElement('iframe'); fr.setAttribute('aria-hidden', 'true'); fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:1080px;height:1920px;border:0';
  document.body.appendChild(fr);
  try {
    await new Promise(r => { fr.onload = r; fr.srcdoc = dokument(p, f); });
    const d = fr.contentDocument; fr.style.height = d.documentElement.scrollHeight + 'px';
    await Promise.all([...d.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    const out = [];
    for (const sec of d.querySelectorAll('.story, .ad')) {
      try { out.push(await alsBild(sec, css)); }
      catch (e) {   // Browser lässt den direkten Weg nicht zu → Ersatzweg (nachgezeichnet, minimal ungenauer)
        const html2canvas = await h2c(), c = await html2canvas(sec, { scale: 1, backgroundColor: '#080808', logging: false, useCORS: true, width: sec.offsetWidth, height: sec.offsetHeight, windowWidth: 1080 });
        out.push(await new Promise(r => c.toBlob(r, 'image/png')));
      }
    }
    return out.filter(Boolean);
  } finally { fr.remove(); }
}
// kleines ZIP ohne Kompression (PNG ist schon komprimiert)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }; })();
function zip(dateien) {
  const enc = new TextEncoder(), teile = [], zentral = []; let off = 0;
  const kopf = (sig, name, crc, len, extra) => { const b = new DataView(new ArrayBuffer(extra ? 46 : 30)); let o = 0; const u32 = v => { b.setUint32(o, v, true); o += 4; }, u16 = v => { b.setUint16(o, v, true); o += 2; };
    u32(sig); if (extra) u16(20); u16(20); u16(0x0800); u16(0); u16(0); u16(33); u32(crc); u32(len); u32(len); u16(name.length); u16(0); if (extra) { u16(0); u16(0); u16(0); u32(0); u32(extra.off); } return new Uint8Array(b.buffer); };
  for (const [n, bytes] of dateien) { const name = enc.encode(n), crc = CRC(bytes); teile.push(kopf(0x04034b50, name, crc, bytes.length), name, bytes); zentral.push(kopf(0x02014b50, name, crc, bytes.length, { off }), name); off += 30 + name.length + bytes.length; }
  const zl = zentral.reduce((x, y) => x + y.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, dateien.length, true); e.setUint16(10, dateien.length, true); e.setUint32(12, zl, true); e.setUint32(16, off, true);
  return new Blob([...teile, ...zentral, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
function laden(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); }
/** Story (4 Bilder) oder Anzeige (1 Bild) erzeugen und speichern: am Handy über „Teilen“ (→ In Fotos sichern), am Rechner als Download */
async function socialSpeichern(p, f, knopf) {
  const alt = knopf.textContent; knopf.disabled = true; knopf.textContent = 'Bilder werden erstellt …';
  try {
    const B = await bilderErzeugen(p, f); if (!B.length) throw new Error('Es konnte kein Bild erstellt werden');
    // Dateinamen ohne Umlaute/Sonderzeichen – manche Browser verwerfen sie sonst und speichern nur „download“
    const ascii = t => t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[^\x20-\x7E]/g, '');
    const basis = ascii(pdfName(p).replace(/^Expose /, f === 'story' ? 'Story ' : 'Anzeige '));
    const files = B.map((b, i) => new File([b], `${basis}${B.length > 1 ? ' ' + (i + 1) : ''}.png`, { type: 'image/png' }));
    if (matchMedia('(pointer:coarse)').matches && navigator.canShare?.({ files })) { try { await navigator.share({ files }); } catch (e) { if (e.name !== 'AbortError') throw e; } }
    else if (files.length === 1) laden(files[0], files[0].name);
    else laden(zip(await Promise.all(files.map(async x => [x.name, new Uint8Array(await x.arrayBuffer())]))), basis + '.zip');
    haptik('erfolg'); toast(f === 'story' ? `Story: ${B.length} Bilder (1080 × 1920) erstellt` : 'Werbeanzeige (1080 × 1350) erstellt');
    const cur = db.get('exposes', p.id); if (cur) { clearTimeout(speichernT); await db.save('exposes', Object.assign(cur, { [f === 'story' ? 'storyDatum' : 'adDatum']: today() })); }
  } catch (e) { toast(e.message || 'Bilder konnten nicht erstellt werden', 'err'); }
  finally { knopf.disabled = false; knopf.textContent = alt; }
}

let z = { id: '', busy: '', el: null, format: 'expose' };
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
        <section class="card ex-s"><h2><i>1</i>Preis und Provision</h2>
          <label class="ex-fest ex-vk"><span>Abgabepreis vom Verkäufer (€)</span><input type="text" id="ex-vk" inputmode="decimal" value="${+o.kaufpreis_partner > 0 ? Math.round(+o.kaufpreis_partner * 100 / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 }) : ''}" placeholder="z. B. 156.500"></label>
          <div class="ex-prov"><input type="range" id="ex-range" min="0" max="15" step="0.5" value="${p.aufschlag ?? 8}" aria-label="Provision in Prozent"><label><input type="text" id="ex-pct" inputmode="decimal" value="${de(p.aufschlag ?? 8) || '0'}" aria-label="Provision in Prozent"> %</label></div>
          <div class="ex-zahlen" id="ex-zahlen"></div>
          <p class="ex-weg muted small" id="ex-rweg"></p>
          <label class="ex-fest"><span>Oder Kaufpreis fest eintragen (€)</span><input type="text" id="ex-fest" inputmode="numeric" value="${p.preis_override ? Math.round(p.preis_override).toLocaleString('de-DE') : ''}" placeholder="leer = Verkäufer-Preis + Provision"></label>
          <label class="ex-fest ex-rund"><span>Kaufpreis runden auf</span><select id="ex-rund">${[[1, 'gar nicht (auf den Euro genau)'], [100, '100 €'], [500, '500 €'], [1000, '1.000 €']].map(([v, l]) => html`<option value="${v}" ${Number((p.annahmen || {}).rundung ?? s.annahmen.rundung) === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
          <p class="ex-pruef small" id="ex-pruef" role="status"></p>
        </section>
        <section class="card ex-s"><details id="ex-daten" ${miss.length ? raw('open') : ''}><summary><h2><i>2</i>Objektdaten prüfen<span class="ex-st" id="ex-dst"></span></h2></summary>
          <p class="muted small">Automatisch aus dem Verkäufer-Exposé gelesen. Nur ändern, wenn etwas nicht stimmt – Vorschau und Rechnung passen sich sofort an.</p>
          <div class="ex-felder">${FELDER.map(([k, l, t, cls]) => html`<label class="${cls || ''}"><span>${l}</span><input data-k="${k}" data-t="${t}" value="${t === 'text' ? o[k] || '' : de(o[k])}" ${t === 'zahl' ? raw('inputmode="decimal"') : ''}></label>`)}
            <label class="full"><span>RND-Gutachten</span><select data-k="rnd_angenommen" data-t="bool"><option value="false" ${o.rnd_angenommen ? '' : raw('selected')}>liegt vor</option><option value="true" ${o.rnd_angenommen ? raw('selected') : ''}>in Vorbereitung / angenommen</option></select></label>
            <label class="full"><span>Vermietung</span><select data-k="vermietung_status" data-t="wahl">${[['unvermietet', 'unvermietet / sofort frei'], ['frisch', 'frisch vermietet'], ['vermietet', 'vermietet']].map(([v, l]) => html`<option value="${v}" ${o.vermietung_status === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
            <label class="full"><span>Story-Überschrift (leer = automatisch)</span><input data-k="story_titel" data-t="root" value="${p.story_titel || ''}" placeholder="z. B. Top Einsteiger-Kapitalanlage"></label>
            <div class="full ex-fin">Finanzierung im Rechenbeispiel</div>
            ${FINANZ.map(([k, l]) => html`<label><span>${l}</span><input data-k="${k}" data-t="annahme" inputmode="decimal" value="${de((p.annahmen || {})[k] ?? s.annahmen[k])}"></label>`)}</div>
        </details></section>
        <section class="card ex-s"><details id="ex-bilder"><summary><h2><i>3</i>Titelbild wählen</h2></summary><div class="ex-pics" id="ex-pics"></div></details></section>
        <section class="card ex-s ex-fertigs"><button type="button" class="btn primary ex-go" id="ex-go">Exposé als PDF erstellen</button>
          <p class="muted small" id="ex-goh">Öffnet das fertige Exposé in einem neuen Fenster – dort „Als PDF sichern“.</p>
          <div class="ex-social"><button type="button" class="btn" id="ex-story"><b>Insta-Story</b><small>4 Bilder · 1080 × 1920</small></button><button type="button" class="btn" id="ex-ad"><b>Werbeanzeige</b><small>1 Bild · 1080 × 1350</small></button></div>
          <div class="ex-mehr">${prop ? html`<a class="lnk small" href="#/objekte/${prop.id}">⌂ Objekt „${prop.titel}“ öffnen →</a>` : html`<button type="button" class="btn small" id="ex-objekt">⌂ Als Objekt im CRM anlegen</button>`}<button type="button" class="btn ghost small" id="ex-weg">Exposé löschen</button></div></section>
      </div>
      <div class="ex-rechts"><div class="ex-vbar"><div class="seg" role="group" aria-label="Vorschau">${Object.entries(FORMATE).map(([k, [l]]) => html`<button type="button" data-fmt="${k}" class="${z.format === k ? 'on' : ''}">${l}</button>`)}</div><span class="muted small" id="ex-vinfo">wird geladen …</span></div><div class="ex-vwrap" id="ex-vwrap"><iframe id="ex-frame" title="Vorschau des Exposés" scrolling="no"></iframe></div></div>
    </div></div>`);
  const $ = q => el.querySelector(q), range = $('#ex-range'), pctIn = $('#ex-pct');
  const akt = () => db.get('exposes', p.id);
  const sichern = (patch, sofort) => { const neu = Object.assign(akt(), patch); clearTimeout(speichernT); const f = async () => { await db.save('exposes', neu); await objektPreis(neu); }; if (sofort) return f(); speichernT = setTimeout(f, 600); aktualisieren(el, neu, true); };
  const setzeProv = v => { v = Math.min(15, Math.max(0, v)); range.value = v; range.style.setProperty('--p', v / 15 * 100 + '%'); if (document.activeElement !== pctIn) pctIn.value = de(v) || '0'; if (document.activeElement !== fest) fest.value = ''; sichern({ aufschlag: v, preis_override: null }); };   // fest eingetragener Preis (aus dem alten Tool) gilt nur, bis die Provision geändert wird
  range.oninput = () => setzeProv(parseFloat(range.value) || 0);
  pctIn.oninput = () => setzeProv(zahl(pctIn.value));
  const fest = $('#ex-fest');
  // Fester Kaufpreis: erst übernehmen, wenn er plausibel ist (nicht schon beim ersten getippten Zeichen „1 €“ speichern)
  const festSetzen = endgueltig => { const v = Math.round(zahl(fest.value)), vk = +akt().objekt?.kaufpreis_partner || 0;
    fest.classList.remove('miss');
    if (!fest.value.trim()) { if (akt().preis_override) sichern({ preis_override: null }); return; }
    if (!(v > 0 && vk > 0) || v < vk * 0.5 || v > vk * 3) { if (endgueltig) { fest.classList.add('miss'); toast(`Der Kaufpreis ${eur0(v)} passt nicht zum Preis vom Verkäufer (${eur0(vk)}) – bitte prüfen`, 'err'); } return; }
    const a = Math.round((v / vk - 1) * 1000) / 10, r = Math.min(15, Math.max(0, a)); range.value = r; range.style.setProperty('--p', r / 15 * 100 + '%'); pctIn.value = de(a) || '0';
    sichern({ preis_override: v, aufschlag: a }); if (endgueltig) fest.value = v.toLocaleString('de-DE'); };
  fest.oninput = () => festSetzen(false); fest.onchange = () => festSetzen(true);
  $('#ex-rund').onchange = e => { const neu = akt(); sichern({ annahmen: { ...(neu.annahmen || {}), rundung: +e.target.value } }); };
  range.style.setProperty('--p', (p.aufschlag ?? 8) / 15 * 100 + '%');
  // Abgabepreis oben und das Feld „Preis vom Verkäufer“ unter „Objektdaten“ sind dasselbe – oben eintragen genügt
  const vkOben = $('#ex-vk'), vkUnten = el.querySelector('.ex-felder [data-k=kaufpreis_partner]');
  vkOben.oninput = () => { vkUnten.value = vkOben.value; vkUnten.dispatchEvent(new Event('input', { bubbles: true })); vkOben.classList.toggle('miss', !(zahl(vkOben.value) > 0)); };
  vkOben.onchange = () => { const v = zahl(vkOben.value); if (v > 0) vkOben.value = v.toLocaleString('de-DE', { maximumFractionDigits: 2 }); };
  vkUnten.addEventListener('input', () => { if (document.activeElement !== vkOben) vkOben.value = vkUnten.value; });
  vkOben.classList.toggle('miss', !(+o.kaufpreis_partner > 0));
  el.querySelectorAll('.ex-felder [data-k]').forEach(f => f.addEventListener('input', () => {
    const neu = akt(), k = f.dataset.k, t = f.dataset.t; neu.objekt = { ...neu.objekt }; neu.annahmen = { ...(neu.annahmen || {}) };
    if (t === 'annahme') { const v = f.value.trim() === '' ? NaN : zahl(f.value); if (isNaN(v) || v < 0 || v > 100) delete neu.annahmen[k]; else neu.annahmen[k] = v; }
    else if (t === 'root') neu[k] = f.value.trim();
    else neu.objekt[k] = t === 'text' ? f.value.trim() : t === 'bool' ? f.value === 'true' : t === 'wahl' ? f.value : zahl(f.value);
    if (k === 'restnutzungsdauer') neu.objekt[k] = Math.round(neu.objekt[k]);
    let fix;   // neuer Verkäufer-Preis: ein fest eingetragener Kaufpreis gilt nicht mehr, es zählt wieder Verkäufer-Preis + Provision
    if (k === 'kaufpreis_partner' && neu.preis_override) { fix = null; fest.value = ''; pctIn.value = de(Math.min(15, Math.max(0, neu.aufschlag ?? 8))) || '0'; }
    if (k === 'strasse' || k === 'ort') { neu.name = `${neu.objekt.strasse || ''} ${neu.objekt.ort || ''}`.trim() || neu.name; el.querySelector('.ex-kopft h1').textContent = neu.name; }
    if (k === 'vermietung_status' && neu.pages) {      // Texte passend neu schreiben, eigene Zahlen behalten
      try { const r = parse(neu.pages, (neu.images || []).map(i => ({ ...i })), f.value); neu.texte = r.texte; neu.objekt.vermietung = r.objekt.vermietung; } catch { /* Texte bleiben */ }
    }
    sichern({ objekt: neu.objekt, annahmen: neu.annahmen, name: neu.name, texte: neu.texte, story_titel: neu.story_titel || '', ...(fix === null ? { preis_override: null, aufschlag: Math.min(15, Math.max(0, neu.aufschlag ?? 8)) } : {}) });
  }));
  $('#ex-go').onclick = async () => {
    const cur = akt(); if (fehlend(cur).length) { $('#ex-daten').open = true; return toast('Bitte erst die rot markierten Werte ergänzen', 'err'); }
    const fehler = kontrolle(cur, einstellungen()); if (fehler.length) return toast('Die Rechnung ist nicht stimmig – PDF wird nicht erstellt: ' + fehler[0], 'err');
    try { const vd = $('#ex-frame').contentDocument, voll = z.format === 'expose' && vd ? einpassen(vd) : []; if (voll.length) toast(`Achtung: Seite ${voll.join(', ')} ist zu voll, dort wird Text abgeschnitten – bitte Texte kürzen`, 'err'); } catch { /* Vorschau nicht offen */ }
    // Druckansicht ist eine eigene Seite (crm/expose/druck.html); sie holt sich die fertigen Seiten aus diesem Fenster
    await bilderVon(cur);
    let fertig = ''; try { const h = $('#ex-frame').contentDocument?.querySelector('.cover-hero'), r = h?.getBoundingClientRect(); fertig = await titelbildFertig(cur, r && r.width > 0 ? r.height / r.width : 0); } catch { /* dann wie in der Vorschau */ }
    window.__exposeDruck = { titel: pdfName(cur), html: seitenHtml({ ...cur, titelFertig: fertig }) };
    const w = window.open(BASIS + 'druck.html', '_blank'); if (!w) return toast('Das Fenster wurde blockiert – bitte Pop-ups für das CRM erlauben', 'err');
    const c = berechne(cur, einstellungen()); clearTimeout(speichernT);
    await db.save('exposes', Object.assign(akt(), { pdfDatum: today(), pdfKaufpreis: c.kp, pdfAufschlag: cur.aufschlag })); haptik('erfolg');
  };
  $('#ex-weg').onclick = () => loeschen(akt());
  for (const [id, f] of [['#ex-story', 'story'], ['#ex-ad', 'ad']]) $(id).onclick = () => { const cur = akt(); if (fehlend(cur).length) { $('#ex-daten').open = true; return toast('Bitte erst die rot markierten Werte ergänzen', 'err'); } socialSpeichern(cur, f, $(id)); };
  el.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => { z.format = b.dataset.fmt; el.querySelectorAll('[data-fmt]').forEach(x => x.classList.toggle('on', x === b)); const fr = $('#ex-frame'); fr.removeAttribute('srcdoc'); fr.dataset.fmt = ''; vorschau(el, akt()); });
  const ob = $('#ex-objekt'); if (ob) ob.onclick = () => objektAnlegen(akt());
  $('#ex-bilder').addEventListener('toggle', () => zeigeBilder(el, akt()));
  window.addEventListener('resize', skalieren);
  aktualisieren(el, p, true);
}

/** Kaufpreis des Exposés an das verknüpfte Objekt weitergeben (nur wenn dieses Exposé das Haupt-Exposé des Objekts ist) */
async function objektPreis(p) {
  const pr = p.propertyId && db.get('properties', p.propertyId); if (!pr || fehlend(p).length) return;
  if (pr.exposeId && pr.exposeId !== p.id) return;
  const kp = berechne(p, einstellungen()).kp; if (kp && Number(pr.preis) !== kp) await db.save('properties', { ...pr, preis: kp, exposeId: pr.exposeId || p.id });
}

/** Zahlen, Markierungen und Vorschau auf den Stand von p bringen (ohne die Eingabefelder neu aufzubauen) */
function aktualisieren(el, p, mitVorschau) {
  if (!p) return;
  const s = einstellungen(), miss = fehlend(p), ok = !miss.length, c = berechne(p, s);
  const zl = el.querySelector('#ex-zahlen'); if (!zl) return;
  const z2 = (l, v, cls = '') => `<div class="${cls}"><span>${l}</span><b>${v}</b></div>`;
  zl.innerHTML = z2('Preis vom Verkäufer', ok ? eur0(c.basis) : '–') + z2('Dein Kaufpreis', ok ? eur0(c.kp) : '–', 'haupt') + z2('Deine Provision', ok ? '+ ' + eur0(c.marge) : '–', 'gold')
    + z2('Brutto-Rendite', ok ? pct(c.rendite) : '–') + z2('Cashflow vor Steuern', ok ? sgn(c.vorSt, eur2) : '–', ok ? (c.vorSt < 0 ? 'neg' : 'pos') : '') + z2('Cashflow nach Steuern', ok ? sgn(c.nachSt, eur2) : '–', ok ? (c.nachSt < 0 ? 'neg' : 'pos') : '');
  const rw = el.querySelector('#ex-rweg'); if (rw) rw.textContent = !ok ? '' : c.fest ? `Kaufpreis fest eingetragen: ${eur0(c.kp)} – das sind ${pct(c.aufschlagEcht, 1)} auf den Preis vom Verkäufer.`
    : `${eur0(c.basis)} + ${de(p.aufschlag || 0) || '0'} % = ${eur0(c.basis * (1 + (+p.aufschlag || 0) / 100))}${c.rundung > 1 ? `, gerundet auf ${c.rundung.toLocaleString('de-DE')} € = ${eur0(c.kp)}` : ''}${Math.abs(c.aufschlagEcht - (+p.aufschlag || 0)) >= 0.05 ? ` (tatsächlich ${pct(c.aufschlagEcht, 1)})` : ''}`;
  const pf = el.querySelector('#ex-pruef'); if (pf) { const F = ok ? kontrolle(p, s) : []; pf.className = 'ex-pruef small ' + (!ok ? '' : F.length ? 'warn' : 'ok'); pf.textContent = !ok ? '' : F.length ? '⚠ Rechnung nicht stimmig: ' + F[0] : '✓ Rechnung doppelt geprüft – alle Zeilen und Summen stimmen'; }
  el.querySelectorAll('.ex-felder input[data-k]').forEach(i => i.classList.toggle('miss', miss.includes(i.dataset.k)));
  const st = el.querySelector('#ex-dst'); st.textContent = ok ? '✓ vollständig' : `${miss.length} Wert${miss.length === 1 ? '' : 'e'} fehl${miss.length === 1 ? 't' : 'en'}`; st.className = 'ex-st ' + (ok ? 'ok' : 'warn');
  const go = el.querySelector('#ex-go'); go.textContent = p.pdfDatum ? 'Exposé neu als PDF erstellen' : 'Exposé als PDF erstellen';
  el.querySelector('#ex-goh').textContent = p.pdfDatum ? `Zuletzt erstellt am ${fmtDate(p.pdfDatum)}${p.pdfKaufpreis ? ' · ' + eur0(p.pdfKaufpreis) : ''}${p.pdfAufschlag != null ? ' · ' + de(p.pdfAufschlag) + ' % Provision' : ''}.` : 'Öffnet das fertige Exposé in einem neuen Fenster – dort „Als PDF sichern“.';
  if (mitVorschau) { clearTimeout(vorschauT); vorschauT = setTimeout(() => vorschau(el, p), 180); }
}

async function vorschau(el, p) {
  const fr = el.querySelector('#ex-frame'); if (!fr || z.id !== p.id) return;
  await bilderVon(p);
  const f = z.format, breite = FORMATE[f][1];
  const info = el.querySelector('#ex-vinfo'), fertig = () => { try { const d = fr.contentDocument, n = d.querySelectorAll('.page, .story, .ad').length; fr.style.width = breite + 'px'; fr.style.height = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight) + 'px';
    const voll = f === 'expose' ? einpassen(d) : [];
    if (info) { info.textContent = (f === 'expose' ? `${n} Seiten` : f === 'story' ? `${n} Story-Bilder` : 'Anzeige 4:5') + ` · ${de(p.aufschlag || 0) || '0'} % Provision` + (voll.length ? ` · ⚠ Seite ${voll.join(', ')} ist zu voll – Text kürzen` : ''); info.classList.toggle('warn', !!voll.length); } skalieren(); } catch { /* Rahmen weg */ } };
  if (fr.dataset.fmt === f && fr.contentDocument?.querySelector('#out')) { fr.contentDocument.getElementById('out').innerHTML = seitenHtml(p, f); fertig(); setTimeout(fertig, 400); }
  else { fr.dataset.fmt = f; fr.onload = () => { fertig(); setTimeout(fertig, 500); setTimeout(fertig, 1500); }; fr.srcdoc = dokument(p, f); }
}
function skalieren() {
  const w = z.el?.querySelector('#ex-vwrap'), fr = z.el?.querySelector('#ex-frame'); if (!w || !fr) return window.removeEventListener('resize', skalieren);
  const breite = FORMATE[z.format][1], max = z.format === 'expose' ? 794 : 560; w.style.maxWidth = max + 'px';
  const s = Math.min(1, w.clientWidth / breite); fr.style.transform = `scale(${s})`; w.style.height = (parseFloat(fr.style.height) || 1123) * s + 'px';
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
