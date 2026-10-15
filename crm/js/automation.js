// Automations-Engine: läuft im Browser (beim Öffnen, alle 5 Min., bei Fokus). Idempotent über task.auto-Schlüssel.
import * as db from './db.js';
import { today, addDays, daysBetween, fullName, toast } from './util.js';
import { matchesForProperty, lastContact } from './ui.js';
import { PIPELINES } from './consts.js';
import * as google from './google.js';
import { ausstehend } from './website.js';

// Was in jeder Pipeline-Phase als Nächstes zu tun ist
export const SCHRITTE = {
  vertrieb: { 'Anfrage': 'Exposé & Kurzkalkulation senden, Beratungstermin anbieten', 'Beratungsgespräch': 'Persönliche Berechnung (Steuervorteil, Cashflow) erstellen & Besichtigung anbieten', 'Besichtigung': 'Finanzierungsunterlagen / Bankzusage anfordern', 'Finanzierung / Prüfung': 'Finanzierungszusage prüfen, Reservierung anbieten', 'Reservierung': 'Reservierung an Verkäufer melden, Notartermin & Kaufvertragsentwurf anfordern', 'Notartermin': 'Unterlagen an Notar senden – nach Beurkundung Vergütung beim Verkäufer abrechnen' },
  akquise: { 'Neuer Lead': 'Verkäufer / Bauträger anrufen (Erstgespräch)', 'Erstkontakt': 'Preisliste, Grundrisse & Objektunterlagen anfordern', 'Bewertung / Besichtigung': 'Objekt prüfen & Anleger-Kalkulation erstellen', 'Angebot / Maklerauftrag': 'Vertriebsvereinbarung (Vergütung je Einheit) abschließen' },
};
const KONTAKT_ARTEN = ['anruf', 'email', 'meeting', 'whatsapp', 'besichtigung'];

