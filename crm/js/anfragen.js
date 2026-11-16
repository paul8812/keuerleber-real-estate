// Website-Anfragen → CRM: Formulare der Website legen eine Zeile in `website_anfragen` ab (lead-sync.js).
// Hier wird sie abgeholt, als Kontakt + Vorgang + Verlauf angelegt (die Regeln „Neuer Interessent“ und
// „Neue Pipeline-Phase“ erzeugen daraus die Aufgabe) und danach aus der Tabelle gelöscht.
import * as db from './db.js';
import { toast, today, idFor, contactIdFor } from './util.js';

let busy = false, started = false;
export const status = { ok: null, fehler: '', zuletzt: null, neu: 0 };

const digits = s => String(s || '').replace(/\D/g, '').replace(/^(0049|49)/, '0');
const pick = (d, ...keys) => { for (const k of keys) if (d[k] && String(d[k]).trim() && d[k] !== '—') return String(d[k]).trim(); return ''; };
const nameParts = n => { const p = String(n || '').trim().split(/\s+/).filter(Boolean); return p.length > 1 ? { vorname: p.slice(0, -1).join(' '), nachname: p[p.length - 1] } : { vorname: '', nachname: p[0] || '' }; };

function normalize(row) {
  const d = row.daten || {}, betreff = row.betreff || d.subject || '';
  const name = pick(d, 'name', 'Anfrage von', 'Name');
  const email = pick(d, 'email', 'E-Mail', 'Email').toLowerCase();
  const tel = pick(d, 'Telefon', 'tel', 'phone');
  const text = (pick(d, 'message', 'nachricht', 'Nachricht') || '').replace(/[═─]{3,}/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const art = /Vorab-Liste|Leitfaden/i.test(betreff) ? 'vorab' : /Beratungsgespr|Rückruf|Kapitalanlage-Check/i.test(betreff + text) ? 'rueckruf' : /Termin/i.test(betreff) ? 'termin' : /Objekt|Exposé/i.test(betreff) ? 'objekt' : 'kontakt';
  return { name, email, tel, text, betreff, art, wunsch: pick(d, 'Wunschzeit'), seite: pick(d, 'Seite') || row.quelle || '' };
}

async function verarbeite(row) {
  const a = normalize(row);
  if (!a.name && !a.email && !a.tel) return;                       // nichts Brauchbares
  const known = db.all('contacts').find(c => (a.email && (c.email || '').toLowerCase() === a.email) || (a.tel && digits(a.tel).length > 5 && [c.tel, c.mobil].some(t => digits(t) === digits(a.tel))));
  const notiz = [`Website-Anfrage (${a.betreff || a.art})`, a.wunsch && `Wunschzeit: ${a.wunsch}`, a.seite && `Seite: ${a.seite}`, a.text].filter(Boolean).join('\n');
  let c = known;
  if (!c) {
    // gleiche ID wie beim Mail-Abgleich (c- + sha1(E-Mail)) → derselbe Mensch wird nie zweimal angelegt
    const id = a.email ? contactIdFor(a.email) : a.tel ? idFor('c', 'tel:' + digits(a.tel)) : idFor('c', 'wa:' + row.id);
    c = db.get('contacts', id) || await db.save('contacts', { id, ...nameParts(a.name || a.email), email: a.email, tel: a.tel, kategorie: 'Interessent (Kauf)', quelle: 'Website', quelleSeite: a.seite, status: 'Aktiv', notiz });
    await db.save('activities', { id: idFor('wa-neu', row.id), art: 'system', text: `🌐 Neue Website-Anfrage: ${a.betreff || a.art}`, datum: new Date().toISOString(), contactId: c.id });
  }
  await db.save('activities', { id: idFor('wa-notiz', row.id), art: 'notiz', text: `🌐 Website-Anfrage (${a.betreff || a.art})\n${notiz}`, datum: new Date().toISOString(), contactId: c.id });
  const nm = [c.vorname, c.nachname].filter(Boolean).join(' ') || a.email;
  if (a.art !== 'vorab' && !db.all('deals').some(d => d.contactId === c.id && d.board === 'vertrieb' && !['Abgeschlossen', 'Absage'].includes(d.stage))) {
    const deal = await db.save('deals', { id: idFor('wa-deal', row.id), board: 'vertrieb', stage: 'Anfrage', titel: `Website-Anfrage: ${nm}`, contactId: c.id, stageAt: new Date().toISOString(), notiz: a.text });
    await db.save('activities', { id: idFor('wa-deallog', row.id), art: 'system', text: `Vorgang „${deal.titel}“ angelegt (Anfrage)`, datum: new Date().toISOString(), contactId: c.id, dealId: deal.id });
  }
  if (a.art === 'rueckruf' || known) {
    const titel = a.art === 'rueckruf' ? `📞 Rückruf: ${nm}${a.tel ? ' · ' + a.tel : ''}${a.wunsch && !/Egal/i.test(a.wunsch) ? ' (' + a.wunsch + ')' : ''}` : `Neue Website-Anfrage beantworten: ${nm}`;
    await db.save('tasks', { id: idFor('wa-task', row.id), titel, faellig: today(), prio: 'hoch', done: false, auto: 'wa:' + row.id, contactId: c.id, notiz: a.text });
  }
}

export async function pull({ manual = false } = {}) {
  const sb = db.client(); if (busy || !sb || !db.isCloud() || !db.syncState().synced || !navigator.onLine) return 0;   // erst wenn der Gerätestand mit dem Server abgeglichen ist
  busy = true; let n = 0;
  try {
    const { data, error } = await sb.from('website_anfragen').select('*').order('created_at', { ascending: true }).limit(50);
    if (error) { status.ok = false; status.fehler = /relation|schema cache|does not exist|PGRST205|42P01/i.test(error.message + error.code) ? 'nicht eingerichtet' : error.message; return 0; }
    status.ok = true; status.fehler = ''; status.zuletzt = new Date().toISOString();
    for (const row of data) {
      // Erst übernehmen (Zeile löschen und zurückbekommen), dann verarbeiten: Sind Handy und Mac gleichzeitig offen,
      // bekommt nur eines der Geräte die Anfrage.
      const r = await sb.from('website_anfragen').delete().eq('id', row.id).select('id');
      if (r.error) { status.fehler = r.error.message; continue; }
      if (!r.data?.length) continue;                       // ein anderes Gerät war schneller
      try { await verarbeite(row); n++; }
      catch (e) {
        console.error('Anfrage nicht verarbeitet', e); status.fehler = e.message;
        await sb.from('website_anfragen').insert({ id: row.id, created_at: row.created_at, quelle: row.quelle, betreff: row.betreff, daten: row.daten });   // zurücklegen
      }
    }
    status.neu += n;
    if (n) toast(`🌐 ${n} neue Website-Anfrage${n > 1 ? 'n' : ''} im CRM`);
  } finally { busy = false; }
  return n;
}

// Selbsttest: prüft jeden Schritt einzeln und sagt, woran es hängt. Löst bei aktivem Telegram-Trigger eine Test-Nachricht aus.
export async function selbsttest() {
  const out = [], sb = db.client(), c = db.cfg(), tag = '/selbsttest-' + Date.now();
  const ok = (t, hint = '') => out.push({ ok: true, t, hint }), no = (t, hint) => out.push({ ok: false, t, hint });
  if (!sb || !db.isCloud()) { no('Cloud-Verbindung', 'Das CRM läuft im lokalen Modus. Öffne es mit ?cloud=1 und melde dich an.'); return out; }
  ok('Angemeldet (Cloud-Modus)');
  try {
    const r = await fetch(c.url + '/rest/v1/website_anfragen', { method: 'POST', headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ quelle: tag, betreff: 'Selbsttest', daten: { name: 'Test Tester', Telefon: '0170 0000000', Wunschzeit: 'Selbsttest' } }) });
    if (r.status === 201 || r.status === 204) ok('Website darf Anfragen einfügen (anonym)');
    else { const b = await r.text(); no(`Website kann nicht einfügen (HTTP ${r.status})`, /42P01|PGRST205|does not exist|schema cache/.test(b) ? 'Die Tabelle fehlt: SQL „Website-Anfragen“ in Supabase ausführen.' : /42501|row-level|permission|policy/i.test(b) ? 'Rechte fehlen: das Anfragen-SQL (Policy „Website darf senden“ und grant insert to anon) erneut ausführen.' : r.status === 401 ? 'Der öffentliche Schlüssel wird abgelehnt (Einstellungen → Cloud prüfen).' : b.slice(0, 160)); return out; }
  } catch (e) { no('Supabase nicht erreichbar', 'Internetverbindung oder Adblocker? ' + e.message); return out; }
  const { data, error } = await sb.from('website_anfragen').select('id').eq('quelle', tag);
  if (error) no('Das CRM kann Anfragen nicht lesen', 'Policy „Inhaber verwaltet“ fehlt oder du bist nicht der Inhaber der Daten: Anfragen-SQL erneut ausführen. ' + error.message);
  else if (!data.length) no('Das CRM sieht die Test-Anfrage nicht', 'Policy „Inhaber verwaltet“ greift nicht. Gibt es schon Datensätze in deinem Konto (Kontakte/Aufgaben)? Dann Anfragen-SQL erneut ausführen.');
  else {
    ok('CRM kann Anfragen lesen');
    const d = await sb.from('website_anfragen').delete().eq('quelle', tag);
    d.error ? no('CRM kann Anfragen nicht löschen', d.error.message) : ok('CRM kann Anfragen löschen');
  }
  out.push({ ok: null, t: 'Telegram', hint: 'Ist der Telegram-Trigger eingerichtet, kam jetzt eine Nachricht „Selbsttest / Test Tester“ aufs Handy. Falls nicht: Bot mit /start gestartet? Chat-ID richtig? Telegram-SQL ohne Fehler gelaufen?' });
  return out;
}

export function start() {
  if (started) return; started = true;
  setInterval(() => pull(), 2 * 60000);
  window.addEventListener('focus', () => pull());
  // Sobald der Abgleich steht: einmal holen und live auf neue Anfragen hören (kommt sofort statt erst beim nächsten Intervall)
  let live = false;
  db.onStatus(st => {
    if (!st.synced || live) return;
    live = true; pull();
    const sb = db.client(); if (!sb) return;
    let t = 0;
    sb.channel('crm-anfragen').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'website_anfragen' }, () => { clearTimeout(t); t = setTimeout(() => pull(), 300 + Math.random() * 700); }).subscribe();
  });
}
