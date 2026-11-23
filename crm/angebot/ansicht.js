// Vorschau / Präsentation eines Angebots aus dem CRM: die Daten kommen vom CRM-Fenster (gleiche Herkunft),
// Anpassungen (Regler, Tabelle, Auswahl) gehen dorthin zurück und werden beim Angebot gespeichert.
(function () {
  'use strict';
  var hier = location.origin, ziel = window.opener || (window.parent !== window ? window.parent : null);
  var laeuft = false;
  function los(d) {
    if (laeuft) { window.KreAngebot.aktualisiere(d); return; }
    laeuft = true; window.KreAngebot.starte(d, { merken: false, onChange: function (s) { if (ziel) { try { ziel.postMessage({ typ: 'angebot-stand', id: d.id, stand: s }, hier); } catch (e) { /* CRM geschlossen */ } } } });
  }
  window.addEventListener('message', function (e) { if (e.origin === hier && e.data && e.data.typ === 'angebot-daten') los(e.data.daten); });
  try { if (window.opener && window.opener.__angebot) los(window.opener.__angebot); } catch (e) { /* kein CRM-Fenster */ }
  if (ziel) { try { ziel.postMessage({ typ: 'angebot-bereit' }, hier); } catch (e) { /* egal */ } }
  if (!ziel) document.body.insertAdjacentHTML('afterbegin', '<p style="padding:40px;color:#ede8e0;font-family:sans-serif">Bitte das Angebot aus dem CRM öffnen.</p>');
})();
