/* Ratgeber-Freischaltung: Artikel sind nach Einleitung und Erklärvideo gesperrt,
   bis Besucher einmal Name und E-Mail angegeben haben. Der Merker „kp_rg_ok“ liegt
   lokal im Browser (localStorage + Cookie, 1 Jahr) und gilt für alle Ratgeber-Artikel.
   Wer schon ein anderes Formular der Website abgeschickt hat, ist ebenfalls freigeschaltet
   (siehe lead-sync.js). */
(function () {
  'use strict';
  var FLAG = 'kp_rg_ok', KEY = '3fe8574f-a84d-49f3-96dc-0d8abf0975c8', URL = 'https://api.web3forms.com/submit';
  function ok() {
    try { if (localStorage.getItem(FLAG)) return true; } catch (e) {}
    return document.cookie.indexOf(FLAG + '=1') > -1;
  }
  function merken() {
    try { localStorage.setItem(FLAG, String(Date.now())); } catch (e) {}
    document.cookie = FLAG + '=1; max-age=31536000; path=/; SameSite=Lax';
  }
  var root = document.documentElement, paid = document.querySelector('.rg-paid');
  if (!paid || ok()) { root.classList.remove('rg-l'); return; }
  root.classList.add('rg-l');
  var t = (document.querySelector('h1') || {}).textContent || document.title;
  var g = document.createElement('section');
  g.className = 'rg-gate'; g.setAttribute('aria-labelledby', 'rg-gate-h');
  g.innerHTML =
    '<p class="eyebrow">Kostenlos weiterlesen</p>' +
    '<h2 id="rg-gate-h">Den ganzen Ratgeber <em>freischalten</em></h2>' +
    '<p class="rg-gate-p">Einmal kurz eintragen, dann lesen Sie alle 14 Ratgeber-Artikel vollständig, mit Rechenbeispielen, Checklisten und Quellen. Auf diesem Gerät bleibt der Zugang gespeichert.</p>' +
    '<form class="kf" novalidate>' +
    '<input type="text" name="n" placeholder="Ihr Name" autocomplete="name" aria-label="Ihr Name">' +
    '<input type="email" name="m" placeholder="E-Mail-Adresse" autocomplete="email" inputmode="email" aria-label="E-Mail-Adresse" required>' +
    '<input type="tel" name="t" placeholder="Telefon (optional)" autocomplete="tel" inputmode="tel" aria-label="Telefonnummer, optional">' +
    '<input class="hp" type="text" name="bc" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    '<label class="c"><input type="checkbox" name="ok"><span>Ich bin damit einverstanden, dass Keuerleber Immobilien mich zu Kapitalanlage-Themen per E-Mail oder telefonisch kontaktiert. Widerruf jederzeit möglich. Mehr in der <a href="/#datenschutz" target="_blank" rel="noopener">Datenschutzerklärung</a>.</span></label>' +
    '<button class="b" type="submit">Ratgeber freischalten</button><p class="h" role="status" aria-live="polite"></p></form>' +
    '<ul class="rg-gate-pts"><li>Kein Spam, keine Weitergabe</li><li>Nur einmal nötig</li><li>Persönliche Beratung in Hof</li></ul>';
  paid.parentNode.insertBefore(g, paid.nextSibling);
  // Video: nur kurzer Teaser, danach Hinweis zum Freischalten
  var TEASER = 10, fig = document.querySelector('.rg-video'), v = fig && fig.querySelector('video');
  if (v) {
    var cap = fig.querySelector('figcaption'), capAlt = cap && cap.textContent;
    if (cap) cap.textContent = 'Vorschau · ' + TEASER + ' Sekunden · ganzes Video nach Freischaltung';
    var ov = document.createElement('div'); ov.className = 'rg-vlock'; ov.hidden = true;
    ov.innerHTML = '<b>Weiter geht’s nach der Freischaltung</b><span>Das ganze Erklärvideo und den vollständigen Artikel gibt es kostenlos nach einer kurzen Eintragung.</span><button type="button">Jetzt freischalten</button>';
    fig.appendChild(ov);
    ov.querySelector('button').onclick = function () { g.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { f.n.focus({ preventScroll: true }); }, 500); };
    var stop = function () { if (!root.classList.contains('rg-l')) return; if (v.currentTime > TEASER) { v.pause(); v.currentTime = TEASER; if (document.fullscreenElement) document.exitFullscreen().catch(function(){}); if (v.webkitDisplayingFullscreen) v.webkitExitFullscreen(); ov.hidden = false; } };
    v.addEventListener('timeupdate', stop); v.addEventListener('seeking', stop);
    v.addEventListener('play', function () { if (root.classList.contains('rg-l') && v.currentTime >= TEASER - .05) { v.pause(); ov.hidden = false; } });
    window.__rgUnlockVideo = function () { ov.remove(); if (cap) cap.textContent = capAlt; };
  }
  var f = g.querySelector('form'), h = f.querySelector('.h');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var n = f.n.value.trim(), m = f.m.value.trim(), tel = f.t.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) { h.textContent = 'Bitte geben Sie eine gültige E-Mail-Adresse an.'; f.m.focus(); return; }
    if (!f.ok.checked) { h.textContent = 'Bitte bestätigen Sie die Einwilligung.'; return; }
    if (f.bc.value) return;
    var b = f.querySelector('.b'); b.disabled = true; b.textContent = 'Wird freigeschaltet…'; h.textContent = '';
    var d = { access_key: KEY, subject: 'Ratgeber freigeschaltet: ' + (n || m), from_name: 'Keuerleber Immobilien — Website', botcheck: '',
      name: n || m, email: m, 'Telefon': tel || '—', 'Artikel': t.trim(), 'Seite': location.pathname,
      message: 'Ratgeber freigeschaltet.\n\nName: ' + (n || '—') + '\nE-Mail: ' + m + '\nTelefon: ' + (tel || '—') + '\nArtikel: ' + t.trim() };
    fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.success === false) throw 0; merken(); root.classList.remove('rg-l'); if (window.__rgUnlockVideo) window.__rgUnlockVideo();
        g.innerHTML = '<p class="rg-gate-ok"><b>Danke, der Ratgeber ist freigeschaltet.</b> Viel Spaß beim Lesen!</p>';
        setTimeout(function () { g.remove(); }, 4000); })
      .catch(function () { b.disabled = false; b.textContent = 'Ratgeber freischalten'; h.textContent = 'Das Senden hat nicht geklappt. Bitte versuchen Sie es erneut.'; });
  });
})();
