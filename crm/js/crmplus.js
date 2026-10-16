// CRM-Werkzeuge, die im Hintergrund mitdenken:
// Lead-Temperatur, „Fokus heute“, nächster Schritt nach jeder erledigten Aufgabe, WhatsApp-Textbausteine, vCard.
import * as db from './db.js';
import { html, toast, addDays, today, daysBetween, fullName, fmtDate, download } from './util.js';
import { PIPELINES } from './consts.js';
import { lastContact, adresse } from './ui.js';
import { sheet } from './mobil.js';
import { taskForm, eventForm } from './forms.js';
import { fuellen } from './entwurf.js';

const offen = d => { const P = PIPELINES[d.board]; return P && d.stage !== P.won && d.stage !== P.lost; };
export const offeneVorgaenge = cid => db.all('deals').filter(d => d.contactId === cid && offen(d));
export const offeneAufgaben = cid => db.all('tasks').filter(t => !t.done && t.contactId === cid);
const nummer = c => (c?.mobil || c?.tel || '').replace(/[^\d+]/g, '');
const wa = n => 'https://wa.me/' + n.replace(/^00/, '').replace(/^\+/, '').replace(/^0/, '49');
const oeffne = url => { const a = document.createElement('a'); a.href = url; if (/^https?:/.test(url)) { a.target = '_blank'; a.rel = 'noopener'; } a.click(); };

// ---------- Lead-Temperatur (automatisch, ohne Pflege) ----------
// Phase im Vertrieb + wie frisch der letzte Kontakt ist + anstehender Termin + bekanntes Budget
export function temperatur(c) {
  if (!c || c.status === 'Archiv') return null;
  const deals = offeneVorgaenge(c.id).filter(d => d.board === 'vertrieb'), istInteressent = /Interessent|Käufer|Investor/.test(c.kategorie || '');
  if (!deals.length && !istInteressent) return null;
  const t0 = today(); let s = 0;
  const st = PIPELINES.vertrieb.stages; for (const d of deals) s = Math.max(s, 15 + Math.round(st.indexOf(d.stage) / (st.length - 3) * 60));
  const lc = lastContact(c.id) || (c.created || '').slice(0, 10), tage = lc ? daysBetween(lc.slice(0, 10), t0) : 99;
  s += tage <= 3 ? 25 : tage <= 10 ? 15 : tage <= 30 ? 5 : tage > 60 ? -15 : 0;
  if (db.all('events').some(e => e.contactId === c.id && e.datum >= t0)) s += 15;
  if (c.sp_budgetMax || c.sp_aktiv) s += 5;
  s = Math.max(0, Math.min(100, s));
  return s >= 60 ? { s, k: 'heiss', i: '🔥', l: 'heiß' } : s >= 30 ? { s, k: 'warm', i: '🌤', l: 'warm' } : { s, k: 'kalt', i: '❄️', l: 'kalt' };
}
export const tempBadge = c => { const t = temperatur(c); return t ? html`<span class="temp ${t.k}" title="Lead-Temperatur ${t.l} (${t.s}/100) – automatisch aus Phase, letztem Kontakt und Terminen">${t.i}</span>` : ''; };

// ---------- Nächster Schritt ----------
export function naechsterSchritt(c, { deal } = {}) {
  if (!c) return;
  const d = deal || offeneVorgaenge(c.id)[0], ref = { contactId: c.id, propertyId: d?.propertyId || '' }, n = fullName(c);
  const aufgabe = async (titel, tage) => { await db.save('tasks', { titel, faellig: addDays(today(), tage), prio: 'normal', done: false, ...ref }); toast(`✓ ${titel} – ${fmtDate(addDays(today(), tage))}`); };
  sheet([
    ['📞 Anrufen in 2 Tagen', () => aufgabe('Anrufen: ' + n, 2), false, 1],
    ['⏰ Nachfassen in 1 Woche', () => aufgabe('Nachfassen: ' + n, 7), false, 1],
    ['▦ Termin', () => eventForm({ titel: (d?.stage === 'Anfrage' ? 'Beratungsgespräch ' : 'Termin ') + n, art: d?.stage === 'Anfrage' ? 'Beratungsgespräch' : 'Besichtigung', ...ref }), false, 1],
    ['✓ Eigene Aufgabe …', () => taskForm({ titel: '', faellig: addDays(today(), 1), ...ref })],
    ['Kein nächster Schritt', () => {}],
  ], `Nächster Schritt mit ${n}?`);
}
// Nach jeder von Hand erledigten Aufgabe: Gibt es beim Kontakt noch etwas zu tun? Sonst nachfragen – so schläft kein Vorgang ein.
function nachErledigt(t) {
  if (!t?.contactId || document.querySelector('.msheet-bg, #modal-root .modal-bg')) return;
  const c = db.get('contacts', t.contactId);
  if (!c || c.status === 'Archiv' || !offeneVorgaenge(c.id).length || offeneAufgaben(c.id).length) return;
  naechsterSchritt(c);
}

