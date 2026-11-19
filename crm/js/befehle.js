// Suche als Befehlszentrale (Strg/⌘ + K oder „/“):
//   • findet Kontakte, Objekte, Vorgänge, Aufgaben, Termine, Mails, Belege und Fahrten (mehrere Wörter = alle müssen passen)
//   • Befehle: „neu aufgabe“, „fahrt eintragen“, „beleg“ … und Sprünge: „finanzen“, „fahrtenbuch“ …
//   • Tastatur: ↑ ↓ wählen, Enter öffnen, Esc schließen; „n“ öffnet „Neu anlegen“ (wenn nicht getippt wird)
//   • leeres Feld: zuletzt geöffnete Kontakte/Objekte und die wichtigsten Befehle
import * as db from './db.js';
import { esc, debounce, fullName, fmtDate, fmtDateShort } from './util.js';
import { sl } from './consts.js';
import { taskForm, eventForm, dealForm } from './forms.js';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const ZULETZT = 'kre-zuletzt';
const zuletzt = () => { try { return JSON.parse(localStorage.getItem(ZULETZT) || '[]'); } catch { return []; } };
function merken() {
  const m = location.hash.match(/^#\/(kontakte|objekte)\/([^/]+)$/); if (!m) return;
  try { const k = m[1] + '/' + m[2]; localStorage.setItem(ZULETZT, JSON.stringify([k, ...zuletzt().filter(x => x !== k)].slice(0, 6))); } catch { /* privat */ }
}

/** Treffer bewerten: alle Wörter müssen vorkommen; Anfang des Titels zählt mehr */
function punkte(woerter, titel, rest = '') {
  const t = norm(titel), r = norm(rest); let p = 0;
  for (const w of woerter) {
    if (t.startsWith(w)) p += 6; else if (t.split(/[\s,–-]+/).some(x => x.startsWith(w))) p += 4; else if (t.includes(w)) p += 3; else if (r.includes(w)) p += 1; else return 0;
  }
  return p;
}

export function suchen(q, { neu = [], nav = [] } = {}) {
  const w = norm(q).split(/\s+/).filter(Boolean); if (!w.length) return [];
  const G = [];
  const gruppe = (name, arr, f, max = 5) => {
    const L = arr.map(x => { const e = f(x); return e && { ...e, p: punkte(w, e.t, e.r) }; }).filter(e => e && e.p).sort((a, b) => b.p - a.p).slice(0, max);
    if (L.length) G.push({ name, best: L[0].p, L });
  };
  gruppe('Befehle', [...neu.map(([k, l, fn]) => ({ t: 'Neu: ' + l.replace(/^\S+ /, ''), r: 'neu anlegen erstellen hinzufügen ' + k, i: l.split(' ')[0], fn })),
    ...nav.map(([k, l, i]) => ({ t: l, r: 'gehe zu öffnen ansicht ' + k, i, h: '#/' + k, s: 'Bereich öffnen' }))], x => x, 4);
  gruppe('Kontakte', db.all('contacts'), c => ({ t: fullName(c), r: [c.firma, c.email, c.tel, c.mobil, c.ort, c.tags, c.kategorie].join(' '), s: [c.kategorie, c.ort].filter(Boolean).join(' · ') + (c.status === 'Archiv' ? ' · Archiv' : ''), i: '☺', h: '#/kontakte/' + c.id, kg: c.id, tel: (c.mobil || c.tel || '').replace(/[^\d+]/g, '') }), 6);
  gruppe('Objekte', db.all('properties'), p => ({ t: p.titel || p.nr, r: [p.nr, p.ort, p.strasse, p.plz, p.art].join(' '), s: [p.nr, p.ort, p.status].filter(Boolean).join(' · '), i: '⌂', h: '#/objekte/' + p.id }));
  gruppe('Vorgänge', db.all('deals'), d => ({ t: d.titel || '', r: fullName(db.get('contacts', d.contactId) || {}), s: sl(d.stage), i: '▤', fn: () => dealForm(d) }), 4);
  gruppe('Aufgaben', db.all('tasks').filter(t => !t.done), t => ({ t: (t.titel || '').replace(/^⚡ /, ''), r: fullName(db.get('contacts', t.contactId) || {}), s: t.faellig ? 'fällig ' + fmtDate(t.faellig) : 'ohne Datum', i: '✓', fn: () => taskForm(t) }), 4);
  gruppe('Termine', db.all('events'), e => ({ t: e.titel || '', r: [e.ort, e.art, fullName(db.get('contacts', e.contactId) || {})].join(' '), s: `${fmtDateShort(e.datum)} ${e.start || ''}`, i: '▦', fn: () => eventForm(e) }), 4);
  gruppe('Mails', db.all('mails') || [], m => ({ t: m.betreff || '(ohne Betreff)', r: [m.vonName, m.vonAdresse].join(' '), s: [m.vonName || m.vonAdresse, fmtDateShort((m.datum || '').slice(0, 10))].filter(Boolean).join(' · '), i: '✉', h: '#/posteingang/' + m.id }), 4);
  gruppe('Belege & Rechnungen', [...(db.all('buchungen') || []), ...(db.all('rechnungen') || [])], b => ({ t: b.lieferant || b.beschreibung || b.nr || b.empfaenger || '', r: [b.beschreibung, b.kategorie, b.nr, String(b.brutto ?? '')].join(' '), s: [b.datum && fmtDate(b.datum), b.brutto != null ? String(b.brutto).replace('.', ',') + ' €' : '', b.kategorie].filter(Boolean).join(' · '), i: '€', h: '#/finanzen' }), 3);
  gruppe('Fahrten', (db.all('fahrten') || []).filter(f => f.status !== 'verworfen'), f => ({ t: f.zweck || f.ziel || f.ende?.adresse || '', r: [f.partner, f.ziel, f.ende?.adresse, f.start?.adresse].join(' '), s: [(f.start?.zeit || '').slice(0, 10).split('-').reverse().join('.'), f.partner].filter(Boolean).join(' · '), i: '⇆', h: '#/fahrten/fahrten' }), 3);
  // beste Gruppe zuerst (Befehle nur vorn, wenn sie wirklich am besten passen)
  return G.sort((a, b) => b.best - a.best);
}

function start({ neu = [] }) {
  const G = [], Z = zuletzt().map(k => { const [art, id] = k.split('/'); const x = db.get(art === 'kontakte' ? 'contacts' : 'properties', id); return x && { t: art === 'kontakte' ? fullName(x) : x.titel, s: art === 'kontakte' ? [x.kategorie, x.ort].filter(Boolean).join(' · ') : [x.nr, x.ort].filter(Boolean).join(' · '), i: art === 'kontakte' ? '☺' : '⌂', h: '#/' + k, kg: art === 'kontakte' ? id : '' }; }).filter(Boolean);
  if (Z.length) G.push({ name: 'Zuletzt geöffnet', L: Z });
  G.push({ name: 'Schnell anlegen', L: neu.slice(0, 6).map(([, l, fn]) => ({ t: l.replace(/^\S+ /, ''), i: l.split(' ')[0], fn })) });
  return G;
}

export function initBefehle(opt = {}) {
  const sq = document.getElementById('gsearch'), res = document.getElementById('gresults'); if (!sq || !res) return;
  let flach = [], aktiv = -1;
  const zeigen = G => {
    flach = G.flatMap(g => g.L); aktiv = sq.value.trim() ? 0 : -1; let n = 0;
    res.innerHTML = G.length ? G.map(g => `<div class="grh">${esc(g.name)}</div>` + g.L.map(e => { const i = n++; return `<div class="gr" data-i="${i}"><a ${e.h ? `href="${esc(e.h)}"` : 'href="#" data-fn'}><i>${esc(e.i || '')}</i><span>${esc(e.t)}<small>${esc(e.s || '')}</small></span></a>${e.tel ? `<a class="grt" href="tel:${esc(e.tel)}" title="Anrufen" aria-label="${esc(e.t)} anrufen">📞</a>` : ''}${e.kg ? `<button type="button" class="grk" data-kg="${esc(e.kg)}" title="Kontakt festhalten" aria-label="Kontakt mit ${esc(e.t)} festhalten">✓ Kontakt</button>` : ''}</div>`; }).join('')).join('')
      + '<div class="grfuss"><span>↑↓ wählen</span><span>↵ öffnen</span><span>Esc schließen</span></div>' : '<p class="muted pad">Keine Treffer – mit „+ Neu“ anlegen?</p>';
    res.hidden = false; markieren();
  };
  const markieren = () => res.querySelectorAll('.gr').forEach(r => { const an = Number(r.dataset.i) === aktiv; r.classList.toggle('akt', an); if (an) r.scrollIntoView({ block: 'nearest' }); });
  const suche = () => { const q = sq.value.trim(); if (q.length < 2) { if (document.activeElement === sq) zeigen(start(opt)); else res.hidden = true; return; } zeigen(suchen(q, opt)); };
  const zu = () => { res.hidden = true; sq.value = ''; };
  const ausfuehren = i => { const e = flach[i]; if (!e) return; zu(); sq.blur(); if (e.fn) e.fn(); else if (e.h) location.hash = e.h; };
  sq.oninput = debounce(suche, 90);
  sq.addEventListener('focus', () => { if (sq.value.trim().length < 2) zeigen(start(opt)); });
  sq.addEventListener('keydown', e => {
    if (res.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!flach.length) return; aktiv = (aktiv + (e.key === 'ArrowDown' ? 1 : -1) + flach.length) % flach.length; markieren(); }
    else if (e.key === 'Enter') { e.preventDefault(); ausfuehren(aktiv < 0 ? 0 : aktiv); }
  });
  res.addEventListener('click', e => {
    if (e.target.closest('.grfuss')) return;
    const fn = e.target.closest('a[data-fn]'); if (fn) { e.preventDefault(); ausfuehren(Number(fn.closest('.gr').dataset.i)); return; }
    if (e.target.closest('.gr')) zu();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) res.hidden = true; });
  document.addEventListener('keydown', e => {
    const tippt = e.target instanceof Element && (e.target.matches('input, textarea, select') || e.target.isContentEditable), modalOffen = !!document.querySelector('.modal-bg, .msheet-bg');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); sq.focus(); sq.select(); return; }
    if (e.key === 'Escape') { res.hidden = true; if (document.activeElement === sq) sq.blur(); return; }
    if (tippt || modalOffen || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); sq.focus(); }
    else if (e.key === 'n') { e.preventDefault(); document.getElementById('quick')?.click(); }
  });
  window.addEventListener('hashchange', merken); merken();
}