export const RULES = [
  { id: 'neuerInteressent', name: 'Neuer Interessent → Erstkontakt', desc: 'Legt für jeden neuen Interessenten eine Aufgabe „Erstkontakt“ an.', days: 1, unit: 'Tage nach Anlage' },
  { id: 'besichtigungFeedback', name: 'Nach Besichtigung → Feedback einholen', desc: 'Nach jedem vergangenen Besichtigungstermin entsteht eine Nachfass-Aufgabe.', days: 1, unit: 'Tage nach Termin' },
  { id: 'dealStillstand', name: 'Vorgang ohne Bewegung → Nachfassen', desc: 'Offene Vorgänge, die lange unverändert sind, erzeugen eine Aufgabe.', days: 5, unit: 'Tage Stillstand' },
  { id: 'kaltKontakt', name: 'Lange nicht kontaktiert → Kontakt aufnehmen', desc: 'Eigentümer/Investoren ohne Kontakt erhalten monatlich eine Erinnerung.', days: 60, unit: 'Tage ohne Kontakt' },
  { id: 'wiedervorlage', name: 'Wiedervorlage fällig → Aufgabe', desc: 'Aus dem Wiedervorlage-Datum eines Kontakts wird automatisch eine Aufgabe.', days: null },
  { id: 'geburtstag', name: 'Geburtstag → Gruß senden', desc: 'Aufgabe am Geburtstag (Vorlage „Geburtstagsgruß“ nutzen).', days: 0, unit: 'Tage vorher' },
  { id: 'vertragEnde', name: 'Vertriebsvereinbarung läuft aus → verlängern', desc: 'Warnt rechtzeitig vor Vertragsende.', days: 30, unit: 'Tage vorher' },
  { id: 'energieausweis', name: 'Energieausweis läuft ab → erneuern', desc: 'Aufgabe, wenn der Energieausweis bald abläuft.', days: 60, unit: 'Tage vorher' },
  { id: 'matches', name: 'Passender Interessent → informieren', desc: 'Bei aktiven Objekten mit Treffer im Suchprofil entsteht eine Aufgabe.', days: 80, unit: '% Mindest-Übereinstimmung' },
  { id: 'ueberfaellig', name: 'Überfällig → Priorität erhöhen', desc: 'Aufgaben, die lange überfällig sind, werden auf „hoch“ gesetzt.', days: 3, unit: 'Tage überfällig' },
  { id: 'abschluss', name: 'Abschluss → Folgeaufgaben', desc: 'Nach Verkauf: Empfehlung/Bewertung anfragen. Nach Auftrag: Objekt vorbereiten.', days: 14, unit: 'Tage nach Abschluss' },
  { id: 'rechnungStellen', name: 'Verkauf abgeschlossen → Vergütung abrechnen', desc: 'Jeder abgeschlossene Verkauf ohne Rechnung erzeugt „Vergütung beim Verkäufer abrechnen“ (Finanzen → Rechnung fällig).', days: null },
  { id: 'rechnungFaellig', name: 'Rechnung überfällig → Zahlung anmahnen', desc: 'Offene Rechnungen nach Fälligkeit erzeugen eine Aufgabe zur Zahlungserinnerung.', days: 3, unit: 'Tage nach Fälligkeit' },
  { id: 'phasenSchritte', name: 'Neue Pipeline-Phase → nächster Schritt', desc: 'Jede Phase eines Vorgangs erzeugt automatisch die passende To-do (z. B. Reservierung → Notartermin vereinbaren). Beim Weiterschieben erledigt sich die alte von selbst.', days: null },
  { id: 'terminBestaetigen', name: 'Termin morgen → bestätigen', desc: 'Am Vortag jeder Besichtigung/jedes Kundentermins entsteht „Termin bestätigen“.', days: 1, unit: 'Tage vorher' },
  { id: 'suchprofil', name: 'Interessent ohne Suchprofil → erfragen', desc: 'Damit das Objekt-Matching funktioniert: Aufgabe „Suchprofil erfragen“.', days: 2, unit: 'Tage nach Anlage' },
  { id: 'dubletten', name: 'Doppelter Kontakt → prüfen', desc: 'Gleiche E-Mail oder Telefonnummer bei zwei Kontakten erzeugt eine Prüf-Aufgabe.', days: null },
  { id: 'websiteFehlt', name: 'Aktives Objekt nicht online → veröffentlichen', desc: 'Aktive Objekte, die nicht auf keuerleber-immobilien.de stehen (oder ungespeicherte Änderungen haben), erzeugen eine Aufgabe.', days: 2, unit: 'Tage Wartezeit' },
  { id: 'autoErledigt', name: 'Kontakt aufgenommen → Aufgabe erledigt', desc: 'Sobald du einen Anruf, eine Mail oder ein Treffen beim Kontakt einträgst (oder eine Mail aus Outlook rausgeht), haken sich „Erstkontakt“, „Feedback“, „Nachfassen“ usw. selbst ab.', days: null },
  { id: 'belegPruefen', name: 'KI-Beleg unsicher → prüfen', desc: 'Belege, bei denen die KI unsicher war oder einen Hinweis hat (z. B. Bewirtung), erzeugen eine Prüf-Aufgabe. Offene Eingangsrechnungen erzeugen „Rechnung bezahlen“.', days: null },
  { id: 'statusSync', name: 'Pipeline → Objektstatus', desc: 'Reservierung/Notartermin im Vertrieb setzt das Objekt automatisch auf „Reserviert“/„Notartermin“.', days: null },
];
export const ruleCfg = () => { const saved = db.settings().auto || {}; return Object.fromEntries(RULES.map(r => [r.id, { on: true, days: r.days, ...(saved[r.id] || {}) }])); };
let running = false;

