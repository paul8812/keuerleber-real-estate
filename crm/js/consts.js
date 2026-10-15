export const KONTAKT_ARTEN = ['Eigentümer', 'Interessent (Kauf)', 'Interessent (Miete)', 'Käufer', 'Verkäufer', 'Mieter', 'Vermieter', 'Investor', 'Bauträger / Verkäufer', 'Partner / Dienstleister', 'Notar', 'Bank / Finanzierer', 'Handwerker', 'Sonstige'];
export const QUELLEN = ['Empfehlung', 'Website', 'ImmoScout24', 'Immowelt', 'Kleinanzeigen', 'Social Media', 'Kaltakquise', 'Netzwerk', 'Bestandskunde', 'Flyer / Brief', 'Sonstige'];
export const OBJEKT_ARTEN = ['Eigentumswohnung', 'Einfamilienhaus', 'Mehrfamilienhaus', 'Doppelhaushälfte', 'Reihenhaus', 'Wohn- & Geschäftshaus', 'Grundstück', 'Gewerbe', 'Garage / Stellplatz', 'Sonstiges'];
export const OBJEKT_STATUS = ['Akquise', 'Vorbereitung', 'Aktiv', 'Reserviert', 'Notartermin', 'Verkauft / Vermietet', 'Archiv'];
export const STATUS_FARBE = { 'Akquise': '#8a7bd8', 'Vorbereitung': '#5fa8d3', 'Aktiv': '#5bbf8a', 'Reserviert': '#e0a84a', 'Notartermin': '#e07a4a', 'Verkauft / Vermietet': '#c9a96e', 'Archiv': '#777' };
export const ENERGIE_KLASSEN = ['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const HEIZUNG = ['Gas', 'Öl', 'Fernwärme', 'Wärmepumpe', 'Pellets', 'Strom', 'Holz', 'Sonstige'];
export const AKTIVITAET_ARTEN = [['notiz', 'Notiz', '📝'], ['anruf', 'Anruf', '📞'], ['email', 'E-Mail', '✉️'], ['besichtigung', 'Besichtigung', '🏠'], ['meeting', 'Termin / Meeting', '🤝'], ['whatsapp', 'WhatsApp / SMS', '💬'], ['system', 'System', '⚙️']];
export const PIPELINES = {
  akquise: { name: 'Einkauf (Verkäufer / Bauträger)', stages: ['Neuer Lead', 'Erstkontakt', 'Bewertung / Besichtigung', 'Angebot / Maklerauftrag', 'Auftrag erhalten', 'Verloren'], won: 'Auftrag erhalten', lost: 'Verloren' },
  vertrieb: { name: 'Vertrieb (Interessenten)', stages: ['Anfrage', 'Beratungsgespräch', 'Besichtigung', 'Finanzierung / Prüfung', 'Reservierung', 'Notartermin', 'Abgeschlossen', 'Absage'], won: 'Abgeschlossen', lost: 'Absage' },
};
export const DEFAULT_PROB = { 'Neuer Lead': 10, 'Erstkontakt': 20, 'Bewertung / Besichtigung': 40, 'Angebot / Maklerauftrag': 60, 'Auftrag erhalten': 100, 'Verloren': 0, 'Anfrage': 10, 'Beratungsgespräch': 20, 'Besichtigung': 30, 'Finanzierung / Prüfung': 50, 'Reservierung': 75, 'Notartermin': 90, 'Abgeschlossen': 100, 'Absage': 0 };
export const TERMIN_ARTEN = ['Besichtigung', 'Beratungsgespräch', 'Bewertungstermin', 'Notartermin', 'Übergabe', 'Fotoshooting', 'Energieausweis / Gutachter', 'Sonstiges'];
export const PRIOS = [['hoch', 'Hoch'], ['normal', 'Normal'], ['niedrig', 'Niedrig']];
export const WIEDERHOLUNG = [['', 'Keine'], ['daily', 'Täglich'], ['weekly', 'Wöchentlich'], ['monthly', 'Monatlich'], ['yearly', 'Jährlich']];
export const BUNDESLAENDER = { 'Baden-Württemberg': 5, 'Bayern': 3.5, 'Berlin': 6, 'Brandenburg': 6.5, 'Bremen': 5, 'Hamburg': 5.5, 'Hessen': 6, 'Mecklenburg-Vorpommern': 6, 'Niedersachsen': 5, 'Nordrhein-Westfalen': 6.5, 'Rheinland-Pfalz': 5, 'Saarland': 6.5, 'Sachsen': 5.5, 'Sachsen-Anhalt': 5, 'Schleswig-Holstein': 6.5, 'Thüringen': 5 };
export const NAV = [
  ['dashboard', 'Übersicht', '◧'], ['posteingang', 'Posteingang', '✉'], ['kontakte', 'Kontakte', '☺'], ['objekte', 'Objekte', '⌂'], ['pipeline', 'Pipeline', '▤'],
  ['aufgaben', 'Aufgaben', '✓'], ['kalender', 'Kalender', '▦'], ['finanzen', 'Finanzen', '€'], ['automation', 'Automationen', '⚡'], ['vorlagen', 'Vorlagen', '✎'], ['rechner', 'Rechner', '∑'], ['statistik', 'Statistik', '◔'], ['einstellungen', 'Einstellungen', '⚙'],
];
// Anzeigenamen der Einkaufs-Phasen für den Kapitalanlagevertrieb (gespeicherte Werte bleiben gleich – kompatibel mit Mail-Abgleich)
export const STAGE_LABEL = { 'Neuer Lead': 'Neuer Kontakt', 'Bewertung / Besichtigung': 'Objektprüfung / Kalkulation', 'Angebot / Maklerauftrag': 'Vertriebsvereinbarung', 'Auftrag erhalten': 'Im Vertrieb' };
export const sl = s => STAGE_LABEL[s] || s;
