// Partner-Exposé (PDF) im Browser auslesen: Text je Seite + eingebettete Fotos/Grundrisse.
// Entspricht extract_pdf() des bisherigen Exposé-Tools (dort PyMuPDF + Pillow, hier pdf.js + Canvas).
import { seitenZeilen } from './zeilen.js';

let pdfjsP = null;
async function pdfjs() {
  if (!pdfjsP) pdfjsP = import('../../vendor/pdfjs/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href; return m; });
  return pdfjsP;
}
const leinwand = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const klein = (src, w, h) => { const c = leinwand(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };

/** Fotos von Grafiken unterscheiden (einfarbige Flächen, Strichzeichnungen, extreme Banner) */
export function istFoto(c) {
  const w = c.width, h = c.height; if (w / h > 3.2 || h / w > 3.2) return false;
  const d = klein(c, 64, 64), px = []; let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) { px.push([d[i], d[i + 1], d[i + 2]]); const l = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]); if (l < lo) lo = l; if (l > hi) hi = l; }
  // Median-Cut auf 8 Farben: dominiert eine Farbe (> 72 %), ist es eine Grafik/Fläche
  let boxen = [px];
  while (boxen.length < 8) {
    let bi = -1, bs = 0, bk = 0;
    boxen.forEach((b, i) => { if (b.length < 2) return; for (let k = 0; k < 3; k++) { let mn = 255, mx = 0; for (const p of b) { if (p[k] < mn) mn = p[k]; if (p[k] > mx) mx = p[k]; } if ((mx - mn) * Math.sqrt(b.length) > bs) { bs = (mx - mn) * Math.sqrt(b.length); bi = i; bk = k; } } });
    if (bi < 0 || bs === 0) break;
    const b = boxen[bi].sort((p, q) => p[bk] - q[bk]), mitte = b[b.length >> 1][bk];
    let cut = b.findIndex(p => p[bk] >= mitte); if (cut <= 0) cut = b.findIndex(p => p[bk] > mitte); if (cut <= 0) cut = b.length >> 1;
    boxen.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  if (Math.max(...boxen.map(b => b.length)) / 4096 > 0.72) return false;
  return hi - lo > 40;
}
/** 'plan' (Grundriss), 'karte' (Lagekarte) oder 'foto' – helle Flächen + schwarze Linien = Plan, Pastell ohne Schwarz = Karte */
export function bildArt(c) {
  const d = klein(c, 96, 96), n = d.length / 4; let hell = 0, dunkel = 0, pastell = 0;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), v = mx, s = mx ? (mx - mn) / mx * 255 : 0;
    if (v > 225 && s < 30) hell++; if (v < 90) dunkel++; if (v > 215 && s > 12 && s < 60) pastell++;
  }
  hell /= n; dunkel /= n; pastell /= n;
  if (hell > 0.5) return dunkel < 0.01 && pastell > 0.08 ? 'karte' : 'plan';
  return pastell > 0.55 ? 'karte' : 'foto';
}
/** Grundrisse haben oft unten ein Schriftfeld (Logo, Kontakt des Partners) – an der durchgehenden Linie abschneiden */
export function schriftfeldWeg(c) {
  const w = c.width, h = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const grau = (x, y) => { const i = (y * w + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
  const zeile = y => { let n = 0; for (let x = 0; x < w; x += 2) if (grau(x, y) < 235) n++; return n / (w / 2); };
  for (let y = Math.floor(h * 0.66); y < Math.floor(h * 0.965); y++)
    if (zeile(y) > 0.9 && zeile(Math.max(y - 4, 0)) < 0.3 && zeile(Math.min(y + 4, h - 1)) < 0.5) { const o = leinwand(w, Math.max(y - 2, 1)); o.getContext('2d').drawImage(c, 0, 0); return o; }
  return c;
}
/** Wahrnehmungs-Hash (144 Bit als Hex): ähnliche Fotos haben fast gleiche Hashes */
export function dhash(c, n = 12) {
  const d = klein(c, n + 1, n), g = []; for (let i = 0; i < d.length; i += 4) g.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  let hex = '', nib = 0, k = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { nib = (nib << 1) | (g[y * (n + 1) + x] > g[y * (n + 1) + x + 1] ? 1 : 0); if (++k % 4 === 0) { hex += nib.toString(16); nib = 0; } }
  return hex;
}

/** Bild-Objekt aus pdf.js auf eine Leinwand bringen */
function bildLeinwand(o) {
  if (!o || !o.width || !o.height) return null;
  const c = leinwand(o.width, o.height), x = c.getContext('2d');
  if (o.bitmap) { x.drawImage(o.bitmap, 0, 0); return c; }
  if (!o.data) return null;
  const n = o.width * o.height, id = x.createImageData(o.width, o.height), t = id.data, s = o.data;
  if (s.length === n * 4) t.set(s);
  else if (s.length === n * 3) for (let i = 0, j = 0; i < n; i++, j += 3) { t[i * 4] = s[j]; t[i * 4 + 1] = s[j + 1]; t[i * 4 + 2] = s[j + 2]; t[i * 4 + 3] = 255; }
  else if (s.length === n) for (let i = 0; i < n; i++) { t[i * 4] = t[i * 4 + 1] = t[i * 4 + 2] = s[i]; t[i * 4 + 3] = 255; }
  else return null;
  x.putImageData(id, 0, 0); return c;
}
const mul = (m, t) => [m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1], m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3], m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5]];
const objHolen = (page, id) => new Promise(res => { const z = setTimeout(() => res(null), 8000); try { (id.startsWith('g_') ? page.commonObjs : page.objs).get(id, o => { clearTimeout(z); res(o); }); } catch { clearTimeout(z); res(null); } });
function verkleinert(c, max) { const s = Math.min(1, max / Math.max(c.width, c.height)); if (s >= 1) return c; const o = leinwand(c.width * s, c.height * s), x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, o.width, o.height); return o; }

