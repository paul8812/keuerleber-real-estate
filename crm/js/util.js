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
// SHA-1 (synchron, wie im Mail-Abgleich auf dem Server) – für feste IDs: Legen zwei Geräte gleichzeitig denselben
// Datensatz an, entsteht dieselbe ID und damit kein Doppel.
export function sha1(s) {
  const msg = new TextEncoder().encode(String(s));
  const buf = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  buf.set(msg); buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer), bits = msg.length * 8;
  dv.setUint32(buf.length - 4, bits >>> 0); dv.setUint32(buf.length - 8, Math.floor(bits / 2 ** 32));
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map(x => x.toString(16).padStart(8, '0')).join('');
}
/** feste ID aus einem fachlichen Schlüssel, z. B. idFor('auto', 'ni:c-123') → 'auto-…' */
export const idFor = (prefix, key) => prefix + '-' + sha1(key).slice(0, 20);
/** Kontakt-ID aus der E-Mail-Adresse – dasselbe Schema wie der Mail-Abgleich (c- + sha1(adresse)[:20]) */
export const contactIdFor = email => 'c-' + sha1(String(email).trim().toLowerCase()).slice(0, 20);
export const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
export const today = () => iso(new Date());
export const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
// Formatierer einmal anlegen statt bei jedem Aufruf (toLocale…String mit Optionen baut jedes Mal ein neues Intl-Objekt –
// bei Listen mit Hunderten Zeilen kostete das am Handy spürbar Zeit)
const F_DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }), F_SHORT = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }),
  F_DT = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
  F_EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }), F_EUR2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), F_NUM = {};
const ok = d => !isNaN(d.getTime());
export const fmtDate = s => { if (!s) return ''; const d = new Date(s + 'T12:00:00'); return ok(d) ? F_DATE.format(d) : 'Invalid Date'; };
export const fmtDateShort = s => { if (!s) return ''; const d = new Date(s + 'T12:00:00'); return ok(d) ? F_SHORT.format(d) : 'Invalid Date'; };
export const fmtDT = ts => { if (!ts) return ''; const d = new Date(ts); return ok(d) ? F_DT.format(d) : 'Invalid Date'; };
export const eur = n => (n === '' || n == null || isNaN(n)) ? '–' : F_EUR.format(n);
export const eur2 = n => (n == null || isNaN(n)) ? '–' : F_EUR2.format(n);
export const num = (n, d = 0) => (n === '' || n == null || isNaN(n)) ? '–' : (F_NUM[d] ||= new Intl.NumberFormat('de-DE', { maximumFractionDigits: d })).format(n);
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

// Hintergrund beim Dialog festhalten (iOS scrollt sonst die Seite dahinter mit)
let sperren = 0, sperrY = 0;
export function scrollSperre(an) {
  if (an) { if (sperren++ === 0) { sperrY = window.scrollY; Object.assign(document.body.style, { position: 'fixed', top: -sperrY + 'px', left: '0', right: '0' }); document.documentElement.classList.add('modal-open'); } }
  else if (sperren > 0 && --sperren === 0) { Object.assign(document.body.style, { position: '', top: '', left: '', right: '' }); document.documentElement.classList.remove('modal-open'); window.scrollTo(0, sperrY); }
}
// ---------- Modal ----------
export function modal(title, body, { onSave, saveLabel = 'Speichern', wide = false, onMount, danger } = {}) {
  const root = document.getElementById('modal-root');
  const el = document.createElement('div'); el.className = 'modal-bg';
  el.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><header><h3>${esc(title)}</h3><button type="button" class="x" data-close aria-label="Schließen">×</button></header><form class="mbody"><div class="grid">${body.s}</div><footer>${danger ? `<button type="button" class="btn danger left" data-danger>${esc(danger.label)}</button>` : ''}<button type="button" class="btn ghost" data-close>Abbrechen</button>${onSave ? `<button class="btn primary">${esc(saveLabel)}</button>` : ''}</footer></form></div>`;
  let zu = false; const close = () => { if (zu) return; zu = true; el.remove(); document.removeEventListener('keydown', onKey); scrollSperre(false); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  el.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  const form = el.querySelector('form');
  form.onsubmit = async e => { e.preventDefault(); if (!onSave) return; const r = await onSave(collect(form), close, form); if (r !== false) close(); };
  if (danger) el.querySelector('[data-danger]').onclick = async () => { if (await confirmDlg(danger.confirm || 'Wirklich löschen?')) { await danger.fn(); close(); } };
  root.appendChild(el); scrollSperre(true);
  onMount && onMount(el, close);
  const first = el.querySelector('input:not([type=checkbox]),select,textarea'); if (first && matchMedia('(hover:hover)').matches) first.focus();  // am Handy keine Tastatur sofort aufklappen
  return { el, close };
}
export function confirmDlg(msg) {
  return new Promise(res => {
    const root = document.getElementById('modal-root'); const el = document.createElement('div'); el.className = 'modal-bg';
    el.innerHTML = `<div class="modal small"><div class="mbody"><p class="confirm">${esc(msg)}</p><footer><button class="btn ghost" data-n>Abbrechen</button><button class="btn primary" data-y>Ja</button></footer></div></div>`;
    const done = v => { el.remove(); scrollSperre(false); res(v); };
    el.querySelector('[data-n]').onclick = () => done(false); el.querySelector('[data-y]').onclick = () => done(true);
    root.appendChild(el); scrollSperre(true); el.querySelector('[data-y]').focus();
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
