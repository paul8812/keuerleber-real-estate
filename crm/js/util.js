// Helfer: Escaping, Formatierung, Modals, Formulare
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(s);
const part = v => Array.isArray(v) ? v.map(part).join('') : v instanceof Raw ? v.s : esc(v);
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += part(vals[i]); });
  return new Raw(out);
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
export const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
export const today = () => iso(new Date());
export const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
export const fmtDate = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
export const fmtDateShort = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
export const fmtDT = ts => ts ? new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
export const eur = n => (n === '' || n == null || isNaN(n)) ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
export const eur2 = n => (n == null || isNaN(n)) ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
export const num = (n, d = 0) => (n === '' || n == null || isNaN(n)) ? '–' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: d }).format(n);
export const pct = (n, d = 1) => (n == null || isNaN(n)) ? '–' : num(n, d) + ' %';
export const debounce = (f, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
export const initials = c => ((c.vorname || '')[0] || '') + ((c.nachname || c.firma || '')[0] || '');
export const fullName = c => c ? ([c.anrede && c.anrede !== 'Firma' ? '' : '', c.vorname, c.nachname].filter(Boolean).join(' ') || c.firma || '(ohne Name)') : '';

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  root.appendChild(el); setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3100);
}

// ---------- Formularfelder ----------
export const inp = (name, label, val = '', o = {}) => html`<label class="f ${o.cls || ''}"><span>${label}</span><input name="${name}" type="${o.type || 'text'}" value="${val ?? ''}" ${o.req ? raw('required') : ''} ${o.step ? raw(`step="${o.step}"`) : ''} placeholder="${o.ph || ''}" ${o.list ? raw(`list="${o.list}"`) : ''}></label>`;
export const area = (name, label, val = '', o = {}) => html`<label class="f ${o.cls || 'full'}"><span>${label}</span><textarea name="${name}" rows="${o.rows || 3}" placeholder="${o.ph || ''}">${val ?? ''}</textarea></label>`;
export const sel = (name, label, opts, val = '', o = {}) => html`<label class="f ${o.cls || ''}"><span>${label}</span><select name="${name}">${o.blank ? raw('<option value=""></option>') : ''}${opts.map(x => { const [v, t] = Array.isArray(x) ? x : [x, x]; return html`<option value="${v}" ${String(v) === String(val ?? '') ? raw('selected') : ''}>${t}</option>`; })}</select></label>`;
export const chk = (name, label, val = false, o = {}) => html`<label class="f chk ${o.cls || ''}"><input type="checkbox" name="${name}" ${val ? raw('checked') : ''}><span>${label}</span></label>`;

export function collect(form) {
  const o = {};
  form.querySelectorAll('[name]').forEach(el => {
    if (el.type === 'checkbox') { if (el.name.endsWith('[]')) { const k = el.name.slice(0, -2); (o[k] ||= []); if (el.checked) o[k].push(el.value); } else o[el.name] = el.checked; }
    else if (el.type === 'number') o[el.name] = el.value === '' ? '' : Number(el.value);
    else o[el.name] = el.value.trim ? el.value.trim() : el.value;
  });
  return o;
}

// ---------- Modal ----------
export function modal(title, body, { onSave, saveLabel = 'Speichern', wide = false, onMount, danger } = {}) {
  const root = document.getElementById('modal-root');
  const el = document.createElement('div'); el.className = 'modal-bg';
  el.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><header><h3>${esc(title)}</h3><button type="button" class="x" data-close aria-label="Schließen">×</button></header><form class="mbody"><div class="grid">${body.s}</div><footer>${danger ? `<button type="button" class="btn danger left" data-danger>${esc(danger.label)}</button>` : ''}<button type="button" class="btn ghost" data-close>Abbrechen</button>${onSave ? `<button class="btn primary">${esc(saveLabel)}</button>` : ''}</footer></form></div>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  el.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  const form = el.querySelector('form');
  form.onsubmit = async e => { e.preventDefault(); if (!onSave) return; const r = await onSave(collect(form), close, form); if (r !== false) close(); };
  if (danger) el.querySelector('[data-danger]').onclick = async () => { if (await confirmDlg(danger.confirm || 'Wirklich löschen?')) { await danger.fn(); close(); } };
  root.appendChild(el);
  onMount && onMount(el, close);
  const first = el.querySelector('input:not([type=checkbox]),select,textarea'); first && first.focus();
  return { el, close };
}
export function confirmDlg(msg) {
  return new Promise(res => {
    const root = document.getElementById('modal-root'); const el = document.createElement('div'); el.className = 'modal-bg';
    el.innerHTML = `<div class="modal small"><div class="mbody"><p class="confirm">${esc(msg)}</p><footer><button class="btn ghost" data-n>Abbrechen</button><button class="btn primary" data-y>Ja</button></footer></div></div>`;
    const done = v => { el.remove(); res(v); };
    el.querySelector('[data-n]').onclick = () => done(false); el.querySelector('[data-y]').onclick = () => done(true);
    root.appendChild(el); el.querySelector('[data-y]').focus();
  });
}
export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function toCSV(rows, cols) {
  const q = v => { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '﻿' + [cols.map(c => q(c[1])).join(';'), ...rows.map(r => cols.map(c => q(typeof c[0] === 'function' ? c[0](r) : r[c[0]])).join(';'))].join('\r\n');
}
export function parseCSV(text) {
  text = text.replace(/^﻿/, ''); const delim = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  return rows.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
