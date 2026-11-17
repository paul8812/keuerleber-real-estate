// Social Media – Reichweite, Follower, Top-Beiträge und was davon als Anfrage im CRM ankommt.
// Die Zahlen liefert ein täglicher Abruf aus Metricool (Datensatz social/social-stats, siehe SOCIAL_SQL in db.js).
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

// ---------------------------------------------------------------- Daten
const zahl = v => v == null || v === '' || isNaN(+v) ? null : +v;
function zeitAus(v) {
  const s = String(v ?? '');
  if (/^\d{14}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}`;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 16) : '';
}
/** Rohdaten (Zeilen wie von Metricool geliefert, Spaltennamen in „spalten“) → je Kanal Tageswerte + Beiträge */
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
    const posts = (kd.beitraege?.zeilen || []).filter(Array.isArray).map(z => ({
      kanal: k, zeit: zeitAus(z[p('zeit')]), url: String(z[p('url')] ?? ''), bild: String(z[p('bild')] ?? ''), text: String(z[p('text')] ?? '').trim(),
      aufrufe: zahl(z[p('aufrufe')]) || 0, likes: zahl(z[p('likes')]) || 0, kommentare: zahl(z[p('kommentare')]) || 0, shares: zahl(z[p('shares')]) || 0,
    })).filter(x => x.zeit && !seen.has(x.url || x.zeit) && seen.add(x.url || x.zeit));
    posts.forEach(x => { x.inter = x.likes + x.kommentare + x.shares; x.er = x.aufrufe ? x.inter / x.aufrufe : 0; });
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
  return { tage, erstAb, follower: fDa ? fEnde : null, folgerZuwachs: fDa && fZu ? zuwachs : null, folgerBasis: basis, folgerStart: fStart, followerTag: follower, zuwachsTag, aufrufe, aufrufeTag, inter, er: aufrufe ? inter / aufrufe : null, posts };
}
const anfragenIm = (von, bis) => db.all('contacts').filter(c => SOCIAL_QUELLEN.includes(c.quelle) && (c.created || '').slice(0, 10) >= von && (c.created || '').slice(0, 10) <= bis);

// ---------------------------------------------------------------- Formate
const kurz = n => n == null ? '–' : Math.abs(n) >= 1e6 ? num(n / 1e6, 1) + ' Mio.' : Math.abs(n) >= 1e4 ? num(n / 1e3, n >= 1e5 ? 0 : 1) + ' Tsd.' : num(n);
const proz = (x, d = 1) => x == null || !isFinite(x) ? '–' : num(x * 100, d) + ' %';
function delta(jetzt, vorher, { pp = false, gutWennHoch = true } = {}) {
  if (jetzt == null || vorher == null) return '';
  const diff = pp ? (jetzt - vorher) * 100 : vorher ? (jetzt - vorher) / vorher * 100 : null;
  if (diff == null || !isFinite(diff)) return jetzt > 0 && !vorher ? html`<em class="sd up">neu</em>` : '';
  if (Math.abs(diff) < 0.05) return html`<em class="sd">± 0 ${pp ? 'Pkt.' : '%'}</em>`;
  const hoch = diff > 0, gut = hoch === gutWennHoch;
  return html`<em class="sd ${gut ? 'up' : 'down'}" title="gegenüber dem Zeitraum davor">${hoch ? '▲' : '▼'} ${num(Math.abs(diff), 1)} ${pp ? 'Pkt.' : '%'}</em>`;
}
const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const tagesZeit = h => h < 11 ? 'morgens (vor 11 Uhr)' : h < 15 ? 'mittags (11–15 Uhr)' : h < 18 ? 'nachmittags (15–18 Uhr)' : 'abends (ab 18 Uhr)';
const kuerzen = (t, n) => { const s = t.replace(/\s+/g, ' ').replace(/#\S+/g, '').trim() || t.trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const videoId = p => (p.url.match(/\/video\/(\d+)/) || p.url.match(/\/(?:p|reel)\/([\w-]+)/) || [])[1] || '';

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
  const anf = anfragenIm(von, bis), anfVorher = anfragenIm(vVon, vBis);
  const sig = `${n}|${auswahl}|${rec.empfangen || stand}`;
  const animieren = sig !== gezeigt && !ruhig(); gezeigt = sig;
  const avg = jetzt.posts.length ? jetzt.posts.reduce((s, p) => s + p.aufrufe, 0) / jetzt.posts.length : 0;
  const avgVorher = davor.posts.length ? davor.posts.reduce((s, p) => s + p.aufrufe, 0) / davor.posts.length : null;
  const allePosts = auswahl.flatMap(k => K[k].posts);
  const top = [...(jetzt.posts.length >= 3 ? jetzt.posts : allePosts)].sort((a, b) => b.aufrufe - a.aufrufe).slice(0, 6);
  const topAusZeitraum = jetzt.posts.length >= 3;

  el.innerHTML = String(html`<div class="sm ${animieren ? 'go' : 'still'}">
    <div class="head sm-head">
      <div><h1>Social Media</h1><p class="muted">${stand ? html`Stand ${fmtStand(stand)} · ` : ''}Daten von Metricool · aktualisiert sich jeden Morgen automatisch</p></div>
      <div class="sm-ctrl">
        <div class="seg" role="group" aria-label="Zeitraum">${ZEITRAEUME.map(([t, l]) => html`<button type="button" data-tage="${t}" class="${t === n ? 'on' : ''}" aria-pressed="${t === n}">${l}</button>`)}</div>
        ${verbunden.length > 1 ? html`<div class="seg" role="group" aria-label="Kanal"><button type="button" data-kanal="alle" class="${zustand.kanal === 'alle' ? 'on' : ''}">Alle</button>${verbunden.map(k => html`<button type="button" data-kanal="${k}" class="${zustand.kanal === k ? 'on' : ''}"><i class="kd" style="--k:${KANAL[k].farbe}"></i>${KANAL[k].name}</button>`)}</div>` : ''}
      </div>
    </div>

    <section class="sm-kpis">
      ${kpi('Follower', jetzt.follower, kurz, jetzt.folgerZuwachs != null ? html`<em class="sd ${jetzt.folgerZuwachs >= 0 ? 'up' : 'down'}">${jetzt.folgerZuwachs >= 0 ? '▲ +' : '▼ '}${num(jetzt.folgerZuwachs)} in ${n} Tagen</em>` : '', jetzt.followerTag, 0)}
      ${kpi('Aufrufe', jetzt.aufrufe, kurz, delta(jetzt.aufrufe, davor.aufrufe), jetzt.aufrufeTag, 1, 'Aufrufe der Beiträge aus dem Zeitraum')}
      ${kpi('Interaktionen', jetzt.inter, kurz, delta(jetzt.inter, davor.inter), null, 2, 'Likes, Kommentare und Shares')}
      ${kpi('Engagement-Rate', jetzt.er, x => proz(x), delta(jetzt.er, davor.er, { pp: true }), null, 3, 'Interaktionen je Aufruf')}
      ${kpi('Beiträge', jetzt.posts.length, num, avg ? html`<em class="sd">Ø ${kurz(Math.round(avg))} Aufrufe ${avgVorher ? delta(avg, avgVorher) : ''}</em>` : '', null, 4)}
      ${kpi('Anfragen aus Social', anf.length, num, delta(anf.length, anfVorher.length), null, 5, 'Neue Kontakte im CRM mit Quelle TikTok, Instagram, Facebook, LinkedIn oder Social Media')}
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
        ${tabelle(['Datum', 'Kanal', 'Beitrag', 'Aufrufe', 'Likes', 'Kommentare', 'Shares'], [...jetzt.posts].sort((a, b) => a.zeit < b.zeit ? 1 : -1).map(p => [fmtDateShort(p.zeit.slice(0, 10)), KANAL[p.kanal].name, kuerzen(p.text, 60), num(p.aufrufe), num(p.likes), num(p.kommentare), num(p.shares)]), 'Beiträge als Tabelle')}`
        : html`<p class="empty">In diesem Zeitraum wurde nichts veröffentlicht.</p>`}
    </section>

    <section class="card sm-card">
      <div class="sm-ch"><div><h2>Top-Beiträge</h2><p class="muted small">${topAusZeitraum ? `die stärksten der letzten ${n} Tage` : 'die stärksten insgesamt (im Zeitraum zu wenige)'} · antippen zum Abspielen</p></div></div>
      <div class="sm-top">${top.map((p, i) => postKarte(p, i))}</div>
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
  root.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = '✓ kopiert'; setTimeout(() => { b.textContent = 'Kopieren'; }, 1600); } catch { prompt('Link kopieren:', b.dataset.copy); } });
  root.querySelectorAll('[data-post]').forEach(b => b.onclick = e => { e.preventDefault(); ansehen(allePosts.find(p => (p.url || p.zeit) === b.dataset.post)); });
  root.querySelectorAll('[data-kontakt]').forEach(li => li.onclick = () => { location.hash = '#/kontakte/' + li.dataset.kontakt; });
  root.querySelectorAll('img[data-cover]').forEach(img => { img.onerror = () => { img.remove(); }; if (img.complete && !img.naturalWidth) img.remove(); });

  const zeichnen = (anim) => {
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
function kpi(label, wert, fmt, unten, reihe, i, hilfe = '') {
  const v = wert == null ? '–' : fmt(wert);
  return html`<div class="sm-kpi" style="--i:${i}" ${hilfe ? raw(`title="${esc(hilfe)}"`) : ''}>
    <span class="sm-kl">${label}</span>
    <b class="sm-kv" ${wert != null && isFinite(wert) ? raw(`data-count="${wert}" data-fmt="${label === 'Engagement-Rate' ? 'pct' : wert >= 1e4 ? 'kurz' : 'int'}"`) : ''}>${v}</b>
    <span class="sm-kd">${unten || raw('&nbsp;')}</span>
    ${reihe ? spark(reihe) : ''}
  </div>`;
}
function spark(reihe) {
  const w = 120, h = 28, pts = reihe.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return '';
  const max = Math.max(...pts.map(p => p[1])), min = Math.min(...pts.map(p => p[1])), sp = max - min || 1;
  const d = pts.map(([i, v], j) => `${j ? 'L' : 'M'}${(i / (reihe.length - 1) * w).toFixed(1)},${(h - 3 - (v - min) / sp * (h - 6)).toFixed(1)}`).join('');
  return html`<svg class="sm-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" pathLength="1"/></svg>`;
}
const legende = ks => ks.length > 1 ? html`<div class="sm-leg">${ks.map(k => html`<span><i class="kd" style="--k:${KANAL[k].farbe}"></i>${KANAL[k].name}</span>`)}</div>` : '';
function tabelle(kopf, zeilen, titel) {
  return html`<details class="sm-tab"><summary>${titel}</summary><div class="sm-tabw"><table class="tbl"><thead><tr>${kopf.map(k => html`<th>${k}</th>`)}</tr></thead><tbody>${zeilen.map(z => html`<tr>${z.map(c => html`<td>${c}</td>`)}</tr>`)}</tbody></table></div></details>`;
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
  const stufen = [['Aufrufe', j.aufrufe], ['Interaktionen', j.inter], ['Neue Follower', Math.max(0, neu)], ['Anfragen im CRM', anf.length], ['Vorgänge', vorgaenge]];
  const quote = (a, b) => !a || !b ? '' : b / a >= 0.001 ? proz(b / a, b / a < 0.01 ? 2 : 1) : `1 je ${kurz(Math.round(a / Math.max(b, 1)))}`;
  const pro10k = j.aufrufe ? anf.length / j.aufrufe * 1e4 : null;
  return html`<ol class="sm-fun">${stufen.map(([l, v], i) => html`<li style="--i:${i}">
      ${i ? html`<span class="sm-q">${v || stufen[i - 1][1] ? quote(stufen[i - 1][1], v) || '–' : '–'}</span>` : ''}
      <div class="sm-st"><b data-count="${v}" data-fmt="${v >= 1e4 ? 'kurz' : 'int'}">${kurz(v)}</b><span>${l}</span></div></li>`)}</ol>
    <p class="sm-fazit">${pro10k == null ? 'Noch keine Aufrufe im Zeitraum.' : anf.length ? html`<b>${num(pro10k, 2)}</b> Anfragen je 10.000 Aufrufe` : html`Noch keine Anfrage mit Quelle Social Media in diesem Zeitraum. <span class="muted">Trag bei Kontakten aus DMs die Quelle (TikTok, Instagram …) ein, dann zählt der Trichter mit.</span>`}</p>`;
}
function postKarte(p, i) {
  const k = KANAL[p.kanal];
  return html`<a class="sm-post" href="${p.url || '#'}" target="_blank" rel="noopener" data-post="${p.url || p.zeit}" style="--i:${i};--k:${k.farbe}">
    <div class="sm-cov"><span class="sm-g">${k.glyph}</span><span class="sm-ct">${kuerzen(p.text, 70)}</span>${p.bild ? html`<img data-cover src="${p.bild}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span class="sm-rank">#${i + 1}</span><span class="sm-play" aria-hidden="true">▶</span></div>
    <div class="sm-pb">
      <b class="sm-pv">${kurz(p.aufrufe)}<small> Aufrufe</small></b>
      <div class="sm-pm"><span title="Likes">♥ ${kurz(p.likes)}</span><span title="Kommentare">💬 ${kurz(p.kommentare)}</span><span title="Shares">↗ ${kurz(p.shares)}</span><span title="Engagement-Rate">${proz(p.er)}</span></div>
      <p>${kuerzen(p.text, 90) || '(ohne Text)'}</p>
      <small><i class="kd" style="--k:${k.farbe}"></i>${k.name} · ${fmtDateShort(p.zeit.slice(0, 10))}</small>
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
    <div class="grow"><b>${K.name}</b><small>${kd ? html`verbunden${kd.konto ? html` · <a class="lnk" href="${K.profil(kd.konto)}" target="_blank" rel="noopener">@${kd.konto}</a>` : ''}` : html`noch nicht verbunden – <a class="lnk" href="https://app.metricool.com/" target="_blank" rel="noopener">in Metricool verbinden</a>, dann ist ${K.name} ab dem nächsten Morgen hier`}</small>
      <code class="sm-link">${link}</code></div>
    <button type="button" class="mini" data-copy="${link}">Kopieren</button>
  </div>`;
}
function leer(rec) {
  return html`<div class="sm"><div class="head"><div><h1>Social Media</h1><p class="muted">Reichweite, Follower und Anfragen aus TikTok, Instagram, Facebook und LinkedIn</p></div></div>
    <div class="card sm-leer"><div class="sm-puls" aria-hidden="true"></div><h2>${rec ? 'Noch keine Kanäle in Metricool' : 'Die ersten Zahlen kommen gleich'}</h2>
    <p class="muted">${rec ? 'Verbinde deine Kanäle in Metricool – der tägliche Abruf holt sie dann automatisch hierher.' : 'Jeden Morgen holt das CRM deine Zahlen aus Metricool. Sobald der erste Abruf durch ist, erscheint hier dein Dashboard – auf allen Geräten gleichzeitig.'}</p>
    <div class="actions" style="justify-content:center;margin-top:14px"><a class="btn" href="https://app.metricool.com/" target="_blank" rel="noopener">Metricool öffnen</a></div></div></div>`;
}

// ---------------------------------------------------------------- Diagramme (SVG, ohne Bibliothek)
const NS = 'http://www.w3.org/2000/svg';
const schritt = roh => { const p = 10 ** Math.floor(Math.log10(roh)); return [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= roh); };
const ticks = (max, n = 4) => { if (max <= 0) return [0, 1]; const roh = max / n, p = 10 ** Math.floor(Math.log10(roh)), s = [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= roh); const t = []; for (let v = 0; v <= max + s * 0.001; v += s) t.push(v); if (t[t.length - 1] < max) t.push(t[t.length - 1] + s); return t; };
function tip(box) { let t = box.querySelector('.sm-tip'); if (!t) { t = document.createElement('div'); t.className = 'sm-tip'; t.hidden = true; box.appendChild(t); } return t; }

function followerChart(box, K, ks, tage, anim) {
  const W = Math.max(280, box.clientWidth), H = W < 520 ? 210 : W < 800 ? 250 : 300, L = 46, R = 74, T = 14, B = 26;
  const reihen = ks.map(k => ({ k, v: followerReihe(K[k], tage) }));
  const alle = reihen.flatMap(r => r.v).filter(v => v != null);
  if (!alle.length) { box.innerHTML = '<p class="empty">Noch keine Follower-Werte im Zeitraum.</p>'; return; }
  const lo = Math.min(...alle), hi = Math.max(...alle), pad = Math.max(1, (hi - lo) * 0.12);
  const st = schritt(Math.max(1, hi + pad - Math.max(0, lo - pad)) / 4), y0 = Math.max(0, Math.floor((lo - pad) / st) * st), y1 = Math.ceil((hi + pad) / st) * st;
  const tk = []; for (let v = y0; v <= y1 + st * 0.001; v += st) tk.push(v);
  const x = i => L + (tage.length > 1 ? i / (tage.length - 1) : 0.5) * (W - L - R), y = v => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  const step = Math.max(1, Math.ceil(tage.length / (W < 520 ? 4 : 7)));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  tk.forEach(t => { s += `<line class="g" x1="${L}" x2="${W - R + 8}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${kurz(Math.round(t))}</text>`; });
  tage.forEach((d, i) => { const letzte = i === tage.length - 1; if ((i % step === 0 && (letzte || tage.length - 1 - i >= step * 0.7)) || letzte) s += `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === tage.length - 1 ? 'end' : 'middle'}">${fmtDateShort(d)}</text>`; });
  const labels = [];
  reihen.forEach(({ k, v }, ri) => {
    const pts = v.map((val, i) => [i, val]).filter(([, val]) => val != null); if (!pts.length) return;
    const d = pts.map(([i, val], j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join('');
    if (ks.length === 1) s += `<path class="area" style="--k:${KANAL[k].farbe}" d="${d}L${x(pts[pts.length - 1][0]).toFixed(1)},${y(y0)}L${x(pts[0][0]).toFixed(1)},${y(y0)}Z"/>`;
    s += `<path class="ln" style="--k:${KANAL[k].farbe};--d:${ri * 0.15}s" d="${d}" pathLength="1"/>`;
    const [li, lv] = pts[pts.length - 1];
    s += `<circle class="end" style="--k:${KANAL[k].farbe}" cx="${x(li)}" cy="${y(lv)}" r="4.5"/>`;
    labels.push({ y: y(lv), t: num(lv), x: x(li) });
  });
  labels.sort((a, b) => a.y - b.y).forEach((l, i, a) => { if (i && l.y - a[i - 1].y < 14) l.y = a[i - 1].y + 14; s += `<text class="lbl" x="${l.x + 10}" y="${l.y + 4}">${l.t}</text>`; });
  s += `<line class="xh" y1="${T}" y2="${H - B}" x1="0" x2="0" style="opacity:0"/><rect class="hit" x="${L}" y="0" width="${W - L - R}" height="${H}"/></svg>`;
  box.innerHTML = s; box.classList.toggle('anim', !!anim);
  const svg = box.querySelector('svg'), xh = svg.querySelector('.xh'), t = tip(box);
  const zeig = e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(tage.length - 1, Math.round((px - L) / ((W - L - R) / Math.max(1, tage.length - 1)))));
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.style.opacity = 1;
    t.innerHTML = `<b>${esc(new Date(tage[i] + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }))}</b>` + reihen.map(({ k, v }) => `<div><i class="kd" style="--k:${KANAL[k].farbe}"></i>${KANAL[k].name}<span>${v[i] == null ? '–' : num(v[i])}</span></div>`).join('');
    t.hidden = false; const bx = x(i) / W * r.width; t.style.left = Math.min(r.width - t.offsetWidth - 4, Math.max(4, bx - t.offsetWidth / 2)) + 'px'; t.style.top = '4px';
  };
  const weg = () => { xh.style.opacity = 0; t.hidden = true; };
  svg.querySelector('.hit').addEventListener('pointermove', zeig); svg.querySelector('.hit').addEventListener('pointerdown', zeig); svg.addEventListener('pointerleave', weg);
}

function postsChart(box, posts, avg, von, bis, anim, oeffnen) {
  const W = Math.max(280, box.clientWidth), H = W < 520 ? 190 : 220, L = 46, R = 12, T = 18, B = 26;
  const ps = [...posts].sort((a, b) => a.zeit < b.zeit ? -1 : 1), max = Math.max(...ps.map(p => p.aufrufe), avg, 1), tk = ticks(max, 3), y1 = tk[tk.length - 1];
  const slot = (W - L - R) / ps.length, bw = Math.max(3, Math.min(24, slot - 2));
  const y = v => T + (1 - v / y1) * (H - T - B), x = i => L + i * slot + (slot - bw) / 2;
  const top3 = new Set([...ps].sort((a, b) => b.aufrufe - a.aufrufe).slice(0, 3));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  tk.forEach(t => { s += `<line class="g" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${kurz(t)}</text>`; });
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
    t.innerHTML = `<b>${esc(new Date(p.zeit).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }))} · ${esc(p.zeit.slice(11, 16))}</b><p>${esc(kuerzen(p.text, 70) || '(ohne Text)')}</p><div><i class="kd" style="--k:${KANAL[p.kanal].farbe}"></i>Aufrufe<span>${num(p.aufrufe)}</span></div><div>Likes · Kommentare · Shares<span>${num(p.likes)} · ${num(p.kommentare)} · ${num(p.shares)}</span></div>`;
    t.hidden = false; const r = svg.getBoundingClientRect(), bx = (L + (i + 0.5) * slot) / W * r.width;
    t.style.left = Math.min(r.width - t.offsetWidth - 4, Math.max(4, bx - t.offsetWidth / 2)) + 'px'; t.style.top = '4px';
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
  const els = [...root.querySelectorAll('[data-count]')], t0 = performance.now(), dauer = 900;
  const f = { int: v => num(Math.round(v)), kurz: v => kurz(Math.round(v)), pct: v => proz(v) };
  const ziel = els.map(e => [e, +e.dataset.count, f[e.dataset.fmt] || f.int]);
  const tick = now => {
    const p = Math.min(1, (now - t0) / dauer), e = 1 - (1 - p) ** 3;
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
  const bg = document.createElement('div'); bg.className = 'modal-bg sm-view';
  bg.innerHTML = `<div class="sm-player" role="dialog" aria-modal="true" aria-label="${esc(K.name)}-Beitrag"><button type="button" class="x" aria-label="Schließen">×</button>
    <iframe src="${esc(src)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
    <div class="sm-pinfo"><b>${esc(num(p.aufrufe))} Aufrufe</b><span>♥ ${esc(num(p.likes))} · 💬 ${esc(num(p.kommentare))} · ↗ ${esc(num(p.shares))}</span><a class="lnk" href="${esc(p.url)}" target="_blank" rel="noopener">bei ${esc(K.name)} öffnen ↗</a></div></div>`;
  const zu = () => { bg.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') zu(); };
  bg.addEventListener('mousedown', e => { if (e.target === bg) zu(); });
  bg.querySelector('.x').onclick = zu; document.addEventListener('keydown', key);
  document.getElementById('modal-root').appendChild(bg);
}
