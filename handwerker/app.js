// Handwerkerbereich: Anmeldung, Baustellen, Verlauf (Wochenbericht, Probleme, Chat, Rechnungen). Master nutzen dieselbe Ansicht plus Verwaltung (admin.js).
import { openProjects, openSlot } from './pkg.js';
import { fetchEvents, getFile, postEvent, putFile } from './store.js';
import { ago, askBox, confirmBox, dlg, dt, dtm, esc, eur, kwKey, kwOf, logo, lsGet, lsSet, shrinkImage, themaWechseln, toast } from './ui.js';

const app = document.getElementById('app');
const SESSION = 'nf-hw-session';
const KONTAKT = { tel: '+49 160 3636997', name: 'Sebastian Sultanow' };
export const ctx = { pkg: null, sess: null, proj: [], ev: [], last: 0, view: 'start', tid: null, loading: false, err: '', admin: null };

document.addEventListener('click', (e) => { if (e.target.closest('.thema')) themaWechseln(); });

async function loadPackage() {
  const r = await fetch('data.enc.json?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Daten konnten nicht geladen werden (' + r.status + ')');
  return r.json();
}

/* ---------- Typen ---------- */
export const TYP = {
  bericht: { l: 'Wochenbericht', c: 'var(--gut)' },
  problem: { l: 'Problem', c: 'var(--krit)' },
  chat: { l: 'Nachricht', c: 'var(--schiefer)' },
  rechnung: { l: 'Rechnung', c: 'var(--gold)' },
};

/* ---------- Daten ---------- */
export const isAdmin = () => ctx.sess?.r === 'admin';
export const threadList = () => Object.entries(ctx.sess.threads).filter(([, t]) => t.on || isAdmin()).map(([tid, t]) => ({ tid, ...t }));
export const projOf = (t) => ctx.proj.find((p) => p.bid === t.bid) ?? ctx.admin?.projekte?.find((p) => p.id === t.pid);
export const hwName = (hid) => ctx.admin?.handwerker?.find((h) => h.id === hid)?.name ?? ctx.sess.n;
export const evOf = (tid) => ctx.ev.filter((e) => e.tid === tid);
export const mine = (e) => e.von === (isAdmin() ? 'm' : 'hw');
const seenKey = () => 'nf-hw-seen-' + ctx.sess.id;
export const unread = (tid) => { const s = lsGet(seenKey()) ?? {}; return evOf(tid).filter((e) => !mine(e) && e.rid > (s[tid] ?? 0)).length; };
function markSeen(tid) { const s = lsGet(seenKey()) ?? {}, l = evOf(tid).at(-1); if (l) { s[tid] = l.rid; lsSet(seenKey(), s); } }
export const offeneProbleme = (tid) => { const done = new Set(evOf(tid).filter((e) => e.typ === 'erledigt').map((e) => e.ref)); return evOf(tid).filter((e) => e.typ === 'problem' && !done.has(e.id)); };
export const berichtDieseWoche = (tid) => evOf(tid).some((e) => e.typ === 'bericht' && e.kw === kwKey(kwOf()));

export async function load(quiet = false) {
  if (!ctx.sess?.sb) { ctx.err = 'Der Speicherdienst ist noch nicht eingerichtet.'; return; }
  if (ctx.loading) return;
  ctx.loading = true; if (!quiet) { ctx.err = ''; }
  try {
    const neu = await fetchEvents(ctx.sess.sb, Object.fromEntries(threadList().map((t) => [t.tid, t])), ctx.last);
    if (neu.length) { ctx.ev = ctx.ev.concat(neu); ctx.last = ctx.ev.at(-1).rid; }
    ctx.err = ''; ctx.at = Date.now();
    return neu.length;
  } catch (e) { ctx.err = e.message || String(e); } finally { ctx.loading = false; }
}

async function send(tid, ev) {
  const t = ctx.sess.threads[tid];
  await postEvent(ctx.sess.sb, tid, t.k, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), t: Date.now(), von: isAdmin() ? 'm' : 'hw', n: ctx.sess.n, ...ev });
  await load(true);
}

