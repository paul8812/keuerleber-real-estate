// Verwaltung für Master: Überblick über alle Baustellen/Verläufe, Baustellen, Handwerker, Rechnungen, Team, Einstellungen, Veröffentlichen.
import { buildPackage, openJson, openSlot, randomId, syncThreads } from './pkg.js';
import { openProjects } from './pkg.js';
import { SQL, testConnection } from './store.js';
import { ctx, evOf, go, header, hwName, isAdmin, offeneProbleme, projOf, relogin, render, berichtDieseWoche, send, unread } from './app.js';
import { ago, askBox, confirmBox, dlg, dt, esc, eur, kwOf, toast } from './ui.js';
import { fromB64, randomCode, toB64 } from '../partner/crypto.js';

const REPO = 'paul8812/keuerleber-real-estate';
const FILE = 'handwerker/data.enc.json';
const TOKEN_KEY = 'nf-hw-gh';
const MIN_PW = 12;
const clone = (x) => JSON.parse(JSON.stringify(x));
const app = document.getElementById('app');
let S = null, B = null, tab = 'uebersicht';
const snapshot = () => clone({ projekte: S.projekte, handwerker: S.handwerker, masters: S.masters, sb: S.sb });
const dirty = () => JSON.stringify(snapshot()) !== JSON.stringify(B);
const token = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'baustelle';
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pctOf = (v) => Math.max(0, Math.min(100, Math.round(num(v))));
const hwN = (t) => hwName(t.hid), pjN = (t) => projOf({ ...t, tid: t.tid })?.name ?? '';
const codeTaken = (c, id) => S.handwerker.some((x) => x.id !== id && x.code === c) || S.masters.some((x) => x.id !== id && x.code === c);
const linkFor = (h) => `${location.origin}${location.pathname}#${h.id}.${encodeURIComponent(h.code)}`;

async function init() {
  if (S) return;
  const a = await openJson(ctx.sess.a, ctx.pkg.admin);
  S = { projekte: a.projekte ?? [], handwerker: (a.handwerker ?? []).map((h) => ({ ...h, projekte: h.projekte ?? [] })), masters: a.masters, threads: a.threads ?? [], sb: a.sb ?? null };
  B = snapshot(); ctx.admin = S;
}
const changes = () => {
  const out = [], b = (k) => new Map((B[k] ?? []).map((x) => [x.id, x]));
  for (const [k, l, n] of [['projekte', 'Baustelle', (x) => x.name], ['handwerker', 'Handwerker', (x) => x.name], ['masters', 'Master', (x) => x.name]]) {
    const old = b(k), cur = new Map(S[k].map((x) => [x.id, x]));
    for (const [id, x] of cur) { if (!old.has(id)) out.push(`${l} „${n(x)}“ neu`); else if (JSON.stringify(old.get(id)) !== JSON.stringify(x)) out.push(`${l} „${n(x)}“ geändert`); }
    for (const [id, x] of old) if (!cur.has(id)) out.push(`${l} „${n(x)}“ entfernt`);
  }
  if (JSON.stringify(B.sb) !== JSON.stringify(S.sb)) out.push('Speicherdienst geändert');
  return out;
};

const TABS = [['uebersicht', 'Übersicht'], ['baustellen', 'Baustellen'], ['handwerker', 'Handwerker'], ['rechnungen', 'Rechnungen'], ['team', 'Team'], ['einst', 'Einstellungen']];

