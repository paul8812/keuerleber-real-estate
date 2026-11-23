// Fahrtenbuch – Logik: Fahrten (automatisch per CarPlay/iPhone oder von Hand), Benennen mit Vorschlägen,
// Festschreiben + Änderungsprotokoll (Nachweis fürs Finanzamt) und die Kostenrechnung für ein Privatauto mit betrieblicher Nutzung:
//   • Geschäftsfahrten: 0,30 € je km pauschal ODER tatsächliche Kosten je km × geschäftliche km (das Günstigere wird empfohlen)
//   • Wohnung ↔ Betriebsstätte (falls eigene Betriebsstätte): Entfernungspauschale 0,38 € je Entfernungs-km und Tag (ab 2026)
//   • Parken, Maut, Fähre bei Geschäftsfahrten zusätzlich absetzbar
// Datensätze: Sammlung 'fahrten'; Fahrzeug, Zuhause, Kilometerstände in settings.fahrzeug.
import * as db from './db.js';
import { today, addDays, uid, iso } from './util.js';

export const ARTEN = {
  geschaeftlich: { name: 'Geschäftlich', kurz: 'Geschäftl.', farbe: '#c9a96e', icon: '💼' },
  privat: { name: 'Privat', kurz: 'Privat', farbe: '#8f98a3', icon: '🏡' },
  arbeitsweg: { name: 'Wohnung ↔ Betrieb', kurz: 'Arbeitsweg', farbe: '#5fa8d3', icon: '🏢' },
};
export const PAUSCHALE_KM = 0.30;                   // § 5 Abs. 2 BRKG, R 4.12 EStR: Privatfahrzeug, betriebliche Fahrt
export const entfernungssatz = (jahr, km) => Number(jahr) >= 2026 ? 0.38 : (km <= 20 ? 0.30 : 0.38);  // ab 2026 ab dem 1. km
export const FESTSCHREIBEN_TAGE = 7;                // danach nur noch mit Grund änderbar (protokolliert)
export const NAH_M = 180;                           // gleicher Ort, wenn näher als …
const ZUSATZ = /park|parkhaus|parkplatz|apcoa|contipark|easypark|parkster|maut|vignette|toll|fähre|faehre|ferry|tunnel/i;

// ---------------------------------------------------------------- Grundlagen
// Foto des Mokka Black (von Paul ausgewählt, Carscoops) – wird nur verlinkt, nicht kopiert; ein eigenes Foto ersetzt es
export const PRESSEFOTO = 'https://www.carscoops.com/wp-content/uploads/2023/04/Vauxhall-Mokka-Black-Edition-main.jpg';
export const fahrzeug = () => {
  const f = db.settings().fahrzeug || {};
  return { name: 'Opel Mokka Black Edition', baujahr: '2023', antrieb: '130 PS · Automatik', kennzeichen: '', fotoId: '', vermoegen: 'privat',
    finanzierung: 'leasing', kaufpreis: '', kaufdatum: '', nutzungsdauer: 6, kmStaende: [], zuhause: null, betrieb: null, entfernungKm: '', kosten: {}, ...f,
    leasing: { beginn: '', laufzeit: '', rate: '', sonderzahlung: '', freiKmJahr: '', kmUebernahme: '', mehrKmCt: '', minderKmCt: '', ...(f.leasing || {}) } };
};