/* ---------- Anmeldung ---------- */
async function enter(payload, code, id) {
  ctx.sess = { ...payload, code, id };
  ctx.proj = await openProjects(payload, ctx.pkg);
  ctx.ev = []; ctx.last = 0;
  try { sessionStorage.setItem(SESSION, JSON.stringify(ctx.sess)); } catch { /* egal */ }
  if (location.hash) history.replaceState(null, '', location.pathname);
  ctx.view = payload.r === 'admin' ? 'admin' : 'start'; ctx.tid = null;
  render(); await load(); render();
}
function logout() {
  try { sessionStorage.removeItem(SESSION); } catch { /* egal */ }
  ctx.sess = null; ctx.ev = []; ctx.admin = null;
  history.replaceState(null, '', location.pathname); showLogin();
}
export const relogin = (sess, proj) => { ctx.sess = sess; ctx.proj = proj; try { sessionStorage.setItem(SESSION, JSON.stringify(sess)); } catch { /* egal */ } };

function showLogin(msg = '', busy = false) {
  app.innerHTML = `<main class="lg"><div class="lg-card">${logo('lg-logo')}
    <span class="eyebrow">Handwerkerbereich</span><h1>Baustellen-Portal</h1>
    <p class="lg-sub">Vertraulicher Zugang für unsere Handwerker. Bitte Zugangscode oder Passwort eingeben.</p>
    <form class="lg-form" id="loginForm" autocomplete="off"><label for="pw">Zugangscode oder Passwort</label>
      <input id="pw" type="password" autocomplete="current-password" required maxlength="200" ${busy ? 'disabled' : ''}>
      ${msg ? `<p class="lg-err" role="alert">${esc(msg)}</p>` : ''}
      <button class="btn fill" ${busy ? 'disabled' : ''}>${busy ? 'Prüfe …' : 'Anmelden'}</button></form>
    <p class="lg-foot">Kein Zugang? Rufen Sie ${KONTAKT.name} an: ${KONTAKT.tel}</p></div></main>`;
  document.getElementById('pw').focus();
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    let code = document.getElementById('pw').value.trim(), only = null;
    const dot = code.indexOf('.');
    if (dot > 0 && ctx.pkg.slots.some((s) => s.id === code.slice(0, dot))) { only = code.slice(0, dot); code = code.slice(dot + 1); }
    showLogin('', true);
    const todo = ctx.pkg.slots.filter((s) => !only || s.id === only); let n = 0;
    for (const slot of todo) {
      const b = document.querySelector('.lg-form .btn'); if (b) b.textContent = todo.length > 1 ? `Prüfe … ${++n}/${todo.length}` : 'Prüfe …';
      await new Promise((r) => setTimeout(r, 30));
      const payload = await openSlot(code, slot, ctx.pkg.iter);
      if (payload) return enter(payload, code, slot.id);
    }
    showLogin('Zugangscode oder Passwort nicht korrekt.');
  });
}

/* ---------- Kopf ---------- */
export function header(sub = 'Baustellen-Portal') {
  const hell = document.documentElement.getAttribute('data-theme') === 'light';
  return `<header class="p-kopf"><div class="wrap p-in"><div class="brand">${logo('top-logo')}<div><h1>Handwerkerbereich</h1><small><b></b>${esc(sub)}</small></div></div>
    <div class="top-r"><span class="top-user">Angemeldet: <b>${esc(ctx.sess.n)}</b></span>
    ${isAdmin() ? '<button class="btn dark sm" id="toAdmin">Verwaltung</button>' : ''}
    <button class="btn dark sm" id="logout">Abmelden</button>
    <button class="thema" type="button" role="switch" aria-checked="${hell}" aria-label="Helle Darstellung"></button></div></div></header>`;
}
const wire = () => {
  document.getElementById('logout')?.addEventListener('click', logout);
  document.getElementById('toAdmin')?.addEventListener('click', () => { ctx.view = 'admin'; render(); window.scrollTo(0, 0); });
};

/* ---------- Render ---------- */
export function render() {
  if (!ctx.sess) return showLogin();
  if (isAdmin() && ctx.view === 'start') ctx.view = 'admin';
  if (ctx.view === 'admin' && isAdmin()) return import('./admin.js').then((m) => m.adminRender());
  if (ctx.view === 'thread' && ctx.sess.threads[ctx.tid]) return renderThread();
  ctx.view = 'start'; renderStart();
}
export const go = (view, tid = null) => { ctx.view = view; ctx.tid = tid; render(); window.scrollTo(0, 0); };