// ---------- Fokus heute ----------
const kontaktiert = cid => db.all('activities').some(a => a.contactId === cid && ['anruf', 'email', 'meeting', 'whatsapp', 'besichtigung'].includes(a.art) && !a.eingehend && !String(a.id || '').startsWith('mail-act-'));
export function fokus() {
  const t0 = today(), L = [], jetzt = Date.now();
  // 1. Neue Anfragen, auf die noch niemand reagiert hat (Geschwindigkeit gewinnt Kunden)
  db.all('contacts').filter(c => c.status !== 'Archiv' && /Interessent/.test(c.kategorie || '') && c.created && jetzt - Date.parse(c.created) < 4 * 864e5 && !kontaktiert(c.id))
    .forEach(c => { const h = Math.round((jetzt - Date.parse(c.created)) / 36e5); L.push({ p: 0, k: 'neu', z: 'neu', t: `Neue Anfrage: ${fullName(c)}`, sub: `wartet seit ${h < 24 ? h + ' Std.' : Math.round(h / 24) === 1 ? '1 Tag' : Math.round(h / 24) + ' Tagen'}, am besten gleich melden`, c, akt: 'contact:' + c.id }); });
  // 2. Termine heute
  db.all('events').filter(e => e.datum === t0).sort((a, b) => (a.start || '').localeCompare(b.start || '')).forEach(e => { const c = e.contactId && db.get('contacts', e.contactId); L.push({ p: 1, k: 'termin', z: e.start || 'heute', t: e.titel, sub: e.ort || (e.propertyId && db.get('properties', e.propertyId) ? adresse(db.get('properties', e.propertyId)) : e.art), c, akt: 'event:' + e.id }); });
  // 3. Wichtige fällige Aufgaben
  db.all('tasks').filter(t => !t.done && t.faellig && t.faellig <= t0).sort((a, b) => ((b.prio === 'hoch') - (a.prio === 'hoch')) || a.faellig.localeCompare(b.faellig)).slice(0, 4)
    .forEach(t => L.push({ p: 2, k: t.faellig < t0 ? 'ueber' : 'heute', z: t.faellig < t0 ? '!' : '✓', t: t.titel.replace(/^⚡ /, ''), sub: t.faellig < t0 ? `überfällig seit ${fmtDate(t.faellig)}` : 'heute fällig', c: t.contactId && db.get('contacts', t.contactId), akt: 'task:' + t.id, task: t }));
  // 4. Vorgänge ohne nächsten Schritt
  db.all('deals').filter(d => offen(d) && d.contactId && !offeneAufgaben(d.contactId).length && db.get('contacts', d.contactId)).slice(0, 3)
    .forEach(d => L.push({ p: 3, k: 'schritt', z: '→', t: `Kein nächster Schritt: ${fullName(db.get('contacts', d.contactId))}`, sub: `${d.titel} · ${d.stage}`, c: db.get('contacts', d.contactId), schritt: d.id, akt: 'deal:' + d.id }));
  const neu = new Set(L.filter(x => x.p === 0).map(x => x.c.id));  // neue Anfrage schon oben → nicht doppelt als Aufgabe
  const gesehen = new Set();
  return L.filter(x => !(x.p === 2 && x.c && neu.has(x.c.id))).filter(x => { const k = x.akt; if (gesehen.has(k)) return false; gesehen.add(k); return true; }).sort((a, b) => a.p - b.p).slice(0, 8);
}
export function fokusKarte() {
  const L = fokus(), faellig = db.all('tasks').filter(t => !t.done && t.faellig && t.faellig <= today()).length, gezeigt = L.filter(x => x.task).length;
  return html`<section class="card fokuscard"><h2>Dein Fokus heute</h2>${L.length ? html`<ul class="fokus">${L.map(x => {
    const n = nummer(x.c);
    return html`<li class="k-${x.k}"><span class="fi">${x.z}</span><div class="grow"><div class="ttl">${x.t}</div><div class="sub">${x.sub || ''}</div></div><span class="fact">
      ${x.task ? html`<button type="button" data-fdone="${x.task.id}" title="Erledigt">✓</button>` : ''}${x.schritt ? html`<button type="button" data-fschritt="${x.schritt}" title="Nächsten Schritt planen">＋</button>` : ''}
      ${n && !x.task ? html`<a href="tel:${n}" title="Anrufen">📞</a>` : ''}<button type="button" data-akt="${x.akt}" title="Weitere Aktionen">⋯</button></span></li>`; })}</ul>` : html`<p class="fokusleer">Alles im Griff, nichts Dringendes offen.</p>`}${faellig > gezeigt ? html`<a class="fokusmehr" href="#/aufgaben">Alle ${faellig} fälligen Aufgaben ansehen</a>` : ''}</section>`;
}
export function bindFokus(el) {
  el.querySelectorAll('[data-fdone]').forEach(b => b.onclick = async () => { const { completeTask } = await import('./views/tasks.js'); await completeTask(db.get('tasks', b.dataset.fdone), true, true); toast('✓ Erledigt'); });
  el.querySelectorAll('[data-fschritt]').forEach(b => b.onclick = () => { const d = db.get('deals', b.dataset.fschritt); naechsterSchritt(db.get('contacts', d.contactId), { deal: d }); });
}

