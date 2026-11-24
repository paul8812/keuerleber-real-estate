// Druckansicht des Exposés: übernimmt die fertigen Seiten aus dem CRM-Fenster und öffnet den Druckdialog („Als PDF sichern“).
(async () => {
  const hin = document.getElementById('hin'), knopf = document.getElementById('druck');
  let d = null;
  try { d = window.opener && window.opener.__exposeDruck; } catch { /* anderes Fenster */ }
  if (!d) { hin.textContent = 'Dieses Fenster bitte über „Exposé als PDF erstellen“ im CRM öffnen.'; return; }
  document.title = d.titel;
  document.getElementById('seiten').innerHTML = d.html;
  try {
    await (document.fonts && document.fonts.ready);
    await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    // Hintergrundbilder (Fotos) vorladen, damit im PDF nichts fehlt
    const urls = [...document.querySelectorAll('[style*="background-image"]')].map(e => (e.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/) || [])[1]).filter(Boolean);
    await Promise.all([...new Set(urls)].map(u => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = u; })));
  } catch { /* trotzdem drucken */ }
  // Zu volle Seiten schrittweise verkleinern, damit nichts abgeschnitten wird (gleiche Regel wie in der Vorschau)
  try {
    document.querySelectorAll('.page').forEach(pg => { const m = pg.querySelector('main'); if (!m) return;
      const zuViel = () => m.scrollHeight > m.clientHeight + 1 || [...m.children].some(k => k.getBoundingClientRect().bottom > m.getBoundingClientRect().bottom + 1.5);
      const FIT = ['fit1', 'fit2', 'fit3', 'fit4']; pg.classList.remove(...FIT);
      for (const f of FIT) { if (!zuViel()) break; pg.classList.remove(...FIT); pg.classList.add(f); if (f === 'fit4') pg.classList.add('fit3'); } });
  } catch { /* Layout bleibt wie es ist */ }
  hin.textContent = 'Im Druckfenster „Als PDF sichern“ wählen – Ränder: keine, Hintergrundgrafiken: an.';
  knopf.hidden = false; knopf.onclick = () => window.print();
  window.__exposeBereit = true;
  setTimeout(() => window.print(), 400);
})();
