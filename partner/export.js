// Export der Objektliste als Excel (.xlsx) oder CSV – ohne Bilder, mit Kennzahlen. Läuft komplett im Browser.
const VS = { frei: 'Frei', reserviert: 'Reserviert', notar: 'Notartermin', verkauft: 'Verkauft' };
const STEP = { done: '✓ ', now: '● ' };
const dDe = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '');

// Spalten: [Überschrift, Wert, Typ, Breite]  Typ: s Text · e € · e2 € mit Cent · d Datum (ISO) · p % · q m² · n Zahl · w Text mit Umbruch
function spalten(kz) {
  return [
    ['Objekt', (o) => o.strasse, 's', 22], ['Lage', (o) => o.lage, 's', 16],
    ['Verfügbarkeit', (o) => VS[o.vs || 'frei'] ?? o.vs, 's', 14], ['Reserviert bis', (o) => ((o.vs || 'frei') === 'reserviert' ? o.vbis : ''), 'd', 14],
    ['Bauzustand', (o) => o.status?.label, 's', 20], ['Sanierung in %', (o) => o.fortschritt, 'p', 12],
    ['Zimmer', (o) => o.zimmer, 'n', 9], ['Wohnfläche', (o) => o.flaeche, 'q', 12], ['Baujahr', (o) => o.baujahr, 'n', 9], ['Energieklasse', (o) => o.energie, 's', 12],
    ['Abgabepreis', (o) => o.preis, 'e', 14], ['Preis je m²', (o) => kz(o).preisQm, 'e', 12],
    ['Kaltmiete / Monat', (o) => o.miete, 'e', 14], ['Mietart', (o) => o.mieteTyp, 's', 9], ['Zuschlag / Monat', (o) => o.zuschlag?.betrag ?? '', 'e', 14], ['Zuschlag Art', (o) => o.zuschlag?.label ?? '', 's', 12],
    ['Miete je m²', (o) => kz(o).mieteQm, 'e2', 12], ['Hausgeld / Monat', (o) => o.hausgeld, 'e', 14],
    ['Rendite p. a.', (o) => kz(o).rendite, 'p2', 12], ['Kaufpreisfaktor', (o) => kz(o).faktor, 'f', 12],
    ['Preishinweis', (o) => o.preisHinweis, 's', 22], ['Ausstattung', (o) => (o.tags ?? []).join(', '), 'w', 30], ['Standort', (o) => o.ort, 'w', 40],
    ['Sanierung', (o) => o.sanierung, 'w', 50], ['Hinweis', (o) => o.hinweis, 'w', 30],
    ['Zeitplan', (o) => (o.schritte ?? []).map((s) => `${STEP[s.state] ?? ''}${s.label}${s.datum ? ' (' + s.datum + ')' : ''}`).join(' → '), 'w', 50],
    ['Unterlagen', (o) => (o.docs ?? []).map((d) => d.n).join(', '), 'w', 30],
  ];
}

function kpis(list, kz) {
  const n = list.length, sum = (f) => list.reduce((a, o) => a + f(o), 0), fl = sum((o) => o.flaeche), pr = sum((o) => o.preis), jm = sum((o) => (o.miete + (o.zuschlag?.betrag ?? 0)) * 12);
  const cnt = (v) => list.filter((o) => (o.vs || 'frei') === v).length;
  return [
    ['Anzahl Objekte', n, 'n'], ['davon frei', cnt('frei'), 'n'], ['davon reserviert', cnt('reserviert'), 'n'], ['davon Notartermin', cnt('notar'), 'n'], ['davon verkauft', cnt('verkauft'), 'n'],
    ['Wohnfläche gesamt', fl, 'q'], ['Abgabepreis gesamt', pr, 'e'], ['Ø Abgabepreis', n ? pr / n : 0, 'e'], ['Ø Preis je m²', fl ? pr / fl : 0, 'e'],
    ['Kaltmiete gesamt / Monat', sum((o) => o.miete), 'e'], ['Hausgeld gesamt / Monat', sum((o) => o.hausgeld), 'e'], ['Ø Rendite p. a.', pr ? (jm / pr) * 100 : 0, 'p2'],
    ['Ø Sanierungsstand', n ? sum((o) => o.fortschritt) / n : 0, 'p'],
  ];
}

