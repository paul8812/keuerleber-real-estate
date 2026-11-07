// Dashboard für Master: Kennzahlen, Diagramme und Pipeline aus Objekten und Rückmeldungen der Vertriebe.
import { STAGES, stageOf, chains } from './fb.js';
import { esc, eur } from './app.js';

const VS = { frei: 'Frei', reserviert: 'Reserviert', notar: 'Notartermin', verkauft: 'Verkauft' };
const VCOL = { frei: 'var(--schiefer)', reserviert: 'var(--warn)', notar: 'var(--gold)', verkauft: 'var(--gut)' };
const titel = (o) => `${o.strasse}${o.lage ? ' · ' + o.lage : ''}`;
const dt = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} Min.` : m < 1440 ? `vor ${Math.round(m / 60)} Std.` : `vor ${Math.round(m / 1440)} Tg.`; };
const rendite = (o) => (((o.miete + (o.zuschlag?.betrag ?? 0)) * 12) / o.preis) * 100;

function donut(parts, centerTop, centerBottom) {
  const total = parts.reduce((a, p) => a + p.value, 0), R = 52, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = total ? parts.filter((p) => p.value).map((p) => { const len = (p.value / total) * C, a = `<circle r="${R}" cx="70" cy="70" fill="none" style="stroke:${p.color}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return a; }).join('') : `<circle r="${R}" cx="70" cy="70" fill="none" stroke="#e6e9ed" stroke-width="22"/>`;
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="${esc(parts.map((p) => `${p.label}: ${p.value}`).join(', '))}">${arcs}<text x="70" y="68" text-anchor="middle" class="d-t">${esc(centerTop)}</text><text x="70" y="86" text-anchor="middle" class="d-b">${esc(centerBottom)}</text></svg>`;
}
const legend = (parts) => `<ul class="lgd">${parts.map((p) => `<li><i style="background:${p.color}"></i>${esc(p.label)}<b>${p.value}</b></li>`).join('')}</ul>`;

function weekly(events) {
  const W = 8, now = Date.now(), wk = 7 * 86400000;
  const bins = Array.from({ length: W }, () => 0);
  for (const e of events) { if (e.t >= now - W * wk && e.t <= now) bins[Math.min(W - 1, Math.max(0, Math.floor((e.t - (now - W * wk)) / wk)))]++; }
  const max = Math.max(1, ...bins), bw = 28, gap = 12;
  const bars = bins.map((v, i) => {
    const h = Math.round((v / max) * 70), x = 10 + i * (bw + gap), lab = dt(now - (W - 1 - i) * wk);
    return `<rect x="${x}" y="${90 - h}" width="${bw}" height="${h || 1}" rx="5" class="${v ? 'wb' : 'wb0'}"/><text x="${x + bw / 2}" y="${84 - h}" text-anchor="middle" class="w-v">${v || ''}</text><text x="${x + bw / 2}" y="106" text-anchor="middle" class="w-l">${lab}</text>`;
  }).join('');
  return `<svg class="weekly" viewBox="0 0 ${10 + W * (bw + gap)} 112" role="img" aria-label="Rückmeldungen pro Woche">${bars}</svg>`;
}

const seg = (counts, total) => total ? `<div class="stk">${STAGES.map((s) => counts[s.id] ? `<i style="flex:${counts[s.id]};background:${s.color}" title="${esc(s.short)}: ${counts[s.id]}">${counts[s.id]}</i>` : '').join('')}</div>` : '<div class="stk empty"></div>';
const countBy = (list) => Object.fromEntries(STAGES.map((s) => [s.id, list.filter((e) => e.st === s.id).length]));

export function dashHtml({ objekte, partners, events, fb, state }) {
  const ch = chains(events);
  const active = ch.filter((e) => e.st !== 'absage'), open = ch.filter((e) => e.st === 'pruefung' || e.st === 'finanzierung');
  const by = (k) => objekte.filter((o) => (o.vs || 'frei') === k);
  const vol = (l) => l.reduce((a, o) => a + o.preis, 0);
  const avgR = objekte.length ? objekte.reduce((a, o) => a + rendite(o), 0) / objekte.length : 0;
  const parts = Object.keys(VS).map((k) => ({ label: VS[k], value: by(k).length, color: VCOL[k] }));
  const stageCounts = countBy(ch);
  const maxStage = Math.max(1, ...Object.values(stageCounts));
  const tile = (l, v, sub = '') => `<div class="kt"><small>${l}</small><b>${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const setup = fb ? '' : `<section class="panel setup"><h2>Rückmeldungen der Vertriebe einrichten</h2>
    <p class="hint">Damit Partner bei jedem Objekt melden können, wie weit ihr Interessent ist (Prüfung, Finanzierung, Reservierung), und Sie das hier live sehen, braucht es einmalig einen eigenen GitHub-Token nur für Rückmeldungen. Die Nachrichten sind Ende-zu-Ende verschlüsselt – nur Master können sie lesen.</p>
    <ol class="hint ol"><li>github.com → Einstellungen → Developer settings → Fine-grained tokens → „Generate new token“.</li><li>Repository: nur <b>keuerleber-real-estate</b>. Berechtigung <b>Issues: Read and write</b> (sonst nichts).</li><li>Token hier einfügen und „Einrichten“, danach „Veröffentlichen“.</li></ol>
    <form class="inline" id="fbSetup"><input type="password" name="tk" placeholder="Token nur für Rückmeldungen" required autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Token für Rückmeldungen"><button class="btn fill sm">Einrichten</button></form>
    <p class="hint">Bis dahin können Rückmeldungen, die Partner per WhatsApp oder E-Mail schicken, unten manuell erfasst werden.</p></section>`;
  const status = fb ? `<div class="dstat">${state.loading ? 'Lade Rückmeldungen …' : state.err ? `<span class="warn">${esc(state.err)}</span>` : state.at ? `✓ Rückmeldungen aktuell (${ago(state.at)})` : ''}
    <button class="btn ghost sm" data-a="fbreload">Aktualisieren</button><button class="btn ghost sm" data-a="fbtoken">Token ändern</button></div>` : '';

  const board = `<div class="board">${STAGES.map((s) => {
    const items = ch.filter((e) => e.st === s.id).sort((a, b) => b.t - a.t);
    return `<div class="col" style="--c:${s.color}"><h3><i></i>${esc(s.short)} <span>${items.length}</span></h3>${items.map((e) => {
      const o = objekte.find((x) => x.id === e.oid), canMark = s.id === 'reserviert' && o && !['reserviert', 'notar', 'verkauft'].includes(o.vs || 'frei');
      return `<div class="bc"><b>${esc(e.k || 'Interessent')}</b><span>${esc(e.on || (o ? titel(o) : ''))}</span><small>${esc(e.pn || '')} · ${dt(e.t)}</small>${e.n ? `<em>${esc(e.n)}</em>` : ''}${canMark ? `<button class="btn fill sm" data-a="mark-res" data-id="${esc(e.oid)}">Objekt reservieren</button>` : ''}<div class="bact"><button class="linkbtn" data-a="ch-edit" data-key="${esc(`${e.pid}|${e.oid}|${String(e.k || '').trim().toLowerCase()}`)}">Bearbeiten</button><button class="linkbtn" data-a="ch-del" data-key="${esc(`${e.pid}|${e.oid}|${String(e.k || '').trim().toLowerCase()}`)}">Entfernen</button></div></div>`;
    }).join('') || '<p class="hint">–</p>'}</div>`;
  }).join('')}</div>`;

  const rows = objekte.map((o) => {
    const mine = ch.filter((e) => e.oid === o.id), c = countBy(mine), v = o.vs || 'frei', last = events.filter((e) => e.oid === o.id).sort((a, b) => b.t - a.t)[0];
    const expired = v === 'reserviert' && o.vbis && Date.parse(o.vbis) + 86400000 < Date.now();
    return `<tr><td class="t-o" data-l="Objekt"><b>${esc(o.strasse)}</b><small>${esc(o.lage)}</small></td>
      <td data-l="Status"><span class="tvs ${esc(v)}">${esc(VS[v])}</span>${v === 'reserviert' && o.vbis ? `<small class="${expired ? 'warn' : ''}">${expired ? 'Frist abgelaufen' : 'bis ' + dt(o.vbis)}</small>` : ''}</td>
      <td data-l="Sanierung"><div class="pb"><i style="width:${o.fortschritt}%"></i></div><small>${o.fortschritt} %</small></td>
      <td data-l="Preis"><b>${eur(o.preis)}</b><small>${rendite(o).toFixed(2).replace('.', ',')} % Rendite</small></td>
      <td data-l="Interessenten">${seg(c, mine.length)}<small>${mine.length ? `${mine.filter((e) => e.st !== 'absage').length} aktiv` : 'noch keine'}</small></td>
      <td data-l="Zuletzt">${last ? `${ago(last.t)}<small>${esc(stageOf(last.st).short)}</small>` : '–'}</td></tr>`;
  }).join('');

  const prow = partners.map((p) => {
    const mine = ch.filter((e) => e.pid === p.id), c = countBy(mine), last = events.filter((e) => e.pid === p.id).sort((a, b) => b.t - a.t)[0];
    return { p, n: mine.length, c, last };
  }).sort((a, b) => b.n - a.n);
  const pmax = Math.max(1, ...prow.map((r) => r.n));
  const pbars = prow.map((r) => `<li><div class="pl"><b>${esc(r.p.name)}</b><small>${r.last ? 'zuletzt ' + ago(r.last.t) : 'noch keine Rückmeldung'}</small></div><div class="pr"><div style="width:${Math.max(6, (r.n / pmax) * 100)}%;${r.n ? '' : 'opacity:.25'}">${seg(r.c, r.n)}</div><span>${r.n}</span></div></li>`).join('');

  const feed = [...events].sort((a, b) => b.t - a.t).slice(0, 12).map((e) => { const s = stageOf(e.st); return `<li style="--c:${s.color}"><i></i><div><b>${esc(e.pn || 'Partner')}</b> · ${esc(s.short)}${e.k ? ` · ${esc(e.k)}` : ''}<span>${esc(e.on || '')}</span>${e.n ? `<em>${esc(e.n)}</em>` : ''}</div><small>${ago(e.t)} · <button class="linkbtn" data-a="ev-del" data-id="${esc(e.id)}">entfernen</button></small></li>`; }).join('');

  return `${setup}
    <section class="panel"><div class="ph"><div><h2>Überblick</h2><p class="hint">Stand ${new Date().toLocaleDateString('de-DE')} · ${objekte.length} Objekte · ${partners.length} Partner</p></div>${status}</div>
      <div class="kpis4">${tile('Gesamtvolumen', eur(vol(objekte)), objekte.length + ' Objekte')}${tile('Noch frei', by('frei').length, eur(vol(by('frei'))))}${tile('Reserviert / Notar', by('reserviert').length + by('notar').length, eur(vol(by('reserviert')) + vol(by('notar'))))}${tile('Verkauft', by('verkauft').length, eur(vol(by('verkauft'))))}${tile('Offene Interessenten', open.length, active.length + ' aktiv gesamt')}${tile('Ø Rendite', avgR.toFixed(2).replace('.', ',') + ' %', 'Abgabepreis')}</div></section>
    <div class="two"><section class="panel"><h2>Verfügbarkeit</h2><div class="dn">${donut(parts, String(objekte.length), 'Objekte')}${legend(parts)}</div></section>
      <section class="panel"><h2>Pipeline</h2><ul class="hb">${STAGES.map((s) => `<li><span>${esc(s.short)}</span><div><i style="width:${Math.max(stageCounts[s.id] ? 6 : 0, (stageCounts[s.id] / maxStage) * 100)}%;background:${s.color}"></i></div><b>${stageCounts[s.id]}</b></li>`).join('')}</ul>
        <p class="hint">Zählt Interessenten nach ihrem neuesten Stand.</p></section></div>
    <section class="panel"><h2>Pipeline-Board</h2>${board}</section>
    <section class="panel"><h2>Objekte im Detail</h2><div class="tbl-w"><table class="tbl dtbl"><thead><tr><th>Objekt</th><th>Status</th><th>Sanierung</th><th>Preis</th><th>Interessenten</th><th>Zuletzt</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Noch keine Objekte.</td></tr>'}</tbody></table></div></section>
    <div class="two"><section class="panel"><h2>Partner-Aktivität</h2>${prow.length ? `<ul class="pa">${pbars}</ul>` : '<p class="empty">Noch keine Partner.</p>'}</section>
      <section class="panel"><h2>Rückmeldungen pro Woche</h2>${weekly(events)}<p class="hint">Letzte 8 Wochen, alle Rückmeldungen.</p></section></div>
    <section class="panel"><div class="ph"><h2>Letzte Rückmeldungen</h2><button class="btn ghost sm" data-a="ev-add">+ Rückmeldung erfassen</button></div>${feed ? `<ul class="feed">${feed}</ul>` : '<p class="empty">Noch keine Rückmeldungen.</p>'}</section>`;
}
