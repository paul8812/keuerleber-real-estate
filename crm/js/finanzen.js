// Buchhaltung & Rechnungen: Logik (Beträge, Nummern, Provision, Rechnungsdruck im Keuerleber-Design)
import * as db from './db.js';
import { esc, eur2, fmtDate, today, addDays, fullName } from './util.js';
import { adresse } from './ui.js';

export const KAT_AUSGABE = ['Werbung & Portale', 'Fahrzeug & Fahrtkosten', 'Büro & Material', 'Software & IT', 'Telefon & Internet', 'Versicherungen', 'Steuerberater & Beratung', 'Fortbildung', 'Bewirtung', 'Bank & Gebühren', 'Fotografie & Homestaging', 'Gutachten & Energieausweis', 'Miete & Raumkosten', 'Reisekosten & Übernachtung', 'Porto & Versand', 'Beiträge & Gebühren', 'Geringwertige Wirtschaftsgüter (bis 800 € netto)', 'Anschaffung Anlagegut (über 800 € netto)', 'Sonstige Ausgaben'];
export const KAT_EINNAHME = ['Provision Käufer', 'Provision Verkäufer', 'Vermietungsprovision', 'Beratung', 'Sonstige Einnahmen'];
// Kontenvorschlag nach DATEV SKR03 (Steuerberater kann abweichend zuordnen)
export const KONTEN = {
  'Werbung & Portale': '4610', 'Fahrzeug & Fahrtkosten': '4530', 'Büro & Material': '4930', 'Software & IT': '4964', 'Telefon & Internet': '4920',
  'Versicherungen': '4360', 'Steuerberater & Beratung': '4950', 'Fortbildung': '4945', 'Bewirtung': '4650', 'Bank & Gebühren': '4970',
  'Fotografie & Homestaging': '4600', 'Gutachten & Energieausweis': '3100', 'Miete & Raumkosten': '4210', 'Reisekosten & Übernachtung': '4670',
  'Porto & Versand': '4910', 'Beiträge & Gebühren': '4380', 'Geringwertige Wirtschaftsgüter (bis 800 € netto)': '4855', 'Anschaffung Anlagegut (über 800 € netto)': '0490',
  'Sonstige Ausgaben': '4900', 'Provision Käufer': '8400', 'Provision Verkäufer': '8400', 'Vermietungsprovision': '8400', 'Beratung': '8400', 'Sonstige Einnahmen': '8400',
};
export const konto = (kat, satz) => (KONTEN[kat] === '8400' && Number(satz) === 0) ? '8100' : (KONTEN[kat] || '');
export const UST_SAETZE = [[19, '19 %'], [7, '7 %'], [0, '0 % / steuerfrei']];
export const RE_TYPEN = [
  ['kaeufer', 'Käuferprovision', 'Provision Käufer'],
  ['verkaeufer', 'Verkäuferprovision', 'Provision Verkäufer'],
  ['vermietung', 'Vermietungsprovision', 'Vermietungsprovision'],
  ['frei', 'Sonstige Leistung', 'Sonstige Einnahmen'],
];

export const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const kleinunternehmer = () => !!db.settings().kleinunternehmer;

// Summen einer Rechnung (Positionen netto, je Position eigener USt-Satz)
export function summen(re) {
  const kl = kleinunternehmer();
  const pos = (re.positionen || []).map(p => ({ ...p, netto: r2((Number(p.menge) || 1) * (Number(p.einzel) || 0)), ust: kl ? 0 : Number(p.ust ?? 19) }));
  const netto = r2(pos.reduce((s, p) => s + p.netto, 0));
  const steuern = {};
  pos.forEach(p => { if (p.ust) steuern[p.ust] = r2((steuern[p.ust] || 0) + p.netto * p.ust / 100); });
  const ust = r2(Object.values(steuern).reduce((s, v) => s + v, 0));
  return { pos, netto, steuern, ust, brutto: r2(netto + ust) };
}

export function naechsteNr(datum = today()) {
  const y = datum.slice(0, 4), pre = `RE-${y}-`;
  const max = db.all('rechnungen').filter(r => (r.nr || '').startsWith(pre)).reduce((m, r) => Math.max(m, parseInt(r.nr.slice(pre.length)) || 0), 0);
  return pre + String(max + 1).padStart(3, '0');
}

export function empfaenger(c) {
  if (!c) return '';
  const name = [c.anrede && !['Divers', 'Firma'].includes(c.anrede) ? c.anrede : '', c.vorname, c.nachname].filter(Boolean).join(' ');
  return [c.firma, name, c.strasse, [c.plz, c.ort].filter(Boolean).join(' ')].filter(Boolean).join('\n');
}