// Textwerte, die mit = + - @ oder Tab/CR beginnen, würde Excel als Formel ausführen – mit ' entschärfen (Zahlen werden nicht angefasst)
const safe = (s) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);
const zahlDe = (v, t) => (t === 'd' ? dDe(v) : t === 's' || t === 'w' ? safe(String(v ?? '')) : v === '' || v == null || Number.isNaN(v) ? '' : t === 'n' || t === 'p' ? String(Math.round(v * 100) / 100).replace('.', ',') : (Math.round(v * 100) / 100).toFixed(2).replace('.', ','));
const csvCell = (s) => `"${String(s).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

function csv(list, kz) {
  const sp = spalten(kz);
  const rows = [sp.map((c) => csvCell(c[0])).join(';'), ...list.map((o) => sp.map((c) => csvCell(zahlDe(c[1](o), c[2]))).join(';')), '', csvCell('Kennzahlen'), ...kpis(list, kz).map(([l, v, t]) => `${csvCell(l)};${csvCell(zahlDe(v, t))}`)];
  return new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

/* ---------- minimales XLSX (Zip ohne Kompression) ---------- */
const xe = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const STYLE = { s: 0, h: 1, e: 2, p: 3, p2: 4, q: 5, w: 6, n: 0, f: 7, e2: 8, d: 9 };
const cell = (r, c, v, t) => {
  const ref = colName(c) + (r + 1);
  if (v === '' || v == null || Number.isNaN(v)) return `<c r="${ref}"/>`;
  if (t === 'd') { const ms = Date.parse(v); return Number.isNaN(ms) ? `<c r="${ref}"/>` : `<c r="${ref}" s="9"><v>${Math.floor(ms / 86400000) + 25569}</v></c>`; }
  if (typeof v === 'number' && t !== 's' && t !== 'w') return `<c r="${ref}" s="${STYLE[t]}"><v>${v}</v></c>`;
  return `<c r="${ref}" s="${STYLE[t === 'h' ? 'h' : t] ?? 0}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
};
const sheet = (rows, widths, freeze) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${freeze ? '<pane ySplit="1" xSplit="2" topLeftCell="C2" activePane="bottomRight" state="frozen"/>' : ''}</sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.join('')}</row>`).join('')}</sheetData>${freeze ? `<autoFilter ref="A1:${colName(freeze - 1)}1"/>` : ''}</worksheet>`;

const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  for (const [name, text] of files) {
    const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x0021, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x0021, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cd.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + data.length;
  }
  const size = cd.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function xlsx(list, kz) {
  const sp = spalten(kz);
  const s1 = [sp.map((c, i) => cell(0, i, c[0], 'h')), ...list.map((o, r) => sp.map((c, i) => cell(r + 1, i, c[1](o), c[2])))];
  const s2 = [[cell(0, 0, 'Kennzahl', 'h'), cell(0, 1, 'Wert', 'h')], ...kpis(list, kz).map(([l, v, t], r) => [cell(r + 1, 0, l, 's'), cell(r + 1, 1, v, t)])];
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${ns}><numFmts count="7"><numFmt numFmtId="164" formatCode="#,##0\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="0\\ &quot;%&quot;"/><numFmt numFmtId="166" formatCode="0.00\\ &quot;%&quot;"/><numFmt numFmtId="167" formatCode="#,##0.0\\ &quot;m²&quot;"/><numFmt numFmtId="168" formatCode="0.0"/><numFmt numFmtId="169" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="170" formatCode="DD.MM.YYYY"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8D9A8"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="166" applyNumberFormat="1"/><xf numFmtId="167" applyNumberFormat="1"/><xf applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="168" applyNumberFormat="1"/><xf numFmtId="169" applyNumberFormat="1"/><xf numFmtId="170" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="${rel}"><sheets><sheet name="Objekte" sheetId="1" r:id="rId1"/><sheet name="Kennzahlen" sheetId="2" r:id="rId2"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', sheet(s1, sp.map((c) => c[3]), sp.length)],
    ['xl/worksheets/sheet2.xml', sheet(s2, [30, 18], 0)],
  ]);
}


