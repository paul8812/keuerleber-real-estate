// Schnell-Aktionen für Kontakte, Aufgaben, Vorgänge, Termine und Objekte:
// ⋯-Knopf an jeder Zeile, Gedrückt-halten (Handy) bzw. Rechtsklick (Mac), und nach einem Anruf die Frage „Erreicht?“.
// Nichts wird automatisch verschickt – Mails öffnen immer erst den Entwurf bzw. dein Mailprogramm.
import * as db from './db.js';
import { toast, addDays, today, fullName, html, modal, sel } from './util.js';
import { sheet } from './mobil.js';
import { contactForm, taskForm, eventForm, activityForm, dealForm, propertyForm } from './forms.js';
import { completeTask } from './views/tasks.js';
import { entwurfDialog } from './entwurf.js';
import { exposeForm } from './modellrechnung.js';
import { adresse } from './ui.js';

const nummer = c => (c?.mobil || c?.tel || '').replace(/[^\d+]/g, '');
const wa = n => 'https://wa.me/' + n.replace(/^00/, '').replace(/^\+/, '').replace(/^0/, '49');
const oeffne = url => { const a = document.createElement('a'); a.href = url; if (/^https?:/.test(url)) { a.target = '_blank'; a.rel = 'noopener'; } a.click(); };
const route = ort => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(ort);
const naechsterMontag = () => { const d = new Date(today() + 'T12:00:00'); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };

// ---------- Anruf merken → beim Zurückkommen fragen ----------
let anruf = null;
export function anrufStart(cid) { if (cid) anruf = { cid, t: Date.now() }; }
function telZuKontakt(href) {
  const n = href.replace(/^tel:/, '').replace(/\D/g, '').replace(/^(0049|49|0)/, '');
  if (n.length < 6) return null;
  return db.all('contacts').find(c => [c.mobil, c.tel].some(x => x && x.replace(/\D/g, '').replace(/^(0049|49|0)/, '') === n));
}
function nachAnruf() {
  if (!anruf || document.visibilityState !== 'visible') return;
  const { cid, t } = anruf; anruf = null;
  if (Date.now() - t < 3000) return;   // gleich abgebrochen
  const c = db.get('contacts', cid); if (!c) return;
  sheet([
    ['✅ Erreicht – Gesprächsnotiz', () => activityForm({ contactId: c.id, art: 'anruf' })],
    ['📵 Nicht erreicht – morgen erneut', async () => { await db.log('anruf', 'Anruf – nicht erreicht', { contactId: c.id }); await db.save('tasks', { titel: 'Erneut anrufen: ' + fullName(c), faellig: addDays(today(), 1), prio: 'normal', contactId: c.id, done: false }); toast('Aufgabe für morgen angelegt'); }],
    ['📞 Rückruf vereinbart – Termin', () => eventForm({ titel: 'Rückruf ' + fullName(c), art: 'Sonstiges', contactId: c.id })],
    ['💬 Nicht erreicht – WhatsApp schreiben', async () => { await db.log('anruf', 'Anruf – nicht erreicht, WhatsApp geschrieben', { contactId: c.id }); oeffne(wa(nummer(c))); }],
  ], `Gespräch mit ${fullName(c)}?`);
}

