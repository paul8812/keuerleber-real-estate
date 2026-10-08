import * as db from '../db.js';
import { html, raw, eur, fmtDate, today, toast } from '../util.js';
import { PIPELINES } from '../consts.js';
import { dealForm } from '../forms.js';
import { cLink, pLink, empty, dealProvision } from '../ui.js';
import { prob, isOpen } from './dashboard.js';

let board = 'akquise';

export function render(el) {
  const P = PIPELINES[board], deals = db.all('deals').filter(d => d.board === board);
  const open = deals.filter(isOpen);
  const sum = open.reduce((s, d) => s + (d.wert || 0), 0), fc = open.reduce((s, d) => s + dealProvision(d) * prob(d) / 100, 0);
  el.innerHTML = html`<div class="head"><h1>Pipeline</h1><div class="actions"><button class="btn primary" data-new>+ Vorgang</button></div></div>
    <div class="chips">${Object.entries(PIPELINES).map(([k, v]) => html`<button class="chip ${k === board ? 'on' : ''}" data-b="${k}">${v.name}</button>`)}
      <span class="muted grow right">${open.length} offen · Volumen ${eur(sum)} · Prognose Provision ${eur(fc)}</span></div>
    <div class="kanban">${P.stages.map(stage => { const cards = deals.filter(d => d.stage === stage).sort((a, b) => (a.faellig || '9999').localeCompare(b.faellig || '9999')); const tot = cards.reduce((s, d) => s + (d.wert || 0), 0);
      return html`<div class="col ${stage === P.won ? 'won' : stage === P.lost ? 'lost' : ''}" data-stage="${stage}"><div class="colh"><b>${stage}</b><span>${cards.length}${tot ? ' · ' + eur(tot) : ''}</span></div>
        <div class="cards">${cards.map(d => { const late = d.faellig && d.faellig < today() && isOpen(d); return html`<div class="deal" draggable="true" data-id="${d.id}"><div class="ttl">${d.titel}</div>
          ${d.contactId ? html`<div class="sub">☺ ${cLink(d.contactId)}</div>` : ''}${d.propertyId ? html`<div class="sub">⌂ ${pLink(d.propertyId)}</div>` : ''}
          ${d.wert ? html`<div class="val">${eur(d.wert)} <small>· ${prob(d)}%</small></div>` : ''}${d.naechsterSchritt ? html`<div class="next ${late ? 'late' : ''}">→ ${d.naechsterSchritt}${d.faellig ? ' (' + fmtDate(d.faellig) + ')' : ''}</div>` : ''}</div>`; })}</div>
        <button class="addc" data-add="${stage}">+</button></div>`; })}</div>`.s;
  el.querySelector('[data-new]').onclick = () => dealForm({ board });
  el.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { board = b.dataset.b; render(el); });
  el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => dealForm({ board, stage: b.dataset.add }));
  el.querySelectorAll('.deal').forEach(c => {
    c.onclick = e => { if (!e.target.closest('a')) dealForm(db.get('deals', c.dataset.id)); };
    c.ondragstart = e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('drag'); };
    c.ondragend = () => c.classList.remove('drag');
  });
  el.querySelectorAll('.col').forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async e => {
      e.preventDefault(); col.classList.remove('over');
      const d = db.get('deals', e.dataTransfer.getData('text/plain')); const stage = col.dataset.stage;
      if (!d || d.stage === stage) return;
      const old = d.stage; const upd = { ...d, stage };
      if (stage === P.won || stage === P.lost) upd.closedAt = today(); else upd.closedAt = '';
      await db.save('deals', upd);
      await db.log('system', `Vorgang „${d.titel}“: ${old} → ${stage}`, { contactId: d.contactId, propertyId: d.propertyId, dealId: d.id });
      if (stage === P.won && board === 'akquise' && d.propertyId) { const p = db.get('properties', d.propertyId); if (p && p.status === 'Akquise') { await db.save('properties', { ...p, status: 'Vorbereitung' }); toast('Objekt auf „Vorbereitung“ gesetzt'); } }
      if (stage === P.won && board === 'vertrieb' && d.propertyId) { const p = db.get('properties', d.propertyId); if (p) { await db.save('properties', { ...p, status: 'Verkauft / Vermietet' }); toast('🎉 Abschluss – Objekt als verkauft/vermietet markiert'); } }
    };
  });
}
