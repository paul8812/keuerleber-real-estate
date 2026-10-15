// Website-Veröffentlichung: Objekte aus dem CRM auf keuerleber-immobilien.de bringen (GitHub Pages).
// Ersetzt das frühere publish.rb des Immo-Managers – gleiche Ausgabe (Teaser-Logik, Kurzkalkulation).
// Schreibt über die GitHub-API: index.html (IMMO-Block), Landingpage-Karten, Sitemap-Bilder, neue Fotos.
import * as db from './db.js';

export const REPO = 'paul8812/keuerleber-real-estate';
const API = `https://api.github.com/repos/${REPO}`;
export const SITE = 'https://keuerleber-immobilien.de/';

export const token = () => (db.settings().githubToken || '').trim();
export const hasToken = () => !!token();

// ---------- Hilfen ----------
const deNum = (v, d = 2) => (v === '' || v == null || isNaN(v)) ? '' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: d, useGrouping: false });
// Flächen wie bisher auf der Website: ganze Zahl ohne, sonst mit zwei Nachkommastellen („70,60“)
const deArea = v => (v === '' || v == null || isNaN(v)) ? '' : Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const money = v => { const s = String(Math.round(Number(v) || 0)); return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
const deDate = iso => iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('.') : (iso || '');
export const slug = s => (String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'objekt').slice(0, 60);
export const bilderListe = p => String(p.bilder || '').split('\n').map(x => x.trim()).filter(Boolean);
export const webSlug = p => p.webSlug || slug([p.strasse, p.ort].filter(Boolean).join(' ') || p.titel);

function b64encode(text) {
  const bytes = new TextEncoder().encode(text); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, '')); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function gh(path, opts = {}) {
  if (!hasToken()) throw new Error('Kein GitHub-Zugang hinterlegt (Einstellungen → Website)');
  const r = await fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) } });
  if (r.status === 401) throw new Error('GitHub-Zugang ungültig oder abgelaufen (Einstellungen → Website)');
  if (r.status === 403) throw new Error('GitHub-Zugang hat keine Schreibrechte für die Website');
  if (!r.ok && r.status !== 404) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.status === 404 ? null : r.json();
}
async function getFile(path) {
  const f = await gh(`/contents/${encodeURI(path)}?ref=main&t=${Date.now()}`);
  if (!f) return null;
  let text = f.content ? b64decode(f.content) : null;
  if (text == null || f.encoding === 'none') { // > 1 MB: über die Blob-API laden
    const blob = await gh(`/git/blobs/${f.sha}`); text = b64decode(blob.content);
  }
  return { sha: f.sha, text };
}
async function putFile(path, contentB64, sha, message) {
  return gh(`/contents/${encodeURI(path)}`, { method: 'PUT', body: JSON.stringify({ message, content: contentB64, sha: sha || undefined, branch: 'main' }) });
}

export async function testToken() {
  const r = await gh('');
  if (!r) throw new Error('Repository nicht gefunden');
  if (r.permissions && !r.permissions.push) throw new Error('Zugang ohne Schreibrecht');
  return r.full_name;
}

