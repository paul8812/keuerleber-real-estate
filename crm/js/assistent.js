// Sprach-Assistent: „Trag mir Freitag 14 Uhr eine Besichtigung in der Leopoldstraße mit Herrn Weber ein“ – per Stimme oder Text.
// Versteht mit der KI (eigener Anthropic-Schlüssel aus den Einstellungen) freie Sätze und kennt Kontakte, Objekte, Termine und Aufgaben;
// ohne Schlüssel greifen einfache Regeln (Termin, Aufgabe, Notiz). Angelegtes lässt sich sofort rückgängig machen; Löschen und Verschieben
// werden erst nach Bestätigung ausgeführt.
import * as db from './db.js';
import { html, today, addDays, fmtDate, fullName, toast } from './util.js';
import { adresse } from './ui.js';
import * as ki from './ki.js';
import { parseTermin, FARBE } from './views/calendar.js';
import { completeTask } from './views/tasks.js';
import { vorlesen, vorbereiten, stopp, stimmeVerfuegbar, stimmenWahl } from './morgen.js';

const ARTEN = Object.keys(FARBE), AKT = ['notiz', 'anruf', 'meeting', 'whatsapp', 'besichtigung', 'email'];
const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const tagText = d => d === today() ? 'heute' : d === addDays(today(), 1) ? 'morgen' : `${WT[new Date(d + 'T12:00:00').getDay()]}, ${fmtDate(d)}`;
const istDatum = d => /^\d{4}-\d{2}-\d{2}$/.test(d || ''), istZeit = t => /^\d{2}:\d{2}$/.test(t || '');
const plus = (t, min) => { const [h, m] = t.split(':').map(Number), x = h * 60 + m + min; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

// ---------- Gedächtnis ----------
// Der Assistent merkt sich das Gespräch (auch wenn das Fenster zwischendurch zu ist) und was er darin angelegt hat.
// Kennungen (K3, E5, T2 …) bleiben während des Gesprächs fest, damit sich „der Termin von eben“ sicher zuordnen lässt.
const G = { verlauf: [], neu: new Set(), ref: { K: new Map(), P: new Map(), E: new Map(), T: new Map() }, id: { K: [], P: [], E: [], T: [] }, zuletzt: 0, zusatz: '' };
export function vergessen() { G.verlauf = []; G.neu = new Set(); for (const k of 'KPET') { G.ref[k] = new Map(); G.id[k] = []; } G.zusatz = ''; }
const ref = (art, id) => { if (!G.ref[art].has(id)) { G.ref[art].set(id, G.id[art].length); G.id[art].push(id); } return art + G.ref[art].get(id); };
const zuId = (art, r) => new RegExp(`^${art}\\d+$`).test(r || '') ? G.id[art][+r.slice(1)] : /^id:/.test(r || '') ? r.slice(3) : null;
const COL = { K: 'contacts', P: 'properties', E: 'events', T: 'tasks' };
const hol = (art, r) => { const id = zuId(art, r); return id ? db.get(COL[art], id) : null; };

// ---------- Was der Assistent über das CRM weiß ----------
function wissen() {
  const t0 = today(), K = db.all('contacts').slice(0, 600), P = db.all('properties').filter(p => p.status !== 'Archiv').slice(0, 150);
  const E = db.all('events').filter(e => (e.datum >= addDays(t0, -2) && e.datum <= addDays(t0, 45)) || G.neu.has(e.id)).sort((a, b) => (a.datum + (a.start || '')).localeCompare(b.datum + (b.start || ''))).slice(0, 80);
  const T = db.all('tasks').filter(t => !t.done || G.neu.has(t.id)).sort((a, b) => (a.faellig || '9').localeCompare(b.faellig || '9')).slice(0, 70);
  const name = id => { const c = id && db.get('contacts', id); return c ? ' | Kontakt ' + ref('K', c.id) + ' ' + fullName(c) : ''; };
  const neu = id => G.neu.has(id) ? ' | IN DIESEM GESPRÄCH ANGELEGT' : '';
  // fest = ändert sich im Gespräch kaum (wird bei der KI zwischengespeichert → schnellere Antwort), lauf = aktueller Stand
  return { fest: ['KONTAKTE:', ...K.map(c => `${ref('K', c.id)} ${[c.anrede, c.vorname, c.nachname].filter(Boolean).join(' ')}${c.firma ? ' (' + c.firma + ')' : ''}${c.kategorie ? ' [' + c.kategorie + ']' : ''}`),
    'OBJEKTE:', ...P.map(p => `${ref('P', p.id)} ${p.titel || ''} | ${adresse(p)}`)].join('\n'),
    lauf: [`Heute ist ${WT[new Date().getDay()]}, ${t0}. Uhrzeit ${new Date().toTimeString().slice(0, 5)}.`, 'TERMINE (vorgestern bis +45 Tage):', ...E.map(e => `${ref('E', e.id)} ${e.datum} ${e.start ? e.start + (e.ende ? '–' + e.ende : '') : 'ganztägig'} ${e.titel} [${e.art || 'Sonstiges'}]${e.ort ? ' | Ort ' + e.ort : ''}${name(e.contactId)}${e.notiz ? ' | Notiz: ' + String(e.notiz).slice(0, 120) : ''}${neu(e.id)}`),
    'AUFGABEN (offen):', ...T.map(t => `${ref('T', t.id)} ${t.faellig || 'ohne Datum'} ${String(t.titel).replace(/^⚡ /, '')}${t.prio === 'hoch' ? ' [hoch]' : ''}${t.done ? ' [erledigt]' : ''}${name(t.contactId)}${t.notiz ? ' | Notiz: ' + String(t.notiz).slice(0, 120) : ''}${neu(t.id)}`)].join('\n') };
}
const SYSTEM = `Du bist der persönliche Sprach-Assistent im CRM eines Immobilienvertriebs (Kapitalanlage-Wohnungen). Der Nutzer spricht unterwegs kurze Anweisungen ein; die Spracherkennung schreibt Namen und Straßen oft falsch – ordne sie dem ähnlichsten Kontakt/Objekt zu.
Du führst ein GESPRÄCH: Der bisherige Verlauf steht in den Nachrichten. Beziehe dich darauf. „der Termin“, „dazu“, „da noch“, „stattdessen“, „doch lieber“, „und trag noch ein …“ meinen fast immer das, was du zuletzt angelegt oder besprochen hast (in den Listen mit „IN DIESEM GESPRÄCH ANGELEGT“ markiert). Lege dafür NICHTS doppelt an, sondern ändere den vorhandenen Eintrag mit termin_aendern bzw. aufgabe_aendern.
Antworte NUR mit JSON, "antwort" immer als ERSTES Feld: {"antwort":"...","aktionen":[...]}.
"antwort" wird vorgelesen: ein bis zwei kurze, natürliche Sätze in Du-Form, ohne Kennungen (K3/E5), ohne Aufzählungszeichen. Bestätige konkret, was du getan hast (z. B. „Alles klar, Besichtigung am Freitag um 14 Uhr mit Herrn Weber steht drin.“). Wenn es naheliegt, biete EINEN sinnvollen nächsten Schritt an oder frage nach einer fehlenden wichtigen Angabe (z. B. Uhrzeit). Nicht bei jeder Antwort eine Frage stellen.
Mögliche Aktionen:
{"typ":"termin","titel":"","datum":"JJJJ-MM-TT","start":"HH:MM","ende":"HH:MM","art":"${ARTEN.join('|')}","kontakt":"K3","objekt":"P1","ort":"","notiz":""}
{"typ":"termin_aendern","termin":"E2", ...nur die Felder, die sich ändern: titel, datum, start, ende, art, kontakt, objekt, ort, notiz}   (notiz wird an eine vorhandene Notiz angehängt)
{"typ":"termin_loeschen","termin":"E2"}
{"typ":"aufgabe","titel":"","faellig":"JJJJ-MM-TT","prio":"hoch|normal","kontakt":"K3","objekt":"P1","notiz":""}
{"typ":"aufgabe_aendern","aufgabe":"T4", ...nur geänderte Felder: titel, faellig, prio, kontakt, notiz}
{"typ":"erledigen","aufgabe":"T4"}
{"typ":"aufgabe_loeschen","aufgabe":"T4"}
{"typ":"notiz","art":"${AKT.join('|')}","text":"","kontakt":"K3","objekt":"P1"}   (z. B. „ich habe Herrn Weber angerufen“ → art anruf)
{"typ":"kontakt","anrede":"Herr|Frau","vorname":"","nachname":"","tel":"","email":"","kategorie":"Interessent (Kauf)"}
Regeln: Felder ohne Angabe weglassen. Ohne Uhrzeit ist ein Termin ganztägig (start weglassen). Ohne Dauer 60 Minuten, Besichtigung 30. Aufgabe ohne Datum: heute. Wochentage meinen den nächsten solchen Tag. Erfinde keine Kontakte: passt keiner, lass "kontakt" weg und nenne den Namen im Titel. Mehrere Anweisungen in einem Satz ergeben mehrere Aktionen.
Fragen („was steht heute an“, „wann ist der Notartermin“, „was habe ich gerade eingetragen“) beantwortest du in "antwort" aus den Daten und dem Verlauf, mit leeren "aktionen". Ist etwas wirklich unklar (z. B. zwei passende Kontakte), frage kurz nach und lass "aktionen" leer.`;

// ---------- Verstehen ----------
async function verstehen(satz, frueh) {
  if (Date.now() - G.zuletzt > 30 * 60000) vergessen();   // nach einer halben Stunde Pause beginnt ein neues Gespräch
  G.zuletzt = Date.now();
  if (ki.hasKey()) {
    const frage = (G.zusatz ? `(Ergebnis deiner letzten Aktionen: ${G.zusatz})\n` : '') + satz;
    const W = wissen(); let gemeldet = false;
    // Sobald der Antwortsatz vollständig da ist (er steht im JSON vorn), geht er schon an die Sprachausgabe
    const j = await ki.dialogStrom([{ type: 'text', text: SYSTEM + '\n\nSTAMMDATEN DES CRM:\n' + W.fest, cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'AKTUELLER STAND:\n' + W.lauf }], [...G.verlauf, { role: 'user', content: frage }],
      { onText: t => { if (gemeldet || !frueh) return; const m = /"antwort"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(t); if (m) { gemeldet = true; try { frueh(JSON.parse('"' + m[1] + '"')); } catch { } } } });
    const r = { antwort: String(j.antwort || ''), aktionen: Array.isArray(j.aktionen) ? j.aktionen : [], ki: true };
    G.verlauf.push({ role: 'user', content: frage }, { role: 'assistant', content: JSON.stringify({ antwort: r.antwort, aktionen: r.aktionen }) });
    if (G.verlauf.length > 16) G.verlauf.splice(0, G.verlauf.length - 16);
    G.zusatz = '';
    return r;
  }
  return regeln(satz);
}
/** Ohne KI: Aufgabe / Notiz / Termin an Schlüsselwörtern erkennen */
export function regeln(satz) {
  const s = satz.trim(), r = parseTermin(s.replace(/^(bitte\s+)?(trag(e)?|schreib(e)?|leg(e)?|mach(e)?|erstell(e)?|notier(e)?)\s+(mir\s+)?(bitte\s+)?/i, '').replace(/\s+(ein|an|auf)\s*\.?$/i, ''));
  const kid = r.contactId ? ref('K', r.contactId) : undefined;
  const sauber = t => t.replace(/^(eine?n?\s+)?(neue[nr]?\s+)?(aufgabe|todo|erinnerung|notiz|termin)\s*[:,]?\s*/i, '').replace(/^(dass ich|ich muss|ich soll)\s+/i, '').replace(/\s+(eintragen|anlegen|ein)$/i, '').trim();
  // Aufgaben behalten ihren Wortlaut (mit Namen); nur Befehl und Datumsangabe fallen weg
  const ohneDatum = t => t.replace(/\b(übermorgen|morgen|heute)\b/gi, ' ').replace(/\b(am\s+|bis\s+)?(nächste[nrs]?\s+|kommende[nrs]?\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/gi, ' ').replace(/\b(am\s+|bis\s+)?\d{1,2}\.\d{1,2}\.?(\d{2,4})?/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s:,]+|[\s:,]+$/g, '');
  if (/\b(aufgabe|todo|to-do|erinner|denk dran|nicht vergessen)/i.test(s)) { const roh = s.replace(/^(bitte\s+)?(trag(e)?|schreib(e)?|leg(e)?|mach(e)?|erstell(e)?|notier(e)?)\s+(mir\s+)?(bitte\s+)?/i, '').replace(/^erinner\w*\s+(mich\s+)?(daran\s+)?/i, ''), titel = ohneDatum(sauber(ohneDatum(roh)));
    return { antwort: '', aktionen: [{ typ: 'aufgabe', titel: titel ? titel[0].toUpperCase() + titel.slice(1) : 'Aufgabe', faellig: r.datum, kontakt: kid }] }; }
  if (/\b(notiz|notier|vermerk)/i.test(s)) return { antwort: '', aktionen: [{ typ: 'notiz', art: 'notiz', text: sauber(r.titel), kontakt: kid }] };
  if (/\b(angerufen|telefoniert)\b/i.test(s)) return { antwort: '', aktionen: [{ typ: 'notiz', art: 'anruf', text: s, kontakt: kid }] };
  if (r.erkannt || r.art !== 'Sonstiges') return { antwort: '', aktionen: [{ typ: 'termin', titel: sauber(r.titel), datum: r.datum, start: r.start, ende: r.ende, art: r.art, kontakt: kid, objekt: r.propertyId ? 'id:' + r.propertyId : undefined, ort: r.ort }] };
  return { antwort: 'Das habe ich nicht verstanden. Sag z. B. „Freitag 14 Uhr Besichtigung Leopoldstraße mit Herrn Weber“ oder „Aufgabe: morgen Exposé an Frau Sommer schicken“.', aktionen: [] };
}

// ---------- Ausführen ----------
/** Führt eine Aktion aus. Liefert { text, undo?, bestaetigen?, kurz } – kurz geht als Ergebnis zurück an die KI */
async function ausfuehren(a) {
  const c = hol('K', a.kontakt), p = hol('P', a.objekt), mit = c ? ' · ' + fullName(c) : '';
  const zeit = e => `${tagText(e.datum)}${e.start ? ', ' + e.start + (e.ende ? '–' + e.ende : '') : ', ganztägig'}`;
  if (a.typ === 'termin') {
    if (!a.titel && !a.art) return { text: '⚠ Termin ohne Titel – nicht eingetragen', fehler: true };
    const datum = istDatum(a.datum) ? a.datum : today(), start = istZeit(a.start) ? a.start : '', art = ARTEN.includes(a.art) ? a.art : 'Sonstiges';
    const ende = start ? (istZeit(a.ende) && a.ende > start ? a.ende : plus(start, art === 'Besichtigung' ? 30 : 60)) : '';
    const e = await db.save('events', { titel: String(a.titel || art).slice(0, 160), datum, start, ende, art, contactId: c?.id || '', propertyId: p?.id || '', ort: a.ort || (p ? adresse(p) : ''), notiz: a.notiz ? String(a.notiz).slice(0, 1000) : '' });
    G.neu.add(e.id);
    if (c) await db.log(art === 'Besichtigung' ? 'besichtigung' : 'meeting', `${art} geplant am ${fmtDate(datum)}${start ? ' ' + start : ''}`, { contactId: c.id, propertyId: p?.id || '' });
    return { text: `▦ Termin: ${e.titel} – ${zeit(e)}${mit}`, kurz: `Termin ${ref('E', e.id)} angelegt`, undo: async () => { await db.del('events', e.id); G.neu.delete(e.id); }, ziel: '#/kalender' };
  }
  if (a.typ === 'aufgabe') {
    if (!a.titel) return { text: '⚠ Aufgabe ohne Text – nicht angelegt', fehler: true };
    const t = await db.save('tasks', { titel: String(a.titel).slice(0, 200), faellig: istDatum(a.faellig) ? a.faellig : today(), prio: a.prio === 'hoch' ? 'hoch' : 'normal', done: false, contactId: c?.id || '', propertyId: p?.id || '', notiz: a.notiz ? String(a.notiz).slice(0, 1000) : '' });
    G.neu.add(t.id);
    return { text: `✓ Aufgabe: ${t.titel} – fällig ${tagText(t.faellig)}${mit}`, kurz: `Aufgabe ${ref('T', t.id)} angelegt`, undo: async () => { await db.del('tasks', t.id); G.neu.delete(t.id); }, ziel: '#/aufgaben' };
  }
  if (a.typ === 'notiz') {
    if (!a.text) return { text: '⚠ Notiz ohne Text', fehler: true };
    const art = AKT.includes(a.art) ? a.art : 'notiz', x = await db.log(art, String(a.text).slice(0, 1000), { contactId: c?.id || '', propertyId: p?.id || '' });
    return { text: `${art === 'anruf' ? '📞 Anruf' : '📝 ' + art[0].toUpperCase() + art.slice(1)} festgehalten${mit}: ${a.text}`, kurz: `${art} festgehalten${mit}`, undo: () => db.del('activities', x.id), ziel: c ? '#/kontakte/' + c.id : '' };
  }
  if (a.typ === 'kontakt') {
    if (!a.nachname && !a.vorname) return { text: '⚠ Kontakt ohne Namen', fehler: true };
    const n = await db.save('contacts', { anrede: a.anrede || '', vorname: a.vorname || '', nachname: a.nachname || '', mobil: a.tel || '', email: a.email || '', kategorie: a.kategorie || 'Interessent (Kauf)', quelle: 'Sprach-Assistent', status: 'Aktiv' });
    return { text: `☺ Kontakt angelegt: ${fullName(n)}${a.tel ? ' · ' + a.tel : ''}`, kurz: `Kontakt ${ref('K', n.id)} ${fullName(n)} angelegt`, undo: () => db.del('contacts', n.id), ziel: '#/kontakte/' + n.id };
  }
  if (a.typ === 'erledigen' || a.typ === 'aufgabe_aendern' || a.typ === 'aufgabe_loeschen') {
    const t = hol('T', a.aufgabe); if (!t) return { text: '⚠ Aufgabe nicht gefunden', fehler: true, kurz: 'Aufgabe nicht gefunden' };
    const tt = String(t.titel).replace(/^⚡ /, '');
    if (a.typ === 'erledigen') { await completeTask(t, true, false); return { text: `✓ Erledigt: ${tt}`, kurz: `Aufgabe ${a.aufgabe} erledigt`, undo: async () => { const x = db.get('tasks', t.id); if (x) await db.save('tasks', { ...x, done: false, doneAt: '' }); } }; }
    if (a.typ === 'aufgabe_loeschen') { const weg = async () => { await db.del('tasks', t.id); G.neu.delete(t.id); return `🗑 Aufgabe gelöscht: ${tt}`; };
      if (G.neu.has(t.id)) return { text: await weg(), kurz: `Aufgabe ${a.aufgabe} gelöscht`, undo: () => db.save('tasks', t) };
      return { text: `Aufgabe löschen: ${tt}?`, kurz: `Löschen von ${a.aufgabe} wartet auf Bestätigung`, bestaetigen: weg }; }
    const neu = { ...t, titel: a.titel ? String(a.titel).slice(0, 200) : t.titel, faellig: istDatum(a.faellig) ? a.faellig : t.faellig, prio: ['hoch', 'normal'].includes(a.prio) ? a.prio : t.prio, contactId: c ? c.id : t.contactId, notiz: a.notiz ? [t.notiz, String(a.notiz).slice(0, 1000)].filter(Boolean).join('\n') : t.notiz };
    await db.save('tasks', neu);
    return { text: `✓ Aufgabe geändert: ${String(neu.titel).replace(/^⚡ /, '')} – fällig ${tagText(neu.faellig)}${a.notiz ? ' · Notiz ergänzt' : ''}`, kurz: `Aufgabe ${a.aufgabe} geändert`, undo: () => db.save('tasks', t), ziel: '#/aufgaben' };
  }
  if (a.typ === 'termin_aendern' || a.typ === 'termin_loeschen') {
    const e = hol('E', a.termin); if (!e) return { text: '⚠ Termin nicht gefunden', fehler: true, kurz: 'Termin nicht gefunden' };
    const eigen = G.neu.has(e.id);   // in diesem Gespräch angelegt → Änderungen sofort, sonst erst nach Bestätigung
    if (a.typ === 'termin_loeschen') { const weg = async () => { await db.del('events', e.id); G.neu.delete(e.id); return `🗑 Termin gelöscht: ${e.titel}`; };
      if (eigen) return { text: await weg(), kurz: `Termin ${a.termin} gelöscht`, undo: () => db.save('events', e) };
      return { text: `Termin löschen: ${e.titel} (${zeit(e)})?`, kurz: `Löschen von ${a.termin} wartet auf Bestätigung`, bestaetigen: weg }; }
    const neu = { ...e, titel: a.titel ? String(a.titel).slice(0, 160) : e.titel, datum: istDatum(a.datum) ? a.datum : e.datum, start: istZeit(a.start) ? a.start : e.start, art: ARTEN.includes(a.art) ? a.art : e.art,
      contactId: c ? c.id : e.contactId, propertyId: p ? p.id : e.propertyId, ort: a.ort ? String(a.ort).slice(0, 200) : (p && !e.ort ? adresse(p) : e.ort), notiz: a.notiz ? [e.notiz, String(a.notiz).slice(0, 1000)].filter(Boolean).join('\n') : e.notiz };
    const dauer = e.start && e.ende ? (+e.ende.slice(0, 2) * 60 + +e.ende.slice(3)) - (+e.start.slice(0, 2) * 60 + +e.start.slice(3)) : (neu.art === 'Besichtigung' ? 30 : 60);
    neu.ende = istZeit(a.ende) ? a.ende : (neu.start ? plus(neu.start, Math.max(15, dauer)) : '');
    const zeitNeu = neu.datum !== e.datum || neu.start !== e.start || neu.ende !== e.ende, was = [zeitNeu ? zeit(neu) : '', a.titel ? 'Titel' : '', c && c.id !== e.contactId ? 'mit ' + fullName(c) : '', a.ort || (p && p.id !== e.propertyId) ? 'Ort' : '', a.notiz ? 'Notiz ergänzt' : '', a.art && neu.art !== e.art ? neu.art : ''].filter(Boolean).join(' · ');
    const tun = async () => { await db.save('events', neu); return `▦ Termin geändert: ${neu.titel}${was ? ' – ' + was : ''}`; };
    if (eigen || !zeitNeu) return { text: await tun(), kurz: `Termin ${a.termin} geändert`, undo: () => db.save('events', e), ziel: '#/kalender' };
    return { text: `Termin verschieben: ${e.titel} → ${zeit(neu)}?`, kurz: `Verschieben von ${a.termin} wartet auf Bestätigung`, bestaetigen: tun };
  }
  return { text: '⚠ Das kann ich noch nicht: ' + (a.typ || '?'), fehler: true, kurz: 'unbekannte Aktion' };
}

// ---------- Oberfläche ----------
let offen = null, erkennung = null;   // eine Spracherkennung für die ganze Sitzung – der Browser fragt dann seltener nach dem Mikrofon
const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
// Vorlesen mit der ruhigen ElevenLabs-Stimme (wie in der Morgenroutine); ohne Cloud oder bei Fehler die Stimme des Geräts.
// Das Audio-Element wird beim Tippen/Klicken „entsperrt“, damit der Browser das Abspielen nach der KI-Antwort erlaubt.
let ton = null;
const STILLE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
function tonBereit() { try { if (!stimmeVerfuegbar() || localStorage.getItem('kre-assi-stumm') === '1') return; if (!ton) ton = new Audio(); ton.src = STILLE; ton.play().catch(() => { }); } catch { } }
const sauberText = t => String(t || '').replace(/[▦✓📝📞☺🗑⚠]/g, '').slice(0, 700);
/** vorab/vorabText: bereits angeforderte Aufnahme für genau diesen Text (spart die Wartezeit) */
async function sag(text, vorab = null, vorabText = '') { try { if (!text || localStorage.getItem('kre-assi-stumm') === '1') return; const t = sauberText(text); stopp(); await vorlesen(t, stimmeVerfuegbar() ? ton : null, vorab && vorabText === t ? vorab : null); } catch { } }

export function oeffnen() {
  if (offen) return offen.querySelector('input')?.focus();
  const el = document.createElement('div'); el.className = 'assi'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Assistent');
  const stumm = () => { try { return localStorage.getItem('kre-assi-stumm') === '1'; } catch { return false; } };
  el.innerHTML = html`<div class="assi-k">
      <div class="assi-kopf"><b>Assistent</b><span class="muted small">${ki.hasKey() ? 'merkt sich das Gespräch' : 'einfache Befehle – KI-Schlüssel fehlt'}</span><button type="button" class="assi-ton" data-neu title="Neues Gespräch beginnen" aria-label="Neues Gespräch beginnen">↺</button><button type="button" class="assi-ton" data-ton title="Antworten vorlesen an/aus" aria-label="Antworten vorlesen an oder aus">${stumm() ? '🔇' : '🔊'}</button><button type="button" class="assi-x" data-zu aria-label="Schließen">×</button></div>
      <details class="assi-stimme" ${stimmeVerfuegbar() ? '' : 'hidden'}><summary>Stimme ändern</summary><div><select data-stimme aria-label="Stimme"></select><button type="button" class="assi-b" data-stimmprobe>▶ Probe</button><span class="small" data-stimmhin></span></div></details>
      <div class="assi-log" data-log aria-live="polite"><p class="assi-tipp">Sag oder schreib, was ich tun soll, z. B.:<br>„Freitag 14 Uhr Besichtigung Leopoldstraße mit Herrn Weber“<br>„Aufgabe: morgen Exposé an Frau Sommer schicken“<br>„Ich habe gerade mit Herrn Bauer telefoniert, er meldet sich Montag“<br>„Was steht heute an?“</p></div>
      <form class="assi-f" data-f><button type="button" class="assi-mik" data-mik aria-label="Sprechen" ${SR() ? '' : 'hidden'}>🎙</button><input name="q" autocomplete="off" enterkeyhint="send" placeholder="${SR() ? 'Sprechen oder tippen …' : 'Tippen – oder das Mikrofon der Tastatur nutzen …'}" aria-label="Anweisung"><button class="btn primary" aria-label="Senden">➤</button></form></div>`.s;
  document.body.appendChild(el); offen = el;
  const log = el.querySelector('[data-log]'), f = el.querySelector('[data-f]'), mik = el.querySelector('[data-mik]'); let rec = null;
  const zu = () => { try { rec?.abort(); } catch { } stopp(); el.remove(); offen = null; document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') zu(); }; document.addEventListener('keydown', esc);
  stimmenWahl(el);
  el.querySelector('[data-zu]').onclick = zu; el.onclick = e => { if (e.target === el) zu(); };
  el.querySelector('[data-ton]').onclick = e => { const an = !stumm(); try { localStorage.setItem('kre-assi-stumm', an ? '1' : '0'); } catch { } e.currentTarget.textContent = an ? '🔇' : '🔊'; if (an) stopp(); };
  el.querySelector('[data-neu]').onclick = () => { vergessen(); stopp(); log.innerHTML = ''; zeile('er', 'Neues Gespräch – was kann ich für dich tun?'); };
  const zeile = (cls, text) => { const p = document.createElement('div'); p.className = 'assi-z ' + cls; p.textContent = text; log.appendChild(p); log.scrollTop = log.scrollHeight; return p; };
  const knopf = (zu_, label, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'assi-b ' + cls; b.textContent = label; b.onclick = () => fn(b); zu_.appendChild(b); return b; };

  let perStimme = false;
  async function senden(satz) {
    satz = String(satz || '').trim(); if (!satz) return;
    log.querySelector('.assi-tipp')?.remove(); zeile('ich', satz); const warte = zeile('er warte', '…');
    try {
      let vorab = null, vorabText = '';
      const r = await verstehen(satz, t => { if (t && localStorage.getItem('kre-assi-stumm') !== '1') { vorabText = sauberText(t); vorab = vorbereiten(vorabText); } }); warte.remove();
      const gesagt = [], kurz = [];
      for (const a of r.aktionen.slice(0, 6)) {
        const x = await ausfuehren(a), z = zeile('er ' + (x.fehler ? 'fehler' : x.bestaetigen ? 'frage' : 'ok'), x.text); if (x.kurz) kurz.push(x.kurz);
        if (x.bestaetigen) { knopf(z, 'Ja, ausführen', async () => { const t = await x.bestaetigen(); z.textContent = t; z.className = 'assi-z er ok'; G.zusatz += ' Bestätigt: ' + t + '.'; }, 'ja'); knopf(z, 'Nein', () => { z.textContent = 'Nicht ausgeführt.'; z.className = 'assi-z er'; G.zusatz += ' Abgelehnt: ' + x.text; }); gesagt.push(x.text + ' Bitte bestätigen.'); }
        else if (!x.fehler) { if (x.undo) knopf(z, 'Rückgängig', async () => { await x.undo(); z.textContent = 'Rückgängig gemacht.'; z.className = 'assi-z er'; G.zusatz += ' Vom Nutzer rückgängig gemacht: ' + x.text + '.'; }); if (x.ziel) knopf(z, 'Öffnen', () => { location.hash = x.ziel; zu(); }); gesagt.push(x.text.replace(/^\S+\s/, '')); }
      }
      if (kurz.length) G.zusatz = (G.zusatz ? G.zusatz + ' ' : '') + kurz.join('; ') + '.';
      if (r.antwort && (!r.aktionen.length || r.ki)) zeile('er', r.antwort);
      const wartet = r.aktionen.length && r.aktionen.some(a => /loeschen|aendern/.test(a.typ)) && log.querySelector('.assi-z.frage .assi-b');
      await sag(wartet ? gesagt.join('. ') : r.aktionen.length ? (r.antwort || 'Erledigt. ' + gesagt.join('. ')) : r.antwort, vorab, vorabText);
      // Rückfrage des Assistenten nach einer Spracheingabe → gleich wieder zuhören
      if (perStimme && offen && !r.aktionen.length && /\?\s*$/.test(r.antwort) && SR() && !rec) mik.click();
    } catch (e) { warte.remove(); zeile('er fehler', '⚠ ' + (e.message || 'Fehler')); }
  }
  f.onsubmit = e => { e.preventDefault(); tonBereit(); perStimme = false; const v = f.q.value; f.q.value = ''; senden(v); };
  if (SR()) mik.onclick = () => {
    if (rec) { try { rec.stop(); } catch { } return; }
    stopp(); tonBereit();
    rec = erkennung || (erkennung = new (SR())()); rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = false; let fertig = '';
    rec.onresult = ev => { let t = ''; for (const r of ev.results) t += r[0].transcript; f.q.value = t; if (ev.results[ev.results.length - 1].isFinal) fertig = t; };
    rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') zeile('er fehler', '⚠ Mikrofon nicht erlaubt. Tippe ins Feld und nutze das Mikrofon der Tastatur.'); };
    rec.onend = () => { rec = null; mik.classList.remove('an'); const v = (fertig || f.q.value).trim(); if (v) { f.q.value = ''; perStimme = true; senden(v); } };
    mik.classList.add('an'); try { rec.start(); } catch { rec = null; mik.classList.remove('an'); }
  };
  if (matchMedia('(hover:hover)').matches) f.q.focus();
  return el;
}
export const _test = { regeln, ausfuehren, wissen, G };

/** Schwebender Knopf – überall im CRM erreichbar */
export function einrichten() {
  if (document.getElementById('assi-knopf')) return;
  const b = document.createElement('button'); b.id = 'assi-knopf'; b.type = 'button'; b.title = 'Assistent – per Stimme eintragen'; b.setAttribute('aria-label', 'Assistent öffnen'); b.textContent = '🎙';
  b.onclick = oeffnen; document.body.appendChild(b);
}
