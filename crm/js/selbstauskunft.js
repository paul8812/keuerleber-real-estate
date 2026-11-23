// Mieter-Selbstauskunft: die Fragen (eine Quelle für das Online-Formular und das PDF) und das PDF selbst.
// Wird im CRM und auf der öffentlichen Kundenseite (/k/) benutzt – deshalb ohne weitere Abhängigkeiten.
// Gefragt wird nur, was für die Entscheidung über das Mietverhältnis üblich und zulässig ist.

const JN = ['ja', 'nein'];
/** typ: text | datum | tel | email | zahl | euro | wahl (opt) | jn | lang · wenn: nur zeigen, wenn Feld k den Wert v hat */
export const ABSCHNITTE = [
  { id: 'wohnung', titel: 'Mietobjekt', felder: [
    { k: 'einzug', l: 'Gewünschter Einzug ab', typ: 'datum' },
    { k: 'personen', l: 'Anzahl einziehender Personen', typ: 'zahl', pflicht: true, breit: false },
    { k: 'kinder', l: 'davon Kinder (mit Alter)', typ: 'text', ph: 'z. B. 2 Kinder, 4 und 7 Jahre' },
  ] },
  { id: 'mieter', titel: 'Mietinteressent/in', felder: [
    { k: 'vorname', l: 'Vorname', typ: 'text', pflicht: true, ac: 'given-name' },
    { k: 'nachname', l: 'Nachname', typ: 'text', pflicht: true, ac: 'family-name' },
    { k: 'geburt', l: 'Geburtsdatum', typ: 'datum', pflicht: true, ac: 'bday' },
    { k: 'familienstand', l: 'Familienstand', typ: 'wahl', opt: ['ledig', 'verheiratet / verpartnert', 'geschieden', 'verwitwet'] },
    { k: 'anschrift', l: 'Aktuelle Anschrift', typ: 'text', pflicht: true, breit: true, ph: 'Straße Nr., PLZ Ort', ac: 'street-address' },
    { k: 'tel', l: 'Telefon', typ: 'tel', pflicht: true, ac: 'tel' },
    { k: 'email', l: 'E-Mail', typ: 'email', pflicht: true, ac: 'email' },
  ] },
  { id: 'beruf', titel: 'Beruf und Einkommen', felder: [
    { k: 'beruf', l: 'Ausgeübter Beruf', typ: 'text', pflicht: true },
    { k: 'arbeitgeber', l: 'Arbeitgeber (Name, Ort)', typ: 'text' },
    { k: 'beschaeftigtSeit', l: 'Dort beschäftigt seit', typ: 'text', ph: 'z. B. 03/2021' },
    { k: 'vertrag', l: 'Arbeitsverhältnis', typ: 'wahl', opt: ['unbefristet', 'befristet', 'in der Probezeit', 'selbstständig', 'in Ausbildung / Studium', 'Rente / Pension', 'derzeit ohne Beschäftigung'] },
    { k: 'netto', l: 'Monatliches Nettoeinkommen (€)', typ: 'euro', pflicht: true },
    { k: 'weitereEinkuenfte', l: 'Weitere regelmäßige Einkünfte (€ / Art)', typ: 'text', ph: 'z. B. 250 € Kindergeld' },
  ] },
  { id: 'mieter2', titel: 'Zweite/r Mieter/in', hinweis: 'Nur ausfüllen, wenn eine weitere Person den Mietvertrag mit unterschreibt.', felder: [
    { k: 'zweiter', l: 'Zieht eine zweite Person als Mieter/in mit ein?', typ: 'jn', breit: true },
    { k: 'vorname2', l: 'Vorname', typ: 'text', wenn: { k: 'zweiter', v: 'ja' } },
    { k: 'nachname2', l: 'Nachname', typ: 'text', wenn: { k: 'zweiter', v: 'ja' } },
    { k: 'geburt2', l: 'Geburtsdatum', typ: 'datum', wenn: { k: 'zweiter', v: 'ja' } },
    { k: 'beruf2', l: 'Beruf / Arbeitgeber', typ: 'text', wenn: { k: 'zweiter', v: 'ja' } },
    { k: 'vertrag2', l: 'Arbeitsverhältnis', typ: 'wahl', opt: ['unbefristet', 'befristet', 'in der Probezeit', 'selbstständig', 'in Ausbildung / Studium', 'Rente / Pension', 'derzeit ohne Beschäftigung'], wenn: { k: 'zweiter', v: 'ja' } },
    { k: 'netto2', l: 'Monatliches Nettoeinkommen (€)', typ: 'euro', wenn: { k: 'zweiter', v: 'ja' } },
  ] },
  { id: 'bisher', titel: 'Bisheriges Mietverhältnis', felder: [
    { k: 'vermieter', l: 'Derzeitiger Vermieter (Name, Telefon – freiwillig)', typ: 'text', breit: true },
    { k: 'wohntSeit', l: 'Dort wohnhaft seit', typ: 'text', ph: 'z. B. 2019' },
    { k: 'umzugsgrund', l: 'Grund für den Umzug', typ: 'text' },
  ] },
  { id: 'erklaerung', titel: 'Erklärungen', felder: [
    { k: 'haustiere', l: 'Sollen Haustiere gehalten werden?', typ: 'jn', pflicht: true },
    { k: 'haustiereArt', l: 'Welche?', typ: 'text', wenn: { k: 'haustiere', v: 'ja' } },
    { k: 'gewerbe', l: 'Ist eine gewerbliche Nutzung der Wohnung beabsichtigt?', typ: 'jn', pflicht: true },
    { k: 'rueckstand', l: 'Bestehen Mietrückstände aus bisherigen Mietverhältnissen?', typ: 'jn', pflicht: true },
    { k: 'raeumung', l: 'Gab es in den letzten 5 Jahren eine Räumungsklage gegen Sie?', typ: 'jn', pflicht: true },
    { k: 'vermoegensauskunft', l: 'Haben Sie in den letzten 3 Jahren eine Vermögensauskunft (eidesstattliche Versicherung) abgegeben?', typ: 'jn', pflicht: true },
    { k: 'insolvenz', l: 'Läuft ein Insolvenzverfahren oder wurde in den letzten 5 Jahren eines eröffnet?', typ: 'jn', pflicht: true },
    { k: 'kaution', l: 'Kann die Mietkaution bei Vertragsbeginn geleistet werden?', typ: 'jn', pflicht: true },
    { k: 'schufa', l: 'Können Sie eine aktuelle Bonitätsauskunft (z. B. SCHUFA) vorlegen?', typ: 'jn' },
    { k: 'bemerkung', l: 'Was Sie uns sonst noch mitteilen möchten', typ: 'lang', breit: true },
  ] },
];
export const ERKLAERUNG = 'Ich versichere, dass die vorstehenden Angaben vollständig und wahrheitsgemäß sind. Mir ist bekannt, dass falsche Angaben den Vermieter zur Anfechtung oder Kündigung des Mietvertrags berechtigen können.';
export const DATENSCHUTZ = 'Die Angaben werden ausschließlich zur Entscheidung über den Abschluss eines Mietvertrags verwendet, an den Vermieter weitergegeben und gelöscht, sobald sie dafür nicht mehr erforderlich sind (Art. 6 Abs. 1 lit. b DSGVO).';

