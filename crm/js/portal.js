// Portal-Anfragen (ohne-makler.net …): Ein geplanter Abruf legt jede Anfrage-Mail als Datensatz in 'anfragen' ab
// (Name, E-Mail, Telefon, Nachricht, Inserat, Zusatzangaben). Hier wird daraus automatisch:
//   • ein Kontakt „Interessent (Miete)“ (bzw. der vorhandene wird verknüpft) mit der Anfrage als Verlaufseintrag
//   • die Zuordnung zum Objekt (einmal je Inserat festlegen, gilt dann für alle weiteren Anfragen)
// Mehrere Mails derselben Person zum selben Inserat zählen als eine Anfrage mit mehreren Nachrichten.
import * as db from './db.js';
import { idFor, contactIdFor, today, daysBetween, addDays, uid } from './util.js';

export const STATUS = {
  neu: { name: 'Neu', farbe: '#c9a96e' },
  versucht: { name: 'Nicht erreicht', farbe: '#e0a84a' },
  kontaktiert: { name: 'Kontaktiert', farbe: '#5fa8d3' },
  besichtigung: { name: 'Besichtigung', farbe: '#b48ce0' },
  zusage: { name: 'Zusage', farbe: '#5bbf8a' },
  absage: { name: 'Absage', farbe: '#8b877f' },
  archiv: { name: 'Abgelegt', farbe: '#6f6b64' },
};
export const OFFEN = ['neu', 'versucht', 'kontaktiert', 'besichtigung'];
// Ergebnis eines Kontaktversuchs – ein Tipp an der Anfrage
export const VERSUCH = {
  nichtErreicht: { name: 'Nicht erreicht', icon: '📵', status: 'versucht', erinnern: true, anruf: true },
  mailbox: { name: 'Mailbox besprochen', icon: '📼', status: 'versucht', erinnern: true, anruf: true },
  nachricht: { name: 'Nachricht geschickt', icon: '💬', status: 'kontaktiert', erinnern: false },
  gesprochen: { name: 'Gesprochen', icon: '✅', status: 'kontaktiert', erinnern: false, anruf: true },
  rueckruf: { name: 'Ruft zurück', icon: '↩', status: 'kontaktiert', erinnern: false, anruf: true },
};
const digits = s => String(s || '').replace(/\D/g, '').replace(/^49/, '0');
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const nameParts = n => { const p = String(n || '').trim().replace(/^(Herr|Frau)\s+/i, '').split(/\s+/).filter(Boolean); return p.length > 1 ? { vorname: p.slice(0, -1).join(' '), nachname: p[p.length - 1] } : { vorname: '', nachname: p[0] || '' }; };

