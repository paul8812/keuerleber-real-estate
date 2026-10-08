import * as db from './db.js';
import { html, esc, debounce, fullName, toast, modal, inp } from './util.js';
import { NAV } from './consts.js';
import { contactForm, propertyForm, taskForm, eventForm, activityForm } from './forms.js';
import * as dashboard from './views/dashboard.js';
import * as contacts from './views/contacts.js';
import * as properties from './views/properties.js';
import * as pipeline from './views/pipeline.js';
import * as tasks from './views/tasks.js';
import * as calendar from './views/calendar.js';
import * as templates from './views/templates.js';
import * as calc from './views/calc.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';

const VIEWS = { dashboard, kontakte: contacts, objekte: properties, pipeline, aufgaben: tasks, kalender: calendar, vorlagen: templates, rechner: calc, statistik: stats, einstellungen: settings };
const main = document.getElementById('main');

function route() {
  const [, name = 'dashboard', arg] = location.hash.split('/');
  const view = VIEWS[name] || dashboard;
  const key = VIEWS[name] ? name : 'dashboard';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.k === key));
  document.body.classList.remove('nav-open');
  const y = window.scrollY;
  try { view.render(main, arg); } catch (e) { console.error(e); main.innerHTML = `<div class="card"><h2>Fehler</h2><pre>${esc(e.stack || e.message)}</pre></div>`; }
  window.scrollTo(0, location.hash === window._lastHash ? y : 0); window._lastHash = location.hash;
}
const rerender = debounce(() => { if (!document.querySelector('.modal-bg')) route(); else pending = true; }, 60);
let pending = false;
new MutationObserver(() => { if (pending && !document.querySelector('.modal-bg')) { pending = false; route(); } }).observe(document.getElementById('modal-root'), { childList: true });

function shell() {
  document.getElementById('nav').innerHTML = NAV.map(([k, l, ic]) => `<a href="#/${k}" data-k="${k}"><i>${ic}</i><span>${l}</span></a>`).join('');
  document.getElementById('burger').onclick = () => document.body.classList.toggle('nav-open');
  document.getElementById('mode').textContent = db.isCloud() ? '☁ Cloud' : '💾 Lokal';
  document.getElementById('quick').onclick = () => modal('Neu anlegen', html`<div class="full quickgrid">${[['contact', '☺ Kontakt'], ['property', '⌂ Objekt'], ['task', '✓ Aufgabe'], ['event', '▦ Termin'], ['note', '📝 Notiz / Anruf']].map(([k, l]) => html`<button type="button" class="btn big" data-k="${k}">${l}</button>`)}</div>`, {
    onMount: (el, close) => el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { close(); ({ contact: () => contactForm({}, c => location.hash = '#/kontakte/' + c.id), property: () => propertyForm({}, p => location.hash = '#/objekte/' + p.id), task: () => taskForm(), event: () => eventForm(), note: () => activityForm() })[b.dataset.k](); }) });
  // globale Suche
  const sq = document.getElementById('gsearch'), res = document.getElementById('gresults');
  const search = () => {
    const q = sq.value.trim().toLowerCase(); if (q.length < 2) { res.hidden = true; return; }
    const hit = (arr, f) => arr.filter(x => f(x).toLowerCase().includes(q)).slice(0, 5);
    const C = hit(db.all('contacts'), c => [fullName(c), c.firma, c.email, c.tel, c.mobil, c.ort].join(' ')), P = hit(db.all('properties'), p => [p.titel, p.nr, p.ort, p.strasse].join(' ')), D = hit(db.all('deals'), d => d.titel || ''), T = hit(db.all('tasks'), t => t.titel || '');
    const row = (h, ic, t, s) => `<a href="${h}"><i>${ic}</i><span>${esc(t)}<small>${esc(s || '')}</small></span></a>`;
    const out = [...C.map(c => row('#/kontakte/' + c.id, '☺', fullName(c), c.kategorie + (c.ort ? ' · ' + c.ort : ''))), ...P.map(p => row('#/objekte/' + p.id, '⌂', p.titel, `${p.nr} · ${p.ort || ''}`)), ...D.map(d => row('#/pipeline', '▤', d.titel, d.stage)), ...T.map(t => row('#/aufgaben', '✓', t.titel, t.faellig || ''))];
    res.innerHTML = out.join('') || '<p class="muted pad">Keine Treffer</p>'; res.hidden = false;
  };
  sq.oninput = debounce(search, 120);
  res.onclick = () => { res.hidden = true; sq.value = ''; };
  document.addEventListener('click', e => { if (!e.target.closest('.search')) res.hidden = true; });
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); sq.focus(); sq.select(); } if (e.key === 'Escape') { res.hidden = true; sq.blur(); } });
  db.onChange(rerender);
  window.addEventListener('hashchange', route);
  window.addEventListener('focus', () => db.isCloud() && db.reload());
  route();
}