export const sichtbar = (f, d) => !f.wenn || String(d?.[f.wenn.k] ?? '') === f.wenn.v;
/** fehlende Pflichtangaben → Liste der Feld-Schlüssel */
export function fehlend(d) {
  const out = [];
  for (const a of ABSCHNITTE) for (const f of a.felder) if (f.pflicht && sichtbar(f, d) && !String(d?.[f.k] ?? '').trim()) out.push(f.k);
  if (!d?.richtig) out.push('richtig');
  return out;
}
const datumDE = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v || ''); };
/** Wert für Anzeige / PDF */
export function wert(f, d) {
  const v = d?.[f.k]; if (v == null || v === '') return '';
  if (f.typ === 'datum') return datumDE(v);
  if (f.typ === 'euro') { const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n.toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' €' : String(v); }
  return String(v);
}
/** Kurzfassung fürs CRM: [Bezeichnung, Wert] der wichtigsten Angaben */
export function kurz(d) {
  if (!d) return [];
  const g = k => String(d[k] ?? '').trim(), eink = [d.netto, d.zweiter === 'ja' ? d.netto2 : 0].map(x => Number(String(x || 0).replace(/\./g, '').replace(',', '.')) || 0).reduce((a, b) => a + b, 0);
  const rot = ['rueckstand', 'raeumung', 'vermoegensauskunft', 'insolvenz'].filter(k => g(k) === 'ja').length + (g('kaution') === 'nein' ? 1 : 0);
  return [
    ['Haushalt', g('personen') ? `${g('personen')} Person${g('personen') === '1' ? '' : 'en'}${g('kinder') ? ' · ' + g('kinder') : ''}` : ''],
    ['Beruf', [g('beruf'), g('vertrag')].filter(Boolean).join(' · ')],
    ['Einkommen', eink ? eink.toLocaleString('de-DE') + ' € netto' + (d.zweiter === 'ja' && d.netto2 ? ' (zusammen)' : '') : ''],
    ['Einzug', datumDE(g('einzug'))],
    ['Haustiere', g('haustiere') === 'ja' ? (g('haustiereArt') || 'ja') : g('haustiere')],
    ['Bonität', rot ? `⚠️ ${rot} Auffälligkeit${rot > 1 ? 'en' : ''}` : (g('rueckstand') ? 'keine Auffälligkeiten' : '')],
  ].filter(([, v]) => v);
}

