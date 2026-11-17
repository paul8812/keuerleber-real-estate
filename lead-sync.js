/* Spiegelt jede Formular-Anfrage (Web3Forms) zusätzlich in die CRM-Datenbank (Supabase).
   Die Tabelle nimmt von hier nur Einträge entgegen; lesen kann sie nur der CRM-Inhaber.
   Schlägt das fehl, ändert sich für Besucher nichts – die Mail kommt wie bisher. */
(function () {
  'use strict';
  if (window.__kpLead || !window.fetch) return; window.__kpLead = true;
  var BASE = 'https://silkguwwkfwoqdfisfky.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbGtndXd3a2Z3b3FkZmlzZmt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODQyNDQsImV4cCI6MjEwNzA2MDI0NH0.zetUJKtz6w4za2-M1yaEYPenE84ML0sPUXFS3DLaABA';
  var orig = window.fetch.bind(window), last = '';
  /* Herkunft für das CRM (Social-Media-Dashboard): Bio-Link-Parameter (?utm_source=tiktok) oder verweisende Seite.
     Über Seitenwechsel hinweg nur mit Statistik-Einwilligung gemerkt (sessionStorage, nur dieses Fenster). */
  function herkunft() {
    var jetzt = '';
    try { var q = new URLSearchParams(location.search); jetzt = q.get('utm_source') || q.get('ref') || ''; } catch (e) {}
    if (!jetzt) { try { var h = document.referrer ? new URL(document.referrer).hostname : ''; if (h && h !== location.hostname) jetzt = h; } catch (e) {} }
    jetzt = String(jetzt).slice(0, 60);
    var ok = !!(window.kpConsent && window.kpConsent.has && window.kpConsent.has('stat'));
    try { if (ok && jetzt && !sessionStorage.getItem('kp_src')) sessionStorage.setItem('kp_src', jetzt); if (ok) return sessionStorage.getItem('kp_src') || jetzt; } catch (e) {}
    return jetzt;
  }
  if (document.readyState === 'complete') herkunft(); else window.addEventListener('load', herkunft);
  function herkunftDazu(d) { var h = herkunft(); if (!h) return d; var o = {}; for (var k in d) o[k] = d[k]; o.herkunft = h; return o; }
  function senden(d) {
    var s = JSON.stringify(d); if (s === last) return; last = s;
    orig(BASE + '/rest/v1/website_anfragen', {
      method: 'POST', keepalive: true,
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ quelle: location.pathname.slice(0, 120), betreff: String(d.subject || '').slice(0, 200), daten: herkunftDazu(d) })
    }).catch(function () {});
  }
  window.fetch = function (input, init) {
    try {
      var u = typeof input === 'string' ? input : (input && input.url) || '';
      if (u.indexOf('api.web3forms.com/submit') > -1 && init && typeof init.body === 'string') {
        var d = JSON.parse(init.body);
        if (!d.botcheck) { delete d.access_key; senden(d); if (d.email) { try { localStorage.setItem('kp_rg_ok', String(Date.now())); } catch (e) {} document.cookie = 'kp_rg_ok=1; max-age=31536000; path=/; SameSite=Lax'; } }
      }
    } catch (e) {}
    return orig(input, init);
  };
})();
