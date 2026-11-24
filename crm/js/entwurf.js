// Mail-Entwürfe zu Aufgaben: das CRM schreibt den Text vor, du prüfst ihn und schickst ihn selbst aus Outlook.
// Es wird NIE automatisch eine E-Mail versendet.
import * as db from './db.js';
import { html, inp, area, modal, toast, fullName, fmtDate } from './util.js';
import { adresse } from './ui.js';
import { completeTask } from './views/tasks.js';
import * as mail from './mail.js';

const WOCHENTAG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const PLATZHALTER = [['{{anrede_name}}', 'Herr/Frau + Nachname'], ['{{vorname}}', 'Vorname'], ['{{nachname}}', 'Nachname'], ['{{objekt.titel}}', 'Objekt-Titel'], ['{{objekt.adresse}}', 'Objekt-Adresse'], ['{{objekt.ort}}', 'Objekt-Ort'], ['{{objekt.preis}}', 'Kaufpreis'], ['{{termin}}', 'Wochentag, Datum und Uhrzeit'], ['{{datum}}', 'Datum'], ['{{uhrzeit}}', 'Uhrzeit'], ['{{ort}}', 'Ort (Objekt oder Kontakt)'], ['{{absender}}', 'dein Name'], ['{{firma}}', 'Firma'], ['{{tel}}', 'deine Telefonnummer'], ['{{firma_ort}}', 'dein Firmensitz']];
/** Platzhalter füllen. o.luecken: fehlende Angaben als [Kontakt]/[Objekt] sichtbar lassen (Vorschau), sonst leer und Satz geglättet */
export function fuellen(txt, c, p, datum, zeit = '', o = {}) {
  const s = db.settings(), L = (v, name) => v || (o.luecken ? `[${name}]` : '');
  const anrede = c ? (c.anrede === 'Frau' && c.nachname ? `Frau ${c.nachname}` : c.anrede === 'Herr' && c.nachname ? `Herr ${c.nachname}` : fullName(c)) : '';
  const tag = datum ? fmtDate(datum) : '[Datum]', termin = datum ? `${WOCHENTAG[new Date(datum + 'T12:00:00').getDay()]}, ${tag}${zeit ? ` um ${zeit} Uhr` : ''}` : '[Termin]';
  const map = { anrede_name: L(anrede, 'Kontakt'), vorname: L(c?.vorname, 'Vorname'), nachname: L(c?.nachname, 'Nachname'), ort: L(p?.ort || c?.ort, 'Ort'), 'objekt.titel': L(p?.titel, 'Objekt'), 'objekt.titel_zu': p?.titel ? ` zu „${p.titel}“` : '', 'objekt.adresse': L(p ? adresse(p) : '', 'Objekt-Adresse'), 'objekt.ort': L(p?.ort, 'Ort'),
    'objekt.preis': L(p?.preis ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(p.preis) : '', 'Preis'), datum: tag, uhrzeit: zeit ? zeit + ' Uhr' : (o.luecken ? '[Uhrzeit]' : ''), termin,
    absender: s.inhaber || '', firma: s.firma || '', tel: s.tel || '', firma_ort: s.ort || '' };
  // Zeilen, deren einziger Inhalt eine leere Angabe war („– Kaufpreis: “), fallen weg; verwaiste Satzteile werden geglättet
  return (txt || '').split('\n').map(z => { let leer = false; const r = z.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => { const v = map[k] ?? ''; if (!v) leer = true; return v; }); return leer && /[:(]\s*$|^\s*$/.test(r.replace(/\(\)/g, '')) && z.trim() ? null : r; }).filter(z => z !== null).join('\n')
    .replace(/(Guten Tag|Hallo|Liebe\/r) ,/g, '$1,').replace(/„“ ?/g, '').replace(/ \(\)/g, '').replace(/ in(?=[.,])/g, '').replace(/ {2,}/g, ' ');
}
const vorlage = name => db.all('templates').find(t => t.name === name);
const gruss = () => { const s = db.settings(); return `\n\nMit freundlichen Grüßen\n${s.inhaber || ''}\n${s.firma || ''}\n${s.tel || ''}`.trimEnd(); };