/** Ausgefüllte Selbstauskunft als PDF (jsPDF-Dokument). meta: { titel, adresse, absender: {firma,name,tel,email}, eingereicht } */
export function pdf(jsPDF, d, meta = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }), W = 210, H = 297, L = 18, R = W - 18, B = R - L;
  const gold = [158, 126, 62], grau = [110, 110, 110], schwarz = [20, 20, 20];
  let y = 0, seite = 1;
  const fuss = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...grau);
    const a = meta.absender || {};
    doc.text([a.firma, a.name, a.tel ? 'Tel. ' + a.tel : '', a.email].filter(Boolean).join('  ·  '), L, H - 10);
    doc.text('Seite ' + seite, R, H - 10, { align: 'right' });
  };
  const neueSeite = () => { fuss(); doc.addPage(); seite++; y = 20; };
  const platz = h => { if (y + h > H - 20) neueSeite(); };
  // Kopf
  doc.setFillColor(20, 20, 20); doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(226, 200, 143); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Mieter-Selbstauskunft', L, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(215, 210, 200);
  doc.text((meta.absender?.firma || 'Keuerleber Immobilien'), L, 21);
  if (meta.eingereicht) doc.text('Online übermittelt am ' + new Date(meta.eingereicht).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) + ' Uhr', R, 21, { align: 'right' });
  y = 40;
  if (meta.titel) {
    doc.setTextColor(...grau); doc.setFontSize(8.5); doc.text('MIETOBJEKT', L, y); y += 5;
    doc.setTextColor(...schwarz); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    const z = doc.splitTextToSize(meta.titel, B); doc.text(z, L, y); y += z.length * 5.4;
    if (meta.adresse) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(meta.adresse, L, y); y += 5; }
    y += 3;
  }
  const kopf = t => {
    platz(16); y += 3;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...gold); doc.text(t.toUpperCase(), L, y);
    doc.setDrawColor(...gold); doc.setLineWidth(0.3); doc.line(L, y + 1.8, R, y + 1.8); y += 8;
  };
  const zeile = (label, val) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const lz = doc.splitTextToSize(label, 78), vz = doc.splitTextToSize(val || '–', B - 84), h = Math.max(lz.length, vz.length) * 4.6 + 2.4;
    platz(h);
    doc.setTextColor(...grau); doc.text(lz, L, y);
    doc.setTextColor(...schwarz); doc.setFont('helvetica', val ? 'bold' : 'normal'); doc.text(vz, L + 84, y);
    doc.setDrawColor(228, 228, 228); doc.setLineWidth(0.15); doc.line(L, y + h - 4.2, R, y + h - 4.2);
    y += h;
  };
  for (const a of ABSCHNITTE) {
    const F = a.felder.filter(f => sichtbar(f, d) && !(a.id === 'mieter2' && d?.zweiter !== 'ja' && f.k !== 'zweiter'));
    if (a.id === 'mieter2' && d?.zweiter !== 'ja') continue;
    kopf(a.titel);
    for (const f of F) if (f.k !== 'zweiter') zeile(f.l, wert(f, d));
  }
  // Erklärung + Unterschrift
  kopf('Erklärung');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...schwarz);
  for (const t of [ERKLAERUNG, DATENSCHUTZ]) { const z = doc.splitTextToSize(t, B); platz(z.length * 4.6 + 3); doc.text(z, L, y); y += z.length * 4.6 + 3; }
  const name = [d?.vorname, d?.nachname].filter(Boolean).join(' ');
  if (d?.richtig) { platz(8); doc.setFont('helvetica', 'bold'); doc.text(`Online bestätigt von ${name || '–'}${meta.eingereicht ? ' am ' + new Date(meta.eingereicht).toLocaleDateString('de-DE') : ''}.`, L, y); y += 8; }
  platz(30); y += 16;
  doc.setDrawColor(...schwarz); doc.setLineWidth(0.25);
  doc.line(L, y, L + 70, y); doc.line(R - 80, y, R, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...grau);
  doc.text('Ort, Datum', L, y + 4); doc.text('Unterschrift ' + (name || 'Mietinteressent/in'), R - 80, y + 4);
  if (d?.zweiter === 'ja') { y += 18; platz(10); doc.line(R - 80, y, R, y); doc.text('Unterschrift ' + ([d.vorname2, d.nachname2].filter(Boolean).join(' ') || 'zweite/r Mieter/in'), R - 80, y + 4); }
  fuss();
  return doc;
}
export const pdfName = d => `Selbstauskunft ${[d?.nachname, d?.vorname].filter(Boolean).join(' ') || 'Mietinteressent'}.pdf`.replace(/[\\/:*?"<>|]/g, '');
