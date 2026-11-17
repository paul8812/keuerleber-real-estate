// Mails automatisch in Ordner sortieren (Posteingang): Interessenten, Mieter & Verträge, Partner, Bestellungen, Rechnungen …
// Reihenfolge: von Hand gelernte Absender → bekannte Kontakte/Anfragen → KI (wenn Schlüssel hinterlegt) → Stichwörter.
// Das Ergebnis steht in der Mail (ordner, ordnerVon) und ist damit auf allen Geräten gleich. Outlook selbst bleibt unverändert.
import * as db from './db.js';
import * as ki from './ki.js';

export const ORDNER = {
  interessent: { name: 'Interessenten', farbe: '#5bbf8a', hilfe: 'Kauf-/Mietanfragen, Besichtigungen, Exposé-Wünsche, Eigentümer' },
  mieter: { name: 'Mieter & Verträge', farbe: '#5fa8d3', hilfe: 'Mietverträge, Mieter, Übergaben, Nebenkosten, Hausverwaltung' },
  partner: { name: 'Partner & Projekte', farbe: '#b48ce0', hilfe: 'Kollegen, Bauträger, Handwerker, Notar, Bank/Finanzierung, Gutachter' },
  bestellung: { name: 'Bestellungen', farbe: '#e0a84a', hilfe: 'Bestellungen, Versand, Lieferungen, Shops' },
  rechnung: { name: 'Rechnungen & Zahlungen', farbe: '#e07a5a', hilfe: 'Rechnungen, Zahlungen, Mahnungen, PayPal, Bank, Abos' },
  behoerde: { name: 'Behörden & Steuern', farbe: '#9aa3ad', hilfe: 'Finanzamt, Stadt, IHK, Gewerbe, Steuerberater' },
  newsletter: { name: 'Newsletter & Werbung', farbe: '#6f6b64', hilfe: 'Newsletter, Werbung, Benachrichtigungen von Plattformen' },
  sonstiges: { name: 'Sonstiges', farbe: '#8b877f', hilfe: 'alles andere' },
};
const IDS = Object.keys(ORDNER);
const FREEMAIL = /^(gmail|googlemail|web|gmx|t-online|icloud|me|mac|yahoo|outlook|hotmail|live|aol|freenet|posteo|mail|arcor|online|vodafone|1und1)\.(de|com|net|at|ch)$/i;

const domain = a => String(a || '').toLowerCase().split('@')[1] || '';
/** Schlüssel, unter dem ein Absender gelernt wird: Firmen nach Domain, Freemailer nach voller Adresse */
export const absenderKey = m => { const a = String(m.vonAdresse || '').toLowerCase().trim(), d = domain(a); return !d ? '' : FREEMAIL.test(d) ? 'adresse:' + a : 'domain:' + d; };
const regeln = () => db.settings().mailOrdner || {};

const W = [
  ['interessent', /anfrage|besichtig|interesse an|exposé|expose|\bOM-[a-z0-9]{4,}|immoscout|immobilienscout|kleinanzeigen|immowelt|immonet|kaufinteress|finanzierungsbestätigung|wohnung (in|nähe|zu)|rückruf|beratungstermin/i],
  ['mieter', /mietvertrag|mieter|mietinteress|nebenkosten|kaution|wohnungsübergabe|übergabeprotokoll|hausverwaltung|wohnungsgeberbest|mieterhöhung|kündigung der wohnung/i],
  ['bestellung', /bestellung|bestellt|order|zugestellt|zustellung|versand|versendet|sendung|paket|lieferung|shipped|delivered|tracking|dhl|hermes|\bdpd\b|\bgls\b|\bups\b|amazon|ebay|tiktok shop|zalando|otto\.de|temu|shein|aliexpress/i],
  ['rechnung', /rechnung|invoice|zahlung|zahlungserinnerung|mahnung|beleg|quittung|abbuchung|lastschrift|kontoauszug|gutschrift|paypal|überweisung|receipt|payment|abo (verlängert|erneuert)|vertragsverlängerung/i],
  ['behoerde', /finanzamt|elster|steuerbescheid|umsatzsteuer|gewerbe(an|ab)meldung|stadt hof|landratsamt|\bihk\b|behörde|bescheid|bundeszentralamt|steuerberat/i],
  ['partner', /notar|bauträger|handwerker|gutachten|restnutzungsdauer|finanzierungsangebot|darlehen|kreditanfrage|reservierungsvereinbarung|kaufvertragsentwurf|projekt|sparkasse|volksbank|raiffeisen|vr-bank|commerzbank|hypovereinsbank|\bdkb\b|interhyp|drklein|dr-klein|baufinanz/i],
  ['newsletter', /newsletter|abbestellen|abmelden|unsubscribe|angebot der woche|% rabatt|rabattcode|gutscheincode|black friday|webinar|jetzt entdecken|neu im shop/i],
];
const NOREPLY = /no-?reply|newsletter|news@|info@.*(shop|store)|marketing|mailer|notification|benachrichtigung/i;

