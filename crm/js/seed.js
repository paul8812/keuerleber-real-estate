// Beispieldaten (Demo) – komplett fiktiv
import * as db from './db.js';
import { today, addDays } from './util.js';

export async function seed() {
  const t = today(), ago = n => new Date(Date.now() - n * 864e5).toISOString();
  const C = async o => (await db.save('contacts', { status: 'Aktiv', dsgvo: true, ...o })).id;
  const eig1 = await C({ kategorie: 'Eigentümer', anrede: 'Herr', vorname: 'Werner', nachname: 'Brandl', tel: '09286 123456', email: 'w.brandl@example.de', strasse: 'Hofer Str. 12', plz: '95145', ort: 'Oberkotzau', quelle: 'Empfehlung', tags: 'Erbe, eilig', geburtstag: '1958-' + addDays(t, 6).slice(5), notiz: 'Mehrfamilienhaus aus Erbengemeinschaft, 3 Geschwister.' });
  const eig2 = await C({ kategorie: 'Eigentümer', anrede: 'Frau', vorname: 'Sabine', nachname: 'Lindner', mobil: '0171 5551234', email: 'lindner@example.de', plz: '95028', ort: 'Hof', quelle: 'Website', followup: addDays(t, -2) });
  const eig3 = await C({ kategorie: 'Verkäufer', anrede: 'Herr', vorname: 'Klaus', nachname: 'Dietz', tel: '09281 77881', plz: '95030', ort: 'Hof', quelle: 'Kaltakquise', created: ago(90) });
  const i1 = await C({ kategorie: 'Interessent (Kauf)', anrede: 'Frau', vorname: 'Julia', nachname: 'Neumann', mobil: '0160 9981122', email: 'julia.neumann@example.de', ort: 'Selbitz', quelle: 'ImmoScout24', sp_aktiv: true, sp_vermarktung: 'Kauf', sp_art: 'Eigentumswohnung', sp_budgetMax: 250000, sp_flaecheMin: 70, sp_zimmerMin: 3, sp_orte: 'Hof, Oberkotzau' });
  const i2 = await C({ kategorie: 'Interessent (Kauf)', anrede: 'Herr', vorname: 'Markus', nachname: 'Vogel', mobil: '0151 4455667', email: 'vogel@example.de', ort: 'Münchberg', quelle: 'Website', sp_aktiv: true, sp_vermarktung: 'Kauf', sp_art: 'Einfamilienhaus', sp_budgetMax: 420000, sp_flaecheMin: 120, sp_orte: 'Oberkotzau, Schwarzenbach, Hof' });
  const inv = await C({ kategorie: 'Investor', anrede: 'Herr', vorname: 'Thomas', nachname: 'Reuter', firma: 'Reuter Invest GmbH', email: 'reuter@reuter-invest.example', tel: '0921 123123', ort: 'Bayreuth', quelle: 'Netzwerk', sp_aktiv: true, sp_vermarktung: 'Kauf', sp_art: 'Mehrfamilienhaus', sp_budgetMax: 900000, sp_orte: 'Hof, Oberkotzau, Rehau' });
  await C({ kategorie: 'Notar', anrede: 'Frau', vorname: 'Dr. Anja', nachname: 'Pfeiffer', firma: 'Notariat Pfeiffer', tel: '09281 55500', ort: 'Hof', quelle: 'Netzwerk' });
  await C({ kategorie: 'Bank / Finanzierer', anrede: 'Herr', vorname: 'Stefan', nachname: 'Roth', firma: 'Sparkasse Hochfranken', tel: '09281 8000', ort: 'Hof', quelle: 'Netzwerk' });
  const P = async o => (await db.save('properties', { nr: db.nextNr('OBJ-', 'properties'), ...o })).id;
  const p1 = await P({ titel: 'Mehrfamilienhaus mit 6 Einheiten', vermarktung: 'Kauf', art: 'Mehrfamilienhaus', status: 'Akquise', strasse: 'Hofer Str. 12', plz: '95145', ort: 'Oberkotzau', preis: 640000, flaeche: 420, grundstueck: 800, zimmer: 18, baujahr: 1968, eigentuemerId: eig1, mieteJahr: 33600, provisionGesamt: 7.14, auftragBis: addDays(t, 40), eKlasse: 'E', eWert: 165, eGueltig: addDays(t, 30), beschreibung: 'Gepflegtes Mehrfamilienhaus in zentraler Lage.' });
  const p2 = await P({ titel: 'Helle 3-Zimmer-Wohnung mit Balkon', vermarktung: 'Kauf', art: 'Eigentumswohnung', status: 'Aktiv', strasse: 'Bahnhofstr. 4', plz: '95028', ort: 'Hof', preis: 185000, flaeche: 82, zimmer: 3, baujahr: 1995, etage: '2. OG', eigentuemerId: eig2, hausgeld: 290, eKlasse: 'C', eWert: 98, eGueltig: addDays(t, 900), provisionGesamt: 7.14, alleinauftrag: true, auftragVon: addDays(t, -60), auftragBis: addDays(t, 120), eingestelltAm: addDays(t, -21), beschreibung: 'Moderne Wohnung mit Südbalkon und Stellplatz.' });
  const p3 = await P({ titel: 'Einfamilienhaus mit Garten', vermarktung: 'Kauf', art: 'Einfamilienhaus', status: 'Aktiv', strasse: 'Am Hang 7', plz: '95145', ort: 'Oberkotzau', preis: 395000, flaeche: 145, grundstueck: 620, zimmer: 6, baujahr: 2004, eigentuemerId: eig3, eKlasse: 'B', eWert: 62, eGueltig: addDays(t, 1500), provisionGesamt: 7.14, eingestelltAm: addDays(t, -48), auftragBis: addDays(t, 25) });
  const D = async o => (await db.save('deals', { wahrscheinlichkeit: '', ...o })).id;
  await D({ board: 'akquise', stage: 'Angebot / Maklerauftrag', titel: 'MFH Brandl – Vermarktung', contactId: eig1, propertyId: p1, wert: 640000, naechsterSchritt: 'Angebot nachfassen', faellig: addDays(t, 2) });
  await D({ board: 'akquise', stage: 'Erstkontakt', titel: 'Lindner – zweite Wohnung', contactId: eig2, wert: 160000, naechsterSchritt: 'Termin vereinbaren', faellig: addDays(t, 5) });
  await D({ board: 'akquise', stage: 'Neuer Lead', titel: 'Anfrage über Website – Haus Selbitz', wert: 280000 });
  await D({ board: 'akquise', stage: 'Auftrag erhalten', titel: 'Dietz – EFH Am Hang', contactId: eig3, propertyId: p3, wert: 395000, closedAt: addDays(t, -48) });
  await D({ board: 'vertrieb', stage: 'Besichtigung', titel: 'Neumann – Whg. Bahnhofstr.', contactId: i1, propertyId: p2, wert: 185000, naechsterSchritt: 'Zweitbesichtigung', faellig: addDays(t, 3) });
  await D({ board: 'vertrieb', stage: 'Anfrage', titel: 'Vogel – EFH Am Hang', contactId: i2, propertyId: p3, wert: 395000 });
  await D({ board: 'vertrieb', stage: 'Abgeschlossen', titel: 'Reuter – Verkauf Altbau Rehau', contactId: inv, wert: 320000, closedAt: t.slice(0, 5) + '02-14', provision: 7.14 });
  await db.save('tasks', { titel: 'Exposé für MFH Brandl vorbereiten', faellig: t, prio: 'hoch', contactId: eig1, propertyId: p1, done: false });
  await db.save('tasks', { titel: 'Energieausweis bestellen', faellig: addDays(t, -1), prio: 'normal', propertyId: p1, done: false });
  await db.save('tasks', { titel: 'Monatlicher Marktbericht Oberkotzau', faellig: addDays(t, 10), prio: 'niedrig', wiederholung: 'monthly', done: false });
  await db.save('events', { titel: 'Besichtigung Bahnhofstr. 4', art: 'Besichtigung', datum: addDays(t, 1), start: '16:00', ende: '16:45', ort: 'Bahnhofstr. 4, Hof', contactId: i1, propertyId: p2 });
  await db.save('events', { titel: 'Bewertungstermin Brandl', art: 'Bewertungstermin', datum: addDays(t, 4), start: '10:00', ende: '11:30', ort: 'Hofer Str. 12, Oberkotzau', contactId: eig1, propertyId: p1 });
  await db.log('anruf', 'Erstgespräch: Erbengemeinschaft möchte zeitnah verkaufen, Mieteinnahmen ca. 2.800 €/Monat.', { contactId: eig1, propertyId: p1 });
  await db.log('besichtigung', 'Erstbesichtigung, sehr interessiert, Finanzierungsbestätigung folgt.', { contactId: i1, propertyId: p2 });
}