export const alle = () => db.all('anfragen') || [];
// Ordner: je Inserat-Nummer einer. Eine Anfrage kann von Hand in einen anderen Ordner gelegt werden (a.ordner),
// zwei Ordner lassen sich zusammenlegen (settings.inseratZiel), Namen stehen in settings.inseratNamen.
const roh = a => a.ordner || a.inseratNr || a.inseratTitel || '–';
const ziel = k => { const Z = db.settings().inseratZiel || {}; let i = 0; while (Z[k] && Z[k] !== k && i++ < 6) k = Z[k]; return k; };
export const ordnerK = a => ziel(roh(a));
const schluessel = a => `${ordnerK(a)}|${(a.email || '').toLowerCase() || digits(a.tel) || norm(a.name)}`;
/** Anfragen gruppiert: je Person + Inserat eine (früheste = Haupteintrag mit Status/Notiz), alle Nachrichten zeitlich */
export function gruppen() {
  const m = new Map();
  for (const a of alle()) { const k = schluessel(a); if (!m.has(k)) m.set(k, []); m.get(k).push(a); }
  return [...m.values()].map(L => {
    L.sort((x, y) => (x.eingang || x.importiert || '').localeCompare(y.eingang || y.importiert || ''));
    const haupt = L.find(x => x.status && x.status !== 'neu') || L[0], letzte = L[L.length - 1];
    // doppelt gesendete (wortgleiche) Nachrichten nur einmal zeigen
    const nachrichten = L.filter((x, i) => L.findIndex(y => norm(y.nachricht) === norm(x.nachricht)) === i);
    return { id: haupt.id, haupt, alle: L, nachrichten, letzte, eingang: letzte.eingang || letzte.importiert || '', erste: L[0].eingang || L[0].importiert || '',
      // vollständigste Kontaktdaten aus allen Mails
      name: haupt.name, email: L.map(x => x.email).find(Boolean) || '', tel: L.map(x => x.tel).find(Boolean) || '', angaben: Object.assign({}, ...L.map(x => x.angaben || {})) };
  }).sort((a, b) => b.eingang.localeCompare(a.eingang));
}
/** Ordner im Archiv? (kommt nach dem Archivieren eine neue Anfrage dazu, taucht der Ordner von selbst wieder auf) */
function archivSeit(k, L) { const t = (db.settings().inseratArchiv || {})[k]; return t && !L.some(g => (g.eingang || '') > t) ? t : ''; }
const archivSchluessel = () => { const m = new Map(); for (const g of gruppen()) { const k = ordnerK(g.haupt); if (!m.has(k)) m.set(k, []); m.get(k).push(g); } return new Set([...m.entries()].filter(([k, L]) => archivSeit(k, L)).map(([k]) => k)); };
/** Anfragen ohne die aus archivierten Ordnern */
export function aktiveGruppen() { const A = archivSchluessel(); return A.size ? gruppen().filter(g => !A.has(ordnerK(g.haupt))) : gruppen(); }
export const neuAnzahl = () => aktiveGruppen().filter(g => (g.haupt.status || 'neu') === 'neu').length;
/** Ordner (je Inserat): Name, Nummern, Objekt, Zähler – offene zuerst, dann nach letzter Anfrage */
export function inserate() {
  const S = db.settings(), m = new Map();
  for (const g of gruppen()) {
    const k = ordnerK(g.haupt), e = m.get(k) || { nr: '', titel: '', url: '', n: 0, offen: 0, neu: 0, letzte: '', teile: new Map() };
    for (const x of g.alle) { const r = x.inseratNr || x.inseratTitel || '–'; if (!e.teile.has(r)) e.teile.set(r, { k: r, nr: x.inseratNr || '', titel: x.inseratTitel || '', url: x.inseratUrl || '' }); }
    e.n++; const s = g.haupt.status || 'neu'; if (OFFEN.includes(s)) e.offen++; if (s === 'neu') e.neu++; if (g.eingang > e.letzte) e.letzte = g.eingang; m.set(k, e);
  }
  return [...m.entries()].map(([k, e]) => {
    const T = [...e.teile.values()], h = T.find(t => t.k === k) || T[0] || {}, propertyId = (S.inserate || {})[k] || '', obj = propertyId && db.get('properties', propertyId);
    const eigen = (S.inseratNamen || {})[k] || '';
    return { k, archiv: !!(S.inseratArchiv || {})[k] && !(e.letzte > (S.inseratArchiv || {})[k]), nr: h.nr || (/^OM-/i.test(k) ? k : ''), titel: h.titel || '', url: h.url || '', n: e.n, offen: e.offen, neu: e.neu, letzte: e.letzte, propertyId, objekt: obj || null, eigen, bilder: (S.inseratBilder || {})[k] || [],
      name: eigen || (obj && obj.titel) || h.nr || h.titel || k, nummern: T.map(t => t.nr).filter(Boolean), teile: T.filter(t => t.k !== k && ziel(t.k) === k && (S.inseratZiel || {})[t.k]) };
  }).sort((a, b) => (b.offen > 0) - (a.offen > 0) || b.letzte.localeCompare(a.letzte));
}
export const objektFuer = a => (db.settings().inserate || {})[ordnerK(a)] || a.propertyId || '';
export async function inseratZuordnen(k, propertyId) { await db.saveSettings({ ...db.settings(), inserate: { ...(db.settings().inserate || {}), [k]: propertyId } }); }
/** Ordner benennen, Objekt zuordnen, mit anderem Ordner zusammenlegen (in = Schlüssel des Zielordners, '' = eigener Ordner) */
export async function ordnerSpeichern(k, { name, propertyId, in: inK } = {}) {
  const S = db.settings(), N = { ...(S.inseratNamen || {}) }, O = { ...(S.inserate || {}) }, Z = { ...(S.inseratZiel || {}) };
  if (name !== undefined) { if (String(name).trim()) N[k] = String(name).trim(); else delete N[k]; }
  if (propertyId !== undefined) { if (propertyId) O[k] = propertyId; else delete O[k]; }
  if (inK !== undefined) {
    if (!inK || inK === k) delete Z[k];
    else { let t = inK, i = 0; while (Z[t] && i++ < 6) t = Z[t]; if (t === k) throw new Error('Diese Ordner sind schon zusammengelegt.'); Z[k] = t; for (const [q, v] of Object.entries(Z)) if (v === k) Z[q] = t; }
  }
  await db.saveSettings({ ...S, inseratNamen: N, inserate: O, inseratZiel: Z });
  await vorgaengeAnlegen();
}
/** Bilder eines Ordners (Datei-IDs; das erste ist das Titelbild) */
export async function bilderSetzen(k, ids) {
  const S = db.settings(), B = { ...(S.inseratBilder || {}) }; if (ids.length) B[k] = ids; else delete B[k];
  await db.saveSettings({ ...S, inseratBilder: B });
}
/** Ordner ins Archiv legen / zurückholen (Anfragen bleiben erhalten, zählen aber nicht mehr als offen) */
export async function ordnerArchivieren(k, an = true) {
  const S = db.settings(), A = { ...(S.inseratArchiv || {}) }; if (an) A[k] = new Date().toISOString(); else delete A[k];
  await db.saveSettings({ ...S, inseratArchiv: A });
}
/** Ordner endgültig löschen: alle Anfragen darin, ihre Vorgänge bei den Mietinteressenten, offene Anruf-Erinnerungen und die Bilder.
 *  Kontakte bleiben. Die Anfragen werden gemerkt, damit sie beim nächsten Mail-Abruf nicht wieder auftauchen. */
