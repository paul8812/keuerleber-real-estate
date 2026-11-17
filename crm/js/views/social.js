// Social Media – Reichweite, Follower, Top-Beiträge und was davon als Anfrage im CRM ankommt.
// Die Zahlen liefert ein Abruf aus Metricool (3× täglich, Datensatz social/social-stats, siehe SOCIAL_SQL in db.js).
import * as db from '../db.js';
import { html, raw, esc, num, today, addDays, fmtDateShort, fullName } from '../util.js';

// Kanalfarben: feste Zuordnung je Kanal (nie nach Rang), geprüft gegen die dunkle Fläche (#141416) – alle Prüfungen bestanden.
export const KANAL = {
  // ausBeitraegen: Aufrufe/Interaktionen je Tag aus den Beiträgen (nach Veröffentlichungstag) statt aus Konto-Werten –
  // so zählen alle Kanäle gleich wie TikTok („Aufrufe der Beiträge aus dem Zeitraum“), auch rückwirkend.
  tiktok: { name: 'TikTok', farbe: '#00a9a2', glyph: '♪', profil: k => `https://www.tiktok.com/@${k}` },
  instagram: { name: 'Instagram', farbe: '#c25485', glyph: '◎', ausBeitraegen: true, profil: k => `https://www.instagram.com/${k}/` },
  facebook: { name: 'Facebook', farbe: '#486fcc', glyph: 'f', ausBeitraegen: true, profil: k => `https://www.facebook.com/${k}` },
  linkedin: { name: 'LinkedIn', farbe: '#c38824', glyph: 'in', ausBeitraegen: true, profil: k => `https://www.linkedin.com/company/${k}` },
};
const REIHE = ['tiktok', 'instagram', 'facebook', 'linkedin'];
export const SOCIAL_QUELLEN = ['TikTok', 'Instagram', 'Facebook', 'LinkedIn', 'Social Media'];
const ZEITRAEUME = [[7, '7 Tage'], [30, '30 Tage'], [90, '90 Tage']];
const LS = 'kre-social';
const ruhig = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Kleine Strich-Symbole (statt Emoji) – 1.6px Kontur, erben die Textfarbe
const IC = {
  herz: '<path d="M8 13.5S2 10 2 5.9A3.1 3.1 0 0 1 8 4.6a3.1 3.1 0 0 1 6 1.3C14 10 8 13.5 8 13.5Z"/>',
  sprech: '<path d="M2.5 7.6a5.3 4.8 0 1 1 2.6 4.1L2.5 13l.7-2.6a4.6 4.6 0 0 1-.7-2.8Z"/>',
  teilen: '<path d="M9.5 3 14 7.2l-4.5 4.2V9C6 9 3.8 10 2 13c.5-4 2.7-6.6 7.5-6.9Z"/>',
  merken: '<path d="M4 2.5h8v11l-4-3-4 3Z"/>',
  uhr: '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.2 1.4"/>',
  auge: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>',
  leute: '<circle cx="6" cy="5.5" r="2.3"/><path d="M1.8 13.2c.4-2.4 2.1-3.7 4.2-3.7s3.8 1.3 4.2 3.7"/><path d="M10.6 3.4a2.2 2.2 0 0 1 0 4.3M12 9.8c1.2.5 2 1.6 2.2 3.4"/>',
  ziel: '<path d="M3 13.5V2.5M3 3h8.5l-1.8 2.6L11.5 8H3"/>',
};
const ic = (n, t = '') => raw(`<svg class="smi" viewBox="0 0 16 16" aria-hidden="true">${IC[n]}</svg>${t ? `<span class="vh">${esc(t)}</span>` : ''}`);