async function boot() {
  const r = await db.init();
  if (r.needsLogin) return loginScreen();
  document.getElementById('login').hidden = true; document.getElementById('app').hidden = false; shell();
}
function loginScreen() {
  const box = document.getElementById('login'); box.hidden = false;
  const form = box.querySelector('form'), err = box.querySelector('.err'), btn = form.querySelector('button.primary'), tog = box.querySelector('[data-toggle]');
  let signup = false;
  const setMode = m => { signup = m; btn.textContent = m ? 'Konto erstellen' : 'Anmelden'; tog.textContent = m ? 'Schon ein Konto? Anmelden' : 'Erstes Mal? Konto erstellen'; err.textContent = ''; form.password.autocomplete = m ? 'new-password' : 'current-password'; };
  tog.onclick = e => { e.preventDefault(); setMode(!signup); };
  const showSetup = () => {
    const sb = box.querySelector('.setup'); sb.hidden = false;
    sb.innerHTML = `<b>Einmalige Einrichtung der Datenbank</b><ol><li><a target="_blank" rel="noopener" href="${esc(db.SQL_URL())}">SQL-Editor in Supabase öffnen</a> (dort einloggen)</li><li><button type="button" class="btn" data-copy>SQL kopieren</button> und im Editor einfügen</li><li>Auf <b>Run</b> klicken, dann hier erneut anmelden</li></ol>`;
    sb.querySelector('[data-copy]').onclick = async () => { await navigator.clipboard.writeText(db.SETUP_SQL); toast('SQL kopiert'); };
  };
  form.onsubmit = async e => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try {
      const email = form.email.value.trim(), pw = form.password.value;
      if (signup) {
        if (pw.length < 8) throw new Error('Passwort mindestens 8 Zeichen');
        const r = await db.signup(email, pw);
        if (r === 'confirm') { err.style.color = 'var(--ok)'; err.textContent = 'Bestätigungs-E-Mail gesendet – Link klicken, dann hier anmelden.'; setMode(false); btn.disabled = false; return; }
      } else await db.login(email, pw);
      box.hidden = true; document.getElementById('app').hidden = false; shell();
    } catch (x) {
      err.style.color = ''; const m = x.message || String(x);
      if (/records|relation|schema cache|does not exist/i.test(m)) { err.textContent = 'Datenbank-Tabelle fehlt noch.'; showSetup(); }
      else err.textContent = (signup ? 'Registrierung fehlgeschlagen: ' : 'Anmeldung fehlgeschlagen: ') + m;
      btn.disabled = false;
    }
  };
  box.querySelector('[data-local]').onclick = () => { if (confirm('Cloud-Verbindung trennen und lokal arbeiten?')) { db.setCfg({ off: true }); location.reload(); } };
}
boot();
if ('serviceWorker' in navigator && location.protocol === 'https:') { /* bewusst kein SW: Daten sind live */ }
