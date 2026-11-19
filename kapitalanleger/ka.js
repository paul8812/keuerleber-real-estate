/* Landingpage /kapitalanleger/: Anfrage in drei Schritten, Steuer-Rechner, Einblenden */
(function () {
  'use strict';
  var KEY = '3fe8574f-a84d-49f3-96dc-0d8abf0975c8', URL = 'https://api.web3forms.com/submit';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var eur = function (n) { return Math.round(n).toLocaleString('de-DE') + ' €'; };

  /* ---------- Steuer-Rechner ---------- */
  var kp = $('#kcKp'), st = $('#kcSt'), ga = $('#kcGa'), rechnung = null;
  function fuell(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); }
  function rechne() {
    var p = +kp.value, s = +st.value / 100, g = +ga.value / 100, geb = p * g;
    var hoch = geb * 0.0526 * s, norm = geb * 0.02 * s;
    $('#kcKpO').textContent = eur(p); $('#kcStO').textContent = st.value + ' %'; $('#kcGaO').textContent = ga.value + ' %';
    $('#kcBig').textContent = eur(hoch); $('#kcMon').textContent = 'das sind rund ' + eur(hoch / 12) + ' im Monat';
    $('#kcV1').textContent = eur(hoch); $('#kcV2').textContent = eur(norm);
    $('#kcB2').style.width = (norm / hoch * 100) + '%';
    $('#kcDiff').textContent = '+ ' + eur(hoch - norm);
    [kp, st, ga].forEach(fuell);
    rechnung = { kaufpreis: eur(p), steuersatz: st.value + ' %', gebaeudeanteil: ga.value + ' %', ersparnis: eur(hoch) + ' pro Jahr' };
  }
  if (kp) { [kp, st, ga].forEach(function (e) { e.addEventListener('input', rechne); }); rechne(); rechnung = null; }
  var angefasst = false;
  if (kp) [kp, st, ga].forEach(function (e) { e.addEventListener('input', function () { angefasst = true; }); });

  /* ---------- Anfrage ---------- */
  var f = $('#kaF'); if (!f) return;
  var schritt = 1, MAX = 3, err = $('#kaErr'), next = $('#kaNext'), back = $('#kaBack');
  function zeig(n, fokus) {
    schritt = n;
    f.querySelectorAll('.ka-step').forEach(function (x) { x.classList.toggle('on', +x.dataset.step === n); });
    $('#kaBar').style.width = (n / MAX * 100) + '%';
    $('#kaNr').textContent = 'Schritt ' + n + ' von ' + MAX;
    back.hidden = n === 1;
    next.textContent = n === MAX ? 'Beispielrechnung anfordern' : 'Weiter';
    err.textContent = '';
    if (fokus) { var el = $('.ka-step.on input:not(.hp)', f); if (el && n === MAX) el.focus({ preventScroll: true }); }
  }
  function wert(name) { var e = f.querySelector('input[name="' + name + '"]:checked'); return e ? e.value : ''; }
  function pruef() {
    if (schritt === 1 && !wert('ziel')) return 'Bitte wählen Sie eine Möglichkeit aus.';
    if (schritt === 2 && !wert('ek')) return 'Bitte wählen Sie Ihr Eigenkapital aus.';
    if (schritt === 2 && !wert('wann')) return 'Bitte wählen Sie aus, wann Sie kaufen möchten.';
    if (schritt === 3) {
      if (f.n.value.trim().length < 2) return 'Bitte geben Sie Ihren Namen an.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.m.value.trim())) return 'Bitte geben Sie eine gültige E-Mail-Adresse an.';
      if (!f.ok.checked) return 'Bitte bestätigen Sie die Einwilligung.';
    }
    return '';
  }
  /* Bei Schritt 1 direkt weiter, sobald eine Möglichkeit gewählt ist */
  f.querySelectorAll('input[name="ziel"]').forEach(function (r) {
    r.addEventListener('change', function () { if (schritt === 1) setTimeout(function () { zeig(2); }, 260); });
  });
  back.addEventListener('click', function () { if (schritt > 1) zeig(schritt - 1); });
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var m = pruef(); if (m) { err.textContent = m; return; }
    if (schritt < MAX) { zeig(schritt + 1, true); return; }
    if (f.bc.value) return;
    var n = f.n.value.trim(), mail = f.m.value.trim(), tel = f.t.value.trim();
    var zeilen = ['Ziel: ' + wert('ziel'), 'Eigenkapital: ' + wert('ek'), 'Kaufzeitpunkt: ' + wert('wann'), '', 'Name: ' + n, 'E-Mail: ' + mail, 'Telefon: ' + (tel || '—')];
    var d = { access_key: KEY, subject: 'Kapitalanleger-Anfrage: ' + n, from_name: 'Keuerleber Immobilien — Website', botcheck: '',
      name: n, email: mail, 'Telefon': tel || '—', 'Ziel': wert('ziel'), 'Eigenkapital': wert('ek'), 'Kaufzeitpunkt': wert('wann'), 'Seite': location.pathname };
    if (angefasst && rechnung) {
      d['Rechner'] = 'Kaufpreis ' + rechnung.kaufpreis + ', Steuersatz ' + rechnung.steuersatz + ', Gebäudeanteil ' + rechnung.gebaeudeanteil + ', Ersparnis ' + rechnung.ersparnis;
      zeilen.push('', 'Im Steuer-Rechner eingestellt: ' + d['Rechner']);
    }
    d.message = 'Anfrage über die Seite für Kapitalanleger.\n\n' + zeilen.join('\n');
    next.disabled = true; next.textContent = 'Wird gesendet…'; err.textContent = '';
    fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.success === false) throw 0;
        f.hidden = true; $('#kaDone').hidden = false;
        $('#anfrage').scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .catch(function () { next.disabled = false; next.textContent = 'Beispielrechnung anfordern'; err.textContent = 'Das Senden hat nicht geklappt. Bitte versuchen Sie es erneut oder rufen Sie an: 0151 67692176.'; });
  });
  zeig(1);

  /* ---------- Einblenden, Zahlen, Handy-Leiste ---------- */
  var red = false; try { red = matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}
  if ('IntersectionObserver' in window && !red) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); en.target.classList.add('in'); } });
    }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.rv').forEach(function (el, i) { el.style.transitionDelay = (i % 4 * 80) + 'ms'; io.observe(el); });
    var zo = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return; zo.unobserve(en.target);
        var el = en.target, roh = el.textContent, t = roh.split(/(\d+(?:,\d+)?)/), t0 = 0;
        var z = t.map(function (x, i) { return i % 2 ? { v: parseFloat(x.replace(',', '.')), d: (x.split(',')[1] || '').length } : null; });
        (function f2(now) { if (!t0) t0 = now; var p = Math.min(1, (now - t0) / 1300), e = 1 - Math.pow(1 - p, 3);
          el.textContent = t.map(function (x, i) { return z[i] ? (z[i].v * e).toFixed(z[i].d).replace('.', ',') : x; }).join('');
          if (p < 1) requestAnimationFrame(f2); else el.textContent = roh; })(performance.now());
      });
    }, { threshold: .6 });
    document.querySelectorAll('[data-zahl]').forEach(function (el) { zo.observe(el); });
  } else { document.querySelectorAll('.rv').forEach(function (el) { el.classList.add('in'); }); }
  var bar = $('#kaBarM'), form = $('#anfrage');
  if (bar && form && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { bar.classList.toggle('an', !es[0].isIntersecting); }, { threshold: 0 }).observe(form);
  }
})();