// ---------------------------------------------------------------- Kostenplan (Vorgabe für Opel Mokka 1.2 DI Turbo Black Automatik)
// Werte laut ADAC-Autokatalog bzw. Schätzung – bis Vertrag/Police eingetragen ist oder Belege kommen. Belege, deren Lieferant/Beschreibung
// zum Stichwort passt, ersetzen im jeweiligen Jahr die Schätzung automatisch.
export const RHYTHMUS = { monat: 'pro Monat', jahr: 'pro Jahr', '100km': 'je 100 km' };
export const STANDARD_KOSTEN = [
  { id: 'versicherung', name: 'Kfz-Versicherung (Vollkasko)', betrag: 1200, rhythmus: 'jahr', geschaetzt: true, stichwort: 'versicherung|police|huk|allianz|axa|devk|ergo|lvm|r\\+v|generali|vhv|signal iduna|cosmos|gothaer|zurich|württembergische|provinzial|sparkassen.?vers', hinweis: 'Beim Leasing Pflicht. Typklassen 19/19/22 – Beitrag aus deiner Police eintragen.' },
  { id: 'steuer', name: 'Kfz-Steuer', betrag: 101, rhythmus: 'jahr', geschaetzt: false, stichwort: 'kfz.?steuer|kraftfahrzeugsteuer|hauptzollamt|zollamt', hinweis: 'Laut ADAC für 1.2 Turbo, 1.199 cm³, 132 g CO₂/km.' },
  { id: 'kraftstoff', name: 'Kraftstoff (Super E10)', betrag: 11.7, rhythmus: '100km', geschaetzt: true, stichwort: 'tank|shell|aral|esso|\\bjet\\b|totalenergies|\\btotal\\b|agip|\\beni\\b|bft|avia|\\bomv\\b|orlen|\\bstar\\b|\\bhem\\b|raiffeisen|kraftstoff|benzin|super e|diesel', hinweis: '≈ 6,8 l/100 km im Alltag (WLTP 5,9) × 1,72 €/l. Tankbelege ersetzen die Schätzung.' },
  { id: 'wartung', name: 'Inspektion & Verschleiß', betrag: 300, rhythmus: 'jahr', geschaetzt: true, stichwort: 'inspektion|werkstatt|autohaus|kundendienst|ölwechsel|oelwechsel|bremse|\\batu\\b|pit.?stop|euromaster|opel', hinweis: 'Auf 0 setzen, wenn ein Wartungspaket im Leasing enthalten ist.' },
  { id: 'reifen', name: 'Reifen, Räderwechsel & Einlagerung', betrag: 150, rhythmus: 'jahr', geschaetzt: true, stichwort: 'reifen|räderwechsel|raederwechsel|radwechsel|einlagerung|vergölst|vergoelst', hinweis: 'Winterreifen beim Leasing meist selbst zu stellen.' },
  { id: 'hu', name: 'HU/AU (TÜV)', betrag: 70, rhythmus: 'jahr', geschaetzt: true, stichwort: 'tüv|tuev|dekra|gtü|gtue|\\bkües\\b|hauptuntersuchung', hinweis: '≈ 140 € alle 2 Jahre; erste HU 3 Jahre nach Erstzulassung (bei Bj. 2023 also 2026).' },
  { id: 'pflege', name: 'Wäsche & Pflege', betrag: 120, rhythmus: 'jahr', geschaetzt: true, stichwort: 'waschstra|autowäsche|autowaesche|waschanlage|car.?wash|waschpark|pflege', hinweis: '' },
];
const LEASING_WORT = /leasing|sonderzahlung|stellantis bank|opel bank|psa bank|leasys|ayvens|\bald\b|ca auto bank|santander consumer/i;
/** Alle Kostenposten des Fahrzeugs: Leasingrate + Sonderzahlung (aus dem Vertrag) und der Kostenplan (Vorgabe + eigene Werte) */
export function kostenPosten(fz = fahrzeug()) {
  const L = fz.leasing || {}, out = [];
  if (fz.finanzierung === 'leasing') {
    out.push({ id: 'leasingrate', name: 'Leasingrate', betrag: zahl(L.rate) || 0, rhythmus: 'monat', vertrag: true, fehlt: !zahl(L.rate), hinweis: 'aus dem Leasingvertrag' });
    if (zahl(L.sonderzahlung)) out.push({ id: 'sonderzahlung', name: `Sonderzahlung (verteilt auf ${zahl(L.laufzeit) || '?'} Monate)`, betrag: zahl(L.laufzeit) ? r2(zahl(L.sonderzahlung) / zahl(L.laufzeit)) : 0, rhythmus: 'monat', vertrag: true, hinweis: `einmalig ${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(zahl(L.sonderzahlung))} €` });
  }
  for (const k of STANDARD_KOSTEN) { const e = (fz.kosten || {})[k.id] || {}; out.push({ ...k, ...e, betrag: zahl(e.betrag ?? k.betrag) ?? 0, geschaetzt: e.betrag != null ? !!e.geschaetzt : k.geschaetzt }); }
  for (const e of Object.values(fz.kosten || {})) if (e.eigen && e.name) out.push({ stichwort: '', ...e, betrag: zahl(e.betrag) || 0 });
  return out;
}
/** Beleg einem Kostenposten zuordnen (oder 'leasing' = durch den Vertrag abgedeckt, '' = sonstiger Kfz-Beleg) */
export function postenFuer(b, posten = kostenPosten()) {
  const t = `${b.lieferant || ''} ${b.beschreibung || ''}`;
  if (fahrzeug().finanzierung === 'leasing' && LEASING_WORT.test(t)) return 'leasing';
  for (const p of posten) if (p.stichwort && new RegExp(p.stichwort, 'i').test(t)) return p.id;
  return '';
}
const tageZwischen = (a, b) => Math.max(0, Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5) + 1);
/** geplante Kosten eines Postens im Zeitraum [von, bis] bei km gefahrenen Kilometern */
function planBetrag(p, von, bis, kmZ, fz) {
  let v = von, b = bis;
  if (p.vertrag) {   // Leasing nur innerhalb der Vertragslaufzeit
    const L = fz.leasing || {};
    if (L.beginn) { if (L.beginn > v) v = L.beginn; if (zahl(L.laufzeit)) { const e = new Date(L.beginn + 'T12:00:00'); e.setMonth(e.getMonth() + zahl(L.laufzeit)); const ende = addDays(iso(e), -1); if (ende < b) b = ende; } }
  }
  const tage = v <= b ? tageZwischen(v, b) : 0;
  if (p.rhythmus === 'monat') return p.betrag * tage / 30.4375;
  if (p.rhythmus === 'jahr') return p.betrag * tage / 365;
  if (p.rhythmus === '100km') return p.betrag * (kmZ || 0) / 100;
  return 0;
}
/** Kosten im Zeitraum: je Posten Belege (falls vorhanden) sonst Plan; dazu sonstige Kfz-Belege und ggf. AfA */
export function kostenImZeitraum(von, bis, kmZ, fz = fahrzeug()) {
  const posten = kostenPosten(fz);
  const belege = (db.all('buchungen') || []).filter(b => istKfzBeleg(b) && !b.offen && !istZusatz(b) && b.datum >= von && b.datum <= bis);
  const zu = new Map(); for (const b of belege) { const id = postenFuer(b, posten); if (!zu.has(id)) zu.set(id, []); zu.get(id).push(b); }
  const zeilen = posten.map(p => {
    const bel = zu.get(p.id) || [];
    const betrag = bel.length ? bel.reduce((s, b) => s + kostenBetrag(b), 0) : planBetrag(p, von, bis, kmZ, fz);
    return { ...p, wert: r2(betrag), quelle: bel.length ? 'Belege' : p.vertrag ? 'Vertrag' : p.geschaetzt ? 'Schätzung' : 'Vorgabe', belege: bel.length };
  });
  const sonstige = r2((zu.get('') || []).reduce((s, b) => s + kostenBetrag(b), 0));
  const abgedeckt = r2((zu.get('leasing') || []).reduce((s, b) => s + kostenBetrag(b), 0));
  const jahre = new Set([von.slice(0, 4), bis.slice(0, 4)]);
  let afaW = 0; if (fz.finanzierung === 'kauf') for (const j of jahre) afaW += afa(j, fz) * Math.min(1, tageZwischen(von > `${j}-01-01` ? von : `${j}-01-01`, bis < `${j}-12-31` ? bis : `${j}-12-31`) / 365);
  const summe = r2(zeilen.reduce((s, z) => s + z.wert, 0) + sonstige + afaW);
  return { zeilen, sonstige, abgedeckt, afa: r2(afaW), summe };
}
/** Kostenplan: was das Auto im Monat / Jahr / je km kostet (bei erwarteter Jahresfahrleistung) */
export function kostenplan(fz = fahrzeug(), kmJahr) {
  const km = zahl(kmJahr) || zahl(fz.leasing?.freiKmJahr) || 15000;
  const zeilen = kostenPosten(fz).map(p => {
    const jahr = p.rhythmus === 'monat' ? p.betrag * 12 : p.rhythmus === 'jahr' ? p.betrag : p.betrag * km / 100;
    return { ...p, jahr: r2(jahr), monat: r2(jahr / 12) };
  });
  const afaJ = fz.finanzierung === 'kauf' && zahl(fz.kaufpreis) ? r2(zahl(fz.kaufpreis) / (zahl(fz.nutzungsdauer) || 6)) : 0;
  const jahr = r2(zeilen.reduce((s, z) => s + z.jahr, 0) + afaJ);
  return { km, zeilen, afa: afaJ, jahr, monat: r2(jahr / 12), proKm: km ? jahr / km : 0, unvollstaendig: zeilen.some(z => z.fehlt) };
}
/** Leasing: Freikilometer im Blick – gefahren, erlaubt bis heute, Prognose bis Vertragsende, Mehr-/Minderkilometer */
export function leasingStand(fz = fahrzeug(), heute = today()) {
  const L = fz.leasing || {};
  if (fz.finanzierung !== 'leasing' || !L.beginn || !zahl(L.laufzeit) || !zahl(L.freiKmJahr)) return null;
  const e = new Date(L.beginn + 'T12:00:00'); e.setMonth(e.getMonth() + zahl(L.laufzeit)); const ende = iso(e);
  const gesamtTage = tageZwischen(L.beginn, ende), bisher = Math.min(gesamtTage, tageZwischen(L.beginn, heute));
  const frei = zahl(L.freiKmJahr) * zahl(L.laufzeit) / 12;
  const st = kmStaende().filter(s => s.datum >= L.beginn), letzter = st[st.length - 1];
  const start = zahl(L.kmUebernahme) ?? null;
  let gefahren = null, quelle = '';
  if (letzter && start != null) { gefahren = zahl(letzter.km) - start; quelle = `Kilometerstand ${letzter.datum}`; }
  else { gefahren = r1(alle().filter(f => tag(f) >= L.beginn).reduce((s, f) => s + km(f), 0)); quelle = 'aufgezeichnete Fahrten'; }
  const stichtag = letzter && start != null ? letzter.datum : heute;
  const tageBisStand = Math.max(1, tageZwischen(L.beginn, stichtag));
  const erlaubtBisher = Math.round(frei * Math.min(1, bisher / gesamtTage));
  const prognose = Math.round(gefahren / tageBisStand * gesamtTage);
  const diff = prognose - frei;
  return { ende, frei: Math.round(frei), gefahren: Math.round(gefahren), quelle, erlaubtBisher, prognose, diff: Math.round(diff),
    kosten: diff > 0 ? r2(diff * (zahl(L.mehrKmCt) || 0) / 100) : -r2(-diff * (zahl(L.minderKmCt) || 0) / 100),
    anteilZeit: bisher / gesamtTage, anteilKm: frei ? gefahren / frei : 0, restMonate: Math.max(0, Math.round((gesamtTage - bisher) / 30.4)) };
}
export const fahrzeugSpeichern = async patch => db.saveSettings({ ...db.settings(), fahrzeug: { ...fahrzeug(), ...patch } });
export const eingerichtet = () => !!db.settings().fahrzeug || (db.all('fahrten') || []).length > 0;