export async function run({ manual = false } = {}) {
  if (running || !db.all('settings').length) return 0;
  running = true; let n = 0;
  try {
    const cfg = ruleCfg(), t0 = today(), nm = id => fullName(db.get('contacts', id));
    const mk = async (key, titel, faellig, ref = {}, prio = 'normal') => {
      if (db.all('tasks').some(t => t.auto === key)) return;
      await db.save('tasks', { titel: '⚡ ' + titel, faellig, prio, done: false, auto: key, ...ref });
      await db.log('system', `⚡ Automatisch: Aufgabe „${titel}“ erstellt`, ref); n++;
    };
    const on = id => cfg[id].on, d = id => Number(cfg[id].days) || 0;
    const contacts = db.all('contacts'), props = db.all('properties'), deals = db.all('deals'), events = db.all('events');
    const isOpen = x => { const P = PIPELINES[x.board]; return P && x.stage !== P.won && x.stage !== P.lost; };

    if (on('neuerInteressent')) for (const c of contacts) if ((c.kategorie || '').startsWith('Interessent') && c.status !== 'Archiv' && c.created && daysBetween(c.created.slice(0, 10), t0) <= 7)
      await mk('ni:' + c.id, `Erstkontakt: ${fullName(c)}`, addDays(c.created.slice(0, 10), d('neuerInteressent')), { contactId: c.id }, 'hoch');
    if (on('besichtigungFeedback')) for (const e of events) if (e.art === 'Besichtigung' && e.contactId && e.datum < t0 && daysBetween(e.datum, t0) <= 21)
      await mk('bf:' + e.id, `Feedback einholen: ${nm(e.contactId)} (${e.titel})`, addDays(e.datum, d('besichtigungFeedback')), { contactId: e.contactId, propertyId: e.propertyId });
    if (on('dealStillstand')) for (const x of deals) if (isOpen(x) && x.updated && daysBetween(x.updated.slice(0, 10), t0) >= d('dealStillstand'))
      await mk(`ds:${x.id}:${x.updated.slice(0, 10)}`, `Vorgang nachfassen: ${x.titel}`, t0, { contactId: x.contactId, propertyId: x.propertyId });
    if (on('kaltKontakt')) for (const c of contacts) if (c.status === 'Aktiv' && ['Eigentümer', 'Investor', 'Verkäufer', 'Vermieter', 'Bauträger / Verkäufer'].includes(c.kategorie)) {
      const last = (lastContact(c.id) || c.created || '').slice(0, 10);
      if (last && daysBetween(last, t0) > d('kaltKontakt')) await mk(`kk:${c.id}:${t0.slice(0, 7)}`, `Kontakt aufnehmen: ${fullName(c)} (seit ${daysBetween(last, t0)} Tagen kein Kontakt)`, t0, { contactId: c.id });
    }
    if (on('wiedervorlage')) for (const c of contacts) if (c.followup && c.followup <= t0 && c.status !== 'Archiv') await mk(`wv:${c.id}:${c.followup}`, `Wiedervorlage: ${fullName(c)}`, c.followup, { contactId: c.id });
    if (on('geburtstag')) for (const c of contacts) if (c.geburtstag && c.status !== 'Archiv') {
      const [, m, dd] = c.geburtstag.split('-'); const y = t0.slice(0, 4), date = `${y}-${m}-${dd}`;
      if (date >= t0 && date <= addDays(t0, d('geburtstag'))) await mk(`gb:${c.id}:${y}`, `Geburtstagsgruß senden: ${fullName(c)}`, date, { contactId: c.id });
    }
    for (const p of props) {
      if (['Archiv', 'Verkauft / Vermietet'].includes(p.status)) continue;
      if (on('vertragEnde') && p.auftragBis && p.auftragBis >= t0 && p.auftragBis <= addDays(t0, d('vertragEnde')))
        await mk(`ve:${p.id}:${p.auftragBis}`, `Vertriebsvereinbarung verlängern: ${p.titel} (endet ${p.auftragBis.split('-').reverse().join('.')})`, addDays(p.auftragBis, -14) < t0 ? t0 : addDays(p.auftragBis, -14), { propertyId: p.id, contactId: p.eigentuemerId }, 'hoch');
      if (on('energieausweis') && p.eGueltig && p.eGueltig <= addDays(t0, d('energieausweis'))) await mk(`ea:${p.id}:${p.eGueltig}`, `Energieausweis erneuern: ${p.titel}`, t0, { propertyId: p.id });
      if (on('matches') && p.status === 'Aktiv') for (const x of matchesForProperty(p)) if (x.m.score >= d('matches'))
        await mk(`mt:${x.c.id}:${p.id}`, `Interessent informieren: ${fullName(x.c)} ↔ ${p.titel} (${x.m.score} %)`, t0, { contactId: x.c.id, propertyId: p.id });
    }
    if (on('abschluss')) for (const x of deals) {
      const P = PIPELINES[x.board]; if (!P || x.stage !== P.won || !x.closedAt || daysBetween(x.closedAt, t0) > 30) continue;
      if (x.board === 'vertrieb') await mk('af:' + x.id, `Empfehlung/Bewertung anfragen: ${x.contactId ? nm(x.contactId) : x.titel}`, addDays(x.closedAt, d('abschluss')), { contactId: x.contactId, propertyId: x.propertyId });
      else await mk('aq:' + x.id, `Objekt vorbereiten (Exposé, Fotos, Energieausweis): ${x.titel}`, addDays(x.closedAt, 2), { contactId: x.contactId, propertyId: x.propertyId }, 'hoch');
    }
    if (on('statusSync')) for (const x of deals) if (x.board === 'vertrieb' && x.propertyId && isOpen(x)) {
      const p = db.get('properties', x.propertyId); if (!p) continue;
      const to = x.stage === 'Reservierung' && p.status === 'Aktiv' ? 'Reserviert' : x.stage === 'Notartermin' && ['Aktiv', 'Reserviert'].includes(p.status) ? 'Notartermin' : null;
      if (to) { await db.save('properties', { ...p, status: to }); await db.log('system', `⚡ Automatisch: Status ${p.status} → ${to}`, { propertyId: p.id, contactId: x.contactId }); n++; }
    }
    if (on('rechnungStellen')) for (const x of deals) {
      const P = PIPELINES[x.board]; if (x.board !== 'vertrieb' || !P || x.stage !== P.won || !x.closedAt || daysBetween(x.closedAt, t0) > 60) continue;
      if (!db.all('rechnungen').some(r => r.dealId === x.id && r.status !== 'storniert')) await mk('rs:' + x.id, `Vergütung beim Verkäufer abrechnen: ${x.titel}`, x.closedAt > t0 ? x.closedAt : t0, { contactId: x.contactId, propertyId: x.propertyId }, 'hoch');
    }
    if (on('rechnungFaellig')) for (const r of db.all('rechnungen')) if (r.status === 'offen' && r.faellig && daysBetween(r.faellig, t0) >= d('rechnungFaellig'))
      await mk('rf:' + r.id, `Zahlung anmahnen: ${r.nr} (${(r.empfaenger || '').split('\n')[0]})`, t0, { contactId: r.contactId, propertyId: r.propertyId }, 'hoch');
    if (on('phasenSchritte')) for (const x of deals) {
      const P = PIPELINES[x.board]; if (!P) continue;
      for (const t of db.all('tasks')) if (!t.done && (t.auto || '').startsWith(`st:${x.id}:`) && t.auto !== `st:${x.id}:${x.stage}`) { await db.save('tasks', { ...t, done: true, doneAt: new Date().toISOString() }); n++; }
      const step = SCHRITTE[x.board]?.[x.stage], since = (x.stageAt || x.updated || x.created || '').slice(0, 10);
      if (step && isOpen(x) && since && daysBetween(since, t0) <= 7) await mk(`st:${x.id}:${x.stage}`, `${step}: ${x.contactId ? nm(x.contactId) : x.titel}`, t0, { contactId: x.contactId, propertyId: x.propertyId, dealId: x.id }, ['Reservierung', 'Notartermin', 'Angebot / Maklerauftrag'].includes(x.stage) ? 'hoch' : 'normal');
    }
    if (on('terminBestaetigen')) for (const e of events) if (e.contactId && e.datum > t0 && e.datum <= addDays(t0, Math.max(1, d('terminBestaetigen'))) && !/notar/i.test(e.art || ''))
      await mk('tb:' + e.id, `Termin bestätigen: ${nm(e.contactId)} – ${e.titel || e.art} am ${e.datum.split('-').reverse().join('.')}${e.start ? ' ' + e.start : ''}`, t0, { contactId: e.contactId, propertyId: e.propertyId });
    if (on('suchprofil')) for (const c of contacts) if ((c.kategorie || '').startsWith('Interessent') && c.status === 'Aktiv' && !c.sp_aktiv && c.created && daysBetween(c.created.slice(0, 10), t0) <= 30)
      await mk('sp:' + c.id, `Suchprofil erfragen: ${fullName(c)} (Budget, Ort, Zimmer)`, addDays(c.created.slice(0, 10), d('suchprofil')), { contactId: c.id });
    if (on('dubletten')) {
      const seen = new Map(), norm = v => String(v || '').toLowerCase().replace(/[^0-9a-z@.+]/g, '').replace(/^(\+49|0049)/, '0');
      for (const c of contacts) if (c.status !== 'Archiv') for (const k of [c.email && 'e' + norm(c.email), ...[c.tel, c.mobil].filter(v => norm(v).length >= 7).map(v => 't' + norm(v))].filter(Boolean)) {
        const o = seen.get(k);
        if (o && o.id !== c.id) { const ids = [o.id, c.id].sort(); await mk(`du:${ids[0]}:${ids[1]}`, `Doppelten Kontakt prüfen: ${fullName(o)} / ${fullName(c)}`, t0, { contactId: c.id }, 'niedrig'); }
        else seen.set(k, c);
      }
    }
    if (on('websiteFehlt')) for (const p of props) {
      const offen = db.all('tasks').filter(t => !t.done && (t.auto || '').startsWith(`wo:${p.id}:`));
      const fehlt = p.status === 'Aktiv' && p.webOnline !== false && (!p.webLive || ausstehend(p));
      if (!fehlt) { for (const t of offen) { await db.save('tasks', { ...t, done: true, doneAt: new Date().toISOString() }); n++; } continue; }
      const since = ((p.webLive ? p.updated : p.created) || p.updated || t0).slice(0, 10);
      if (daysBetween(since, t0) >= d('websiteFehlt')) await mk(`wo:${p.id}:${p.webLive ? (p.webPublished || 'upd') : 'neu'}`, p.webLive ? `Website aktualisieren: ${p.titel}` : `Auf Website veröffentlichen: ${p.titel}`, t0, { propertyId: p.id });
    }
    if (on('autoErledigt')) {
      const acts = db.all('activities').filter(a => a.contactId && KONTAKT_ARTEN.includes(a.art) && !a.eingehend && !String(a.id || '').startsWith('mail-act-'));
      for (const t of db.all('tasks')) if (!t.done && t.contactId && /^(ni|bf|kk|wv|ds|sp|mail|tb|mt):/.test(t.auto || '')) {
        const seit = t.created || '';
        const a = seit && acts.find(a => a.contactId === t.contactId && (a.created || a.datum) > seit && a.datum.slice(0, 10) >= seit.slice(0, 10));
        if (a) { await db.save('tasks', { ...t, done: true, doneAt: new Date().toISOString() }); await db.log('system', `⚡ Automatisch erledigt: ${t.titel.replace(/^⚡ /, '')}`, { contactId: t.contactId, propertyId: t.propertyId }); n++; }
      }
    }
    if (on('belegPruefen')) {
      const pr = db.all('buchungen').filter(b => b.pruefen && (b.belegTeil || 0) <= 1);
      if (pr.length) await mk(`bp:${t0}`, `KI-Belege prüfen (${pr.length}): Finanzen → Einnahmen & Ausgaben → ⚠ Zu prüfen`, t0);
      for (const b of db.all('buchungen')) if (b.offen && b.art === 'ausgabe' && (b.belegTeil || 0) <= 1) await mk('rb:' + (b.belegId || b.id), `Rechnung bezahlen: ${b.lieferant || b.beschreibung} (${String(b.belegBrutto ?? b.brutto).replace('.', ',')} €)`, t0, { propertyId: b.propertyId });
      for (const t of db.all('tasks')) if (!t.done && (t.auto || '').startsWith('rb:') && !db.all('buchungen').some(b => (b.belegId || b.id) === t.auto.slice(3) && b.offen)) { await db.save('tasks', { ...t, done: true, doneAt: new Date().toISOString() }); n++; }
      for (const t of db.all('tasks')) if (!t.done && (t.auto || '').startsWith('bp:') && (t.auto !== `bp:${t0}` || !pr.length)) { await db.save('tasks', { ...t, done: true, doneAt: new Date().toISOString() }); n++; }
    }
    if (on('ueberfaellig')) for (const t of db.all('tasks')) if (!t.done && t.faellig && t.prio === 'normal' && daysBetween(t.faellig, t0) >= d('ueberfaellig')) { await db.save('tasks', { ...t, prio: 'hoch' }); n++; }
  } finally { running = false; }
  if (n && !manual) toast(`⚡ ${n} Automation${n > 1 ? 'en' : ''} ausgeführt`);
  return n;
}