// ---------- WhatsApp mit Textbaustein ----------
export function whatsapp(c, p) {
  const n = nummer(c); if (!n) return toast('Keine Handynummer hinterlegt', 'err');
  const vs = db.all('templates').filter(t => t.kategorie === 'WhatsApp').sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const deal = offeneVorgaenge(c.id)[0], obj = p || (deal?.propertyId && db.get('properties', deal.propertyId)) || null;
  const ev = db.all('events').filter(e => e.contactId === c.id && e.datum >= today()).sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start))[0];
  const datum = ev ? ev.datum : '';
  const senden = async (text, name) => {
    let t = text; if (ev) t = t.replace(fmtDate(ev.datum), `${fmtDate(ev.datum)}${ev.start ? ' um ' + ev.start + ' Uhr' : ''}`);
    oeffne(wa(n) + (t ? '?text=' + encodeURIComponent(t) : ''));
    await db.log('whatsapp', name ? `WhatsApp geschrieben: ${name}` : 'WhatsApp geöffnet', { contactId: c.id, propertyId: obj?.id || '' });
  };
  if (!vs.length) return senden('', '');
  sheet([...vs.map(v => [v.name.replace(/^WA: /, '💬 '), () => senden(fuellen(v.text, c, obj, datum), v.name.replace(/^WA: /, ''))]), ['✏️ Ohne Vorlage', () => senden('', '')]], `WhatsApp an ${fullName(c)}`);
}

// ---------- Kontakt ins Handy-Adressbuch ----------
export function vcard(c) {
  const e = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const v = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(c.nachname)};${e(c.vorname)};;;`, `FN:${e(fullName(c))}`, c.firma ? `ORG:${e(c.firma)}` : '', c.mobil ? `TEL;TYPE=CELL:${c.mobil}` : '', c.tel ? `TEL;TYPE=WORK:${c.tel}` : '', c.email ? `EMAIL:${c.email}` : '',
    c.strasse || c.ort ? `ADR;TYPE=HOME:;;${e(c.strasse)};${e(c.ort)};;${e(c.plz)};Deutschland` : '', `NOTE:${e('Keuerleber CRM – ' + (c.kategorie || ''))}`, 'END:VCARD'].filter(Boolean).join('\r\n');
  download((fullName(c) || 'kontakt').replace(/[^\wäöüÄÖÜß -]/g, '') + '.vcf', v, 'text/vcard');
}

export function initCrmPlus() {
  document.addEventListener('click', e => { const b = e.target.closest('[data-tlsys]'); if (!b) return; const ul = b.previousElementSibling; const an = ul.classList.toggle('zeigsys'); b.textContent = an ? 'Automatische Einträge ausblenden' : b.textContent.replace(/^Automatische.*/, '') || 'Automatische Einträge einblenden'; if (!an) b.textContent = ul.querySelectorAll('li.sys').length + ' automatische Einträge einblenden'; }); window.addEventListener('crm:erledigt', e => setTimeout(() => nachErledigt(e.detail), 450)); }
