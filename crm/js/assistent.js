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

const ARTEN = Object.keys(FARBE), AKT = ['notiz', 'anruf', 'meeting', 'whatsapp', 'besichtigung', 'email'];
const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const tagText = d => d === today() ? 'heute' : d === addDays(today(), 1) ? 'morgen' : `${WT[new Date(d + 'T12:00:00').getDay()]}, ${fmtDate(d)}`;
const istDatum = d => /^\d{4}-\d{2}-\d{2}$/.test(d || ''), istZeit = t => /^\d{2}:\d{2}$/.test(t || '');
const plus = (t, min) => { const [h, m] = t.split(':').map(Number), x = h * 60 + m + min; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

// ---------- Was der Assistent über das CRM weiß (mit kurzen Kennungen statt langer IDs) ----------
function wissen() {
  const t0 = today(), K = db.all('contacts').slice(0, 600), P = db.all('properties').filter(p => p.status !== 'Archiv').slice(0, 150);
  const E = db.all('events').filter(e => e.datum >= addDays(t0, -1) && e.datum <= addDays(t0, 30)).sort((a, b) => (a.datum + (a.start || '')).localeCompare(b.datum + (b.start || ''))).slice(0, 60);
  const T = db.all('tasks').filter(t => !t.done).sort((a, b) => (a.faellig || '9').localeCompare(b.faellig || '9')).slice(0, 60);
  const text = [`Heute ist ${WT[new Date().getDay()]}, ${t0}. Uhrzeit ${new Date().toTimeString().slice(0, 5)}.`,
    'KONTAKTE:', ...K.map((c, i) => `K${i} ${[c.anrede, c.vorname, c.nachname].filter(Boolean).join(' ')}${c.firma ? ' (' + c.firma + ')' : ''}${c.kategorie ? ' [' + c.kategorie + ']' : ''}`),
    'OBJEKTE:', ...P.map((p, i) => `P${i} ${p.titel || ''} | ${adresse(p)}`),
    'TERMINE (gestern bis +30 Tage):', ...E.map((e, i) => `E${i} ${e.datum} ${e.start || 'ganztägig'} ${e.titel}`),
    'OFFENE AUFGABEN:', ...T.map((t, i) => `T${i} ${t.faellig || 'ohne Datum'} ${String(t.titel).replace(/^⚡ /, '')}`)].join('\n');
  return { K, P, E, T, text };
}
const SYSTEM = `Du bist der Sprach-Assistent im CRM eines Immobilienvertriebs (Kapitalanlage-Wohnungen). Der Nutzer spricht unterwegs kurze Anweisungen ein; die Spracherkennung kann Namen falsch schreiben – ordne sie dem ähnlichsten Kontakt/Objekt zu.
Antworte NUR mit JSON: {"antwort":"ein kurzer deutscher Satz in Du-Form","aktionen":[...]}.
Mögliche Aktionen:
{"typ":"termin","titel":"","datum":"JJJJ-MM-TT","start":"HH:MM","ende":"HH:MM","art":"${ARTEN.join('|')}","kontakt":"K3","objekt":"P1","ort":""}
{"typ":"aufgabe","titel":"","faellig":"JJJJ-MM-TT","prio":"hoch|normal","kontakt":"K3","objekt":"P1"}
{"typ":"notiz","art":"${AKT.join('|')}","text":"","kontakt":"K3","objekt":"P1"}   (z. B. „ich habe Herrn Weber angerufen“ → art anruf)
{"typ":"kontakt","anrede":"Herr|Frau","vorname":"","nachname":"","tel":"","email":"","kategorie":"Interessent (Kauf)"}
{"typ":"erledigen","aufgabe":"T4"}
{"typ":"termin_aendern","termin":"E2","datum":"","start":"","ende":""}
{"typ":"termin_loeschen","termin":"E2"}
Regeln: Felder ohne Angabe weglassen. Ohne Uhrzeit ist ein Termin ganztägig (start weglassen). Ohne Enddauer 60 Minuten, Besichtigung 30. Aufgabe ohne Datum: heute. Wochentage meinen den nächsten solchen Tag. Erfinde keine Kontakte: passt keiner, lass "kontakt" weg und nenne den Namen im Titel. Mehrere Anweisungen in einem Satz ergeben mehrere Aktionen.
Reine Fragen (z. B. „was steht heute an“, „wann ist der Notartermin“) beantwortest du in "antwort" aus den Daten, mit leeren "aktionen". Ist etwas unklar, frage in "antwort" kurz nach und lass "aktionen" leer.`;

// ---------- Verstehen ----------
async function verstehen(satz, W) {
  if (ki.hasKey()) {
    const j = await ki.jsonFrage(SYSTEM + '\n\n' + W.text, satz, { max_tokens: 900 });
    return { antwort: String(j.antwort || ''), aktionen: Array.isArray(j.aktionen) ? j.aktionen : [], ki: true };
  }
  return regeln(satz);
}
/** Ohne KI: Aufgabe / Notiz / Termin an Schlüsselwörtern erkennen */
export function regeln(satz) {
  const s = satz.trim(), r = parseTermin(s.replace(/^(bitte\s+)?(trag(e)?|schreib(e)?|leg(e)?|mach(e)?|erstell(e)?|notier(e)?)\s+(mir\s+)?(bitte\s+)?/i, '').replace(/\s+(ein|an|auf)\s*\.?$/i, ''));
  const K = db.all('contacts'), kid = r.contactId ? 'K' + K.findIndex(c => c.id === r.contactId) : undefined;
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
/** Führt eine Aktion aus. Liefert { text, undo?, bestaetigen? } */
async function ausfuehren(a, W) {
  const kon = k => /^K\d+$/.test(k || '') ? W.K[+k.slice(1)] : null, obj = p => /^P\d+$/.test(p || '') ? W.P[+p.slice(1)] : /^id:/.test(p || '') ? db.get('properties', p.slice(3)) : null;
  const c = kon(a.kontakt), p = obj(a.objekt), mit = c ? ' · ' + fullName(c) : '';
  if (a.typ === 'termin') {
    if (!a.titel && !a.art) return { text: '⚠ Termin ohne Titel – nicht eingetragen', fehler: true };
    const datum = istDatum(a.datum) ? a.datum : today(), start = istZeit(a.start) ? a.start : '', art = ARTEN.includes(a.art) ? a.art : 'Sonstiges';
    const ende = start ? (istZeit(a.ende) && a.ende > start ? a.ende : plus(start, art === 'Besichtigung' ? 30 : 60)) : '';
    const e = await db.save('events', { titel: String(a.titel || art).slice(0, 160), datum, start, ende, art, contactId: c?.id || '', propertyId: p?.id || '', ort: a.ort || (p ? adresse(p) : '') });
    if (c) await db.log(art === 'Besichtigung' ? 'besichtigung' : 'meeting', `${art} geplant am ${fmtDate(datum)}${start ? ' ' + start : ''}`, { contactId: c.id, propertyId: p?.id || '' });
    return { text: `▦ Termin: ${e.titel} – ${tagText(datum)}${start ? ', ' + start + '–' + ende : ', ganztägig'}${mit}`, undo: () => db.del('events', e.id), ziel: '#/kalender' };
  }
  if (a.typ === 'aufgabe') {
    if (!a.titel) return { text: '⚠ Aufgabe ohne Text – nicht angelegt', fehler: true };
    const t = await db.save('tasks', { titel: String(a.titel).slice(0, 200), faellig: istDatum(a.faellig) ? a.faellig : today(), prio: a.prio === 'hoch' ? 'hoch' : 'normal', done: false, contactId: c?.id || '', propertyId: p?.id || '' });
    return { text: `✓ Aufgabe: ${t.titel} – fällig ${tagText(t.faellig)}${mit}`, undo: () => db.del('tasks', t.id), ziel: '#/aufgaben' };
  }
  if (a.typ === 'notiz') {
    if (!a.text) return { text: '⚠ Notiz ohne Text', fehler: true };
    const art = AKT.includes(a.art) ? a.art : 'notiz', x = await db.log(art, String(a.text).slice(0, 1000), { contactId: c?.id || '', propertyId: p?.id || '' });
    return { text: `${art === 'anruf' ? '📞 Anruf' : '📝 ' + art[0].toUpperCase() + art.slice(1)} festgehalten${mit}: ${a.text}`, undo: () => db.del('activities', x.id), ziel: c ? '#/kontakte/' + c.id : '' };
  }
  if (a.typ === 'kontakt') {
    if (!a.nachname && !a.vorname) return { text: '⚠ Kontakt ohne Namen', fehler: true };
    const n = await db.save('contacts', { anrede: a.anrede || '', vorname: a.vorname || '', nachname: a.nachname || '', mobil: a.tel || '', email: a.email || '', kategorie: a.kategorie || 'Interessent (Kauf)', quelle: 'Sprach-Assistent', status: 'Aktiv' });
    return { text: `☺ Kontakt angelegt: ${fullName(n)}${a.tel ? ' · ' + a.tel : ''}`, undo: () => db.del('contacts', n.id), ziel: '#/kontakte/' + n.id };
  }
  if (a.typ === 'erledigen') {
    const t = /^T\d+$/.test(a.aufgabe || '') ? W.T[+a.aufgabe.slice(1)] : null; if (!t) return { text: '⚠ Aufgabe nicht gefunden', fehler: true };
    await completeTask(db.get('tasks', t.id) || t, true, false);
    return { text: `✓ Erledigt: ${String(t.titel).replace(/^⚡ /, '')}`, undo: async () => { const x = db.get('tasks', t.id); if (x) await db.save('tasks', { ...x, done: false, doneAt: '' }); } };
  }
  if (a.typ === 'termin_aendern' || a.typ === 'termin_loeschen') {
    const e = /^E\d+$/.test(a.termin || '') ? W.E[+a.termin.slice(1)] : null; if (!e) return { text: '⚠ Termin nicht gefunden', fehler: true };
    if (a.typ === 'termin_loeschen') return { text: `Termin löschen: ${e.titel} (${tagText(e.datum)}${e.start ? ', ' + e.start : ''})?`, bestaetigen: async () => { await db.del('events', e.id); return `🗑 Termin gelöscht: ${e.titel}`; } };
    const neu = { ...e, datum: istDatum(a.datum) ? a.datum : e.datum, start: istZeit(a.start) ? a.start : e.start };
    const dauer = e.start && e.ende ? (+e.ende.slice(0, 2) * 60 + +e.ende.slice(3)) - (+e.start.slice(0, 2) * 60 + +e.start.slice(3)) : 60;
    neu.ende = istZeit(a.ende) ? a.ende : (neu.start ? plus(neu.start, Math.max(15, dauer)) : '');
    return { text: `Termin verschieben: ${e.titel} → ${tagText(neu.datum)}${neu.start ? ', ' + neu.start + '–' + neu.ende : ''}?`, bestaetigen: async () => { await db.save('events', neu); return `▦ Verschoben: ${e.titel} – ${tagText(neu.datum)}${neu.start ? ', ' + neu.start : ''}`; } };
  }
  return { text: '⚠ Das kann ich noch nicht: ' + (a.typ || '?'), fehler: true };
}

// ---------- Oberfläche ----------
let offen = null;
const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
function sag(text) { try { const sy = window.speechSynthesis; if (!sy || !text || localStorage.getItem('kre-assi-stumm') === '1') return; sy.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/[▦✓📝📞☺🗑⚠]/g, '')); u.lang = 'de-DE'; sy.speak(u); } catch { } }