export async function ordnerLoeschen(k) {
  const G = gruppen().filter(g => ordnerK(g.haupt) === k), ids = G.flatMap(g => g.alle.map(a => a.id));
  const deals = db.all('deals').filter(d => d.board === 'miete' && ids.includes(d.anfrageId)).map(d => d.id);
  const tasks = db.all('tasks').filter(t => !t.done && G.some(g => t.auto === 'anf-anruf:' + g.id)).map(t => t.id);
  const S = db.settings(), ohne = o => { const x = { ...(o || {}) }; delete x[k]; for (const [q, v] of Object.entries(x)) if (v === k) delete x[q]; return x; };
  for (const id of (S.inseratBilder || {})[k] || []) db.delFile(id).catch(() => {});
  await db.saveSettings({ ...S, anfragenWeg: [...new Set([...(S.anfragenWeg || []), ...ids])], inseratNamen: ohne(S.inseratNamen), inserate: ohne(S.inserate), inseratZiel: ohne(S.inseratZiel), inseratArchiv: ohne(S.inseratArchiv), inseratBilder: ohne(S.inseratBilder) });
  if (deals.length) await db.delMany('deals', deals);
  if (tasks.length) await db.delMany('tasks', tasks);
  await db.delMany('anfragen', ids);
  return { anfragen: G.length, vorgaenge: deals.length };
}
/** Eine Anfrage (alle Mails der Person) in einen anderen Ordner legen */
export async function verschieben(g, k) {
  for (const x of g.alle) { const a = { ...(db.get('anfragen', x.id) || x) }; if (k === (a.inseratNr || a.inseratTitel || '–')) delete a.ordner; else a.ordner = k; await db.save('anfragen', a); }
}