// Provision aus Kaufpreis/Miete: Prozentsatz brutto (inkl. USt), wie im Maklervertrag üblich
export function provisionsPosition(typ, { kaufpreis, prozentBrutto, objekt, monatsmieten, kaltmiete }) {
  const kl = kleinunternehmer(), ust = kl ? 0 : 19;
  if (typ === 'vermietung') {
    const netto = r2((Number(kaltmiete) || 0) * (Number(monatsmieten) || 2) / (1 + ust / 100));
    return { text: `Vermietungsprovision${objekt ? ' für das Objekt ' + objekt : ''} – ${String(monatsmieten || 2).replace('.', ',')} Nettokaltmieten à ${eur2(kaltmiete)}`, menge: 1, einzel: netto, ust };
  }
  const pb = Number(prozentBrutto) || 0, pn = r2(pb / (1 + ust / 100) * 100) / 100;
  const netto = r2((Number(kaufpreis) || 0) * pb / 100 / (1 + ust / 100));
  const wer = typ === 'verkaeufer' ? 'Verkäuferprovision' : 'Käuferprovision';
  return { text: `Maklerprovision (${wer}) für den Nachweis bzw. die Vermittlung des Kaufvertrags${objekt ? ' über das Objekt ' + objekt : ''}\nKaufpreis ${eur2(kaufpreis)} × ${String(pn).replace('.', ',')} %${ust ? ' zzgl. ' + ust + ' % USt (= ' + String(pb).replace('.', ',') + ' % inkl. USt)' : ''}`, menge: 1, einzel: netto, ust };
}

export const istUeberfaellig = re => re.status === 'offen' && re.faellig && re.faellig < today();

// Buchung zur bezahlten Rechnung (idempotent über feste ID)
export async function alsBezahlt(re, datum = today()) {
  const s = summen(re), typ = RE_TYPEN.find(t => t[0] === re.typ) || RE_TYPEN[3];
  const ustSatz = Object.keys(s.steuern).length === 1 ? Number(Object.keys(s.steuern)[0]) : (s.ust ? 19 : 0);
  await db.save('rechnungen', { ...re, status: 'bezahlt', bezahltAm: datum });
  await db.save('buchungen', { id: 'b-' + re.id, art: 'einnahme', datum, kategorie: typ[2], beschreibung: `${re.nr} – ${(re.empfaenger || '').split('\n')[0]}`,
    brutto: s.brutto, netto: s.netto, ust: s.ust, ustSatz, rechnungId: re.id, contactId: re.contactId || '', propertyId: re.propertyId || '', dealId: re.dealId || '', created: db.get('buchungen', 'b-' + re.id)?.created });
  if (re.contactId) await db.log('system', `Zahlung eingegangen: ${re.nr} (${eur2(s.brutto)})`, { contactId: re.contactId, propertyId: re.propertyId });
}

// Kennzahlen eines Jahres aus den Buchungen
export function jahr(y) {
  const b = db.all('buchungen').filter(x => !x.offen && (x.datum || '').startsWith(String(y)));  // EÜR: erst bei Zahlung
  const sum = (arr, k) => r2(arr.reduce((s, x) => s + (Number(x[k]) || 0), 0));
  const ein = b.filter(x => x.art === 'einnahme'), aus = b.filter(x => x.art === 'ausgabe');
  const monate = Array.from({ length: 12 }, (_, i) => { const m = `${y}-${String(i + 1).padStart(2, '0')}`; return { m, ein: sum(ein.filter(x => x.datum.startsWith(m)), 'netto'), aus: sum(aus.filter(x => x.datum.startsWith(m)), 'netto') }; });
  const kat = {}; aus.forEach(x => { kat[x.kategorie || 'Sonstige Ausgaben'] = r2((kat[x.kategorie || 'Sonstige Ausgaben'] || 0) + (Number(x.netto) || 0)); });
  return { einNetto: sum(ein, 'netto'), ausNetto: sum(aus, 'netto'), ust: sum(ein, 'ust'), vorsteuer: sum(aus, 'ust'), monate, kat, anzahl: b.length };
}

export function bruttoZuNetto(brutto, satz) { const n = r2(Number(brutto) / (1 + Number(satz) / 100)); return { netto: n, ust: r2(Number(brutto) - n) }; }

