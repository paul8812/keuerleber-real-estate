/* Cookie- und Speicher-Hinweis für alle öffentlichen Seiten.
   Notwendiges läuft immer (Sprache, Merker fürs Popup). Statistik wird erst NACH Zustimmung geladen.
   Messkennung hier eintragen (oder auf der Startseite KRE_GA_ID): leer = es wird nichts geladen. */
(function () {
  'use strict';
  if (window.__kpConsent) return; window.__kpConsent = true;
  var GA_ID = '';            /* Google Analytics 4, z. B. G-XXXXXXXXXX */
  var PLAUSIBLE = '';        /* Plausible-Domain, z. B. keuerleber-immobilien.de */
  var KEY = 'kp-consent', VERSION = 1;

  var T = {
    de: { t: 'Ihre Privatsphäre', p: 'Wir speichern nur, was die Seite braucht (z. B. Ihre Sprache). Optional würden wir gern anonym auswerten, welche Seiten gelesen werden. Ohne Ihre Zustimmung wird nichts davon geladen. Mehr in der <a href="/#datenschutz">Datenschutzerklärung</a>.',
      no: 'Nur notwendige', set: 'Einstellungen', yes: 'Alle akzeptieren', save: 'Auswahl speichern', need: 'Notwendig', needP: 'Sprache, Merker für dieses Fenster, Formularversand. Immer aktiv.', stat: 'Statistik', statP: 'Anonyme Reichweitenmessung. Hilft uns zu sehen, welche Inhalte gelesen werden.', link: 'Cookie-Einstellungen' },
    en: { t: 'Your privacy', p: 'We only store what the site needs (e.g. your language). Optionally we would like to count anonymously which pages are read. Nothing of this is loaded without your consent. More in the <a href="/#datenschutz">privacy policy</a>.',
      no: 'Necessary only', set: 'Settings', yes: 'Accept all', save: 'Save selection', need: 'Necessary', needP: 'Language, reminders for this window, form submission. Always active.', stat: 'Statistics', statP: 'Anonymous audience measurement. Helps us see which content is read.', link: 'Cookie settings' },
    es: { t: 'Su privacidad', p: 'Solo guardamos lo que el sitio necesita (p. ej. su idioma). Opcionalmente nos gustaría contar de forma anónima qué páginas se leen. Sin su consentimiento no se carga nada de esto. Más en la <a href="/#datenschutz">política de privacidad</a>.',
      no: 'Solo necesarias', set: 'Ajustes', yes: 'Aceptar todo', save: 'Guardar selección', need: 'Necesarias', needP: 'Idioma, recordatorios de esta ventana, envío de formularios. Siempre activas.', stat: 'Estadística', statP: 'Medición anónima de audiencia. Nos ayuda a ver qué contenido se lee.', link: 'Ajustes de cookies' }
  };
  function L() { var l = (document.documentElement.lang || 'de').slice(0, 2); return T[l] || T.de; }
  function read() { try { var c = JSON.parse(localStorage.getItem(KEY)); return c && c.v === VERSION ? c : null; } catch (e) { return null; } }
  function write(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

  var loaded = false;
  function ga() { return GA_ID || window.KRE_GA_ID || ''; }
  function load() {
    if (loaded) return; loaded = true;
    var id = ga();
    if (id) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
      var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id); document.head.appendChild(s);
      window.gtag('js', new Date()); window.gtag('config', id, { anonymize_ip: true });
    }
    if (PLAUSIBLE) { var p = document.createElement('script'); p.defer = true; p.setAttribute('data-domain', PLAUSIBLE); p.src = 'https://plausible.io/js/script.js'; document.head.appendChild(p); }
  }
  function unload() {
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (/^_ga|^_gid|^_gat/.test(n)) {
        document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.' + location.hostname;
      }
    });
    if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
  }

  var CSS = '#kpC{position:fixed;left:16px;bottom:16px;z-index:1500;width:min(440px,calc(100vw - 32px));background:#0e0d0a;border:1px solid rgba(201,169,110,.32);border-radius:18px;padding:20px 20px 16px;color:#ede8e0;font:14px/1.55 "Jost",-apple-system,"Helvetica Neue",sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.6);transform:translateY(16px);opacity:0;visibility:hidden;transition:opacity .35s,transform .35s,visibility .35s}' +
    '#kpC.on{opacity:1;transform:none;visibility:visible}' +
    '#kpC b.t{display:block;font:600 22px/1.1 "Cormorant Garamond",Georgia,serif;color:#fff;margin:0 0 8px}' +
    '#kpC p{margin:0 0 14px;color:#b9b3a8;font-size:13.5px}#kpC a{color:#d9c08a}' +
    '#kpC .r{display:flex;gap:8px;flex-wrap:wrap}#kpC button{flex:1 1 auto;font:600 13.5px "Jost",sans-serif;padding:11px 14px;border-radius:99px;cursor:pointer;border:1px solid rgba(201,169,110,.45);background:none;color:#ede8e0;white-space:nowrap}' +
    '#kpC button:hover,#kpC button:focus-visible{background:rgba(201,169,110,.14);outline:0}#kpC button.y{background:linear-gradient(135deg,#d9c08a,#8a6d2e);color:#141210;border-color:transparent}' +
    '#kpC .o{border-top:.5px solid rgba(255,255,255,.1);margin:0 0 14px;padding-top:10px}#kpC label{display:flex;gap:12px;align-items:flex-start;padding:8px 0;cursor:pointer}' +
    '#kpC label input{margin-top:4px;accent-color:#c9a96e;width:17px;height:17px;flex:none}#kpC label span{font-size:13px;color:#b9b3a8}#kpC label span b{display:block;color:#fff;font-size:14px}' +
    '@media(max-width:520px){#kpC{left:10px;right:10px;bottom:10px;width:auto}}@media (prefers-reduced-motion:reduce){#kpC{transition:none}}@media print{#kpC{display:none!important}}';

  var box;
  function build(openSettings) {
    var l = L(), c = read() || {};
    if (!box) { var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); box = document.createElement('div'); box.id = 'kpC'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', l.t); document.body.appendChild(box); }
    box.innerHTML = '<b class="t">' + l.t + '</b><p>' + l.p + '</p>' +
      '<div class="o" ' + (openSettings ? '' : 'hidden') + '><label><input type="checkbox" checked disabled><span><b>' + l.need + '</b>' + l.needP + '</span></label>' +
      '<label><input type="checkbox" id="kpCs"' + (c.stat ? ' checked' : '') + '><span><b>' + l.stat + '</b>' + l.statP + '</span></label></div>' +
      '<div class="r"><button type="button" data-a="no">' + l.no + '</button>' + (openSettings ? '<button type="button" data-a="save">' + l.save + '</button>' : '<button type="button" data-a="set">' + l.set + '</button>') + '<button type="button" class="y" data-a="yes">' + l.yes + '</button></div>';
    box.querySelectorAll('[data-a]').forEach(function (b) { b.onclick = function () { act(b.dataset.a); }; });
    requestAnimationFrame(function () { box.classList.add('on'); });
  }
  function act(a) {
    if (a === 'set') { build(true); return; }
    var stat = a === 'yes' ? true : a === 'save' ? !!box.querySelector('#kpCs').checked : false;
    var prev = read();
    write({ v: VERSION, stat: stat, ts: Date.now() });
    box.classList.remove('on');
    if (stat) load(); else if (prev && prev.stat) { unload(); }
  }
  function open() { build(true); }
  window.kpConsent = { open: open, has: function (k) { var c = read(); return !!(c && c[k]); } };
  window.ckOeffnen = open;                       /* alter Footer-Link der Startseite */
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-kp-cookies]'); if (a) { e.preventDefault(); open(); } });

  function start() {
    var c = read();
    if (c) { if (c.stat) load(); return; }
    if (window.gtag === undefined && ga()) { window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' }); }
    (function wait() { if (document.documentElement.classList.contains('intro-lock')) return setTimeout(wait, 400); setTimeout(function () { build(false); }, 700); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