export async function adminRender() {
  await init();
  const typed = app.querySelector('#sbForm') ? { url: app.querySelector('#sbForm [name=url]').value, key: app.querySelector('#sbForm [name=key]').value } : null; // Eingaben nicht verlieren, wenn im Hintergrund neu gezeichnet wird
  const n = dirty() ? changes().length : 0;
  app.innerHTML = `${header('Verwaltung')}<main class="wrap hw-main">
    <div class="ph"><h2 class="big">Verwaltung</h2></div>
    <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab${tab === k ? ' on' : ''}" data-tab="${k}" role="tab" aria-selected="${tab === k}">${l}${k === 'baustellen' ? `<span class="cnt">${S.projekte.length}</span>` : k === 'handwerker' ? `<span class="cnt">${S.handwerker.length}</span>` : ''}</button>`).join('')}</nav>
    ${!S.sb ? `<p class="banner warn-b">Der Speicherdienst ist noch nicht eingerichtet – ohne ihn können Handwerker nichts senden. <button class="linkbtn" data-tab="einst">Jetzt einrichten</button></p>` : ctx.err ? `<p class="banner warn-b">${esc(/failed to fetch|networkerror|load failed/i.test(ctx.err) ? 'Keine Verbindung zum Speicherdienst – bitte Internet prüfen. Es wird automatisch erneut versucht.' : ctx.err)}</p>` : ''}
    <div id="tp">${panel()}</div></main>
    <div class="savebar${n ? ' on' : ''}" ${n ? '' : 'hidden'}><div class="wrap"><span>● ${n} Änderung${n === 1 ? '' : 'en'} – Handwerker sehen sie erst nach „Veröffentlichen“.</span><span><button class="btn ghost sm" id="discard">Verwerfen</button><button class="btn fill sm" id="pub">Veröffentlichen (${n})</button></span></div></div>`;
  document.getElementById('logout').addEventListener('click', () => { try { sessionStorage.removeItem('nf-hw-session'); } catch { /* egal */ } location.href = location.pathname; });
  app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; adminRender(); }));
  document.getElementById('discard')?.addEventListener('click', async () => { if (await confirmBox({ title: 'Änderungen verwerfen?', text: 'Alles seit der letzten Veröffentlichung wird zurückgesetzt.', ok: 'Verwerfen', danger: true })) { Object.assign(S, clone(B)); adminRender(); toast('Änderungen verworfen.'); } });
  document.getElementById('pub')?.addEventListener('click', openPublish);
  app.querySelector('.tab.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  document.getElementById('toAdmin')?.remove(); // man ist schon in der Verwaltung
  if (typed && tab === 'einst') { const f = document.getElementById('sbForm'); if (f) { f.url.value = typed.url; f.key.value = typed.key; } }
  wirePanel();
}

/* ---------- Panels ---------- */
function threadsView() { return Object.entries(ctx.sess.threads).map(([tid, t]) => ({ tid, ...t })); }
function panel() {
  if (tab === 'uebersicht') return pUebersicht();
  if (tab === 'baustellen') return pBaustellen();
  if (tab === 'handwerker') return pHandwerker();
  if (tab === 'rechnungen') return pRechnungen();
  if (tab === 'team') return pTeam();
  return pEinst();
}
function pUebersicht() {
  const all = threadsView(), ts = all.filter((t) => t.on), arch = all.filter((t) => !t.on && evOf(t.tid).length), k = kwOf();
  const probs = ts.reduce((a, t) => a + offeneProbleme(t.tid).length, 0), fehlt = ts.filter((t) => !berichtDieseWoche(t.tid)).length, neu = all.reduce((a, t) => a + unread(t.tid), 0);
  const last = (t) => evOf(t.tid).at(-1)?.rid ?? 0;
  const row = (t, archiv) => {
    const ev = evOf(t.tid), b = ev.filter((e) => e.typ === 'bericht').at(-1), pr = offeneProbleme(t.tid).length, u = unread(t.tid), l = ev.at(-1);
    return `<tr data-tid="${t.tid}" tabindex="0"><td class="t-o" data-l="Baustelle"><b>${esc(pjN(t))}</b><small>${esc(hwN(t))}</small></td>
      <td data-l="Bericht">${archiv ? '<span class="pill">archiviert</span>' : berichtDieseWoche(t.tid) ? '<span class="pill ok">KW ' + k.w + ' ✓</span>' : '<span class="pill warn">KW ' + k.w + ' fehlt</span>'}<small>${b ? 'zuletzt ' + ago(b.at) : 'noch kein Bericht'}</small></td>
      <td data-l="Fortschritt">${b?.pct != null ? `<div class="pb"><i style="width:${pctOf(b.pct)}%"></i></div><small>${pctOf(b.pct)} %</small>` : '–'}</td>
      <td data-l="Probleme">${pr ? `<span class="pill krit">${pr} offen</span>` : '–'}</td><td data-l="Neu">${u ? `<span class="pill ung">${u} neu</span>` : '–'}</td><td data-l="Aktivität">${l ? ago(l.at) : '–'}</td></tr>`;
  };
  const table = (list, archiv) => `<div class="tbl-w"><table class="tbl hw-tbl stack"><thead><tr><th>Baustelle · Handwerker</th><th>Wochenbericht</th><th>Fortschritt</th><th>Probleme</th><th>Neu</th><th>Aktivität</th></tr></thead><tbody>${list.sort((x, y) => last(y) - last(x)).map((t) => row(t, archiv)).join('')}</tbody></table></div>`;
  return `<div class="kpis4"><div class="kt"><small>Aktive Verläufe</small><b>${ts.length}</b></div><div class="kt"><small>Offene Probleme</small><b class="${probs ? 'krit-t' : ''}">${probs}</b></div><div class="kt"><small>Berichte KW ${k.w} fehlen</small><b class="${fehlt ? 'warn-t' : ''}">${fehlt}</b></div><div class="kt"><small>Ungelesen</small><b>${neu}</b></div></div>
    <section class="panel"><div class="ph"><h2>Alle Baustellen und Handwerker</h2><button class="btn ghost sm" id="reload">Aktualisieren${ctx.loading ? ' …' : ''}</button></div>
    ${ts.length ? `${table(ts, false)}<p class="hint">Zeile antippen, um den ganzen Verlauf zu sehen und zu antworten.</p>` : '<p class="empty">Noch keine Handwerker freigeschaltet. Lege unter „Handwerker“ Zugänge an und schalte Baustellen frei – nach dem Veröffentlichen erscheinen sie hier.</p>'}</section>
    ${arch.length ? `<section class="panel"><div class="ph"><h2>Archiv</h2></div><p class="hint">Verläufe von entfernten Handwerkern oder Baustellen. Nur Master können sie noch lesen.</p>${table(arch, true)}</section>` : ''}`;
}
function pBaustellen() {
  return `<section class="panel"><div class="ph"><h2>Baustellen</h2><button class="btn fill sm" data-a="padd">+ Baustelle</button></div><ul class="rows">${S.projekte.map((p) => `<li><div><b>${esc(p.name)}</b><small>${esc(p.adresse || '')} · ${S.handwerker.filter((h) => h.projekte.includes(p.id)).length} Handwerker</small></div><span class="acts"><button class="btn ghost sm" data-a="pedit" data-id="${esc(p.id)}">Bearbeiten</button><button class="btn ghost sm" data-a="pdel" data-id="${esc(p.id)}">Löschen</button></span></li>`).join('') || '<li class="empty">Noch keine Baustellen.</li>'}</ul></section>`;
}
function pHandwerker() {
  return `<section class="panel"><div class="ph"><h2>Handwerker</h2><button class="btn fill sm" data-a="hadd">+ Handwerker</button></div><ul class="rows">${S.handwerker.map((h) => `<li><div><b>${esc(h.name)}</b><small>${esc(h.firma || '')}${h.gewerk ? ' · ' + esc(h.gewerk) : ''} · ${h.projekte.length} Baustelle${h.projekte.length === 1 ? '' : 'n'}</small></div><span class="acts"><button class="btn ghost sm" data-a="hlink" data-id="${esc(h.id)}">Zugang senden</button><button class="btn ghost sm" data-a="hedit" data-id="${esc(h.id)}">Bearbeiten</button><button class="btn ghost sm" data-a="hdel" data-id="${esc(h.id)}">Löschen</button></span></li>`).join('') || '<li class="empty">Noch keine Handwerker.</li>'}</ul>
    <p class="hint">Jeder Handwerker bekommt einen eigenen Zugangscode und sieht nur die Baustellen, die du für ihn freischaltest – und nur seinen eigenen Verlauf.</p></section>`;
}
function rechnungen() {
  return ctx.ev.filter((e) => e.typ === 'rechnung' && e.datei && ctx.sess.threads[e.tid]).map((e) => { const t = { tid: e.tid, ...ctx.sess.threads[e.tid] }; const paid = evOf(e.tid).some((x) => x.typ === 'bezahlt' && x.ref === e.id); return { e, t, paid, p: projOf(t) ?? {} }; }).sort((a, b) => b.e.rid - a.e.rid);
}
function pRechnungen() {
  const l = rechnungen(), sum = l.reduce((a, r) => a + num(r.e.betrag), 0), offen = l.filter((r) => !r.paid).reduce((a, r) => a + num(r.e.betrag), 0);
  return `<section class="panel"><div class="ph"><h2>Rechnungen</h2><button class="btn ghost sm" data-a="rcsv" ${l.length ? '' : 'disabled'}>Als CSV</button></div>
    <div class="kpis4"><div class="kt"><small>Anzahl</small><b>${l.length}</b></div><div class="kt"><small>Summe brutto</small><b>${eur(sum)}</b></div><div class="kt"><small>Davon offen</small><b class="${offen ? 'warn-t' : ''}">${eur(offen)}</b></div></div>
    ${l.length ? `<div class="tbl-w"><table class="tbl stack"><thead><tr><th>Datum</th><th>Handwerker · Baustelle</th><th>Nr.</th><th>Betrag</th><th>Status</th><th></th></tr></thead><tbody>${l.map((r) => `<tr><td data-l="Datum">${dt(r.e.datum || r.e.at)}</td><td class="t-o" data-l="Handwerker"><b>${esc(hwN(r.t))}</b><small>${esc(r.p.name || '')}</small></td><td data-l="Nr.">${esc(r.e.nr)}</td><td data-l="Betrag">${eur(num(r.e.betrag))}</td><td data-l="Status">${r.paid ? '<span class="pill ok">bezahlt</span>' : '<span class="pill warn">offen</span>'}</td>
      <td class="acts"><button class="btn ghost sm" data-file="${esc(r.e.datei.p)}" data-tid="${r.e.tid}" data-name="${esc(r.e.datei.n)}" data-type="${esc(r.e.datei.t)}">Öffnen</button>${r.paid ? '' : `<button class="btn ghost sm" data-a="rpaid" data-tid="${r.e.tid}" data-id="${esc(r.e.id)}">Bezahlt</button>`}<button class="btn ghost sm" data-a="rthread" data-tid="${r.e.tid}">Verlauf</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Noch keine Rechnungen hochgeladen.</p>'}</section>`;
}
function pTeam() {
  return `<section class="panel"><div class="ph"><h2>Master-Zugänge</h2><button class="btn fill sm" data-a="madd">+ Master</button></div><ul class="rows">${S.masters.map((m) => `<li><div><b>${esc(m.name)}</b><small>${m.id === ctx.sess.id ? 'Das bist du' : 'Master – sieht alles'}</small></div><span class="acts"><button class="btn ghost sm" data-a="mren" data-id="${esc(m.id)}">Umbenennen</button><button class="btn ghost sm" data-a="mpw" data-id="${esc(m.id)}">Passwort ändern</button>${m.id === ctx.sess.id ? '' : `<button class="btn ghost sm" data-a="mdel" data-id="${esc(m.id)}">Entfernen</button>`}</span></li>`).join('')}</ul>
    <p class="hint">Alle Master sehen sämtliche Baustellen, Chats, Berichte, Fotos und Rechnungen aller Handwerker.</p></section>`;
}
function pEinst() {
  return `<section class="panel"><h2>Speicherdienst (Supabase)</h2>
    <p class="hint">Hier liegen die verschlüsselten Fotos, Nachrichten und Rechnungen. Einmalige Einrichtung: Konto auf supabase.com, neues Projekt, dann das Skript unten im „SQL Editor“ ausführen und Adresse + öffentlichen Schlüssel eintragen (unter „Project Settings → API“, je nach Projekt „anon public“ oder „Publishable key“ – niemals den „service_role“/„Secret“-Schlüssel).</p>
    <form class="grid" id="sbForm"><label class="f"><span>Projekt-Adresse</span><input name="url" placeholder="https://abcdxyz.supabase.co" value="${esc(S.sb?.url || '')}" autocomplete="off" spellcheck="false"></label>
      <label class="f"><span>Schlüssel (anon public / Publishable)</span><input name="key" type="password" value="${esc(S.sb?.key || '')}" autocomplete="off" spellcheck="false"></label>
      <div class="acts wide"><button class="btn fill sm">Prüfen &amp; speichern</button><button type="button" class="btn ghost sm" data-a="sql">Einrichtungs-Skript anzeigen</button></div></form></section>
    <section class="panel"><h2>Veröffentlichen</h2><p class="hint">GitHub-Token (nur dieser Browser): ${token() ? '✓ gespeichert' : 'noch nicht hinterlegt – wird beim ersten Veröffentlichen abgefragt'}.</p>${token() ? '<div class="acts"><button class="btn ghost sm" data-a="tkdel">Token entfernen</button></div>' : ''}</section>`;
}