export async function setzen(g, patch) { const a = await db.save('anfragen', { ...(db.get('anfragen', g.haupt.id) || g.haupt), ...patch }); if (patch.status) await vorgangAbgleichen(a); return a; }
export async function status(g, s, extra = {}) { return setzen(g, { status: s, statusAm: new Date().toISOString(), ...extra }); }

// ---- Pipeline „Mietinteressenten“: jede Anfrage hat dort einen Vorgang; Status und Phase laufen in beide Richtungen mit
const PHASE = { neu: 'Anfrage', versucht: 'Anfrage', kontaktiert: 'Kontakt aufgenommen', besichtigung: 'Besichtigung', zusage: 'Zusage', absage: 'Absage', archiv: 'Absage' };
const STATUS_AUS = { 'Kontakt aufgenommen': 'kontaktiert', 'Besichtigung': 'besichtigung', 'Selbstauskunft / Unterlagen': 'besichtigung', 'Zusage': 'zusage', 'Mietvertrag unterschrieben': 'zusage', 'Absage': 'absage' };
const RANG = ['Anfrage', 'Kontakt aufgenommen', 'Besichtigung', 'Selbstauskunft / Unterlagen', 'Zusage', 'Mietvertrag unterschrieben'];
/** Anfrage-Status geändert → Phase des Vorgangs nachziehen (nie hinter eine weiter fortgeschrittene Phase zurück, außer bei Absage / zurück auf offen) */
async function vorgangAbgleichen(a) {
  const d = a.dealId && db.get('deals', a.dealId); if (!d || d.board !== 'miete') return;
  let stage = PHASE[a.status || 'neu'] || 'Anfrage';
  if (stage !== 'Absage' && d.stage !== 'Absage' && STATUS_AUS[d.stage] === (a.status || 'neu')) return;   // z. B. „Unterlagen“ bleibt bei Status Besichtigung
  if (d.stage === stage) return;
  const zu = stage === 'Absage';
  await db.save('deals', { ...d, stage, stageAt: new Date().toISOString(), closedAt: zu ? today() : '' });
}
/** Vorgang in der Pipeline verschoben → Status der Anfrage nachziehen */
export async function ausVorgang(d) {
  if (!d || d.board !== 'miete' || !d.anfrageId) return;
  const a = db.get('anfragen', d.anfrageId); if (!a) return;
  const st = d.stage === 'Anfrage' ? (['neu', 'versucht'].includes(a.status || 'neu') ? a.status || 'neu' : 'neu') : STATUS_AUS[d.stage];
  if (st && st !== (a.status || 'neu')) await db.save('anfragen', { ...a, status: st, statusAm: new Date().toISOString() });
}
/** fehlende Vorgänge anlegen (einmal je Anfrage; ein gelöschter Vorgang wird nicht neu angelegt) */
export async function vorgaengeAnlegen() {
  let n = 0; const namen = new Map(inserate().map(i => [i.k, i.name]));
  for (const g of gruppen()) {
    const h = db.get('anfragen', g.haupt.id) || g.haupt, st = h.status || 'neu';
    const titel = `${g.name} – ${namen.get(ordnerK(h)) || h.inseratNr || 'Mietanfrage'}`, obj = objektFuer(h) || '';
    if (h.dealId) {   // Ordner später benannt / Objekt später zugeordnet → am Vorgang nachziehen (nur solange der Titel nicht von Hand geändert wurde)
      const d = db.get('deals', h.dealId);
      if (d && d.board === 'miete' && ((d.titelAuto === d.titel && d.titel !== titel) || (!d.propertyId && obj))) await db.save('deals', { ...d, ...(d.titelAuto === d.titel ? { titel, titelAuto: titel } : {}), propertyId: d.propertyId || obj });
      continue;
    }
    if (!h.contactId || ['archiv', 'absage'].includes(st)) continue;
    const id = idFor('anf-deal', h.id), da = db.get('deals', id);
    if (!da) await db.save('deals', { id, board: 'miete', stage: PHASE[st] || 'Anfrage', stageAt: h.statusAm || g.erste || new Date().toISOString(), titel, titelAuto: titel, contactId: h.contactId, propertyId: obj, quelle: h.quelle || 'Portal', anfrageId: h.id, created: g.erste || new Date().toISOString() });
    await db.save('anfragen', { ...h, dealId: id }); n++;
  }
  return n;
}