function status(t) {
  const p = offeneProbleme(t.tid).length, u = unread(t.tid), k = kwOf();
  return `${berichtDieseWoche(t.tid) ? `<span class="pill ok">Bericht KW ${k.w} ✓</span>` : `<span class="pill warn">Bericht KW ${k.w} fehlt</span>`}
    ${p ? `<span class="pill krit">${p} offenes Problem${p > 1 ? 'e' : ''}</span>` : ''}${u ? `<span class="pill neu">${u} neu</span>` : ''}`;
}

function renderStart() {
  const list = threadList().filter((t) => t.on).sort((a, b) => (evOf(b.tid).at(-1)?.rid ?? 0) - (evOf(a.tid).at(-1)?.rid ?? 0));
  const gr = new Date().getHours() < 11 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Guten Tag' : 'Guten Abend';
  app.innerHTML = `${header()}<main class="wrap hw-main">
    <section class="held"><div><span class="eyebrow">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h2>${gr} <span>${esc(ctx.sess.firma || ctx.sess.n)}</span></h2></div></section>
    ${ctx.err ? `<p class="banner warn-b">${esc(ctx.err)} <button class="linkbtn" id="retry">Erneut versuchen</button></p>` : ''}
    <div class="banner">Ihre Baustellen <span>${list.length}</span></div>
    ${list.length ? `<div class="hw-grid">${list.map((t) => { const p = projOf(t) ?? {}, l = evOf(t.tid).at(-1); return `<button class="hw-card" data-tid="${t.tid}"><h3>${esc(p.name || 'Baustelle')}</h3><p>${esc(p.adresse || '')}</p>
      <div class="pills">${status(t)}</div><small>${l ? `Letzte Aktivität ${ago(l.at)} · ${esc(l.von === 'm' ? l.n : 'Sie')}` : 'Noch keine Einträge'}</small></button>`; }).join('')}</div>`
      : '<p class="empty">Ihnen ist noch keine Baustelle freigeschaltet. Bitte melden Sie sich bei uns.</p>'}
    <footer class="p-fuss wrap"><span>Norderfranken Haus und Grund GmbH · Am Gewerbegebiet 5 · 95185 Gattendorf</span><span>${KONTAKT.name} · ${KONTAKT.tel}</span></footer></main>`;
  wire();
  document.getElementById('retry')?.addEventListener('click', async () => { await load(); render(); });
  app.querySelectorAll('.hw-card').forEach((b) => b.addEventListener('click', () => go('thread', b.dataset.tid)));
}

/* ---------- Verlauf einer Baustelle ---------- */
const FILE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
function bubble(e, tid) {
  const t = TYP[e.typ];
  if (e.typ === 'bezahlt') return `<li class="sys">✓ Rechnung als bezahlt markiert · ${esc(e.n)} · ${dtm(e.at)}</li>`;
  if (e.typ === 'erledigt') return `<li class="sys">✓ Problem erledigt · ${esc(e.n)} · ${dtm(e.at)}</li>`;
  const done = new Set(evOf(tid).filter((x) => x.typ === 'erledigt').map((x) => x.ref));
  const head = `<div class="bh"><b>${esc(e.von === 'm' ? e.n : e.von === (isAdmin() ? 'hw' : 'm') ? e.n : 'Sie')}</b>${t && e.typ !== 'chat' ? `<span class="chip2" style="--c:${t.c}">${t.l}${e.kw ? ' KW ' + e.kw.slice(-2) : ''}${e.dring ? ' · dringend' : ''}</span>` : ''}<small>${dtm(e.at)}</small></div>`;
  const kpi = e.typ === 'bericht' && e.pct != null ? `<div class="pb"><i style="width:${e.pct}%"></i></div><small>Baufortschritt ${e.pct} %</small>` : '';
  const fotos = (e.fotos ?? []).map((f, i) => `<button class="foto" data-p="${esc(f.p)}" data-i="${i}" aria-label="Foto vergrößern"><span>Foto lädt …</span></button>`).join('');
  const paid = new Set(evOf(tid).filter((x) => x.typ === 'bezahlt').map((x) => x.ref)).has(e.id);
  const rg = e.typ === 'rechnung' ? `<div class="rg"><div><b>${esc(e.nr || 'Rechnung')}</b><small>${e.betrag != null ? eur(e.betrag) : ''}${e.datum ? ' · ' + dt(e.datum) : ''}${paid ? ' · <span class="ok-t">bezahlt</span>' : ''}</small></div><span class="rg-b"><button class="btn ghost sm" data-file="${esc(e.datei.p)}" data-name="${esc(e.datei.n)}" data-type="${esc(e.datei.t)}">Öffnen / Laden</button>${isAdmin() && !paid ? `<button class="btn ghost sm" data-paid="${esc(e.id)}">Bezahlt</button>` : ''}</span></div>` : '';
  const erl = e.typ === 'problem' ? (done.has(e.id) ? '<small class="ok-t">✓ erledigt</small>' : isAdmin() ? `<button class="btn ghost sm" data-erl="${esc(e.id)}">Als erledigt markieren</button>` : '<small class="warn-t">Offen</small>') : '';
  return `<li class="bub ${e.von === 'm' ? 'm' : 'h'}${mine(e) ? ' me' : ''}" data-typ="${e.typ}" style="--c:${t?.c || 'var(--rand)'}">${head}${e.text ? `<p>${esc(e.text)}</p>` : ''}${kpi}${fotos ? `<div class="fotos">${fotos}</div>` : ''}${rg}${erl}</li>`;
}