// ---------- Aktionen je Datensatz ----------
function wiedervorlage(c, tage, label) {
  return [`⏰ Wiedervorlage ${label}`, async () => { const d = addDays(today(), tage); await db.save('contacts', { ...c, followup: d }); toast(`Wiedervorlage am ${d.split('-').reverse().join('.')}`); }];
}
function exposeFuerKontakt(c) {
  const ps = db.all('properties').filter(p => !['Archiv', 'Verkauft / Vermietet'].includes(p.status));
  if (!ps.length) return toast('Noch kein Objekt angelegt', 'err');
  if (ps.length === 1) return exposeForm(ps[0], { contactId: c.id });
  modal('Objekt für Exposé', html`${sel('pid', 'Objekt', ps.map(p => [p.id, `${p.nr || ''} ${p.titel}`.trim()]), ps[0].id, { cls: 'full' })}`, { saveLabel: 'Weiter', onSave: v => { setTimeout(() => exposeForm(db.get('properties', v.pid), { contactId: c.id }), 0); } });
}
export function kontaktAktionen(c) {
  const n = nummer(c), a = adresse(c), L = [];
  if (n) L.push(['📞 Anrufen', () => { anrufStart(c.id); oeffne('tel:' + n); }, false, 1], ['💬 WhatsApp', () => oeffne(wa(n)), false, 1], ['✉️ SMS', () => oeffne('sms:' + n), false, 1]);
  if (c.email) L.push(['📧 E-Mail', () => oeffne('mailto:' + c.email), false, 1]);
  L.push(['📝 Notiz / Gespräch festhalten', () => activityForm({ contactId: c.id })],
    ['✓ Aufgabe anlegen', () => taskForm({ contactId: c.id, titel: '' })],
    ['▦ Termin anlegen', () => eventForm({ titel: 'Termin ' + fullName(c), contactId: c.id })],
    wiedervorlage(c, 3, 'in 3 Tagen'), wiedervorlage(c, 7, 'in 1 Woche'),
    ['📄 Exposé / Modellrechnung', () => exposeFuerKontakt(c)]);
  if (a && a.length > 4) L.push(['🧭 Route zur Adresse', () => oeffne(route(a))]);
  if (!location.hash.endsWith(c.id)) L.push(['👤 Kontakt öffnen', () => { location.hash = '#/kontakte/' + c.id; }]);
  L.push(['✏️ Bearbeiten', () => contactForm(c)]);
  if (c.status !== 'Archiv') L.push(['📦 Archivieren', async () => { await db.save('contacts', { ...c, status: 'Archiv' }); toast('Archiviert – unter Status „Archiv“ wiederherstellbar'); }, true]);
  return L;
}
export function aufgabeAktionen(t) {
  const c = t.contactId && db.get('contacts', t.contactId), L = [];
  if (!t.done) L.push(['✓ Erledigt', () => completeTask(t, true), false, 1], ['⏭ Morgen', async () => { await db.save('tasks', { ...t, faellig: addDays(today(), 1) }); toast('Auf morgen verschoben'); }, false, 1],
    ['📅 Montag', async () => { await db.save('tasks', { ...t, faellig: naechsterMontag() }); toast('Auf Montag verschoben'); }, false, 1],
    [t.prio === 'hoch' ? '⬇ Priorität normal' : '⬆ Priorität hoch', async () => { await db.save('tasks', { ...t, prio: t.prio === 'hoch' ? 'normal' : 'hoch' }); }]);
  else L.push(['↺ Wieder öffnen', () => completeTask(t, false)]);
  if (c && nummer(c)) L.push(['📞 ' + fullName(c) + ' anrufen', () => { anrufStart(c.id); oeffne('tel:' + nummer(c)); }], ['💬 WhatsApp', () => oeffne(wa(nummer(c)))]);
  if (c && c.email) L.push(['✉ E-Mail-Entwurf prüfen', () => entwurfDialog(t)]);
  if (c) L.push(['👤 Kontakt öffnen', () => { location.hash = '#/kontakte/' + c.id; }]);
  L.push(['✏️ Bearbeiten', () => taskForm(t)]);
  return L;
}
export function vorgangAktionen(d, karte) {
  const c = d.contactId && db.get('contacts', d.contactId), L = [];
  const s = karte?.querySelector('[data-st]');
  if (s) [...s.options].filter(o => o.value !== d.stage).forEach(o => L.push(['→ ' + o.textContent, () => { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }]));
  if (c && nummer(c)) L.push(['📞 ' + fullName(c) + ' anrufen', () => { anrufStart(c.id); oeffne('tel:' + nummer(c)); }]);
  if (c) L.push(['✓ Aufgabe', () => taskForm({ contactId: c.id, propertyId: d.propertyId, titel: '' })], ['▦ Termin', () => eventForm({ titel: 'Termin ' + fullName(c), contactId: c.id, propertyId: d.propertyId })], ['👤 Kontakt öffnen', () => { location.hash = '#/kontakte/' + c.id; }]);
  if (d.propertyId && db.get('properties', d.propertyId)) L.push(['📄 Exposé', () => exposeForm(db.get('properties', d.propertyId), { contactId: d.contactId || '' })]);
  L.push(['✏️ Vorgang bearbeiten', () => dealForm(d)]);
  return L;
}
export function terminAktionen(e) {
  const c = e.contactId && db.get('contacts', e.contactId), p = e.propertyId && db.get('properties', e.propertyId), ort = e.ort || (p ? adresse(p) : ''), L = [];
  if (c && nummer(c)) L.push(['📞 ' + fullName(c) + ' anrufen', () => { anrufStart(c.id); oeffne('tel:' + nummer(c)); }], ['💬 WhatsApp', () => oeffne(wa(nummer(c)))]);
  if (ort) L.push(['🧭 Route', () => oeffne(route(ort))]);
  if (c && c.email && e.datum >= today()) L.push(['✉ Terminbestätigung prüfen & senden', () => entwurfDialog({ ohneAufgabe: true, auto: 'tb:' + e.id, contactId: c.id, propertyId: e.propertyId, titel: 'Terminbestätigung' })]);
  if (e.datum <= today()) L.push(['✅ Hat stattgefunden – Notiz', () => activityForm({ contactId: e.contactId, propertyId: e.propertyId, art: e.art === 'Besichtigung' ? 'besichtigung' : 'meeting' })]);
  L.push(['⏩ Einen Tag später', async () => { await db.save('events', { ...e, datum: addDays(e.datum, 1) }); toast('Termin verschoben'); }]);
  if (c) L.push(['👤 Kontakt öffnen', () => { location.hash = '#/kontakte/' + c.id; }]);
  L.push(['✏️ Bearbeiten', () => eventForm(e)]);
  return L;
}
export function objektAktionen(p) {
  const a = adresse(p), L = [['📄 Exposé & Modellrechnung', () => exposeForm(p)], ['🎯 Passende Interessenten', () => { location.hash = '#/objekte/' + p.id; }]];
  if (p.webLive) L.push(['🌐 Auf der Website ansehen', () => oeffne('https://keuerleber-immobilien.de/')]);
  if (a && a.length > 4) L.push(['🧭 Route', () => oeffne(route(a))], ['📋 Adresse kopieren', async () => { try { await navigator.clipboard.writeText(a); toast('Adresse kopiert'); } catch { toast(a); } }]);
  const v = p.eigentuemerId && db.get('contacts', p.eigentuemerId);
  if (v && nummer(v)) L.push(['📞 Verkäufer anrufen', () => { anrufStart(v.id); oeffne('tel:' + nummer(v)); }]);
  L.push(['✓ Aufgabe zum Objekt', () => taskForm({ propertyId: p.id, titel: '' })], ['✏️ Bearbeiten', () => propertyForm(p)]);
  return L;
}

