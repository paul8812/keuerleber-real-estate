// Haptik & Bediengefühl: spürbare Rückmeldung (Android: Vibration, iPhone ab iOS 18: Taptic über einen
// versteckten Schalter), sofortige Druck-Zustände und weiche Ansichtswechsel.
// Zurückhaltend eingesetzt – nur bei wichtigen Aktionen (Speichern, Erledigt, Löschen, Umschalten, Tab-Wechsel, Ziehen zum Aktualisieren).

const touch = matchMedia('(hover:none)').matches || 'ontouchstart' in window;
const wenigBewegung = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Muster für navigator.vibrate (ms) und Anzahl der Taptic-Impulse auf dem iPhone
const STILE = {
  leicht: [8, 1],        // Tab-Wechsel, Auswahl, Menüpunkt
  auswahl: [6, 1],       // Chips, Umschalter
  mittel: [14, 1],       // Schwelle beim Wischen/Ziehen erreicht
  erfolg: [[10, 60, 14], 2],   // gespeichert, erledigt
  warnung: [[18, 80, 18], 2],  // löschen
  fehler: [[24, 60, 24, 60, 24], 3],
};

let schalter = null, letzte = 0;
function iosSchalter() {
  if (schalter) return schalter;
  // <input type="checkbox" switch> gibt es nur in Safari ab 17.4 – das Umschalten per Label-Klick löst die Taptic Engine aus (iOS 18+)
  const lbl = document.createElement('label');
  lbl.id = 'haptik'; lbl.setAttribute('aria-hidden', 'true'); lbl.style.display = 'none';
  const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
  lbl.appendChild(i);
  // die künstlichen Klicks nicht bis zu den App-Handlern durchreichen (z. B. „Menü schließen bei Klick daneben“)
  ['click', 'change', 'input'].forEach(ev => lbl.addEventListener(ev, e => e.stopPropagation()));
  document.body.appendChild(lbl);
  return (schalter = lbl);
}
const iosOk = () => /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent) && touch && !('vibrate' in navigator);

let aus = false;
try { aus = localStorage.getItem('kre-haptik') === 'aus'; } catch { /* egal */ }
/** Haptik am Gerät ein-/ausschalten (merkt sich das Gerät) */
export function haptikAn(an) { aus = !an; try { an ? localStorage.removeItem('kre-haptik') : localStorage.setItem('kre-haptik', 'aus'); } catch { /* egal */ } }

/** Spürbare Rückmeldung: haptik('leicht' | 'auswahl' | 'mittel' | 'erfolg' | 'warnung' | 'fehler') */
export function haptik(stil = 'leicht') {
  if (aus || !touch) return false;
  const now = performance.now(); if (now - letzte < 35) return false; letzte = now;
  const [muster, n] = STILE[stil] || STILE.leicht;
  window.__haptik && window.__haptik(stil);   // für den Prüfstand
  try {
    if (navigator.vibrate) return navigator.vibrate(muster);
    if (!iosOk()) return false;
    const s = iosSchalter();
    s.click(); for (let k = 1; k < n; k++) setTimeout(() => s.click(), k * 70);
    return true;
  } catch { return false; }
}

// ---------- Weiche Ansichtswechsel ----------
// Am Mac (Maus/Trackpad) mit View Transition. Auf Touch-Geräten nur dezentes Einblenden per CSS: Während einer View
// Transition landen Tipps und Wischgesten ~300 ms lang auf dem Overlay statt in der neuen Ansicht (gemessen) –
// wer schnell nach dem Tab-Wechsel tippt, würde ins Leere tippen.
let vt = null;
/** führt fn (das Neuzeichnen einer Ansicht) weich aus */
export function uebergang(fn, ziel) {
  if (wenigBewegung()) return fn();
  if (!touch && document.startViewTransition && !document.querySelector('.modal-bg, .msheet-bg')) {
    try { vt?.skipTransition(); const t = vt = document.startViewTransition(fn);
      t.ready.catch(() => {}); t.finished.catch(() => {}).then(() => { if (vt === t) vt = null; }); return; } catch { /* unten weiter */ }
  }
  fn();
  if (ziel) { ziel.classList.remove('einblenden'); void ziel.offsetWidth; ziel.classList.add('einblenden'); }
}

// ---------- Globale Rückmeldung ohne Eingriff in die Ansichten ----------
export function initHaptik() {
  // iOS zeigt :active nur, wenn irgendwo ein touchstart-Listener hängt → sofortige Druck-Zustände
  document.addEventListener('touchstart', () => {}, { passive: true });
  // ein Klick/Tastendruck während des Übergangs beendet ihn sofort
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => vt?.skipTransition(), true));
  if (!touch) return;
  document.addEventListener('click', e => {
    const t = e.target; if (!(t instanceof Element) || t.closest('#haptik')) return;
    if (t.closest('#tabbar a:not(.on), #tabbar button, #nav a')) return haptik('leicht');
    if (t.closest('.chip:not(.on), .seg button, .msheet [data-i]')) return haptik('auswahl');
    if (t.closest('[data-fdone]')) return haptik('erfolg');
  }, true);
  document.addEventListener('change', e => {
    const t = e.target; if (!(t instanceof HTMLInputElement) || t.closest('#haptik')) return;
    if (t.type !== 'checkbox' && t.type !== 'radio') return;
    haptik((t.matches('[data-done],[data-kdone]') && t.checked) ? 'erfolg' : 'auswahl');
  }, true);
}