function renderThread() {
  const t = { tid: ctx.tid, ...ctx.sess.threads[ctx.tid] }, p = projOf(t) ?? {}, ev = evOf(ctx.tid);
  const hw = isAdmin() ? `<span class="pill">${esc(hwName(t.hid))}</span>` : '';
  app.innerHTML = `${header(p.name || 'Baustelle')}<main class="wrap hw-main thread">
    <button class="linkbtn back" id="back">← ${isAdmin() ? 'Zur Übersicht' : 'Alle Baustellen'}</button>
    <section class="panel"><div class="ph"><div><span class="eyebrow">Baustelle</span><h2 class="big">${esc(p.name || '')}</h2><p class="hint">${esc(p.adresse || '')}</p></div><div class="pills">${hw}${status(t)}</div></div>
      ${p.hinweis ? `<p class="note">${esc(p.hinweis)}</p>` : ''}
      <div class="acts"><button class="btn fill" data-act="bericht">Wochenbericht</button><button class="btn" data-act="problem">Problem melden</button><button class="btn" data-act="rechnung">Rechnung hochladen</button></div></section>
    ${ctx.err ? `<p class="banner warn-b">${esc(ctx.err)}</p>` : ''}
    <ul class="feed2" id="feed">${ev.length ? ev.map((e) => bubble(e, ctx.tid)).join('') : '<li class="empty">Noch keine Einträge. Schreiben Sie die erste Nachricht oder senden Sie einen Wochenbericht.</li>'}</ul>
    <form class="composer" id="chatForm"><textarea name="text" rows="1" placeholder="Nachricht schreiben …" maxlength="2000" aria-label="Nachricht"></textarea>
      <label class="btn ghost attach" title="Foto anhängen"><input type="file" accept="image/*" multiple hidden id="chatPics">Foto</label><button class="btn fill">Senden</button></form>
    <p class="hint pics-h" id="picsInfo"></p></main>`;
  wire();
  document.getElementById('back').addEventListener('click', () => go(isAdmin() ? 'admin' : 'start'));
  markSeen(ctx.tid);
  hydrate();
  const fb = document.getElementById('feed'); fb.scrollTop = fb.scrollHeight; window.scrollTo(0, document.body.scrollHeight);
  app.querySelectorAll('[data-paid]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; try { await send(ctx.tid, { typ: 'bezahlt', ref: b.dataset.paid }); renderThread(); } catch (x) { toast(x.message, false); b.disabled = false; } }));
  app.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => openForm(b.dataset.act)));
  app.querySelectorAll('[data-erl]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; try { await send(ctx.tid, { typ: 'erledigt', ref: b.dataset.erl }); renderThread(); } catch (x) { toast(x.message, false); b.disabled = false; } }));
  const pics = document.getElementById('chatPics');
  pics.addEventListener('change', () => { document.getElementById('picsInfo').textContent = pics.files.length ? `${pics.files.length} Foto${pics.files.length > 1 ? 's' : ''} angehängt` : ''; });
  document.getElementById('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, text = f.text.value.trim(), files = [...pics.files];
    if (!text && !files.length) return;
    const btn = f.querySelector('.fill'); btn.disabled = true; btn.textContent = 'Sende …';
    try { await send(ctx.tid, { typ: 'chat', text, fotos: await uploadPics(files) }); renderThread(); } catch (x) { toast(x.message, false); btn.disabled = false; btn.textContent = 'Senden'; }
  });
}