/* ---------- Aktionen ---------- */
function wirePanel() {
  const tp = document.getElementById('tp');
  tp.querySelectorAll('tr[data-tid]').forEach((r) => { const f = () => go('thread', r.dataset.tid); r.addEventListener('click', f); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') f(); }); });
  document.getElementById('reload')?.addEventListener('click', async () => { ctx.loading = false; await (await import('./app.js')).reload(); adminRender(); });
  tp.querySelectorAll('[data-file]').forEach((b) => b.addEventListener('click', async () => { const t = ctx.sess.threads[b.dataset.tid]; try { const { getFile } = await import('./store.js'); const u = await getFile(ctx.sess.sb, b.dataset.file, t.k, b.dataset.type); const a = document.createElement('a'); a.href = u; a.download = b.dataset.name; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); } catch (x) { toast(x.message, false); } }));
  document.getElementById('sbForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target, sb = { url: f.url.value.trim().replace(/\/+$/, ''), key: f.key.value.trim() };
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(sb.url)) return toast('Adresse bitte als https://….supabase.co eintragen.', false);
    const er = await testConnection(sb); if (er) return toast(er, false);
    S.sb = sb; adminRender(); toast('Speicherdienst verbunden – jetzt veröffentlichen.');
  });
  tp.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => act(b.dataset.a, b.dataset.id, b)));
}
async function act(a, id, b) {
  if (a === 'padd') return editProjekt(null);
  if (a === 'pedit') return editProjekt(id);
  if (a === 'pdel') { const p = S.projekte.find((x) => x.id === id); if (await confirmBox({ title: 'Baustelle löschen?', text: `„${p.name}“ wird bei allen Handwerkern entfernt. Der Verlauf bleibt für Master erhalten.`, ok: 'Löschen', danger: true })) { S.projekte = S.projekte.filter((x) => x.id !== id); S.handwerker.forEach((h) => { h.projekte = h.projekte.filter((i) => i !== id); }); adminRender(); } return; }
  if (a === 'hadd') return editHandwerker(null);
  if (a === 'hedit') return editHandwerker(id);
  if (a === 'hdel') { const h = S.handwerker.find((x) => x.id === id); if (await confirmBox({ title: 'Handwerker entfernen?', text: `Der Zugang von „${h.name}“ wird nach dem Veröffentlichen gesperrt. Der Verlauf bleibt für Master erhalten.`, ok: 'Entfernen', danger: true })) { S.handwerker = S.handwerker.filter((x) => x.id !== id); adminRender(); } return; }
  if (a === 'hlink') { const h = S.handwerker.find((x) => x.id === id), l = linkFor(h), t = `Hallo ${h.name}, hier ist Ihr Zugang zum Norderfranken-Baustellenportal:\n${l}\nZugangscode (falls nötig): ${h.code}`; try { await navigator.clipboard.writeText(t); toast('Zugangstext kopiert – jetzt z. B. in WhatsApp einfügen.'); } catch { await askBox({ title: 'Zugang', label: 'Link', value: l, ok: 'Schließen' }); } return; }
  if (a === 'tkdel') { try { localStorage.removeItem(TOKEN_KEY); } catch { /* egal */ } adminRender(); return toast('Token entfernt.'); }
  if (a === 'rthread') return go('thread', b.dataset.tid);
  if (a === 'rpaid') { b.disabled = true; try { await send(b.dataset.tid, { typ: 'bezahlt', ref: id }); adminRender(); toast('Als bezahlt markiert.'); } catch (x) { toast(x.message, false); b.disabled = false; } return; }
  if (a === 'rcsv') return csv();
  if (a === 'madd') { const n = await askBox({ title: 'Neuer Master', label: 'Name', check: (v) => (v ? '' : 'Bitte einen Namen eingeben.') }); if (n) { const code = randomCode(20); let mid; do mid = 'm' + randomId().slice(0, 4); while (S.masters.some((x) => x.id === mid) || S.handwerker.some((x) => x.id === mid)); const m = { id: mid, name: n.slice(0, 60), code }; S.masters.push(m); adminRender(); await askBox({ title: `Zugang für ${m.name}`, label: 'Link mit Zugangscode – bitte jetzt kopieren, er wird nicht mehr angezeigt. Gilt nach dem Veröffentlichen.', value: linkFor(m), ok: 'Notiert' }); } return; }
  if (a === 'mren') { const m = S.masters.find((x) => x.id === id), n = await askBox({ title: 'Master umbenennen', label: 'Name', value: m.name, check: (v) => (v ? '' : 'Bitte einen Namen eingeben.') }); if (n && n !== m.name) { m.name = n.slice(0, 60); if (id === ctx.sess.id) ctx.sess.n = m.name; adminRender(); } return; }
  if (a === 'mpw') { const m = S.masters.find((x) => x.id === id), n = await askBox({ title: `Neues Passwort für ${m.name}`, label: 'Passwort', ok: 'Ändern', hint: `Mindestens ${MIN_PW} Zeichen. Gilt erst nach dem Veröffentlichen.`, check: (v) => (v.length < MIN_PW ? `Mindestens ${MIN_PW} Zeichen.` : codeTaken(v, m.id) ? 'Dieser Code wird schon verwendet.' : '') }); if (n) { m.code = n; adminRender(); toast('Passwort geändert – bitte veröffentlichen.'); } return; }
  if (a === 'mdel') { const m = S.masters.find((x) => x.id === id); if (await confirmBox({ title: 'Master entfernen?', text: `Der Zugang von „${m.name}“ wird nach dem Veröffentlichen gesperrt.`, ok: 'Entfernen', danger: true })) { S.masters = S.masters.filter((x) => x.id !== id); adminRender(); } return; }
  if (a === 'sql') { const d = dlg('sheet', 'sheet'); d.innerHTML = `<div class="panel form"><div class="sh-h"><h2>Einrichtungs-Skript</h2><button class="btn ghost sm" data-a="close">Schließen</button></div><p class="hint">In Supabase links „SQL Editor“ → „New query“ → einfügen → „Run“.</p><textarea readonly rows="16" class="code">${esc(SQL)}</textarea><div class="acts"><button class="btn fill sm" id="cp">Kopieren</button></div></div>`; d.onclick = (e) => { if (e.target.closest('[data-a=close]')) d.close(); }; d.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(SQL); toast('Skript kopiert.'); } catch { d.querySelector('textarea').select(); } }; d.showModal(); }
}
function csv() {
  const q = (s) => { let v = String(s ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; }; // führendes = + - @ würde Excel als Formel ausführen
  const sum = (n) => `"${num(n).toFixed(2).replace('.', ',')}"`, l = rechnungen();
  const rows = ['Rechnungsdatum;Eingang am;Handwerker;Baustelle;Rechnungsnr.;Betrag brutto (EUR);Status;Datei'].concat(l.map((r) => [q(dt(r.e.datum || r.e.at)), q(dt(r.e.at)), q(hwN(r.t)), q(r.p.name), q(r.e.nr), sum(r.e.betrag), q(r.paid ? 'bezahlt' : 'offen'), q(r.e.datei.n)].join(';')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })); a.download = `Handwerker_Rechnungen_${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function editProjekt(id) {
  const p = id ? S.projekte.find((x) => x.id === id) : { id: '', name: '', adresse: '', hinweis: '' };
  const d = dlg('sheet', 'sheet');
  d.innerHTML = `<form class="panel form" id="pf"><div class="sh-h"><h2>${id ? 'Baustelle bearbeiten' : 'Neue Baustelle'}</h2><button type="button" class="btn ghost sm" data-a="close">Abbrechen</button></div><div class="grid">
    <label class="f"><span>Name</span><input name="name" required maxlength="80" value="${esc(p.name)}" placeholder="z. B. Leopoldstraße 71"></label>
    <label class="f"><span>Adresse</span><input name="adresse" maxlength="120" value="${esc(p.adresse)}" placeholder="Straße, PLZ Ort"></label>
    <label class="f wide"><span>Hinweise für die Handwerker (Zugang, Ansprechpartner, Termine)</span><textarea name="hinweis" rows="3" maxlength="600">${esc(p.hinweis || '')}</textarea></label></div>
    <div class="acts sticky-save"><button class="btn fill">Speichern</button></div></form>`;
  d.onclick = (e) => { if (e.target.closest('[data-a=close]')) d.close(); };
  d.querySelector('#pf').onsubmit = (e) => {
    e.preventDefault(); const f = e.target, o = { ...p, name: f.name.value.trim(), adresse: f.adresse.value.trim(), hinweis: f.hinweis.value.trim() };
    if (!o.name) return toast('Bitte einen Namen eintragen.', false);
    if (!id) { let s = slug(o.name), n = 2; while (S.projekte.some((x) => x.id === s)) s = slug(o.name) + '-' + n++; o.id = s; S.projekte.push(o); } else S.projekte[S.projekte.findIndex((x) => x.id === id)] = o;
    d.close(); adminRender();
  };
  d.showModal();
}
function editHandwerker(id) {
  const h = id ? S.handwerker.find((x) => x.id === id) : { id: 'h' + randomId().slice(0, 5), name: '', firma: '', gewerk: '', code: randomCode(16), projekte: [] };
  const d = dlg('sheet', 'sheet');
  d.innerHTML = `<form class="panel form" id="hf"><div class="sh-h"><h2>${id ? 'Handwerker bearbeiten' : 'Neuer Handwerker'}</h2><button type="button" class="btn ghost sm" data-a="close">Abbrechen</button></div><div class="grid">
    <label class="f"><span>Ansprechpartner</span><input name="name" required maxlength="60" value="${esc(h.name)}"></label>
    <label class="f"><span>Firma</span><input name="firma" maxlength="80" value="${esc(h.firma || '')}"></label>
    <label class="f"><span>Gewerk</span><input name="gewerk" maxlength="60" value="${esc(h.gewerk || '')}" placeholder="z. B. Elektrik, Bad, Boden"></label>
    <label class="f"><span>Zugangscode / Passwort (mind. ${MIN_PW} Zeichen)</span><input name="code" required minlength="${MIN_PW}" maxlength="80" value="${esc(h.code)}" autocomplete="off" spellcheck="false"></label>
    <div class="f wide"><span>Freigeschaltete Baustellen</span><div class="checks">${S.projekte.map((p) => `<label class="chk"><input type="checkbox" name="pj" value="${esc(p.id)}" ${h.projekte.includes(p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('') || '<p class="hint">Lege zuerst Baustellen an.</p>'}</div></div></div>
    <div class="acts sticky-save"><button class="btn fill">Speichern</button></div></form>`;
  d.onclick = (e) => { if (e.target.closest('[data-a=close]')) d.close(); };
  d.querySelector('#hf').onsubmit = (e) => {
    e.preventDefault(); const f = e.target;
    const o = { ...h, name: f.name.value.trim(), firma: f.firma.value.trim(), gewerk: f.gewerk.value.trim(), code: f.code.value.trim(), projekte: [...f.querySelectorAll('[name=pj]:checked')].map((x) => x.value) };
    if (!o.name) return toast('Bitte einen Ansprechpartner eintragen.', false);
    if (o.code.length < MIN_PW) return toast(`Der Zugangscode braucht mindestens ${MIN_PW} Zeichen.`, false);
    if (codeTaken(o.code, o.id)) return toast('Dieser Code wird schon verwendet.', false);
    if (!id) S.handwerker.push(o); else S.handwerker[S.handwerker.findIndex((x) => x.id === id)] = o;
    d.close(); adminRender();
  };
  d.showModal();
}

/* ---------- Veröffentlichen ---------- */
async function buildNext() {
  syncThreads(S.threads, S.handwerker, S.projekte);
  return buildPackage({ stand: new Date().toLocaleDateString('de-DE'), projekte: S.projekte, handwerker: S.handwerker, masters: S.masters, threads: S.threads, sb: S.sb });
}
function openPublish() {
  const d = dlg('sheet', 'sheet'), tk = token(), list = changes();
  d.innerHTML = `<form class="panel form" id="pbf"><div class="sh-h"><h2>Veröffentlichen</h2><button type="button" class="btn ghost sm" data-a="close">Schließen</button></div>
    <div><h3 class="sub-h">Das ändert sich (${list.length})</h3><ul class="chg">${list.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
    ${tk ? '<p class="hint">✓ GitHub-Token ist in diesem Browser gespeichert. <button type="button" class="linkbtn" data-a="tkdel">Anderen Token verwenden</button></p>' : `<p class="hint">Einmalige Einrichtung: github.com → Einstellungen → Developer settings → Fine-grained tokens. Repository nur <b>keuerleber-real-estate</b>, Berechtigung <b>Contents: Read and write</b>.</p><label class="f"><span>GitHub-Token</span><input name="tk" type="password" autocomplete="off" spellcheck="false" required></label>`}
    <p class="lg-err hidden" id="pbErr" role="alert"></p><div class="acts sticky-save"><button class="btn fill">Jetzt veröffentlichen</button></div></form>`;
  d.onclick = (e) => { if (e.target.closest('[data-a=close]')) d.close(); else if (e.target.closest('[data-a=tkdel]')) { try { localStorage.removeItem(TOKEN_KEY); } catch { /* egal */ } d.close(); openPublish(); } };
  d.querySelector('#pbf').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target, btn = f.querySelector('.sticky-save .btn'), er = f.querySelector('#pbErr'); btn.disabled = true; btn.textContent = 'Wird veröffentlicht …'; er.classList.add('hidden');
    try { await publish((tk || f.tk.value).trim()); d.close(); toast('Veröffentlicht. Handwerker sehen den neuen Stand beim nächsten Öffnen.'); adminRender(); } catch (x) { er.textContent = x.message || String(x); er.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Jetzt veröffentlichen'; }
  };
  d.showModal();
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function publish(tk) {
  const h = { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' };
  const net = (e) => { throw new Error(e instanceof TypeError ? 'Keine Verbindung zu GitHub – bitte Internet prüfen.' : e.message || String(e)); };
  const badToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* egal */ } return new Error('GitHub-Token ungültig, abgelaufen oder ohne Schreibrecht auf keuerleber-real-estate. Bitte neuen Token eintragen.'); };
  const meta = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}?ref=main`, { headers: h }).catch(net);
  if (meta.status === 401 || meta.status === 403) throw badToken();
  if (meta.status === 404 && (await fetch(`https://api.github.com/repos/${REPO}`, { headers: h }).catch(net)).status !== 200) throw badToken();
  let sha;
  if (meta.ok) {
    const m = await meta.json(); sha = m.sha;
    if (m.content && ctx.pkg) { // Zwischenzeitlich von anderer Stelle veröffentlicht? Dann nicht überschreiben.
      let remote = null; try { remote = JSON.parse(new TextDecoder().decode(fromB64(m.content.replace(/\s/g, '')))); } catch { /* unlesbar: Prüfung überspringen */ }
      if (remote && !same(remote, ctx.pkg)) throw new Error('Zwischenzeitlich wurde der Handwerkerbereich von anderer Stelle verändert. Es wurde nichts überschrieben. Bitte die Seite neu laden (nach einem Veröffentlichen zeigt sie 1–2 Minuten lang evtl. noch den alten Stand) und die Änderungen erneut eintragen.');
    }
  }
  const built = await buildNext();
  const body = { message: 'Handwerkerbereich aktualisiert', content: toB64(new TextEncoder().encode(JSON.stringify(built.pkg))), branch: 'main', ...(sha ? { sha } : {}) };
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(net);
  if (r.status === 401 || r.status === 403) throw badToken();
  if (!r.ok) throw new Error(r.status === 409 || r.status === 422 ? 'Zwischenzeitlich wurde etwas anderes veröffentlicht – bitte Seite neu laden.' : 'GitHub meldet Fehler ' + r.status);
  try { localStorage.setItem(TOKEN_KEY, tk); } catch { /* egal */ }
  const me = S.masters.find((m) => m.id === ctx.sess.id);
  if (!me) { ctx.pkg = built.pkg; throw new Error('Dein eigener Zugang wurde entfernt – bitte neu anmelden.'); }
  ctx.pkg = built.pkg;
  const payload = await openSlot(me.code, built.pkg.slots.find((x) => x.id === ctx.sess.id), built.pkg.iter);
  relogin({ ...payload, code: me.code, id: ctx.sess.id }, await openProjects(payload, built.pkg));
  B = snapshot();
}
