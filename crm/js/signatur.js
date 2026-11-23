// E-Mail-Signatur für Mails aus dem CRM – dieselbe wie die Outlook-Signatur von keuerleber-immobilien.de/signatur/
// (Logo, Kontaktzeilen, Symbole). Instagram/LinkedIn, Mobilnummer und Zusatzzeile sind in den CRM-Einstellungen hinterlegt.
import * as db from './db.js';

const LIVE = 'https://keuerleber-immobilien.de';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const daten = () => { const S = db.settings(); return { an: true, tel: '+49 151 67692176', ig: '', li: '', extra: '', name: S.inhaber || 'Paul Keuerleber', titel: 'Immobilienkaufmann (IHK) · Vertrieb Kapitalanlagen', email: 'paul.keuerleber@keuerleber-immobilien.de', ...(S.signatur || {}) }; };
export const speichern = patch => db.saveSettings({ ...db.settings(), signatur: { ...(db.settings().signatur || {}), ...patch } });

export function html(d = daten()) {
  const ig = String(d.ig || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
  let li = String(d.li || '').trim(); if (li && !/^https?:\/\//i.test(li)) li = 'https://' + li;
  const tel = String(d.tel || '').trim() || '+49 151 67692176', telh = tel.replace(/[^\d+]/g, ''), wa = telh.replace(/^\+/, '').replace(/^0/, '49'), extra = String(d.extra || '').trim();
  const G = '#9c7f4d', D = '#1a1a1a', M = '#6b6459', F = 'font-family:Arial,Helvetica,sans-serif;', A = `style="color:${G};text-decoration:none;"`;
  const icons = [];
  if (ig) icons.push(['https://www.instagram.com/' + ig + '/', 'icon-instagram.png', 'Instagram']);
  if (li) icons.push([li, 'icon-linkedin.png', 'LinkedIn']);
  icons.push(['https://wa.me/' + wa, 'icon-whatsapp.png', 'WhatsApp'], [LIVE + '/', 'icon-web.png', 'Website'], ['mailto:' + d.email, 'icon-mail.png', 'E-Mail']);
  const iconRow = icons.map(i => `<td style="padding:0 8px 0 0;"><a href="${esc(i[0])}" target="_blank"><img src="${LIVE}/signatur/${i[1]}" width="28" height="28" alt="${i[2]}" style="display:block;border:0;width:28px;height:28px;"></a></td>`).join('');
  const lab = `style="${F}font-size:12px;color:${G};font-weight:bold;padding:2px 8px 2px 0;" valign="top"`, val = `style="${F}font-size:13px;color:${D};padding:2px 0;" valign="top"`;
  return `<table cellpadding="0" cellspacing="0" border="0" width="600" style="${F}width:600px;font-size:14px;color:${D};line-height:1.45;border-collapse:collapse;">` +
    `<tr><td style="${F}font-size:14px;color:${D};padding:0 0 12px 0;">Mit freundlichen Grüßen</td></tr>` +
    `<tr><td style="${F}padding:0 0 2px 0;font-size:17px;font-weight:bold;color:${D};">${esc(d.name)}</td></tr>` +
    `<tr><td style="${F}padding:0 0 12px 0;font-size:13px;color:${M};">${esc(d.titel).replace(/·/g, '&middot;')}</td></tr>` +
    `<tr><td style="border-top:1px solid #c9a96e;font-size:1px;line-height:1px;height:1px;padding:0;">&nbsp;</td></tr>` +
    `<tr><td style="padding:12px 0 8px 0;"><table cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="middle" style="padding:0 20px 0 0;border-right:1px solid #e3d9c4;"><a href="${LIVE}/" target="_blank"><img src="${LIVE}/signatur/logo-signatur.png" width="250" alt="Keuerleber Immobilien" style="display:block;border:0;width:250px;height:auto;"></a></td>` +
    `<td valign="middle" style="padding:0 0 0 20px;"><table cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td ${lab}>T</td><td ${val}><a href="tel:${telh}" style="color:${D};text-decoration:none;">${esc(tel)}</a></td></tr>` +
    `<tr><td ${lab}>E</td><td ${val}><a href="mailto:${esc(d.email)}" style="color:${D};text-decoration:none;">${esc(d.email)}</a></td></tr>` +
    `<tr><td ${lab}>W</td><td ${val}><a href="${LIVE}/" ${A}>keuerleber-immobilien.de</a></td></tr>` +
    `<tr><td ${lab}>A</td><td ${val}>Hauptstraße 12 &middot; 95145 Oberkotzau</td></tr>` +
    `</table></td></tr></table></td></tr>` +
    `<tr><td style="padding:4px 0 10px 0;"><table cellpadding="0" cellspacing="0" border="0"><tr>${iconRow}</tr></table></td></tr>` +
    `<tr><td style="${F}font-size:12px;font-style:italic;color:${G};padding:0 0 ${extra ? '2' : '10'}px 0;">Kernsanierte Eigentumswohnungen in Hof &amp; Oberfranken &middot; Beratung kostenfrei</td></tr>` +
    (extra ? `<tr><td style="${F}font-size:12px;color:${M};padding:0 0 10px 0;">${esc(extra)}</td></tr>` : '') +
    `<tr><td style="${F}font-size:11px;color:#8a8378;line-height:1.5;padding:8px 0 0 0;border-top:1px solid #eee7d6;">Keuerleber Immobilien &middot; Inhaber: Paul Keuerleber &middot; Hauptstraße 12 &middot; 95145 Oberkotzau<br>Diese E-Mail kann vertrauliche Informationen enthalten. Wenn Sie nicht der richtige Adressat sind, informieren Sie mich bitte und löschen Sie die Nachricht.</td></tr>` +
    `</table>`;
}
/** Dieselbe Signatur als reiner Text (für Mail-Programme ohne HTML-Anzeige) */
export function text(d = daten()) {
  return ['Mit freundlichen Grüßen', '', d.name, d.titel, '', 'T ' + (d.tel || '+49 151 67692176'), 'E ' + d.email, 'W keuerleber-immobilien.de', 'A Hauptstraße 12 · 95145 Oberkotzau', '',
    'Kernsanierte Eigentumswohnungen in Hof & Oberfranken · Beratung kostenfrei', ...(d.extra ? [d.extra] : []), '', 'Keuerleber Immobilien · Inhaber: Paul Keuerleber · Hauptstraße 12 · 95145 Oberkotzau'].join('\n');
}
/** Grußformel am Ende entfernen (die Signatur bringt ihre eigene mit) – nur wenn danach höchstens ein paar kurze Zeilen stehen */
export function ohneGruss(t) {
  const s = String(t || '').replace(/\s+$/, ''), m = /(^|\n)[ \t]*(Mit freundlichen Grüßen|Mit freundlichem Gruß|Freundliche Grüße|Viele Grüße|Beste Grüße|Herzliche Grüße)[ \t,]*(\n|$)/i.exec(s);
  if (!m) return s;
  const rest = s.slice(m.index + m[0].length).split('\n').filter(x => x.trim());
  return rest.length <= 5 && rest.every(x => x.length < 60) ? s.slice(0, m.index).replace(/\s+$/, '') : s;
}
/** Nachricht (Text) als HTML: Zeilenumbrüche, anklickbare Links, darunter die Signatur */
export function nachrichtHtml(t, sig = html()) {
  const body = esc(t).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" style="color:#9c7f4d;">$1</a>').replace(/\n/g, '<br>');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;">${body}</div><br>${sig}`;
}
/** { text, html } einer fertigen Mail mit Signatur */
export function anhaengen(t, d = daten()) { const kern = ohneGruss(t); return { text: kern + '\n\n' + text(d), html: nachrichtHtml(kern, html(d)) }; }
