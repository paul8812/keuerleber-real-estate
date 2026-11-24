/* Projektseite Theodor-Körner-Straße – Daten, Freischaltung (Lead-Gate), Vorher/Nachher, Karte.
   ─────────────────────────────────────────────────────────────────────────────────────────────
   HIER PFLEGEN: Alles, was leer ist (''), wird auf der Seite einfach nicht angezeigt.
   So erscheinen keine Platzhalter öffentlich, solange die Angabe fehlt.                       */
var PROJEKT = {
  ort: 'Theodor-Körner-Straße · Hof',           // Kopfzeile im Startbild
  adresse: '',            // PLATZHALTER: z. B. 'Theodor-Körner-Straße 12, 95030 Hof'
  bezug: '',              // PLATZHALTER: z. B. 'Frühjahr 2027' → Kachel „Bezug“
  energie: '',            // PLATZHALTER: z. B. 'Effizienzklasse C' → Kachel „Energie“
  heizung: '',            // PLATZHALTER: z. B. 'Wärmepumpe' → Kachel „Heizung“
  stellplatz: '',         // PLATZHALTER: z. B. 'Stellplatz im Hof optional' → Kachel „Stellplatz“
  terminLink: '',         // PLATZHALTER: z. B. Calendly-Link; leer = Sprung zum Kontaktbereich
  karte: null,            // PLATZHALTER: { lat: 50.31, lon: 11.91 } → Karte mit Markierung; null = Suche auf OpenStreetMap
  lage: [],               // PLATZHALTER: z. B. ['Bushaltestelle 3 Gehminuten', 'Supermarkt 5 Min.', 'Grundschule 600 m']
  telefonPflicht: false,  // true = Telefonnummer im Formular verpflichtend
  freischaltTage: 90,     // so lange bleibt die Freischaltung im Browser gespeichert
  /* Status: '' (keine Anzeige) | 'frei' | 'reserviert' | 'verkauft' | 'vermietet'
     Preis/Miete: Text, z. B. 'Kaufpreis 189.000 €' oder 'Kaltmiete 590 €'; '' = keine Anzeige.
     Die Zahl „Noch X von 6 verfügbar“ erscheint erst, wenn alle sechs einen Status haben. */
  wohnungen: {
    '01': { status: '', preis: '' },
    '02': { status: '', preis: '' },
    '03': { status: '', preis: '' },
    '04': { status: '', preis: '' },
    '05': { status: '', preis: '' },
    '06': { status: '', preis: '' }
  }
};
/* Feste Daten laut Grundriss (PlanKult, 03.11.2026) */
var WE = [
  { id: '01', etage: 'Erdgeschoss', m2: '60,65', balkon: '9,93', keller: '9,86' },
  { id: '02', etage: 'Erdgeschoss', m2: '58,99', balkon: '6,63', keller: '10,38' },
  { id: '03', etage: 'Obergeschoss', m2: '60,65', balkon: '9,93', keller: '4,90' },
  { id: '04', etage: 'Obergeschoss', m2: '58,99', balkon: '6,63', keller: '4,90' },
  { id: '05', etage: 'Dachgeschoss', m2: '57,52', balkon: '9,93', keller: '4,90' },
  { id: '06', etage: 'Dachgeschoss', m2: '53,12', balkon: '', keller: '4,90' }
];

