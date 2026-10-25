import * as db from '../db.js';
import { html, today, addDays, fmtDate, toast, modal, confirmDlg } from '../util.js';
import { taskForm } from '../forms.js';
import { cLink, pLink, empty, badge } from '../ui.js';
import { PRIOS } from '../consts.js';
import { entwurfDialog } from '../entwurf.js';

export async function completeTask(t, done = true, frage = false) {
  await db.save('tasks', { ...t, done, doneAt: done ? new Date().toISOString() : '' });
  if (done && frage) window.dispatchEvent(new CustomEvent('crm:erledigt', { detail: t }));  // → „Nächster Schritt?“ (nur bei Erledigen von Hand)
  if (done && t.wiederholung) {
    const step = { daily: 1, weekly: 7, monthly: 30, yearly: 365 }[t.wiederholung];
    let next;
    if (t.wiederholung === 'monthly' || t.wiederholung === 'yearly') { const d = new Date((t.faellig || today()) + 'T12:00:00'); t.wiederholung === 'monthly' ? d.setMonth(d.getMonth() + 1) : d.setFullYear(d.getFullYear() + 1); next = d.toISOString().slice(0, 10); }
    else next = addDays(t.faellig || today(), step);
    await db.save('tasks', { titel: t.titel, faellig: next, prio: t.prio, wiederholung: t.wiederholung, contactId: t.contactId, propertyId: t.propertyId, notiz: t.notiz, done: false });
    toast('Erledigt – nächste Wiederholung am ' + fmtDate(next));
  }
  if (done && t.contactId) await db.log('system', `Aufgabe erledigt: ${t.titel}`, { contactId: t.contactId, propertyId: t.propertyId });
}

const FILTERS = [['heute', 'Heute & überfällig'], ['woche', 'Diese Woche'], ['offen', 'Alle offenen'], ['erledigt', 'Erledigt']];
let filter = 'heute', prio = '';

// Schnellaktionen direkt in der Aufgabe: anrufen, mailen, auf morgen schieben
function quick(t) {
  const c = t.contactId ? db.get('contacts', t.contactId) : null, tel = c && (c.mobil || c.tel);
  return html`<span class="tquick">${tel ? html`<a href="tel:${tel.replace(/[^0-9+]/g, '')}" title="Anrufen ${tel}" data-call="${t.id}">📞</a>` : ''}${c && c.email || /:Reservierung$/.test(t.auto || '') ? html`<button type="button" title="E-Mail-Entwurf prüfen & senden" data-entwurf="${t.id}">✉</button>` : ''}<button type="button" title="Auf morgen verschieben" data-snooze="${t.id}">⏭</button><button type="button" title="Weitere Aktionen" data-akt="task:${t.id}">⋯</button></span>`;
}
export function taskRow(t) {
  const late = !t.done && t.faellig && t.faellig < today();
  const auto = /^⚡ /.test(t.titel || '');
  return html`<li class="task ${t.done ? 'done' : ''} ${late ? 'late' : ''} ${auto ? 'auto' : ''}"><input type="checkbox" data-done="${t.id}" ${t.done ? html`checked` : ''}>
    <div class="grow" data-edit="${t.id}"><div class="ttl">${(t.titel || '').replace(/^⚡ /, '')}</div><div class="sub">${t.faellig ? (late ? 'überfällig seit ' : '') + fmtDate(t.faellig) : 'ohne Datum'}${auto ? html` · <span class="autotag" title="Vom CRM automatisch angelegt">automatisch</span>` : ''}${t.contactId ? html` · ${cLink(t.contactId)}` : ''}${t.propertyId && db.get('properties', t.propertyId) ? html` · ${pLink(t.propertyId)}` : ''}${t.wiederholung ? ' · ↻' : ''}</div></div>
    ${t.prio === 'hoch' ? badge('hoch', '#e06a5a') : t.prio === 'niedrig' ? badge('niedrig', '#777') : ''}${t.done ? '' : quick(t)}</li>`;
}
export function bindTasks(el) {
  if (el._tasksBound) return; el._tasksBound = true;  // Delegation nur einmal anhängen (main bleibt bestehen)
  el.addEventListener('change', e => { const id = e.target.dataset?.done; if (id) completeTask(db.get('tasks', id), e.target.checked, true); });
  el.addEventListener('click', async e => {
    const sn = e.target.closest('[data-snooze]')?.dataset.snooze;
    if (sn) { const t = db.get('tasks', sn); await db.save('tasks', { ...t, faellig: addDays(today(), 1) }); toast('Auf morgen verschoben'); return; }
    const ent = e.target.closest('[data-entwurf]')?.dataset.entwurf;
    if (ent) { entwurfDialog(db.get('tasks', ent)); return; }
    const call = e.target.closest('[data-call]');
    if (call) { const t = db.get('tasks', call.dataset.call); if (t?.contactId) db.log('anruf', `Anruf zu: ${t.titel.replace(/^⚡ /, '')}`, { contactId: t.contactId, propertyId: t.propertyId }); return; }
    const id = e.target.closest('[data-edit]')?.dataset.edit; if (id && !e.target.closest('a')) taskForm(db.get('tasks', id));
  });
}