const erinnerungen = g => db.all('tasks').filter(t => !t.done && t.auto === 'anf-anruf:' + g.id);
/** Kontaktversuch festhalten: steht an der Anfrage, im Kontaktverlauf und (bei „nicht erreicht“) als Erinnerung für morgen.
 *  Gibt eine Funktion zurück, die alles wieder rückgängig macht. */
export async function versuch(g, art, { notiz = '', erinnern = VERSUCH[art]?.erinnern } = {}) {
  const V = VERSUCH[art]; if (!V) throw new Error('Unbekanntes Ergebnis');
  const h = db.get('anfragen', g.haupt.id) || g.haupt, vorher = { ...h }, zeit = new Date().toISOString(), id = uid();
  const st = h.status || 'neu', neuSt = ['neu', 'versucht'].includes(st) || (st === 'kontaktiert' && V.status === 'kontaktiert') ? V.status : st;
  await vorgangAbgleichen(await db.save('anfragen', { ...h, versuche: [...(h.versuche || []), { id, zeit, art, notiz: String(notiz).trim() }], status: neuSt, statusAm: neuSt !== st ? zeit : h.statusAm }));
  const angelegt = [];
  if (h.contactId) { const a = await db.save('activities', { id: idFor('anf-versuch', id), art: V.anruf ? 'anruf' : 'notiz', text: `${V.icon} ${V.name}${h.inseratNr ? ' (Anfrage ' + h.inseratNr + ')' : ''}${notiz ? ' – ' + String(notiz).trim() : ''}`, datum: zeit, contactId: h.contactId }); angelegt.push(['activities', a.id]); }
  const offen = erinnerungen(g), erledigt = [];
  if (V.erinnern === false) for (const t of offen) { erledigt.push({ ...t }); await db.save('tasks', { ...t, done: true, doneAt: zeit }); }   // erreicht → alte Erinnerungen weg
  if (erinnern && !offen.length) { const t = await db.save('tasks', { id: idFor('anf-wv', id), titel: `📞 Erneut anrufen: ${g.name}${g.tel ? ' · ' + g.tel : ''}`, faellig: addDays(today(), 1), prio: 'hoch', done: false, auto: 'anf-anruf:' + g.id, contactId: h.contactId || '', notiz: `Anfrage ${h.inseratNr || ''} – ${V.name}` }); angelegt.push(['tasks', t.id]); }
  // Rückgängig nimmt genau diesen Versuch zurück (auch wenn inzwischen weitere dazugekommen sind)
  return async () => {
    const jetzt = db.get('anfragen', h.id) || h, rest = (jetzt.versuche || []).filter(v => v.id !== id), warLetzter = (jetzt.versuche || []).at(-1)?.id === id;
    await vorgangAbgleichen(await db.save('anfragen', { ...jetzt, versuche: rest, ...(warLetzter ? { status: vorher.status || 'neu', statusAm: vorher.statusAm || '' } : {}) }));
    for (const [c, i] of angelegt) if (db.get(c, i)) await db.del(c, i);
    for (const t of erledigt) await db.save('tasks', t);
  };
}
/** Kurzfassung der Versuche: „2× nicht erreicht · zuletzt …“ */
export function versucheInfo(h) {
  const V = h.versuche || []; if (!V.length) return null;
  const fehl = V.filter(v => VERSUCH[v.art]?.status === 'versucht').length, letzter = V[V.length - 1];
  return { anzahl: V.length, fehl, letzter, erreicht: V.some(v => v.art === 'gesprochen') };
}

