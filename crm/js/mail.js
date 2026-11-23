// E-Mails direkt aus dem CRM senden – über das eigene Strato-Postfach (Server-Funktion „mailsenden“).
// Gesendet wird nur auf deinen Klick; eine Kopie landet im Ordner „Gesendet“ (also auch in Outlook).
// Ohne Cloud / ohne hinterlegtes Postfach öffnet sich wie bisher das Mail-Programm.
import * as db from './db.js';
import { html, modal, toast } from './util.js';
import { haptik } from './haptik.js';

/** Direktversand möglich? (Cloud angemeldet, nicht abgeschaltet) */
export const verfuegbar = () => db.isCloud() && !!db.klient() && db.settings().mailDirekt !== false;
const mailtoUrl = ({ an = '', cc = '', betreff = '', text = '' }) => `mailto:${encodeURIComponent(an).replace(/%40/g, '@').replace(/%2C/g, ',')}?${[cc && 'cc=' + encodeURIComponent(cc), 'subject=' + encodeURIComponent(betreff), 'body=' + encodeURIComponent(text)].filter(Boolean).join('&')}`;
export function ausMailto(url) {
  const m = /^mailto:([^?]*)(?:\?(.*))?$/i.exec(url) || [], q = new URLSearchParams(m[2] || '');
  return { an: decodeURIComponent(m[1] || ''), cc: q.get('cc') || '', betreff: q.get('subject') || '', text: q.get('body') || '' };
}
const kontaktZu = adr => { const a = String(adr || '').split(/[,;]/)[0].trim().toLowerCase(); return a ? (db.all('contacts') || []).find(c => (c.email || '').trim().toLowerCase() === a) : null; };

/** Sendet sofort. Wirft einen Fehler mit verständlichem Text. Liefert { id, abgelegt, von }. */
export async function senden({ an, cc = '', bcc = '', betreff, text, antwortAuf = '', contactId = '', propertyId = '' }) {
  const j = await aufruf({ an, cc, bcc, betreff, text, antwortAuf });
  // Der Mail-Abgleich trägt gesendete Mails aus „Gesendet“ selbst beim Kontakt ein – nur wenn die Ablage scheiterte, hier vermerken
  const c = contactId ? db.get('contacts', contactId) : kontaktZu(an);
  if (!j.abgelegt && (c || propertyId)) await db.log('email', `E-Mail gesendet: ${betreff}`, { contactId: c?.id || '', propertyId });
  return j;
}

async function aufruf(body) {
  const sb = db.klient(), { data } = await sb.auth.getSession(), token = data?.session?.access_token;
  if (!token) throw new Error('Nicht angemeldet – bitte neu anmelden.');
  let j;
  try { j = await (await fetch(`${(db.cfg().url || '').replace(/\/$/, '')}/functions/v1/mailsenden`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, apikey: db.cfg().key }, body: JSON.stringify(body) })).json(); }
  catch { throw new Error('Keine Verbindung zum Mail-Dienst – bitte Internet prüfen.'); }
  if (!j?.ok) throw new Error(j?.fehler || 'Senden fehlgeschlagen');
  return j;
}
/** Einmal je Sitzung prüfen, ob die Anmeldung am Postfach klappt (sendet nichts) */
let geprueft = null;
export const pruefen = () => geprueft ||= aufruf({ pruefen: true }).catch(e => { geprueft = null; throw e; });

/** Schreib-Fenster. vorgabe: { an, cc, betreff, text, contactId, propertyId, antwortAuf }; danach(ergebnis) nach erfolgreichem Senden */
export function schreiben(vorgabe = {}, danach) {
  const v0 = { an: '', cc: '', betreff: '', text: '', ...vorgabe }, S = db.settings();
  if (!v0.text && S.inhaber) v0.text = `\n\nMit freundlichen Grüßen\n${S.inhaber}\n${S.firma || ''}${S.tel ? '\nTel. ' + S.tel : ''}`;
  modal('✉ E-Mail schreiben', html`
    <label class="f full"><span>An</span><input name="an" type="text" inputmode="email" autocomplete="email" value="${v0.an}" placeholder="name@beispiel.de" list="mail-adressen" required></label>
    <label class="f full"><span>Kopie an (Cc, optional)</span><input name="cc" type="text" inputmode="email" value="${v0.cc}" list="mail-adressen"></label>
    <datalist id="mail-adressen">${(db.all('contacts') || []).filter(c => c.email).slice(0, 400).map(c => html`<option value="${c.email}">${[c.vorname, c.nachname].filter(Boolean).join(' ')}</option>`)}</datalist>
    <label class="f full"><span>Betreff</span><input name="betreff" value="${v0.betreff}" required></label>
    <label class="f full"><span>Nachricht</span><textarea name="text" rows="13" required>${v0.text}</textarea></label>
    <p class="full muted small">Wird direkt aus deinem Postfach${S.email ? ' (' + S.email + ')' : ''} gesendet; eine Kopie liegt danach in „Gesendet“ – auch in Outlook. <button type="button" class="lnk" data-extern>Lieber im Mail-Programm öffnen</button></p>
    <p class="full mail-warn" id="mail-warn" hidden role="alert"></p>`, {
    wide: true, saveLabel: '➤ Senden',
    onMount: (m, close) => {
      m.querySelector('[data-extern]').onclick = () => { const g = n => m.querySelector(`[name=${n}]`).value; location.href = mailtoUrl({ an: g('an'), cc: g('cc'), betreff: g('betreff'), text: g('text') }); close(); };
      pruefen().catch(e => { const w = m.querySelector('#mail-warn'); if (w) { w.hidden = false; w.textContent = `⚠️ Direkt senden geht gerade nicht: ${e.message} Du kannst die Mail stattdessen im Mail-Programm öffnen.`; } });
      if (v0.an && matchMedia('(hover:hover)').matches) m.querySelector(v0.betreff ? '[name=text]' : '[name=betreff]').focus();
    },
    onSave: async (v, _close, form) => {
      const knopf = form.querySelector('button[type=submit], .primary'), alt = knopf?.textContent;
      if (knopf) { knopf.disabled = true; knopf.textContent = 'Wird gesendet …'; }
      try {
        const r = await senden({ ...v0, an: v.an, cc: v.cc, betreff: v.betreff, text: v.text });
        haptik('erfolg'); toast(`✓ Gesendet an ${v.an.split(/[,;]/)[0].trim()}${r.abgelegt ? '' : ' (Kopie konnte nicht in „Gesendet“ abgelegt werden)'}`);
        if (danach) await danach(r, v);
      } catch (e) { toast(e.message, 'err'); if (knopf) { knopf.disabled = false; knopf.textContent = alt; } return false; }
    },
  });
}
/** mailto:-Adresse öffnen: im CRM schreiben, wenn möglich – sonst im Mail-Programm */
export function oeffnen(url, mehr = {}, danach) {
  if (!verfuegbar()) { location.href = url; return false; }
  schreiben({ ...ausMailto(url), ...mehr }, danach); return true;
}
/** Alle mailto:-Links der App abfangen (Kontakte, Anfragen, Posteingang, Rechnungen …) */
export function einrichten() {
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href^="mailto:"]'); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || !verfuegbar()) return;
    e.preventDefault();
    schreiben({ ...ausMailto(a.getAttribute('href')), contactId: a.dataset.contact || '', propertyId: a.dataset.property || '', antwortAuf: a.dataset.antwortAuf || '' });
  });
}