// Welcher Datensatz steckt hinter einem Element?
function ziel(el) {
  let x;
  if ((x = el.closest('[data-akt]'))) { const [typ, id] = x.dataset.akt.split(':'); return { typ, id, el: x.closest('.deal,li,tr') || x }; }
  if ((x = el.closest('li.task'))) return { typ: 'task', id: x.querySelector('[data-done]')?.dataset.done, el: x };
  if ((x = el.closest('li.ctask[data-task]'))) return { typ: 'task', id: x.dataset.task, el: x };
  if ((x = el.closest('.deal[data-id]'))) return { typ: 'deal', id: x.dataset.id, el: x };
  if ((x = el.closest('[data-ev]'))) return { typ: 'event', id: x.dataset.ev, el: x };
  if ((x = el.closest('#clist tr[data-id]'))) return { typ: 'contact', id: x.dataset.id, el: x };
  if ((x = el.closest('a.pcard'))) return { typ: 'property', id: (x.getAttribute('href') || '').split('/').pop(), el: x };
  return null;
}
const QUELLE = { contact: ['contacts', kontaktAktionen, c => fullName(c)], task: ['tasks', aufgabeAktionen, t => t.titel.replace(/^⚡ /, '')], deal: ['deals', vorgangAktionen, d => d.titel], event: ['events', terminAktionen, e => e.titel], property: ['properties', objektAktionen, p => p.titel] };
export function menueFuer(z) {
  const q = z && QUELLE[z.typ]; if (!q) return false;
  const r = db.get(q[0], z.id); if (!r) return false;
  const titel = q[2](r); sheet(q[1](r, z.el), titel.length > 60 ? titel.slice(0, 58) + '…' : titel); return true;
}

export function initAktionen() {
  // ⋯-Knöpfe
  document.addEventListener('click', e => { const b = e.target.closest('[data-akt]'); if (!b) return; e.preventDefault(); e.stopPropagation(); menueFuer(ziel(b)); }, true);
  // Anruf-Links merken
  document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"]'); if (!a) return; const c = telZuKontakt(a.getAttribute('href')); if (c) anrufStart(c.id); }, true);
  document.addEventListener('visibilitychange', () => setTimeout(nachAnruf, 400));
  // Rechtsklick am Mac
  document.addEventListener('contextmenu', e => { if (e.target.closest('input,textarea,select,.modal')) return; const z = ziel(e.target); if (z && menueFuer(z)) e.preventDefault(); });
  // Gedrückt halten am Handy
  let timer = null, x0 = 0, y0 = 0, ausgeloest = false;
  document.addEventListener('touchstart', e => {
    ausgeloest = false; if (e.touches.length !== 1 || e.target.closest('input,textarea,select,button,.modal,.msheet-bg')) return;
    const z = ziel(e.target); if (!z) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    timer = setTimeout(() => { timer = null; if (menueFuer(z)) { ausgeloest = true; navigator.vibrate?.(15); z.el.classList.add('gedrueckt'); setTimeout(() => z.el.classList.remove('gedrueckt'), 300); } }, 480);
  }, { passive: true });
  const abbruch = () => { if (timer) { clearTimeout(timer); timer = null; } };
  document.addEventListener('touchmove', e => { if (timer && Math.hypot(e.touches[0].clientX - x0, e.touches[0].clientY - y0) > 8) abbruch(); }, { passive: true });
  document.addEventListener('touchend', e => { abbruch(); if (ausgeloest) { e.preventDefault(); ausgeloest = false; } });
  document.addEventListener('touchcancel', abbruch);
}
