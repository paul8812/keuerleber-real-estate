// Vermietung: woher der Datenstand kommt – immer der neueste, nie ein älterer (wie im Partnerbereich).
//
// Die Webseite (GitHub Pages) zeigt eine Veröffentlichung erst nach 1–2 Minuten. Wer in dieser Zeit neu lädt,
// bekäme sonst den alten Stand, würde darauf weiterarbeiten und beim nächsten Veröffentlichen die vorigen
// Änderungen überschreiben. Deshalb trägt jedes Paket den Zeitpunkt seiner Veröffentlichung (`pub`),
// und wer einen Token hat (Master) oder Neueres kennt, liest direkt aus dem Repository.

export const REPO = 'paul8812/keuerleber-real-estate';
export const FILE = 'vermietung/data.enc.json';
export const TOKEN_KEY = 'nf-partner-gh'; // derselbe GitHub-Token wie im Partnerbereich (gleiche Webseite, gleiches Repository)
const PUB_KEY = 'nf-vm-pub'; // höchste Version, die dieser Browser kennt (selbst veröffentlicht oder gesehen)

export const verOf = (pkg) => Number(pkg?.pub) || 0; // Zeitpunkt der Veröffentlichung (pkg.v ist die Formatversion)
export const sigOf = (pkg) => pkg.objekte.map((b) => b.b).join('|');
export const ghToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
export const bekannt = () => { try { return Number(localStorage.getItem(PUB_KEY)) || 0; } catch { return 0; } };
export const merke = (v) => { try { if (v > bekannt()) localStorage.setItem(PUB_KEY, String(v)); } catch { /* privater Modus */ } };

/** Stand der Webseite – kann nach dem Veröffentlichen kurz hinterherhinken. */
export async function vonSeite() {
  const r = await fetch('data.enc.json?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Daten konnten nicht geladen werden (' + r.status + ')');
  return r.json();
}

/** Stand direkt aus dem Repository – sofort aktuell. Ohne Token klappt das auch (öffentliches Repository, begrenzte Abrufe). */
export async function vonGitHub(tk = ghToken()) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}?ref=main`, {
    cache: 'no-store', headers: { Accept: 'application/vnd.github.raw+json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) },
  });
  if (!r.ok) { const e = new Error('GitHub meldet ' + r.status); e.status = r.status; throw e; }
  return r.json();
}

/** Neuester verfügbarer Stand, nie älter als `mind`. Partner ohne Token lesen nur die Webseite (es sei denn, dieser Browser kennt Neueres);
 *  mit `direkt` wird immer auch im Repository nachgesehen (Master beim Öffnen der Verwaltung). */
export async function neuester(mind = 0, direkt = false) {
  const tk = ghToken();
  // Master (mit Token) lesen Webseite und Repository gleichzeitig
  const [s, g] = await Promise.allSettled([vonSeite(), tk ? vonGitHub(tk).catch((e) => (e.status === 401 ? vonGitHub('') : Promise.reject(e))) : Promise.reject(null)]);
  const seite = s.status === 'fulfilled' ? s.value : null;
  let gh = g.status === 'fulfilled' ? g.value : null;
  // Webseite älter als bekannt (z. B. gerade veröffentlicht) oder nicht erreichbar → direkt im Repository nachsehen
  if (!gh && (direkt || !seite || verOf(seite) < Math.max(mind, bekannt()))) { try { gh = await vonGitHub(''); } catch { /* bleibt bei der Webseite */ } }
  // Bei gleicher Version gewinnt das Repository (es ist nie älter als die Webseite)
  const best = [gh, seite].filter(Boolean).sort((a, b) => verOf(b) - verOf(a))[0];
  if (!best) throw (s.status === 'rejected' ? s.reason : null) ?? new Error('Daten konnten nicht geladen werden');
  merke(verOf(best));
  return best;
}