// ---------------------------------------------------------------- Daten
const zahl = v => v == null || v === '' || isNaN(+v) ? null : +v;
function zeitAus(v) {
  const s = String(v ?? '');
  if (/^\d{14}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}`;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 16) : '';
}
/** Rohdaten (Zeilen wie von Metricool geliefert, Spaltennamen je Kanal in „spalten“) → je Kanal Tageswerte + Beiträge.
 *  Spalten werden nach Namen gelesen; fehlt eine Spalte oder ist eine Zeile kürzer, ist der Wert null. */
export function auswerten(rec) {
  const out = {};
  for (const k of REIHE) {
    const kd = rec?.kanaele?.[k]; if (!kd || typeof kd !== 'object') continue;
    const sp = kd.tage?.spalten || [], tage = new Map();
    for (const z of kd.tage?.zeilen || []) {
      if (!Array.isArray(z)) continue;
      const d = String(z[z.length - 1] ?? ''); if (!/^\d{8}$/.test(d)) continue;
      const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, t = tage.get(iso) || {};
      sp.forEach((n, i) => { const v = zahl(z[i]); if (v == null) return; t[n] = n === 'follower' ? Math.max(t[n] ?? 0, v) : (t[n] ?? 0) + v; });
      tage.set(iso, t);
    }
    const bs = kd.beitraege?.spalten || [], p = n => bs.indexOf(n), seen = new Set();
    const wert = (z, n) => p(n) < 0 ? null : zahl(z[p(n)]);
    const posts = (kd.beitraege?.zeilen || []).filter(Array.isArray).map(z => ({
      kanal: k, zeit: zeitAus(z[p('zeit')]), url: String(z[p('url')] ?? ''), bild: String(z[p('bild')] ?? ''), text: String(z[p('text')] ?? '').trim(),
      aufrufe: wert(z, 'aufrufe') || 0, likes: wert(z, 'likes') || 0, kommentare: wert(z, 'kommentare') || 0, shares: wert(z, 'shares') || 0,
      // neu (ab Abruf mit eigenen Spalten je Kanal) – fehlt die Spalte, bleibt es null und wird nirgends angezeigt
      reichweite: wert(z, 'reichweite'), gespeichert: wert(z, 'gespeichert'), wiedergabe: wert(z, 'wiedergabe_s'), komplett: wert(z, 'komplett_pct'),
    })).filter(x => x.zeit && !seen.has(x.url || x.zeit) && seen.add(x.url || x.zeit));
    posts.forEach(x => { x.inter = x.likes + x.kommentare + x.shares; x.er = x.aufrufe ? x.inter / x.aufrufe : 0; });
    // „komplett_pct“ ist ein Prozentwert; kommen nur Werte bis 1, ist es ein Anteil (0,38 statt 38 %) → umrechnen
    const kp = posts.map(x => x.komplett).filter(v => v != null);
    if (kp.length && kp.every(v => v <= 1) && kp.some(v => v > 0)) posts.forEach(x => { if (x.komplett != null) x.komplett *= 100; });
    out[k] = { konto: String(kd.konto || ''), tage, posts };
  }
  return out;
}
const tageZwischen = (von, bis) => { const r = []; for (let d = von; d <= bis; d = addDays(d, 1)) r.push(d); return r; };
/** Follower am Tag d = letzter bekannter Wert bis einschließlich d */
function followerReihe(kd, tage) {
  const bekannt = [...kd.tage].filter(([, t]) => t.follower != null).sort((a, b) => a[0] < b[0] ? -1 : 1);
  let i = 0, letzter = null;
  return tage.map(d => { while (i < bekannt.length && bekannt[i][0] <= d) letzter = bekannt[i++][1].follower; return letzter; });
}
/** Video-Kennzahlen der Beiträge – gewichtet nach Aufrufen; null, solange keine Werte da sind */
function videoWerte(posts) {
  const gew = (feld) => { const m = posts.filter(p => p[feld] != null); if (!m.length) return null; const w = m.reduce((s, p) => s + Math.max(1, p.aufrufe), 0); return m.reduce((s, p) => s + p[feld] * Math.max(1, p.aufrufe), 0) / w; };
  const summe = (feld) => { const m = posts.filter(p => p[feld] != null); return m.length ? m.reduce((s, p) => s + p[feld], 0) : null; };
  return { wiedergabe: gew('wiedergabe'), komplett: gew('komplett'), reichweite: summe('reichweite'), gespeichert: summe('gespeichert') };
}
function kennzahlen(K, kanaele, von, bis) {
  const tage = tageZwischen(von, bis), vorher = addDays(von, -1);
  let fEnde = 0, fStart = 0, fDa = false, fZu = false, zuwachs = 0, basis = 0, aufrufe = 0, inter = 0;
  const follower = tage.map(() => null), aufrufeTag = tage.map(() => 0), zuwachsTag = tage.map(() => null), erstAb = [];
  for (const k of kanaele) {
    const kd = K[k]; if (!kd) continue;
    const f = followerReihe(kd, [vorher, ...tage]);
    if (f[f.length - 1] != null) {
      fDa = true; fEnde += f[f.length - 1];
      const i0 = f.findIndex(x => x != null), bekannt = [...kd.tage].filter(([d, t]) => t.follower != null && d >= vorher && d <= bis).length;
      if (i0 > 0) erstAb.push([k, [vorher, ...tage][i0]]);              // Follower erst ab diesem Tag erfasst (Kanal später verbunden)
      fStart += f[i0];
      if (bekannt >= 2 || i0 === 0) { fZu = true; zuwachs += f[f.length - 1] - f[i0]; basis += f[i0]; }   // nur ein Wert: Zuwachs (noch) nicht ablesbar
    }
    f.slice(1).forEach((v, i) => { if (v != null) follower[i] = (follower[i] || 0) + v; if (v != null && f[i] != null) zuwachsTag[i] = (zuwachsTag[i] || 0) + v - f[i]; });
    const ausPosts = KANAL[k].ausBeitraegen && kd.posts.length, proTag = new Map();
    if (ausPosts) kd.posts.forEach(p => { const d = p.zeit.slice(0, 10), x = proTag.get(d) || { aufrufe: 0, interaktionen: 0 }; x.aufrufe += p.aufrufe; x.interaktionen += p.inter; proTag.set(d, x); });
    const wert = (d, n) => (ausPosts ? proTag.get(d)?.[n] : kd.tage.get(d)?.[n]) || 0;
    tage.forEach((d, i) => { const a = wert(d, 'aufrufe'); aufrufe += a; inter += wert(d, 'interaktionen'); aufrufeTag[i] += a; });
  }
  const posts = kanaele.flatMap(k => K[k]?.posts || []).filter(p => p.zeit.slice(0, 10) >= von && p.zeit.slice(0, 10) <= bis);
  return { tage, erstAb, follower: fDa ? fEnde : null, folgerZuwachs: fDa && fZu ? zuwachs : null, folgerBasis: basis, folgerStart: fStart, followerTag: follower, zuwachsTag, aufrufe, aufrufeTag, inter, er: aufrufe ? inter / aufrufe : null, posts, video: videoWerte(posts) };
}
const anfragenIm = (von, bis) => db.all('contacts').filter(c => SOCIAL_QUELLEN.includes(c.quelle) && (c.created || '').slice(0, 10) >= von && (c.created || '').slice(0, 10) <= bis);

// ---------------------------------------------------------------- Formate
const kurz = n => n == null ? '–' : Math.abs(n) >= 1e6 ? num(n / 1e6, 1) + ' Mio.' : Math.abs(n) >= 1e4 ? num(n / 1e3, n >= 1e5 ? 0 : 1) + ' Tsd.' : num(n);
const proz = (x, d = 1) => x == null || !isFinite(x) ? '–' : num(x * 100, d) + ' %';
/** Sekunden lesbar: „8,4 s“, „23 s“, „1:05 min“ */
const sek = s => { if (s == null || !isFinite(s)) return '–'; if (s < 59.5) return num(s, s < 10 ? 1 : 0) + ' s'; const r = Math.round(s); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')} min`; };
function delta(jetzt, vorher, { pp = false, gutWennHoch = true, einheit = '' } = {}) {
  if (jetzt == null || vorher == null) return '';
  const diff = pp ? (jetzt - vorher) * 100 : vorher ? (jetzt - vorher) / vorher * 100 : null;
  if (diff == null || !isFinite(diff)) return jetzt > 0 && !vorher ? html`<em class="sd">neu</em>` : '';
  if (Math.abs(diff) < 0.05) return html`<em class="sd">± 0 ${pp ? 'Pkt.' : '%'}</em>`;
  const hoch = diff > 0, gut = hoch === gutWennHoch;
  return html`<em class="sd ${gut ? 'up' : 'down'}" title="gegenüber dem Zeitraum davor${einheit}">${hoch ? '▲' : '▼'} ${num(Math.abs(diff), 1)} ${pp ? 'Pkt.' : '%'}</em>`;
}
const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const tagesZeit = h => h < 11 ? 'morgens (vor 11 Uhr)' : h < 15 ? 'mittags (11–15 Uhr)' : h < 18 ? 'nachmittags (15–18 Uhr)' : 'abends (ab 18 Uhr)';
const kuerzen = (t, n) => { const s = t.replace(/\s+/g, ' ').replace(/#\S+/g, '').trim() || t.trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const videoId = p => (p.url.match(/\/video\/(\d+)/) || p.url.match(/\/(?:p|reel)\/([\w-]+)/) || [])[1] || '';
const datumLang = d => new Date(d.length > 10 ? d : d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

// ---------------------------------------------------------------- Zustand
let zustand = (() => { try { return { tage: 30, kanal: 'alle', ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { tage: 30, kanal: 'alle' }; } })();
const merken = () => { try { localStorage.setItem(LS, JSON.stringify(zustand)); } catch { /* egal */ } };
let gezeigt = '';          // was zuletzt animiert wurde – Live-Aktualisierungen zeichnen still neu, ohne alles erneut einfliegen zu lassen
let aufraeumen = () => {};

// ---------------------------------------------------------------- Ansicht
export function render(el) {
  aufraeumen();
  const rec = db.get('social', 'social-stats');
  const K = auswerten(rec), verbunden = REIHE.filter(k => K[k]);
  const stand = rec?.stand || rec?.empfangen || '';
  const bis = (stand ? String(stand).slice(0, 10) : '') || today();
  if (!verbunden.length) { el.innerHTML = String(leer(rec)); gezeigt = ''; return; }
  if (zustand.kanal !== 'alle' && !K[zustand.kanal]) zustand.kanal = 'alle';
  const auswahl = zustand.kanal === 'alle' ? verbunden : [zustand.kanal];
  const n = zustand.tage, von = addDays(bis, -(n - 1)), vVon = addDays(von, -n), vBis = addDays(von, -1);
  const jetzt = kennzahlen(K, auswahl, von, bis), davor = kennzahlen(K, auswahl, vVon, vBis);
  const proKanal = Object.fromEntries(verbunden.map(k => [k, kennzahlen(K, [k], von, bis)]));
  const proKanalVorher = Object.fromEntries(verbunden.map(k => [k, kennzahlen(K, [k], vVon, vBis)]));
  const anf = anfragenIm(von, bis), anfVorher = anfragenIm(vVon, vBis);
  const sig = `${n}|${auswahl}|${rec.empfangen || stand}`;
  const animieren = sig !== gezeigt && !ruhig(); gezeigt = sig;
  const avg = jetzt.posts.length ? jetzt.posts.reduce((s, p) => s + p.aufrufe, 0) / jetzt.posts.length : 0;
  const avgVorher = davor.posts.length ? davor.posts.reduce((s, p) => s + p.aufrufe, 0) / davor.posts.length : null;
  const allePosts = auswahl.flatMap(k => K[k].posts);
  const top = [...(jetzt.posts.length >= 3 ? jetzt.posts : allePosts)].sort((a, b) => b.aufrufe - a.aufrufe).slice(0, 6);
  const topAusZeitraum = jetzt.posts.length >= 3;
  const v = jetzt.video, vv = davor.video;
  // Zusatzspalten in Tabellen/Tooltips nur, wenn irgendein Beitrag sie hat
  const hat = f => allePosts.some(p => p[f] != null);

  el.innerHTML = String(html`<div class="sm ${animieren ? 'go' : 'still'}">
    <div class="head sm-head">
      <div><h1>Social Media</h1><p class="muted">${stand ? html`Stand ${fmtStand(stand)} · ` : ''}Daten von Metricool · aktualisiert sich dreimal täglich</p></div>
      <div class="sm-ctrl">
        <div class="seg" role="group" aria-label="Zeitraum">${ZEITRAEUME.map(([t, l]) => html`<button type="button" data-tage="${t}" class="${t === n ? 'on' : ''}" aria-pressed="${t === n}">${l}</button>`)}</div>
        ${verbunden.length > 1 ? html`<div class="seg" role="group" aria-label="Kanal"><button type="button" data-kanal="alle" class="${zustand.kanal === 'alle' ? 'on' : ''}" aria-pressed="${zustand.kanal === 'alle'}">Alle</button>${verbunden.map(k => html`<button type="button" data-kanal="${k}" class="${zustand.kanal === k ? 'on' : ''}" aria-pressed="${zustand.kanal === k}"><i class="kd" style="--k:${KANAL[k].farbe}"></i>${KANAL[k].name}</button>`)}</div>` : ''}
      </div>
    </div>

    <section class="sm-hero" aria-label="Überblick">
      <div class="sm-hl sm-kpi" title="Aufrufe der Beiträge aus dem Zeitraum">
        <span class="sm-kl">Aufrufe · letzte ${n} Tage</span>
        <b class="sm-kv sm-big" data-count="${jetzt.aufrufe}" data-fmt="${jetzt.aufrufe >= 1e5 ? 'kurz' : 'int'}">${jetzt.aufrufe >= 1e5 ? kurz(jetzt.aufrufe) : num(jetzt.aufrufe)}</b>
        <span class="sm-kd">${delta(jetzt.aufrufe, davor.aufrufe) || raw('&nbsp;')}${davor.aufrufe ? html` <span class="muted">gegenüber den ${n} Tagen davor</span>` : ''}</span>
        ${(() => { const mx = Math.max(...jetzt.aufrufeTag), iMx = jetzt.aufrufeTag.indexOf(mx); return jetzt.aufrufe ? html`<div class="sm-hx"><div><b>${kurz(Math.round(jetzt.aufrufe / n))}</b><span>Ø pro Tag</span></div><div><b>${kurz(mx)}</b><span>stärkster Tag (${fmtDateShort(jetzt.tage[iMx])})</span></div></div>` : ''; })()}
        ${anteile(auswahl, proKanal, jetzt.aufrufe)}
      </div>
      <div class="sm-hc">
        <div class="sm-ch"><h2>Aufrufe pro Tag</h2>${auswahl.length > 1 ? html`<span class="sm-leg">je Kanal gestapelt</span>` : html`<span class="sm-leg"><span><i class="kd" style="--k:${KANAL[auswahl[0]].farbe}"></i>${KANAL[auswahl[0]].name}</span></span>`}</div>
        <div class="sm-chart sm-tage" data-chart="tage" role="img" aria-label="Aufrufe pro Tag${auswahl.length > 1 ? ', gestapelt nach Kanal' : ''}"></div>
        ${tabelle(['Tag', ...(auswahl.length > 1 ? auswahl.map(k => KANAL[k].name) : []), 'Aufrufe'], jetzt.tage.map((d, i) => [fmtDateShort(d), ...(auswahl.length > 1 ? auswahl.map(k => num(proKanal[k].aufrufeTag[i])) : []), num(jetzt.aufrufeTag[i])]).reverse(), 'Aufrufe pro Tag als Tabelle')}
      </div>
      <div class="sm-kpis">
        ${kpi('Follower', jetzt.follower, 'kurz', jetzt.folgerZuwachs != null ? html`<em class="sd ${jetzt.folgerZuwachs > 0 ? 'up' : jetzt.folgerZuwachs < 0 ? 'down' : ''}">${jetzt.folgerZuwachs > 0 ? '+' : ''}${num(jetzt.folgerZuwachs)} in ${n} Tagen</em>` : '', 0)}
        ${kpi('Interaktionen', jetzt.inter, 'kurz', delta(jetzt.inter, davor.inter), 1, 'Likes, Kommentare und Shares')}
        ${kpi('Engagement-Rate', jetzt.er, 'pct', delta(jetzt.er, davor.er, { pp: true }), 2, 'Interaktionen je Aufruf')}
        ${kpi('Beiträge', jetzt.posts.length, 'int', avg ? html`<em class="sd">Ø ${kurz(Math.round(avg))} Aufrufe</em> ${avgVorher ? delta(avg, avgVorher) : ''}` : '', 3)}
        ${v.wiedergabe != null ? kpi('Ø Wiedergabezeit', v.wiedergabe, 'sek', v.komplett != null ? html`<em class="sd">${num(v.komplett, 0)} % bis zum Ende</em>` : delta(v.wiedergabe, vv.wiedergabe), 4, 'Wie lange ein Video im Schnitt angesehen wird (gewichtet nach Aufrufen)') : ''}
        ${kpi('Anfragen aus Social', anf.length, 'int', delta(anf.length, anfVorher.length), 5, 'Neue Kontakte im CRM mit Quelle TikTok, Instagram, Facebook, LinkedIn oder Social Media')}
      </div>
    </section>

    ${verbunden.length ? html`<section class="sm-kanalliste" aria-label="Kanäle">${verbunden.map((k, i) => kanalKarte(k, K[k], proKanal[k], proKanalVorher[k], n, i, verbunden.length > 1))}</section>` : ''}

    <section class="sm-sec sm-topsec">
      <div class="sm-ch"><div><h2>Top-Beiträge</h2><p class="muted small">${topAusZeitraum ? `die stärksten der letzten ${n} Tage` : 'die stärksten insgesamt (im Zeitraum zu wenige)'} · antippen zum Abspielen</p></div></div>
      <div class="sm-top">${top.map((p, i) => postKarte(p, i))}</div>
    </section>

    <section class="sm-grid">
      <div class="card sm-card sm-wide">
        <div class="sm-ch"><div><h2>Follower-Entwicklung</h2><p class="muted small">${auswahl.length > 1 ? 'je Kanal' : KANAL[auswahl[0]].name} · letzte ${n} Tage${jetzt.erstAb.map(([k, d]) => ` · ${KANAL[k].name} erst ab ${fmtDateShort(d)} erfasst`).join('')}</p></div>${legende(auswahl)}</div>
        <div class="sm-chart" data-chart="follower" role="img" aria-label="Follower-Entwicklung"></div>
        ${folgerFakten(jetzt)}
        ${tabelle(['Tag', ...auswahl.map(k => KANAL[k].name)], jetzt.tage.map((d, i) => [fmtDateShort(d), ...auswahl.map(k => { const f = followerReihe(K[k], jetzt.tage)[i]; return f == null ? '–' : num(f); })]).reverse(), 'Follower als Tabelle')}
      </div>
      <div class="card sm-card sm-trichter">
        <h2>Vom Aufruf zur Anfrage</h2><p class="muted small">letzte ${n} Tage</p>
        ${trichter(jetzt, anf)}
      </div>
    </section>

    <section class="card sm-card">
      <div class="sm-ch"><div><h2>Jeder Beitrag im Zeitraum</h2><p class="muted small">Ein Balken je Beitrag, Höhe = Aufrufe${jetzt.posts.length ? html` · Linie = Ø ${kurz(Math.round(avg))}` : ''} · antippen zum Ansehen</p></div>${auswahl.length > 1 ? legende(auswahl) : ''}</div>
      ${jetzt.posts.length ? html`<div class="sm-chart sm-posts" data-chart="posts" role="img" aria-label="Aufrufe je Beitrag"></div>
        ${beitragsTabelle(jetzt.posts, hat)}`
        : html`<p class="empty">In diesem Zeitraum wurde nichts veröffentlicht.</p>`}
    </section>

    <section class="sm-grid sm-halb">
      <div class="card sm-card">
        <h2>Was funktioniert</h2><p class="muted small">aus deinen Zahlen errechnet</p>
        <ul class="sm-ins">${einsichten(allePosts, jetzt, davor, n).map((t, i) => html`<li style="--i:${i}">${t}</li>`)}</ul>
      </div>
      <div class="card sm-card">
        <h2>Anfragen aus Social Media</h2><p class="muted small">neue Kontakte im CRM, letzte ${n} Tage</p>
        ${anfragenListe(anf)}
      </div>
    </section>

    <section class="card sm-card">
      <h2>Kanäle & Bio-Links</h2><p class="muted small">Diese Links in die Bio setzen – dann ordnet das CRM Website-Anfragen automatisch dem richtigen Kanal zu.</p>
      <div class="sm-kanaele">${REIHE.map(k => kanalZeile(k, K[k]))}</div>
    </section>
  </div>`);

  const root = el.querySelector('.sm');
  root.querySelectorAll('[data-tage]').forEach(b => b.onclick = () => { zustand.tage = +b.dataset.tage; merken(); render(el); });
  root.querySelectorAll('[data-kanal]').forEach(b => b.onclick = () => { zustand.kanal = b.dataset.kanal; merken(); render(el); });
  root.querySelectorAll('[data-wahl]').forEach(b => {
    const wahl = () => { zustand.kanal = zustand.kanal === b.dataset.wahl ? 'alle' : b.dataset.wahl; merken(); render(el); };
    b.onclick = e => { if (!e.target.closest('a')) wahl(); };
    b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wahl(); } };
  });
  root.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = '✓ kopiert'; setTimeout(() => { b.textContent = 'Kopieren'; }, 1600); } catch { prompt('Link kopieren:', b.dataset.copy); } });
  root.querySelectorAll('[data-post]').forEach(b => b.onclick = e => { e.preventDefault(); ansehen(allePosts.find(p => (p.url || p.zeit) === b.dataset.post)); });
  root.querySelectorAll('[data-kontakt]').forEach(li => li.onclick = () => { location.hash = '#/kontakte/' + li.dataset.kontakt; });
  root.querySelectorAll('img[data-cover]').forEach(img => { img.onerror = () => { img.remove(); }; if (img.complete && !img.naturalWidth) img.remove(); });

  const zeichnen = (anim) => {
    const t = root.querySelector('[data-chart="tage"]'); if (t) tageChart(t, jetzt.tage, auswahl.map(k => ({ k, v: proKanal[k].aufrufeTag })), anim);
    const f = root.querySelector('[data-chart="follower"]'); if (f) followerChart(f, K, auswahl, jetzt.tage, anim);
    const p = root.querySelector('[data-chart="posts"]'); if (p) postsChart(p, jetzt.posts, avg, von, bis, anim, x => ansehen(x));
  };
  zeichnen(animieren);
  if (animieren) zaehlen(root);
  let breite = el.clientWidth;
  const ro = new ResizeObserver(() => { if (!root.isConnected) { ro.disconnect(); return; } if (Math.abs(el.clientWidth - breite) > 8) { breite = el.clientWidth; zeichnen(false); } });
  ro.observe(el);
  aufraeumen = () => { ro.disconnect(); aufraeumen = () => {}; };
}

