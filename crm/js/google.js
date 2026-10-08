// Google-Kalender- und Kontakte-Sync (OAuth im Browser, Google Identity Services). Benötigt eigene Client-ID.
import * as db from './db.js';
import { today, addDays } from './util.js';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/contacts.readonly';
let token = null, exp = 0;
export const clientId = () => db.settings().googleClientId || '';
export const isConnected = () => !!token && Date.now() < exp;
const loadGis = () => new Promise((res, rej) => { if (window.google?.accounts?.oauth2) return res(); const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.onload = res; s.onerror = () => rej(new Error('Google-Skript konnte nicht geladen werden')); document.head.appendChild(s); });
export async function connect(interactive = true) {
  if (isConnected()) return token;
  if (!clientId()) throw new Error('Google Client-ID fehlt');
  await loadGis();
  return new Promise((res, rej) => {
    const tc = google.accounts.oauth2.initTokenClient({ client_id: clientId(), scope: SCOPE,
      callback: r => { if (r.error) return rej(new Error(r.error_description || r.error)); token = r.access_token; exp = Date.now() + (r.expires_in - 60) * 1000; localStorage.setItem('kre-g', '1'); res(token); },
      error_callback: e => rej(new Error(e.type || 'Anmeldung abgebrochen')) });
    tc.requestAccessToken(interactive ? {} : { prompt: 'none' });
  });
}
export const disconnect = () => { if (token && window.google) google.accounts.oauth2.revoke(token, () => { }); token = null; exp = 0; localStorage.removeItem('kre-g'); };
async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (r.status === 401) { token = null; throw new Error('Google-Sitzung abgelaufen – bitte neu verbinden'); }
  if (!r.ok && r.status !== 404) throw new Error('Google-API ' + r.status + ': ' + (await r.text()).slice(0, 160));
  return r.status === 404 ? null : (r.status === 204 ? {} : r.json());
}
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const gBody = e => {
  const tz = 'Europe/Berlin', body = { summary: e.titel, location: e.ort || '', description: [e.art, e.notiz].filter(Boolean).join('\n'), extendedProperties: { private: { crmId: e.id } } };
  if (e.start) { body.start = { dateTime: `${e.datum}T${e.start}:00`, timeZone: tz }; body.end = { dateTime: `${e.datum}T${e.ende || e.start}:00`, timeZone: tz }; }
  else { body.start = { date: e.datum }; body.end = { date: addDays(e.datum, 1) }; }
  return body;
};
export async function syncCalendar() {
  await connect(); let pushed = 0, pulled = 0, updated = 0; const t0 = today();
  for (const e of db.all('events').filter(e => e.datum >= addDays(t0, -30) && e.source !== 'google')) {
    if (e.googleSynced && e.googleSynced >= (e.updated || '')) continue;
    let g = e.googleId ? await api(`${CAL}/${e.googleId}`, { method: 'PUT', body: JSON.stringify(gBody(e)) }) : null;
    if (!g) g = await api(CAL, { method: 'POST', body: JSON.stringify(gBody(e)) });
    const synced = new Date(Date.now() + 1000).toISOString(); await db.save('events', { ...e, googleId: g.id, googleSynced: synced }); pushed++;
  }
  const q = new URLSearchParams({ timeMin: new Date(addDays(t0, -30) + 'T00:00:00').toISOString(), timeMax: new Date(addDays(t0, 180) + 'T00:00:00').toISOString(), singleEvents: 'true', maxResults: '500', orderBy: 'startTime' });
  const list = await api(`${CAL}?${q}`);
  for (const g of list.items || []) {
    if (g.status === 'cancelled' || g.extendedProperties?.private?.crmId) continue;
    const ex = db.all('events').find(e => e.googleId === g.id);
    const dt = g.start.dateTime ? new Date(g.start.dateTime) : null, de = g.end?.dateTime ? new Date(g.end.dateTime) : null;
    const rec = { titel: g.summary || '(ohne Titel)', art: 'Sonstiges', datum: g.start.date || g.start.dateTime.slice(0, 10), start: dt ? dt.toTimeString().slice(0, 5) : '', ende: de ? de.toTimeString().slice(0, 5) : '', ort: g.location || '', notiz: g.description || '', googleId: g.id, source: 'google' };
    if (!ex) { await db.save('events', { ...rec, googleSynced: new Date(Date.now() + 1000).toISOString() }); pulled++; }
    else if (ex.source === 'google' && (g.updated || '') > (ex.googleSynced || '')) { await db.save('events', { ...ex, ...rec, googleSynced: new Date(Date.now() + 1000).toISOString() }); updated++; }
  }
  return { pushed, pulled, updated };
}
export async function importContacts() {
  await connect(); let n = 0, page = '';
  const have = new Set(db.all('contacts').flatMap(c => [c.googleId, (c.email || '').toLowerCase()]).filter(Boolean));
  do {
    const r = await api(`https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,addresses,organizations,birthdays&pageSize=500${page ? '&pageToken=' + page : ''}`);
    for (const p of r.connections || []) {
      const email = p.emailAddresses?.[0]?.value || '', nm = p.names?.[0] || {};
      if (have.has(p.resourceName) || (email && have.has(email.toLowerCase()))) continue;
      const a = p.addresses?.[0] || {}, b = p.birthdays?.[0]?.date, ph = (p.phoneNumbers || []).map(x => x.value);
      if (!nm.givenName && !nm.familyName && !p.organizations?.[0]?.name) continue;
      await db.save('contacts', { kategorie: 'Sonstige', anrede: '', vorname: nm.givenName || '', nachname: nm.familyName || '', firma: p.organizations?.[0]?.name || '', email, tel: ph[0] || '', mobil: ph[1] || '', strasse: a.streetAddress || '', plz: a.postalCode || '', ort: a.city || '', geburtstag: b?.year && b.month && b.day ? `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}` : '', quelle: 'Google Kontakte', status: 'Aktiv', googleId: p.resourceName });
      have.add(p.resourceName); n++;
    }
    page = r.nextPageToken || '';
  } while (page);
  return n;
}