/** PDF (ArrayBuffer) auslesen → { pages: [Text je Seite], images: [{id, page, w, h, heading, plan, karte, dhash, dataUrl}], seiten }.
 *  melde(text) wird für die Fortschrittsanzeige aufgerufen. */
export async function pdfLesen(buffer, melde = () => {}) {
  const lib = await pdfjs();
  let doc;
  try { doc = await lib.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise; }
  catch (e) { throw new Error(/password/i.test(e?.name + e?.message) ? 'Die PDF ist passwortgeschützt – bitte eine ungeschützte Version verwenden.' : 'Die PDF konnte nicht gelesen werden (beschädigt oder kein echtes PDF).'); }
  const n = doc.numPages, pages = [], images = [], seen = new Set(), OPS = lib.OPS;
  for (let pno = 1; pno <= n; pno++) {
    melde(`Seite ${pno} von ${n} wird gelesen …`);
    const page = await doc.getPage(pno), text = seitenZeilen((await page.getTextContent()).items);
    pages.push(text);
    // Deckblatt & Rückseite des Partners enthalten nur Branding-Grafiken
    if ((pno === 1 && n > 2) || (pno === n && n > 2 && text.trim().length < 60)) continue;
    const ops = await page.getOperatorList(), stapel = []; let ctm = [1, 0, 0, 1, 0, 0];
    const istEnergie = text.toLowerCase().slice(0, 200).includes('energieausweis');
    const heading = (text.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('Exposé |')) || '').slice(0, 80);
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === OPS.save) stapel.push(ctm); else if (fn === OPS.restore) ctm = stapel.pop() || ctm; else if (fn === OPS.transform) ctm = mul(ctm, a);
      if (fn !== OPS.paintImageXObject && fn !== OPS.paintInlineImageXObject) continue;
      let o = null;
      if (fn === OPS.paintImageXObject) { const id = a[0]; if (seen.has(id)) continue; seen.add(id); o = await objHolen(page, id); } else o = a[0];
      if (!o || o.width < 350 || o.height < 250) continue;      // Logos, Icons
      let c = bildLeinwand(o); if (!c || !istFoto(c)) continue;  // Flächen, Strichgrafiken, Banner
      if (istEnergie) {
        // Werte liegen als Text über dem Formularbild → Ausschnitt der Seite rendern (ohne Kopf/Fuß des Partners)
        try {
          const sc = 170 / 72, vp = page.getViewport({ scale: sc }), full = leinwand(vp.width, vp.height);
          await page.render({ canvasContext: full.getContext('2d'), viewport: vp }).promise;
          const ecken = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => vp.convertToViewportPoint(ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]));
          const x0 = Math.max(0, Math.min(...ecken.map(e => e[0]))), y0 = Math.max(0, Math.min(...ecken.map(e => e[1]))), x1 = Math.min(vp.width, Math.max(...ecken.map(e => e[0]))), y1 = Math.min(vp.height, Math.max(...ecken.map(e => e[1])));
          if (x1 - x0 > 100 && y1 - y0 > 100) { const aus = leinwand(x1 - x0, y1 - y0); aus.getContext('2d').drawImage(full, x0, y0, x1 - x0, y1 - y0, 0, 0, aus.width, aus.height); c = aus; }
        } catch { /* Originalbild behalten */ }
      }
      const art = bildArt(c); if (art === 'plan') c = schriftfeldWeg(c);
      c = verkleinert(c, 1600);
      const id = 'i' + String(images.length + 1).padStart(2, '0');
      images.push({ id, page: pno, w: c.width, h: c.height, heading, plan: art === 'plan', karte: art === 'karte', dhash: dhash(c), dataUrl: c.toDataURL('image/jpeg', 0.85) });
    }
    page.cleanup();
  }
  await doc.destroy().catch(() => {});
  return { pages, images, seiten: n };
}