/** Zusatzangaben als kurze Liste [Label, Wert] in fester Reihenfolge */
export function angabenListe(ang = {}) {
  const such = (...re) => { const k = Object.keys(ang).find(x => re.some(r => r.test(x))); return k ? String(ang[k]) : ''; };
  return [['Haushalt', such(/haushaltstyp/i, /^haushalt$/i)], ['Arbeit', such(/arbeit/i)], ['Einkommen', such(/einkommen/i)], ['Schufa', such(/schufa/i)], ['Haustiere', such(/haustier/i)],
    ...Object.entries(ang).filter(([k]) => !/haushalt|arbeit|einkommen|schufa|haustier/i.test(k)).map(([k, v]) => [k.replace(/:$/, ''), String(v)])].filter(x => x[1]);
}

// ---------------------------------------------------------------- Anfrage-Mails aus dem CRM-Posteingang (Geschäftspostfach)
const OM_ABSENDER = /@anfragen\.ohne-makler\.net$/i, OM_BETREFF = /^Anfrage für (OM-[A-Za-z0-9]+) von (.+)$/;
const abschnitt = (t, von, bis) => { const i = t.search(von); if (i < 0) return ''; const r = t.slice(i).replace(von, ''); const j = bis ? r.search(bis) : -1; return (j < 0 ? r : r.slice(0, j)).trim(); };
/** ohne-makler-Mail (Text aus dem Posteingang) → Anfrage; null wenn es keine Anfrage-Mail ist */
export function ausMail(m) {
  const b = String(m.betreff || '').trim().match(OM_BETREFF);
  if (!b || !OM_ABSENDER.test(m.vonAdresse || '')) return null;
  const t = String(m.text || '').replace(/\r/g, '');
  const kontakt = abschnitt(t, /Kontaktdaten des Interessenten\s*/i, /\n\s*(Wichtiger Rechtshinweis|Unser Tipp für Sie|ohne-makler —)/i);
  const zeile = re => (kontakt.match(re) || t.match(re) || [])[1]?.trim() || '';
  const angT = abschnitt(t, /Zusätzliche Angaben des Interessenten:\s*/i, /\n\s*Kontaktdaten des Interessenten/i), angaben = {};
  // „Schufa-Auskunft:\n\nVorhanden“ – Bezeichnung endet mit Doppelpunkt, der Wert steht in der nächsten nicht leeren Zeile
  const L = angT.split('\n').map(x => x.trim()).filter(Boolean);
  for (let i = 0; i < L.length - 1; i++) if (/:$/.test(L[i]) && !/:$/.test(L[i + 1])) { angaben[L[i].replace(/:$/, '')] = L[i + 1].slice(0, 120); i++; }
  const titel = (t.match(/Inserat\s+OM-[A-Za-z0-9]+,\s*\n?\s*([^\n]+)/i) || [])[1]?.trim() || '';
  const url = (t.match(/https:\/\/www\.ohne-makler\.net\/immobilie\/[A-Za-z0-9]+\/?/) || [])[0] || '';
  const email = (zeile(/E-?Mail:\s*([^\s<>]+@[^\s<>]+)/i) || m.antwortAn || '').toLowerCase();
  return { id: 'anf-ohnemakler-' + String(m.id).replace(/^mail-/, ''), quelle: 'ohne-makler', mailId: m.id, eingang: m.datum || '', importiert: new Date().toISOString(), status: 'neu',
    inseratNr: b[1], inseratTitel: titel, inseratUrl: url, name: (zeile(/Name:\s*([^\n]+)/i) || b[2]).trim(), email, tel: zeile(/(?:Telefon|Mobil|Tel\.?):\s*([+\d][\d\s/()+-]{5,})/i),
    nachricht: abschnitt(t, /Nachricht des Interessenten\s*/i, /\n\s*(Zusätzliche Angaben des Interessenten|Kontaktdaten des Interessenten)/i), angaben };
}
/** Neue Anfrage-Mails aus dem Posteingang übernehmen; trägt bei schon übernommenen eine später gefundene Telefonnummer nach */
export async function ausPosteingang() {
  let n = 0; const weg = new Set(db.settings().anfragenWeg || []);
  for (const m of db.all('mails') || []) {
    const a = ausMail(m); if (!a || weg.has(a.id)) continue;
    const alt = db.get('anfragen', a.id);
    if (!alt) { await db.save('anfragen', a); n++; }
    else if ((a.tel && !alt.tel) || (a.email && !alt.email)) await db.save('anfragen', { ...alt, tel: alt.tel || a.tel, email: alt.email || a.email });
  }
  return n;
}

