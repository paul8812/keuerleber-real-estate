/* Mietvertrag als PDF – Text nach der Vorlage „Mietvertrag für Wohnraum“ (§ 1–§ 20),
   Gestaltung: Norderfranken-Logo oben mittig, Goldlinie, helle Karten – druckfreundlich ohne Farbflächen.
   Läuft vollständig im Browser; Bibliotheken werden erst beim ersten Vertrag geladen. */
import { AUSST, SCHLUESSEL_STD, gesamt, ibanSchoen, natuerlich, schluesselListe } from './mvfelder.js';

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
  const [reg, semi, logoD] = await Promise.all([hol('./vendor/fonts/Inter-Regular.ttf'), hol('./vendor/fonts/Inter-SemiBold.ttf'), hol('./logo-dunkel.png')]);
  LIBS = { P, reg, semi, logoD };
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
  const { P, reg, semi, logoD } = await laden();
  const pdf = await P.PDFDocument.create();
  pdf.registerFontkit(self.fontkit);
  const R = await pdf.embedFont(reg, { subset: true }), B = await pdf.embedFont(semi, { subset: true });
  const LOGOD = await pdf.embedPng(logoD);
  const C = { navy: hex(P, '#2c3e50'), gold: hex(P, '#c39a57'), goldHell: hex(P, '#e3cfa6'), karte: hex(P, '#f6f5f1'), goldKachel: hex(P, '#f4ead8'), linie: hex(P, '#e2ddd2'), ink: hex(P, '#1f2730'), grau: hex(P, '#6b7480'), weiss: P.rgb(1, 1, 1), gruen: hex(P, '#3f8f5c'), rot: hex(P, '#b5534a'), hellgrau: hex(P, '#c9ced4') };
  const ML = 62, W = A4[0] - ML * 2, UNTEN = 74;
  const objZeile = [d.adresse, d.geschoss].filter(Boolean).join(' · ');
  const mieterNamen = [d.vname, d.vname2].filter(Boolean), mieterNat = mieterNamen.map(natuerlich);
  const lageText = [d.geschoss, d.seite ? String(d.seite).toLowerCase() : ''].filter(Boolean).join(' ');
  const seiten = [];

  /* ---------- Grundbausteine ---------- */
  const t = (p, s, xx, yy, o = {}) => p.drawText(sauber(s), { x: xx, y: yy, size: o.size ?? 9.5, font: o.font ?? R, color: o.color ?? C.ink });
  const breite = (s, font = R, size = 9.5) => font.widthOfTextAtSize(sauber(s), size);
  const passend = (s, font, size, max) => { let z = size; while (z > 6 && breite(s, font, z) > max) z -= 0.25; return z; };
  const kuerzen = (s, font, size, max) => { s = sauber(s); if (breite(s, font, size) <= max) return s; while (s.length > 1 && breite(s + '…', font, size) > max) s = s.slice(0, -1); return s + '…'; };
  const rund = (p, xx, yy, w, h, r, o) => p.drawSvgPath(`M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`, { x: xx, y: yy + h, ...o });
  const rundOben = (p, xx, yy, w, h, r, o) => p.drawSvgPath(`M${r},0 H${w - r} Q${w},0 ${w},${r} V${h} H0 V${r} Q0,0 ${r},0 Z`, { x: xx, y: yy + h, ...o });

  /* ---------- Fließtext mit Umbruch und Seitenwechsel ---------- */
  const S = { p: null, y: 0 };
  function kopfVertrag(p, gross = false) {
    // Norderfranken-Logo ganz oben mittig, darunter feine Goldlinie
    const lh = gross ? 46 : 30, lw = lh * LOGOD.width / LOGOD.height;
    p.drawImage(LOGOD, { x: (A4[0] - lw) / 2, y: A4[1] - 24 - lh, width: lw, height: lh });
    const ly = A4[1] - 24 - lh - 12;
    p.drawRectangle({ x: ML, y: ly, width: W, height: 0.9, color: C.gold });
    return ly;
  }
  function neueSeite(gross = false) { S.p = pdf.addPage(A4); seiten.push(S.p); S.y = kopfVertrag(S.p, gross) - 20; }
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
  /** Letzter Absatz vor einer Zustimmungszeile: beide bleiben auf derselben Seite */
  const vorZustimmung = (s) => { platz(umbruch([{ t: s }], 9.6, W).length * 9.6 * 1.45 + 6 + 46); A(s); };
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

  /* ===================== Deckblatt (Übersicht, druckfreundlich) ===================== */
  if (d.deckblatt) {
    const p = pdf.addPage(A4); seiten.push(p);
    const M = 46, BW = A4[0] - 2 * M, top = A4[1];
    const karteR = (xx, yy, w, h, farbe = C.karte) => rund(p, xx, yy, w, h, 6, { color: farbe, borderColor: C.linie, borderWidth: 0.7 });
    const kap = (s, xx, yy, farbe = C.gold) => t(p, s, xx, yy, { font: B, size: 7, color: farbe });
    // Logo ganz oben
    const lh = 58, lw = lh * LOGOD.width / LOGOD.height;
    p.drawImage(LOGOD, { x: (A4[0] - lw) / 2, y: top - 24 - lh, width: lw, height: lh });
    let y = top - 24 - lh - 14;
    p.drawRectangle({ x: M, y, width: BW, height: 0.9, color: C.gold });
    y -= 20;
    kap('MIETVERTRAG · ÜBERSICHT', M, y);
    const er = `Erstellt am ${datum(x.erstellt || Date.now())}`; t(p, er, M + BW - breite(er, R, 7.5), y, { size: 7.5, color: C.grau });
    y -= 28;
    const basis = x.titel || String(d.adresse || '').split(',')[0];
    const titel = d.geschoss && basis.includes(d.geschoss) ? basis : [basis, lageText].filter(Boolean).join(' · ');
    t(p, titel, M, y, { font: B, size: passend(titel, B, 22, BW), color: C.navy });
    y -= 17;
    t(p, kuerzen([x.ort, mieterNat.length ? `Mieter: ${mieterNat.join(' und ')}` : ''].filter(Boolean).join('   ·   '), R, 10, BW), M, y, { size: 10, color: C.grau });
    y -= 20;

    // Foto und Eckdaten
    const fw = 206, fh = 146, fy = y - fh;
    let bildOk = false;
    if (x.bild) { try { const img = await pdf.embedJpg(await zuschnitt(x.bild, fw * 3, fh * 3)); p.drawImage(img, { x: M, y: fy, width: fw, height: fh }); bildOk = true; } catch { bildOk = false; } }
    if (!bildOk) { p.drawRectangle({ x: M, y: fy, width: fw, height: fh, color: C.karte }); const b = (x.titel || d.adresse || '?').trim()[0] || '?'; t(p, b, M + fw / 2 - breite(b, B, 40) / 2, fy + fh / 2 - 14, { font: B, size: 40, color: C.goldHell }); }
    p.drawRectangle({ x: M, y: fy, width: fw, height: fh, borderColor: C.linie, borderWidth: 0.7 });
    const tx = M + fw + 20, tw = BW - fw - 20, kv0 = Number(d.kv) || 0;
    const ausst = AUSST.filter(([k]) => d.ausst?.[k]).map(([, l]) => l);
    const sl = schluesselListe(d.schluessel).filter((s) => s.art && (s.n !== '' || s.nr));
    const eck = [
      [['MIETBEGINN', datum(d.beginn) || 'noch offen'], ['KÜNDIGUNGSVERZICHT', kv0 > 0 ? `${kv0} Monate, gegenseitig` : 'keiner']],
      [['WOHNUNG', [d.zimmer ? `${String(d.zimmer).replace('.', ',')} Zimmer` : '', d.flaeche ? `${qm(d.flaeche)} m² Wohnfläche` : '', d.nutzflaeche ? `${qm(d.nutzflaeche)} m² Nutzfläche` : ''].filter(Boolean).join(' · ') || '–']],
      [['AUSSTATTUNG', ausst.join(' · ') || '–']],
      [['STELLPLATZ', d.stp ? `${d.stp}${d.stpNr ? ' Nr. ' + d.stpNr : ''}${d.stpKosten ? ' · ' + eur(d.stpKosten) + ' mtl.' : ''}` : 'keiner']],
      [['SCHLÜSSEL', sl.length ? sl.map((s) => `${s.n !== '' ? s.n + '× ' : ''}${s.art}${s.nr ? ' (Nr. ' + s.nr + ')' : ''}`).join(', ') : 'werden bei Übergabe eingetragen']],
    ];
    let ty = y - 2;
    for (const reihe of eck) {
      const sw = tw / reihe.length;
      reihe.forEach(([l, v], i) => { kap(l, tx + i * sw, ty - 7, C.grau); t(p, kuerzen(v, B, 9.6, sw - 8), tx + i * sw, ty - 19, { font: B, size: 9.6 }); });
      ty -= 29.5;
    }
    y = fy - 16;

    // Kennzahlen
    const kach = [['WOHNFLÄCHE', d.flaeche ? `${qm(d.flaeche)} m²` : '–', d.nutzflaeche ? `Nutzfläche ${qm(d.nutzflaeche)} m²` : ''],
      ['KALTMIETE', eur(d.kalt) || '–', d.flaeche && d.kalt ? `${(Number(d.kalt) / Number(d.flaeche)).toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} €/m²` : ''],
      ['NEBENKOSTEN', eur(d.nk) || '–', 'Vorauszahlung'],
      ['MONATLICH GESAMT', eur(gesamt(d)) || '–', [d.stpKosten ? `inkl. ${d.stp || 'Stellplatz'}` : '', d.kuecheKosten ? 'inkl. Küche' : ''].filter(Boolean).join(' · ') || 'Kaltmiete + Nebenkosten', true],
      ['KAUTION', eur(d.kaution) || '–', d.kalt && d.kaution ? `${(Number(d.kaution) / Number(d.kalt)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Kaltmieten` : '']];
    const kh = 52, kw = BW / kach.length;
    karteR(M, y - kh, BW, kh, C.weiss);
    kach.forEach(([l, v, s2, hi], i) => {
      const xx = M + i * kw;
      if (hi) p.drawRectangle({ x: xx + 0.6, y: y - kh + 0.6, width: kw - 1.2, height: kh - 1.2, color: C.goldKachel });
      if (i) p.drawLine({ start: { x: xx, y: y - kh + 8 }, end: { x: xx, y: y - 8 }, thickness: 0.6, color: C.linie });
      kap(l, xx + 10, y - 14, hi ? hex(P, '#8a6a33') : C.grau);
      t(p, v, xx + 10, y - 31, { font: B, size: passend(v, B, 13.5, kw - 18), color: C.ink });
      if (s2) t(p, kuerzen(s2, R, 7, kw - 16), xx + 10, y - 44, { size: 7, color: C.grau });
    });
    y -= kh + 14;

    // Vertragsparteien
    const cw = (BW - 14) / 2;
    const zV = [[d.mvName || '–', true], [d.mvAnschrift], [d.mvTel ? `Tel. ${d.mvTel}` : ''], [d.mvMail]].filter(([z]) => z);
    const zM = [...(mieterNat.length ? mieterNat : ['–']).map((n) => [n, true]), [d.anschrift ? `bisher: ${d.anschrift}` : ''], [d.tel ? `Tel. ${d.tel}` : ''], [d.mail]].filter(([z]) => z);
    const ph = 34 + Math.max(zV.length, zM.length) * 13.5;
    [[M, 'VERMIETER', zV], [M + cw + 14, mieterNamen.length > 1 ? 'MIETER (GESAMTSCHULDNERISCH)' : 'MIETER', zM]].forEach(([xx, kopf, zl]) => {
      karteR(xx, y - ph, cw, ph);
      kap(kopf, xx + 14, y - 17);
      zl.forEach(([z, fett], i) => t(p, kuerzen(z, fett ? B : R, fett ? 11 : 9, cw - 28), xx + 14, y - 33 - i * 13.5 - (fett ? 0 : 1.5), { font: fett ? B : R, size: fett ? 11 : 9, color: fett ? C.navy : C.ink }));
    });
    y -= ph + 12;

    // Zahlung und Vertrag – nur ausgefüllte Angaben
    const links = [['Bank', d.bank], ['IBAN', d.iban ? ibanSchoen(d.iban) : ''], ['BIC', d.bic]].filter(([, v]) => v);
    const rechts = [['Hausverwaltung', d.hv], ['Arbeiten vor Einzug', d.arbWas ? `${d.arbWas}${d.arbBis ? ' (bis ' + datum(d.arbBis) + ')' : ''}` : ''], ['Küche / Mobiliar', d.kuecheKosten ? eur(d.kuecheKosten) + ' mtl.' : '']].filter(([, v]) => v);
    if (links.length || rechts.length) {
      const zh = 34 + Math.max(links.length, rechts.length, 1) * 14;
      karteR(M, y - zh, BW, zh);
      kap('MIETKONTO UND VERTRAG', M + 14, y - 17);
      const spalte = (liste, xx, w) => liste.forEach(([l, v], i) => { const yy = y - 34 - i * 14; t(p, l, xx, yy, { size: 7.8, color: C.grau }); t(p, kuerzen(v, B, 9, w - 72), xx + 68, yy, { font: B, size: 9 }); });
      if (rechts.length) { spalte(links, M + 14, BW / 2 - 14); spalte(rechts, M + BW / 2 + 10, BW / 2 - 24); } else spalte(links, M + 14, BW - 28);
      y -= zh + 12;
    }

    // Unterlagen – nur ob sie vorliegen
    const ul = x.unterlagen ?? [];
    if (ul.length) {
      const da = ul.filter((u) => u.st === 'ok' || u.st === 'pr').length, reihen = Math.ceil(ul.length / 2), uh = 34 + reihen * 16;
      karteR(M, y - uh, BW, uh);
      kap('UNTERLAGEN DES MIETERS', M + 14, y - 17);
      const zus = `${da} von ${ul.length} vorhanden`; t(p, zus, M + BW - 14 - breite(zus, B, 8), y - 17, { font: B, size: 8, color: da === ul.length ? C.gruen : C.grau });
      ul.forEach((u, i) => {
        const xx = M + 14 + (i % 2) * (BW / 2), yy = y - 35 - Math.floor(i / 2) * 16, cx = xx + 4.5, cy = yy + 3.2;
        const ok = u.st === 'ok' || u.st === 'pr';
        if (ok) { p.drawCircle({ x: cx, y: cy, size: 4.6, color: C.gruen }); p.drawLine({ start: { x: cx - 2.2, y: cy }, end: { x: cx - 0.6, y: cy - 1.7 }, thickness: 1.1, color: C.weiss }); p.drawLine({ start: { x: cx - 0.6, y: cy - 1.7 }, end: { x: cx + 2.3, y: cy + 1.8 }, thickness: 1.1, color: C.weiss }); }
        else p.drawCircle({ x: cx, y: cy, size: 4.2, borderColor: u.st === 'teil' ? hex(P, '#c98a2e') : C.hellgrau, borderWidth: 1 });
        t(p, kuerzen(u.l, ok ? B : R, 8.6, BW / 2 - 96), xx + 14, yy, { font: ok ? B : R, size: 8.6, color: ok ? C.ink : C.grau });
        const st = ok ? 'vorhanden' : u.st === 'teil' ? (u.txt || 'teilweise') : 'fehlt';
        t(p, st, xx + BW / 2 - 28 - breite(st, R, 7.8), yy, { size: 7.8, color: ok ? C.gruen : u.st === 'teil' ? hex(P, '#c98a2e') : C.grau });
      });
      y -= uh;
    }
    t(p, 'Diese Übersicht dient der internen Ablage und ist nicht Bestandteil des Mietvertrags. Der Mietvertrag beginnt auf der nächsten Seite.', M, Math.max(y - 18, 58), { size: 7.3, color: C.grau });
  }

  /* ===================== Mietvertrag ===================== */
  neueSeite(true);
  { const z = 'Mietvertrag für Wohnraum'; t(S.p, z, (A4[0] - breite(z, B, 22)) / 2, S.y - 16, { font: B, size: 22, color: C.navy }); }
  { const z = kuerzen([d.adresse, lageText].filter(Boolean).join(' · '), R, 10, W); t(S.p, z, (A4[0] - breite(z, R, 10)) / 2, S.y - 33, { size: 10, color: C.grau }); }
  S.y -= 54;

  // Vertragsparteien nebeneinander: zwischen [Vermieter] und [Mieter]
  {
    const gap = 16, cw = (W - gap) / 2, rh = 27;
    const reihen = d.vname2 ? 4 : 3, h = 36 + reihen * rh;
    const karte = (x0, wort, kopf, rolle, name, name2, anschrift, tel, mail) => {
      t(S.p, wort, x0, S.y - 9, { size: 9.6, color: C.grau });
      const y0 = S.y - 16;
      rund(S.p, x0, y0 - h, cw, h, 6, { color: C.karte, borderColor: C.linie, borderWidth: 0.7 });
      t(S.p, kopf, x0 + 12, y0 - 16, { font: B, size: 7.5, color: C.gold });
      t(S.p, rolle, x0 + cw - 12 - breite(rolle, R, 7), y0 - 16, { size: 7, color: C.grau });
      let yy = y0 - 37; const w = cw - 24, xx = x0 + 12;
      feld(S.p, xx, yy, w, name, 'Name, Vorname'); yy -= rh;
      if (name2) { feld(S.p, xx, yy, w, name2, '2. Mieter: Name, Vorname'); yy -= rh; }
      feld(S.p, xx, yy, w, anschrift, 'Anschrift'); yy -= rh;
      feld(S.p, xx, yy, w * 0.44, tel, 'Telefon'); feld(S.p, xx + w * 0.49, yy, w * 0.51, mail, 'E-Mail');
    };
    platz(h + 46);
    karte(ML, 'zwischen', 'VERMIETER', 'nachfolgend „Vermieter“', d.mvName, '', d.mvAnschrift, d.mvTel, d.mvMail);
    karte(ML + cw + gap, 'und', 'MIETER', 'nachfolgend „Mieter“', d.vname, d.vname2, d.anschrift, d.tel, d.mail);
    S.y -= h + 16 + 12;
  }
  A('wird folgender Mietvertrag für Wohnraum geschlossen:');

  // § 1
  para(1, 'Mietsache');
  A('Vermietet werden die Mieträume im Haus:');
  {
    const seite = String(d.seite || '').toLowerCase(), zi = Number(d.zimmer);
    const kb = (l, on) => [{ t: `${l} ` }, { box: !!on }];
    const nebeneinander = (liste) => liste.flatMap((x, i) => [...(i ? [{ gap: 18 }] : []), ...x]);
    const reihen = [
      ['Straße, PLZ, Ort', [{ t: oder(d.adresse), b: true }]],
      ['im Geschoss', [{ t: oder(d.geschoss, '________'), b: true }, { gap: 24 }, ...nebeneinander([kb('Links', seite === 'links'), kb('Rechts', seite === 'rechts'), kb('Mitte', seite === 'mitte')])]],
      ['Anzahl der Zimmer', Number.isInteger(zi) && zi >= 1 && zi <= 5 ? nebeneinander([1, 2, 3, 4, 5].map((n) => kb(String(n), zi === n))) : [{ t: d.zimmer ? String(d.zimmer).replace('.', ',') : '____', b: true }]],
      ['mit', nebeneinander(AUSST.slice(0, 4).map(([k, l]) => kb(l, d.ausst?.[k])))],
      ['', nebeneinander(AUSST.slice(4).map(([k, l]) => kb(l, d.ausst?.[k])))],
      ['Fahrzeug', [...nebeneinander([kb('Stellplatz', d.stp === 'Stellplatz'), kb('Garage', d.stp === 'Garage'), kb('Carport', d.stp === 'Carport')]), { gap: 24 }, { t: 'Nummer: ' }, { t: oder(d.stpNr, '______'), b: true }]],
    ];
    const rh = 18.5, h = 8 + reihen.length * rh + 4;
    platz(h + 10);
    rund(S.p, ML, S.y - h, W, h, 6, { color: C.karte, borderColor: C.linie, borderWidth: 0.7 });
    reihen.forEach(([l, runs], i) => {
      const base = S.y - 8 - (i + 1) * rh + 6;
      if (i && l) S.p.drawLine({ start: { x: ML + 12, y: base + rh - 6 }, end: { x: ML + W - 12, y: base + rh - 6 }, thickness: 0.5, color: C.linie });
      if (l) t(S.p, l, ML + 14, base, { size: 8.3, color: C.grau });
      const z = umbruch(runs, 9.3, 10000)[0]; if (z) zeichneZeile(S.p, z, ML + 128, base, 9.3, C.ink);
    });
    S.y -= h + 12;
  }
  absatz([{ t: 'Die Wohnfläche beträgt ca. ' }, { t: d.flaeche ? qm(d.flaeche) : '______', b: true }, { t: ' Quadratmeter.' }], { nach: 2 });
  absatz([{ t: 'Die Nutzfläche beträgt ca. ' }, { t: d.nutzflaeche ? qm(d.nutzflaeche) : '______', b: true }, { t: ' Quadratmeter.' }], { nach: 8 });
  A('Die Vermietung erfolgt ausschließlich zu Wohnzwecken.');

  // Schlüssel: Tabelle mit mindestens fünf Zeilen (Art, Anzahl, Nummer)
  {
    let sl = schluesselListe(d.schluessel);
    if (!sl.length) sl = SCHLUESSEL_STD.slice(0, 5).map((art) => ({ art, n: '', nr: '' }));
    while (sl.length < 5) sl.push({ art: '', n: '', nr: '' });
    const rh = 20, kh = 21, h = kh + sl.length * rh + 2, cA = W * 0.47, cN = W * 0.15;
    platz(h + 40);
    A('Dem Mieter werden vom Vermieter folgende Schlüssel ausgehändigt:');
    const y0 = S.y - 2;
    rund(S.p, ML, y0 - h, W, h, 6, { color: C.weiss });
    rundOben(S.p, ML, y0 - kh, W, kh, 6, { color: C.karte });
    [['ART DES SCHLÜSSELS', ML + 12], ['ANZAHL', ML + cA + 12], ['SCHLÜSSEL-NR. / BEMERKUNG', ML + cA + cN + 12]].forEach(([l, xx]) => t(S.p, l, xx, y0 - 14, { font: B, size: 7, color: C.navy }));
    for (const xx of [ML + cA, ML + cA + cN]) S.p.drawLine({ start: { x: xx, y: y0 }, end: { x: xx, y: y0 - h }, thickness: 0.6, color: C.linie });
    sl.forEach((s, i) => {
      const yb = y0 - kh - (i + 1) * rh;
      S.p.drawLine({ start: { x: ML + 0.4, y: yb + rh }, end: { x: ML + W - 0.4, y: yb + rh }, thickness: i ? 0.6 : 0.8, color: C.linie });
      if (s.art) t(S.p, kuerzen(s.art, R, 9.6, cA - 20), ML + 12, yb + 7, { size: 9.6 });
      if (s.n !== '') t(S.p, String(s.n), ML + cA + 12, yb + 7, { font: B, size: 9.6 });
      if (s.nr) t(S.p, kuerzen(s.nr, R, 9.6, W - cA - cN - 20), ML + cA + cN + 12, yb + 7, { size: 9.6 });
    });
    rund(S.p, ML, y0 - h, W, h, 6, { borderColor: C.linie, borderWidth: 0.8 });
    S.y = y0 - h - 12;
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

  // § 3 – Einleitung und Kontotabelle bleiben zusammen
  platz(78 + 3 * 14 + 6 + 3 * 17 + 22);
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
  vorZustimmung('Der Mieter hat gemäß § 555a BGB Maßnahmen des Vermieters, die zur Instandhaltung oder Instandsetzung der Mietsache erforderlich sind und Modernisierungsmaßnahmen nach §§ 555b bis 555e BGB zu dulden.');
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
  vorZustimmung('Der Mieter hat ein Auskunftsrecht über die von ihm beim Vermieter gespeicherten Daten gemäß Art. 15 DSGVO und ein Recht auf Löschung der Daten gemäß Art. 35 DSGVO.');
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
    const deck = i === 0 && d.deckblatt, m = deck ? 46 : ML;
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