// Welcher Text passt zu welcher Aufgabe?
export function entwurf(t) {
  const key = t.auto || '', p = t.propertyId ? db.get('properties', t.propertyId) : null;
  let c = t.contactId ? db.get('contacts', t.contactId) : null, name = '', datum = '', zeit = '', betreff = '', text = '';
  if (key.startsWith('ni:') || /:Anfrage$/.test(key)) name = 'Exposé & Kurzkalkulation an Anleger';
  else if (/:Beratungsgespräch$/.test(key)) name = 'Einladung Beratungsgespräch';
  else if (/:(Besichtigung|Finanzierung \/ Prüfung)$/.test(key)) name = 'Finanzierungsunterlagen anfordern';
  else if (/:Reservierung$/.test(key)) { name = 'Reservierung an Verkäufer melden'; const v = p?.eigentuemerId && db.get('contacts', p.eigentuemerId); if (v) c = v; }
  else if (key.startsWith('tb:')) { name = 'Terminbestätigung'; const e = db.get('events', key.slice(3)); datum = e?.datum || ''; zeit = e?.start || ''; betreff = e ? `Terminbestätigung ${fmtDate(e.datum)}${e.start ? ', ' + e.start + ' Uhr' : ''}` : ''; }
  else if (key.startsWith('bf:')) name = 'Nachfassen nach Besichtigung';
  else if (key.startsWith('sp:')) { betreff = 'Ihre Wunsch-Kapitalanlage – kurze Rückfrage'; text = `Guten Tag {{anrede_name}},\n\ndamit ich Ihnen gezielt passende Wohnungen vorschlagen kann, helfen mir ein paar kurze Angaben:\n\n– Gewünschte Lage / Orte\n– Budget bzw. gewünschte Finanzierung\n– Wohnungsgröße / Zimmer\n– Ab wann möchten Sie investieren?\n\nGerne können wir das auch in einem kurzen Telefonat klären.` + gruss(); }
  else if (key.startsWith('mt:')) { betreff = `Passende Kapitalanlage: {{objekt.titel}}`; text = `Guten Tag {{anrede_name}},\n\nich habe eine Wohnung, die gut zu Ihren Vorstellungen passt: „{{objekt.titel}}“ in {{ort}}.\n\nGerne sende ich Ihnen Exposé und eine persönliche Berechnung zu. Für Sie als Käufer fällt keine Provision an.` + gruss(); }
  else if (key.startsWith('ds:') || key.startsWith('kk:') || key.startsWith('wv:')) { betreff = p ? `Kurze Rückmeldung zu {{objekt.titel}}` : 'Kurze Rückmeldung'; text = `Guten Tag {{anrede_name}},\n\nich wollte mich kurz bei Ihnen melden – gibt es Neuigkeiten oder offene Fragen, bei denen ich helfen kann?` + gruss(); }
  const tpl = name && vorlage(name);
  if (tpl) { betreff = betreff || tpl.betreff; text = tpl.text; }
  if (!text) { betreff = betreff || (t.titel || '').replace(/^⚡ /, '').split(':')[0]; text = `Guten Tag {{anrede_name}},\n\n` + gruss(); }
  return { an: c?.email || '', c, betreff: fuellen(betreff, c, p, datum, zeit), text: fuellen(text, c, p, datum, zeit), vorlage: tpl?.name || '' };
}

export function entwurfDialog(t) {
  const e = entwurf(t);
  modal('✉ E-Mail prüfen & senden', html`
    <p class="full muted small">Vom CRM vorbereitet${e.vorlage ? ` (Vorlage „${e.vorlage}“)` : ''} – nichts wurde verschickt. Prüfen, anpassen, dann ${mail.verfuegbar() ? 'senden' : 'in Outlook senden'}.</p>
    ${inp('an', 'An', e.an, { type: 'email', cls: 'full', req: 1 })}${inp('betreff', 'Betreff', e.betreff, { cls: 'full' })}${area('text', 'Text', e.text, { rows: 12 })}
    <div class="full entwurfdanach" hidden><p>Hast du die Mail in Outlook abgeschickt?</p><div class="actions"><button type="button" class="btn primary" data-gesendet>✓ Ja, gesendet – Aufgabe erledigen</button><button type="button" class="btn ghost" data-nein>Noch nicht</button></div></div>`, {
    wide: true, saveLabel: mail.verfuegbar() ? '➤ Senden' : '✉ In Outlook öffnen',
    onSave: async (v, close, form) => {
      if (!v.an) { toast('Bitte Empfänger eintragen', 'err'); return false; }
      const url = `mailto:${encodeURIComponent(v.an).replace('%40', '@')}?subject=${encodeURIComponent(v.betreff)}&body=${encodeURIComponent(v.text)}`;
      const direkt = mail.verfuegbar(); let erg = null;
      if (direkt) { try { erg = await mail.senden({ an: v.an, betreff: v.betreff, text: v.text, contactId: e.c?.id || '', propertyId: t.propertyId || '' }); } catch (err) { toast(err.message, 'err'); return false; } }
      else { const a = document.createElement('a'); a.href = url; a.click(); }
      const box = form.querySelector('.entwurfdanach'); if (!direkt) { box.hidden = false; box.scrollIntoView({ block: 'nearest' }); }
      box.querySelector('[data-gesendet]').onclick = async () => {
        if (e.c && !erg?.abgelegt) await db.log('email', `E-Mail gesendet: ${v.betreff}`, { contactId: e.c.id, propertyId: t.propertyId });
        if (!t.ohneAufgabe) await completeTask(db.get('tasks', t.id) || t, true, true); toast(t.ohneAufgabe ? '✓ Im Verlauf vermerkt' : '✓ Erledigt'); close();
      };
      box.querySelector('[data-nein]').onclick = close;
      if (direkt) { await box.querySelector('[data-gesendet]').onclick(); return false; }
      return false;
    },
  });
}
