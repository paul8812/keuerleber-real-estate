// KI-Belegerkennung: Foto/PDF eines Belegs → Claude liest ihn aus → Buchung mit Kategorie, Konto (SKR03), USt, Objekt.
import * as db from './db.js';
import { uid, today } from './util.js';
import * as F from './finanzen.js';

export const MODELL = 'claude-sonnet-5-5';
export const key = () => (db.settings().anthropicKey || '').trim();
export const hasKey = () => !!key();

async function api(body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j.error?.message || r.statusText;
    if (r.status === 401) throw new Error('KI-Schlüssel ungültig – bitte unter Einstellungen → KI-Belegerkennung prüfen.');
    if (r.status === 402 || /credit|balance|billing/i.test(m)) throw new Error('Kein Guthaben im Anthropic-Konto – bitte unter console.anthropic.com → Billing aufladen.');
    if (r.status === 429) throw new Error('Zu viele Anfragen gleichzeitig – kurz warten und erneut versuchen.');
    throw new Error('KI-Fehler: ' + m);
  }
  return j;
}
export async function testKey() { await api({ model: MODELL, max_tokens: 5, messages: [{ role: 'user', content: 'Antworte nur mit OK.' }] }); return true; }

// Datei → { media_type, data(base64), dataUrl (für die Ablage) }; Fotos werden verkleinert
export async function lesen(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > 15e6) throw new Error('PDF zu groß (max. 15 MB)');
    const dataUrl = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(file); });
    return { kind: 'pdf', media_type: 'application/pdf', data: dataUrl.split(',')[1], dataUrl };
  }
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('Bildformat nicht lesbar (bitte JPG, PNG oder PDF)'); });
  const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', 0.82);
  return { kind: 'bild', media_type: 'image/jpeg', data: dataUrl.split(',')[1], dataUrl };
}

function prompt() {
  const s = db.settings();
  const objekte = db.all('properties').filter(p => p.status !== 'Archiv').map(p => `${p.id}: ${p.titel} (${[p.strasse, p.plz, p.ort].filter(Boolean).join(' ')})`).join('\n') || '–';
  return `Du bist Buchhalter eines Kapitalanlage-Vertriebs (Vermittlung von Anlage-Wohnungen an Investoren; die Vergütung zahlt der Verkäufer/Bauträger; Einzelunternehmen „${s.firma || 'Keuerleber Immobilien'}“, Inhaber ${s.inhaber || 'Paul Keuerleber'}, ${[s.strasse, s.plz, s.ort].filter(Boolean).join(' ')}). Lies den Beleg und gib NUR ein JSON-Objekt zurück, ohne Text davor oder danach.

Felder:
{
 "art": "ausgabe" | "einnahme"   // einnahme nur, wenn der Beleg eine Rechnung VON ${s.firma || 'Keuerleber Immobilien'} an einen Kunden ist bzw. Geld an uns geht
 "datum": "YYYY-MM-DD"          // Rechnungs-/Belegdatum
 "lieferant": "…"               // Aussteller (Firma/Laden), bei Einnahmen der Kunde
 "rechnungsnr": "…" | ""
 "beschreibung": "…"            // kurz, was gekauft/geleistet wurde, z. B. „ImmoScout24 Inserat Oktober“, „Tanken Shell“
 "kategorie": eine aus ${JSON.stringify(F.KAT_AUSGABE)} bzw. bei Einnahmen aus ${JSON.stringify(F.KAT_EINNAHME)}
 "steuer": [ { "satz": 19|7|0, "netto": Zahl, "ust": Zahl } ]   // je Steuersatz eine Zeile; ohne ausgewiesene USt (Kleinbetrag ohne Aufschlüsselung, Kleinunternehmer, Ausland, Versicherung, Bankgebühr): satz 0, netto = brutto. Kleinbetragsrechnung bis 250 € mit nur Steuersatz: USt herausrechnen.
 "brutto": Zahl                 // Gesamtbetrag
 "zahlart": "Überweisung" | "Lastschrift" | "Karte" | "PayPal" | "Bar" | ""
 "bezahlt": true | false        // true, wenn Kassenbon/Zahlung erkennbar, false bei offener Rechnung
 "propertyId": "…" | ""         // nur wenn der Beleg eindeutig zu einem dieser Objekte gehört (Adresse/Objekt genannt):
${objekte}
 "sicherheit": 0 bis 1          // wie sicher die Erkennung insgesamt ist
 "hinweis": "…" | ""            // z. B. bei Bewirtung „Anlass und Teilnehmer auf dem Beleg notieren (70 % abziehbar)“, unleserlich, kein Beleg, privat?
}
Regeln: Beträge als Zahl mit Punkt (12.5), kein Währungszeichen. Kraftstoff, Werkstatt, Kfz-Versicherung → „Fahrzeug & Fahrtkosten“ (Kfz-Versicherung trotzdem dort). Restaurant/Café → „Bewirtung“. Hotel, Bahn, Flug → „Reisekosten & Übernachtung“. Laptop/Handy/Möbel bis 800 € netto → „Geringwertige Wirtschaftsgüter (bis 800 € netto)“, darüber „Anschaffung Anlagegut (über 800 € netto)“. Fotograf, Drohnenaufnahmen, Homestaging → „Fotografie & Homestaging“. Wenn das Dokument kein Beleg ist: "sicherheit": 0 und Grund in "hinweis".`;
}

