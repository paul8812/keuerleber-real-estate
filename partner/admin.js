// Verwaltung (nur Master): Objekte, Partner und Team pflegen und verschlüsselt veröffentlichen.
import { buildPackage, newFeedbackKeys, openFeedback, openJson, openObjects, openSlot, randomCode, randomId, toB64 } from './crypto.js';
import { dashHtml } from './dash.js';
import { STAGES } from './fb.js';
import { esc, eur } from './app.js';

const REPO = 'paul8812/keuerleber-real-estate';
const FILE = 'partner/data.enc.json';
const TOKEN_KEY = 'nf-partner-gh';
const STEPS = ['Ankauf', 'Rückbau', 'Sanierung', 'Abnahme', 'Vermietung'];
const MIN_PW = 12;
const VS = { frei: 'Frei', reserviert: 'Reserviert', notar: 'Notartermin', verkauft: 'Verkauft' };
const NOTE_VS = { frei: 'Wieder frei', reserviert: 'Reserviert', notar: 'Notartermin', verkauft: 'Verkauft' };

let S = null; // Arbeitsstand (bleibt erhalten, solange der Tab offen ist)
let B = null; // zuletzt veröffentlichter Stand – Vergleichsbasis für „Änderungen“
let tab = 'dash';
const EV = { list: [], at: 0, err: '', loading: false }; // entschlüsselte Rückmeldungen vom Server

const clone = (x) => JSON.parse(JSON.stringify(x));
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((i) => [i, v[i]])) : v));
const token = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const linkFor = (p) => `${location.origin}${location.pathname}#${p.id}.${encodeURIComponent(p.code)}`;
const snapshot = () => clone({ partners: S.partners, masters: S.masters, objekte: S.data.objekte, fb: S.fb, ev: S.ev, evx: S.evx });
const byId = (a) => new Map(a.map((x) => [x.id, x]));
const titel = (o) => `${o.strasse}${o.lage ? ' · ' + o.lage : ''}`;
const nObj = (p) => p.objekte.filter((i) => S.data.objekte.some((o) => o.id === i)).length;

window.addEventListener('beforeunload', (e) => { if (S && B && changes().length) { e.preventDefault(); e.returnValue = ''; } });

/** Alles, was sich seit der letzten Veröffentlichung geändert hat – als lesbare Liste. */
function changes() {
  const out = [];
  const bp = byId(B.partners), sp = byId(S.partners);
  for (const p of S.partners) {
    const b = bp.get(p.id);
    if (!b) { out.push(`Partner „${p.name}“ neu angelegt`); continue; }
    if (b.name !== p.name) out.push(`Partner „${b.name}“ umbenannt in „${p.name}“`);
    if (b.code !== p.code) out.push(`Passwort von „${p.name}“ geändert`);
    const add = p.objekte.filter((i) => !b.objekte.includes(i) && S.data.objekte.some((o) => o.id === i)).length;
    const rem = b.objekte.filter((i) => !p.objekte.includes(i) && S.data.objekte.some((o) => o.id === i)).length;
    if (add || rem) out.push(`Freigaben von „${p.name}“: ${[add && `+${add}`, rem && `−${rem}`].filter(Boolean).join(' / ')}`);
  }
  for (const b of B.partners) if (!sp.has(b.id)) out.push(`Partner „${b.name}“ entfernt – Zugang wird gesperrt`);
  const bm = byId(B.masters), sm = byId(S.masters);
  for (const m of S.masters) {
    const b = bm.get(m.id);
    if (!b) out.push(`Master „${m.name}“ neu`);
    else { if (b.name !== m.name) out.push(`Master „${b.name}“ umbenannt in „${m.name}“`); if (b.code !== m.code) out.push(`Passwort von Master „${m.name}“ geändert`); }
  }
  for (const b of B.masters) if (!sm.has(b.id)) out.push(`Master „${b.name}“ entfernt`);
  const bo = byId(B.objekte), so = byId(S.data.objekte);
  for (const o of S.data.objekte) {
    const b = bo.get(o.id);
    if (!b) out.push(`Objekt „${titel(o)}“ neu`);
    else if (canon(b) !== canon(o)) out.push(`Objekt „${titel(o)}“ geändert${o.aend && o.t !== b.t ? ' (' + o.aend + ')' : ''}`);
  }
  for (const b of B.objekte) if (!so.has(b.id)) out.push(`Objekt „${titel(b)}“ gelöscht`);
  if (canon(B.fb) !== canon(S.fb)) out.push(!B.fb ? 'Rückmeldekanal für Partner eingerichtet' : 'Token für Rückmeldungen geändert');
  if (canon(B.evx ?? null) !== canon(S.evx)) out.push('Rückmeldungen bearbeitet oder entfernt');
  if ((B.ev?.length ?? 0) !== S.ev.length) out.push(`${S.ev.length > (B.ev?.length ?? 0) ? 'Rückmeldung erfasst' : 'Rückmeldung entfernt'} (manuell)`);
  const kept = B.objekte.filter((o) => so.has(o.id)).map((o) => o.id), now = S.data.objekte.filter((o) => bo.has(o.id)).map((o) => o.id);
  if (kept.join() !== now.join()) out.push('Reihenfolge der Objekte geändert');
  return out;
}

/** Änderungsvermerk für die „Neu“-Markierung bei den Partnern. */
function stamp(neu, was) {
  const ch = [];
  if (!was) ch.push('Neu');
  else {
    if (was.preis !== neu.preis) ch.push('Preis geändert');
    if ((was.vs || 'frei') !== (neu.vs || 'frei')) ch.push(NOTE_VS[neu.vs || 'frei']);
    if (was.fortschritt !== neu.fortschritt) ch.push('Sanierungsstand aktualisiert');
    if ((was.docs?.length ?? 0) !== (neu.docs?.length ?? 0)) ch.push('Unterlagen aktualisiert');
    if (was.miete !== neu.miete) ch.push('Miete geändert');
  }
  if (ch.length) { neu.t = Date.now(); neu.aend = ch.join(' · '); } else if (was?.t) { neu.t = was.t; neu.aend = was.aend; }
  return neu;
}

/* ---------- kleine Dialoge statt prompt()/confirm() ---------- */
const dlg = (id, cls) => {
  let d = document.getElementById(id);
  if (!d) { d = document.createElement('dialog'); d.id = id; d.className = cls; document.body.append(d); }
  return d;
};

function confirmBox({ title, text = '', ok = 'OK', danger = false }) {
  return new Promise((res) => {
    const d = dlg('mini', 'mini'); let out = false;
    d.innerHTML = `<form class="mini-b"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="acts"><button class="btn ${danger ? 'dark' : 'fill'}" id="mOk">${esc(ok)}</button><button type="button" class="btn ghost" id="mNo">Abbrechen</button></div></form>`;
    d.onclose = () => res(out);
    d.querySelector('#mNo').onclick = () => d.close();
    d.querySelector('form').onsubmit = (e) => { e.preventDefault(); out = true; d.close(); };
    d.showModal();
  });
}