// Aufräumen: automatisch angelegte Aufgaben (z. B. „Erstkontakt“ nach einem Kontakt-Import) gesammelt löschen
const grundName = t => (t.titel || '').replace(/^⚡ /, '').split(':')[0].replace(/\s*\(.*$/, '').trim() || 'Sonstige';
export function aufraeumen() {
  const autos = db.all('tasks').filter(t => /^⚡ /.test(t.titel || '') || t.auto);
  if (!db.all('tasks').length) { toast('Es gibt keine Aufgaben'); return; }
  const gr = {}; autos.forEach(t => { const g = grundName(t); (gr[g] ||= []).push(t); });
  const namen = Object.keys(gr).sort((a, b) => gr[b].length - gr[a].length);
  const RULEMAP = { 'Erstkontakt': ['neuerInteressent'], 'Suchprofil erfragen': ['suchprofil'] };
  const { el } = modal('Automatische Aufgaben löschen', html`
    <p class="full muted">Wähle, welche vom CRM automatisch angelegten Aufgaben gelöscht werden sollen (z. B. die „Erstkontakt“-Aufgaben nach dem Kontakt-Import). Selbst angelegte Aufgaben bleiben unberührt. Die Kontakte selbst werden nicht angetastet.</p>
    ${namen.map((n, i) => html`<label class="f chk full"><input type="checkbox" data-g="${i}" ${gr[n].some(t => !t.done) ? html`checked` : ''}><span>${n} <span class="muted">(${gr[n].length}, davon ${gr[n].filter(t => !t.done).length} offen)</span></span></label>`)}
    <label class="f chk full"><input type="checkbox" data-erl><span>Auch bereits erledigte dieser Art löschen</span></label>
    <label class="f chk full" style="margin-top:6px"><input type="checkbox" data-alle><span><b>Wirklich ALLE ${db.all('tasks').length} Aufgaben löschen</b> (auch selbst angelegte; überschreibt die Auswahl oben)</span></label>
    <label class="f chk full"><input type="checkbox" data-regeln checked><span>Passende Automatik-Regeln danach ausschalten, damit sie nicht neu entstehen (Automationen → Regeln)</span></label>`,
    { saveLabel: 'Löschen', onSave: async (v, close) => {
      const erl = el.querySelector('[data-erl]').checked, sel = namen.filter((n, i) => el.querySelector(`[data-g="${i}"]`).checked);
      const alle = el.querySelector('[data-alle]').checked;
      const del = alle ? db.all('tasks').slice() : sel.flatMap(n => gr[n]).filter(t => erl || !t.done);
      if (!del.length) { toast('Nichts ausgewählt'); return false; }
      if (!await confirmDlg(`${del.length} Aufgabe${del.length > 1 ? 'n' : ''} endgültig löschen?`)) return false;
      toast(`Lösche ${del.length} Aufgaben …`);
      try { await db.delMany('tasks', del.map(t => t.id), (n, m) => { if (m > 100) toast(`${n} von ${m} gelöscht …`); }); }
      catch (e) { toast('Löschen abgebrochen: ' + (e.message || e), 'err'); return false; }
      if (el.querySelector('[data-regeln]').checked) {
        const ids = alle ? ['neuerInteressent', 'suchprofil', 'dubletten'] : sel.flatMap(n => RULEMAP[n] || []);
        if (ids.length) { const auto = { ...(db.settings().auto || {}) }; ids.forEach(id => { auto[id] = { ...(auto[id] || {}), on: false }; }); await db.saveSettings({ ...db.settings(), auto }); }
      }
      toast(`${del.length} Aufgabe${del.length > 1 ? 'n' : ''} gelöscht`);
    } });
}

export function render(el) {
  const t0 = today(), wEnd = addDays(t0, 7);
  let list = db.all('tasks').filter(t => !prio || t.prio === prio);
  list = list.filter(t => filter === 'erledigt' ? t.done : !t.done && (filter === 'offen' || (filter === 'heute' ? (t.faellig && t.faellig <= t0) : (t.faellig && t.faellig <= wEnd))));
  list.sort((a, b) => (a.faellig || '9999').localeCompare(b.faellig || '9999') || (a.prio === 'hoch' ? -1 : 1));
  const open = db.all('tasks').filter(t => !t.done);
  el.innerHTML = html`<div class="head"><h1>Aufgaben</h1><div class="actions"><button class="btn ghost" data-aufr title="Automatisch angelegte Aufgaben gesammelt löschen">🧹 Aufräumen</button><button class="btn primary" data-new>+ Aufgabe</button></div></div>
    <div class="chips">${FILTERS.map(([k, l]) => html`<button class="chip ${k === filter ? 'on' : ''}" data-f="${k}">${l}${k === 'heute' ? html` <i>${open.filter(t => t.faellig && t.faellig <= t0).length}</i>` : ''}</button>`)}
      <select data-prio class="chipsel"><option value="">Alle Prioritäten</option>${PRIOS.map(([v, l]) => html`<option value="${v}" ${v === prio ? html`selected` : ''}>${l}</option>`)}</select></div>
    <div class="card">${list.length ? html`<ul class="tasks">${list.map(taskRow)}</ul>` : empty('Keine Aufgaben in dieser Ansicht 🎉')}</div>`.s;
  el.querySelector('[data-new]').onclick = () => taskForm();
  el.querySelector('[data-aufr]').onclick = aufraeumen;
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(el); });
  el.querySelector('[data-prio]').onchange = e => { prio = e.target.value; render(el); };
  bindTasks(el);
}
