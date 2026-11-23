// Text einer PDF-Seite in Zeilen zerlegen – so wie es der bisherige Generator (PyMuPDF) geliefert hat:
// eine Ausgabezeile je Textzeile; Tabellenzellen mit großem Abstand werden zu eigenen Zeilen (Label / Wert).
export function seitenZeilen(items) {
  const L = []; let cur = null;
  const ende = () => { if (cur && cur.t.trim()) L.push(cur.t); cur = null; };
  for (const it of items) {
    const s = it.str ?? '', x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10, w = it.width || 0;
    if (cur && Math.abs(y - cur.y) > Math.max(3, Math.max(h, cur.h) * 0.6)) ende();
    if (!s.trim()) {                                   // Leerraum: breit = Spaltenwechsel, schmal = Leerzeichen
      if (cur) { if (w > Math.max(h, cur.h) * 1.0) ende(); else if (!cur.t.endsWith(' ')) cur.t += ' '; }
      if (it.hasEOL) ende();
      continue;
    }
    if (cur) { const luecke = x - cur.xEnd; if (luecke > Math.max(h, cur.h) * 1.0 || luecke < -Math.max(h, cur.h) * 3) ende(); else if (luecke > h * 0.25 && !cur.t.endsWith(' ')) cur.t += ' '; }
    if (!cur) cur = { t: '', y, h, xEnd: x };
    cur.t += s; cur.xEnd = x + w; if (h >= cur.h * 0.8) { cur.y = y; cur.h = h; }
    if (it.hasEOL) ende();
  }
  ende();
  return L.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}