export function abstandM(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const R = 6371000, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const r1 = n => Math.round(n * 10) / 10, r2 = n => Math.round(n * 100) / 100;
/** „12,4“ → 12.4 · „45.678“ (Tausenderpunkt) → 45678 · „1.234,5“ → 1234.5 · 12.4 → 12.4 */
export const zahl = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').trim().replace(/\s|km|€/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s); return Number.isFinite(n) ? n : null;
};

/** Gefahrene km einer Fahrt: von Hand > Kilometerstand-Differenz > Route > Luftlinie × 1,3 */
export function km(f) {
  if (zahl(f.kmManuell) != null) return r1(zahl(f.kmManuell));
  if (zahl(f.kmStart) != null && zahl(f.kmEnde) != null && zahl(f.kmEnde) >= zahl(f.kmStart)) return r1(zahl(f.kmEnde) - zahl(f.kmStart));
  if (zahl(f.kmRoute) != null) return r1(zahl(f.kmRoute));
  const d = abstandM(f.start, f.ende); return Number.isFinite(d) ? r1(d / 1000 * 1.3) : 0;
}
export const kmQuelle = f => zahl(f.kmManuell) != null ? 'von Hand' : (zahl(f.kmStart) != null && zahl(f.kmEnde) != null) ? 'Kilometerstand' : zahl(f.kmRoute) != null ? 'Route' : 'geschätzt';
export const beginn = f => f.start?.zeit || f.ende?.zeit || f.erstellt || '';
export const tag = f => { const z = beginn(f); return z ? (z.length > 10 ? iso(new Date(z)) : z) : ''; };
export const ortName = (p, fallback = '') => {
  if (!p) return fallback || 'unbekannt';
  const fz = fahrzeug();
  if (fz.zuhause && abstandM(p, fz.zuhause) < NAH_M) return 'Zuhause';
  if (fz.betrieb && abstandM(p, fz.betrieb) < NAH_M) return fz.betrieb.name || 'Büro';
  return p.adresse || (p.lat != null ? `${Number(p.lat).toFixed(4)}, ${Number(p.lon).toFixed(4)}` : (fallback || 'unbekannt'));
};
/** Anzeige „Von“ / „Nach“ – eigene Bezeichnung vor Adresse */
export const vonText = (f, fb = 'Start unbekannt') => f.startText || ortName(f.start, fb);
export const nachText = (f, fb = 'Ziel unbekannt') => f.ziel || ortName(f.ende, fb);
/** Häufige Ziele aus bisherigen Fahrten (für „Fahrt eintragen“) */
export function haeufigeZiele(n = 8) {
  const m = new Map();
  for (const f of alle()) {
    if (f.status !== 'erfasst') continue;
    const t = nachText(f, ''); if (!t || t === 'Zuhause') continue;
    const e = m.get(t) || { text: t, n: 0, km: [], punkt: f.ende?.lat != null ? f.ende : null, art: f.art, zweck: f.zweck, partner: f.partner, contactId: f.contactId, propertyId: f.propertyId };
    e.n++; e.km.push(km(f)); m.set(t, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, n).map(e => ({ ...e, kmTyp: e.km.sort((x, y) => x - y)[Math.floor(e.km.length / 2)] }));
}
export const kartenLink = f => f.start?.lat != null && f.ende?.lat != null
  ? `https://www.google.com/maps/dir/?api=1&origin=${f.start.lat},${f.start.lon}&destination=${f.ende.lat},${f.ende.lon}&travelmode=driving`
  : f.ende?.lat != null ? `https://www.google.com/maps/search/?api=1&query=${f.ende.lat},${f.ende.lon}` : '';

export const alle = () => (db.all('fahrten') || []).filter(f => f.status !== 'verworfen');
export const offene = () => alle().filter(f => f.status === 'offen').sort((a, b) => beginn(b).localeCompare(beginn(a)));
export const unterwegs = () => alle().filter(f => f.status === 'unterwegs').sort((a, b) => beginn(b).localeCompare(beginn(a)))[0] || null;
export const imJahr = j => alle().filter(f => tag(f).startsWith(String(j))).sort((a, b) => beginn(a).localeCompare(beginn(b)));
export const jahre = () => { const s = new Set([today().slice(0, 4)]); alle().forEach(f => tag(f) && s.add(tag(f).slice(0, 4))); return [...s].sort().reverse(); };

/** Festgeschrieben: erfasst und älter als 7 Tage (seit Erfassung bzw. Fahrt) – Änderungen dann nur mit Grund */
export function festgeschrieben(f) {
  if (f.status !== 'erfasst') return false;
  const ref = [f.erfasstAm, beginn(f)].filter(Boolean).sort().pop();
  return !!ref && Date.now() - new Date(ref).getTime() > FESTSCHREIBEN_TAGE * 864e5;
}

// ---------------------------------------------------------------- Speichern mit Protokoll
const PROTOKOLL = ['art', 'zweck', 'partner', 'contactId', 'propertyId', 'ziel', 'umweg', 'kmManuell', 'kmStart', 'kmEnde', 'status', 'startText', 'datum', 'abfahrt'];
const gleich = (a, b) => String(a ?? '') === String(b ?? '');
/** Speichert Änderungen; bei bereits erfassten Fahrten wird jede Änderung mit Zeit (und Grund) protokolliert. */
export async function speichern(f, patch, { grund = '' } = {}) {
  const alt = db.get('fahrten', f.id) || f;
  const neu = { ...alt, ...patch };
  // Datum/Uhrzeit nur bei von Hand eingetragenen Fahrten änderbar (GPS-Fahrten behalten die Serverzeit)
  if (('datum' in patch || 'abfahrt' in patch) && alt.quelle === 'hand') {
    const d = patch.datum || alt.datum || tag(alt), hm = 'abfahrt' in patch ? patch.abfahrt : (alt.abfahrt || '');
    const z = new Date(`${d}T${hm || '12:00'}:00`).toISOString();
    neu.datum = d; neu.abfahrt = hm;
    neu.start = { ...(alt.start || {}), zeit: z, zeitUngefaehr: !hm };
    neu.ende = { ...(alt.ende || {}), zeit: alt.minRoute ? new Date(new Date(z).getTime() + alt.minRoute * 60000).toISOString() : z, zeitUngefaehr: !hm };
  } else if ('datum' in patch || 'abfahrt' in patch) {
    for (const k of ['datum', 'abfahrt']) { if (k in alt) neu[k] = alt[k]; else delete neu[k]; delete patch[k]; }
  }
  if (alt.status === 'erfasst') {
    const felder = {};
    for (const k of PROTOKOLL) if (k in patch && !gleich(alt[k], patch[k])) felder[k] = [alt[k] ?? '', patch[k] ?? ''];
    if (!Object.keys(felder).length) return alt;
    if (festgeschrieben(alt) && !grund) throw new Error('Diese Fahrt ist festgeschrieben – bitte einen Grund für die Korrektur angeben.');
    neu.historie = [...(alt.historie || []), { zeit: new Date().toISOString(), felder, grund: grund || '' }];
  }
  return db.save('fahrten', neu);
}
/** Fahrt benennen (erfassen) */
export async function erfassen(f, { art, zweck = '', partner = '', contactId = '', propertyId = '', ziel = '', umweg = '', kmManuell }, opt = {}) {
  if (!ARTEN[art]) throw new Error('Bitte Geschäftlich, Privat oder Wohnung ↔ Betrieb wählen.');
  if (art === 'geschaeftlich' && !String(zweck).trim()) throw new Error('Bitte den Anlass der Geschäftsfahrt angeben (z. B. „Besichtigung ETW Hof“).');
  const patch = { art, zweck: String(zweck).trim(), partner: String(partner).trim(), contactId, propertyId, ziel: String(ziel).trim(), umweg: String(umweg).trim() };
  if (kmManuell !== undefined) patch.kmManuell = kmManuell === '' ? '' : zahl(kmManuell) ?? '';   // nicht übergeben = bisherigen Wert behalten
  const war = db.get('fahrten', f.id) || f;
  if (war.status !== 'erfasst') Object.assign(patch, { status: 'erfasst', erfasstAm: new Date().toISOString() });
  return speichern(war, patch, opt);
}
export async function verwerfen(f, grund) {
  if (!String(grund || '').trim()) throw new Error('Bitte kurz begründen (z. B. „nicht selbst gefahren“).');
  const alt = db.get('fahrten', f.id) || f;
  return db.save('fahrten', { ...alt, status: 'verworfen', verworfenAm: new Date().toISOString(), verworfenGrund: String(grund).trim(), historie: [...(alt.historie || []), { zeit: new Date().toISOString(), felder: { status: [alt.status, 'verworfen'] }, grund: String(grund).trim() }] });
}
/** Zwei aufeinanderfolgende Fahrten (z. B. mit Tankstopp) zu einer zusammenfassen */
export async function zusammenfassen(a, b) {
  const [x, y] = [a, b].sort((p, q) => beginn(p).localeCompare(beginn(q)));
  if (x.status === 'erfasst' && festgeschrieben(x)) throw new Error('Festgeschriebene Fahrten können nicht zusammengefasst werden.');
  const neu = { ...x, ende: y.ende, kmRoute: r1(km(x) + km(y)), minRoute: (x.minRoute || 0) + (y.minRoute || 0), zwischenhalt: [...(x.zwischenhalt || []), x.ende?.adresse || ortName(x.ende)].filter(Boolean), zusammengefasst: [...(x.zusammengefasst || []), y.id], status: y.status === 'unterwegs' ? 'unterwegs' : (x.status === 'erfasst' ? 'erfasst' : 'offen') };
  delete neu.kmManuell;
  await db.save('fahrten', neu);
  await db.save('fahrten', { ...y, status: 'verworfen', verworfenGrund: 'zusammengefasst mit vorheriger Fahrt', verworfenAm: new Date().toISOString(), teilVon: x.id });
  return neu;
}
/** Fahrt von Hand nachtragen */
export async function nachtragen({ datum, zeit = '', von, nach, vonPunkt = null, nachPunkt = null, kmWert, kmStart = '', kmEnde = '', art, zweck = '', partner = '', contactId = '', propertyId = '', minRoute = null }) {
  const z = new Date(`${datum}T${zeit || '12:00'}:00`).toISOString();
  const f = { id: 'fahrt-' + uid(), quelle: 'hand', erstellt: new Date().toISOString(), datum, abfahrt: zeit, kmStart: zahl(kmStart) ?? '', kmEnde: zahl(kmEnde) ?? '',
    start: { ...(vonPunkt || {}), zeit: z, adresse: vonPunkt?.adresse || von, zeitUngefaehr: !zeit },
    ende: { ...(nachPunkt || {}), zeit: minRoute ? new Date(new Date(z).getTime() + minRoute * 60000).toISOString() : z, adresse: nachPunkt?.adresse || nach, zeitUngefaehr: !zeit },
    kmManuell: zahl(kmWert) ?? '', minRoute: minRoute || null, status: 'offen' };
  await db.save('fahrten', f);
  return erfassen(f, { art, zweck, partner, contactId, propertyId, ziel: nach === 'Zuhause' || !nach ? '' : nach });
}

// ---------------------------------------------------------------- Vorschläge zum Benennen
const norm = s => String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/str\.?(\s|,|$)/g, 'strasse$1').replace(/[^a-z0-9äöü ]/g, ' ').replace(/\s+/g, ' ').trim();
const strasse = s => norm(String(s || '').split(',')[0]).replace(/\s*\d+\s*[a-z]?$/, '').trim();
function adressTreffer(adr, rec) {
  if (!adr || !rec?.strasse) return false;
  const a = norm(adr), s = strasse(rec.strasse);
  if (!s || s.length < 4 || !a.includes(s)) return false;
  return !rec.ort || a.includes(norm(rec.ort)) || (rec.plz && a.includes(rec.plz));
}
const minuten = hhmm => { const [h, m] = String(hhmm || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
/** Vorschläge für eine Fahrt: Termin am Ziel, Kontakt/Objekt an der Zieladresse, früher hier, Heimfahrt */
export function vorschlaege(f) {
  const out = [], fz = fahrzeug(), t = tag(f), ankunft = f.ende?.zeit ? new Date(f.ende.zeit) : null;
  const dazu = v => { if (!out.some(o => o.zweck === v.zweck && o.art === v.art)) out.push(v); };
  const nachHause = fz.zuhause && abstandM(f.ende, fz.zuhause) < NAH_M;
  // 1. Termin im Kalender kurz nach der Ankunft (bis 45 Min. vorher … 3 Std. danach)
  if (ankunft && !nachHause) {
    const am = ankunft.getHours() * 60 + ankunft.getMinutes();
    for (const e of db.all('events') || []) {
      if (e.datum !== t) continue;
      const s = minuten(e.start); if (s == null || s < am - 45 || s > am + 180) continue;
      const c = e.contactId ? db.get('contacts', e.contactId) : null, p = e.propertyId ? db.get('properties', e.propertyId) : null;
      dazu({ quelle: 'Termin ' + e.start, art: 'geschaeftlich', zweck: e.titel || e.art || 'Termin', partner: c ? [c.vorname, c.nachname].filter(Boolean).join(' ') || c.firma : '', contactId: e.contactId || '', propertyId: e.propertyId || '', ziel: e.ort || '' });
    }
  }
  // 2. Zieladresse = Objekt oder Kontakt
  const adr = f.ende?.adresse || '';
  if (adr && !nachHause) {
    for (const p of db.all('properties') || []) if (adressTreffer(adr, p)) dazu({ quelle: 'Objekt', art: 'geschaeftlich', zweck: `Objekttermin ${p.titel || p.strasse}`, partner: '', propertyId: p.id, ziel: [p.strasse, p.ort].filter(Boolean).join(', ') });
    for (const c of db.all('contacts') || []) if (adressTreffer(adr, c)) dazu({ quelle: 'Kontakt', art: 'geschaeftlich', zweck: `Termin bei ${[c.vorname, c.nachname].filter(Boolean).join(' ') || c.firma}`, partner: [c.vorname, c.nachname].filter(Boolean).join(' ') || c.firma, contactId: c.id, ziel: [c.strasse, c.ort].filter(Boolean).join(', ') });
  }
  // 3. Heimfahrt: gleiche Art wie die Fahrt davor (Rückfahrt vom Kunden ist ebenfalls geschäftlich)
  if (nachHause) {
    const vorher = alle().filter(x => x.id !== f.id && x.status === 'erfasst' && beginn(x) < beginn(f) && tag(x) === t).sort((a, b) => beginn(b).localeCompare(beginn(a)))[0];
    if (vorher && vorher.art === 'geschaeftlich') dazu({ quelle: 'Rückfahrt', art: 'geschaeftlich', zweck: `Rückfahrt: ${vorher.zweck}`, partner: vorher.partner || '', contactId: vorher.contactId || '', propertyId: vorher.propertyId || '', ziel: 'Zuhause' });
    else if (vorher && vorher.art === 'arbeitsweg') dazu({ quelle: 'Rückfahrt', art: 'arbeitsweg', zweck: 'Heimfahrt vom Betrieb', ziel: 'Zuhause' });
  }
  if (fz.betrieb && abstandM(f.ende, fz.betrieb) < NAH_M && fz.zuhause && abstandM(f.start, fz.zuhause) < NAH_M) dazu({ quelle: 'Betrieb', art: 'arbeitsweg', zweck: 'Fahrt zum Betrieb', ziel: fz.betrieb.name || 'Büro' });
  // 4. Früher an diesem Ort (gleiches Ziel, zuletzt benannt)
  const frueher = alle().filter(x => x.id !== f.id && x.status === 'erfasst' && abstandM(x.ende, f.ende) < NAH_M).sort((a, b) => beginn(b).localeCompare(beginn(a)));
  for (const x of frueher.slice(0, 2)) dazu({ quelle: 'zuletzt hier', art: x.art, zweck: x.zweck || (x.art === 'privat' ? 'Privatfahrt' : ''), partner: x.partner || '', contactId: x.contactId || '', propertyId: x.propertyId || '', ziel: x.ziel || '' });
  return out.slice(0, 5);
}
/** Zuletzt benutzte Anlässe (für die Auswahlliste) */
export const letzteZwecke = () => [...new Set(alle().filter(f => f.status === 'erfasst' && f.zweck).sort((a, b) => beginn(b).localeCompare(beginn(a))).map(f => f.zweck))].slice(0, 25);

// ---------------------------------------------------------------- Kilometerstände
/** alle Kilometerstände: von Hand eingetragen + aus Belegen (Werkstatt/TÜV, von der KI gelesen) */
export function kmStaende() {
  const fz = fahrzeug();
  const hand = (fz.kmStaende || []).map(s => ({ ...s, quelle: s.quelle || 'eingetragen' }));
  const belege = (db.all('buchungen') || []).filter(b => zahl(b.kmStand) != null && b.datum).map(b => ({ id: 'b:' + b.id, datum: b.datum, km: zahl(b.kmStand), quelle: 'Beleg: ' + (b.lieferant || b.beschreibung || '') }));
  return [...hand, ...belege].filter(s => s.datum && zahl(s.km) != null).sort((a, b) => a.datum.localeCompare(b.datum) || zahl(a.km) - zahl(b.km));
}

// ---------------------------------------------------------------- Kosten & Abzug
export const istKfzBeleg = b => b.art === 'ausgabe' && b.kategorie === 'Fahrzeug & Fahrtkosten';
export const istZusatz = b => ZUSATZ.test(`${b.lieferant || ''} ${b.beschreibung || ''}`);
/** Privatwagen-Modus: Kfz-Belege sind keine direkten Betriebsausgaben, statt dessen Fahrtkosten lt. Fahrtenbuch */
export const privatwagen = () => !!db.settings().fahrzeug && fahrzeug().vermoegen !== 'betrieb';
const kostenBetrag = b => db.settings().kleinunternehmer ? Number(b.brutto) || 0 : (Number(b.netto ?? b.brutto) || 0);

/** AfA (linear) für das Jahr j */
export function afa(j, fz = fahrzeug()) {
  const preis = zahl(fz.kaufpreis), nd = zahl(fz.nutzungsdauer) || 6;
  if (!preis || !fz.kaufdatum) return 0;
  const k = new Date(fz.kaufdatum + 'T12:00:00'), y = Number(j), jahrK = k.getFullYear();
  if (y < jahrK) return 0;
  const monateGesamt = nd * 12, schonVorher = y === jahrK ? 0 : (12 - k.getMonth()) + (y - jahrK - 1) * 12;
  const monateJahr = y === jahrK ? 12 - k.getMonth() : 12;
  const rest = Math.max(0, monateGesamt - schonVorher);
  return r2(preis / monateGesamt * Math.min(monateJahr, rest));
}

/** Komplette Auswertung eines Jahres */
export function auswertung(j) {
  const F = imJahr(j), fz = fahrzeug();
  const sum = (arr) => r1(arr.reduce((s, f) => s + km(f), 0));
  const erf = F.filter(f => f.status === 'erfasst');
  const g = erf.filter(f => f.art === 'geschaeftlich'), p = erf.filter(f => f.art === 'privat'), a = erf.filter(f => f.art === 'arbeitsweg');
  const offen = F.filter(f => f.status !== 'erfasst');
  const kmG = sum(g), kmP = sum(p), kmA = sum(a), kmOffen = sum(offen), kmErfasst = r1(kmG + kmP + kmA + kmOffen);
  // Gesamtfahrleistung: Kilometerstände (wenn ≥ 2 im Jahr) zeigen auch Fahrten, die nicht aufgezeichnet wurden
  const st = kmStaende().filter(s => s.datum.startsWith(String(j)));
  let nichtErfasst = 0, odo = null;
  if (st.length >= 2) {
    const s0 = st[0], s1 = st[st.length - 1], dist = zahl(s1.km) - zahl(s0.km);
    const imZeitraum = sum(F.filter(f => tag(f) >= s0.datum && tag(f) <= s1.datum));
    if (dist > 0) { odo = { von: s0, bis: s1, km: dist }; nichtErfasst = r1(Math.max(0, dist - imZeitraum)); }
  }
  const kmGesamt = r1(kmErfasst + nichtErfasst);
  const belege = (db.all('buchungen') || []).filter(b => istKfzBeleg(b) && !b.offen && (b.datum || '').startsWith(String(j)));
  const laufend = belege.filter(b => !istZusatz(b)), zusatz = belege.filter(b => istZusatz(b));
  const kBelege = r2(laufend.reduce((s, b) => s + kostenBetrag(b), 0));
  const kZusatzAlle = r2(zusatz.reduce((s, b) => s + kostenBetrag(b), 0));
  // Kosten im Jahr bis heute (bzw. ganzes Jahr, wenn vorbei): je Posten Belege oder Plan (Leasing, Versicherung, Steuer …)
  const bisJ = String(j) < today().slice(0, 4) ? `${j}-12-31` : today();
  const kJahr = kostenImZeitraum(`${j}-01-01`, bisJ, kmGesamt, fz);
  const kAfa = kJahr.afa, kGesamt = kJahr.summe, kFix = 0;
  // Kosten je km nur mit Kilometerständen: Kosten im Zeitraum zwischen erstem und letztem Stand geteilt durch die laut Tacho
  // gefahrenen km – sonst verzerrt (fixe Kosten auf wenige aufgezeichnete km).
  let proKm = 0, kostenZeitraum = 0, zeitraumTage = 0, kZeitraum = null;
  if (odo) {
    zeitraumTage = Math.max(1, tageZwischen(odo.von.datum, odo.bis.datum) - 1);
    kZeitraum = kostenImZeitraum(odo.von.datum, odo.bis.datum, odo.km, fz);
    kostenZeitraum = kZeitraum.summe;
    proKm = kostenZeitraum / odo.km;
  }
  const pauschal = r2(kmG * PAUSCHALE_KM), tatsaechlich = r2(kmG * proKm);
  // Ohne Kilometerstände: vorläufiger Satz aus dem Kostenplan (nur zur Orientierung, wird nicht angesetzt)
  const plan = kostenplan(fz), vorl = odo ? null : { proKm: plan.proKm, betrag: r2(kmG * plan.proKm), kmJahr: plan.km, mehr: r2(Math.max(0, kmG * plan.proKm - pauschal)) };
  const methode = tatsaechlich > pauschal ? 'tatsaechlich' : 'pauschal';
  const satz = methode === 'tatsaechlich' ? proKm : PAUSCHALE_KM;
  // Wohnung ↔ Betrieb: je Arbeitstag einmal die einfache Entfernung
  const tage = [...new Set(a.map(tag))];
  const entf = zahl(fz.entfernungKm) || (a.length ? r1([...a].map(km).sort((x, y) => x - y)[Math.floor(a.length / 2)]) : 0);
  const arbeitsweg = r2(tage.length * entf * entfernungssatz(j, entf));
  // Parken/Maut: anteilig nur geschäftlich, wenn nicht zuordenbar → vollständig, sofern am Tag eine Geschäftsfahrt war
  const tageG = new Set(g.map(tag));
  const kZusatz = r2(zusatz.filter(b => tageG.has(b.datum)).reduce((s, b) => s + kostenBetrag(b), 0));
  const fahrtkosten = r2(Math.max(pauschal, tatsaechlich));
  const anteil = kmGesamt > 0 ? kmG / kmGesamt : 0;
  const monate = Array.from({ length: 12 }, (_, i) => {
    const m = `${j}-${String(i + 1).padStart(2, '0')}`;
    const kmM = sum(g.filter(f => tag(f).startsWith(m)));
    const aw = [...new Set(a.filter(f => tag(f).startsWith(m)).map(tag))].length * entf * entfernungssatz(j, entf);
    return { m, km: kmM, betrag: r2(kmM * satz + aw + zusatz.filter(b => b.datum.startsWith(m) && tageG.has(b.datum)).reduce((s, b) => s + kostenBetrag(b), 0)) };
  });
  return {
    jahr: String(j), fahrten: F, kostenZeitraum, zeitraumTage, kJahr, kZeitraum, anzahl: F.length, erfasst: erf.length, offen: offen.length,
    kmG, kmP, kmA, kmOffen, kmErfasst, kmGesamt, nichtErfasst, odo, anteil,
    belege, laufend, zusatz, kBelege, kZusatzAlle, kZusatz, kAfa, kFix, kGesamt, proKm,
    pauschal, tatsaechlich, vorl, methode, satz, fahrtkosten, tage: tage.length, entf, arbeitsweg,
    absetzbar: r2(fahrtkosten + arbeitsweg + kZusatz), monate,
    hinweis: anteil > 0.5 ? 'ueber50' : anteil >= 0.1 ? 'zwischen' : '',
  };
}

// ---------------------------------------------------------------- Tatsächliche Kosten im Detail
/** Woraus sich der Kilometersatz zusammensetzt. Mit Kilometerständen: echte Kosten im Tacho-Zeitraum; sonst der Kostenplan (Jahr). */
export function kostenAufteilung(A, fz = fahrzeug()) {
  let teile, kmB, basis;
  if (A.odo && A.kZeitraum) {
    basis = 'tacho'; kmB = A.odo.km;
    teile = A.kZeitraum.zeilen.map(z => ({ id: z.id, name: z.name, wert: z.wert, quelle: z.quelle, belege: z.belege }));
    if (A.kZeitraum.sonstige) teile.push({ id: 'sonstige', name: 'Sonstige Kfz-Belege', wert: A.kZeitraum.sonstige, quelle: 'Belege' });
    if (A.kZeitraum.afa) teile.push({ id: 'afa', name: 'Abschreibung (AfA)', wert: A.kZeitraum.afa, quelle: 'Vertrag' });
  } else {
    const P = kostenplan(fz); basis = 'plan'; kmB = P.km;
    teile = P.zeilen.map(z => ({ id: z.id, name: z.name, wert: z.jahr, quelle: z.vertrag ? (z.fehlt ? 'fehlt' : 'Vertrag') : z.geschaetzt ? 'Schätzung' : 'Vorgabe' }));
    if (P.afa) teile.push({ id: 'afa', name: 'Abschreibung (AfA)', wert: P.afa, quelle: 'Vertrag' });
  }
  teile = teile.filter(t => t.wert > 0 || t.quelle === 'fehlt');
  const summe = r2(teile.reduce((s, t) => s + t.wert, 0));
  for (const t of teile) { t.proKm = kmB ? t.wert / kmB : 0; t.anteil = summe ? t.wert / summe : 0; }
  const sicher = r2(teile.filter(t => t.quelle === 'Belege' || t.quelle === 'Vertrag' || t.quelle === 'Vorgabe').reduce((s, t) => s + t.wert, 0));
  return { basis, km: kmB, summe, proKm: kmB ? summe / kmB : 0, teile: teile.sort((a, b) => b.wert - a.wert), belegt: summe ? sicher / summe : 0 };
}
/** Ab welcher Jahresfahrleistung die 0,30-€-Pauschale besser wäre (Fixkosten verteilen sich auf mehr km) */
export function grenzKm(fz = fahrzeug()) {
  const P = kostenplan(fz);
  const fix = P.zeilen.filter(z => z.rhythmus !== '100km').reduce((s, z) => s + z.jahr, 0) + P.afa;
  const v = P.zeilen.filter(z => z.rhythmus === '100km').reduce((s, z) => s + z.betrag / 100, 0);
  return { fix: r2(fix), variabel: v, km: v < PAUSCHALE_KM ? Math.round(fix / (PAUSCHALE_KM - v)) : Infinity };
}
/** Verbrauch und Literpreis aus den Tankbelegen des Jahres (Liter + Kilometerstand liest die KI vom Beleg oder du trägst sie ein) */
export function verbrauch(j) {
  const T = (db.all('buchungen') || []).filter(b => istKfzBeleg(b) && !istZusatz(b) && (b.datum || '').startsWith(String(j)) && postenFuer(b) === 'kraftstoff');
  const mitL = T.filter(b => zahl(b.liter) > 0), liter = mitL.reduce((s, b) => s + zahl(b.liter), 0);
  const kette = mitL.filter(b => zahl(b.kmStand) > 0).sort((a, b) => zahl(a.kmStand) - zahl(b.kmStand));
  let l100 = 0, strecke = 0;
  if (kette.length >= 2) { strecke = zahl(kette[kette.length - 1].kmStand) - zahl(kette[0].kmStand); if (strecke > 0) l100 = kette.slice(1).reduce((s, b) => s + zahl(b.liter), 0) / strecke * 100; }
  const preisL = liter ? mitL.reduce((s, b) => s + kostenBetrag(b), 0) / liter : 0;
  return { anzahl: T.length, summe: r2(T.reduce((s, b) => s + kostenBetrag(b), 0)), liter: r1(liter), preisL, l100, strecke, je100: l100 && preisL ? l100 * preisL : 0 };
}
/** Was für eine belastbare Rechnung mit tatsächlichen Kosten noch fehlt */
export function kostenCheck(A, fz = fahrzeug()) {
  const j = A.jahr, lfd = j === today().slice(0, 4), st = kmStaende().filter(s => s.datum.startsWith(j)), L = fz.leasing || {};
  const vers = kostenPosten(fz).find(p => p.id === 'versicherung'), versBeleg = A.kJahr.zeilen.find(z => z.id === 'versicherung')?.belege;
  const letzter = st[st.length - 1];
  const out = [
    fz.finanzierung === 'leasing'
      ? { id: 'vertrag', ok: !!(zahl(L.rate) && L.beginn && zahl(L.laufzeit)), text: 'Leasingvertrag eingetragen', fehlt: 'Leasingrate, Beginn und Laufzeit eintragen', aktion: 'auto' }
      : { id: 'vertrag', ok: !!(zahl(fz.kaufpreis) && fz.kaufdatum), text: 'Kaufpreis und Kaufdatum eingetragen', fehlt: 'Kaufpreis und Kaufdatum eintragen (für die Abschreibung)', aktion: 'auto' },
    { id: 'kmAnfang', ok: st.some(s => s.datum <= `${j}-01-31`), text: `Kilometerstand Anfang ${j}`, fehlt: `Stand vom Januar ${j} nachtragen – steht z. B. auf einer Werkstattrechnung oder in myOpel`, aktion: 'km', datum: `${j}-01-01` },
    { id: 'kmEnde', ok: !!letzter && st.length >= 2 && (lfd ? letzter.datum >= addDays(today(), -35) : letzter.datum >= `${j}-12-01`), text: lfd ? 'Aktueller Kilometerstand (letzte 5 Wochen)' : `Kilometerstand Ende ${j}`, fehlt: lfd ? 'Heutigen Stand vom Tacho eintragen' : `Stand vom 31.12.${j} nachtragen`, aktion: 'km', datum: lfd ? today() : `${j}-12-31` },
    { id: 'versicherung', ok: !!versBeleg || (vers && !vers.geschaetzt), text: 'Versicherungsbeitrag aus der Police', fehlt: 'Noch geschätzt (1.200 €) – echten Jahresbeitrag eintragen', aktion: 'posten' },
    { id: 'sprit', ok: A.kJahr.zeilen.find(z => z.id === 'kraftstoff')?.belege > 0, text: 'Tankbelege erfasst', fehlt: 'Sprit ist noch geschätzt – Tankbelege fotografieren oder Tanken eintragen', aktion: 'tanken' },
  ];
  return { punkte: out, ok: out.filter(p => p.ok).length, n: out.length };
}
/** Absetzbarer Betrag einer einzelnen Geschäftsfahrt nach der im Jahr angesetzten Methode */
export const fahrtBetrag = (f, A) => f.status === 'erfasst' && f.art === 'geschaeftlich' ? r2(km(f) * A.satz) : 0;

/** Für die EÜR (finanzen.jahr): absetzbare Fahrtkosten je Monat; null wenn kein Privatwagen-Fahrtenbuch */
export function euerAnteil(j) {
  if (!privatwagen()) return null;
  const A = auswertung(j);
  return { gesamt: A.absetzbar, monate: A.monate, ausgeschlossen: (b) => istKfzBeleg(b) };
}
export const naechsterTag = d => addDays(d, 1);
