// Portal-Anfragen (ohne-makler.net …): Ein geplanter Abruf legt jede Anfrage-Mail als Datensatz in 'anfragen' ab
// (Name, E-Mail, Telefon, Nachricht, Inserat, Zusatzangaben). Hier wird daraus automatisch:
//   • ein Kontakt „Interessent (Miete)“ (bzw. der vorhandene wird verknüpft) mit der Anfrage als Verlaufseintrag
//   • die Zuordnung zum Objekt (einmal je Inserat festlegen, gilt dann für alle weiteren Anfragen)
// Mehrere Mails derselben Person zum selben Inserat zählen als eine Anfrage mit mehreren Nachrichten.
import * as db from './db.js';
import { idFor, contactIdFor, today, daysBetween } from './util.js';

export const STATUS = {
  neu: { name: 'Neu', farbe: '#c9a96e' },
  kontaktiert: { name: 'Kontaktiert', farbe: '#5fa8d3' },
  besichtigung: { name: 'Besichtigung', farbe: '#b48ce0' },
  zusage: { name: 'Zusage', farbe: '#5bbf8a' },
  absage: { name: 'Absage', farbe: '#8b877f' },
  archiv: { name: 'Abgelegt', farbe: '#6f6b64' },
};
export const OFFEN = ['neu', 'kontaktiert', 'besichtigung'];
const digits = s => String(s || '').replace(/\D/g, '').replace(/^49/, '0');
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const nameParts = n => { const p = String(n || '').trim().replace(/^(Herr|Frau)\s+/i, '').split(/\s+/).filter(Boolean); return p.length > 1 ? { vorname: p.slice(0, -1).join(' '), nachname: p[p.length - 1] } : { vorname: '', nachname: p[0] || '' }; };

export const alle = () => db.all('anfragen') || [];
const schluessel = a => `${a.inseratNr || a.inseratTitel || ''}|${(a.email || '').toLowerCase() || digits(a.tel) || norm(a.name)}`;
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
export const neuAnzahl = () => gruppen().filter(g => (g.haupt.status || 'neu') === 'neu').length;
/** Inserate (für Filter und Objekt-Zuordnung) */
export function inserate() {
  const m = new Map();
  for (const g of gruppen()) { const k = g.haupt.inseratNr || g.haupt.inseratTitel || '–'; const e = m.get(k) || { nr: g.haupt.inseratNr || '', titel: g.haupt.inseratTitel || '', url: g.haupt.inseratUrl || '', n: 0, offen: 0 }; e.n++; if (OFFEN.includes(g.haupt.status || 'neu')) e.offen++; m.set(k, e); }
  return [...m.entries()].map(([k, e]) => ({ k, ...e, propertyId: (db.settings().inserate || {})[k] || '' })).sort((a, b) => b.n - a.n);
}
export const objektFuer = a => (db.settings().inserate || {})[a.inseratNr || a.inseratTitel || '–'] || a.propertyId || '';
export async function inseratZuordnen(k, propertyId) { await db.saveSettings({ ...db.settings(), inserate: { ...(db.settings().inserate || {}), [k]: propertyId } }); }

export async function setzen(g, patch) { return db.save('anfragen', { ...(db.get('anfragen', g.haupt.id) || g.haupt), ...patch }); }
export async function status(g, s, extra = {}) { return setzen(g, { status: s, statusAm: new Date().toISOString(), ...extra }); }

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
  let n = 0;
  for (const m of db.all('mails') || []) {
    const a = ausMail(m); if (!a) continue;
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