// ---------- Fotos ----------
async function resizeToJpeg(file, max = 1600, q = 0.82) {
  const bmp = await createImageBitmap(file);
  const f = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', q));
  const buf = new Uint8Array(await blob.arrayBuffer()); let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
// Lädt Fotos ins Website-Repository (öffentlich einsehbar!). Im Teaser-Modus zeigt die Website nur die ersten N.
export async function uploadPhotos(p, files, onProgress) {
  const out = [], base = webSlug(p);
  for (let i = 0; i < files.length; i++) {
    onProgress && onProgress(i + 1, files.length);
    const rnd = Math.random().toString(36).slice(2, 8);
    const path = `objektbilder/${base}-${rnd}.jpg`;
    await putFile(path, await resizeToJpeg(files[i]), null, `Foto für „${p.titel || base}“ (CRM)`);
    out.push(path);
  }
  return out;
}

// ---------- Kurzkalkulation (identisch zur bisherigen Website) ----------
const KALK = { ek: 20, zins: 3.6, tilg: 2, st: 42 };
export function kalkWerte(p) {
  const kp = Number(p.preis), miete = Number(p.kalkMiete);
  if (!kp || !miete || kp <= 0 || miete <= 0) return null;
  const hgn = Number(p.kalkHg) || 0, afaP = p.kalkAfa === '' || p.kalkAfa == null ? 2 : Number(p.kalkAfa), gebP = p.kalkGeb === '' || p.kalkGeb == null ? 75 : Number(p.kalkGeb);
  const dar = kp * (1 - KALK.ek / 100), zinsJ = dar * KALK.zins / 100, rateM = (zinsJ + dar * KALK.tilg / 100) / 12;
  const mieteJ = miete * 12, afaJ = kp * gebP / 100 * afaP / 100, cfVor = miete - rateM - hgn;
  const erspJ = Math.max(0, -(mieteJ - afaJ - zinsJ - hgn * 12)) * KALK.st / 100;
  return { bruttoP: mieteJ / kp * 100, erspJ, cfNach: cfVor + erspJ / 12, afaP, gutachten: !!p.kalkGutachten };
}

// ---------- Objekt → Website-Format ----------
export function badgeKey(p) {
  if (p.webBadge) return p.webBadge;
  return ['Reserviert', 'Notartermin'].includes(p.status) ? 'badge_reduziert' : 'badge_neu';
}
export function toImmo(p) {
  const kauf = p.vermarktung !== 'Miete', teaser = !!p.webTeaser;
  const betrag = p.preis ? money(p.preis) : '';
  const price = (teaser || !betrag) ? null : '€ ' + betrag + (kauf ? '' : ' / Monat');
  const flaeche = deArea(p.flaeche), zimmer = deNum(p.zimmer, 1), grund = deNum(p.grundstueck, 0);
  const facts = [];
  if (zimmer) facts.push({ val: zimmer, k: 'zimmer' });
  if (flaeche) facts.push({ val: flaeche + ' m²', k: 'wohnflaeche' });
  if (grund) facts.push({ val: grund + ' m²', k: 'grundstueck' });
  if (p.baujahr) facts.push({ val: 'Bj. ' + p.baujahr, k: 'baujahr' });
  const meta = [];
  if (zimmer) meta.push(zimmer + ' Zi.');
  if (flaeche) meta.push(flaeche + ' m²');
  const alle = bilderListe(p), sichtbar = Number(p.webTeaserBilder) || 4;
  const bilder = teaser && alle.length > sichtbar ? alle.slice(0, sichtbar) : alle;
  const roh = String(p.ausstattung || ''), trenner = /[;\n]/.test(roh) ? /[;\n]+/ : /,+/;
  const ortZeile = [p.plz, p.ort].filter(Boolean).join(' ');
  const energie = p.eWert !== '' && p.eWert != null ? { art: p.eArt || '', wert: deNum(p.eWert, 1), klasse: p.eKlasse || '', traeger: p.eTraeger || p.heizung || '', baujahr: String(p.eBaujahr || p.baujahr || ''), gueltig: deDate(p.eGueltig) } : null;
  let kalk = null; const kw = kalkWerte(p);
  if (kw) kalk = teaser ? { ...kw, teaser: true } : { kp: String(p.preis), mieteM: deNum(p.kalkMiete), hgNichtUml: deNum(p.kalkHg), afaProz: deNum(p.kalkAfa), gebAnteilProz: deNum(p.kalkGeb), ...kw };
  return {
    type: kauf ? 'kaufen' : 'mieten', badgeKey: badgeKey(p), img: bilder[0] || '', bilder,
    // weitere Fotos: im CRM hinterlegte, die nicht gezeigt werden, oder „weitere Fotos auf Anfrage“ (nicht hochgeladen)
    bilderMehr: teaser && (alle.length - bilder.length + (Number(p.webFotosMehr) || 0)) > 0 ? alle.length - bilder.length + (Number(p.webFotosMehr) || 0) : null,
    price, addr: teaser ? ortZeile : [p.strasse, ortZeile].filter(Boolean).join(', '),
    addrShort: p.ort || p.titel || '', titel: String(p.titel || ''), cardMeta: meta, facts,
    beschreibung: { de: String((teaser ? p.webBeschreibungTeaser || p.beschreibung : p.beschreibung) || '') },
    lage: { de: String((teaser ? p.webLageTeaser : p.lage) || '') },
    ausstattung: { de: roh.split(trenner).map(s => s.trim()).filter(Boolean) },
    energie, kalk, mailId: p.mailId ? String(p.mailId) : null,
  };
}

export const NICHT_ONLINE = ['Archiv', 'Verkauft / Vermietet'];
export const onlineObjekte = () => db.all('properties').filter(p => p.webOnline && !NICHT_ONLINE.includes(p.status))
  .sort((a, b) => (Number(a.webPos) || 999) - (Number(b.webPos) || 999) || (a.created || '').localeCompare(b.created || ''));

// ---------- Seiten aktualisieren ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function immoBlock(list) {
  return '/*IMMO_START*/\nconst immobilien = ' + JSON.stringify(list.map(toImmo)).replace(/</g, '\\u003c') + ';\n/*IMMO_END*/';
}
export function landingCards(list) {
  const verkauf = list.filter(p => p.vermarktung !== 'Miete');
  if (!verkauf.length) return '<div class="grid"><div class="card"><h3>Gerade alles vergeben</h3><p>Tragen Sie sich in die Vorab-Liste ein – wir melden uns, sobald eine passende Wohnung frei wird.</p></div></div>';
  return '<div class="grid">' + verkauf.map(p => {
    const i = toImmo(p), img = i.img ? '/' + i.img.replace(/^\//, '') : '';
    const zeile = [i.addr, ...i.cardMeta, p.baujahr ? 'Bj. ' + p.baujahr : ''].filter(Boolean).join(' · ');
    const preis = i.price || 'Preis auf Anfrage';
    return `<a class="card" href="/#immobilien" style="text-decoration:none;display:block">${img ? `<img src="${esc(img)}" alt="${esc(i.titel)}" loading="lazy" width="800" height="533">` : ''}<h3>${esc(i.titel)}</h3><p>${esc(zeile)}<br>${esc(preis)} · für Käufer provisionsfrei</p></a>`;
  }).join('') + '</div>';
}
export function sitemapImages(list) {
  return list.map(p => { const i = toImmo(p); return i.img ? `    <image:image><image:loc>${SITE}${esc(i.img.replace(/^\//, ''))}</image:loc><image:title>${esc(i.titel)}</image:title></image:image>` : ''; }).filter(Boolean).join('\n');
}
const between = (text, a, b, repl) => {
  const re = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  if (!re.test(text)) return null;
  return text.replace(re, () => a + repl + b);
};

// Veröffentlicht alle Objekte mit „Auf der Website“ = an. Gibt eine Zusammenfassung zurück.
export const sollOnline = p => !!p.webOnline && !NICHT_ONLINE.includes(p.status);
export const ausstehend = p => (sollOnline(p) !== !!p.webLive) || (!!p.webLive && (p.updated || '') > (p.webPublished || ''));
export const websiteAusstehend = () => db.all('properties').some(ausstehend);

export async function publish(onStep = () => {}) {
  const list = onlineObjekte();
  onStep('Startseite wird aktualisiert …');
  const idx = await getFile('index.html');
  if (!idx || !idx.text.includes('/*IMMO_START*/') || !idx.text.includes('/*IMMO_END*/')) throw new Error('Objekt-Bereich in index.html nicht gefunden – nichts verändert.');
  const neu = idx.text.replace(/\/\*IMMO_START\*\/[\s\S]*?\/\*IMMO_END\*\//, () => immoBlock(list));
  const msg = `Website: ${list.length} Objekt(e) aus dem CRM veröffentlicht`;
  if (neu !== idx.text) await putFile('index.html', b64encode(neu), idx.sha, msg);
  onStep('Landingpage wird aktualisiert …');
  const lp = await getFile('eigentumswohnung-kaufen-hof/index.html');
  if (lp) { const t = between(lp.text, '<!--OBJEKTE_START-->', '<!--OBJEKTE_END-->', landingCards(list)); if (t && t !== lp.text) await putFile('eigentumswohnung-kaufen-hof/index.html', b64encode(t), lp.sha, msg + ' (Landingpage)'); }
  onStep('Sitemap wird aktualisiert …');
  const sm = await getFile('sitemap.xml');
  if (sm) { const t = between(sm.text, '<!--OBJEKTBILDER_START-->', '<!--OBJEKTBILDER_END-->', '\n' + sitemapImages(list) + '\n    '); if (t && t !== sm.text) await putFile('sitemap.xml', b64encode(t), sm.sha, msg + ' (Sitemap)'); }
  // +5 s: das Speichern unten setzt „updated“ – sonst gälte das Objekt sofort wieder als geändert
  const ts = new Date(Date.now() + 5000).toISOString();
  for (const p of db.all('properties')) {
    const war = !!p.webLive, ist = list.includes(p);
    if (ist || war) await db.save('properties', { ...p, webLive: ist, webPublished: ts });
    if (ist !== war) await db.log('system', ist ? 'Auf der Website veröffentlicht' : 'Von der Website entfernt', { propertyId: p.id });
  }
  const s = db.settings(); await db.saveSettings({ ...s, webLastPublish: ts });
  return { anzahl: list.length };
}
