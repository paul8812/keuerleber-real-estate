/* Landingpage /kapitalanleger/: Eignungs-Check, Steuer-Rechner, E-Mail-Anfrage, Umschalter */
(function () {
  'use strict';
  var KEY = '3fe8574f-a84d-49f3-96dc-0d8abf0975c8', URL = 'https://api.web3forms.com/submit';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var eur = function (n) { return Math.round(n).toLocaleString('de-DE') + ' €'; };
  var MAILOK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  function senden(d) {
    d.access_key = KEY; d.from_name = 'Keuerleber Immobilien — Website'; d.botcheck = ''; d['Seite'] = location.pathname;
    return fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j && j.success === false) throw 0; });
  }

  /* ---------- Steuer-Rechner ---------- */
  var kp = $('#kcKp'), st = $('#kcSt'), ga = $('#kcGa'), angefasst = false, rechner = '';
  function rechne() {
    var p = +kp.value, s = +st.value / 100, g = +ga.value / 100, hoch = p * g * 0.0526 * s, norm = p * g * 0.02 * s;
    $('#kcKpO').textContent = eur(p); $('#kcStO').textContent = st.value + ' %'; $('#kcGaO').textContent = ga.value + ' %';
    $('#kcBig').textContent = '+ ' + eur(hoch); $('#kcMon').textContent = 'rund ' + eur(hoch / 12) + ' im Monat';
    $('#kcV1').textContent = eur(hoch); $('#kcV2').textContent = eur(norm);
    $('#kcB2').style.height = (norm / hoch * 100) + '%';
    $('#kcDiff').textContent = '+ ' + eur(hoch - norm);
    [kp, st, ga].forEach(function (el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); });
    rechner = 'Kaufpreis ' + eur(p) + ', Steuersatz ' + st.value + ' %, Gebäudeanteil ' + ga.value + ' %, Ersparnis ' + eur(hoch) + ' pro Jahr';
  }
  if (kp) { [kp, st, ga].forEach(function (e) { e.addEventListener('input', function () { angefasst = true; rechne(); }); }); rechne(); }

  /* ---------- Umschalter: Referenz, Leistungen, „In Kürze“ ---------- */
  $$('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      $$('.tabp').forEach(function (p) { p.classList.toggle('on', p.dataset.p === b.dataset.tab); });
    });
  });
  var SVC = [
    ['Objektauswahl', 'Wir schlagen Ihnen eine Wohnung vor, die zu Ihren Zielen, Ihrem Eigenkapital und Ihrer Steuersituation passt, in Lagen mit stabiler Mietnachfrage, geprüft auf Substanz und Mietniveau.', 'ankauf'],
    ['Kernsanierung', 'Unser Partner Norderfranken saniert die Häuser vor dem Verkauf vollständig: Leitungen, Elektrik, Heizung, Bäder, Böden und Fenster. Sie kaufen eine bezugsfertige Wohnung mit dokumentierter Sanierung.', 'sanierung'],
    ['Gutachten für die AfA', 'Ein vereidigter Sachverständiger ermittelt für jedes Objekt die Restnutzungsdauer. Daraus kann sich eine Abschreibung von bis zu 5,26 % pro Jahr ergeben. Ob sie anerkannt wird, entscheidet Ihr Finanzamt.', 'gutachten'],
    ['Finanzierung', 'Sie finanzieren mit Ihrer eigenen Bank oder auf Wunsch mit unseren Partnern. Wir stellen die Unterlagen zum Objekt bereit und rechnen vorab mit Ihnen durch, was monatlich übrig bleibt. Die Bank entscheidet.', 'beratung'],
    ['Notar und Abwicklung', 'Wir begleiten Sie durch Reservierung, Kaufvertrag und Notartermin bis zur Schlüsselübergabe. Sie haben dabei einen Ansprechpartner für alle Fragen.', 'beratung'],
    ['Vermietung und Verwaltung', 'Viele Wohnungen sind bereits vermietet oder werden auf Wunsch für Sie vermietet, inklusive Anbindung an eine Hausverwaltung.', 'vermietung']
  ];
  $$('.svc-list button').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.dataset.s, d = SVC[i];
      $$('.svc-list button').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      $('#svcNr').textContent = '0' + (i + 1); $('#svcH').textContent = d[0]; $('#svcP').textContent = d[1];
      $('#svcImg').src = '/bilder/leistung-' + d[2] + '-800.webp';
    });
  });
  var ft = $('#factsT');
  if (ft) ft.addEventListener('click', function () {
    var an = $('#facts').classList.toggle('all'); ft.setAttribute('aria-expanded', an);
    ft.textContent = an ? 'Weniger zeigen' : 'Alle acht Punkte zeigen';
  });

  /* ---------- Beispielrechnung per E-Mail ---------- */
  $$('.mailf').forEach(function (f) {
    var h = $('.mailf-h', f), b = $('button', f), txt = b.textContent;
    f.addEventListener('submit', function (e) {
      e.preventDefault(); h.className = 'mailf-h';
      var m = f.m.value.trim();
      if (!MAILOK.test(m)) { h.textContent = 'Bitte geben Sie eine gültige E-Mail-Adresse an.'; f.m.focus(); return; }
      if (f.bc.value) return;
      b.disabled = true; b.textContent = 'Wird gesendet…'; h.textContent = '';
      var d = { subject: 'Beispielrechnung per E-Mail angefordert: ' + m, name: m, email: m,
        message: 'Beispielrechnung per E-Mail angefordert (Seite für Kapitalanleger).\n\nE-Mail: ' + m + (angefasst ? '\nIm Steuer-Rechner eingestellt: ' + rechner : '') };
      if (angefasst) d['Rechner'] = rechner;
      senden(d).then(function () { f.m.value = ''; b.textContent = 'Angefordert'; h.className = 'mailf-h ok'; h.textContent = 'Danke. Die Beispielrechnung kommt werktags innerhalb von 24 Stunden per E-Mail.'; })
        .catch(function () { b.disabled = false; b.textContent = txt; h.textContent = 'Das Senden hat nicht geklappt. Bitte versuchen Sie es erneut.'; });
    });
  });

  /* ---------- Eignung prüfen ---------- */
  var dlg = $('#eignung'), f = $('#kaF');
  if (dlg && f) {
    var schritt = 1, MAX = 4, err = $('#kaErr'), next = $('#kaNext'), back = $('#kaBack');
    var zeig = function (n) {
      schritt = n;
      $$('.step', f).forEach(function (x) { x.classList.toggle('on', +x.dataset.step === n); });
      $('#kaBar').style.width = (n / MAX * 100) + '%';
      $('#kaNr').textContent = 'Schritt ' + n + ' von ' + MAX;
      back.hidden = n === 1; next.textContent = n === MAX ? 'Ergebnis anfordern' : 'Weiter'; err.textContent = '';
    };
    var wert = function (name) { var e = f.querySelector('input[name="' + name + '"]:checked'); return e ? e.value : ''; };
    var pruef = function () {
      if (schritt === 1 && !wert('ziel')) return 'Bitte wählen Sie eine Möglichkeit aus.';
      if (schritt === 2 && !wert('eink')) return 'Bitte wählen Sie eine Möglichkeit aus.';
      if (schritt === 3 && !wert('ek')) return 'Bitte wählen Sie Ihr Eigenkapital aus.';
      if (schritt === 3 && !wert('wann')) return 'Bitte wählen Sie aus, wann Sie kaufen möchten.';
      if (schritt === 4) {
        if (f.n.value.trim().length < 2) return 'Bitte geben Sie Ihren Namen an.';
        if (!MAILOK.test(f.m.value.trim())) return 'Bitte geben Sie eine gültige E-Mail-Adresse an.';
        if (!f.ok.checked) return 'Bitte bestätigen Sie die Einwilligung.';
      }
      return '';
    };
    var auf = function (e) {
      if (e) e.preventDefault();
      if (dlg.open) return;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    };
    $$('[data-eignung]').forEach(function (a) { a.addEventListener('click', auf); });
    if (location.hash === '#eignung') auf();
    $('#dlgX').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    /* Bei Fragen mit nur einer Auswahl direkt weiter */
    ['ziel', 'eink'].forEach(function (nm, i) {
      $$('input[name="' + nm + '"]', f).forEach(function (r) {
        r.addEventListener('change', function () { if (schritt === i + 1) setTimeout(function () { if (schritt === i + 1) zeig(i + 2); }, 260); });
      });
    });
    back.addEventListener('click', function () { if (schritt > 1) zeig(schritt - 1); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var m = pruef(); if (m) { err.textContent = m; return; }
      if (schritt < MAX) { zeig(schritt + 1); return; }
      if (f.bc.value) return;
      var n = f.n.value.trim(), mail = f.m.value.trim(), tel = f.t.value.trim();
      var z = ['Ziel: ' + wert('ziel'), 'Bruttoeinkommen im Jahr: ' + wert('eink'), 'Eigenkapital: ' + wert('ek'), 'Kaufzeitpunkt: ' + wert('wann'), '', 'Name: ' + n, 'E-Mail: ' + mail, 'Telefon: ' + (tel || '—')];
      var d = { subject: 'Eignungs-Check Kapitalanlage: ' + n, name: n, email: mail, 'Telefon': tel || '—',
        'Ziel': wert('ziel'), 'Bruttoeinkommen': wert('eink'), 'Eigenkapital': wert('ek'), 'Kaufzeitpunkt': wert('wann') };
      if (angefasst) { d['Rechner'] = rechner; z.push('', 'Im Steuer-Rechner eingestellt: ' + rechner); }
      d.message = 'Eignungs-Check über die Seite für Kapitalanleger.\n\n' + z.join('\n');
      next.disabled = true; next.textContent = 'Wird gesendet…'; err.textContent = '';
      senden(d).then(function () { f.hidden = true; $('#kaDone').hidden = false; })
        .catch(function () { next.disabled = false; next.textContent = 'Ergebnis anfordern'; err.textContent = 'Das Senden hat nicht geklappt. Bitte versuchen Sie es erneut oder rufen Sie an: 0151 67692176.'; });
    });
    zeig(1);
  }

  /* ---------- Einblenden, Handy-Leiste ---------- */
  var red = false; try { red = matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}
  if ('IntersectionObserver' in window && !red) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); en.target.classList.add('in'); } });
    }, { threshold: .1, rootMargin: '0px 0px -5% 0px' });
    $$('.rv').forEach(function (el) { io.observe(el); });
    $$('.route li').forEach(function (el, i) { el.style.transitionDelay = (i * 70) + 'ms'; });
  } else { $$('.rv').forEach(function (el) { el.classList.add('in'); }); }
  /* Wisch-Leisten am Handy: schmaler Fortschrittsbalken darunter */
  $$('.facts, .route ol').forEach(function (el) {
    var t = document.createElement('div'); t.className = 'snapbar'; t.innerHTML = '<i></i>'; el.parentNode.insertBefore(t, el.nextSibling);
    var i = t.firstChild, upd = function () {
      var max = el.scrollWidth - el.clientWidth; if (max <= 0) return;
      var w = Math.max(14, el.clientWidth / el.scrollWidth * 100);
      i.style.width = w + '%'; i.style.left = (el.scrollLeft / max * (100 - w)) + '%';
    };
    el.addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
  });
  /* Kennzahlen oben hochzählen */
  if (!red) $$('.hero-stats b').forEach(function (el) {
    var roh = el.textContent, m = roh.match(/^(\d+(?:,\d+)?)(.*)$/); if (!m) return;
    var ziel = parseFloat(m[1].replace(',', '.')), nk = (m[1].split(',')[1] || '').length, t0 = 0;
    (function f2(now) { if (!t0) t0 = now; var p = Math.min(1, (now - t0 - 350) / 1100); if (p < 0) p = 0; var e = 1 - Math.pow(1 - p, 3);
      el.textContent = (ziel * e).toFixed(nk).replace('.', ',') + m[2];
      if (p < 1) requestAnimationFrame(f2); else el.textContent = roh; })(performance.now());
  });
  var bar = $('#kaBarM'), hero = $('.hero .btn.big');
  if (bar && hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { bar.classList.toggle('an', !es[0].isIntersecting); }, { threshold: 0 }).observe(hero);
  }
})();