let laeuft = false;
/** Neue Anfragen einordnen: Kontakt verknüpfen/anlegen, Verlaufseintrag schreiben */
export async function verarbeiten() {
  if (laeuft || (db.isCloud() && !db.syncState().synced)) return 0;
  laeuft = true; let n = 0;
  try {
    { const weg = new Set(db.settings().anfragenWeg || []), wieder = weg.size ? alle().filter(a => weg.has(a.id)).map(a => a.id) : []; if (wieder.length) await db.delMany('anfragen', wieder); }   // gelöschte kommen nicht zurück (z. B. über den Gmail-Abruf)
    n += await ausPosteingang();
    for (const g of gruppen()) {
      const h = g.haupt;
      if (h.contactId && db.get('contacts', h.contactId)) {   // Telefon später bekannt geworden → beim Kontakt nachtragen
        const k = db.get('contacts', h.contactId); if (g.tel && !k.mobil && !k.tel) await db.save('contacts', { ...k, mobil: g.tel });
        continue;
      }
      const email = g.email.toLowerCase(), tel = g.tel;
      let c = db.all('contacts').find(x => (email && (x.email || '').toLowerCase() === email) || (digits(tel).length > 5 && [x.tel, x.mobil].some(t => digits(t) === digits(tel))));
      const quelle = h.quelle || 'Portal', eingang = g.erste || new Date().toISOString();
      const text = [`Anfrage über ${quelle}${h.inseratNr ? ' zu ' + h.inseratNr : ''}${h.inseratTitel ? ' – ' + h.inseratTitel : ''}`, h.nachricht, angabenListe(g.angaben).map(([k, v]) => `${k}: ${v}`).join(' · ')].filter(Boolean).join('\n');
      if (!c) {
        const id = email ? contactIdFor(email) : digits(tel).length > 5 ? idFor('c', 'tel:' + digits(tel)) : idFor('c', 'anf:' + h.id);
        c = db.get('contacts', id) || await db.save('contacts', { id, ...nameParts(h.name), email, mobil: tel, kategorie: 'Interessent (Miete)', quelle, status: 'Aktiv', created: eingang, notiz: text.slice(0, 1500) });
      }
      await db.save('activities', { id: idFor('anf-notiz', h.id), art: 'notiz', text: '🏠 ' + text, datum: eingang, contactId: c.id, ...(objektFuer(h) ? { propertyId: objektFuer(h) } : {}) });
      // Anfragen, die beim ersten Import schon älter als 10 Tage sind, gelten nicht mehr als „neu“
      const alt = (h.status || 'neu') === 'neu' && daysBetween(eingang.slice(0, 10), today()) > 10;
      await db.save('anfragen', { ...(db.get('anfragen', h.id) || h), contactId: c.id, ...(alt ? { status: 'archiv', statusAm: new Date().toISOString(), notiz: 'Ältere Anfrage – beim Import automatisch abgelegt' } : {}) });
      n++;
    }
    await vorgaengeAnlegen();
  } finally { laeuft = false; }
  return n;
}
let gestartet = false;
export function start() {
  if (gestartet) return; gestartet = true;
  let t = 0;
  const bald = (ms = 1800) => { clearTimeout(t); t = setTimeout(() => verarbeiten().catch(e => console.warn('Anfragen', e)), ms); };
  db.onStatus(st => { if (st.synced) bald(); });
  if (!db.isCloud()) bald();
  db.onChange(() => { if (gruppen().some(g => !g.haupt.contactId) || (db.all('mails') || []).some(m => OM_ABSENDER.test(m.vonAdresse || '') && OM_BETREFF.test(String(m.betreff || '').trim()) && !db.get('anfragen', 'anf-ohnemakler-' + String(m.id).replace(/^mail-/, '')))) bald(2500); });
}
