// Handy-Bedienung: Aktionsmenü, Wischgesten, Ziehen zum Aktualisieren, Bottom-Sheets.
// Alles hier greift nur auf Touch-Geräten bzw. schmalen Bildschirmen – am Mac bleibt alles wie gehabt.
import * as db from './db.js';
import { toast, addDays, today, esc } from './util.js';
import { completeTask } from './views/tasks.js';
import { haptik } from './haptik.js';

const schmal = () => matchMedia('(max-width:700px)').matches;
const touch = matchMedia('(hover:none)').matches || 'ontouchstart' in window;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const modalOffen = () => !!document.querySelector('#modal-root .modal-bg:not(.zu), .msheet-bg:not(.weg)');
const wenigBewegung = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- ⋯ Aktionsmenü: Nebenaktionen im Kopf wandern in ein Menü ----------
function aktionen(main) {
  if (!schmal()) return;
  const bar = main.querySelector(':scope > .head > .actions, :scope > div > .head > .actions');
  if (!bar || bar.dataset.mob) return;
  bar.dataset.mob = '1';
  const alle = [...bar.children].filter(x => x.matches('.btn'));
  const akt = bar.querySelector('[data-akt]');
  const neben = alle.filter(x => x !== akt && !x.matches('.primary') && !x.matches('a[href^="tel:"],a[href^="mailto:"],a[href*="wa.me"]'));
  if (akt) { neben.forEach(x => x.classList.add('inmenu')); akt.textContent = '⋯'; akt.classList.add('mehrbtn'); return; }  // eigenes Aktionsmenü enthält alles
  if (alle.length <= 3 || neben.length < 2) return;
  neben.forEach(x => x.classList.add('inmenu'));
  const mehr = document.createElement('button'); mehr.type = 'button'; mehr.className = 'btn mehrbtn'; mehr.setAttribute('aria-label', 'Weitere Aktionen'); mehr.textContent = '⋯';
  bar.insertBefore(mehr, bar.firstChild);
  mehr.onclick = () => sheet(neben.map(x => [x.textContent.trim(), () => x.click(), x.matches('.danger')]));
}
export function sheet(items, titel = '') {
  const bg = document.createElement('div'); bg.className = 'msheet-bg';
  const top = items.map((x, i) => [x, i]).filter(([x]) => x[3]), rest = items.map((x, i) => [x, i]).filter(([x]) => !x[3]);
  const kachel = ([[l], i]) => { const m = l.match(/^(\S+)\s+(.*)$/) || [, '', l]; return `<button type="button" data-i="${i}"><i>${esc(m[1])}</i><span>${esc(m[2])}</span></button>`; };
  bg.innerHTML = `<div class="msheet" role="menu"><div class="mgroup">${titel ? `<p class="msheet-t">${esc(titel)}</p>` : ''}${top.length ? `<div class="mtop">${top.map(kachel).join('')}</div>` : ''}${rest.map(([[l, , d], i]) => `<button type="button" class="${d ? 'danger' : ''}" data-i="${i}">${esc(l)}</button>`).join('')}</div><button type="button" class="abbr" data-x>Abbrechen</button></div>`;
  const zu = () => { bg.classList.add('weg'); const m = bg.firstElementChild; m.style.transform = ''; m.style.transition = ''; setTimeout(() => bg.remove(), 200); };
  bg.onclick = e => {
    if (e.target === bg || e.target.closest('[data-x]')) return zu();
    const b = e.target.closest('[data-i]'); if (!b) return;
    zu(); items[+b.dataset.i][1]();   // synchron im Tipp – sonst blockt iOS z. B. die Dateiauswahl
  };
  document.body.appendChild(bg); requestAnimationFrame(() => bg.classList.add('da'));
  // nach unten ziehen = schließen (wie die Aktionsblätter in iOS)
  const m = bg.firstElementChild;
  if (touch) swipe(bg, {
    achse: 'y', accept: (dx, dy) => dy > 0 && m.scrollTop <= 0,
    start: e => !!e.target.closest('.msheet'),
    onMove: (dx, dy) => { m.style.transition = 'none'; m.style.transform = `translateY(${Math.max(0, dy)}px)`; },
    onEnd: (dx, dy) => { if (dy > 80) { haptik('leicht'); zu(); } else { m.style.transition = ''; m.style.transform = ''; } },
  });
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

// ---------- Tab-Leiste: nochmal auf den aktiven Tab tippen = nach oben ----------
function tabLeiste() {
  document.addEventListener('click', e => {
    const a = e.target instanceof Element && e.target.closest('#tabbar a.on'); if (!a) return;
    if (location.hash === a.getAttribute('href') && window.scrollY > 0) { e.preventDefault(); haptik('leicht'); window.scrollTo({ top: 0, behavior: wenigBewegung() ? 'auto' : 'smooth' }); }
  });
}

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

// ---------- Wischen in Listen (wie in Mail/Erinnerungen): Unterlage mit Aktion, Haptik an der Schwelle, Rückgängig ----------
// Start auch auf Links (z. B. Kontaktname in der Zeile) – ein Wisch löst dort keinen Klick aus.
const SCHWELLE = 88;
function listenWisch(main, { zeile, rechts, links }) {
  let li = null, unter = null, scharf = '';
  const aufraeumen = el => { unter?.remove(); unter = null; if (!el) return; el.classList.remove('wischt'); setTimeout(() => { el.style.transition = ''; el.style.transform = ''; }, 230); };
  swipe(main, {
    start: e => { li = e.target.closest(zeile); if (!li || e.target.closest('input,button,select,textarea')) return (li = null, false); return !!(rechts(li) || links(li)); },
    accept: dx => !!(dx > 0 ? rechts(li) : links(li)),
    onMove: dx => {
      const r = rechts(li), l = links(li), akt = dx > 0 ? r : l;
      if (!akt) dx = 0;
      if (!unter) {   // Unterlage hinter der Zeile (im selben Listen-Element, damit sie mitscrollt)
        const ul = li.parentElement; if (getComputedStyle(ul).position === 'static') ul.style.position = 'relative';
        unter = document.createElement('div'); unter.className = 'wischunter'; unter.setAttribute('aria-hidden', 'true');
        unter.innerHTML = `<span class="wl">${esc(r?.label || '')}</span><span class="wr">${esc(l?.label || '')}</span>`;
        Object.assign(unter.style, { top: li.offsetTop + 'px', height: li.offsetHeight + 'px' });
        ul.insertBefore(unter, li); li.classList.add('wischt'); scharf = '';
      }
      // Gummiband hinter der Schwelle
      const w = Math.abs(dx), d = Math.sign(dx) * (w < SCHWELLE ? w : SCHWELLE + (w - SCHWELLE) * .35);
      li.style.transform = `translateX(${d}px)`;
      unter.dataset.seite = dx > 0 ? 'r' : dx < 0 ? 'l' : '';
      unter.style.setProperty('--farbe', akt?.farbe || 'transparent');
      const neu = w >= SCHWELLE && akt ? (dx > 0 ? 'r' : 'l') : '';
      if (neu !== scharf) { scharf = neu; unter.classList.toggle('scharf', !!neu); if (neu) haptik('mittel'); }
    },
    onEnd: async dx => {
      const el = li; li = null; if (!el) return;
      const akt = scharf ? (scharf === 'r' ? rechts(el) : links(el)) : null; scharf = '';
      el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
      if (!akt) { el.style.transform = ''; aufraeumen(el); return; }
      haptik('erfolg');
      el.style.transform = `translateX(${dx > 0 ? '' : '-'}110%)`;
      await new Promise(r => setTimeout(r, wenigBewegung() ? 0 : 180));
      const u = unter; unter = null;
      try { await akt.tun(); } catch (e) { console.error(e); toast('Das hat nicht geklappt', 'err'); el.style.transform = ''; }
      u?.remove(); el.classList.remove('wischt');
    },
  });
}

// Aufgaben: nach rechts = erledigt, nach links = auf morgen – jeweils mit „Rückgängig“
function aufgabeVon(li) { const id = li.querySelector('[data-done]')?.dataset.done; return id && db.get('tasks', id); }
async function aufgabeErledigen(t) {
  const vorher = { ...t }, seit = new Date(Date.now() - 1000).toISOString();
  await completeTask(t, true, true);
  // was das Erledigen nebenbei angelegt hat (nächste Wiederholung, Verlaufseintrag) – fürs Rückgängigmachen merken
  const neu = col => db.all(col).filter(r => r.id !== t.id && (r.created || '') >= seit);
  const folge = neu('tasks').filter(x => x.titel === t.titel && !x.done).map(x => x.id);
  const verlauf = neu('activities').filter(a => (a.text || '').includes(t.titel || '\u0000')).map(a => a.id);
  toast('✓ Erledigt', '', { label: 'Rückgängig', fn: async () => {
    for (const id of folge) await db.del('tasks', id);
    for (const id of verlauf) await db.del('activities', id);
    await db.save('tasks', vorher); toast('Wieder offen');
  } });
}
async function aufgabeMorgen(t) {
  const vorher = { ...t };
  await db.save('tasks', { ...t, faellig: addDays(today(), 1) });
  toast('⏭ Auf morgen verschoben', '', { label: 'Rückgängig', fn: () => db.save('tasks', vorher) });
}
function aufgabenWisch(main) {
  listenWisch(main, {
    zeile: 'li.task:not(.done)',
    rechts: li => aufgabeVon(li) && { label: '✓ Erledigt', farbe: 'var(--ok)', tun: () => aufgabeErledigen(aufgabeVon(li)) },
    links: li => aufgabeVon(li) && { label: 'Morgen ⏭', farbe: 'var(--gold)', tun: () => aufgabeMorgen(aufgabeVon(li)) },
  });
}

// Posteingang: nach rechts = erledigt, nach links = ignorieren (nur neue Mails) – mit „Rückgängig“
function mailWisch(main) {
  const mail = li => { const m = db.get('mails', li.dataset.m); return m && m.status === 'neu' ? m : null; };
  const setzen = async (m, status, text) => {
    const vorher = { ...m };
    await db.save('mails', { ...m, status });
    toast(text, '', { label: 'Rückgängig', fn: () => db.save('mails', vorher) });
  };
  listenWisch(main, {
    zeile: 'ul.mails li[data-m]',
    rechts: li => mail(li) && { label: '✓ Erledigt', farbe: 'var(--ok)', tun: () => setzen(mail(li), 'erledigt', '✓ Als erledigt markiert') },
    links: li => mail(li) && { label: 'Ignorieren ⌫', farbe: '#6b6459', tun: () => setzen(mail(li), 'ignoriert', 'Ignoriert') },
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

// Bottom-Sheet nach unten ziehen = schließen: am Griff/Kopf oder im Inhalt, wenn der schon ganz oben ist
function sheetWisch() {
  const root = document.getElementById('modal-root'); let m = null, bg = null, t0 = 0;
  swipe(root, {
    achse: 'y', accept: (dx, dy) => dy > 0 && !!m && (m.querySelector('.mbody')?.scrollTop || 0) <= 0,
    start: e => {
      if (!schmal()) return false;
      m = e.target.closest('.modal'); if (!m || m.closest('.zu')) return false;
      bg = m.parentElement; t0 = performance.now();
      if (e.target.closest('.modal > header')) return true;
      // im Inhalt nur, wenn nicht gerade in einem Eingabefeld oder einem seitlich scrollenden Bereich
      return !e.target.closest('input,textarea,select,[contenteditable],.chips,.gallery,.kanban,.tbl') && (m.querySelector('.mbody')?.scrollTop || 0) <= 0;
    },
    onMove: (dx, dy) => {
      if (dy <= 0) return; const d = dy < 40 ? dy : 40 + (dy - 40) * .85;
      m.style.transition = 'none'; m.style.transform = `translateY(${d}px)`;
      bg.style.setProperty('--zieh', Math.max(0, 1 - d / (m.offsetHeight || 600)).toFixed(3));
    },
    onEnd: (dx, dy) => {
      const el = m, b = bg; m = bg = null; if (!el) return;
      const schnell = dy > 40 && dy / Math.max(1, performance.now() - t0) > .6;
      if (dy > 110 || schnell) { haptik('leicht'); el.querySelector('[data-close], [data-n]')?.click(); return; }
      el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; b?.style.removeProperty('--zieh');
      setTimeout(() => { el.style.transition = ''; }, 240);
    },
  });
}

// Ganz oben nach unten ziehen = Daten neu laden
function ziehenZumLaden(main) {
  const ind = document.createElement('div'); ind.id = 'ptr'; ind.innerHTML = '<span>↓</span>'; document.body.appendChild(ind);
  swipe(document, {
    achse: 'y', accept: (dx, dy) => dy > 0,
    start: e => window.scrollY <= 0 && !modalOffen() && !document.body.classList.contains('nav-open') && !e.target.closest('.kanban,.wochecard,.chips,.gallery,textarea'),
    onMove: (dx, dy) => { if (dy <= 0) return; const d = Math.min(dy * .5, 90); ind.style.transform = `translateY(${d}px)`; ind.style.opacity = Math.min(1, d / 60); const war = ind.classList.contains('bereit'); ind.classList.toggle('bereit', d >= 60); if (!war && d >= 60) haptik('mittel'); },
    onEnd: async (dx, dy) => {
      const los = ind.classList.contains('bereit'); ind.classList.remove('bereit');
      if (!los) { ind.style.transform = ''; ind.style.opacity = 0; return; }
      ind.classList.add('laedt');
      try { if (db.isCloud()) await db.reload(); else window.dispatchEvent(new HashChangeEvent('hashchange')); haptik('erfolg'); toast('✓ Aktualisiert'); }
      catch (e) { toast('Aktualisieren fehlgeschlagen', 'err'); }
      ind.classList.remove('laedt'); ind.style.transform = ''; ind.style.opacity = 0;
    },
  });
}

export function initMobil() {
  const main = document.getElementById('main');
  let rf = 0; new MutationObserver(() => { cancelAnimationFrame(rf); rf = requestAnimationFrame(() => nachRender(main)); }).observe(main, { childList: true, subtree: true });
  nachRender(main);
  tabLeiste();
  if (!touch) return;
  document.documentElement.classList.add('touch');
  aufgabenWisch(main); mailWisch(main); kalenderWisch(main); menueWisch(); sheetWisch(); ziehenZumLaden(main);
}