// ---------------------------------------------------------------- Bausteine
function fmtStand(s) { const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr'; }
const FMT = { int: v => num(Math.round(v)), kurz: v => kurz(Math.round(v)), pct: v => proz(v), sek: v => sek(v) };
function kpi(label, wert, fmt, unten, i, hilfe = '') {
  const ok = wert != null && isFinite(wert), f = fmt === 'kurz' && ok && wert < 1e4 ? 'int' : fmt;
  return html`<div class="sm-kpi" style="--i:${i}" ${hilfe ? raw(`title="${esc(hilfe)}"`) : ''}>
    <span class="sm-kl">${label}</span>
    <b class="sm-kv" ${ok ? raw(`data-count="${wert}" data-fmt="${f}"`) : ''}>${ok ? FMT[f](wert) : '–'}</b>
    <span class="sm-kd">${unten || raw('&nbsp;')}</span>
  </div>`;
}
/** Anteil je Kanal an den Aufrufen – zugleich Legende des Tagesdiagramms (Punkt = Farbe der Säulen) */
function anteile(ks, pk, gesamt) {
  if (ks.length < 2) return '';
  return html`<ul class="sm-anteil">${ks.map(k => { const a = pk[k].aufrufe, q = gesamt ? a / gesamt : 0; return html`<li style="--k:${KANAL[k].farbe};--q:${q.toFixed(4)}">
    <span class="sm-an"><i class="kd"></i>${KANAL[k].name}</span><b>${kurz(a)}</b><span class="sm-aq">${proz(q, 0)}</span><span class="sm-bar" aria-hidden="true"><i></i></span></li>`; })}</ul>`;
}
function kanalKarte(k, kd, j, vor, n, i, waehlbar) {
  const K = KANAL[k], an = zustand.kanal === k, v = j.video;
  const zeilen = [
    ['Aufrufe', kurz(j.aufrufe), delta(j.aufrufe, vor.aufrufe)],
    ['Beiträge', num(j.posts.length), j.posts.length ? html`<em class="sd">Ø ${kurz(Math.round(j.posts.reduce((s, p) => s + p.aufrufe, 0) / j.posts.length))}</em>` : ''],
    ['Engagement', proz(j.er), delta(j.er, vor.er, { pp: true })],
    v.wiedergabe != null ? ['Ø Wiedergabe', sek(v.wiedergabe), delta(v.wiedergabe, vor.video.wiedergabe)] : null,
    v.komplett != null ? ['bis zum Ende', num(v.komplett, 0) + ' %', ''] : null,
    v.gespeichert != null ? ['Gespeichert', kurz(v.gespeichert), ''] : null,
    v.reichweite != null && v.wiedergabe == null ? ['Reichweite', kurz(v.reichweite), ''] : null,
  ].filter(Boolean);
  const inhalt = html`<div class="sm-kk-kopf"><span class="sm-kb" aria-hidden="true">${K.glyph}</span><div class="grow"><b>${K.name}</b><small>${kd.konto ? '@' + kd.konto : 'verbunden'}</small></div>${waehlbar ? html`<span class="sm-kk-an">${an ? 'gefiltert' : 'filtern'}</span>` : ''}</div>
    <div class="sm-kk-f"><b class="sm-kv" ${j.follower != null ? raw(`data-count="${j.follower}" data-fmt="int"`) : ''}>${j.follower == null ? '–' : num(j.follower)}</b><span>Follower${j.folgerZuwachs != null ? html` · <em class="sd ${j.folgerZuwachs > 0 ? 'up' : j.folgerZuwachs < 0 ? 'down' : ''}">${j.folgerZuwachs > 0 ? '+' : ''}${num(j.folgerZuwachs)}</em> in ${n} Tagen` : ''}</span></div>
    <dl class="sm-kk-w">${zeilen.map(([l, w, d]) => html`<div><dt>${l}</dt><dd><b>${w}</b>${d ? html` ${d}` : ''}</dd></div>`)}</dl>`;
  return waehlbar
    ? html`<div class="sm-kk ${an ? 'on' : ''}" role="button" tabindex="0" data-wahl="${k}" aria-pressed="${an}" aria-label="${K.name}: ${an ? 'Filter aufheben' : 'nur diesen Kanal zeigen'}" style="--k:${K.farbe};--i:${i}">${inhalt}</div>`
    : html`<div class="sm-kk" style="--k:${K.farbe};--i:${i}">${inhalt}</div>`;
}
const legende = ks => ks.length > 1 ? html`<div class="sm-leg">${ks.map(k => html`<span><i class="kd" style="--k:${KANAL[k].farbe}"></i>${KANAL[k].name}</span>`)}</div>` : '';
function tabelle(kopf, zeilen, titel) {
  const zahlSp = kopf.map((_, i) => i > 0 && zeilen.length && zeilen.every(z => /^[\d–]/.test(String(z[i]))));   // Zahlenspalten rechtsbündig
  return html`<details class="sm-tab"><summary>${titel}</summary><div class="sm-tabw"><table class="tbl"><thead><tr>${kopf.map((k, i) => html`<th class="${zahlSp[i] ? 'r' : ''}">${k}</th>`)}</tr></thead><tbody>${zeilen.map(z => html`<tr>${z.map((c, i) => html`<td class="${zahlSp[i] ? 'r' : ''}">${c}</td>`)}</tr>`)}</tbody></table></div></details>`;
}
function beitragsTabelle(posts, hat) {
  const extra = [['reichweite', 'Reichweite', p => num(p.reichweite)], ['gespeichert', 'Gespeichert', p => num(p.gespeichert)], ['wiedergabe', 'Ø Wiedergabe', p => sek(p.wiedergabe)], ['komplett', 'bis zum Ende', p => p.komplett == null ? '–' : num(p.komplett, 0) + ' %']].filter(([f]) => hat(f));
  return tabelle(['Datum', 'Kanal', 'Beitrag', 'Aufrufe', 'Likes', 'Kommentare', 'Shares', ...extra.map(e => e[1])],
    [...posts].sort((a, b) => a.zeit < b.zeit ? 1 : -1).map(p => [fmtDateShort(p.zeit.slice(0, 10)), KANAL[p.kanal].name, kuerzen(p.text, 60), num(p.aufrufe), num(p.likes), num(p.kommentare), num(p.shares), ...extra.map(e => p[e[0]] == null ? '–' : e[2](p))]), 'Beiträge als Tabelle');
}
function folgerFakten(j) {
  const f = j.followerTag, tage = j.tage; let best = 0, bestTag = '';
  j.zuwachsTag.forEach((v, i) => { if (v != null && v > best) { best = v; bestTag = tage[i]; } });   // je Kanal gerechnet: ein neu verbundener Kanal ist kein „Sprung“
  if (j.folgerZuwachs == null) return '';
  return html`<div class="sm-fakten">
    <div><b>${j.folgerZuwachs >= 0 ? '+' : ''}${num(j.folgerZuwachs / tage.length, 1)}</b><span>Ø pro Tag</span></div>
    <div><b>${best ? '+' + num(best) : '–'}</b><span>${bestTag ? html`stärkster Tag (${fmtDateShort(bestTag)})` : 'stärkster Tag'}</span></div>
    ${(() => { const i0 = f.findIndex(v => v != null); return i0 < 0 ? '' : html`<div><b>${num(f[i0])}</b><span>${i0 ? 'erster Wert' : 'zu Beginn'} (${fmtDateShort(tage[i0])})</span></div>`; })()}
  </div>`;
}
function trichter(j, anf) {
  const deals = db.all('deals'), ids = new Set(anf.map(c => c.id));
  const vorgaenge = deals.filter(d => ids.has(d.contactId)).length;
  const neu = j.folgerZuwachs ?? 0;
  const stufen = [['Aufrufe', j.aufrufe, 'auge'], ['Interaktionen', j.inter, 'herz'], ['Neue Follower', Math.max(0, neu), 'leute'], ['Anfragen im CRM', anf.length, 'sprech'], ['Vorgänge', vorgaenge, 'ziel']];
  const quote = (a, b) => !a || !b ? '' : b / a >= 0.001 ? proz(b / a, b / a < 0.01 ? 2 : 1) : `1 je ${kurz(Math.round(a / Math.max(b, 1)))}`;
  const pro10k = j.aufrufe ? anf.length / j.aufrufe * 1e4 : null;
  return html`<ol class="sm-fun">${stufen.map(([l, v, icon], i) => html`<li style="--i:${i}">
      ${i ? html`<span class="sm-q">${(() => { const q = v || stufen[i - 1][1] ? quote(stufen[i - 1][1], v) : ''; return q ? '↓ ' + q : '↓'; })()}</span>` : ''}
      <div class="sm-st"><span class="sm-fi" aria-hidden="true">${ic(icon)}</span><b data-count="${v}" data-fmt="${v >= 1e4 ? 'kurz' : 'int'}">${kurz(v)}</b><span>${l}</span></div></li>`)}</ol>
    <p class="sm-fazit">${pro10k == null ? 'Noch keine Aufrufe im Zeitraum.' : anf.length ? html`<b>${num(pro10k, 2)}</b> Anfragen je 10.000 Aufrufe` : html`Noch keine Anfrage mit Quelle Social Media in diesem Zeitraum. <span class="muted">Trag bei Kontakten aus DMs die Quelle (TikTok, Instagram …) ein, dann zählt der Trichter mit.</span>`}</p>`;
}
/** Kennzahlen eines Beitrags als kurze Zeilen (für Karte, Tooltip und Player) */
function beitragsWerte(p) {
  const w = [[ic('herz', 'Likes'), p.likes, 'Likes'], [ic('sprech', 'Kommentare'), p.kommentare, 'Kommentare'], [ic('teilen', 'Shares'), p.shares, 'Shares']];
  if (p.gespeichert != null) w.push([ic('merken', 'Gespeichert'), p.gespeichert, 'Gespeichert']);
  return w;
}
function postKarte(p, i) {
  const k = KANAL[p.kanal];
  return html`<a class="sm-post" href="${p.url || '#'}" target="_blank" rel="noopener" data-post="${p.url || p.zeit}" style="--i:${i};--k:${k.farbe}" aria-label="${k.name}-Beitrag vom ${fmtDateShort(p.zeit.slice(0, 10))}, ${num(p.aufrufe)} Aufrufe – abspielen">
    <div class="sm-cov">
      <span class="sm-ct">${kuerzen(p.text, 80)}</span>
      ${p.bild ? html`<img data-cover src="${p.bild}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
      <span class="sm-rank">${i + 1}</span><span class="sm-kn"><i class="kd"></i>${k.name}</span>
      <span class="sm-play" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M5 3.2v9.6L13 8Z"/></svg></span>
      <div class="sm-ov">
        <b class="sm-pv">${kurz(p.aufrufe)}<small>Aufrufe${p.reichweite != null ? html` · ${kurz(p.reichweite)} erreicht` : ''}</small></b>
        <div class="sm-pm">${beitragsWerte(p).map(([s, v, t]) => html`<span title="${t}">${s}${kurz(v)}</span>`)}</div>
        ${p.wiedergabe != null || p.komplett != null ? html`<div class="sm-wg">
          ${p.wiedergabe != null ? html`<span title="Ø Wiedergabezeit">${ic('uhr', 'Ø Wiedergabezeit')}Ø ${sek(p.wiedergabe)}</span>` : ''}
          ${p.komplett != null ? html`<span class="sm-wk" title="bis zum Ende angesehen" style="--q:${Math.min(100, Math.max(0, p.komplett)) / 100}"><i aria-hidden="true"></i>${num(p.komplett, 0)} % bis Ende</span>` : ''}
        </div>` : ''}
      </div>
    </div>
    <div class="sm-pb">
      <p>${kuerzen(p.text, 90) || '(ohne Text)'}</p>
      <small>${fmtDateShort(p.zeit.slice(0, 10))} · ${proz(p.er)} Engagement</small>
    </div></a>`;
}
function einsichten(posts, j, v, n) {
  const out = [];
  if (posts.length) {
    const avg = posts.reduce((s, p) => s + p.aufrufe, 0) / posts.length, best = [...posts].sort((a, b) => b.aufrufe - a.aufrufe)[0];
    if (best && avg) out.push(html`<b>Dein stärkster Beitrag</b> „${kuerzen(best.text, 60) || 'ohne Text'}“ hat <b>${num(best.aufrufe / avg, 1)}×</b> so viele Aufrufe wie dein Schnitt (${kurz(Math.round(avg))}).`);
    const grp = (f) => { const m = new Map(); posts.forEach(p => { const g = f(p); if (g == null) return; const a = m.get(g) || []; a.push(p.aufrufe); m.set(g, a); }); return [...m].filter(([, a]) => a.length >= 3).map(([g, a]) => [g, a.reduce((s, x) => s + x, 0) / a.length, a.length]).sort((a, b) => b[1] - a[1]); };
    const wt = grp(p => new Date(p.zeit).getDay());
    if (wt.length >= 2) out.push(html`<b>${WT[wt[0][0]]}s</b> laufen deine Beiträge am besten: Ø ${kurz(Math.round(wt[0][1]))} Aufrufe (${wt[0][2]} Beiträge).`);
    const tz = grp(p => { const h = +p.zeit.slice(11, 13); return isNaN(h) ? null : h < 11 ? 0 : h < 15 ? 1 : h < 18 ? 2 : 3; });
    if (tz.length >= 2) out.push(html`Beste Uhrzeit: <b>${tagesZeit([8, 12, 16, 19][tz[0][0]])}</b> mit Ø ${kurz(Math.round(tz[0][1]))} Aufrufen.`);
    const rechnung = p => /€|cashflow|rendite|afa|rechn/i.test(p.text), mit = posts.filter(rechnung), ohne = posts.filter(p => !rechnung(p));
    if (mit.length >= 2 && ohne.length >= 2) {
      const a = mit.reduce((s, p) => s + p.aufrufe, 0) / mit.length, b = ohne.reduce((s, p) => s + p.aufrufe, 0) / ohne.length, f = a / b;
      out.push(f >= 1.15 ? html`Beiträge <b>mit Rechenbeispiel</b> (€, Cashflow, Rendite) holen Ø <b>${num(f, 1)}×</b> so viele Aufrufe wie die übrigen.` : f <= 0.87 ? html`Beiträge <b>ohne Rechenbeispiel</b> (Touren, Vorher/Nachher, Alltag) holen Ø <b>${num(1 / f, 1)}×</b> so viele Aufrufe wie Rechen-Beiträge.` : html`Rechen-Beiträge und Touren/Vorher-Nachher laufen ähnlich gut (Ø ${kurz(Math.round(a))} vs. ${kurz(Math.round(b))}).`);
    }
    // Wiedergabe: welches Video hält am längsten – nur mit genug Werten
    const mitW = posts.filter(p => p.wiedergabe != null && p.aufrufe > 0);
    if (mitW.length >= 3) {
      const lang = [...mitW].sort((a, b) => b.wiedergabe - a.wiedergabe)[0], schnitt = videoWerte(mitW).wiedergabe;
      out.push(html`Am längsten angesehen: „${kuerzen(lang.text, 50) || 'ohne Text'}“ mit <b>Ø ${sek(lang.wiedergabe)}</b> – dein Schnitt liegt bei ${sek(schnitt)}.`);
    }
    const mitK = posts.filter(p => p.komplett != null && p.aufrufe > 0);
    if (mitK.length >= 3) { const q = videoWerte(mitK).komplett; out.push(html`Im Schnitt schauen <b>${num(q, 0)} %</b> der Zuschauer deine Videos bis zum Ende${q < 20 ? ' – ein stärkerer Einstieg in den ersten 2 Sekunden hält mehr Leute.' : '.'}`); }
  }
  const proWoche = j.posts.length / (n / 7), vorWoche = v.posts.length / (n / 7);
  if (j.posts.length || v.posts.length) out.push(html`Du postest <b>${num(proWoche, 1)}× pro Woche</b>${v.posts.length ? html` (davor ${num(vorWoche, 1)}×)` : ''}.${proWoche < 3 ? ' Mehr Regelmäßigkeit (3–5×/Woche) bringt meist mehr Reichweite.' : ''}`);
  if (j.folgerZuwachs != null && j.follower) { const basis = j.folgerBasis; out.push(html`Follower <b>${j.folgerZuwachs >= 0 ? '+' : ''}${num(j.folgerZuwachs)}</b> in ${n} Tagen${basis > 0 ? html` – das sind <b>${j.folgerZuwachs >= 0 ? '+' : ''}${num(j.folgerZuwachs / basis * 100, 0)} %</b>` : ''}.`); }
  return out.length ? out : [html`Sobald ein paar Beiträge Daten haben, stehen hier Muster: bester Wochentag, beste Uhrzeit, welche Themen ziehen.`];
}
function anfragenListe(anf) {
  if (!anf.length) return html`<p class="empty">Noch keine.<small>Website-Anfragen über die Bio-Links und Kontakte mit Quelle TikTok/Instagram … erscheinen hier.</small></p>`;
  const farbe = q => KANAL[(q || '').toLowerCase()]?.farbe || 'var(--gold)';
  return html`<ul class="list">${[...anf].sort((a, b) => (b.created || '') < (a.created || '') ? -1 : 1).slice(0, 8).map(c => html`<li data-kontakt="${c.id}"><span class="avatar">${(c.vorname || c.nachname || '?').slice(0, 1).toUpperCase()}</span><div class="grow"><div class="ttl">${fullName(c) || c.email || 'Kontakt'}</div><div class="sub"><i class="kd" style="--k:${farbe(c.quelle)}"></i>${c.quelle} · ${fmtDateShort((c.created || '').slice(0, 10))}</div></div></li>`)}</ul>`;
}
function kanalZeile(k, kd) {
  const K = KANAL[k], link = `https://keuerleber-immobilien.de/?utm_source=${k}`;
  return html`<div class="sm-kz" style="--k:${K.farbe}">
    <span class="sm-kb">${K.glyph}</span>
    <div class="grow"><b>${K.name}</b><small>${kd ? html`verbunden${kd.konto ? html` · <a class="lnk" href="${K.profil(kd.konto)}" target="_blank" rel="noopener">@${kd.konto}</a>` : ''}` : html`noch nicht verbunden – <a class="lnk" href="https://app.metricool.com/" target="_blank" rel="noopener">in Metricool verbinden</a>, dann ist ${K.name} beim nächsten Abruf hier`}</small>
      <code class="sm-link">${link}</code></div>
    <button type="button" class="mini" data-copy="${link}">Kopieren</button>
  </div>`;
}
function leer(rec) {
  return html`<div class="sm"><div class="head"><div><h1>Social Media</h1><p class="muted">Reichweite, Follower und Anfragen aus TikTok, Instagram, Facebook und LinkedIn</p></div></div>
    <div class="card sm-leer"><div class="sm-puls" aria-hidden="true"></div><h2>${rec ? 'Noch keine Kanäle in Metricool' : 'Die ersten Zahlen kommen gleich'}</h2>
    <p class="muted">${rec ? 'Verbinde deine Kanäle in Metricool – der Abruf holt sie dann automatisch hierher.' : 'Dreimal täglich holt das CRM deine Zahlen aus Metricool. Sobald der erste Abruf durch ist, erscheint hier dein Dashboard – auf allen Geräten gleichzeitig.'}</p>
    <div class="actions" style="justify-content:center;margin-top:14px"><a class="btn" href="https://app.metricool.com/" target="_blank" rel="noopener">Metricool öffnen</a></div></div></div>`;
}

// ---------------------------------------------------------------- Diagramme (SVG, ohne Bibliothek)
const schritt = roh => { const p = 10 ** Math.floor(Math.log10(roh)); return [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= roh); };
const ticks = (max, n = 4) => { if (max <= 0) return [0, 1]; const s = schritt(max / n), t = []; for (let v = 0; v <= max + s * 0.001; v += s) t.push(v); if (t[t.length - 1] < max) t.push(t[t.length - 1] + s); return t; };
function tip(box) { let t = box.querySelector('.sm-tip'); if (!t) { t = document.createElement('div'); t.className = 'sm-tip'; t.hidden = true; box.appendChild(t); } return t; }
function tipSetzen(t, svg, W, xSvg) {
  t.hidden = false; const r = svg.getBoundingClientRect(), bx = xSvg / W * r.width;
  t.style.left = Math.min(r.width - t.offsetWidth - 4, Math.max(4, bx - t.offsetWidth / 2)) + 'px'; t.style.top = '4px';
}
/** Datums-Beschriftung: gleichmäßige Schritte, erste/letzte nach innen gezogen */
function xLabels(tage, x, H, W) {
  const step = Math.max(1, Math.ceil(tage.length / (W < 520 ? 4 : 7)));
  let s = '';
  tage.forEach((d, i) => { const letzte = i === tage.length - 1; if ((i % step === 0 && (letzte || tage.length - 1 - i >= step * 0.7)) || letzte) s += `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : letzte ? 'end' : 'middle'}">${fmtDateShort(d)}</text>`; });
  return s;
}

/** Aufrufe pro Tag – Säulen, je Kanal gestapelt (eine y-Achse, Farbe = Kanal) */
function tageChart(box, tage, reihen, anim) {
  const W = Math.max(280, box.clientWidth), H = W < 520 ? 180 : 230, L = 44, R = 8, T = 12, B = 26;
  const summe = tage.map((_, i) => reihen.reduce((s, r) => s + (r.v[i] || 0), 0));
  const max = Math.max(1, ...summe), tk = ticks(max, 4), y1 = tk[tk.length - 1];
  const slot = (W - L - R) / tage.length, bw = Math.max(2, Math.min(22, slot * (tage.length > 40 ? 0.7 : 0.62)));
  const y = v => T + (1 - v / y1) * (H - T - B), x = i => L + (i + 0.5) * slot;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  tk.forEach((t, j) => { s += `<line class="${j ? 'g' : 'g0'}" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${kurz(t)}</text>`; });
  tage.forEach((d, i) => {
    if (!summe[i]) return;
    let unten = y(0), teile = '';
    const da = reihen.filter(r => r.v[i] > 0);
    da.forEach((r, j) => {
      // Höhe des Teilstücks; ab dem zweiten 1px Naht darunter, nur das oberste Stück hat runde Ecken
      const hh = Math.max(1.5, y(0) - y(r.v[i])), yo = unten - hh, x0 = x(i) - bw / 2, rr = j === da.length - 1 ? Math.min(3, bw / 2, hh) : 0, naht = j ? 1 : 0;
      teile += rr ? `<path style="--k:${KANAL[r.k].farbe}" d="M${x0},${unten - naht}V${yo + rr}Q${x0},${yo} ${x0 + rr},${yo}H${x0 + bw - rr}Q${x0 + bw},${yo} ${x0 + bw},${yo + rr}V${unten - naht}Z"/>`
        : `<rect style="--k:${KANAL[r.k].farbe}" x="${x0}" y="${yo}" width="${bw}" height="${Math.max(1, hh - naht)}"/>`;
      unten = yo;
    });
    s += `<g class="sb" data-i="${i}" style="--i:${i}">${teile}</g>`;
  });
  s += xLabels(tage, x, H, W);
  tage.forEach((_, i) => { s += `<rect class="hitb" data-i="${i}" x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}"/>`; });
  s += '</svg>';
  box.innerHTML = s; box.classList.toggle('anim', !!anim);
  const svg = box.querySelector('svg'), t = tip(box);
  const zeig = i => {
    svg.querySelectorAll('.sb').forEach(b => b.classList.toggle('dim', +b.dataset.i !== i));
    t.innerHTML = `<b>${esc(datumLang(tage[i]))}</b>` + (reihen.length > 1 ? reihen.map(r => `<div><i class="kd" style="--k:${KANAL[r.k].farbe}"></i>${KANAL[r.k].name}<span>${num(r.v[i] || 0)}</span></div>`).join('') : '') + `<div class="sum">Aufrufe<span>${num(summe[i])}</span></div>`;
    tipSetzen(t, svg, W, x(i));
  };
  svg.querySelectorAll('.hitb').forEach(h => { const i = +h.dataset.i; h.addEventListener('pointerenter', () => zeig(i)); h.addEventListener('pointerdown', () => zeig(i)); });
  svg.addEventListener('pointerleave', () => { t.hidden = true; svg.querySelectorAll('.sb').forEach(b => b.classList.remove('dim')); });
}

function followerChart(box, K, ks, tage, anim) {
  const W = Math.max(280, box.clientWidth), H = W < 520 ? 210 : W < 800 ? 250 : 290, L = 46, R = 70, T = 14, B = 26;
  const reihen = ks.map(k => ({ k, v: followerReihe(K[k], tage) }));
  const alle = reihen.flatMap(r => r.v).filter(v => v != null);
  if (!alle.length) { box.innerHTML = '<p class="empty">Noch keine Follower-Werte im Zeitraum.</p>'; return; }
  const lo = Math.min(...alle), hi = Math.max(...alle), pad = Math.max(1, (hi - lo) * 0.12);
  const st = schritt(Math.max(1, hi + pad - Math.max(0, lo - pad)) / 4), y0 = Math.max(0, Math.floor((lo - pad) / st) * st), y1 = Math.ceil((hi + pad) / st) * st;
  const tk = []; for (let v = y0; v <= y1 + st * 0.001; v += st) tk.push(v);
  const x = i => L + (tage.length > 1 ? i / (tage.length - 1) : 0.5) * (W - L - R), y = v => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  if (ks.length === 1) s += `<defs><linearGradient id="smFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${KANAL[ks[0]].farbe}" stop-opacity=".22"/><stop offset="1" stop-color="${KANAL[ks[0]].farbe}" stop-opacity="0"/></linearGradient></defs>`;
  tk.forEach((t, j) => { s += `<line class="${j ? 'g' : 'g0'}" x1="${L}" x2="${W - R + 8}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${kurz(Math.round(t))}</text>`; });
  s += xLabels(tage, x, H, W);
  const labels = [];
  reihen.forEach(({ k, v }, ri) => {
    const pts = v.map((val, i) => [i, val]).filter(([, val]) => val != null); if (!pts.length) return;
    const d = pts.map(([i, val], j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join('');
    if (ks.length === 1) s += `<path class="area" d="${d}L${x(pts[pts.length - 1][0]).toFixed(1)},${y(y0)}L${x(pts[0][0]).toFixed(1)},${y(y0)}Z"/>`;
    s += `<path class="ln" style="--k:${KANAL[k].farbe};--d:${ri * 0.15}s" d="${d}" pathLength="1"/>`;
    const [li, lv] = pts[pts.length - 1];
    s += `<circle class="end" style="--k:${KANAL[k].farbe}" cx="${x(li)}" cy="${y(lv)}" r="4.5"/>`;
    labels.push({ y: y(lv), t: num(lv), x: x(li), k });
  });
  labels.sort((a, b) => a.y - b.y).forEach((l, i, a) => { if (i && l.y - a[i - 1].y < 15) l.y = a[i - 1].y + 15; s += `<text class="lbl" x="${l.x + 10}" y="${l.y + 4}">${l.t}</text>`; });
  s += `<line class="xh" y1="${T}" y2="${H - B}" x1="0" x2="0" style="opacity:0"/>${reihen.map(r => `<circle class="hd" r="4" style="--k:${KANAL[r.k].farbe};opacity:0"/>`).join('')}<rect class="hit" x="${L}" y="0" width="${W - L - R}" height="${H}"/></svg>`;
  box.innerHTML = s; box.classList.toggle('anim', !!anim);
  const svg = box.querySelector('svg'), xh = svg.querySelector('.xh'), dots = [...svg.querySelectorAll('.hd')], t = tip(box);
  const zeig = e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(tage.length - 1, Math.round((px - L) / ((W - L - R) / Math.max(1, tage.length - 1)))));
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.style.opacity = 1;
    reihen.forEach(({ v }, j) => { const d = dots[j]; if (v[i] == null) { d.style.opacity = 0; return; } d.setAttribute('cx', x(i)); d.setAttribute('cy', y(v[i])); d.style.opacity = 1; });
    t.innerHTML = `<b>${esc(datumLang(tage[i]))}</b>` + reihen.map(({ k, v }) => `<div><i class="kd" style="--k:${KANAL[k].farbe}"></i>${KANAL[k].name}<span>${v[i] == null ? '–' : num(v[i])}</span></div>`).join('');
    tipSetzen(t, svg, W, x(i));
  };
  const weg = () => { xh.style.opacity = 0; dots.forEach(d => { d.style.opacity = 0; }); t.hidden = true; };
  svg.querySelector('.hit').addEventListener('pointermove', zeig); svg.querySelector('.hit').addEventListener('pointerdown', zeig); svg.addEventListener('pointerleave', weg);
}

function postsChart(box, posts, avg, von, bis, anim, oeffnen) {
  const W = Math.max(280, box.clientWidth), H = W < 520 ? 190 : 220, L = 46, R = 12, T = 18, B = 26;
  const ps = [...posts].sort((a, b) => a.zeit < b.zeit ? -1 : 1), max = Math.max(...ps.map(p => p.aufrufe), avg, 1), tk = ticks(max, 3), y1 = tk[tk.length - 1];
  const slot = (W - L - R) / ps.length, bw = Math.max(3, Math.min(24, slot - 2));
  const y = v => T + (1 - v / y1) * (H - T - B), x = i => L + i * slot + (slot - bw) / 2;
  const top3 = new Set([...ps].sort((a, b) => b.aufrufe - a.aufrufe).slice(0, 3));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  tk.forEach((t, j) => { s += `<line class="${j ? 'g' : 'g0'}" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${kurz(t)}</text>`; });
  ps.forEach((p, i) => {
    const h = Math.max(2, y(0) - y(p.aufrufe)), r = Math.min(4, bw / 2, h);
    const x0 = x(i), yt = y(0) - h;
    s += `<path class="bar" data-i="${i}" style="--k:${KANAL[p.kanal].farbe};--i:${i}" d="M${x0},${y(0)}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${y(0)}Z"/>`;
    if (top3.has(p) && bw >= 10) s += `<text class="lbl top" x="${x0 + bw / 2}" y="${yt - 5}" text-anchor="middle">${kurz(p.aufrufe)}</text>`;
  });
  if (avg) s += `<line class="avg" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}"/>`;
  s += `<text class="ax" x="${L}" y="${H - 6}">${fmtDateShort(von)}</text><text class="ax" x="${W - R}" y="${H - 6}" text-anchor="end">${fmtDateShort(bis)}</text>`;
  ps.forEach((p, i) => { s += `<rect class="hitb" data-i="${i}" x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}"/>`; });
  s += '</svg>';
  box.innerHTML = s; box.classList.toggle('anim', !!anim);
  const svg = box.querySelector('svg'), t = tip(box);
  let aktiv = -1;
  const zeig = (e, i) => {
    const p = ps[i]; aktiv = i;
    svg.querySelectorAll('.bar').forEach(b => b.classList.toggle('dim', +b.dataset.i !== i));
    const zus = [p.reichweite != null ? ['Reichweite', num(p.reichweite)] : null, p.gespeichert != null ? ['Gespeichert', num(p.gespeichert)] : null, p.wiedergabe != null ? ['Ø Wiedergabe', sek(p.wiedergabe)] : null, p.komplett != null ? ['bis zum Ende', num(p.komplett, 0) + ' %'] : null].filter(Boolean);
    t.innerHTML = `<b>${esc(datumLang(p.zeit))} · ${esc(p.zeit.slice(11, 16))}</b><p>${esc(kuerzen(p.text, 70) || '(ohne Text)')}</p><div><i class="kd" style="--k:${KANAL[p.kanal].farbe}"></i>Aufrufe<span>${num(p.aufrufe)}</span></div><div>Likes · Kommentare · Shares<span>${num(p.likes)} · ${num(p.kommentare)} · ${num(p.shares)}</span></div>` + zus.map(([l, w]) => `<div>${l}<span>${esc(w)}</span></div>`).join('');
    tipSetzen(t, svg, W, L + (i + 0.5) * slot);
  };
  svg.querySelectorAll('.hitb').forEach(h => {
    const i = +h.dataset.i;
    h.addEventListener('pointerenter', e => zeig(e, i));
    h.addEventListener('click', () => { if (matchMedia('(hover:none)').matches && aktiv !== i) return; oeffnen(ps[i]); });
    h.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') zeig(e, i); });
  });
  svg.addEventListener('pointerleave', () => { aktiv = -1; t.hidden = true; svg.querySelectorAll('.bar').forEach(b => b.classList.remove('dim')); });
}

// Zahlen hochzählen (nur beim ersten Anzeigen bzw. nach Wechsel des Zeitraums)
function zaehlen(root) {
  const els = [...root.querySelectorAll('[data-count]')], t0 = performance.now(), dauer = 1100;
  const ziel = els.map(e => [e, +e.dataset.count, FMT[e.dataset.fmt] || FMT.int]);
  const tick = now => {
    const p = Math.min(1, (now - t0) / dauer), e = 1 - (1 - p) ** 4;
    ziel.forEach(([el, v, fmt]) => { el.textContent = fmt(v * e); });
    if (p < 1) requestAnimationFrame(tick); else ziel.forEach(([el, v, fmt]) => { el.textContent = fmt(v); });
  };
  requestAnimationFrame(tick);
}

// Beitrag direkt im CRM abspielen (TikTok/Instagram-Player), sonst Link öffnen
function ansehen(p) {
  if (!p) return;
  const id = videoId(p), K = KANAL[p.kanal];
  const src = p.kanal === 'tiktok' && /^\d+$/.test(id) ? `https://www.tiktok.com/player/v1/${id}?autoplay=1&description=1&rel=0` : p.kanal === 'instagram' && id ? `https://www.instagram.com/p/${id}/embed` : '';
  if (!src) { if (p.url) window.open(p.url, '_blank', 'noopener'); return; }
  const werte = [['Aufrufe', num(p.aufrufe)], p.reichweite != null ? ['Reichweite', num(p.reichweite)] : null, ['Likes', num(p.likes)], ['Kommentare', num(p.kommentare)], ['Shares', num(p.shares)],
    p.gespeichert != null ? ['Gespeichert', num(p.gespeichert)] : null, p.wiedergabe != null ? ['Ø Wiedergabe', sek(p.wiedergabe)] : null, p.komplett != null ? ['bis zum Ende', num(p.komplett, 0) + ' %'] : null, ['Engagement', proz(p.er)]].filter(Boolean);
  const bg = document.createElement('div'); bg.className = 'modal-bg sm-view';
  bg.innerHTML = `<div class="sm-player" role="dialog" aria-modal="true" aria-label="${esc(K.name)}-Beitrag" style="--k:${K.farbe}"><button type="button" class="x" aria-label="Schließen">×</button>
    <iframe src="${esc(src)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
    <div class="sm-pinfo"><div class="sm-pkopf"><span><i class="kd"></i>${esc(K.name)} · ${esc(fmtDateShort(p.zeit.slice(0, 10)))}</span><a class="lnk" href="${esc(p.url)}" target="_blank" rel="noopener">bei ${esc(K.name)} öffnen ↗</a></div>
      <dl>${werte.map(([l, w]) => `<div><dt>${esc(l)}</dt><dd>${esc(w)}</dd></div>`).join('')}</dl>
      ${p.komplett != null ? `<div class="sm-pk" style="--q:${Math.min(100, Math.max(0, p.komplett)) / 100}" aria-hidden="true"><i></i></div>` : ''}</div></div>`;
  const zu = () => { bg.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') zu(); };
  bg.addEventListener('mousedown', e => { if (e.target === bg) zu(); });
  bg.querySelector('.x').onclick = zu; document.addEventListener('keydown', key);
  document.getElementById('modal-root').appendChild(bg);
}
