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
import * as automation from './views/automation.js';
import * as inbox from './views/inbox.js';
import * as finanzen from './views/finanzen.js';
import * as auto from './automation.js';
import * as anfragen from './anfragen.js';
import { schnellerfassung } from './schnellerfassung.js';
import { initMobil } from './mobil.js';
import { initAktionen } from './aktionen.js';
import { initCrmPlus } from './crmplus.js';
import { belegeHochladen } from './views/finanzen.js';
function belegFoto() { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,application/pdf'; i.multiple = true; i.onchange = () => { if (i.files.length) { location.hash = '#/finanzen'; setTimeout(() => belegeHochladen(i.files), 300); } }; i.click(); }

const VIEWS = { dashboard, posteingang: inbox, kontakte: contacts, objekte: properties, pipeline, aufgaben: tasks, kalender: calendar, finanzen, vorlagen: templates, automation, rechner: calc, statistik: stats, einstellungen: settings };
const main = document.getElementById('main');

function route() {
  const [, name = 'dashboard', arg] = location.hash.split('/');
  const view = VIEWS[name] || dashboard;
  const key = VIEWS[name] ? name : 'dashboard';
  document.querySelectorAll('#nav a, #tabbar a').forEach(a => a.classList.toggle('on', a.dataset.k === key));
  navBadges();
  document.body.classList.remove('nav-open');
  const y = window.scrollY;
  try { view.render(main, arg); } catch (e) { console.error(e); main.innerHTML = `<div class="card"><h2>Fehler</h2><pre>${esc(e.stack || e.message)}</pre></div>`; }
  window.scrollTo(0, location.hash === window._lastHash ? y : 0); window._lastHash = location.hash;
}
function navBadges() {
  const a = document.querySelector('#nav a[data-k="posteingang"]'); if (!a) return;
  const n = inbox.newCount(); let b = a.querySelector('b.nb');
  if (!n) { b && b.remove(); return; }
  if (!b) { b = document.createElement('b'); b.className = 'nb'; a.appendChild(b); }
  b.textContent = n;
}
const rerender = debounce(() => { if (!document.querySelector('.modal-bg')) route(); else pending = true; }, 60);
let pending = false;
new MutationObserver(() => { if (pending && !document.querySelector('.modal-bg')) { pending = false; route(); } }).observe(document.getElementById('modal-root'), { childList: true });

function shell() {
  document.getElementById('nav').innerHTML = NAV.map(([k, l, ic]) => `<a href="#/${k}" data-k="${k}"><i>${ic}</i><span>${l}</span></a>`).join('');
  // Handy: Leiste unten mit den wichtigsten Bereichen
  if (!document.getElementById('tabbar')) {
    document.body.insertAdjacentHTML('beforeend', `<nav id="tabbar">${[['dashboard', '◧', 'Übersicht'], ['aufgaben', '✓', 'Aufgaben'], ['+', '+', 'Neu'], ['kalender', '▦', 'Kalender'], ['kontakte', '☺', 'Kontakte']].map(([k, i, l]) => k === '+' ? `<button type="button" data-tabneu><i>${i}</i><span>${l}</span></button>` : `<a href="#/${k}" data-k="${k}"><i>${i}</i><span>${l}</span></a>`).join('')}</nav>`);
    document.querySelector('[data-tabneu]').onclick = () => document.getElementById('quick').click();
  }
  document.getElementById('burger').onclick = e => { e.stopPropagation(); document.body.classList.toggle('nav-open'); };
  document.addEventListener('click', e => { if (document.body.classList.contains('nav-open') && !e.target.closest('#side')) document.body.classList.remove('nav-open'); });
  if (matchMedia('(max-width:700px)').matches) document.getElementById('gsearch').placeholder = 'Suchen …';
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && db.isCloud()) db.reload(); });
  document.getElementById('mode').textContent = db.isCloud() ? '☁ Cloud' : '💾 Lokal';
  if (!db.isCloud() && !document.getElementById('lokalhinweis')) main.insertAdjacentHTML('beforebegin', '<div id="lokalhinweis" class="lokalhinweis">💾 Dieses Gerät arbeitet im <b>lokalen Modus</b> – du siehst nicht die Daten aus der Cloud. <a href="?cloud=1">Zur Cloud wechseln und anmelden</a></div>');
  document.getElementById('quick').onclick = () => modal('Neu anlegen', html`<div class="full quickgrid">${[['anfrage', '📋 Anfrage einfügen'], ['contact', '☺ Kontakt'], ['property', '⌂ Objekt'], ['task', '✓ Aufgabe'], ['event', '▦ Termin'], ['note', '📝 Notiz'], ['call', '📞 Anruf festhalten'], ['beleg', '📷 Beleg fotografieren']].map(([k, l]) => html`<button type="button" class="btn big" data-k="${k}">${l}</button>`)}</div>`, {
    onMount: (el, close) => el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { close(); ({ anfrage: () => schnellerfassung(), contact: () => contactForm({}, c => location.hash = '#/kontakte/' + c.id), property: () => propertyForm({}, p => location.hash = '#/objekte/' + p.id), task: () => taskForm(), event: () => eventForm(), note: () => activityForm(), call: () => activityForm({ art: 'anruf' }), beleg: belegFoto })[b.dataset.k](); }) });
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
  db.onChange(rerender); db.onChange(navBadges);
  window.addEventListener('hashchange', route);
  window.addEventListener('focus', () => db.isCloud() && db.reload());
  route(); auto.start(); anfragen.start(); idleWatch(); initMobil(); initAktionen(); initCrmPlus();
}

