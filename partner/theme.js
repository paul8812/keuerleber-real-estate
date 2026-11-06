// Helle/dunkle Darstellung (gleicher Schlüssel wie die übrigen Norderfranken-Tools); Dunkel ist Standard.
try { if (localStorage.getItem('cockpit-thema') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) { /* privater Modus */ }