function askBox({ title, label, value = '', ok = 'Speichern', hint = '', check }) {
  return new Promise((res) => {
    const d = dlg('mini', 'mini'); let out = null;
    d.innerHTML = `<form class="mini-b"><h3>${esc(title)}</h3>
      <label class="f"><span>${esc(label)}</span><input name="v" type="text" value="${esc(value)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}<p class="lg-err hidden" id="mErr" role="alert"></p>
      <div class="acts"><button class="btn fill">${esc(ok)}</button><button type="button" class="btn ghost" id="mNo">Abbrechen</button></div></form>`;
    d.onclose = () => res(out);
    d.querySelector('#mNo').onclick = () => d.close();
    d.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const v = e.target.v.value.trim(), er = check?.(v);
      if (er) { const p = d.querySelector('#mErr'); p.textContent = er; p.classList.remove('hidden'); return; }
      out = v; d.close();
    };
    d.showModal();
    const i = d.querySelector('input'); i.focus(); i.select();
  });
}

let toastTimer = 0;
function toast(text, ok = true) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.className = 'toast ' + (ok ? 'ok' : 'err');
  t.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ok ? 3200 : 6000);
}

async function copyText(text, fallbackTitle) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { await askBox({ title: fallbackTitle, label: 'Markieren und kopieren', value: text, ok: 'Fertig' }); return false; }
}