export async function analysieren(datei) {
  const block = datei.kind === 'pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: datei.data } } : { type: 'image', source: { type: 'base64', media_type: datei.media_type, data: datei.data } };
  const j = await api({ model: MODELL, max_tokens: 1500, system: prompt(), messages: [{ role: 'user', content: [block, { type: 'text', text: 'Beleg auslesen und als JSON zurückgeben.' }] }] });
  const txt = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('KI-Antwort nicht lesbar');
  return normalisieren(JSON.parse(m[0]));
}

// KI-Ergebnis prüfen und glätten (Summen, Kategorien, Datum)
export function normalisieren(x) {
  const art = x.art === 'einnahme' ? 'einnahme' : 'ausgabe', KAT = art === 'einnahme' ? F.KAT_EINNAHME : F.KAT_AUSGABE;
  const brutto = F.r2(x.brutto);
  let steuer = (Array.isArray(x.steuer) ? x.steuer : []).map(t => ({ satz: [19, 7, 0].includes(Number(t.satz)) ? Number(t.satz) : 19, netto: F.r2(t.netto), ust: F.r2(t.ust) })).filter(t => t.netto || t.ust);
  if (!steuer.length && brutto) steuer = [{ satz: 19, ...F.bruttoZuNetto(brutto, 19) }];
  const summe = F.r2(steuer.reduce((s, t) => s + t.netto + t.ust, 0));
  const warn = [];
  if (brutto && Math.abs(summe - brutto) > 0.05) { warn.push(`Summe der Steuerzeilen (${summe}) ≠ Brutto (${brutto})`); if (steuer.length === 1) steuer = [{ satz: steuer[0].satz, ...F.bruttoZuNetto(brutto, steuer[0].satz) }]; }
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(x.datum || '') ? x.datum : today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.datum || '')) warn.push('Datum nicht erkannt');
  if (datum > today()) warn.push('Datum liegt in der Zukunft');
  const sicherheit = Math.max(0, Math.min(1, Number(x.sicherheit) || 0));
  return {
    art, datum, brutto: brutto || summe, steuer, sicherheit,
    lieferant: String(x.lieferant || '').trim(), rechnungsnr: String(x.rechnungsnr || '').trim(), beschreibung: String(x.beschreibung || '').trim(),
    kategorie: KAT.includes(x.kategorie) ? x.kategorie : (art === 'einnahme' ? 'Sonstige Einnahmen' : 'Sonstige Ausgaben'),
    zahlart: ['Überweisung', 'Lastschrift', 'Karte', 'PayPal', 'Bar'].includes(x.zahlart) ? x.zahlart : '',
    bezahlt: x.bezahlt !== false,
    propertyId: db.get('properties', x.propertyId) ? x.propertyId : '',
    hinweis: [String(x.hinweis || '').trim(), ...warn].filter(Boolean).join(' · '),
  };
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöü]/g, '');
export function dublette(e) {
  return db.all('buchungen').find(b => b.belegId && (
    (e.rechnungsnr && norm(b.rechnungsnr) === norm(e.rechnungsnr) && norm(b.lieferant) === norm(e.lieferant)) ||
    (b.datum === e.datum && norm(b.lieferant) === norm(e.lieferant) && Math.abs((b.belegBrutto ?? b.brutto) - e.brutto) < 0.01)));
}

// Ergebnis → Buchung(en) (eine je Steuersatz), Beleg ablegen
export async function verbuchen(e, datei, name = '') {
  const belegId = 'beleg-' + uid(), kl = F.kleinunternehmer();
  await db.putFile(belegId, datei.dataUrl, { name, typ: datei.media_type });
  const pruefen = e.sicherheit < 0.75 || !!e.hinweis;
  const zeilen = kl && e.art === 'ausgabe' ? [{ satz: 0, netto: e.brutto, ust: 0 }] : e.steuer;  // Kleinunternehmer: keine Vorsteuer
  const out = [];
  for (const [i, t] of zeilen.entries()) {
    const brutto = F.r2(t.netto + t.ust);
    out.push(await db.save('buchungen', {
      art: e.art, datum: e.datum, kategorie: e.kategorie, konto: F.konto(e.kategorie, t.satz),
      beschreibung: (e.beschreibung || e.lieferant) + (zeilen.length > 1 ? ` (${t.satz} %)` : ''), lieferant: e.lieferant, rechnungsnr: e.rechnungsnr,
      brutto, netto: F.r2(t.netto), ust: F.r2(t.ust), ustSatz: t.satz, zahlart: e.zahlart, propertyId: e.propertyId,
      beleg: e.rechnungsnr, belegId, belegBrutto: e.brutto, belegTeil: zeilen.length > 1 ? i + 1 : 0,
      ki: true, kiSicherheit: e.sicherheit, pruefen, hinweis: e.hinweis, offen: !e.bezahlt,
    }));
  }
  return out;
}
