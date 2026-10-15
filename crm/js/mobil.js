// Handy-Bedienung: Aktionsmenü, Wischgesten, Ziehen zum Aktualisieren, Bottom-Sheets.
// Alles hier greift nur auf Touch-Geräten bzw. schmalen Bildschirmen – am Mac bleibt alles wie gehabt.
import * as db from './db.js';
import { toast, addDays, today, esc } from './util.js';
import { completeTask } from './views/tasks.js';

const schmal = () => matchMedia('(max-width:700px)').matches;
const touch = matchMedia('(hover:none)').matches || 'ontouchstart' in window;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const modalOffen = () => !!document.querySelector('#modal-root .modal-bg, .msheet-bg');

// ---------- ⋯ Aktionsmenü: Nebenaktionen im Kopf wandern in ein Menü ----------
function aktionen(main) {
  if (!schmal()) return;
  const bar = main.querySelector(':scope > .head > .actions, :scope > div > .head > .actions');
  if (!bar || bar.dataset.mob) return;
  bar.dataset.mob = '1';
  const alle = [...bar.children].filter(x => x.matches('.btn'));
  const neben = alle.filter(x => !x.matches('.primary') && !x.matches('a[href^="tel:"],a[href^="mailto:"],a[href*="wa.me"]'));
  if (alle.length <= 3 || neben.length < 2) return;
  neben.forEach(x => x.classList.add('inmenu'));
  const mehr = document.createElement('button'); mehr.type = 'button'; mehr.className = 'btn mehrbtn'; mehr.setAttribute('aria-label', 'Weitere Aktionen'); mehr.textContent = '⋯';
  bar.insertBefore(mehr, bar.firstChild);
  mehr.onclick = () => sheet(neben.map(x => [x.textContent.trim(), () => x.click(), x.matches('.danger')]));
}
export function sheet(items, titel = '') {
  const bg = document.createElement('div'); bg.className = 'msheet-bg';
  bg.innerHTML = `<div class="msheet" role="menu">${titel ? `<p class="msheet-t">${esc(titel)}</p>` : ''}${items.map(([l, , d], i) => `<button type="button" class="${d ? 'danger' : ''}" data-i="${i}">${esc(l)}</button>`).join('')}<button type="button" class="abbr" data-x>Abbrechen</button></div>`;
  const zu = () => { bg.classList.add('weg'); setTimeout(() => bg.remove(), 180); };
  bg.onclick = e => {
    if (e.target === bg || e.target.closest('[data-x]')) return zu();
    const b = e.target.closest('[data-i]'); if (!b) return;
    zu(); items[+b.dataset.i][1]();   // synchron im Tipp – sonst blockt iOS z. B. die Dateiauswahl
  };
  document.body.appendChild(bg); requestAnimationFrame(() => bg.classList.add('da'));
}

// ---------- Leere Karten im Dashboard zusammenklappen ----------
function leereKarten(main) {
  main.querySelectorAll('section.card').forEach(s => {
    const kids = [...s.children].filter(k => k.tagName !== 'H2');
    s.classList.toggle('leer', kids.length === 1 && kids[0].classList.contains('empty'));
  });
}

// ---------- Woche: heute in den sichtbaren Bereich ----------
function wocheHeute(main) {
  const w = main.querySelector('.wochecard'); if (!w || w.dataset.mob) return; w.dataset.mob = '1';
  const h = w.querySelector('.wtag.heute'); if (h && schmal()) w.scrollLeft = Math.max(0, h.offsetLeft - 40);
}

function nachRender(main) { aktionen(main); leereKarten(main); wocheHeute(main); }

// ---------- Gesten ----------
function swipe(el, { onMove, onEnd, achse = 'x', start, accept }) {
  let x0, y0, dx = 0, dy = 0, lock = null, aktiv = false;
  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0]; if (start && !start(e, t)) return;
    x0 = t.clientX; y0 = t.clientY; dx = dy = 0; lock = null; aktiv = true;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (!aktiv) return; const t = e.touches[0]; dx = t.clientX - x0; dy = t.clientY - y0;
    if (!lock && Math.hypot(dx, dy) > 10) { lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; if (lock === achse && accept && !accept(dx, dy)) { aktiv = false; return; } }
    if (lock === achse) { if (e.cancelable) e.preventDefault(); onMove && onMove(dx, dy, e); }
    else if (lock) aktiv = false;
  }, { passive: false });
  const ende = () => { if (aktiv && lock === achse) onEnd(dx, dy); else if (aktiv && lock === null) onEnd(0, 0); aktiv = false; };
  el.addEventListener('touchend', ende); el.addEventListener('touchcancel', () => { if (aktiv && lock === achse) onEnd(0, 0); aktiv = false; });
}