export async function mount({ app, ctx, render, logout, header }) {
  if (S && S.owner !== ctx.sess.id) { S = B = null; Object.assign(EV, { list: [], at: 0, err: '', loading: false }); }
  if (!S) {
    const a = await openJson(ctx.sess.a, ctx.pkg.admin);
    S = { partners: a.partners.map((p) => ({ ...p, objekte: p.objekte ?? [] })), masters: a.masters, fb: a.fb ?? null, ev: a.ev ?? [], evx: a.evx ?? { hide: [], edit: {} }, data: { objekte: clone(ctx.data.objekte) }, owner: ctx.sess.id, base: canon(ctx.pkg.admin) };
    B = snapshot();
  }
  const codeTaken = (code, exceptId) => [...S.partners, ...S.masters].some((x) => x.code === code && x.id !== exceptId);
  const pwError = (code, exceptId) => (code.length < MIN_PW ? `Das Passwort braucht mindestens ${MIN_PW} Zeichen.` : codeTaken(code, exceptId) ? 'Dieses Passwort wird schon verwendet – bitte ein anderes wählen.' : '');
  const uniqueId = (base) => { let id = base; while (S.data.objekte.some((x) => x.id === id)) id += '-2'; return id; };

  function leave() {
    app.onclick = app.onchange = app.onsubmit = app.oninput = null;
    for (const id of ['sheet', 'mini', 'toast']) { const d = document.getElementById(id); if (d) { d.onclose = null; d.close?.(); d.remove(); } }
  }

  /* ---------- Seite ---------- */
  const draw = (keepScroll = true) => {
    const y = window.scrollY;
    const n = changes().length;
    app.innerHTML = `${header().replace('<button class="btn dark sm" id="toAdmin">Verwaltung</button>', '<button class="btn ghost sm" id="back" data-a="back">Zur Übersicht</button>').replace('<button class="btn ghost sm" id="print">Drucken / PDF</button>', '').replace('id="logout"', 'id="logout" data-a="logout"')}
    <main class="wrap adm">
      <h1>Verwaltung</h1>
      <nav class="tabs" role="tablist" aria-label="Bereiche">${[['dash', 'Dashboard', ''], ['objekte', 'Objekte', S.data.objekte.length], ['partner', 'Partner', S.partners.length], ['team', 'Team', S.masters.length]]
        .map(([k, l, c]) => `<button role="tab" class="tab" aria-selected="${tab === k}" data-a="tab" data-id="${k}">${l}${c === '' ? '' : `<span>${c}</span>`}</button>`).join('')}</nav>
      ${tab === 'dash' ? dashPanel() : tab === 'objekte' ? objektPanel() : tab === 'partner' ? partnerPanel() : teamPanel()}
    </main>
    <div class="admin-bar"><div class="wrap">
      <span class="hint">${n ? `<b>● ${n} ${n === 1 ? 'Änderung' : 'Änderungen'}</b> – Partner sehen sie erst nach „Veröffentlichen“.` : '✓ Alles veröffentlicht.'}</span>
      <div class="acts">${n ? '<button class="btn ghost sm" data-a="discard">Verwerfen</button>' : ''}<button class="btn fill sm" data-a="publish" ${n ? '' : 'disabled'}>Veröffentlichen${n ? ' (' + n + ')' : ''}</button></div>
    </div></div>`;
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    if (tab === 'dash' && S.fb && !EV.loading && Date.now() - EV.at > 120000) loadEvents();
  };

  const evKey = (e) => `${e.pid}|${e.oid}|${String(e.k || '').trim().toLowerCase()}`;
  const allEvents = () => [...EV.list, ...S.ev].filter((e) => !S.evx.hide.includes(e.id)).map((e) => (S.evx.edit[e.id] ? { ...e, ...S.evx.edit[e.id] } : e));
  const chainOf = (key) => allEvents().filter((e) => evKey(e) === key).sort((a, b) => a.t - b.t);
  function removeEvents(ids) {
    S.ev = S.ev.filter((x) => !ids.includes(x.id));
    S.evx.hide = [...new Set([...S.evx.hide, ...ids.filter((i) => !i.startsWith('m'))])];
    for (const i of ids) delete S.evx.edit[i];
  }
  function dashPanel() { return dashHtml({ objekte: S.data.objekte, partners: S.partners, events: allEvents(), fb: S.fb, state: EV }); }

  async function loadEvents() {
    EV.loading = true; EV.err = ''; draw();
    try {
      const out = [];
      for (let page = 1; page <= 5; page++) {
        const r = await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=100&page=${page}&sort=created&direction=asc`, { headers: { Authorization: 'Bearer ' + S.fb.token, Accept: 'application/vnd.github+json' } });
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Token ungültig oder ohne Recht „Issues“.' : r.status === 404 ? 'Repository nicht erreichbar (sind „Issues“ aktiviert?).' : 'GitHub meldet Fehler ' + r.status);
        const list = await r.json();
        for (const is of list) {
          if (is.pull_request) continue;
          try { const ev = await openFeedback(S.fb.priv, is.body); out.push({ ...ev, id: 'i' + is.number, t: Date.parse(is.created_at) }); } catch { /* fremder Eintrag */ }
        }
        if (list.length < 100) break;
      }
      EV.list = out; EV.at = Date.now();
    } catch (e) { EV.err = e.message || String(e); EV.at = Date.now() - 60000; }
    EV.loading = false; draw();
  }

  async function checkToken(tk) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues?per_page=1`, { headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' } }).catch(() => null);
    if (!r) return 'Keine Verbindung zu GitHub.';
    return r.ok ? '' : r.status === 401 || r.status === 403 ? 'Token ungültig oder ohne Recht „Issues: Read and write“.' : r.status === 404 ? 'Repository nicht gefunden oder Issues nicht aktiviert.' : 'GitHub meldet Fehler ' + r.status;
  }

  function objektPanel() {
    const l = S.data.objekte;
    const cnt = (k) => l.filter((o) => (o.vs || 'frei') === k).length;
    const sum = ['frei', 'reserviert', 'notar', 'verkauft'].filter(cnt).map((k) => `${cnt(k)} ${VS[k].toLowerCase()}`).join(' · ');
    return `<section class="panel"><div class="ph"><div><h2>Objekte</h2><p class="hint">${l.length ? `${l.length} Objekte · ${sum}` : 'Noch keine Objekte.'}</p></div><button class="btn fill sm" data-a="new-obj">+ Objekt hinzufügen</button></div>
      <ul class="rows oc-list">${l.map((o, i) => {
        const sees = S.partners.filter((p) => p.objekte.includes(o.id)).length;
        return `<li class="oc"><img src="${esc(o.bild)}" alt=""><div class="oc-b"><b>${esc(titel(o))}</b><small>${eur(o.preis)} · ${esc(String(o.zimmer))} Zi. · ${esc(String(o.flaeche))} m²${o.docs?.length ? ` · ${o.docs.length} ${o.docs.length === 1 ? 'Unterlage' : 'Unterlagen'}` : ''}</small>
          <div class="oc-r"><label class="vsel"><span>Status</span><select data-vs="${esc(o.id)}" aria-label="Status von ${esc(titel(o))}">${Object.entries(VS).map(([v, t]) => `<option value="${v}"${(o.vs || 'frei') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <button class="vchip" data-a="share" data-id="${esc(o.id)}">${S.partners.length ? `Sichtbar für ${sees} von ${S.partners.length} Partnern ›` : 'Noch keine Partner'}</button></div></div>
          <div class="acts"><button class="btn dark sm" data-a="edit" data-id="${esc(o.id)}">Bearbeiten</button>
          <button class="btn ghost sm" data-a="up" data-id="${esc(o.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
          <button class="btn ghost sm" data-a="down" data-id="${esc(o.id)}" ${i === l.length - 1 ? 'disabled' : ''} aria-label="Nach unten">↓</button>
          <button class="btn ghost sm" data-a="dup" data-id="${esc(o.id)}">Duplizieren</button>
          <button class="btn ghost sm danger" data-a="del" data-id="${esc(o.id)}">Löschen</button></div></li>`;
      }).join('')}</ul></section>`;
  }

  function partnerPanel() {
    return `<section class="panel"><h2>Vertriebspartner</h2>
      <p class="hint">Jeder Partner hat einen eigenen Zugang und sieht <b>nur die Objekte, die Sie ihm freigeben</b>.</p>
      <form class="inline" id="addPartner"><input name="name" placeholder="Name des Partners / der Firma" required maxlength="80" aria-label="Name des Partners">
        <button class="btn fill sm">Partner anlegen</button></form>
      ${S.partners.length > 4 ? '<input type="search" id="psearch" class="psearch" placeholder="Partner suchen …" aria-label="Partner suchen">' : ''}
      ${S.partners.length ? '' : '<p class="empty">Noch keine Partner angelegt.</p>'}
      <ul class="rows" id="plist">${S.partners.map((p) => {
        const isNew = !B.partners.some((b) => b.id === p.id), n = nObj(p);
        return `<li class="pc" data-name="${esc(p.name.toLowerCase())}"><div><b>${esc(p.name)}</b>
          <small>${n ? `Sieht ${n} von ${S.data.objekte.length} Objekten` : '<span class="warn">Sieht noch kein Objekt</span>'}${isNew ? ' · <span class="warn">noch nicht veröffentlicht</span>' : ''}</small></div>
          <div class="acts"><button class="btn fill sm" data-a="open" data-id="${esc(p.id)}">Einladen &amp; verwalten</button></div></li>`;
      }).join('')}</ul></section>`;
  }

  function teamPanel() {
    return `<section class="panel"><h2>Team (Master)</h2>
      <p class="hint">Master dürfen alles verwalten und sehen alle Objekte. Anmeldung mit dem eigenen Passwort (mind. ${MIN_PW} Zeichen).</p>
      <ul class="rows">${S.masters.map((m) => `<li><div><b>${esc(m.name)}</b>${m.id === ctx.sess.id ? '<small>Das sind Sie</small>' : ''}</div>
        <div class="acts"><button class="btn ghost sm" data-a="mren" data-id="${esc(m.id)}">Umbenennen</button><button class="btn ghost sm" data-a="mpw" data-id="${esc(m.id)}">Passwort ändern</button>
        ${S.masters.length > 1 && m.id !== ctx.sess.id ? `<button class="btn ghost sm danger" data-a="mdel" data-id="${esc(m.id)}">Entfernen</button>` : ''}</div></li>`).join('')}</ul>
      <h3 class="sub-h">Weiteren Master hinzufügen</h3>
      <form class="inline" id="addMaster"><input name="name" placeholder="Name" required maxlength="60" aria-label="Name"><input name="code" type="text" placeholder="Passwort (mind. ${MIN_PW} Zeichen)" required minlength="${MIN_PW}" maxlength="100" autocomplete="off" aria-label="Passwort"><button class="btn ghost sm">Hinzufügen</button></form></section>`;
  }

  /* ---------- Aktionen auf der Seite ---------- */
  app.onclick = async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const { a, id } = b.dataset, l = S.data.objekte;
    if (a === 'back') { leave(); render(); }
    else if (a === 'logout') {
      if (changes().length && !confirm('Es gibt ungespeicherte Änderungen. Wirklich abmelden? Die Änderungen gehen verloren.')) return;
      leave(); S = B = null; logout();
    }
    else if (a === 'tab') { tab = id; draw(false); }
    else if (a === 'new-obj') openEditor('neu');
    else if (a === 'edit') openEditor(id);
    else if (a === 'share') openShare(id);
    else if (a === 'open') openPartner(id);
    else if (a === 'publish') openPublish();
    else if (a === 'up' || a === 'down') {
      const i = l.findIndex((o) => o.id === id), j = i + (a === 'up' ? -1 : 1);
      if (j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; draw(); }
    } else if (a === 'dup') {
      const i = l.findIndex((o) => o.id === id), c = clone(l[i]);
      c.id = uniqueId(c.id + '-kopie'); c.lage = (c.lage ? c.lage + ' ' : '') + '(Kopie)'; delete c.t; delete c.aend; delete c.vs;
      l.splice(i + 1, 0, stamp(c, null)); draw(); toast('Objekt dupliziert – jetzt über „Bearbeiten“ anpassen.');
    } else if (a === 'del') {
      const o = l.find((x) => x.id === id);
      if (await confirmBox({ title: 'Objekt löschen?', text: `„${titel(o)}“ wird bei allen Partnern entfernt (nach dem Veröffentlichen).`, ok: 'Löschen', danger: true })) {
        S.data.objekte = l.filter((x) => x.id !== id); S.partners.forEach((p) => (p.objekte = p.objekte.filter((i) => i !== id))); draw();
      }
    } else if (a === 'mren') {
      const m = S.masters.find((x) => x.id === id);
      const n = await askBox({ title: 'Master umbenennen', label: 'Name', value: m.name, check: (v) => (v ? '' : 'Bitte einen Namen eingeben.') });
      if (n && n !== m.name) { m.name = n.slice(0, 60); if (id === ctx.sess.id) ctx.sess.n = m.name; draw(); }
    } else if (a === 'mpw') {
      const m = S.masters.find((x) => x.id === id);
      const n = await askBox({ title: `Neues Passwort für ${m.name}`, label: 'Passwort', ok: 'Ändern', hint: `Mindestens ${MIN_PW} Zeichen. Gilt erst nach dem Veröffentlichen.`, check: (v) => pwError(v, id) });
      if (n) { m.code = n; draw(); toast('Passwort geändert – bitte veröffentlichen.'); }
    } else if (a === 'mdel') {
      const m = S.masters.find((x) => x.id === id);
      if (await confirmBox({ title: 'Master entfernen?', text: `Der Zugang von „${m.name}“ wird nach dem Veröffentlichen gesperrt.`, ok: 'Entfernen', danger: true })) { S.masters = S.masters.filter((x) => x.id !== id); draw(); }
    } else if (a === 'fbreload') { EV.at = 0; loadEvents(); }
    else if (a === 'fbtoken') {
      const n = await askBox({ title: 'Token für Rückmeldungen ändern', label: 'Neuer Token', ok: 'Prüfen & speichern', hint: 'Gilt für Partner erst nach dem Veröffentlichen.', check: (v) => (v ? '' : 'Bitte Token einfügen.') });
      if (n) { const er = await checkToken(n); if (er) return toast(er, false); S.fb.token = n; draw(); toast('Token geändert – bitte veröffentlichen.'); }
    } else if (a === 'mark-res') {
      const i = S.data.objekte.findIndex((o) => o.id === id), was = S.data.objekte[i], neu = clone(was);
      neu.vs = 'reserviert'; neu.vbis = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      S.data.objekte[i] = stamp(neu, was); draw(); toast(`${titel(was)} reserviert (14 Tage) – bitte veröffentlichen.`);
    } else if (a === 'ev-del') { removeEvents([id]); draw(); toast('Rückmeldung entfernt – bitte veröffentlichen.'); }
    else if (a === 'ch-del') {
      const ch = chainOf(b.dataset.key), last = ch[ch.length - 1];
      if (last && await confirmBox({ title: 'Interessent entfernen?', text: `„${last.k || 'Interessent'}“ bei ${last.on || 'diesem Objekt'} (${ch.length} Eintrag${ch.length > 1 ? 'e' : ''}) wird aus Dashboard und Verlauf entfernt (nach dem Veröffentlichen gespeichert).`, ok: 'Entfernen', danger: true })) { removeEvents(ch.map((e) => e.id)); draw(); toast('Entfernt – bitte veröffentlichen.'); }
    }
    else if (a === 'ch-edit') openChainEdit(b.dataset.key)
    else if (a === 'ev-add') openEvent();
    else if (a === 'discard') {
      if (await confirmBox({ title: 'Änderungen verwerfen?', text: 'Alles seit der letzten Veröffentlichung wird zurückgesetzt.', ok: 'Verwerfen', danger: true })) {
        S.partners = clone(B.partners); S.masters = clone(B.masters); S.data.objekte = clone(B.objekte); S.fb = clone(B.fb); S.ev = clone(B.ev); S.evx = clone(B.evx ?? { hide: [], edit: {} });
        const me = S.masters.find((m) => m.id === ctx.sess.id); if (me) ctx.sess.n = me.name;
        draw(); toast('Änderungen verworfen.');
      }
    }
  };

  app.onchange = (e) => {
    const s = e.target.closest('select[data-vs]'); if (!s) return;
    const i = S.data.objekte.findIndex((o) => o.id === s.dataset.vs), was = S.data.objekte[i], neu = clone(was);
    if (s.value === 'frei') delete neu.vs; else neu.vs = s.value;
    if (s.value !== 'reserviert') delete neu.vbis;
    S.data.objekte[i] = stamp(neu, was);
    draw(); toast(`${titel(was)}: ${VS[s.value]}`);
  };

  app.oninput = (e) => {
    if (e.target.id !== 'psearch') return;
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#plist li').forEach((li) => li.classList.toggle('hidden', !!q && !li.dataset.name.includes(q)));
  };

  app.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (e.target.id === 'fbSetup') {
      const tk = String(f.get('tk')).trim(), btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Prüfe …';
      checkToken(tk).then(async (er) => {
        if (er) { btn.disabled = false; btn.textContent = 'Einrichten'; return toast(er, false); }
        S.fb = { token: tk, ...(await newFeedbackKeys()) }; EV.at = 0; draw(); toast('Eingerichtet – jetzt „Veröffentlichen“, damit Partner melden können.');
      });
    } else if (e.target.id === 'addPartner') {
      const name = String(f.get('name')).trim();
      if (!name) return toast('Bitte einen Namen eingeben.', false);
      const p = { id: randomId(), name, code: randomCode(16), objekte: [] };
      S.partners.push(p); draw(); openPartner(p.id);
    } else if (e.target.id === 'addMaster') {
      const code = String(f.get('code')).trim(), name = String(f.get('name')).trim(), err = !name ? 'Bitte einen Namen eingeben.' : pwError(code, '');
      if (err) return toast(err, false);
      S.masters.push({ id: 'm' + randomId().slice(0, 4), name, code });
      draw(); toast('Master hinzugefügt – bitte veröffentlichen.');
    }
  };

  /* ---------- Partner: einladen & verwalten ---------- */
  function openPartner(id) {
    const sheet = dlg('sheet', 'sheet'); let showPw = false;
    const get = () => S.partners.find((x) => x.id === id);
    const paint = () => {
      const x = get(); if (!x) return;
      const st = sheet.querySelector('.panel')?.scrollTop ?? 0, all = S.data.objekte;
      const isNew = !B.partners.some((b) => b.id === x.id);
      const text = `Guten Tag,\n\nhier ist Ihr persönlicher Zugang zu unserer Objektübersicht (Eigentumswohnungen in Hof):\n${linkFor(x)}\n\nBei Fragen melden Sie sich gern bei Sebastian Sultanow, +49 160 3636997.\n\nViele Grüße\n${ctx.sess.n || ''}`;
      sheet.innerHTML = `<div class="panel form">
        <div class="sh-h"><h2>${esc(x.name)}</h2><button class="btn fill sm" data-a="close">Fertig</button></div>
        ${isNew ? '<p class="note">Neu angelegt – der Zugang funktioniert erst, nachdem Sie auf „Veröffentlichen“ geklickt haben (dauert ca. 1–2 Minuten).</p>' : ''}
        <h3 class="sub-h">1 · Einladung senden</h3>
        <p class="hint">Der Link öffnet die Übersicht direkt – ohne Passwort-Eingabe. Bitte nur an diesen Partner schicken.</p>
        <div class="acts share"><a class="btn fill sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">WhatsApp</a>
          <a class="btn dark sm" href="mailto:?subject=${encodeURIComponent('Ihr Zugang: Objektübersicht Hof')}&body=${encodeURIComponent(text)}">E-Mail</a>
          <button class="btn ghost sm" data-a="copy">Link kopieren</button>${navigator.share ? '<button class="btn ghost sm" data-a="nshare">Teilen …</button>' : ''}</div>
        <h3 class="sub-h">2 · Freigegebene Objekte <span class="cnt">${nObj(x)} von ${all.length}</span></h3>
        ${all.length ? `<div class="checks">${all.map((o) => `<label><input type="checkbox" data-ck="${esc(o.id)}" ${x.objekte.includes(o.id) ? 'checked' : ''}> <span>${esc(titel(o))}</span></label>`).join('')}</div>
        <div class="acts"><button class="btn ghost sm" data-a="all">Alle</button><button class="btn ghost sm" data-a="none">Keine</button></div>` : '<p class="empty">Noch keine Objekte angelegt.</p>'}
        <h3 class="sub-h">3 · Zugang</h3>
        <div class="kv"><span>Name</span><b>${esc(x.name)}</b><button class="btn ghost sm" data-a="ren">Umbenennen</button></div>
        <div class="kv"><span>Passwort</span><b class="mono">${showPw ? esc(x.code) : '••••••••••••'}</b><button class="btn ghost sm" data-a="pwshow">${showPw ? 'Verbergen' : 'Anzeigen'}</button></div>
        <div class="acts"><button class="btn ghost sm" data-a="pwset">Eigenes Passwort setzen</button><button class="btn ghost sm" data-a="pwrnd">Neu erzeugen</button></div>
        <p class="hint">Ein neues Passwort macht den bisherigen Link ungültig. Der Partner braucht dann den neuen Link.</p>
        <div class="dz"><button class="btn ghost sm danger" data-a="rm">Partner entfernen</button></div></div>`;
      sheet.querySelector('.panel').scrollTop = st;
    };
    sheet.onclose = () => draw();
    sheet.onchange = (e) => {
      const c = e.target.closest('input[data-ck]'); if (!c) return;
      const x = get(); x.objekte = c.checked ? [...new Set([...x.objekte, c.dataset.ck])] : x.objekte.filter((i) => i !== c.dataset.ck); paint();
    };
    sheet.onclick = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const x = get(), a = b.dataset.a;
      if (a === 'close') sheet.close();
      else if (a === 'copy') { if (await copyText(linkFor(x), 'Einladungslink')) { b.textContent = 'Kopiert ✓'; setTimeout(() => { b.textContent = 'Link kopieren'; }, 1800); } }
      else if (a === 'nshare') { try { await navigator.share({ title: 'Ihr Zugang: Objektübersicht Hof', url: linkFor(x) }); } catch { /* abgebrochen */ } }
      else if (a === 'all') { x.objekte = S.data.objekte.map((o) => o.id); paint(); }
      else if (a === 'none') { x.objekte = []; paint(); }
      else if (a === 'pwshow') { showPw = !showPw; paint(); }
      else if (a === 'ren') {
        const n = await askBox({ title: 'Partner umbenennen', label: 'Name', value: x.name, check: (v) => (v ? '' : 'Bitte einen Namen eingeben.') });
        if (n) { x.name = n.slice(0, 80); paint(); }
      } else if (a === 'pwset') {
        const n = await askBox({ title: 'Eigenes Passwort setzen', label: 'Passwort', ok: 'Setzen', hint: `Mindestens ${MIN_PW} Zeichen. Der bisherige Link wird ungültig.`, check: (v) => pwError(v, x.id) });
        if (n) { x.code = n; showPw = true; paint(); }
      } else if (a === 'pwrnd') {
        if (await confirmBox({ title: 'Neues Passwort erzeugen?', text: 'Der bisherige Einladungslink wird ungültig.', ok: 'Neu erzeugen' })) { x.code = randomCode(16); showPw = true; paint(); }
      } else if (a === 'rm') {
        if (await confirmBox({ title: 'Partner entfernen?', text: `Der Zugang von „${x.name}“ wird nach dem Veröffentlichen gesperrt.`, ok: 'Entfernen', danger: true })) { S.partners = S.partners.filter((p) => p.id !== x.id); sheet.close(); }
      }
    };
    paint();
    sheet.showModal();
  }

  /* ---------- Objekt: wer darf es sehen? ---------- */
  function openShare(oid) {
    const sheet = dlg('sheet', 'sheet'), o = S.data.objekte.find((x) => x.id === oid);
    const paint = () => {
      const st = sheet.querySelector('.panel')?.scrollTop ?? 0;
      sheet.innerHTML = `<div class="panel form"><div class="sh-h"><h2>Sichtbarkeit</h2><button class="btn fill sm" data-a="close">Fertig</button></div>
        <p class="hint"><b>${esc(titel(o))}</b> – diese Partner sehen das Objekt:</p>
        ${S.partners.length ? `<div class="checks">${S.partners.map((p) => `<label><input type="checkbox" data-ck="${esc(p.id)}" ${p.objekte.includes(oid) ? 'checked' : ''}> <span>${esc(p.name)}</span></label>`).join('')}</div>
        <div class="acts"><button class="btn ghost sm" data-a="all">Alle</button><button class="btn ghost sm" data-a="none">Keiner</button></div>` : '<p class="empty">Noch keine Partner angelegt – im Reiter „Partner“ anlegen.</p>'}</div>`;
      sheet.querySelector('.panel').scrollTop = st;
    };
    sheet.onclose = () => draw();
    sheet.onchange = (e) => {
      const c = e.target.closest('input[data-ck]'); if (!c) return;
      const p = S.partners.find((x) => x.id === c.dataset.ck); p.objekte = c.checked ? [...new Set([...p.objekte, oid])] : p.objekte.filter((i) => i !== oid);
    };
    sheet.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'close') sheet.close();
      else if (b.dataset.a === 'all') { S.partners.forEach((p) => { p.objekte = [...new Set([...p.objekte, oid])]; }); paint(); }
      else if (b.dataset.a === 'none') { S.partners.forEach((p) => { p.objekte = p.objekte.filter((i) => i !== oid); }); paint(); }
    };
    paint();
    sheet.showModal();
  }

  /* ---------- Rückmeldung manuell erfassen (z. B. per WhatsApp erhalten) ---------- */
  function openEvent() {
    if (!S.data.objekte.length) return toast('Bitte zuerst ein Objekt anlegen.', false);
    const sheet = dlg('sheet', 'sheet');
    sheet.innerHTML = `<form class="panel form" id="evForm"><div class="sh-h"><h2>Rückmeldung erfassen</h2><button type="button" class="btn ghost sm" data-a="close">Abbrechen</button></div>
      <p class="hint">Für Rückmeldungen, die Sie per WhatsApp, Mail oder Telefon erhalten haben.</p><div class="grid">
      <label class="f"><span>Objekt</span><select name="oid" required>${S.data.objekte.map((o) => `<option value="${esc(o.id)}">${esc(titel(o))}</option>`).join('')}</select></label>
      <label class="f"><span>Partner</span><select name="pid">${S.partners.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}<option value="">Anderer / extern</option></select></label>
      <label class="f"><span>Stand</span><select name="st">${STAGES.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select></label>
      <label class="f"><span>Interessent (Name/Kürzel)</span><input name="k" maxlength="60" autocomplete="off"></label>
      <label class="f wide"><span>Notiz</span><textarea name="n" rows="2" maxlength="400"></textarea></label></div>
      <div class="acts sticky-save"><button class="btn fill">Erfassen</button></div></form>`;
    sheet.onclose = () => draw(); sheet.onchange = null;
    sheet.onclick = (e) => { if (e.target.closest('[data-a=close]')) sheet.close(); };
    sheet.querySelector('#evForm').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target), o = S.data.objekte.find((x) => x.id === f.get('oid')), p = S.partners.find((x) => x.id === f.get('pid'));
      S.ev.push({ id: 'm' + Date.now().toString(36) + randomId(), t: Date.now(), pid: p?.id ?? 'extern', pn: p?.name ?? 'Extern', oid: o.id, on: titel(o), st: String(f.get('st')), k: String(f.get('k')).trim(), n: String(f.get('n')).trim(), man: true });
      sheet.close(); toast('Rückmeldung erfasst.');
    };
    sheet.showModal();
  }

  /* ---------- Interessent bearbeiten (Stand, Name, Notiz) ---------- */
  function openChainEdit(key) {
    const ch = chainOf(key), last = ch[ch.length - 1];
    if (!last) return;
    const sheet = dlg('sheet', 'sheet');
    sheet.innerHTML = `<form class="panel form" id="chForm"><div class="sh-h"><h2>Interessent bearbeiten</h2><button type="button" class="btn ghost sm" data-a="close">Abbrechen</button></div>
      <p class="hint">${esc(last.on || '')} · ${esc(last.pn || '')}</p><div class="grid">
      <label class="f"><span>Stand</span><select name="st">${STAGES.map((s) => `<option value="${s.id}"${s.id === last.st ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
      <label class="f"><span>Interessent (Name/Kürzel)</span><input name="k" maxlength="60" autocomplete="off" value="${esc(last.k || '')}"></label>
      <label class="f wide"><span>Notiz</span><textarea name="n" rows="2" maxlength="400">${esc(last.n || '')}</textarea></label></div>
      <div class="acts sticky-save"><button class="btn fill">Speichern</button></div></form>`;
    sheet.onclose = () => draw(); sheet.onchange = null;
    sheet.onclick = (e) => { if (e.target.closest('[data-a=close]')) sheet.close(); };
    sheet.querySelector('#chForm').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target), k = String(f.get('k')).trim();
      for (const ev of ch) S.evx.edit[ev.id] = { ...(S.evx.edit[ev.id] ?? {}), k, ...(ev.id === last.id ? { st: String(f.get('st')), n: String(f.get('n')).trim() } : {}) };
      sheet.close(); toast('Gespeichert – bitte veröffentlichen.');
    };
    sheet.showModal();
  }

  /* ---------- Veröffentlichen ---------- */
  async function buildNext() {
    const stand = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return buildPackage({ stand, objekte: S.data.objekte, partners: S.partners, masters: S.masters, fb: S.fb, ev: S.ev, evx: S.evx });
  }

  function openPublish() {
    const sheet = dlg('sheet', 'sheet'), ch = changes(), hasTk = !!token();
    const warn = S.partners.filter((p) => !nObj(p)).map((p) => `„${p.name}“ sieht noch kein Objekt.`);
    const nNew = S.partners.filter((p) => !B.partners.some((b) => b.id === p.id)).length;
    sheet.innerHTML = `<form class="panel form" id="pubForm">
      <div class="sh-h"><h2>Veröffentlichen</h2><button type="button" class="btn ghost sm" data-a="close">Schließen</button></div>
      <h3 class="sub-h">Das ändert sich <span class="cnt">${ch.length}</span></h3>
      <ul class="chg">${ch.map((c) => `<li>${esc(c)}</li>`).join('') || '<li>Keine Änderungen.</li>'}</ul>
      ${warn.length ? `<p class="note">${warn.map(esc).join('<br>')}</p>` : ''}
      ${nNew ? '<p class="hint">Neue Partner können sich erst anmelden, wenn die Veröffentlichung durch ist (ca. 1–2 Minuten).</p>' : ''}
      <div class="tk">
        ${hasTk ? '<p class="hint">✓ GitHub-Token ist in diesem Browser gespeichert. <button type="button" class="linkbtn" data-a="tkchange">Token ändern</button></p>' : `<p class="hint"><b>Einmalige Einrichtung:</b> Zum Veröffentlichen braucht diese Seite einen GitHub-Token (wird nur in diesem Browser gespeichert).</p>
        <ol class="hint steps"><li>github.com → Einstellungen → Developer settings → Fine-grained tokens → „Generate new token“.</li><li>Repository: nur <b>keuerleber-real-estate</b>, Berechtigung <b>Contents: Read and write</b>.</li><li>Token hier einfügen.</li></ol>`}
        <label class="f ${hasTk ? 'hidden' : ''}" id="tkWrap"><span>GitHub-Token</span><input type="password" id="gh" value="${esc(token())}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      </div>
      <p class="lg-err hidden" id="pubErr" role="alert"></p>
      <div class="acts sticky-save"><button class="btn fill" id="pubGo" ${ch.length ? '' : 'disabled'}>Jetzt veröffentlichen</button><button type="button" class="btn ghost" data-a="file">Als Datei sichern</button></div></form>`;
    sheet.onclose = () => draw();
    const err = (t) => { const p = sheet.querySelector('#pubErr'); p.textContent = t; p.classList.toggle('hidden', !t); };
    sheet.onclick = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'close') sheet.close();
      else if (b.dataset.a === 'tkchange') { sheet.querySelector('#tkWrap').classList.remove('hidden'); sheet.querySelector('#gh').focus(); }
      else if (b.dataset.a === 'file') {
        const { pkg } = await buildNext(), a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(pkg)], { type: 'application/json' })); a.download = 'data.enc.json'; a.click();
      }
    };
    sheet.querySelector('#pubForm').onsubmit = async (e) => {
      e.preventDefault(); err('');
      const tk = sheet.querySelector('#gh').value.trim();
      if (!tk) { sheet.querySelector('#tkWrap').classList.remove('hidden'); return err('Bitte zuerst den GitHub-Token eintragen (Anleitung oben).'); }
      const go = sheet.querySelector('#pubGo'), force = go.dataset.force === '1'; go.disabled = true; go.textContent = 'Veröffentliche …';
      try { await publish(tk, force); sheet.close(); draw(); toast('Veröffentlicht ✓ – Partner sehen es in ca. 1–2 Minuten.'); }
      catch (x) {
        err(x.message || String(x)); go.disabled = false;
        if (x.stale) { go.dataset.force = '1'; go.textContent = 'Trotzdem überschreiben'; } else go.textContent = 'Jetzt veröffentlichen';
      }
    };
    sheet.showModal();
  }

  async function publish(tk, force = false) {
    const built = await buildNext();
    const h = { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' };
    if (!force) {
      // Wurde seit dem Öffnen von anderer Stelle veröffentlicht? Dann würde dieser Stand fremde Änderungen überschreiben.
      const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}?ref=main`, { headers: { ...h, Accept: 'application/vnd.github.raw+json' } });
      if (cur.status === 401 || cur.status === 403) throw new Error('GitHub-Token ungültig oder ohne Schreibrecht.');
      if (cur.ok) {
        let remote = null; try { remote = await cur.json(); } catch { /* unlesbar: nicht blockieren */ }
        if (remote?.admin && canon(remote.admin) !== S.base) {
          const x = new Error('Seit dem Öffnen dieser Seite wurde von anderer Stelle veröffentlicht (z. B. von einem zweiten Master). Wenn Sie jetzt veröffentlichen, gehen diese Änderungen verloren. Besser: Seite neu laden und die Änderungen erneut vornehmen – oder bewusst überschreiben.');
          x.stale = true; throw x;
        }
      }
    }
    const meta = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}?ref=main`, { headers: h });
    if (meta.status === 401 || meta.status === 403) throw new Error('GitHub-Token ungültig oder ohne Schreibrecht.');
    const sha = meta.ok ? (await meta.json()).sha : undefined;
    const body = { message: 'Partnerbereich aktualisiert', content: toB64(new TextEncoder().encode(JSON.stringify(built.pkg))), branch: 'main', ...(sha ? { sha } : {}) };
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(r.status === 409 ? 'Zwischenzeitlich wurde etwas anderes veröffentlicht – bitte Seite neu laden.' : 'GitHub meldet Fehler ' + r.status);
    try { localStorage.setItem(TOKEN_KEY, tk); } catch { /* egal */ }
    // eigene Sitzung auf die neuen Schlüssel umstellen
    const me = S.masters.find((m) => m.id === ctx.sess.id);
    ctx.pkg = built.pkg;
    const payload = await openSlot(me.code, built.pkg.slots.find((x) => x.id === ctx.sess.id), built.pkg.iter);
    ctx.sess = { ...payload, code: me.code, id: ctx.sess.id, sig: built.pkg.objekte.map((b) => b.b).join('|') };
    ctx.data = await openObjects(ctx.sess, built.pkg);
    try { sessionStorage.setItem('nf-partner-session', JSON.stringify(ctx.sess)); } catch { /* egal */ }
    S.base = canon(built.pkg.admin);
    B = snapshot();
  }

  /* ---------- Objekt bearbeiten ---------- */
  function openEditor(id) {
    const isNew = id === 'neu';
    const o = isNew
      ? { id: '', bild: '', strasse: '', lage: '', status: { label: '', tone: 'prep' }, baujahr: 1970, energie: '', hausgeld: 0, ort: '95030 Hof — ', tags: [], zimmer: 2, flaeche: 0, miete: 0, mieteTyp: 'SOLL', preis: 0, preisHinweis: 'provisionsfrei für Käufer', fortschritt: 0, sanierung: '', hinweis: '', schritte: STEPS.map((label, i) => ({ label, state: i === 0 ? 'current' : 'todo' })) }
      : clone(S.data.objekte.find((x) => x.id === id));
    const f = (n, l, v, t = 'text', wide = false, extra = '') => `<label class="f${wide ? ' wide' : ''}"><span>${l}</span><input name="${n}" type="${t}" value="${esc(v)}" ${t === 'number' ? 'step="any" inputmode="decimal"' : ''} ${extra}></label>`;
    const sheet = dlg('sheet', 'sheet');
    sheet.innerHTML = `<form class="panel form" id="objForm">
      <h2>${isNew ? 'Objekt hinzufügen' : esc(titel(o))}</h2>
      <div class="grid">${f('strasse', 'Straße & Hausnummer', o.strasse, 'text', false, 'required')}${f('lage', 'Lage im Haus (z. B. 3. OG links)', o.lage)}
        ${f('ort', 'Lagebeschreibung', o.ort, 'text', true)}${f('tags', 'Ausstattung (mit Komma trennen)', o.tags.join(', '), 'text', true)}
        ${f('baujahr', 'Baujahr', o.baujahr, 'number', false, 'min="1000" max="2100"')}${f('energie', 'Energieklasse', o.energie)}${f('hausgeld', 'Hausgeld (€/Mon.)', o.hausgeld, 'number', false, 'min="0"')}${f('zimmer', 'Zimmer', o.zimmer, 'number', false, 'min="0"')}${f('flaeche', 'Wohnfläche (m²)', o.flaeche, 'number', false, 'required min="1"')}</div>
      <h2>Zahlen</h2><div class="grid">${f('miete', 'Kaltmiete (€/Mon.)', o.miete, 'number', false, 'min="0"')}
        <label class="f"><span>Miet-Art</span><select name="mieteTyp">${[['IST', 'IST – laut Mietvertrag'], ['SOLL', 'SOLL – kalkulierte Marktmiete'], ['PLAN', 'PLAN – Planwert vor Sanierung']].map(([v, l]) => `<option value="${v}"${o.mieteTyp === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        ${f('zl', 'Zuschlag (z. B. Garage, Stellplatz)', o.zuschlag?.label ?? '')}${f('zb', 'Zuschlag (€/Mon.)', o.zuschlag?.betrag ?? '', 'number', false, 'min="0"')}
        ${f('preis', 'Abgabepreis (€)', o.preis, 'number', false, 'required min="1"')}${f('preisHinweis', 'Hinweis zum Preis', o.preisHinweis)}</div>
      <p class="hint">Preis pro m², Rendite und Faktor werden automatisch berechnet.</p>
      <h2>Sanierung &amp; Status</h2><div class="grid">${f('fortschritt', 'Sanierungsstand (0–100 %)', o.fortschritt, 'number', false, 'min="0" max="100"')}${f('statusLabel', 'Statusbezeichnung am Foto (leer = automatisch)', o.status.label)}
        <label class="f wide"><span>Beschreibung der Sanierung</span><textarea name="sanierung" rows="3">${esc(o.sanierung)}</textarea></label>${f('hinweis', 'Hinweis fett (z. B. Unvermietet · Erstvermietung möglich)', o.hinweis, 'text', true)}</div>
      <h3 class="sub-h">Zeitplan</h3><div class="steps-ed">${o.schritte.map((s, i) => `<div><b>${esc(s.label)}</b><select name="ss${i}">${[['done', 'erledigt'], ['current', 'aktuell'], ['todo', 'offen']].map(([v, l]) => `<option value="${v}"${s.state === v ? ' selected' : ''}>${l}</option>`).join('')}</select><input name="sd${i}" placeholder="Datum, z. B. 07/2026" value="${esc(s.datum ?? '')}"></div>`).join('')}</div>
      <h2>Verfügbarkeit &amp; Ansprechpartner</h2><div class="grid">
        <label class="f"><span>Status</span><select name="vs">${Object.entries(VS).map(([v, l]) => `<option value="${v}"${(o.vs || 'frei') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        ${f('vbis', 'Reserviert bis (nur bei „Reserviert“, danach Hinweis „abgelaufen“)', o.vbis ?? '', 'date')}
        ${f('an', 'Ansprechpartner (leer = Standard: Sebastian Sultanow)', o.ansp?.name ?? '')}${f('at', 'Telefon/Handy (leer = Standard; WhatsApp nur bei Handynummer)', o.ansp?.tel ?? '', 'tel')}${f('am', 'E-Mail (optional, für Anfragen per Mail)', o.ansp?.mail ?? '', 'email')}</div>
      <h2>Unterlagen</h2>
      <ul class="rows" id="docRows"></ul>
      <label class="f wide"><span>Unterlagen hinzufügen · PDF, JPG oder PNG, je max. 2 MB (Exposé, Grundriss, Energieausweis …)</span><input type="file" name="docs" multiple accept="application/pdf,image/jpeg,image/png"></label>
      <p class="hint">Unterlagen liegen verschlüsselt in der Datei, die jeder Partner beim Öffnen lädt – deshalb sparsam und klein halten (PDFs komprimieren).</p>
      <h2>Foto</h2><label class="f wide"><span>${o.bild ? 'Neues Foto hochladen (ersetzt das aktuelle)' : 'Foto hochladen'} · JPG, PNG oder WebP</span><input type="file" name="foto" accept="image/jpeg,image/png,image/webp"></label>
      ${o.bild ? `<img src="${esc(o.bild)}" alt="" class="prev" id="prev">` : '<img alt="" class="prev hidden" id="prev">'}
      <p class="lg-err hidden" id="formErr" role="alert"></p>
      <div class="acts sticky-save"><button class="btn fill">Übernehmen</button><button type="button" class="btn ghost" id="cancel">Abbrechen</button></div></form>`;
    sheet.onclose = null; sheet.onclick = sheet.onchange = null;
    sheet.showModal();
    let photo = o.bild;
    sheet.querySelector('#cancel').onclick = () => sheet.close();
    let docs = clone(o.docs ?? []);
    const drawDocs = () => { sheet.querySelector('#docRows').innerHTML = docs.map((d, i) => `<li><div><b>${esc(d.n)}</b><small>${Math.max(1, Math.round((d.d.length * 0.75) / 1024))} KB</small></div><div class="acts"><button type="button" class="btn ghost sm danger" data-rmdoc="${i}">Entfernen</button></div></li>`).join('') || '<li><small>Noch keine Unterlagen.</small></li>'; };
    drawDocs();
    sheet.querySelector('#docRows').onclick = (e) => { const b = e.target.closest('[data-rmdoc]'); if (b) { docs.splice(+b.dataset.rmdoc, 1); drawDocs(); } };
    sheet.querySelector('input[name=docs]').onchange = async (e) => {
      const er = sheet.querySelector('#formErr'); er.classList.add('hidden');
      for (const file of e.target.files) {
        if (file.size > 2 * 1024 * 1024) { er.textContent = `„${file.name}“ ist größer als 2 MB und wurde nicht übernommen.`; er.classList.remove('hidden'); continue; }
        const d = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        docs.push({ n: file.name, d });
      }
      e.target.value = ''; drawDocs();
    };
    sheet.querySelector('input[name=foto]').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { photo = await resizeImage(file); const p = sheet.querySelector('#prev'); p.src = photo; p.classList.remove('hidden'); }
      catch { const er = sheet.querySelector('#formErr'); er.textContent = 'Das Foto konnte nicht gelesen werden.'; er.classList.remove('hidden'); }
    };
    sheet.querySelector('#objForm').onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), g = (k) => String(fd.get(k) ?? '').trim(), n = (k) => { const v = parseFloat(g(k).replace(',', '.')); return Number.isFinite(v) ? v : 0; };
      const fort = Math.min(100, Math.max(0, Math.round(n('fortschritt'))));
      const tone = fort >= 100 ? 'done' : fort <= 0 ? 'prep' : 'progress';
      const strasse = g('strasse'), lage = g('lage');
      let oid = o.id;
      if (!oid) oid = uniqueId((strasse + '-' + lage).toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'objekt-' + Date.now());
      const zl = g('zl'), zb = n('zb'), er = sheet.querySelector('#formErr');
      const fail = (t) => { er.textContent = t; er.classList.remove('hidden'); er.scrollIntoView({ block: 'center' }); };
      if (!photo) return fail('Bitte ein Foto hochladen – ohne Foto kann das Objekt bei den Partnern nicht angezeigt werden.');
      if (!!zl !== !!zb) return fail('Zuschlag: bitte Bezeichnung und Betrag angeben (oder beides leer lassen).');
      er.classList.add('hidden');
      const auto = (fo, to) => (to === 'done' ? 'Saniert' : to === 'prep' ? 'In Vorbereitung' : `In Sanierung · ${fo} %`);
      // Automatische Bezeichnung mitführen, solange sie nicht von Hand geändert wurde
      const label = g('statusLabel') && !(g('statusLabel') === o.status.label && o.status.label === auto(o.fortschritt, o.status.tone)) ? g('statusLabel') : auto(fort, tone);
      const neu = {
        id: oid, bild: photo, strasse, lage,
        status: { label, tone },
        baujahr: Math.round(n('baujahr')), energie: g('energie'), hausgeld: n('hausgeld'), ort: g('ort'),
        tags: g('tags').split(',').map((t) => t.trim()).filter(Boolean), zimmer: n('zimmer'), flaeche: n('flaeche') || 1,
        miete: n('miete'), mieteTyp: ['IST', 'SOLL', 'PLAN'].includes(g('mieteTyp')) ? g('mieteTyp') : 'SOLL', ...(zl && zb ? { zuschlag: { label: zl, betrag: zb } } : {}),
        preis: n('preis') || 1, preisHinweis: g('preisHinweis') || 'provisionsfrei für Käufer', fortschritt: fort, sanierung: g('sanierung'), hinweis: g('hinweis'),
        schritte: STEPS.map((label, i) => ({ label, state: ['done', 'current', 'todo'].includes(g('ss' + i)) ? g('ss' + i) : 'todo', datum: g('sd' + i) || undefined })),
      };
      const vs = Object.keys(VS).includes(g('vs')) ? g('vs') : 'frei';
      if (vs !== 'frei') neu.vs = vs;
      if (vs === 'reserviert' && /^\d{4}-\d{2}-\d{2}$/.test(g('vbis'))) neu.vbis = g('vbis');
      if (g('an') || g('at') || g('am')) neu.ansp = { name: g('an'), tel: g('at'), mail: g('am') };
      if (docs.length) neu.docs = docs;
      const was = isNew ? null : S.data.objekte.find((x) => x.id === o.id);
      stamp(neu, was);
      const i = S.data.objekte.findIndex((x) => x.id === o.id);
      if (i >= 0) S.data.objekte[i] = neu; else S.data.objekte.push(neu);
      sheet.close();
      draw();
      toast(isNew ? 'Objekt hinzugefügt.' : 'Objekt übernommen.');
    };
  }

  draw(false);
}

/** Verkleinert ein Foto auf max. 1280 px Breite (JPEG), damit die Datei klein bleibt. */
async function resizeImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const w = Math.min(1280, img.naturalWidth), h = Math.round(img.naturalHeight * (w / img.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}