(function () {
  'use strict';
  var FORM_KEY = '3fe8574f-a84d-49f3-96dc-0d8abf0975c8';   // Web3Forms (wie Ratgeber); lead-sync.js spiegelt ins CRM
  var FLAG = 'kp_tks';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ---------- Freischaltung speichern / lesen ---------- */
  function zugang() {
    try { var g = JSON.parse(localStorage.getItem(FLAG) || 'null'); if (g && g.exp > Date.now()) return g; } catch (e) {}
    return null;
  }
  function speichern(vorname) {
    var g = { v: String(vorname || '').slice(0, 40), exp: Date.now() + PROJEKT.freischaltTage * 864e5 };
    try { localStorage.setItem(FLAG, JSON.stringify(g)); } catch (e) {}
    return g;
  }
  /* Link aus der Bestätigungs-Mail: ?zugang=<Vorname> schaltet auch auf einem anderen Gerät frei */
  try {
    var qz = new URLSearchParams(location.search).get('zugang');
    if (qz && !zugang()) speichern(decodeURIComponent(qz));
  } catch (e) {}

  /* ---------- Herkunft (UTM) für die Lead-Auswertung, nur in diesem Tab ---------- */
  var quelle = (function () {
    var o = {};
    try {
      var q = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref'].forEach(function (k) { if (q.get(k)) o[k] = q.get(k).slice(0, 80); });
      if (Object.keys(o).length) sessionStorage.setItem('kp_tks_src', JSON.stringify(o));
      else o = JSON.parse(sessionStorage.getItem('kp_tks_src') || '{}');
      if (!o.utm_source && document.referrer) { var h = new URL(document.referrer).hostname; if (h !== location.hostname) o.referrer = h; }
    } catch (e) {}
    return o;
  })();
  function angesehen(id) {
    try { var a = JSON.parse(sessionStorage.getItem('kp_tks_seen') || '[]'); if (a.indexOf(id) < 0) a.push(id); sessionStorage.setItem('kp_tks_seen', JSON.stringify(a)); } catch (e) {}
  }
  function angesehenListe() { try { return JSON.parse(sessionStorage.getItem('kp_tks_seen') || '[]').join(', '); } catch (e) { return ''; } }

  /* ---------- Zusatz-Kacheln & Texte aus PROJEKT ---------- */
  if (PROJEKT.ort) $('#ort').textContent = PROJEKT.ort;
  if (PROJEKT.adresse) $('#adresse').textContent = PROJEKT.adresse;
  var extra = [['energie', 'Energie', '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>'], ['heizung', 'Heizung', '<path d="M8 2v4M12 2v4M16 2v4M4 10h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>'],
    ['stellplatz', 'Stellplatz', '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>'], ['bezug', 'Bezug', '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>']];
  extra.forEach(function (e) {
    if (!PROJEKT[e[0]]) return;
    var d = document.createElement('div'); d.className = 'fact';
    d.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + e[2] + '</svg><b>' + esc(PROJEKT[e[0]]) + '</b><span>' + e[1] + '</span>';
    $('#facts').appendChild(d);
  });
  if (PROJEKT.lage && PROJEKT.lage.length) { var ul = $('#lageList'); ul.innerHTML = PROJEKT.lage.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join(''); ul.hidden = false; }
  if (PROJEKT.terminLink) { $$('#d-termin').forEach(function (a) { a.href = PROJEKT.terminLink; a.target = '_blank'; a.rel = 'noopener'; a.removeAttribute('data-close'); }); }
  if (PROJEKT.telefonPflicht) { $('#gTel').required = true; $('#gTelL').textContent = 'Telefon'; }

  /* ---------- Verfügbarkeit ---------- */
  var st = WE.map(function (w) { return (PROJEKT.wohnungen[w.id] || {}).status; });
  if (st.every(Boolean)) {
    var frei = st.filter(function (s) { return s === 'frei'; }).length;
    var av = $('#avail'); av.hidden = false;
    av.querySelector('span').innerHTML = frei ? 'Noch <b>' + frei + ' von 6</b> Wohnungen verfügbar' : 'Alle Wohnungen sind vergeben – gern auf die Warteliste';
    if (!frei) av.querySelector('.dot').style.background = 'var(--amber)';
  }

  /* ---------- Wohnungskarten ---------- */
  var LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  $('#units').innerHTML = WE.map(function (w) {
    var p = PROJEKT.wohnungen[w.id] || {}; var s = p.status;
    var badge = s ? '<span class="u-badge ' + s + '"><i></i>' + { frei: 'Frei', reserviert: 'Reserviert', verkauft: 'Verkauft', vermietet: 'Vermietet' }[s] + '</span>' : '';
    var frei01 = w.id === '01';
    return '<article class="unit' + (frei01 ? ' free' : '') + '" data-apt="' + w.id + '">' +
      '<div class="u-pic"><img src="bilder/wohnung-' + w.id + '.webp" alt="Visualisierung Wohnung ' + w.id + ', ' + w.etage + '" width="1200" height="800" loading="lazy">' + badge + '<span class="u-360">360°</span><span class="u-vis">Visualisierung</span>' + (frei01 && !badge ? '<span class="u-free">Ohne Anmeldung ansehen</span>' : '') +
      '<button class="u-lock" type="button" data-gate="karte" data-tour="' + w.id + '">' + LOCK + 'Rundgang freischalten<small>Kostenlos – alle 6 Wohnungen</small></button></div>' +
      '<div class="u-body"><div class="u-top"><h3>Wohnung ' + w.id + '</h3><span class="m2">' + w.m2 + ' m²</span></div>' +
      '<div class="u-meta"><span>' + w.etage + '</span><span>2 Zimmer</span>' + (w.balkon ? '<span>Balkon ' + w.balkon + ' m²</span>' : '<span>Dachgeschoss ohne Balkon</span>') + '<span>Keller ' + w.keller + ' m³</span></div>' +
      (p.preis ? '<p class="u-price">' + esc(p.preis) + '</p>' : '') +
      '<div class="u-act"><a class="btn" href="rundgang/?apt=' + w.id + '"' + (frei01 ? '' : ' data-gate="tour" data-tour="' + w.id + '"') + '>' + (frei01 ? '360°-Rundgang ansehen' : '360°-Rundgang') + '</a>' +
      '<a class="btn-g" href="rundgang/?apt=' + w.id + '&amp;modus=3d" data-gate="tour3d" data-tour="' + w.id + '">3D-Rundsicht</a></div>' +
      '</div></article>';
  }).join('');
  $('#g-units').innerHTML = WE.map(function (w) {
    return '<label class="opt"><input type="checkbox" name="wohnung" value="WE ' + w.id + '"><span>WE ' + w.id + '<small>' + w.etage.replace('geschoss', 'G.') + ' · ' + w.m2 + ' m²</small></span></label>';
  }).join('');

  /* ---------- Zustand: gesperrt / freigeschaltet ---------- */
  function anwenden() {
    var g = zugang(); document.body.classList.toggle('unlocked', !!g); document.body.classList.toggle('locked', !g);
    if (g) {
      $('#welcome').textContent = g.v ? 'Willkommen zurück, ' + g.v + ' – Ihre Rundgänge sind freigeschaltet.' : 'Ihre Rundgänge sind freigeschaltet.';
      $$('[data-gate=nav],[data-gate=sticky]').forEach(function (b) { b.textContent = 'Rundgang starten'; });
    }
  }
  anwenden();

  /* ---------- Klicks: Tour / Grundriss / Freischalten ---------- */
  var ziel = null;   // was nach dem Freischalten geöffnet wird
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-gate]'); if (!t) return;
    var apt = t.getAttribute('data-tour') || '01', art = t.getAttribute('data-gate');
    if (apt) angesehen('WE ' + apt);
    var url = art === 'grundriss' ? 'grundrisse/' + t.getAttribute('data-pdf') : 'rundgang/?apt=' + apt + (art === 'tour3d' ? '&modus=3d' : '');
    if (zugang()) {
      if (art === 'nav' || art === 'sticky' || art === 'hero' || art === 'karte' || art === 'tour' || art === 'tour3d' || art === 'grundriss') { e.preventDefault(); if (art === 'grundriss') window.open(url, '_blank', 'noopener'); else location.href = url; }
      return;
    }
    e.preventDefault(); ziel = { url: url, art: art, apt: apt };
    oeffnen(art === 'grundriss' ? 'grundriss' : 'tour', apt);
  });

  /* ---------- Dialog ---------- */
  var dlg = $('#gate'), form = $('#gForm'), schritt = 1, letzterFokus = null;
  function oeffnen(grund, apt) {
    letzterFokus = document.activeElement;
    $('#g-sub').textContent = grund === 'exit' ? 'Bevor Sie gehen: Sehen Sie alle 6 Wohnungen in 360° – vier kurze Fragen, kostenlos.'
      : 'Vier kurze Fragen – dann sehen Sie die 360°-Rundgänge aller 6 Wohnungen und das 3D-Modell.';
    if (apt) { var cb = form.querySelector('input[name=wohnung][value="WE ' + apt + '"]'); if (cb && grund !== 'exit') cb.checked = true; }
    dlg.hidden = false; dlg.classList.add('open'); document.documentElement.style.overflow = 'hidden';
    zeigen(schritt); setTimeout(function () { var f = dlg.querySelector('.step.on input, #gDone:not([hidden]) a'); if (f) f.focus(); }, 60);
    if (window.gtag) try { gtag('event', 'tks_gate_open', { grund: grund }); } catch (e) {}
  }
  function schliessen() { dlg.classList.remove('open'); dlg.hidden = true; document.documentElement.style.overflow = ''; if (letzterFokus) letzterFokus.focus(); }
  dlg.addEventListener('click', function (e) { if (e.target === dlg || (e.target.closest && e.target.closest('[data-close]'))) schliessen(); });
  document.addEventListener('keydown', function (e) {
    if (dlg.hidden) return;
    if (e.key === 'Escape') schliessen();
    if (e.key === 'Tab') { var f = $$('button,a[href],input:not(.hp),select', dlg).filter(function (x) { return x.offsetParent !== null; }); if (!f.length) return; var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  });
  function wert(n) { var x = form.querySelector('input[name="' + n + '"]:checked'); return x ? x.value : ''; }
  function zeigen(n) {
    schritt = n;
    $$('.step', form).forEach(function (s) { s.classList.toggle('on', +s.getAttribute('data-s') === n); });
    var i = wert('interesse');
    $('[data-for=kauf]', form).hidden = i === 'Miete'; $('[data-for=miete]', form).hidden = i !== 'Miete';
    $('#g-bar').style.setProperty('--w', (n * 25) + '%'); $('#g-cnt').textContent = 'Schritt ' + n + ' von 4';
    $('#g-back').hidden = n === 1; $('#g-next').textContent = n === 4 ? 'Rundgänge jetzt freischalten' : 'Weiter';
    $('#g-err').textContent = '';
  }
  $('#g-back').addEventListener('click', function () { zeigen(Math.max(1, schritt - 1)); });
  function pruefen(n) {
    if (n === 1 && !wert('interesse')) return 'Bitte wählen Sie Kauf, Miete oder „Noch offen“.';
    if (n === 2 && !wert('einzug')) return 'Bitte wählen Sie einen ungefähren Zeitraum.';
    if (n === 3 && wert('interesse') !== 'Miete' && !wert('finanzierung')) return 'Bitte wählen Sie eine Antwort zur Finanzierung.';
    if (n === 4) {
      if (!form.vorname.value.trim() || !form.nachname.value.trim()) return 'Bitte geben Sie Vor- und Nachnamen an.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.value.trim())) return 'Bitte prüfen Sie die E-Mail-Adresse.';
      if (PROJEKT.telefonPflicht && form.telefon.value.replace(/\D/g, '').length < 6) return 'Bitte geben Sie eine Telefonnummer an.';
      if (!form.einwilligung.checked) return 'Bitte bestätigen Sie die Einwilligung.';
    }
    return '';
  }
  function score() {
    var e = wert('einzug'), f = wert('finanzierung'), i = wert('interesse'), bald = e === 'Sofort / in 3 Monaten';
    if ((i === 'Kauf' && f === 'Ja' && (bald || e === 'Kapitalanlage, kein Einzug')) || (i === 'Miete' && bald)) return 'heiß';
    if (f === 'In Klärung' || e === 'In 3–6 Monaten' || bald) return 'warm';
    return 'kalt';
  }
  var sendet = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault(); if (sendet) return;
    var fehler = pruefen(schritt); if (fehler) { $('#g-err').textContent = fehler; return; }
    if (schritt < 4) { zeigen(schritt + 1); var f = $('.step.on input', form); if (f) f.focus(); return; }
    if (form.botcheck.value) return;
    sendet = true; var btn = $('#g-next'); btn.textContent = 'Wird freigeschaltet …'; btn.disabled = true;
    var wohnungen = $$('input[name=wohnung]:checked', form).map(function (x) { return x.value; }).join(', ') || 'keine Angabe';
    var s = score(), vor = form.vorname.value.trim(), nach = form.nachname.value.trim();
    var daten = {
      access_key: FORM_KEY, botcheck: '', from_name: 'Keuerleber Immobilien – Projektseite',
      subject: '[' + s.toUpperCase() + '] Theodor-Körner-Straße – Rundgang freigeschaltet: ' + vor + ' ' + nach,
      name: vor + ' ' + nach, email: form.email.value.trim(), phone: form.telefon.value.trim(),
      Projekt: 'Theodor-Körner-Straße', Interesse: wert('interesse'), Wohnungen: wohnungen, Einzug: wert('einzug'), Personen: wert('personen') || 'keine Angabe',
      Finanzierung: wert('finanzierung') || '–', Einkommen: wert('einkommen') || '–', 'Lead-Score': s,
      'Angesehene Wohnungen': angesehenListe() || '–', Quelle: Object.keys(quelle).map(function (k) { return k + '=' + quelle[k]; }).join(' · ') || 'direkt',
      Zeitpunkt: new Date().toLocaleString('de-DE'), Seite: decodeURIComponent(location.pathname),
      'Freischalt-Link (anderes Gerät)': location.origin + location.pathname + '?zugang=' + encodeURIComponent(vor)
    };
    fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(daten) })
      .catch(function () {}).then(function () {
        speichern(vor); anwenden();
        form.hidden = true; $('#gDone').hidden = false;
        $('#d-sub').textContent = 'Danke, ' + vor + '! Alle Rundgänge stehen Ihnen jetzt offen. Wir melden uns werktags innerhalb von 24 Stunden.';
        var z = ziel || { url: 'rundgang/?apt=01', art: 'tour' }, a = $('#d-tour');
        a.href = z.url; a.textContent = z.art === 'grundriss' ? 'Grundriss öffnen' : 'Rundgang starten';
        if (z.art === 'grundriss') { a.target = '_blank'; a.rel = 'noopener'; }
        try { if (window.gtag) gtag('event', 'generate_lead', { lead_score: s, projekt: 'tks' }); if (window.fbq) fbq('track', 'Lead'); } catch (er) {}
        a.focus();
      });
  });

  /* ---------- Exit-Intent (Desktop, einmal pro Sitzung) ---------- */
  if (matchMedia('(pointer:fine)').matches) {
    document.addEventListener('mouseout', function (e) {
      if (e.relatedTarget || e.clientY > 8 || zugang() || !dlg.hidden) return;
      try { if (sessionStorage.getItem('kp_tks_exit')) return; sessionStorage.setItem('kp_tks_exit', '1'); } catch (er) {}
      ziel = { url: 'rundgang/?apt=02', art: 'tour', apt: '02' }; oeffnen('exit');
    });
  }

  /* ---------- Sticky-Leiste ---------- */
  var sticky = $('#sticky');
  function stickyCheck() { sticky.classList.toggle('show', scrollY > innerHeight * 0.6 && (innerHeight + scrollY) < document.body.scrollHeight - 120); }
  addEventListener('scroll', stickyCheck, { passive: true }); stickyCheck();

  /* ---------- Startbild-Video: nur abspielen, wenn sichtbar und keine reduzierte Bewegung ---------- */
  var v = $('#heroVid');
  if (v && !matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); }); }, { threshold: .2 }).observe(v);
  }


  /* ---------- AfA-Beispielrechnung ---------- */
  (function () {
    var p = document.getElementById('tc-p'); if (!p) return;
    var g = document.getElementById('tc-g'), st = document.getElementById('tc-s');
    var eur = function (v) { return Math.round(v).toLocaleString('de-DE') + ' €'; };
    function rechne() {
      var basis = Math.max(0, +p.value || 0) * Math.min(100, Math.max(0, +g.value || 0)) / 100, s = (+st.value || 0) / 100;
      [2, 4, 5].forEach(function (r) {
        document.getElementById('tc-a' + r).textContent = eur(basis * r / 100);
        document.getElementById('tc-e' + r).textContent = eur(basis * r / 100 * s);
      });
      document.getElementById('tc-sum').innerHTML = 'Gegenüber 2&nbsp;% sparen Sie im Beispiel <b>' + eur(basis * 0.02 * s) + ' bis ' + eur(basis * 0.03 * s) + ' mehr Steuern pro Jahr</b> – über 10 Jahre rund ' + eur(basis * 0.2 * s) + ' bis ' + eur(basis * 0.3 * s) + '.';
    }
    [p, g, st].forEach(function (el) { el.addEventListener('input', rechne); });
    rechne();
  })();
  /* ---------- Karte erst nach Klick ---------- */
  $('#mapBtn').addEventListener('click', function () {
    var k = PROJEKT.karte;
    if (!k) { window.open('https://www.openstreetmap.org/search?query=' + encodeURIComponent(PROJEKT.adresse || 'Theodor-Körner-Straße, Hof'), '_blank', 'noopener'); return; }
    var d = 0.006, bb = [k.lon - d * 1.6, k.lat - d, k.lon + d * 1.6, k.lat + d].join(',');
    $('#map').innerHTML = '<iframe title="Karte: Lage des Hauses" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=' + bb + '&layer=mapnik&marker=' + k.lat + ',' + k.lon + '"></iframe>';
  });

  /* ---------- Besichtigungstermin-Formular ---------- */
  var vf = $('#visitForm');
  vf.addEventListener('submit', function (e) {
    e.preventDefault(); var err = $('.err', vf);
    if (!vf.name.value.trim() || vf.phone.value.replace(/\D/g, '').length < 6) { err.textContent = 'Bitte Name und Telefonnummer angeben.'; return; }
    if (!vf.ok.checked) { err.textContent = 'Bitte bestätigen Sie die Einwilligung.'; return; }
    if (vf.botcheck.value) return;
    var b = $('button[type=submit]', vf); b.disabled = true; b.textContent = 'Wird gesendet …'; err.textContent = '';
    fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: FORM_KEY, botcheck: '', from_name: 'Keuerleber Immobilien – Projektseite', subject: 'Theodor-Körner-Straße – Besichtigungstermin: ' + vf.name.value.trim(),
        name: vf.name.value.trim(), phone: vf.phone.value.trim(), 'Wann passt es': vf.wann.value, Projekt: 'Theodor-Körner-Straße', 'Angesehene Wohnungen': angesehenListe() || '–',
        Quelle: Object.keys(quelle).map(function (k) { return k + '=' + quelle[k]; }).join(' · ') || 'direkt', Seite: decodeURIComponent(location.pathname) }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.success === false) throw 0;
        vf.innerHTML = '<p style="color:#7fe0b3;font-weight:600">Danke! Wir melden uns werktags innerhalb von 24 Stunden für einen Termin.</p>';
        try { if (window.gtag) gtag('event', 'generate_lead', { art: 'besichtigung', projekt: 'tks' }); if (window.fbq) fbq('track', 'Lead'); } catch (er) {}
      }).catch(function () { b.disabled = false; b.textContent = 'Besichtigungstermin anfragen'; err.innerHTML = 'Das hat leider nicht geklappt. Bitte rufen Sie uns an: <a href="tel:+4915167692176">+49 151 67692176</a>'; });
  });

  /* ---------- Link ?freischalten=1 (z. B. aus dem Rundgang) öffnet direkt den Dialog ---------- */
  try { var q = new URLSearchParams(location.search); if (q.get('freischalten') && !zugang()) { var a0 = q.get('apt') || '01'; ziel = { url: 'rundgang/?apt=' + a0 + (q.get('modus') === '3d' ? '&modus=3d' : ''), art: 'tour', apt: a0 }; oeffnen('tour', a0); } } catch (e) {}
})();