/* ---------- Investagon-Einheitentabelle (CSV): übliche Importfelder, Zuordnung beim ersten Import nötig ---------- */
const split = (o) => {
  const m = String(o.strasse || '').match(/^(.*?)\s+(\d+\s?[a-zA-Z]?)$/), p = String(o.ort || '').match(/^(\d{5})\s+([^\s—–-]+)/), e = String(o.lage || '').match(/(\d+)\.\s*(OG|DG|EG|UG)(?:\s+(.*))?/i);
  return { str: m ? m[1] : o.strasse, nr: m ? m[2] : '', plz: p ? p[1] : '', ort: p ? p[2] : 'Hof', etage: e ? e[1] : /EG/i.test(o.lage || '') ? '0' : '', lage: e ? e[3] || '' : o.lage || '' };
};
const IV_STATUS = { frei: 'Verfügbar', reserviert: 'Reserviert', notar: 'Notartermin', verkauft: 'Verkauft' };
function investagon(list, kz) {
  const sp = [
    ['Einheit-Nr.', (o) => o.id], ['Straße', (o) => split(o).str], ['Hausnummer', (o) => split(o).nr], ['PLZ', (o) => split(o).plz], ['Ort', (o) => split(o).ort],
    ['Etage', (o) => split(o).etage], ['Lage in Etage', (o) => split(o).lage], ['Zimmer', (o) => o.zimmer, 'n'], ['Wohnfläche (m²)', (o) => o.flaeche, 'q'],
    ['Baujahr', (o) => o.baujahr, 'n'], ['Energieeffizienzklasse', (o) => o.energie], ['Status', (o) => IV_STATUS[o.vs || 'frei']],
    ['Kaufpreis (€)', (o) => o.preis, 'e'], ['Kaufpreis je m² (€)', (o) => kz(o).preisQm, 'e'],
    ['Nettokaltmiete (€/Monat)', (o) => o.miete, 'e'], ['Mietart', (o) => ({ IST: 'Ist-Miete', SOLL: 'Soll-Miete', PLAN: 'Plan-Miete' })[o.mieteTyp] ?? o.mieteTyp],
    ['Zusatzmiete (€/Monat)', (o) => o.zuschlag?.betrag ?? '', 'e'], ['Zusatzmiete Bezeichnung', (o) => o.zuschlag?.label ?? ''],
    ['Hausgeld (€/Monat)', (o) => o.hausgeld, 'e'], ['Mietrendite brutto (%)', (o) => kz(o).rendite, 'p2'], ['Kaufpreisfaktor', (o) => kz(o).faktor, 'f'],
    ['Sanierungsstand (%)', (o) => o.fortschritt, 'p'], ['Bauzustand', (o) => o.status?.label], ['Ausstattung', (o) => (o.tags ?? []).join(', ')],
    ['Beschreibung Lage', (o) => o.ort], ['Beschreibung Sanierung', (o) => o.sanierung], ['Hinweis', (o) => o.hinweis],
  ];
  const num = (v, t) => (t === undefined ? safe(String(v ?? '')) : v === '' || v == null || Number.isNaN(v) ? '' : String(Math.round(v * 100) / 100).replace('.', ','));
  const rows = [sp.map((c) => csvCell(c[0])).join(';'), ...list.map((o) => sp.map((c) => csvCell(num(c[1](o), c[2]))).join(';'))];
  return new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export function exportObjekte(list, kz, format) {
  if (!list.length) return false;
  const blob = format === 'investagon' ? investagon(list, kz) : format === 'csv' ? csv(list, kz) : xlsx(list, kz), a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${format === 'investagon' ? 'Norderfranken_Investagon_Einheiten' : 'Norderfranken_Objekte'}_${new Date().toISOString().slice(0, 10)}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