export function oeffnen() {
  if (offen) return offen.querySelector('input')?.focus();
  const el = document.createElement('div'); el.className = 'assi'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Assistent');
  const stumm = () => { try { return localStorage.getItem('kre-assi-stumm') === '1'; } catch { return false; } };
  el.innerHTML = html`<div class="assi-k">
      <div class="assi-kopf"><b>Assistent</b><span class="muted small">${ki.hasKey() ? 'versteht freie Sätze' : 'einfache Befehle – KI-Schlüssel fehlt'}</span><button type="button" class="assi-ton" data-ton title="Antworten vorlesen an/aus" aria-label="Antworten vorlesen an oder aus">${stumm() ? '🔇' : '🔊'}</button><button type="button" class="assi-x" data-zu aria-label="Schließen">×</button></div>
      <div class="assi-log" data-log aria-live="polite"><p class="assi-tipp">Sag oder schreib, was ich tun soll, z. B.:<br>„Freitag 14 Uhr Besichtigung Leopoldstraße mit Herrn Weber“<br>„Aufgabe: morgen Exposé an Frau Sommer schicken“<br>„Ich habe gerade mit Herrn Bauer telefoniert, er meldet sich Montag“<br>„Was steht heute an?“</p></div>
      <form class="assi-f" data-f><button type="button" class="assi-mik" data-mik aria-label="Sprechen" ${SR() ? '' : 'hidden'}>🎙</button><input name="q" autocomplete="off" enterkeyhint="send" placeholder="${SR() ? 'Sprechen oder tippen …' : 'Tippen – oder das Mikrofon der Tastatur nutzen …'}" aria-label="Anweisung"><button class="btn primary" aria-label="Senden">➤</button></form></div>`.s;
  document.body.appendChild(el); offen = el;
  const log = el.querySelector('[data-log]'), f = el.querySelector('[data-f]'), mik = el.querySelector('[data-mik]'); let rec = null;
  const zu = () => { try { rec?.abort(); } catch { } try { speechSynthesis.cancel(); } catch { } el.remove(); offen = null; document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') zu(); }; document.addEventListener('keydown', esc);
  el.querySelector('[data-zu]').onclick = zu; el.onclick = e => { if (e.target === el) zu(); };
  el.querySelector('[data-ton]').onclick = e => { const an = !stumm(); try { localStorage.setItem('kre-assi-stumm', an ? '1' : '0'); } catch { } e.currentTarget.textContent = an ? '🔇' : '🔊'; if (an) try { speechSynthesis.cancel(); } catch { } };
  const zeile = (cls, text) => { const p = document.createElement('div'); p.className = 'assi-z ' + cls; p.textContent = text; log.appendChild(p); log.scrollTop = log.scrollHeight; return p; };
  const knopf = (zu_, label, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'assi-b ' + cls; b.textContent = label; b.onclick = () => fn(b); zu_.appendChild(b); return b; };

  async function senden(satz) {
    satz = String(satz || '').trim(); if (!satz) return;
    log.querySelector('.assi-tipp')?.remove(); zeile('ich', satz); const warte = zeile('er warte', '…');
    try {
      const W = wissen(), r = await verstehen(satz, W); warte.remove();
      const gesagt = [];
      for (const a of r.aktionen.slice(0, 6)) {
        const x = await ausfuehren(a, W), z = zeile('er ' + (x.fehler ? 'fehler' : x.bestaetigen ? 'frage' : 'ok'), x.text);
        if (x.bestaetigen) { knopf(z, 'Ja, ausführen', async b => { const t = await x.bestaetigen(); z.textContent = t; z.className = 'assi-z er ok'; }, 'ja'); knopf(z, 'Nein', () => { z.textContent = 'Nicht ausgeführt.'; z.className = 'assi-z er'; }); gesagt.push(x.text); }
        else if (!x.fehler) { if (x.undo) knopf(z, 'Rückgängig', async () => { await x.undo(); z.textContent = 'Rückgängig gemacht.'; z.className = 'assi-z er'; }); if (x.ziel) knopf(z, 'Öffnen', () => { location.hash = x.ziel; zu(); }); gesagt.push(x.text.replace(/^\S+\s/, '')); }
      }
      if (r.antwort && (!r.aktionen.length || r.ki)) zeile('er', r.antwort);
      sag(r.aktionen.length ? (r.antwort || 'Erledigt. ' + gesagt.join('. ')) : r.antwort);
    } catch (e) { warte.remove(); zeile('er fehler', '⚠ ' + (e.message || 'Fehler')); }
  }
  f.onsubmit = e => { e.preventDefault(); const v = f.q.value; f.q.value = ''; senden(v); };
  if (SR()) mik.onclick = () => {
    if (rec) { try { rec.stop(); } catch { } return; }
    try { speechSynthesis.cancel(); } catch { }
    rec = new (SR())(); rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = false; let fertig = '';
    rec.onresult = ev => { let t = ''; for (const r of ev.results) t += r[0].transcript; f.q.value = t; if (ev.results[ev.results.length - 1].isFinal) fertig = t; };
    rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') zeile('er fehler', '⚠ Mikrofon nicht erlaubt. Tippe ins Feld und nutze das Mikrofon der Tastatur.'); };
    rec.onend = () => { rec = null; mik.classList.remove('an'); const v = (fertig || f.q.value).trim(); if (v) { f.q.value = ''; senden(v); } };
    mik.classList.add('an'); try { rec.start(); } catch { rec = null; mik.classList.remove('an'); }
  };
  if (matchMedia('(hover:hover)').matches) f.q.focus();
  return el;
}
export const _test = { regeln, ausfuehren, wissen };

/** Schwebender Knopf – überall im CRM erreichbar */
export function einrichten() {
  if (document.getElementById('assi-knopf')) return;
  const b = document.createElement('button'); b.id = 'assi-knopf'; b.type = 'button'; b.title = 'Assistent – per Stimme eintragen'; b.setAttribute('aria-label', 'Assistent öffnen'); b.textContent = '🎙';
  b.onclick = oeffnen; document.body.appendChild(b);
}
