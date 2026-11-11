/* Mietvertrag als PDF – Text nach der Vorlage „Mietvertrag für Wohnraum“ (§ 1–§ 20),
   Gestaltung nach der Vertriebsübersicht (dunkelblaues Band, Goldlinie, helle Karten).
   Läuft vollständig im Browser; Bibliotheken werden erst beim ersten Vertrag geladen. */
import { AUSST, gesamt, ibanSchoen, schluesselListe } from './mvfelder.js';

let LIBS = null;
async function laden() {
  if (LIBS) return LIBS;
  const P = await import('./vendor/pdf-lib.esm.min.js');
  if (!self.fontkit) {
    await new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = new URL('./vendor/fontkit.umd.min.js', import.meta.url).href;
      s.onload = res; s.onerror = () => rej(new Error('Die Schrift-Bibliothek konnte nicht geladen werden. Bitte Verbindung prüfen.')); document.head.append(s);
    });
  }
  const hol = async (p) => { const r = await fetch(new URL(p, import.meta.url), { cache: 'force-cache' }); if (!r.ok) throw new Error(`Datei ${p} fehlt (${r.status}).`); return r.arrayBuffer(); };
  const [reg, semi, logo, logoD] = await Promise.all([hol('./vendor/fonts/Inter-Regular.ttf'), hol('./vendor/fonts/Inter-SemiBold.ttf'), hol('./logo-weiss.png'), hol('./logo-dunkel.png')]);
  LIBS = { P, reg, semi, logo, logoD };
  return LIBS;
}

