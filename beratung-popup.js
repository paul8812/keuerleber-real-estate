/* Beratungs-Popup: erscheint nach einigen Sekunden, einmal pro Sitzung.
   Sendet über Web3Forms (gleicher Zugang wie das Kontaktformular). */
(function () {
  'use strict';
  if (window.__kpBeratung) return;
  window.__kpBeratung = true;

  var FORM_URL = 'https://api.web3forms.com/submit';
  var FORM_KEY = '3fe8574f-a84d-49f3-96dc-0d8abf0975c8';
  var TEL = '+4915167692176', TEL_TXT = '+49 151 67692176';
  var DELAY = 12000;          // Verzögerung nach Ende des Intros
  var EXIT_AFTER = 6000;      // Exit-Intent erst nach dieser Zeit
  var SNOOZE_DAYS = 3, DONE_DAYS = 60;

  var T = {
    de: {
      eyebrow: 'Kostenfrei & unverbindlich',
      h: 'Kostenloses Beratungsgespräch vereinbaren',
      p: 'In 15 Minuten klären wir, ob eine Kapitalanlage in Hof zu Ihnen passt. Ohne Verkaufsdruck, ohne Käuferprovision.',
      name: 'Ihr Name', tel: 'Telefonnummer', zeit: 'Wann passt es Ihnen?',
      z: ['Egal, melden Sie sich', 'Vormittags', 'Nachmittags', 'Abends'],
      ok: 'Ich bin mit der Verarbeitung meiner Angaben zur Bearbeitung meiner Anfrage einverstanden. Mehr in der <a href="/#datenschutz" target="_blank" rel="noopener">Datenschutzerklärung</a>.',
      btn: 'Rückruf anfordern', send: 'Wird gesendet…',
      call: 'Lieber gleich sprechen?', cal: 'Termin im Kalender wählen →', close: 'Schließen', later: 'Nein danke',
      errTel: 'Bitte geben Sie Name und eine gültige Telefonnummer an.',
      errOk: 'Bitte bestätigen Sie die Einwilligung.',
      errNet: 'Das Senden hat nicht geklappt. Bitte rufen Sie uns an: ',
      thx: 'Vielen Dank', thxP: 'Wir rufen Sie werktags innerhalb von 24 Stunden zurück.'
    },
    en: {
      eyebrow: 'Free & non-binding',
      h: 'Book a free consultation',
      p: 'In 15 minutes we clarify whether an investment property in Hof suits you. No sales pressure, no buyer commission.',
      name: 'Your name', tel: 'Phone number', zeit: 'When suits you?',
      z: ['Any time, call me', 'Morning', 'Afternoon', 'Evening'],
      ok: 'I agree to my details being processed to handle my request. See the <a href="/#datenschutz" target="_blank" rel="noopener">privacy policy</a>.',
      btn: 'Request a call back', send: 'Sending…',
      call: 'Prefer to talk right away?', cal: 'Pick a time in the calendar →', close: 'Close', later: 'No thanks',
      errTel: 'Please enter your name and a valid phone number.',
      errOk: 'Please confirm your consent.',
      errNet: 'Sending failed. Please call us: ',
      thx: 'Thank you', thxP: 'We will call you back within 24 hours on working days.'
    },
    es: {
      eyebrow: 'Gratuito y sin compromiso',
      h: 'Reserve una consulta gratuita',
      p: 'En 15 minutos aclaramos si una inversión inmobiliaria en Hof es adecuada para usted. Sin presión de venta, sin comisión para el comprador.',
      name: 'Su nombre', tel: 'Teléfono', zeit: '¿Cuándo le viene bien?',
      z: ['Da igual, llámenme', 'Por la mañana', 'Por la tarde', 'Por la noche'],
      ok: 'Acepto el tratamiento de mis datos para gestionar mi solicitud. Más en la <a href="/#datenschutz" target="_blank" rel="noopener">política de privacidad</a>.',
      btn: 'Solicitar llamada', send: 'Enviando…',
      call: '¿Prefiere hablar ahora?', cal: 'Elegir cita en el calendario →', close: 'Cerrar', later: 'No, gracias',
      errTel: 'Indique su nombre y un teléfono válido.',
      errOk: 'Confirme su consentimiento.',
      errNet: 'No se pudo enviar. Llámenos: ',
      thx: 'Gracias', thxP: 'Le llamaremos en un plazo de 24 horas en días laborables.'
    }
  };
  /* Ereignisse für datenschutzfreundliche Statistik (Plausible/Umami), falls eingebunden */
  function track(n) { try { if (window.plausible) window.plausible(n); else if (window.umami && window.umami.track) window.umami.track(n); } catch (e) {} }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"],a[href*="wa.me"]');
    if (a) track(a.href.indexOf('tel:') === 0 ? 'Anruf-Klick' : 'WhatsApp-Klick');
  }, true);
  function L() { var l = (document.documentElement.lang || 'de').slice(0, 2); return T[l] || T.de; }

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function sess(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; }
  function fresh(k) { var t = parseInt(store(k) || '0', 10); return t && Date.now() < t; }
  function days(n) { return String(Date.now() + n * 864e5); }

  if (fresh('kp-ber-done') || fresh('kp-ber-snooze') || sess('kp-ber-shown') === '1') return;

  var CSS = '' +
    '#kpB{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.62);backdrop-filter:blur(3px);opacity:0;visibility:hidden;transition:opacity .35s,visibility .35s}' +
    '#kpB.on{opacity:1;visibility:visible}' +
    '#kpB .kpb-kb{position:relative;width:100%;max-width:460px;max-height:calc(100dvh - 32px);overflow:auto;background:linear-gradient(160deg,#17140e,#0c0b09);border:1px solid rgba(201,169,110,.35);border-radius:20px;padding:34px 30px 26px;color:#ede8e0;font-family:"Jost",-apple-system,"Helvetica Neue",sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.6);transform:translateY(18px) scale(.98);transition:transform .4s cubic-bezier(.2,.8,.2,1)}' +
    '#kpB.on .kpb-kb{transform:none}' +
    '#kpB .kpb-kx{position:absolute;top:10px;right:10px;width:38px;height:38px;border:0;border-radius:50%;background:none;color:#a29d93;font-size:22px;line-height:1;cursor:pointer}' +
    '#kpB .kpb-kx:hover{color:#fff;background:rgba(255,255,255,.06)}' +
    '#kpB .kpb-ke{font-size:11.5px;letter-spacing:.22em;text-transform:uppercase;color:#c9a96e;font-weight:500;margin:0 0 10px}' +
    '#kpB h2{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:clamp(27px,6.4vw,34px);line-height:1.12;color:#fff;margin:0 0 12px;padding-right:26px;letter-spacing:-.01em;text-wrap:balance}' +
    '#kpB .kpb-kp{font-size:15.5px;line-height:1.6;color:#b9b3a8;margin:0 0 20px}' +
    '#kpB input[type=text],#kpB input[type=tel],#kpB select{width:100%;box-sizing:border-box;background:#0a0a09;border:1px solid rgba(201,169,110,.25);border-radius:12px;color:#ede8e0;font:inherit;font-size:16px;padding:13px 14px;margin:0 0 10px;outline:0;appearance:none;-webkit-appearance:none}' +
    '#kpB select{background-image:linear-gradient(45deg,transparent 50%,#c9a96e 50%),linear-gradient(135deg,#c9a96e 50%,transparent 50%);background-position:calc(100% - 20px) 52%,calc(100% - 15px) 52%;background-size:5px 5px;background-repeat:no-repeat;padding-right:38px}' +
    '#kpB input:focus,#kpB select:focus{border-color:#c9a96e;box-shadow:0 0 0 3px rgba(201,169,110,.18)}' +
    '#kpB label.kl{display:block;font-size:12.5px;color:#a29d93;margin:2px 0 5px}' +
    '#kpB .kpb-kc{display:flex;gap:10px;align-items:flex-start;margin:6px 0 14px;font-size:12.5px;line-height:1.5;color:#a29d93}' +
    '#kpB .kpb-kc input{margin-top:3px;accent-color:#c9a96e;flex:none;width:17px;height:17px}' +
    '#kpB .kpb-kc a{color:#d9c08a}' +
    '#kpB .kpb-kg{width:100%;border:0;border-radius:99px;padding:15px 22px;font:inherit;font-weight:600;font-size:16px;color:#141210;background:linear-gradient(135deg,#d9c08a,#8a6d2e);cursor:pointer}' +
    '#kpB .kpb-kg:hover{filter:brightness(1.08)}#kpB .kpb-kg:disabled{opacity:.6;cursor:default}' +
    '#kpB .kpb-kh{min-height:18px;font-size:13px;margin:10px 0 0;color:#e0a07a}' +
    '#kpB .kpb-kt{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:.5px solid rgba(255,255,255,.08);font-size:13.5px;color:#a29d93}' +
    '#kpB .kpb-kt a{color:#d9c08a;text-decoration:none;font-weight:600;font-size:15px}' +
    '#kpB .kpb-kn{background:none;border:0;color:#a29d93;font:inherit;font-size:13px;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:6px 0}' +
    '#kpB .kpb-ko{text-align:center;padding:14px 0 6px}' +
    '#kpB .kpb-ko i{display:flex;align-items:center;justify-content:center;width:62px;height:62px;margin:0 auto 16px;border-radius:50%;border:1px solid rgba(201,169,110,.4);background:rgba(201,169,110,.1);color:#d9c08a;font-size:26px;font-style:normal}' +
    '#kpB .hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}' +
    '@media (prefers-reduced-motion:reduce){#kpB,#kpB .kpb-kb{transition:none}}' +
    '@media print{#kpB{display:none!important}}';

  var box, lastFocus, built = false, timer, opened = false;

  function build() {
    if (built) return; built = true;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    box = document.createElement('div'); box.id = 'kpB';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'kpBh');
    document.body.appendChild(box);
    box.addEventListener('click', function (e) { if (e.target === box) close(true); });
    document.addEventListener('keydown', function (e) {
      if (!opened) return;
      if (e.key === 'Escape') return close(true);
      if (e.key !== 'Tab') return;
      var f = box.querySelectorAll('button,input,select,a[href]');
      f = Array.prototype.filter.call(f, function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
  }

  function render() {
    var l = L();
    var opts = l.z.map(function (z, i) { return '<option value="' + z + '"' + (i ? '' : ' selected') + '>' + z + '</option>'; }).join('');
    box.innerHTML =
      '<div class="kpb-kb">' +
      '<button class="kpb-kx" type="button" aria-label="' + l.close + '">×</button>' +
      '<p class="kpb-ke">' + l.eyebrow + '</p>' +
      '<h2 id="kpBh">' + l.h + '</h2>' +
      '<p class="kpb-kp">' + l.p + '</p>' +
      '<form novalidate>' +
      '<input type="text" id="kpBn" name="name" autocomplete="name" placeholder="' + l.name + '" aria-label="' + l.name + '" required>' +
      '<input type="tel" id="kpBt" name="tel" autocomplete="tel" inputmode="tel" placeholder="' + l.tel + '" aria-label="' + l.tel + '" required>' +
      '<label class="kpb-kl" for="kpBz">' + l.zeit + '</label>' +
      '<select id="kpBz" name="zeit">' + opts + '</select>' +
      '<input class="hp" type="text" name="botcheck" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<label class="kpb-kc"><input type="checkbox" id="kpBo"><span>' + l.ok + '</span></label>' +
      '<button class="kpb-kg" type="submit">' + l.btn + '</button>' +
      '<p class="kpb-kh" role="status" aria-live="polite"></p>' +
      '</form>' +
      (typeof window.openBooking === 'function' ? '<button class="kpb-kn kpb-kcal" type="button" style="display:block;margin:12px auto 0;color:#d9c08a">' + l.cal + '</button>' : '') +
      '<div class="kpb-kt"><span>' + l.call + ' <a href="tel:' + TEL + '">' + TEL_TXT + '</a></span><button class="kpb-kn" type="button">' + l.later + '</button></div>' +
      '</div>';
    box.querySelector('.kpb-kx').onclick = function () { close(true); };
    box.querySelector('.kpb-kt .kpb-kn').onclick = function () { close(true); };
    var cal = box.querySelector('.kpb-kcal');
    if (cal) cal.onclick = function () { close(true); setTimeout(window.openBooking, 250); };
    box.querySelector('form').addEventListener('submit', submit);
  }

  function submit(e) {
    e.preventDefault();
    var l = L(), f = e.target, hint = f.querySelector('.kpb-kh'), btn = f.querySelector('.kpb-kg');
    var name = f.name.value.trim(), tel = f.tel.value.trim();
    hint.style.color = '#e0a07a';
    if (!name || tel.replace(/\D/g, '').length < 6) { hint.textContent = l.errTel; return; }
    if (!f.querySelector('#kpBo').checked) { hint.textContent = l.errOk; return; }
    if (f.botcheck.value) return;
    hint.textContent = ''; btn.disabled = true; btn.textContent = l.send;
    var zeit = f.zeit.value, seite = location.pathname;
    fetch(FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        access_key: FORM_KEY,
        subject: 'Beratungsgespräch-Anfrage (Popup): ' + name,
        from_name: 'Keuerleber Immobilien — Website',
        name: name,
        'Telefon': tel,
        'Wunschzeit': zeit,
        'Seite': seite,
        'Sprache': document.documentElement.lang || 'de',
        'Eingegangen am': new Date().toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' }),
        message: 'RÜCKRUF-WUNSCH — KOSTENLOSES BERATUNGSGESPRÄCH\n\nName: ' + name + '\nTelefon: ' + tel + '\nWunschzeit: ' + zeit + '\nSeite: ' + seite + '\n\nBitte zeitnah zurückrufen.',
        botcheck: ''
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || d.success === false) throw 0;
      store('kp-ber-done', days(DONE_DAYS)); track('Popup gesendet');
      box.querySelector('.kpb-kb').innerHTML =
        '<button class="kpb-kx" type="button" aria-label="' + l.close + '">×</button>' +
        '<div class="kpb-ko"><i>✓</i><h2 id="kpBh">' + l.thx + (name ? ', ' + name.split(' ')[0].replace(/[<>&"]/g, '') : '') + '!</h2><p class="kpb-kp">' + l.thxP + '</p></div>';
      box.querySelector('.kpb-kx').onclick = function () { close(false); };
      box.querySelector('.kpb-kx').focus();
      setTimeout(function () { close(false); }, 6000);
    }).catch(function () {
      btn.disabled = false; btn.textContent = l.btn;
      hint.innerHTML = l.errNet + '<a href="tel:' + TEL + '" style="color:#d9c08a">' + TEL_TXT + '</a>';
    });
  }

  function blocked() {
    var b = document.body;
    if (!b || document.documentElement.classList.contains('intro-lock')) return true;
    if (getComputedStyle(b).overflow === 'hidden') return true;            // anderes Modal offen
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;     // Besucher tippt gerade
    var k = document.getElementById('kontakt');
    if (k) { var r = k.getBoundingClientRect(); if (r.top < innerHeight * .8 && r.bottom > innerHeight * .2) return true; }
    return false;
  }

  function open() {
    if (opened) return;
    if (blocked()) { timer = setTimeout(open, 3000); return; }
    build(); render();
    lastFocus = document.activeElement; opened = true;
    sess('kp-ber-shown', '1'); track('Popup angezeigt');
    requestAnimationFrame(function () {
      box.classList.add('on');
      var n = box.querySelector('#kpBn'); if (n) n.focus({ preventScroll: true });
    });
  }

  function close(snooze) {
    if (!opened) return;
    opened = false; box.classList.remove('on');
    if (snooze) store('kp-ber-snooze', days(SNOOZE_DAYS));
    setTimeout(function () { if (box) box.innerHTML = ''; }, 400);
    try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }

  function start() {
    var t0 = Date.now();
    timer = setTimeout(open, DELAY);
    // Exit-Intent (nur Maus): Cursor verlässt das Fenster nach oben
    document.addEventListener('mouseout', function (e) {
      if (opened || sess('kp-ber-shown') === '1') return;
      if (!e.relatedTarget && e.clientY <= 0 && Date.now() - t0 > EXIT_AFTER) { clearTimeout(timer); open(); }
    });
  }

  function whenReady() {
    var h = document.documentElement;
    if (h.classList.contains('intro-lock')) { setTimeout(whenReady, 500); return; }
    start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', whenReady); else whenReady();
})();
