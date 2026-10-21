/* Spiegelt jede Formular-Anfrage (Web3Forms) zusätzlich in die CRM-Datenbank (Supabase).
   Die Tabelle nimmt von hier nur Einträge entgegen; lesen kann sie nur der CRM-Inhaber.
   Schlägt das fehl, ändert sich für Besucher nichts – die Mail kommt wie bisher. */
(function () {
  'use strict';
  if (window.__kpLead || !window.fetch) return; window.__kpLead = true;
  var BASE = 'https://silkguwwkfwoqdfisfky.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbGtndXd3a2Z3b3FkZmlzZmt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODQyNDQsImV4cCI6MjEwNzA2MDI0NH0.zetUJKtz6w4za2-M1yaEYPenE84ML0sPUXFS3DLaABA';
  var orig = window.fetch.bind(window), last = '';
  function senden(d) {
    var s = JSON.stringify(d); if (s === last) return; last = s;
    orig(BASE + '/rest/v1/website_anfragen', {
      method: 'POST', keepalive: true,
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ quelle: location.pathname.slice(0, 120), betreff: String(d.subject || '').slice(0, 200), daten: d })
    }).catch(function () {});
  }
  window.fetch = function (input, init) {
    try {
      var u = typeof input === 'string' ? input : (input && input.url) || '';
      if (u.indexOf('api.web3forms.com/submit') > -1 && init && typeof init.body === 'string') {
        var d = JSON.parse(init.body);
        if (!d.botcheck) { delete d.access_key; senden(d); }
      }
    } catch (e) {}
    return orig(input, init);
  };
})();