async function uploadPics(files) {
  const t = ctx.sess.threads[ctx.tid], out = [];
  for (const f of files.slice(0, 8)) out.push({ p: await putFile(ctx.sess.sb, ctx.tid, t.k, await shrinkImage(f)), n: f.name });
  return out;
}

/** Fotos und Dateien im Verlauf nachladen (entschlüsseln erst beim Anzeigen). */
function hydrate() {
  const t = ctx.sess.threads[ctx.tid];
  app.querySelectorAll('.foto').forEach(async (b) => {
    try { const u = await getFile(ctx.sess.sb, b.dataset.p, t.k, 'image/jpeg'); b.innerHTML = `<img src="${u}" alt="Baustellenfoto" loading="lazy">`; b.onclick = () => lightbox(u); } catch { b.innerHTML = '<span>nicht ladbar</span>'; }
  });
  app.querySelectorAll('[data-file]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { const u = await getFile(ctx.sess.sb, b.dataset.file, t.k, b.dataset.type); const a = document.createElement('a'); a.href = u; a.download = b.dataset.name; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); } catch (x) { toast(x.message, false); }
    b.disabled = false;
  }));
}
function lightbox(u) {
  const d = dlg('lb', 'lb'); d.innerHTML = `<form method="dialog"><button class="lb-x" aria-label="Schließen">×</button></form><img src="${u}" alt="Baustellenfoto">`;
  d.onclick = (e) => { if (e.target === d) d.close(); }; d.showModal();
}

