// Helle/dunkle Darstellung (gleicher Schlüssel wie die übrigen Norderfranken-Tools); Dunkel ist Standard.
try { if (localStorage.getItem('cockpit-thema') === 'light') { document.documentElement.setAttribute('data-theme', 'light'); document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#F1F1F2'); } } catch (e) { /* privater Modus */ }