async function boot() {
  const r = await db.init();
  if (db.RECOVERY || db.AUTH_ERROR) history.replaceState(null, '', location.pathname + location.search);
  if (r.needsLogin) return loginScreen({ mfa: r.needsMfa });
  if (db.isCloud() && abgelaufen()) { await db.logout(); return; }
  document.getElementById('login').hidden = true; document.getElementById('app').hidden = false; shell();
  if (db.RECOVERY) newPassword();
}
function newPassword() {
  modal('Neues Passwort festlegen', html`<p class="full muted">Du bist über den Link aus der E-Mail angemeldet. Lege jetzt dein neues Passwort fest (mind. 8 Zeichen).</p>
    ${inp('pw1', 'Neues Passwort', '', { type: 'password', req: 1, cls: 'full' })}${inp('pw2', 'Passwort wiederholen', '', { type: 'password', req: 1, cls: 'full' })}`, {
    saveLabel: 'Passwort speichern',
    onSave: async v => {
      if (v.pw1.length < 8) { toast('Mindestens 8 Zeichen', 'err'); return false; }
      if (v.pw1 !== v.pw2) { toast('Die Passwörter stimmen nicht überein', 'err'); return false; }
      try { await db.setPassword(v.pw1); toast('✓ Neues Passwort gespeichert'); } catch (e) { toast('Fehler: ' + e.message, 'err'); return false; }
    },
  });
}
// Automatisch abmelden nach Inaktivität (Einstellung „Mein Zugang“, Standard 60 Min.)
const LA = 'kre-last-active';
const idleMin = () => { const v = db.settings().autoLogoutMin; return v === 0 || v === '0' ? 0 : Number(v) || 60; };
function abgelaufen() { try { const t = Number(localStorage.getItem(LA)); return idleMin() > 0 && t && Date.now() - t > idleMin() * 60000; } catch { return false; } }
function aktiv() { try { localStorage.setItem(LA, String(Date.now())); } catch { /* egal */ } }
function idleWatch() {
  if (!db.isCloud()) return; aktiv(); let t = 0;
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, () => { if (Date.now() - t > 15000) { t = Date.now(); aktiv(); } }, { passive: true }));
  setInterval(() => { if (abgelaufen()) db.logout(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && abgelaufen()) db.logout(); });
}
function loginScreen({ mfa = false } = {}) {
  const box = document.getElementById('login'); box.hidden = false;
  const form = box.querySelector('form'), err = box.querySelector('.err'), btn = form.querySelector('button.primary'), tog = box.querySelector('[data-toggle]');
  let signup = false;
  const setMode = m => { signup = m; btn.textContent = m ? 'Konto erstellen' : 'Anmelden'; tog.textContent = m ? 'Schon ein Konto? Anmelden' : 'Erstes Mal? Konto erstellen'; err.textContent = ''; form.password.autocomplete = m ? 'new-password' : 'current-password'; };
  tog.onclick = e => { e.preventDefault(); setMode(!signup); };
  let mfaMode = false;
  const mfaStufe = () => { mfaMode = true; for (const n of ['email', 'password']) { form[n].hidden = true; form[n].required = false; } form.code.hidden = false; form.code.required = true; box.querySelector('.mfahint').hidden = false; btn.textContent = 'Bestätigen'; tog.hidden = true; box.querySelector('[data-forgot]').hidden = true; box.querySelector('[data-linkfix]').hidden = true; setTimeout(() => form.code.focus(), 50); };
  if (mfa) mfaStufe();
  if (db.AUTH_ERROR) err.textContent = db.AUTH_ERROR === 'otp_expired' ? 'Der Link aus der E-Mail ist abgelaufen oder wurde schon benutzt – bitte unten „Passwort vergessen?“ erneut klicken.' : 'Anmeldung über den Link fehlgeschlagen (' + db.AUTH_ERROR + ').';
  const lf = box.querySelector('.linkfix');
  box.querySelector('[data-linkfix]').onclick = e => { e.preventDefault(); lf.hidden = !lf.hidden; if (!lf.hidden) lf.querySelector('input').focus(); };
  lf.querySelector('input').addEventListener('input', e => {
    const v = e.target.value.trim(), frag = v.includes('#') ? v.slice(v.indexOf('#') + 1) : '';
    if (/access_token=/.test(frag)) { err.style.color = 'var(--ok)'; err.textContent = 'Link erkannt – einen Moment …'; location.hash = frag; location.reload(); }
    else if (/error_code=otp_expired/.test(v)) { err.style.color = ''; err.textContent = 'Dieser Link ist abgelaufen oder wurde schon benutzt – bitte „Passwort vergessen?“ erneut klicken und den neuen Link verwenden.'; }
    else if (v.length > 20) { err.style.color = ''; err.textContent = 'In dieser Adresse fehlt „#access_token=…“. Bitte die Adresse der Fehlerseite kopieren, nachdem du den Link angeklickt hast.'; }
  });
  box.querySelector('[data-forgot]').onclick = async e => {
    e.preventDefault(); err.style.color = '';
    const email = form.email.value.trim();
    if (!email) { err.textContent = 'Bitte oben zuerst deine E-Mail-Adresse eintragen, dann erneut klicken.'; form.email.focus(); return; }
    try { await db.resetPassword(email); err.style.color = 'var(--ok)'; err.textContent = `Falls ein Konto zu ${email} existiert, kommt gleich eine E-Mail mit einem Link. Link anklicken → neues Passwort festlegen.`; }
    catch (x) { err.textContent = /rate|seconds/i.test(x.message) ? 'Zu viele Versuche – bitte in ein paar Minuten erneut.' : 'Fehler: ' + x.message; }
  };
  const showSetup = () => {
    const sb = box.querySelector('.setup'); sb.hidden = false;
    sb.innerHTML = `<b>Einmalige Einrichtung der Datenbank</b><ol><li><a target="_blank" rel="noopener" href="${esc(db.SQL_URL())}">SQL-Editor in Supabase öffnen</a> (dort einloggen)</li><li><button type="button" class="btn" data-copy>SQL kopieren</button> und im Editor einfügen</li><li>Auf <b>Run</b> klicken, dann hier erneut anmelden</li></ol>`;
    sb.querySelector('[data-copy]').onclick = async () => { await navigator.clipboard.writeText(db.SETUP_SQL); toast('SQL kopiert'); };
  };
  form.onsubmit = async e => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try {
      if (mfaMode) { await db.mfaLogin(form.code.value); aktiv(); box.hidden = true; document.getElementById('app').hidden = false; shell(); if (db.RECOVERY) newPassword(); return; }
      const email = form.email.value.trim(), pw = form.password.value;
      if (signup) {
        if (pw.length < 8) throw new Error('Passwort mindestens 8 Zeichen');
        const r = await db.signup(email, pw);
        if (r === 'confirm') { err.style.color = 'var(--ok)'; err.textContent = 'Bestätigungs-E-Mail gesendet – Link klicken, dann hier anmelden.'; setMode(false); btn.disabled = false; return; }
      } else if (await db.login(email, pw) === 'mfa') { form.password.value = ''; mfaStufe(); btn.disabled = false; return; }
      aktiv(); box.hidden = true; document.getElementById('app').hidden = false; shell();
    } catch (x) {
      err.style.color = ''; const m = x.message || String(x);
      if (/records|relation|schema cache|does not exist/i.test(m)) { err.textContent = 'Datenbank-Tabelle fehlt noch.'; showSetup(); }
      else err.textContent = /invalid login credentials/i.test(m) ? 'E-Mail oder Passwort falsch.' : (signup ? 'Registrierung fehlgeschlagen: ' : 'Anmeldung fehlgeschlagen: ') + m;
      btn.disabled = false;
    }
  };
  box.querySelector('[data-local]').onclick = () => { if (confirm('Cloud-Verbindung trennen und lokal arbeiten?')) { db.setCfg({ off: true }); location.reload(); } };
}
boot();
if ('serviceWorker' in navigator && location.protocol === 'https:') { /* bewusst kein SW: Daten sind live */ }