/* ---------- Formulare ---------- */
function openForm(kind) {
  const d = dlg('sheet', 'sheet'), k = kwOf(), prior = evOf(ctx.tid).filter((e) => e.typ === 'bericht').at(-1);
  const fields = {
    bericht: `<p class="hint">Bitte einmal pro Woche: aktuelle Fotos und kurz, was erledigt wurde und was als Nächstes ansteht (KW ${k.w}).</p>
      <label class="f wide"><span>Aktueller Stand</span><textarea name="text" rows="4" maxlength="2000" required placeholder="Was wurde diese Woche erledigt? Was kommt als Nächstes?"></textarea></label>
      <label class="f"><span>Baufortschritt Ihres Gewerks (%)</span><input name="pct" type="number" min="0" max="100" step="5" value="${prior?.pct ?? 0}" required></label>`,
    problem: `<p class="hint">Mängel, Verzögerungen, fehlendes Material, Rückfragen zur Planung – wir sehen es sofort.</p>
      <label class="f wide"><span>Was ist das Problem?</span><textarea name="text" rows="4" maxlength="2000" required></textarea></label>
      <label class="f"><span>Dringlichkeit</span><select name="dring"><option value="">Normal</option><option value="1">Dringend – bitte heute melden</option></select></label>`,
    rechnung: `<p class="hint">PDF oder Foto der Rechnung. Nur wir (Master) sehen sie.</p>
      <label class="f"><span>Rechnungsnummer</span><input name="nr" maxlength="60" required></label>
      <label class="f"><span>Betrag brutto (€)</span><input name="betrag" inputmode="decimal" placeholder="z. B. 4.250,00" required></label>
      <label class="f"><span>Rechnungsdatum</span><input name="datum" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="f wide"><span>Notiz (optional)</span><textarea name="text" rows="2" maxlength="500"></textarea></label>`,
  }[kind];
  const title = { bericht: 'Wochenbericht', problem: 'Problem melden', rechnung: 'Rechnung hochladen' }[kind];
  d.innerHTML = `<form class="panel form" id="hwForm"><div class="sh-h"><h2>${title}</h2><button type="button" class="btn ghost sm" data-a="close">Abbrechen</button></div><div class="grid">${fields}
    <label class="f wide"><span>${kind === 'rechnung' ? 'Rechnung (PDF oder Foto)' : 'Fotos (bis zu 8)'}</span><input name="files" type="file" ${kind === 'rechnung' ? 'accept="application/pdf,image/*" required' : 'accept="image/*" multiple'}></label></div>
    <p class="lg-err hidden" id="hwErr" role="alert"></p><div class="acts sticky-save"><button class="btn fill">${kind === 'rechnung' ? 'Hochladen' : 'Senden'}</button></div></form>`;
  d.onclick = (e) => { if (e.target.closest('[data-a=close]')) d.close(); };
  d.querySelector('#hwForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('.sticky-save .btn'), err = f.querySelector('#hwErr'); let files = [...f.files.files];
    btn.disabled = true; btn.textContent = 'Wird übertragen …'; err.classList.add('hidden');
    try {
      const t = ctx.sess.threads[ctx.tid], text = f.text?.value.trim() ?? '';
      if (kind === 'rechnung') {
        const file = files[0]; if (!file) throw new Error('Bitte eine Datei auswählen.');
        if (file.size > 12 * 1024 * 1024) throw new Error('Die Datei ist größer als 12 MB.');
        const ext = file.name.split('.').pop().toLowerCase(), type = FILE_TYPES[ext] || file.type || 'application/octet-stream';
        const bytes = type.startsWith('image/') ? await shrinkImage(file, 2400) : new Uint8Array(await file.arrayBuffer());
        const betrag = Number(String(f.betrag.value).replace(/\./g, '').replace(',', '.'));
        if (!(betrag >= 0)) throw new Error('Bitte einen gültigen Betrag eingeben.');
        await send(ctx.tid, { typ: 'rechnung', nr: f.nr.value.trim(), betrag, datum: Date.parse(f.datum.value), text, datei: { p: await putFile(ctx.sess.sb, ctx.tid, t.k, bytes), n: file.name, t: type.startsWith('image/') ? 'image/jpeg' : type } });
      } else {
        await send(ctx.tid, { typ: kind, text, fotos: await uploadPics(files), ...(kind === 'bericht' ? { pct: Number(f.pct.value), kw: kwKey(k) } : { dring: f.dring.value === '1' }) });
      }
      d.close(); toast('Gesendet. Vielen Dank!'); renderThread();
    } catch (x) { err.textContent = x.message || String(x); err.classList.remove('hidden'); btn.disabled = false; btn.textContent = kind === 'rechnung' ? 'Hochladen' : 'Senden'; }
  };
  d.showModal();
}

/* ---------- Aktualisierung ---------- */
let busy = false;
async function tick() {
  if (busy || !ctx.sess || document.visibilityState !== 'visible' || document.getElementById('sheet')?.open) return;
  busy = true;
  try {
    const n = await load(true);
    if (n && ctx.view === 'thread' && !document.getElementById('sheet')?.open && !document.querySelector('#chatForm textarea')?.value) renderThread();
    else if (n && ctx.view === 'start') renderStart();
    else if (n && ctx.view === 'admin' && !document.getElementById('sheet')?.open && !document.getElementById('mini')?.open) import('./admin.js').then((m) => m.adminRender());
  } finally { busy = false; }
}
setInterval(tick, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });

/* ---------- Start ---------- */
(async () => {
  try { ctx.pkg = await loadPackage(); } catch (e) { app.innerHTML = `<p style="padding:40px;font-family:sans-serif">${esc(e.message)}</p>`; return; }
  const hash = location.hash.slice(1);
  if (!hash) { const s = (() => { try { return JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch { return null; } })(); if (s?.id && ctx.pkg.slots.some((x) => x.id === s.id)) { ctx.sess = s; ctx.proj = await openProjects(s, ctx.pkg).catch(() => []); render(); await load(); render(); return; } }
  showLogin();
  if (hash) { const i = hash.indexOf('.'); if (i > 0) { const pw = document.getElementById('pw'); pw.value = decodeURIComponent(hash); pw.form.requestSubmit(); } }
})();
export { send, load as reload };
