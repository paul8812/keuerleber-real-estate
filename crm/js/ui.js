// Gemeinsame UI-Bausteine
import * as db from './db.js';
import { html, raw, esc, fullName, initials, fmtDT, eur, num } from './util.js';
import { AKTIVITAET_ARTEN, STATUS_FARBE } from './consts.js';

export const contactName = id => { const c = db.get('contacts', id); return c ? fullName(c) : ''; };
export const propTitle = id => { const p = db.get('properties', id); return p ? p.titel : ''; };
export const contactOpts = () => db.all('contacts').slice().sort((a, b) => fullName(a).localeCompare(fullName(b), 'de')).map(c => [c.id, fullName(c) + (c.firma && c.nachname ? ' · ' + c.firma : '')]);
export const propOpts = () => db.all('properties').slice().sort((a, b) => (a.titel || '').localeCompare(b.titel || '', 'de')).map(p => [p.id, `${p.nr || ''} ${p.titel || ''}`.trim()]);
export const cLink = id => { const c = db.get('contacts', id); return c ? html`<a class="lnk" href="#/kontakte/${id}">${fullName(c)}</a>` : ''; };
export const pLink = id => { const p = db.get('properties', id); return p ? html`<a class="lnk" href="#/objekte/${id}">${p.titel}</a>` : ''; };
export const avatar = c => html`<span class="avatar">${initials(c).toUpperCase() || '?'}</span>`;
export const badge = (t, color) => html`<span class="badge" style="--c:${color || '#c9a96e'}">${t}</span>`;
export const statusBadge = s => badge(s, STATUS_FARBE[s]);
export const adresse = p => [p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
export const empty = (t, sub = '') => html`<div class="empty"><p>${t}</p>${sub ? html`<small>${sub}</small>` : ''}</div>`;
export const artInfo = art => AKTIVITAET_ARTEN.find(a => a[0] === art) || ['notiz', art, '📝'];

export function timeline(acts, { showRefs = false } = {}) {
  if (!acts.length) return empty('Noch keine Einträge');
  return html`<ul class="tl">${acts.slice().sort((a, b) => b.datum.localeCompare(a.datum)).map(a => { const [, label, ic] = artInfo(a.art); return html`<li><span class="ic">${ic}</span><div><div class="meta"><b>${label}</b> · ${fmtDT(a.datum)}${showRefs && a.contactId ? html` · ${cLink(a.contactId)}` : ''}${showRefs && a.propertyId ? html` · ${pLink(a.propertyId)}` : ''}</div><div class="txt">${a.text}</div></div></li>`; })}</ul>`;
}

// Suchprofil-Matching: Interessent <-> Objekt
export function matchScore(c, p) {
  if (!c.sp_aktiv) return null;
  if (c.sp_vermarktung && p.vermarktung && c.sp_vermarktung !== p.vermarktung) return null;
  if (c.sp_art && p.art && c.sp_art !== p.art) return null;
  const hits = []; let total = 0, ok = 0;
  const chk = (cond, label) => { total++; if (cond) { ok++; hits.push(label); } };
  if (c.sp_budgetMax) chk(!p.preis || p.preis <= c.sp_budgetMax * 1.05, 'Budget');
  if (c.sp_flaecheMin) chk(p.flaeche >= c.sp_flaecheMin, 'Fläche');
  if (c.sp_zimmerMin) chk(p.zimmer >= c.sp_zimmerMin, 'Zimmer');
  if (c.sp_orte) { const o = c.sp_orte.toLowerCase().split(/[,;]/).map(s => s.trim()).filter(Boolean); chk(o.some(x => (p.ort || '').toLowerCase().includes(x) || (p.plz || '').startsWith(x)), 'Ort'); }
  if (!total) return { score: 50, hits: ['Art/Vermarktung'] };
  return { score: Math.round(ok / total * 100), hits };
}
export const matchesForProperty = p => db.all('contacts').filter(c => c.status !== 'Archiv').map(c => ({ c, m: matchScore(c, p) })).filter(x => x.m && x.m.score >= 60).sort((a, b) => b.m.score - a.m.score);
export const matchesForContact = c => db.all('properties').filter(p => ['Aktiv', 'Vorbereitung', 'Reserviert'].includes(p.status)).map(p => ({ p, m: matchScore(c, p) })).filter(x => x.m && x.m.score >= 60).sort((a, b) => b.m.score - a.m.score);

export const lastContact = id => db.all('activities').filter(a => a.contactId === id && a.art !== 'system').reduce((m, a) => a.datum > m ? a.datum : m, '');
export const dealProvision = d => { const s = db.settings(); const pr = d.propertyId ? db.get('properties', d.propertyId) : null; const pct = d.provision ?? (pr?.provisionGesamt) ?? (s.provKaeufer + s.provVerkaeufer); return (d.wert || 0) * pct / 100; };
export const preisM2 = p => p.preis && p.flaeche ? p.preis / p.flaeche : null;
export { html, raw, esc, eur, num };