// Browser-Benachrichtigungen (nur solange das CRM geöffnet ist)
export const notifyEnabled = () => localStorage.getItem('kre-notify') === '1' && 'Notification' in window && Notification.permission === 'granted';
export async function enableNotify() { if (!('Notification' in window)) return false; const p = await Notification.requestPermission(); localStorage.setItem('kre-notify', p === 'granted' ? '1' : '0'); return p === 'granted'; }
export function notifyDue() {
  if (!notifyEnabled()) return;
  const seen = JSON.parse(sessionStorage.getItem('kre-seen') || '[]'), now = new Date(), t0 = today(), hhmm = now.toTimeString().slice(0, 5);
  const fire = (k, t, b) => { if (seen.includes(k)) return; seen.push(k); new Notification(t, { body: b, icon: '../icon-192.png' }); };
  db.all('events').filter(e => e.datum === t0 && e.start && e.start >= hhmm && (new Date(`${t0}T${e.start}`) - now) <= 3600000).forEach(e => fire('e' + e.id, `Termin um ${e.start}`, e.titel));
  const due = db.all('tasks').filter(t => !t.done && t.faellig && t.faellig <= t0);
  if (due.length) fire('d' + t0 + due.length, `${due.length} fällige Aufgabe${due.length > 1 ? 'n' : ''}`, due.slice(0, 3).map(t => t.titel).join('\n'));
  sessionStorage.setItem('kre-seen', JSON.stringify(seen));
}
// Google-Kalender automatisch abgleichen, solange die Google-Verbindung dieser Sitzung besteht
// (einmal pro Sitzung „Kalender synchronisieren“ klicken – Browser erlauben das Anmeldefenster nur nach einem Klick).
let gBusy = false;
export async function googleAutoSync() {
  if (gBusy || !google.isConnected()) return;
  gBusy = true;
  try { await google.syncCalendar(); localStorage.setItem('kre-g-last', new Date().toISOString()); }
  catch (e) { console.warn('Google-Abgleich', e); }
  finally { gBusy = false; }
}
let started = false;
export function start() {
  if (started) return; started = true;
  setTimeout(() => run(), 1500); setInterval(() => run(), 5 * 60000); setInterval(notifyDue, 60000);
  setInterval(googleAutoSync, 10 * 60000);
  window.addEventListener('focus', () => run()); setTimeout(notifyDue, 3000);
}