/* ---------- Formatierung ---------- */
const LEER = '____________________';
const eur = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? '' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const qm = (v) => (v === '' || v == null ? '' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const datum = (iso) => { if (!iso) return ''; const d = new Date(typeof iso === 'number' ? iso : iso + 'T12:00:00'); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const sauber = (t) => String(t ?? '').replace(/\r/g, '').replace(/\t/g, ' ').replace(/[\u0000-\u0008\u000b-\u001f]/g, '');
const oder = (v, leer = LEER) => (v === '' || v == null ? leer : String(v));

/* ---------- Farben (aus der Vertriebsübersicht) ---------- */
const hex = (P, h) => P.rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const A4 = [595.28, 841.89];

/** Bild auf das Seitenformat zuschneiden (wie object-fit: cover) und als JPEG liefern */
async function zuschnitt(src, w, h) {
  const img = new Image(); img.decoding = 'async'; img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
  const s = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight), iw = img.naturalWidth * s, ih = img.naturalHeight * s;
  const g = c.getContext('2d'); g.fillStyle = '#2c3e50'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, (c.width - iw) / 2, (c.height - ih) / 2, iw, ih);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * @param d  Vertragsdaten aus mvfelder.vertragsdaten()
 * @param x  Zusatz: { titel, lage, ort, bild (data-URL), unterlagen: [{l, st, txt}], erstellt }
 * @returns Uint8Array (PDF)
 */
export async function vertragPdf(d, x = {}) {
  const { P, reg, semi, logo, logoD } = await laden();
  const pdf = await P.PDFDocument.create();
  pdf.registerFontkit(self.fontkit);
  const R = await pdf.embedFont(reg, { subset: true }), B = await pdf.embedFont(semi, { subset: true });
  const LOGO = await pdf.embedPng(logo), LOGOD = await pdf.embedPng(logoD);
  const C = { navy: hex(P, '#2c3e50'), gold: hex(P, '#c39a57'), goldHell: hex(P, '#e3cfa6'), karte: hex(P, '#f6f5f1'), goldKachel: hex(P, '#f4ead8'), linie: hex(P, '#e2ddd2'), ink: hex(P, '#1f2730'), grau: hex(P, '#6b7480'), weiss: P.rgb(1, 1, 1), gruen: hex(P, '#3f8f5c'), rot: hex(P, '#b5534a'), hellgrau: hex(P, '#c9ced4') };
  const ML = 62, W = A4[0] - ML * 2, UNTEN = 74;
  const objZeile = [d.adresse, d.geschoss].filter(Boolean).join(' · ');
  const mieterNamen = [d.vname, d.vname2].filter(Boolean);
  const seiten = [];

  /* ---------- Grundbausteine ---------- */
  const t = (p, s, xx, yy, o = {}) => p.drawText(sauber(s), { x: xx, y: yy, size: o.size ?? 9.5, font: o.font ?? R, color: o.color ?? C.ink });
  const breite = (s, font = R, size = 9.5) => font.widthOfTextAtSize(sauber(s), size);
  const passend = (s, font, size, max) => { let z = size; while (z > 6 && breite(s, font, z) > max) z -= 0.25; return z; };
  const kuerzen = (s, font, size, max) => { s = sauber(s); if (breite(s, font, size) <= max) return s; while (s.length > 1 && breite(s + '…', font, size) > max) s = s.slice(0, -1); return s + '…'; };
  const rund = (p, xx, yy, w, h, r, o) => p.drawSvgPath(`M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`, { x: xx, y: yy + h, ...o });

  /* ---------- Fließtext mit Umbruch und Seitenwechsel ---------- */
  const S = { p: null, y: 0 };
  function kopfVertrag(p) {
    const lh = 24, lw = lh * LOGOD.width / LOGOD.height; p.drawImage(LOGOD, { x: ML, y: A4[1] - 50, width: lw, height: lh });
    const z1 = 'Mietvertrag für Wohnraum', z2 = kuerzen(objZeile, R, 8, 300);
    t(p, z1, A4[0] - ML - breite(z1, B, 8.5), A4[1] - 34, { font: B, size: 8.5, color: C.navy });
    t(p, z2, A4[0] - ML - breite(z2, R, 8), A4[1] - 46, { size: 8, color: C.grau });
    p.drawRectangle({ x: ML, y: A4[1] - 60, width: W, height: 1.2, color: C.gold });
  }
  function neueSeite() { S.p = pdf.addPage(A4); seiten.push(S.p); kopfVertrag(S.p); S.y = A4[1] - 84; }
  const platz = (h) => { if (!S.p || S.y - h < UNTEN) neueSeite(); };

  function umbruch(runs, size, max) {
    const tok = [];
    for (const r of runs) {
      if (r.box !== undefined) { tok.push({ box: true, on: !!r.box, w: size * 0.78 + 4 }); continue; }
      if (r.gap) { tok.push({ gap: true, w: r.gap }); continue; }
      for (const teil of sauber(r.t).split(/(\n|[ ]+)/)) {
        if (!teil) continue;
        if (teil === '\n') tok.push({ br: true });
        else if (/^ +$/.test(teil)) tok.push({ sp: true });
        else { const font = r.b ? B : R; tok.push({ t: teil, font, w: breite(teil, font, size), farbe: r.farbe }); }
      }
    }
    const zeilen = []; let z = [], zw = 0, leer = false; const spw = breite(' ', R, size);
    const raus = () => { zeilen.push(z); z = []; zw = 0; leer = false; };
    for (const k of tok) {
      if (k.br) { raus(); continue; }
      if (k.sp) { if (z.length) leer = true; continue; }
      if (k.gap) { if (z.length) { z.push({ sp: true, w: k.w, fest: true }); zw += k.w; } leer = false; continue; }
      const extra = (leer ? spw : 0) + k.w;
      if (zw + extra > max && z.length) { raus(); }
      if (!k.box && k.w > max) { // sehr langes Wort (z. B. Link) zeichenweise trennen
        let rest = k.t; while (rest) { let n = rest.length; while (n > 1 && breite(rest.slice(0, n), k.font, size) > max - zw) n--; z.push({ ...k, t: rest.slice(0, n), w: breite(rest.slice(0, n), k.font, size) }); rest = rest.slice(n); if (rest) raus(); else zw += breite(z.at(-1).t, k.font, size); }
        continue;
      }
      if (leer && z.length) { z.push({ sp: true, w: spw }); zw += spw; }
      z.push(k); zw += k.w; leer = false;
    }
    if (z.length) zeilen.push(z);
    return zeilen;
  }
  function zeichneZeile(p, z, xx, base, size, farbe, block = 0) {
    // Blocksatz: Restbreite auf die Wortabstände verteilen (nicht bei letzter Zeile oder zu großen Lücken)
    const luecken = z.filter((k) => k.sp).length, zw = z.reduce((a, k) => a + k.w, 0);
    const extra = block && luecken ? (block - zw) / luecken : 0, nutzen = extra > 0 && extra < size * 0.9;
    let cx = xx;
    for (const k of z) {
      if (k.sp) { cx += k.w + (nutzen && !k.fest ? extra : 0); continue; }
      if (k.box) {
        const b = size * 0.78; cx += 1.5; p.drawRectangle({ x: cx, y: base - 1, width: b, height: b, borderColor: C.ink, borderWidth: 0.7, color: k.on ? C.goldKachel : undefined });
        if (k.on) { p.drawLine({ start: { x: cx + 1.6, y: base + 0.6 }, end: { x: cx + b - 1.6, y: base - 1 + b - 1.6 }, thickness: 1, color: C.navy }); p.drawLine({ start: { x: cx + 1.6, y: base - 1 + b - 1.6 }, end: { x: cx + b - 1.6, y: base + 0.6 }, thickness: 1, color: C.navy }); }
        cx += k.w - 1.5; continue;
      }
      t(p, k.t, cx, base, { font: k.font, size, color: k.farbe ?? farbe }); cx += k.w;
    }
  }
  function absatz(runs, o = {}) {
    const size = o.size ?? 9.6, lh = size * (o.lh ?? 1.45), xx = ML + (o.einzug ?? 0), max = (o.breite ?? W) - (o.einzug ?? 0);
    const zeilen = umbruch(runs, size, max), block = o.block !== false && !runs.some((r) => r.box !== undefined || r.gap);
    if (o.zusammen || zeilen.length <= 3) platz(zeilen.length * lh + 2);
    else {
      const passt = Math.floor((S.y - UNTEN) / lh);
      if (passt < 2) neueSeite();
      else if (zeilen.length - passt === 1) zeilen.splice(passt - 1, 0, null); // keine einzelne Zeile auf der neuen Seite
    }
    zeilen.forEach((z, i) => {
      if (z === null) { neueSeite(); return; }
      platz(lh);
      const letzte = i === zeilen.length - 1 || zeilen[i + 1] === null;
      zeichneZeile(S.p, z, xx, S.y - size * 0.8, size, o.farbe ?? C.ink, block && !letzte ? max : 0); S.y -= lh;
    });
    S.y -= o.nach ?? 6;
  }
  const A = (s) => absatz([{ t: s }]);
  /** Zeile mit Beschriftung links (für Ankreuz-Angaben in § 1) */
  function reihe(label, runs) {
    platz(17); t(S.p, label, ML, S.y - 9.6 * 0.8, { size: 9.6, color: C.grau });
    absatz(runs, { einzug: 118, block: false, nach: 5 });
  }
  /** Kleine Tabelle in heller Karte: [[Bezeichnung, Wert, fett?]] – Werte rechtsbündig */
  function tabelle(zeilen, o = {}) {
    const zh = 17, h = zeilen.length * zh + 12, w = o.breite ?? W * 0.62, x0 = ML + (o.einzug ?? 0);
    platz(h + 8); S.y -= 2;
    rund(S.p, x0, S.y - h, w, h, 5, { color: C.karte, borderColor: C.linie, borderWidth: 0.7 });
    zeilen.forEach(([l, v, fett], i) => {
      const y = S.y - 8 - (i + 1) * zh + 5;
      if (fett) { S.p.drawLine({ start: { x: x0 + 10, y: y + zh - 3 }, end: { x: x0 + w - 10, y: y + zh - 3 }, thickness: 0.8, color: C.gold }); }
      t(S.p, l, x0 + 12, y, { size: 9.3, font: fett ? B : R, color: fett ? C.navy : C.ink });
      const vv = sauber(v); t(S.p, vv, x0 + w - 12 - breite(vv, fett ? B : B, fett ? 10 : 9.3), y, { size: fett ? 10 : 9.3, font: B, color: fett ? C.navy : C.ink });
    });
    S.y -= h + 10;
  }
  function para(nr, titel) {
    platz(78); S.y -= 12;
    t(S.p, `§ ${nr}`, ML, S.y - 10, { font: B, size: 11, color: C.gold });
    t(S.p, titel, ML + 38, S.y - 10, { font: B, size: 11, color: C.navy });
    S.y -= 24;
  }
  /** Formularfeld: Wert über einer Linie, darunter klein die Beschriftung */
  function feld(p, xx, yy, w, wert, cap) {
    const v = sauber(wert); const z = v ? passend(v, B, 10, w - 2) : 10;
    if (v) t(p, v, xx + 1, yy, { font: B, size: z });
    p.drawLine({ start: { x: xx, y: yy - 4 }, end: { x: xx + w, y: yy - 4 }, thickness: 0.6, color: C.hellgrau });
    if (cap) t(p, cap, xx + 1, yy - 12.5, { size: 7, color: C.grau });
  }
  /** Unterschriftsblock: Ort/Datum und Unterschrift, mehrere Blöcke nebeneinander */
  function unterschriften(liste, ort) {
    const spalten = 2, bw = (W - 30) / 2, bh = 92;
    for (let i = 0; i < liste.length; i += spalten) {
      platz(bh + 10);
      liste.slice(i, i + spalten).forEach((rolle, j) => {
        const x0 = ML + j * (bw + 30);
        feld(S.p, x0, S.y - 26, bw, ort, 'Ort, Datum');
        S.p.drawLine({ start: { x: x0, y: S.y - 74 }, end: { x: x0 + bw, y: S.y - 74 }, thickness: 0.8, color: C.ink });
        t(S.p, kuerzen(rolle, R, 7.5, bw), x0 + 1, S.y - 84, { size: 7.5, color: C.grau });
      });
      S.y -= bh + 8;
    }
  }
  function zustimmung(text) {
    platz(44); S.y -= 20;
    t(S.p, text, ML, S.y, { font: B, size: 9 });
    const xx = ML + breite(text, B, 9) + 14;
    t(S.p, 'X', xx, S.y, { font: B, size: 10, color: C.navy });
    S.p.drawLine({ start: { x: xx + 12, y: S.y - 3 }, end: { x: ML + W - 46, y: S.y - 3 }, thickness: 0.6, color: C.hellgrau });
    t(S.p, '(Mieter)', ML + W - 40, S.y, { size: 8.5, color: C.grau });
    S.y -= 18;
  }

  /* ===================== Deckblatt (Übersicht) ===================== */
  if (d.deckblatt) {
    const p = pdf.addPage(A4); seiten.push(p);
    const M = 36, BW = A4[0] - 2 * M, top = A4[1];
    p.drawRectangle({ x: 0, y: top - 150, width: A4[0], height: 150, color: C.navy });
    p.drawRectangle({ x: 0, y: top - 153, width: A4[0], height: 3, color: C.gold });
    const lh = 50, lw = lh * LOGO.width / LOGO.height; p.drawImage(LOGO, { x: M, y: top - 26 - lh, width: lw, height: lh });
    // Kennzahlen rechts im Band
    const kz = [[eur(gesamt(d)) || '–', 'Monatlich gesamt'], [eur(d.kalt) || '–', 'Kaltmiete'], [datum(d.beginn) || '–', 'Mietbeginn']];
    let kx = A4[0] - M;
    for (let i = kz.length - 1; i >= 0; i--) {
      const [v, l] = kz[i], w = Math.max(breite(v, B, 15), breite(l, R, 7.5)) + 2;
      t(p, v, kx - w, top - 46, { font: B, size: 15, color: C.weiss }); t(p, l, kx - w, top - 59, { size: 7.5, color: C.goldHell });
      if (i) p.drawLine({ start: { x: kx - w - 12, y: top - 36 }, end: { x: kx - w - 12, y: top - 62 }, thickness: 0.6, color: hex(P, '#4d5f73') });
      kx -= w + 24;
    }
    t(p, `MIETVERTRAG · ÜBERSICHT · ERSTELLT ${datum(x.erstellt || Date.now())}`, M, top - 102, { font: B, size: 7.5, color: C.goldHell });
    const titel = [x.titel || d.adresse, d.geschoss].filter(Boolean).join(' · ');
    t(p, titel, M, top - 124, { font: B, size: passend(titel, B, 21, BW), color: C.weiss });
    t(p, kuerzen(`${x.ort || ''}${mieterNamen.length ? ' — Mieter: ' + mieterNamen.join(' und ') : ''}`, R, 9, BW), M, top - 139, { size: 9, color: hex(P, '#c7d0da') });

    // Karte 1: Wohnung
    let y = top - 172; const k1h = 212;
    rund(p, M, y - k1h, BW, k1h, 8, { color: C.karte, borderColor: C.linie, borderWidth: 0.8 });
    const fw = 196, fh = 130, fx = M + 10, fy = y - 10 - fh;
    let bildOk = false;
    if (x.bild) {
      try { const img = await pdf.embedJpg(await zuschnitt(x.bild, fw * 3, fh * 3)); p.drawImage(img, { x: fx, y: fy, width: fw, height: fh }); bildOk = true; } catch { bildOk = false; }
    }
    if (!bildOk) { p.drawRectangle({ x: fx, y: fy, width: fw, height: fh, color: C.navy }); const b = (x.titel || d.adresse || '?').trim()[0] || '?'; t(p, b, fx + fw / 2 - breite(b, R, 40) / 2, fy + fh / 2 - 14, { size: 40, color: C.goldHell }); }
    const tx = fx + fw + 16, tw = M + BW - 12 - tx;
    t(p, kuerzen(x.titel || d.adresse, B, 15, tw), tx, y - 30, { font: B, size: 15, color: C.navy });
    if (d.geschoss || d.seite) t(p, [d.geschoss, d.seite ? d.seite[0].toUpperCase() + d.seite.slice(1) : ''].filter(Boolean).join(' '), tx, y - 46, { size: 10, color: C.grau });
    p.drawCircle({ x: tx + 3, y: y - 61, size: 2.6, color: C.gold });
    t(p, kuerzen(d.adresse, R, 8.5, tw - 10), tx + 10, y - 64, { size: 8.5, color: C.grau });
    // Merkmale als Chips
    const chips = [d.zimmer ? `${String(d.zimmer).replace('.', ',')} Zimmer` : '', ...AUSST.filter(([k]) => d.ausst?.[k] && !['kueche', 'bad', 'flur'].includes(k)).map(([, l]) => l), d.ausst?.kueche ? 'Küche' : '', d.stp ? `${d.stp}${d.stpNr ? ' Nr. ' + d.stpNr : ''}` : ''].filter(Boolean);
    let cx = tx, cy = y - 92;
    for (const c of chips) { const w = breite(c, R, 7.5) + 14; if (cx + w > tx + tw) { cx = tx; cy -= 18; } rund(p, cx, cy - 4, w, 15, 7.5, { color: C.weiss, borderColor: C.linie, borderWidth: 0.7 }); t(p, c, cx + 7, cy + 0.5, { size: 7.5 }); cx += w + 5; }
    // Hinweis Mietbeginn / Schlüssel
    const zeilen = [`Mietbeginn: ${datum(d.beginn) || 'noch offen'}`, d.kv && Number(d.kv) > 0 ? `${d.kv} Monate gegenseitiger Kündigungsverzicht` : 'ohne Kündigungsverzicht', schluesselListe(d.schluessel).length ? `Schlüssel: ${schluesselListe(d.schluessel).map((s) => `${s.n ? s.n + '× ' : ''}${s.art}`).join(', ')}` : ''].filter(Boolean);
    let zy = cy - 26; for (const z of zeilen) { for (const zl of umbruch([{ t: z }], 8.5, tw)) { zeichneZeile(p, zl, tx, zy, 8.5, C.ink); zy -= 12; } }
    // Kacheln
    const kach = [['WOHNFLÄCHE', d.flaeche ? `${qm(d.flaeche)} m²` : '–', d.nutzflaeche ? `Nutzfläche ${qm(d.nutzflaeche)} m²` : ''], ['KALTMIETE / MON.', eur(d.kalt) || '–', d.flaeche && d.kalt ? `${(Number(d.kalt) / Number(d.flaeche)).toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} €/m²` : ''],
      ['NEBENKOSTEN', eur(d.nk) || '–', 'Vorauszahlung'], ['MONATLICH GESAMT', eur(gesamt(d)) || '–', [d.stpKosten ? `inkl. ${d.stp || 'Stellplatz'} ${eur(d.stpKosten)}` : '', d.kuecheKosten ? `Küche ${eur(d.kuecheKosten)}` : ''].filter(Boolean).join(' · ') || 'inkl. Vorauszahlung', true], ['KAUTION', eur(d.kaution) || '–', d.kalt && d.kaution ? `${(Number(d.kaution) / Number(d.kalt)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Kaltmieten` : '']];
    const ky = y - k1h + 10, kh = 50, kw = (BW - 20) / kach.length;
    rund(p, M + 10, ky, BW - 20, kh, 5, { color: C.weiss, borderColor: C.linie, borderWidth: 0.7 });
    kach.forEach(([l, v, s, hi], i) => {
      const xx = M + 10 + i * kw;
      if (hi) p.drawRectangle({ x: xx, y: ky + 0.6, width: kw, height: kh - 1.2, color: C.goldKachel });
      if (i) p.drawLine({ start: { x: xx, y: ky + 6 }, end: { x: xx, y: ky + kh - 6 }, thickness: 0.6, color: C.linie });
      t(p, l, xx + 9, ky + kh - 13, { font: B, size: 6.5, color: hi ? hex(P, '#8a6a33') : C.grau });
      t(p, v, xx + 9, ky + kh - 29, { font: B, size: passend(v, B, 13, kw - 16) });
      if (s) t(p, kuerzen(s, R, 6.8, kw - 14), xx + 9, ky + 8, { size: 6.8, color: C.grau });
    });

    // Karte 2: Vertragsparteien
    y = y - k1h - 12; const k2h = 94;
    rund(p, M, y - k2h, BW, k2h, 8, { color: C.karte, borderColor: C.linie, borderWidth: 0.8 });
    const spalte = (xx, titel2, zeilen2) => {
      t(p, titel2, xx, y - 20, { font: B, size: 7.5, color: C.gold });
      let yy = y - 37;
      zeilen2.filter(Boolean).forEach((z, i) => { t(p, kuerzen(z, i === 0 ? B : R, i === 0 ? 11 : 8.8, BW / 2 - 30), xx, yy, { font: i === 0 ? B : R, size: i === 0 ? 11 : 8.8, color: i === 0 ? C.navy : C.ink }); yy -= i === 0 ? 16 : 12.5; });
    };
    spalte(M + 16, 'VERMIETER', [d.mvName || '–', d.mvAnschrift, d.mvTel ? `Tel. ${d.mvTel}` : '', d.mvMail]);
    p.drawLine({ start: { x: M + BW / 2, y: y - 14 }, end: { x: M + BW / 2, y: y - k2h + 14 }, thickness: 0.6, color: C.linie });
    spalte(M + BW / 2 + 16, mieterNamen.length > 1 ? 'MIETER (GESAMTSCHULDNERISCH)' : 'MIETER', [mieterNamen.join(' und ') || '–', d.anschrift ? `bisher: ${d.anschrift}` : '', d.tel ? `Tel. ${d.tel}` : '', d.mail]);

    // Karte 3: Zahlung und Vertrag
    const kvz = [['Mietkonto', [d.bank, d.iban ? ibanSchoen(d.iban) : '', d.bic ? 'BIC ' + d.bic : ''].filter(Boolean).join(' · ') || '–'], ['Kündigungsverzicht', d.kv && Number(d.kv) > 0 ? `${d.kv} Monate ab Mietbeginn (gegenseitig)` : 'keiner'],
      ['Hausverwaltung', d.hv || '–'], ['Stellplatz', d.stp ? `${d.stp}${d.stpNr ? ' Nr. ' + d.stpNr : ''}${d.stpKosten ? ' · ' + eur(d.stpKosten) + ' mtl.' : ''}` : '–'], ['Arbeiten vor Einzug', d.arbWas ? `${d.arbWas}${d.arbBis ? ' (bis ' + datum(d.arbBis) + ')' : ''}` : '–']];
    y = y - k2h - 12; const k3h = 32 + kvz.length * 14 + 2;
    rund(p, M, y - k3h, BW, k3h, 8, { color: C.karte, borderColor: C.linie, borderWidth: 0.8 });
    t(p, 'ZAHLUNG UND VERTRAG', M + 16, y - 20, { font: B, size: 7.5, color: C.gold });
    kvz.forEach(([l, v], i) => { const yy = y - 37 - i * 14; t(p, l, M + 16, yy, { size: 7.5, color: C.grau }); t(p, kuerzen(v, B, 8.8, BW - 150), M + 128, yy, { font: B, size: 8.8 }); });

    // Karte 4: Unterlagen
    y = y - k3h - 12; const ul = x.unterlagen ?? [], k4h = 32 + Math.ceil(ul.length / 2) * 15 + 2;
    if (ul.length) {
      rund(p, M, y - k4h, BW, k4h, 8, { color: C.karte, borderColor: C.linie, borderWidth: 0.8 });
      t(p, 'UNTERLAGEN DES MIETERS', M + 16, y - 20, { font: B, size: 7.5, color: C.gold });
      ul.forEach((u, i) => {
        const xx = M + 16 + (i % 2) * (BW / 2), yy = y - 37 - Math.floor(i / 2) * 15, f = u.st === 'pr' ? C.gruen : u.st === 'ok' ? C.gold : u.st === 'teil' ? hex(P, '#c98a2e') : C.hellgrau;
        p.drawCircle({ x: xx + 3, y: yy + 3, size: 3.2, color: f });
        t(p, kuerzen(u.l, B, 8.2, 128), xx + 10, yy, { font: B, size: 8.2 });
        t(p, kuerzen(u.txt, R, 7.5, BW / 2 - 168), xx + 142, yy, { size: 7.5, color: u.st === 'pr' ? C.gruen : C.grau });
      });
      y = y - k4h;
    }
    t(p, 'Diese Übersicht dient der internen Ablage und ist nicht Bestandteil des Mietvertrags. Der Mietvertrag beginnt auf der nächsten Seite.', M, Math.max(y - 20, 60), { size: 7.5, color: C.grau });
  }

  /* ===================== Mietvertrag ===================== */
  neueSeite();
  t(S.p, 'Mietvertrag für Wohnraum', ML, S.y - 20, { font: B, size: 22, color: C.navy });
  t(S.p, kuerzen([d.adresse, d.geschoss, d.seite ? d.seite[0].toUpperCase() + d.seite.slice(1) : ''].filter(Boolean).join(' · '), R, 10, W), ML, S.y - 38, { size: 10, color: C.grau });
  S.y -= 64;

  // Vertragsparteien
  const partei = (wort, kopf, name, anschrift, tel, mail, rolle, name2) => {
    const reihen = name2 ? 4 : 3, h = 30 + reihen * 30;
    platz(h + 30);
    t(S.p, wort, ML, S.y - 10, { size: 9.6, color: C.grau }); S.y -= 20;
    rund(S.p, ML, S.y - h, W, h, 6, { color: C.karte, borderColor: C.linie, borderWidth: 0.7 });
    const xx = ML + 14, w = W - 28;
    t(S.p, kopf, xx, S.y - 17, { font: B, size: 7.5, color: C.gold });
    t(S.p, rolle, ML + W - 14 - breite(rolle, R, 7.5), S.y - 17, { size: 7.5, color: C.grau });
    let yy = S.y - 40;
    feld(S.p, xx, yy, w, name, 'Name, Vorname'); yy -= 30;
    if (name2) { feld(S.p, xx, yy, w, name2, '2. Mieter: Name, Vorname'); yy -= 30; }
    feld(S.p, xx, yy, w, anschrift, 'Anschrift'); yy -= 30;
    feld(S.p, xx, yy, w * 0.42, tel, 'Telefon'); feld(S.p, xx + w * 0.47, yy, w * 0.53, mail, 'E-Mail');
    S.y -= h + 8;
  };
  partei('zwischen', 'VERMIETER', d.mvName, d.mvAnschrift, d.mvTel, d.mvMail, '– nachfolgend Vermieter genannt –');
  partei('und', d.vname2 ? 'MIETER' : 'MIETER', d.vname, d.anschrift, d.tel, d.mail, '– nachfolgend Mieter genannt –', d.vname2 || '');
  S.y -= 4;
  A('wird folgender Mietvertrag für Wohnraum geschlossen:');

  // § 1
  para(1, 'Mietsache');
  A('Vermietet werden die Mieträume im Haus:');
  platz(34); S.y -= 12; feld(S.p, ML, S.y, W, d.adresse, 'Straße, Postleitzahl, Ort'); S.y -= 26;
  const seite = String(d.seite || '').toLowerCase();
  reihe('im Geschoss:', [{ t: oder(d.geschoss, '________'), b: true }, { gap: 22 }, { t: 'Links ' }, { box: seite === 'links' }, { gap: 16 }, { t: 'Rechts ' }, { box: seite === 'rechts' }, { gap: 16 }, { t: 'Mitte ' }, { box: seite === 'mitte' }]);
  const zi = Number(d.zimmer);
  if (Number.isInteger(zi) && zi >= 1 && zi <= 5) reihe('Anzahl der Zimmer:', [1, 2, 3, 4, 5].flatMap((n, i) => [...(i ? [{ gap: 16 }] : []), { t: `${n} ` }, { box: zi === n }]));
  else reihe('Anzahl der Zimmer:', [{ t: d.zimmer ? String(d.zimmer).replace('.', ',') : '____', b: true }]);
  reihe('mit:', AUSST.slice(0, 4).flatMap(([k, l], i) => [...(i ? [{ gap: 16 }] : []), { t: `${l} ` }, { box: !!d.ausst?.[k] }]));
  reihe('', AUSST.slice(4).flatMap(([k, l], i) => [...(i ? [{ gap: 16 }] : []), { t: `${l} ` }, { box: !!d.ausst?.[k] }]));
  reihe('Fahrzeug:', [{ t: 'Stellplatz ' }, { box: d.stp === 'Stellplatz' }, { gap: 16 }, { t: 'Garage ' }, { box: d.stp === 'Garage' }, { gap: 16 }, { t: 'Carport ' }, { box: d.stp === 'Carport' }, { gap: 22 }, { t: 'Nummer: ' }, { t: oder(d.stpNr, '______'), b: true }]);
  S.y -= 4;
  absatz([{ t: 'Die Wohnfläche beträgt ca. ' }, { t: d.flaeche ? qm(d.flaeche) : '______', b: true }, { t: ' Quadratmeter.' }], { nach: 2 });
  absatz([{ t: 'Die Nutzfläche beträgt ca. ' }, { t: d.nutzflaeche ? qm(d.nutzflaeche) : '______', b: true }, { t: ' Quadratmeter.' }], { nach: 9 });
  A('Die Vermietung erfolgt ausschließlich zu Wohnzwecken.');
  {
    const sl = schluesselListe(d.schluessel); while (sl.length < 4) sl.push({ n: '', art: '' });
    const reihen = Math.ceil(sl.length / 2); platz(reihen * 30 + 30);
    A('Dem Mieter werden vom Vermieter folgende Schlüssel ausgehändigt:');
    for (let r = 0; r < reihen; r++) {
      S.y -= 14;
      for (let c = 0; c < 2; c++) { const s = sl[r * 2 + c]; if (!s) continue; const xx = ML + c * (W / 2 + 6); feld(S.p, xx, S.y, 46, s.n ? `${s.n}` : '', 'Anzahl'); feld(S.p, xx + 56, S.y, W / 2 - 74, s.art, 'Art des Schlüssels'); }
      S.y -= 16;
    }
    S.y -= 8;
  }
  A('Die Beschaffung weiterer Schlüssel bedarf der Genehmigung des Vermieters. Bei Verlust oder Zerstörung von Schlüsseln zur Hauseingangstür ist der Vermieter im Interesse der Sicherheit des Hauses und der anderen Mieter berechtigt, auf Kosten des Mieters neue Schlösser mit der erforderlichen Anzahl von Schlüsseln anbringen zu lassen.');

  // § 2
  para(2, 'Mietzins und Nebenkosten');
  absatz([{ t: 'Die monatliche Kaltmiete beträgt ' }, { t: oder(eur(d.kalt), '__________ €'), b: true }, { t: '.' }]);
  A('Während des Mietverhältnisses können die Vertragsparteien eine Erhöhung der Miete vereinbaren. Der Vermieter kann nach Maßgabe der §§ 558 bis 559b BGB Zustimmung zur Mieterhöhung bis zur ortsüblichen Vergleichsmiete verlangen. Dies gilt auch bei Abschluss eines Zeitmietvertrages. Das Recht zur Mieterhöhung bei Modernisierung gemäß § 559 BGB bleibt davon unberührt.');
  absatz([{ t: 'Die Kosten für Garage / Stellplatz / Carport betragen monatlich ' }, { t: d.stpKosten ? eur(d.stpKosten) : '/ €', b: true }, { t: '.' }]);
  absatz([{ t: 'Die Kosten für Küche und Mobiliar betragen monatlich ' }, { t: d.kuecheKosten ? eur(d.kuecheKosten) : '/ €', b: true }, { t: '.' }]);
  A('Neben der Grundmiete zahlt der Mieter für die Betriebskosten gemäß Betriebskostenverordnung, soweit sie tatsächlich anfallen, insbesondere für laufende öffentliche Lasten des Grundstückes, Wasserversorgung, Entwässerung, Müllabfuhr, Straßenreinigung, Schnee und Eisbeseitigung, Schornsteinreinigung, allgemeine Stromkosten, Sach- und Haftpflichtversicherung, Hausreinigung, Ungeziefer Bekämpfung, Hauswart, Gartenpflege, Aufzug, Antenne oder und Breitband Anschluss, Wartung von Feuerlöscher und Rauchmeldern, von Klima und Lüftungsanlagen sowie der Reinigung von Dachrinnen und Abflussrohren.');
  A('Über die Betriebskosten und die Vorauszahlungen wird einmal im Jahr durch den Vermieter abgerechnet. Kommt es zu einem Mieterwechsel, so muss durch den Vermieter keine Zwischenabrechnung erstellt werden. Bei einer Erhöhung der Betriebskosten kann der Vermieter diese innerhalb des gesetzlichen Rahmens auf den Mieter umlegen und die monatlichen Vorauszahlungen anpassen.');
  absatz([{ t: 'Die monatlich mit der Miete zu entrichtende Betriebskostenvorauszahlung beträgt ' }, { t: oder(eur(d.nk), '__________ €'), b: true }, { t: '.' }]);
  absatz([{ t: 'Die insgesamt inklusive der Betriebskostenvorauszahlung zu entrichtende Miete beträgt ' }, { t: d.kalt !== '' && d.nk !== '' ? eur(gesamt(d)) : '__________ €', b: true }, { t: '.' }]);
  tabelle([['Kaltmiete', oder(eur(d.kalt), '________ €')], ['Garage / Stellplatz / Carport', d.stpKosten ? eur(d.stpKosten) : '–'], ['Küche und Mobiliar', d.kuecheKosten ? eur(d.kuecheKosten) : '–'], ['Betriebskostenvorauszahlung', oder(eur(d.nk), '________ €')], ['Monatlich gesamt', d.kalt !== '' && d.nk !== '' ? eur(gesamt(d)) : '________ €', true]]);

  // § 3
  para(3, 'Zahlung des Mietzinses und Nebenkosten');
  A('Die Zahlung des Mietzinses und der Nebenkosten hat ab Beginn der Mietzeit monatlich im Voraus zu erfolgen. Die Zahlung muss bis spätestens zum dritten Werktag des Monats auf dem im Folgenden genannten Konto des Vermieters eingehen:');
  tabelle([['Bank', oder(d.bank)], ['IBAN', d.iban ? ibanSchoen(d.iban) : LEER], ['BIC', oder(d.bic, '__________')]], { breite: W * 0.78 });
  A('Ausschlaggebend ist der Zeitpunkt, an dem die Wertstellung auf dem Konto des Vermieters zu verzeichnen ist.');
  A('Auf Verlangen des Vermieters ist die gesamte Miete durch Teilnahme am SEPA-Lastschriftverfahren während der gesamten Laufzeit des Vertrages zu zahlen. Der Mieter hat deshalb für eine ausreichende Deckung in Höhe der zu leistenden Zahlungen auf dem Konto zu sorgen. Bei nicht eingelösten Lastschriften und dadurch entstandenen Kosten werden diese dem Mieter auferlegt. Der Vermieter ist berechtigt bei verspäteter Zahlung Mahnkosten und Verzugszinsen zu erheben.');

  // § 4
  para(4, 'Mietdauer und Meldepflicht');
  const kv = Number(d.kv) || 0;
  absatz([{ t: 'Das Mietverhältnis beginnt am ' }, { t: oder(datum(d.beginn), '______________'), b: true }, { t: ' und läuft auf unbestimmte Zeit. ' },
    ...(kv > 0 ? [{ t: 'Die Parteien vereinbaren einen gegenseitigen Kündigungsausschluss für die Dauer von ' }, { t: `${kv} Monaten`, b: true }, { t: ' ab Beginn des Mietverhältnisses. Eine ordentliche Kündigung ist erstmals zum Ablauf dieses Zeitraums zulässig. Das Recht zur außerordentlichen fristlosen Kündigung aus wichtigem Grund bleibt unberührt. ' }] : []),
    { t: 'Das Kündigungsrecht bestimmt sich nach den gesetzlichen Vorschriften. Eine Kündigung muss schriftlich erfolgen.' }]);
  A('Der Mieter ist verpflichtet, innerhalb einer Woche nach Einzug seiner gesetzlichen Meldepflicht nachzukommen.');
  A('Der Vermieter haftet nicht für den Fall, dass die vermieteten Räume durch den vorherigen Mieter nicht rechtzeitig frei gemacht werden, sofern Ihn daran kein Verschulden trifft.');
  A('Die für die fristlose Kündigung durch den Vermieter geltenden gesetzlichen Bestimmungen bleiben unberührt.');

  // § 5
  para(5, 'Mietsicherheit');
  absatz([{ t: 'Der Mieter verpflichtet sich dazu, beim Vermieter zu Beginn des Mietverhältnisses eine Mietsicherheit in Höhe von ' }, { t: oder(eur(d.kaution), '__________ €'), b: true }, { t: ' zu hinterlegen.' }]);
  A('Dieses kann in Form der Hinterlegung eines Kautionssparbuchs, einer Bankbürgschaft, einer Kautionsbürgschaft, welche auf erstes Anfordern an den Vermieter gezahlt wird oder durch Überweisung an den Vermieter erfolgen. Die Mietkaution ist zinsfrei.');
  A('Bei einem Vermieterwechsel im Falle der Veräußerung des vermieteten Wohnraums stimmt der Mieter der Haftungsübernahme des Erwerbers zu, wenn dieser ihm bestätigt, dass er die Mietsicherheit erhalten hat. Der Mieter ist in diesem Fall mit der Haftungsentlassung des bisherigen Vermieters einverstanden.');

  // § 6
  para(6, 'Zustand der Mieträume');
  A('Der Mieter übernimmt die Mietsache zum Gebrauch in dem Zustand, den sie bei Übergabe hat.');
  A('Über den Zustand der Mieträume wird ein Übergabeprotokoll angefertigt. Das Übergabeprotokoll ist wesentlicher Bestandteil des Mietvertrages.');
  absatz([{ t: 'Der Vermieter verpflichtet sich, vor der Neuvermietung oder wenn das nicht möglich ist bis zum ' }, { t: d.arbBis ? datum(d.arbBis) : '/', b: true }, { t: ' folgende Arbeiten ' }, { t: d.arbWas || '/', b: true }, { t: ' in der Wohnung auf eigene Kosten durchzuführen.' }]);
  A('Gibt es zu Mietbeginn bekannte Mängel an der Mietsache, so werden diese vom Mieter als vertragsgemäß anerkannt. Eine verschuldensunabhängige Haftung des Vermieters für anfängliche Mängel wird ausgeschlossen.');

  // § 7
  para(7, 'Schönheitsreparaturen');
  A('Wird die Wohnung im renovierten oder nicht renovierungsbedürftigen Zustand an den Mieter übergeben, ist der Mieter während der Mietzeit verpflichtet, die laufenden Schönheitsreparaturen innerhalb der Wohnung fachgerecht auszuführen oder auf seine Kosten ausführen zu lassen, soweit diese durch den vertragsgemäßen Gebrauch der Mietsache erforderlich waren. In diesen Fällen ist der Vermieter auch nicht verpflichtet, selbst Schönheitsreparaturen, die durch den vertragsgemäßen Gebrauch der Mietsache durch den Mieter erforderlich waren, durchzuführen oder deren Kosten zu tragen. Hierzu gehören insbesondere das Anstreichen bzw. Tapezieren der Wände und Decken sowie der Innentüren, das Lackieren der Heizkörper und Heizrohre und der Außentüren und Fenster von innen.');
  A('Fällige Schönheitsreparaturen sind spätestens bei Mietende nachzuholen.');
  A('Die Schönheitsreparaturen sind, nach § 243 BGB, soweit erforderlich, in fachgerechter „mittlerer Art und Güte“ zu leisten und richten sich im konkreten Fall nach dem Renovierungsbedarf, d.h. je nach Zustand der Mietsache früher oder später.');

  // § 8
  para(8, 'Instandhaltung der Mietsache, Rauchwarnmelder');
  A('Der Mieter ist zu einer pfleglichen und schonenden Behandlung der Mietsache und der gemeinschaftlichen Einrichtungen und Anlagen verpflichtet. Treten Schäden am Haus und an den Mieträumen auf, so sind diese dem Vermieter unverzüglich zu melden. Entstehen durch verspätete Anzeige Folgeschäden, so haftet der Mieter.');
  A('Der Mieter hat für ordnungsgemäße Reinigung der Mieträume sowie deren ausreichende Beheizung und Belüftung sowie Schutz der Innenräume vor Frost zu sorgen. Der Mieter haftet dem Vermieter für Schäden, die durch die Verletzung seiner ihm obliegenden Obhuts-, Sorgfalts- und Anzeigepflicht schuldhaft verursacht werden.');
  A('Er haftet in gleicher Weise für Schäden, die durch seine Angehörigen, Untermieter, Arbeiter, Angestellten, Handwerker und Personen, die sich mit seinem Willen in der Wohnung aufhalten oder ihn aufsuchen, verursacht werden. Hat der Mieter oder der vorgenannte Personenkreis einen Schaden an der Mietsache verursacht, so hat er diesen unverzüglich dem Vermieter zu melden.');
  A('Der Mieter muss Schäden, für die er einstehen muss, umgehend beseitigen. Kommt er dieser Verpflichtung auch nach schriftlicher Mahnung innerhalb einer angemessenen Frist nicht nach, so kann der Vermieter die erforderlichen Arbeiten auf Kosten des Mieters vornehmen lassen. Der Mieter hat zu beweisen, dass ein Verschulden seinerseits nicht vorgelegen hat.');
  A('Der Vermieter ist berechtigt, soweit bauordnungsrechtlich zulässig, die Sicherstellung der Betriebsbereitschaft der von Ihm eingebrachten Rauchwarnmelder selbst durchzuführen oder durch einen Dritten auf Kosten des Mieters durchführen zu lassen. Die Kosten werden im Rahmen der Betriebskostenabrechnung auf den Mieter umgelegt.');

  // § 9
  para(9, 'Benutzung der Mietsache');
  A('Der Mieter darf die angemieteten Räume ausschließlich zu Wohnzwecken nutzen. Wenn der Mieter die Mieträume anderweitig nutzen möchte, so ist dies nur mit schriftlicher Einverständniserklärung des Vermieters gestattet. Es ist auch eine Zustimmung des Vermieters erforderlich, wenn der Mieter an der Mietsache Anbauten, Umbauten oder Einbauten, Installationen oder andere Änderungen vornehmen will.');
  A('Bei Beendigung des Mietverhältnisses ist der Mieter verpflichtet, Dübeleinsätze zu entfernen, Löcher ordnungsgemäß und unkenntlich zu verschließen und beschädigte Fliesen durch gleichartige zu ersetzen. Die Erlaubnis zu Veränderungen an und in den Mieträumen kann davon abhängig gemacht werden, dass der Mieter sich zur völligen oder teilweisen Wiederherstellung im Falle seines Auszugs verpflichtet.');
  A('Will der Mieter Einrichtungen, mit denen er die Mieträume versehen hat, bei Beendigung des Mietverhältnisses wegnehmen, hat er sie zunächst dem Vermieter zur Übernahme anzubieten. Wenn der Vermieter die Einrichtungen selber übernehmen will, hat er den Mieter die Herstellungskosten abzüglich eines angemessenen Betrages für die Abnutzung zu erstatten. Macht der Vermieter von diesem Recht keinen Gebrauch, so kann er vom Mieter die Wegnahme der Einrichtung und die Wiederherstellung des ursprünglichen Zustandes verlangen.');
  A('Die Parteien sind sich darüber einig, dass eine Untervermietung oder die Überlassung der Mietsache an Dritte der schriftlichen Zustimmung des Vermieters bedarf.');
  A('Die Haltung von Kleintieren ist dem Mieter ohne Zustimmung des Vermieters nur gestattet, soweit durch die Unterbringung in den Mieträumen eine Beeinträchtigung der Mietsache oder eine Belästigung von Hausbewohnern oder Nachbarn nicht gegeben ist. Die Haltung von Hunden und Katzen bedarf immer der Zustimmung des Vermieters.');

  // § 10
  para(10, 'Bagatellschäden / Kleinreparaturen / Erhaltungs- und Modernisierungsmaßnahmen');
  A('Der Mieter trägt die Kosten für Reparaturen von Bagatellschäden ohne Rücksicht auf ein Verschulden bis zu der nachfolgend angegebenen Höhe. Hierbei handelt es sich um die Instandhaltungskosten an denjenigen Einrichtungen und Gegenständen, die seinem direkten und häufigen Gebrauch unterliegen wie Heiz- und Kocheinrichtungen, Installationseinrichtungen für Wasser, Strom, Gas sowie Rollläden, Jalousien, Fensterläden und Markisen und Fenster sowie Verschlüsse von Türen.');
  A('Die Obergrenze für eine Reparatur beträgt im Einzelfall 100,- EUR inkl. MwSt., bei mehreren Kleinreparaturen maximal 300,-EUR inkl. MwSt. im Jahr, maximal aber nicht mehr als 8% der Jahresmiete ohne Nebenkosten.');
  A('Der Mieter hat gemäß § 555a BGB Maßnahmen des Vermieters, die zur Instandhaltung oder Instandsetzung der Mietsache erforderlich sind und Modernisierungsmaßnahmen nach §§ 555b bis 555e BGB zu dulden.');
  zustimmung('Zustimmung zum § 10 Bagatellschäden / Kleinreparaturen:');

  // § 11
  para(11, 'Kündigung');
  A('Es finden auf die Kündigung des Mietvertrags die Vorschriften der §§ 573 ff BGB Anwendung. Die Kündigung muss schriftlich erfolgen.');
  A('Setzt der Mieter den Gebrauch der Mietsache fort, so gilt das Mietverhältnis nicht als verlängert. Die entsprechende Vorschrift des § 545 BGB findet insoweit keine Anwendung.');

  // § 12
  para(12, 'Betreten der Mietsache durch den Vermieter');
  A('Der Vermieter oder ein vom Vermieter Beauftragter darf aus wichtigem Grund die Mietsache nach rechtzeitiger Ankündigung betreten, um unter anderem die Ablesung von Messgeräten oder Reparatur– bzw. Instandhaltungsmaßnahmen vorzunehmen oder den Zustand der Mietsache zu überprüfen.');

  // § 13
  para(13, 'Personenmehrheit als Vertragspartei');
  A('Besteht eine Mietpartei aus mehreren Personen, so haften sie gesamtschuldnerisch für alle Verpflichtungen aus dem Mietverhältnis.');
  A('Erklärungen, deren Wirkung die einzelnen Mieter aus dem Mietverhältnis berühren, müssen von und gegenüber allen abgegeben werden. Die Mieter bevollmächtigen sich jedoch - unter Vorbehalt eines schriftlichen Widerrufs – bis auf weiteres gegenseitig zur Entgegennahme oder Abgabe solcher Erklärungen. Dies gilt auch für die Entgegennahme von Kündigungen, nicht jedoch für deren Abgabe oder für den Abschluss eines Mietaufhebungsvertrages.');

  // § 14
  para(14, 'Hausordnung');
  A('Die Parteien sind sich einig darüber, dass die dem Mieter bei Abschluss des Mietvertrages übergebene Hausordnung (siehe Anlage) zum wesentlichen Bestandteil des Mietvertrags wird. Alle darin enthaltenen Verpflichtungen sind für den Mieter bindend.');

  // § 15
  para(15, 'Beendigung des Mietverhältnisses');
  A('Der Mieter hat dem Vermieter die Mietsache vollständig geräumt, gereinigt und mit sämtlichen, auch den vom Mieter beschafften Schlüsseln zu einem von beiden Parteien vereinbarten Termin zu übergeben. Über die Übergabe ist ein Protokoll zu erstellen.');
  A('Der Mieter hat dafür zu sorgen, dass bei allen in der Mietsache befindlichen Messgeräten (Warm-, Kaltwasser, Heizung etc.) eine Zwischenablesung stattgefunden hat. Der Mieter trägt die Kosten aller erforderlichen Zwischenabrechnungen und Zwischenablesungen für die Nebenkosten. Das Protokoll hierüber muss dem Vermieter bei der Übergabe der Mietsache ausgehändigt werden.');
  A('Wurde die Mietsache baulich verändert oder wurden Einrichtungen in der Mietsache errichtet, so sind diese auf Verlangen des Vermieters vom Mieter zu entfernen bzw. ist der ursprüngliche Zustand wiederherzustellen.');
  A('Wird bei der Übergabe der Mietsache ein Schaden an dieser oder den Einrichtungen festgestellt und dem Mieter trifft hierfür ein Verschulden, so ist der Mieter zum Ersatz des entstandenen Schadens abzüglich der allgemein üblichen Nutzungsdauer verpflichtet.');

  // § 16
  para(16, 'Haftung des Vermieters');
  A('Für anfängliche Mängel der Mietsache haftet der Vermieter nur bei Verschulden. Seine gesetzliche Haftung für Sachmängel nach § 536 a BGB unabhängig von einem Verschulden wird ausgeschlossen.');
  A('Kennt der Mieter den Mangel bei Vertragsschluss oder ist dem Mieter der Mangel infolge grober Fahrlässigkeit unbekannt geblieben, so haftet der Vermieter bei einem entstehenden Schaden nur dann, wenn er den Mangel arglistig verschwiegen hat.');
  A('Führt ein Mangel der Mietsache zu einer Verletzung des Lebens, des Körpers, der Gesundheit, des Eigentums oder des Vermögens des Mieters so haftet der Vermieter nur dann, wenn den Vermieter ein Verschulden trifft.');

  // § 17
  para(17, 'Außenantennen, Breitbandanschluss');
  A('Sofern der Mieter zum Betrieb eines Rundfunk- oder Fernsehgerätes eine Empfangsanlage benötigt, ist er verpflichtet, eine vorhandene gemeinschaftliche Empfangsanlage zu nutzen.');
  A('Der Mieter ist verpflichtet, für die gegebene Anschlussmöglichkeit an die gemeinschaftliche Empfangsanlage die anteiligen Betriebskosten zu zahlen. Hierzu gehören insbesondere die Kosten des Betriebsstroms, der regelmäßigen Prüfung der Betriebssicherheit, einschließlich der Einstellung durch einen Fachmann und etwaige Anschlussgebühren.');
  A('Fehlt eine gemeinschaftliche Empfangsanlage ist der Mieter nur nach vorheriger Zustimmung des Vermieters berechtigt, eine Außenantenne oder sonstige Empfangsanlage fachgerecht anbringen zu lassen.');

  // § 18
  para(18, 'Datenschutz gemäß DSGVO');
  A('Der Datenschutz regelt sich auf Grundlage der EU-Datenschutzgrundverordnung (DSGVO), die am 25. Mai 2018 in Kraft getreten ist.');
  A('Mit Abschluss dieses Mietvertrages werden die uns vom Mieter zur Anbahnung eines Mietverhältnisses übergebenen Unterlagen wie die Mieterselbstauskunft und sonstige Vertragsunterlagen bis zur vollständigen Abwicklung des Mietverhältnisses aufbewahrt.');
  A('Der Vermieter ist berechtigt, alles zu speichern, was für die Anbahnung, die Dauer und das Ende des Mietverhältnisses erforderlich ist. Dazu zählen insbesondere die Personalien, die Selbstauskünfte und die Abrechnungen. Mit der Begründung des Mietverhältnisses entsteht für den Vermieter eine Verarbeitungserlaubnis der Daten des Mieters zur Erfüllung rechtlicher Verpflichtungen im Rahmen der Begründung und Durchführung des Mietverhältnisses.');
  if (d.hv) absatz([{ t: 'Die Wohnung des Mieters befindet sich in einer Wohnanlage, die derzeit von der ' }, { t: d.hv, b: true }, { t: ' betreut wird. Für die Verwaltung der Anlage und insbesondere für die Erstellung der Betriebskostenabrechnungen, werden die dafür erforderlichen Daten des Mieters vom Vermieter an die Hausverwaltung übermittelt. Das sind insbesondere die Namen der Mieter, Mietbeginn und Mietende, Verbrauchdaten der Wärme- und Wasserversorgung, eine Telefonnummer für die Vereinbarung von Reparaturarbeiten und für Rückfragen im Zusammenhang mit dem Mietverhältnis.' }]);
  A('Der Mieter willigt ein, dass der Vermieter die zur Durchführung dieses Mietvertrages notwendigen Daten im Wege der elektronischen Datenverarbeitung speichert und dass vertrags-bedingte Daten - soweit erforderlich - an Dritte (z.B. örtliche Hausverwaltungen, Firmen, die Messdienstleistungen für Heiz- und Betriebskosten erbringen, Handwerker für Terminvereinbarungen bei Reparaturen) zum Zwecke der Betreuung der Mieter weitergegeben werden.');
  A('Die Betriebskostenabrechnung betrifft die gesamte Wohnanlage. Im Einzelfall können zur Überprüfung der Gesamtabrechnung auch personenbezogene Verbrauchsdaten des Mieters an andere Mieter übermittelt werden.');
  A('Werden im Zuge der Digitalisierung intelligente, funkbasierte Messverfahren in der Heizungs-ablesung und Wasserversorgung eingesetzt, steht dem Vermieter die Einwilligungs- oder Widerspruchsbefugnis zu.');
  A('Die Daten des Mieters werden nach Beendigung des Mietverhältnisses gelöscht, sobald die Nebenkostenabrechnungen und Kaution abgerechnet wurden, es sei denn, zwischen Mieter und Vermieter ist ein Rechtsstreit anhängig. In diesem Fall dürfen die Daten erst nach Beendigung des Rechtsstreits gelöscht werden. Ebenso können steuerliche Verpflichtungen oder andere gesetzliche Vorgaben eine weitere Speicherung rechtfertigen.');
  A('Der Mieter hat ein Auskunftsrecht über die von ihm beim Vermieter gespeicherten Daten gemäß Art. 15 DSGVO und ein Recht auf Löschung der Daten gemäß Art. 35 DSGVO.');
  zustimmung('Kenntnisnahme und Zustimmung § 18:');

  // § 19
  para(19, 'Schriftform / Salvatorische Klausel');
  A('Die Parteien sind sich ausdrücklich darüber einig, dass zu diesem Vertrag keinerlei mündliche Nebenabreden bestehen und jegliche Änderungen oder Ergänzungen der Schriftform bedürfen.');
  A('Sollten Klauseln aus diesem Vertrag nebst Anlagen unwirksam sein oder werden, so sind sich die Parteien darüber einig, dass die übrigen Klauseln aus dem Vertrag ihre Gültigkeit behalten sollen. Die unwirksame Klausel wird dann durch eine solche ersetzt, die dem wirtschaftlich gewollten Inhalt in rechtlich zulässiger Weise entspricht.');

  // § 20
  // § 20 und Unterschriften gehören auf dieselbe Seite
  const unterschriftH = Math.ceil((1 + Math.max(1, mieterNamen.length)) / 2) * 100 + 20;
  platz((String(d.vereinbarungen || '').trim() ? 40 + umbruch([{ t: String(d.vereinbarungen) }], 9.6, W).length * 14 : 4 * 22 + 10) + 50 + unterschriftH);
  para(20, 'Individuelle Vereinbarungen');
  if (String(d.vereinbarungen || '').trim()) absatz([{ t: String(d.vereinbarungen).trim(), b: false }], { nach: 10 });
  else { platz(4 * 22); for (let i = 0; i < 4; i++) { S.y -= 20; S.p.drawLine({ start: { x: ML, y: S.y }, end: { x: ML + W, y: S.y }, thickness: 0.6, color: C.hellgrau }); } S.y -= 10; }

  // Unterschriften
  S.y -= 10;
  unterschriften([`Vermieter${d.mvName ? ' – ' + d.mvName : ''}`, ...(mieterNamen.length ? mieterNamen : ['']).map((n) => `Mieter/in${n ? ' – ' + n : ''}`)], d.ort ? `${d.ort}, ` : '');

  /* ---------- Fußzeilen (auf Vertragsseiten mit Paraphen) ---------- */
  const n = seiten.length;
  seiten.forEach((p, i) => {
    const deck = i === 0 && d.deckblatt, m = deck ? 36 : ML;
    p.drawLine({ start: { x: m, y: 44 }, end: { x: A4[0] - m, y: 44 }, thickness: 0.6, color: C.linie });
    const s2 = `Seite ${i + 1} von ${n}`; t(p, s2, A4[0] - m - breite(s2, B, 7.5), 30, { size: 7.5, font: B, color: C.grau });
    if (deck) { t(p, 'Norderfranken Haus und Grund GmbH · Am Gewerbegebiet 5 · 95185 Gattendorf', m, 30, { size: 7, color: C.grau, font: B }); return; }
    t(p, kuerzen(`Mietvertrag · ${objZeile}`, R, 7, 210), m, 30, { size: 7, color: C.grau });
    const px = m + 228; t(p, 'Paraphe Vermieter', px, 30, { size: 6.5, color: C.grau }); p.drawLine({ start: { x: px + 58, y: 29 }, end: { x: px + 98, y: 29 }, thickness: 0.6, color: C.hellgrau });
    t(p, 'Mieter', px + 106, 30, { size: 6.5, color: C.grau }); p.drawLine({ start: { x: px + 128, y: 29 }, end: { x: px + 168, y: 29 }, thickness: 0.6, color: C.hellgrau });
  });

  pdf.setTitle(`Mietvertrag ${objZeile}${mieterNamen.length ? ' – ' + mieterNamen.join(' und ') : ''}`);
  pdf.setAuthor(d.mvName || 'Norderfranken Haus und Grund GmbH'); pdf.setCreator('Norderfranken Vermietung'); pdf.setProducer('Norderfranken Vermietung');
  pdf.setLanguage('de-DE');
  return pdf.save();
}