// Aufgabe nach rechts wischen = erledigt, nach links = auf morgen
function aufgabenWisch(main) {
  let li = null;
  swipe(main, {
    start: (e) => { li = e.target.closest('li.task:not(.done)'); return !!li && !e.target.closest('input,a,button'); },
    onMove: dx => { const d = Math.max(-140, Math.min(140, dx)); li.style.transform = `translateX(${d}px)`; li.classList.toggle('sw-r', d > 50); li.classList.toggle('sw-l', d < -50); },
    onEnd: async dx => {
      const el = li; if (!el) return; li = null;
      const id = el.querySelector('[data-done]')?.dataset.done, t = id && db.get('tasks', id);
      el.style.transition = 'transform .2s';
      if (t && dx > 90) { el.style.transform = 'translateX(110%)'; await new Promise(r => setTimeout(r, 160)); await completeTask(t, true); return; }
      if (t && dx < -90) { el.style.transform = 'translateX(-110%)'; await new Promise(r => setTimeout(r, 160)); await db.save('tasks', { ...t, faellig: addDays(today(), 1) }); toast('⏭ Auf morgen verschoben'); return; }
      el.style.transform = ''; el.classList.remove('sw-r', 'sw-l'); setTimeout(() => { el.style.transition = ''; }, 220);
    },
  });
}

// Kalender: wischen = vor/zurück (nicht in der Wochenansicht, die scrollt selbst seitlich)
function kalenderWisch(main) {
  swipe(main, {
    start: e => !!e.target.closest('.cal, .ctag') && !!main.querySelector('.calnav') && !e.target.closest('.wochecard'),
    onEnd: dx => { if (Math.abs(dx) > 70) main.querySelector(`.calnav [data-${dx < 0 ? 'n' : 'p'}]`)?.click(); },
  });
}

// Menü per Wisch vom linken Rand öffnen (nur als App – im Safari ist das die Zurück-Geste) und nach links schließen
function menueWisch() {
  if (standalone) swipe(document, { start: (e, t) => t.clientX < 22 && !modalOffen() && !document.body.classList.contains('nav-open'), onEnd: dx => { if (dx > 60) document.body.classList.add('nav-open'); } });
  const side = document.getElementById('side');
  if (side) swipe(side, { onMove: dx => { if (dx < 0) side.style.transform = `translateX(${dx}px)`; }, onEnd: dx => { side.style.transform = ''; if (dx < -60) document.body.classList.remove('nav-open'); } });
}

// Bottom-Sheet am Griff nach unten ziehen = schließen
function sheetWisch() {
  const root = document.getElementById('modal-root'); let m = null;
  swipe(root, {
    achse: 'y', accept: (dx, dy) => dy > 0,
    start: e => { m = e.target.closest('.modal'); return !!m && !!e.target.closest('.modal > header') && schmal(); },
    onMove: (dx, dy) => { if (dy > 0) m.style.transform = `translateY(${dy}px)`; },
    onEnd: (dx, dy) => { const el = m; if (!el) return; if (dy > 110) el.querySelector('[data-close]')?.click(); else { el.style.transition = 'transform .2s'; el.style.transform = ''; setTimeout(() => el.style.transition = '', 220); } },
  });
}

// Ganz oben nach unten ziehen = Daten neu laden
function ziehenZumLaden(main) {
  const ind = document.createElement('div'); ind.id = 'ptr'; ind.innerHTML = '<span>↓</span>'; document.body.appendChild(ind);
  swipe(document, {
    achse: 'y', accept: (dx, dy) => dy > 0,
    start: e => window.scrollY <= 0 && !modalOffen() && !document.body.classList.contains('nav-open') && !e.target.closest('.kanban,.wochecard,.chips,.gallery,textarea'),
    onMove: (dx, dy) => { if (dy <= 0) return; const d = Math.min(dy * .5, 90); ind.style.transform = `translateY(${d}px)`; ind.style.opacity = Math.min(1, d / 60); ind.classList.toggle('bereit', d >= 60); },
    onEnd: async (dx, dy) => {
      const los = ind.classList.contains('bereit'); ind.classList.remove('bereit');
      if (!los) { ind.style.transform = ''; ind.style.opacity = 0; return; }
      ind.classList.add('laedt');
      try { if (db.isCloud()) await db.reload(); else window.dispatchEvent(new HashChangeEvent('hashchange')); toast('✓ Aktualisiert'); }
      catch (e) { toast('Aktualisieren fehlgeschlagen', 'err'); }
      ind.classList.remove('laedt'); ind.style.transform = ''; ind.style.opacity = 0;
    },
  });
}

export function initMobil() {
  const main = document.getElementById('main');
  let rf = 0; new MutationObserver(() => { cancelAnimationFrame(rf); rf = requestAnimationFrame(() => nachRender(main)); }).observe(main, { childList: true, subtree: true });
  nachRender(main);
  if (!touch) return;
  document.documentElement.classList.add('touch');
  aufgabenWisch(main); kalenderWisch(main); menueWisch(); sheetWisch(); ziehenZumLaden(main);
}