// ---------- Rechnung drucken / PDF ----------
export function druck(re) {
  const S = db.settings(), s = summen(re), kl = kleinunternehmer();
  const A = u => new URL(u, location.href.replace(/crm\/.*$/, '')).href;
  const absender = [S.firma, S.strasse, [S.plz, S.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const w = window.open('', '_blank'); if (!w) { alert('Pop-up blockiert – bitte erlauben'); return; }
  const steuerZeilen = Object.entries(s.steuern).map(([satz, betrag]) => `<tr><td>zzgl. ${satz} % Umsatzsteuer</td><td>${esc(eur2(betrag))}</td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="de"><meta charset="utf-8"><title>${esc(re.nr)} – Rechnung</title><style>
  @font-face{font-family:Jost;src:url(${A('fonts/jost-var.woff2')}) format('woff2');font-weight:100 900}@font-face{font-family:'Cormorant Garamond';src:url(${A('fonts/cormorant-600.woff2')}) format('woff2');font-weight:500 700}
  @page{size:A4;margin:16mm 18mm 20mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
  body{font-family:Jost,Helvetica,Arial,sans-serif;color:#14110d;font-size:12.5px;line-height:1.5;max-width:780px;margin:0 auto;padding:24px}
  .kopf{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #a8813f;padding-bottom:14px}
  .lk{display:flex;align-items:center;gap:12px}.lk img{height:58px}.lc{display:flex;flex-direction:column;gap:5px}
  .ln{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:22px;letter-spacing:.2em;padding-left:.2em;text-transform:uppercase;color:#9c7f4d;line-height:1;text-align:center}
  .ls{display:flex;align-items:center;gap:8px;font-weight:500;font-size:10.5px;letter-spacing:.5em;text-transform:uppercase;line-height:1}.ls i{flex:1;height:.5px;background:#a8813f;min-width:5px}.ls span{margin-right:-.5em}
  .k{text-align:right;font-size:11px;color:#6b6459;line-height:1.55}
  .adr{display:flex;justify-content:space-between;align-items:flex-start;margin:34px 0 30px;gap:30px}
  .abs{font-size:9.5px;color:#8b8377;border-bottom:.5px solid #cbbd9f;padding-bottom:2px;margin-bottom:8px;display:inline-block}
  .empf{white-space:pre-line;font-size:13px;line-height:1.55}
  .meta{border-collapse:collapse;font-size:12px}.meta td{padding:2px 0 2px 18px}.meta td:first-child{color:#8b8377;padding-left:0}
  h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:30px;letter-spacing:.04em;margin:0 0 4px;color:#14110d}
  .gold{color:#9c7f4d}.anrede{margin:18px 0 14px}
  table.pos{width:100%;border-collapse:collapse;margin:8px 0 0}table.pos th{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#9c7f4d;text-align:left;border-bottom:1px solid #a8813f;padding:8px 6px}
  table.pos td{padding:10px 6px;border-bottom:.5px solid #e2d9c6;vertical-align:top}table.pos td.t{white-space:pre-line}table.pos .r{text-align:right;white-space:nowrap}
  .sum{margin-left:auto;margin-top:10px;border-collapse:collapse;min-width:300px}.sum td{padding:5px 6px}.sum td:last-child{text-align:right;white-space:nowrap}
  .sum tr.g td{border-top:1px solid #a8813f;font-weight:600;font-size:14px;padding-top:9px}.sum tr.g td:last-child{color:#9c7f4d;font-family:'Cormorant Garamond',serif;font-size:22px}
  .hinweis{margin-top:26px;line-height:1.6}.fuss{margin-top:46px;padding-top:12px;border-top:1px solid #a8813f;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;font-size:9.5px;color:#6b6459;line-height:1.55}
  .fuss b{color:#14110d;font-weight:600}.storno{color:#b4483a;font-weight:700;letter-spacing:.2em}
  @media print{body{padding:0}.noprint{display:none}}
  .noprint{position:fixed;top:12px;right:12px}.noprint button{font:inherit;background:#c9a96e;border:0;padding:8px 16px;border-radius:6px;cursor:pointer}
  </style><body><div class="noprint"><button onclick="print()">Drucken / als PDF speichern</button></div>
  <div class="kopf"><div class="lk"><img src="${esc(A('logo/Wappen_gold.svg'))}" alt=""><span class="lc"><span class="ln">Keuerleber</span><span class="ls"><i></i><span>Immobilien</span><i></i></span></span></div>
    <div class="k"><b>${esc(S.inhaber || '')}</b><br>${esc([S.strasse, [S.plz, S.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '))}<br>${esc([S.tel, S.email].filter(Boolean).join(' · '))}<br>${esc(S.web || '')}</div></div>
  <div class="adr"><div><span class="abs">${esc(absender)}</span><div class="empf">${esc(re.empfaenger || '')}</div></div>
    <table class="meta"><tr><td>Rechnungsnummer</td><td><b>${esc(re.nr)}</b></td></tr><tr><td>Rechnungsdatum</td><td>${esc(fmtDate(re.datum))}</td></tr>
    <tr><td>Leistungsdatum</td><td>${esc(fmtDate(re.leistungsdatum || re.datum))}</td></tr>${re.contactId ? `<tr><td>Kunden-Nr.</td><td>${esc((re.contactId || '').slice(0, 8).toUpperCase())}</td></tr>` : ''}
    <tr><td>Fällig am</td><td>${esc(fmtDate(re.faellig))}</td></tr></table></div>
  <h1>${re.status === 'storniert' ? '<span class="storno">STORNIERT</span> ' : ''}Rechnung <span class="gold">${esc(re.nr)}</span></h1>
  ${re.betreff ? `<div>${esc(re.betreff)}</div>` : ''}
  <p class="anrede">${esc(re.anrede || 'Sehr geehrte Damen und Herren,')}<br>${esc(re.einleitung || 'für unsere Leistungen erlauben wir uns, wie folgt abzurechnen:')}</p>
  <table class="pos"><thead><tr><th style="width:36px">Pos.</th><th>Leistung</th><th class="r">Menge</th><th class="r">Einzelpreis</th>${kl ? '' : '<th class="r">USt</th>'}<th class="r">Betrag</th></tr></thead><tbody>
  ${s.pos.map((p, i) => `<tr><td>${i + 1}</td><td class="t">${esc(p.text)}</td><td class="r">${esc(String(p.menge || 1).replace('.', ','))}</td><td class="r">${esc(eur2(p.einzel))}</td>${kl ? '' : `<td class="r">${p.ust} %</td>`}<td class="r">${esc(eur2(p.netto))}</td></tr>`).join('')}
  </tbody></table>
  <table class="sum"><tr><td>${kl ? 'Summe' : 'Nettobetrag'}</td><td>${esc(eur2(s.netto))}</td></tr>${steuerZeilen}<tr class="g"><td>Rechnungsbetrag</td><td>${esc(eur2(s.brutto))}</td></tr></table>
  <div class="hinweis">${kl ? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.<br>' : ''}Bitte überweisen Sie den Rechnungsbetrag bis zum <b>${esc(fmtDate(re.faellig))}</b> ohne Abzug auf das unten genannte Konto. Verwendungszweck: <b>${esc(re.nr)}</b>.${re.notiz ? '<br><br>' + esc(re.notiz).replace(/\n/g, '<br>') : ''}<br><br>Vielen Dank für Ihr Vertrauen.<br>Mit freundlichen Grüßen<br><br>${esc(S.inhaber || '')}<br>${esc(S.firma || '')}</div>
  <div class="fuss"><div><b>${esc(S.firma || '')}</b><br>Inhaber: ${esc(S.inhaber || '')}<br>${esc([S.strasse, [S.plz, S.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</div>
    <div><b>Kontakt</b><br>${esc(S.tel || '')}<br>${esc(S.email || '')}<br>${esc(S.web || '')}</div>
    <div><b>Bankverbindung</b><br>${esc(S.bank || '')}<br>IBAN ${esc(S.iban || '–')}<br>${S.bic ? 'BIC ' + esc(S.bic) + '<br>' : ''}${S.steuernummer ? 'Steuernummer ' + esc(S.steuernummer) + '<br>' : ''}${S.ustId ? 'USt-IdNr. ' + esc(S.ustId) : ''}</div></div>
  </body></html>`);
  w.document.close();
}

// Pflichtangaben, die für eine ordnungsgemäße Rechnung (§ 14 UStG) noch fehlen
export function fehlendeAngaben() {
  const S = db.settings(), f = [];
  if (!S.strasse || !S.plz || !S.ort) f.push('Firmenanschrift');
  if (!S.steuernummer && !S.ustId) f.push('Steuernummer oder USt-IdNr.');
  if (!S.iban) f.push('IBAN');
  return f;
}
export const neueRechnung = (extra = {}) => ({ nr: naechsteNr(), datum: today(), leistungsdatum: today(), faellig: addDays(today(), Number(db.settings().zahlungsziel) || 14), status: 'offen', typ: 'frei', positionen: [], ...extra });
export { fullName, adresse };