/** Regeln ohne KI: gelernter Absender → Anfrage/Kontakt → Stichwörter (null = unklar) */
export function regelOrdner(m) {
  const r = regeln()[absenderKey(m)]; if (r && ORDNER[r]) return [r, 'regel'];
  if (m.typ === 'anfrage') return ['interessent', 'regel'];
  if (m.contactId) {
    const k = String(db.get('contacts', m.contactId)?.kategorie || '');
    if (/interess|eigentümer|käufer|investor/i.test(k)) return ['interessent', 'kontakt'];
    if (/mieter/i.test(k)) return ['mieter', 'kontakt'];
    if (/partner|handwerk|notar|bank|makler|bauträger|dienstleist/i.test(k)) return ['partner', 'kontakt'];
  }
  return null;
}
export function wortOrdner(m) {
  const t = `${m.betreff || ''} ${m.vonName || ''} ${m.vonAdresse || ''} ${(m.text || '').slice(0, 600)}`;
  for (const [o, re] of W) if (re.test(t)) return o;
  return NOREPLY.test(m.vonAdresse || '') ? 'newsletter' : 'sonstiges';
}

const SYSTEM = `Du sortierst E-Mails eines Immobilien-Unternehmers (Keuerleber Immobilien, Hof/Oberfranken: Vermittlung und Vermietung von Wohnungen, Kapitalanlagen, Sanierungsprojekte) in Ordner.
Ordner (genau einer je Mail):
${IDS.map(k => `- ${k}: ${ORDNER[k].hilfe}`).join('\n')}
Hinweise: Weitergeleitete Kauf-/Mietanfragen (auch von Kollegen, z. B. „Anfrage für OM-…“) sind „interessent“. Shop-Versandmails sind „bestellung“, deren Rechnungen „rechnung“. Automatische Plattform-Mails ohne Handlungsbedarf sind „newsletter“.
Antworte NUR mit JSON: {"<id>":"<ordner>", …} für jede Mail.`;
const kurz = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

let laeuft = false;
/** Alle noch nicht sortierten Mails einordnen; gibt die Anzahl zurück */
export async function sortieren({ nurNeue = true } = {}) {
  if (laeuft || !db.isCloud() || !db.syncState().synced) return 0;
  const offen = (db.all('mails') || []).filter(m => !m.ordner || (!nurNeue && m.ordnerVon !== 'hand'));
  if (!offen.length) return 0;
  laeuft = true; let n = 0;
  try {
    const rest = [];
    for (const m of offen) { const r = regelOrdner(m); if (r) { await db.save('mails', { ...m, ordner: r[0], ordnerVon: r[1] }); n++; } else rest.push(m); }
    let kiErgebnis = {};
    if (rest.length && ki.hasKey() && navigator.onLine) {
      for (let i = 0; i < rest.length; i += 25) {
        const teil = rest.slice(i, i + 25);
        const text = teil.map(m => `### ${m.id}\nVon: ${kurz(m.vonName, 60)} <${kurz(m.vonAdresse, 80)}>\nBetreff: ${kurz(m.betreff, 160)}\nText: ${kurz(m.text, 400)}`).join('\n\n');
        try { Object.assign(kiErgebnis, await ki.jsonFrage(SYSTEM, text)); } catch (e) { console.warn('Mail-Sortierung (KI)', e.message); break; }
      }
    }
    for (const m of rest) {
      const aktuell = db.get('mails', m.id); if (!aktuell || (aktuell.ordner && aktuell.ordnerVon === 'hand')) continue;   // inzwischen von Hand sortiert
      const k = kiErgebnis[m.id];
      const [o, von] = ORDNER[k] ? [k, 'ki'] : [wortOrdner(m), 'wort'];
      await db.save('mails', { ...aktuell, ordner: o, ordnerVon: von }); n++;
    }
  } finally { laeuft = false; }
  return n;
}

/** Von Hand umsortieren – und den Absender für die Zukunft merken (auch bereits sortierte Mails von ihm werden umgehängt) */
export async function verschieben(m, ordner, { merken = true } = {}) {
  if (!ORDNER[ordner]) return 0;
  await db.save('mails', { ...m, ordner, ordnerVon: 'hand' });
  let mit = 0;
  const k = absenderKey(m);
  if (merken && k) {
    await db.saveSettings({ ...db.settings(), mailOrdner: { ...regeln(), [k]: ordner } });
    for (const x of db.all('mails')) if (x.id !== m.id && absenderKey(x) === k && x.ordnerVon !== 'hand' && x.ordner !== ordner) { await db.save('mails', { ...x, ordner, ordnerVon: 'regel' }); mit++; }
  }
  return mit;
}

/** Läuft im Hintergrund: einmal nach dem Abgleich und immer, wenn neue Mails ankommen */
let gestartet = false;
export function start() {
  if (gestartet) return; gestartet = true;
  let t = 0;
  const bald = (ms = 1500) => { clearTimeout(t); t = setTimeout(() => sortieren().catch(e => console.warn('Mail-Sortierung', e)), ms); };
  db.onStatus(st => { if (st.synced) bald(); });
  db.onChange(() => { if ((db.all('mails') || []).some(m => !m.ordner)) bald(4000); });
}
