// Posteingang: Mails aus dem Strato-Postfach (Outlook), die der Mail-Abgleich auf dem Mac ins CRM legt.
// Anfragen und Mails bekannter Kontakte ordnet der Abgleich selbst zu; hier landen vor allem unbekannte Absender.
import * as db from '../db.js';
import { html, raw, fmtDT, toast, fullName, modal, sel } from '../util.js';
import { contactForm, taskForm } from '../forms.js';
import { cLink, empty, badge, contactOpts, contactName } from '../ui.js';

const FILTERS = [['neu', 'Neu'], ['zugeordnet', 'Zugeordnet'], ['alle', 'Alle']];
const TYP = { anfrage: ['Anfrage', '#5bbf8a'], kontakt: ['Kontakt', '#5fa8d3'], unbekannt: ['Unbekannt', '#e0a84a'] };
let filter = 'neu';

export const mails = () => db.all('mails') || [];
export const newCount = () => mails().filter(m => m.status === 'neu').length;

const nameParts = m => {
  const n = (m.vonName || '').replace(/["']/g, '').trim();
  if (!n || n.includes('@')) return { vorname: '', nachname: '' };
  const p = n.split(/\s+/);
  return p.length > 1 ? { vorname: p.slice(0, -1).join(' '), nachname: p[p.length - 1] } : { vorname: '', nachname: p[0] };
};
const snippet = m => (m.text || '').replace(/\s+/g, ' ').slice(0, 160);
const replyHref = m => `mailto:${encodeURIComponent(m.antwortAn || m.vonAdresse || '')}?subject=${encodeURIComponent(/^(aw|re):/i.test(m.betreff || '') ? m.betreff : 'AW: ' + (m.betreff || ''))}`;

async function setStatus(m, status, extra = {}) { await db.save('mails', { ...m, ...extra, status }); }

async function linkTo(m, contactId) {
  await setStatus(m, 'zugeordnet', { contactId });
  await db.log('email', `✉️ E-Mail erhalten: ${m.betreff || '(ohne Betreff)'}\n${snippet(m)}`, { contactId });
}

function detail(m) {
  const { el, close } = modal(m.betreff || '(ohne Betreff)', html`
    <div class="full mailhead"><div><b>${m.vonName || m.vonAdresse}</b> ${m.vonName ? html`<span class="muted">&lt;${m.vonAdresse}&gt;</span>` : ''}</div>
      <div class="muted small">${fmtDT(m.datum)}${m.an ? ' · an ' + m.an : ''}${m.contactId ? html` · ${cLink(m.contactId)}` : ''}</div>
      ${m.anhaenge?.length ? html`<div class="muted small">📎 ${m.anhaenge.join(', ')}</div>` : ''}</div>
    <div class="full mailtxt">${m.text || '(kein Text)'}</div>
    <div class="full actions wrap">
      <a class="btn primary" href="${replyHref(m)}" data-a="reply">↩ In Outlook antworten</a>
      ${m.contactId ? '' : html`<button type="button" class="btn" data-a="contact">☺ Als Kontakt anlegen</button><button type="button" class="btn" data-a="link">Kontakt zuordnen</button>`}
      <button type="button" class="btn" data-a="task">✓ Aufgabe</button>
      ${m.status === 'neu' ? html`<button type="button" class="btn ghost" data-a="done">Erledigt</button><button type="button" class="btn ghost" data-a="ignore">Ignorieren</button>` : html`<button type="button" class="btn ghost" data-a="reopen">Wieder als neu</button>`}
    </div>`, { wide: true });
  const act = {
    reply: async () => { if (m.contactId) await db.log('email', `✉️ Antwort auf „${m.betreff || ''}“ in Outlook geöffnet`, { contactId: m.contactId }); },
    contact: () => { close(); contactForm({ ...nameParts(m), email: m.vonAdresse, kategorie: 'Interessent (Kauf)', quelle: 'Sonstige', status: 'Aktiv', notiz: `Erste Mail: ${m.betreff || ''}` }, async c => { await linkTo(m, c.id); toast('Kontakt angelegt und Mail zugeordnet'); }); },
    link: () => { close(); modal('Mail einem Kontakt zuordnen', html`${sel('contactId', 'Kontakt', contactOpts(), '', { blank: 1, cls: 'full' })}`, { saveLabel: 'Zuordnen', onSave: async v => { if (!v.contactId) { toast('Bitte Kontakt wählen', 'err'); return false; } await linkTo(m, v.contactId); toast('Zugeordnet'); } }); },
    task: () => { close(); taskForm({ titel: `Antworten: ${m.vonName || m.vonAdresse} – ${m.betreff || ''}`, contactId: m.contactId || '', notiz: snippet(m), prio: 'normal' }, async () => { if (m.status === 'neu') await setStatus(m, 'erledigt'); }); },
    done: async () => { close(); await setStatus(m, 'erledigt'); toast('Als erledigt markiert'); },
    ignore: async () => { close(); await setStatus(m, 'ignoriert'); toast('Ignoriert'); },
    reopen: async () => { close(); await setStatus(m, 'neu'); },
  };
  el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act[b.dataset.a]()));
}

export function render(el, arg) {
  const all = mails().slice().sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  const list = all.filter(m => filter === 'alle' ? true : filter === 'neu' ? m.status === 'neu' : m.status !== 'neu' && m.status !== 'ignoriert');
  const st = db.get('sync', 'mailsync');
  el.innerHTML = html`<div class="head"><div><h1>Posteingang</h1><p class="muted">Mails aus deinem Outlook-Postfach. Anfragen und Mails bekannter Kontakte ordnet der Abgleich automatisch zu und legt Aufgaben an – hier entscheidest du über den Rest.</p></div></div>
    <div class="chips">${FILTERS.map(([k, l]) => html`<button class="chip ${k === filter ? 'on' : ''}" data-f="${k}">${l}${k === 'neu' && newCount() ? html` <i>${newCount()}</i>` : ''}</button>`)}
      <span class="muted small syncinfo">${st ? (st.error ? html`⚠️ ${st.error}` : html`Zuletzt abgeglichen: ${fmtDT(st.lastOk || st.lastRun)}`) : 'Mail-Abgleich noch nicht eingerichtet'}</span></div>
    <div class="card">${list.length ? html`<ul class="list mails">${list.map(m => { const [tl, tc] = TYP[m.typ] || TYP.unbekannt; return html`<li data-m="${m.id}" class="${m.status === 'neu' ? 'unread' : ''}">
        <b class="when">${fmtDT(m.datum).slice(0, 8)}</b>
        <div class="grow"><div class="ttl">${(m.typ === 'anfrage' && m.contactId && contactName(m.contactId)) || m.vonName || m.vonAdresse} <span class="muted">· ${m.typ === 'anfrage' ? `Anfrage über ${m.quelle || 'Website'}` : m.betreff || '(ohne Betreff)'}</span></div>
          <div class="sub">${m.typ === 'anfrage' ? m.betreff : html`${m.contactId ? html`${cLink(m.contactId)} · ` : ''}${snippet(m)}`}</div></div>
        ${badge(tl, tc)}</li>`; })}</ul>` : empty(filter === 'neu' ? 'Keine neuen Mails' : 'Noch keine Mails', st ? '' : 'Den Mail-Abgleich richtest du einmal auf deinem Mac ein (Automationen → E-Mail).')}</div>`.s;
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(el); });
  el.querySelectorAll('[data-m]').forEach(li => li.onclick = e => { if (!e.target.closest('a')) detail(db.get('mails', li.dataset.m)); });
  if (arg && db.get('mails', arg)) detail(db.get('mails', arg));
}
