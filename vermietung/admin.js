// Verwaltung der Vermietung: Objekte, Zugänge (alle mit vollen Rechten, Rolle nur zur Anzeige), Speicherdienst, Veröffentlichen.
import { buildPackage, openJson, openObjekte, openSlot, syncThreads } from './pkg.js';
import { REPO, FILE, TOKEN_KEY, ghToken, verOf, merke, vonSeite } from './quelle.js';
import { SQL, testConnection } from '../handwerker/store.js';
import { ctx, header, go, relogin, ROLLEN, STATUS, eur, num, load } from './app.js';
import { askBox, confirmBox, dlg, dt, esc, shrinkImage, toast } from '../handwerker/ui.js';
import { randomCode, randomId, toB64 } from '../partner/crypto.js';
import { AUSST, OBJ_FELDER, SEITEN, STP, UEBERNEHMBAR, ableiten, ibanOk, ibanSchoen, schluesselEditor, schluesselLesen, schluesselPlus, vorlageVon } from './mvfelder.js';

const MIN_PW = 12;
const app = document.getElementById('app');
const clone = (x) => JSON.parse(JSON.stringify(x));
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((i) => [i, v[i]])) : v));
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
let S = null, B = null, tab = 'objekte';
const LIVE = { v: 0, seit: 0, stand: '' };
const snapshot = () => clone({ objekte: S.objekte, team: S.team, sb: S.sb, gh: S.gh ?? null });
const token = ghToken, pubToken = () => S?.gh?.token || token();
const linkFor = (m) => `${location.origin}${location.pathname}#${m.id}.${encodeURIComponent(m.code)}`;
const codeTaken = (c, id) => S.team.some((x) => x.id !== id && x.code === c);
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'objekt';

async function init() {
  if (S && S.owner === ctx.sess.id && S.ver === verOf(ctx.pkg)) return;
  if (S && S.owner === ctx.sess.id && changes().length) return; // ungespeicherte Änderungen behalten
  const a = await openJson(ctx.sess.a, ctx.pkg.admin);
  S = { objekte: a.objekte ?? [], team: a.team ?? [], threads: a.threads ?? [], sb: a.sb ?? null, gh: a.gh ?? null, owner: ctx.sess.id, ver: verOf(ctx.pkg), base: canon(ctx.pkg.admin) };
  B = snapshot(); ctx.admin = S;
  if (S.gh?.token && !token()) { try { localStorage.setItem(TOKEN_KEY, S.gh.token); } catch { /* privater Modus */ } }
}
function changes() {
  const out = [], b = (k) => new Map((B[k] ?? []).map((x) => [x.id, x]));
  for (const [k, l, n] of [['objekte', 'Objekt', (x) => x.titel], ['team', 'Zugang', (x) => x.name]]) {
    const old = b(k), cur = new Map(S[k].map((x) => [x.id, x]));
    for (const [id, x] of cur) { if (!old.has(id)) out.push(`${l} „${n(x)}“ neu`); else if (canon(old.get(id)) !== canon(x)) out.push(`${l} „${n(x)}“ geändert`); }
    for (const [id, x] of old) if (!cur.has(id)) out.push(`${l} „${n(x)}“ entfernt`);
  }
  if (canon(B.sb) !== canon(S.sb)) out.push('Speicherdienst geändert');
  if (canon(B.gh ?? null) !== canon(S.gh ?? null)) out.push(!B.gh ? 'GitHub-Token für alle Zugänge hinterlegt' : !S.gh ? 'Zentraler GitHub-Token entfernt' : 'Zentraler GitHub-Token geändert');
  return out;
}
const liveHint = () => (LIVE.stand === 'warte' ? '✓ Gespeichert. Wird bereitgestellt – in ca. 1–2 Minuten für alle sichtbar …'
  : LIVE.stand === 'live' ? '✓ Veröffentlicht und für alle sichtbar.'
  : LIVE.stand === 'langsam' ? '⚠ Gespeichert, aber GitHub stellt die Seite noch nicht bereit. <button type="button" class="linkbtn" data-a="redeploy">Erneut anstoßen</button>' : '');

const TABS = [['objekte', 'Objekte'], ['team', 'Zugänge'], ['einst', 'Einstellungen']];
export async function adminRender() {
  await init();
  const n = changes().length;
  app.innerHTML = `${header('Verwaltung')}<main class="wrap hw-main">
    <div class="ph"><h2 class="big">Verwaltung</h2></div>
    <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab${tab === k ? ' on' : ''}" data-tab="${k}" role="tab" aria-selected="${tab === k}">${l}${k === 'objekte' ? `<span class="cnt">${S.objekte.length}</span>` : k === 'team' ? `<span class="cnt">${S.team.length}</span>` : ''}</button>`).join('')}</nav>
    ${!S.sb ? '<p class="banner warn-b">Der Speicherdienst ist noch nicht eingerichtet – ohne ihn gibt es keinen Chat. <button class="linkbtn" data-tab="einst">Jetzt einrichten</button></p>' : ''}
    <div id="tp">${tab === 'objekte' ? pObjekte() : tab === 'team' ? pTeam() : pEinst()}</div></main>
    <div class="savebar on"><div class="wrap"><span id="pubHint" role="status">${n ? `● ${n} Änderung${n === 1 ? '' : 'en'} – erst nach „Veröffentlichen“ für alle sichtbar.` : liveHint() || '✓ Alles veröffentlicht.'}</span>
      <span>${n ? '<button class="btn ghost sm" id="discard">Verwerfen</button>' : ''}<button class="btn fill sm" id="pub" ${n || !pubToken() ? '' : 'disabled'}>${n ? `Veröffentlichen (${n})` : pubToken() ? 'Veröffentlichen' : 'GitHub-Token einrichten'}</button></span></div></div>`;
  document.getElementById('logout').addEventListener('click', () => { try { sessionStorage.removeItem('nf-vm-session'); } catch { /* egal */ } location.href = location.pathname; });
  document.getElementById('toStart')?.addEventListener('click', () => go('start'));
  app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; adminRender(); }));
  document.getElementById('discard')?.addEventListener('click', async () => { if (await confirmBox({ title: 'Änderungen verwerfen?', text: 'Alles seit der letzten Veröffentlichung wird zurückgesetzt.', ok: 'Verwerfen', danger: true })) { Object.assign(S, clone(B)); adminRender(); toast('Änderungen verworfen.'); } });
  document.getElementById('pub').addEventListener('click', openPublish);
  app.onclick = aktion; // eine einzige Behandlung, auch nach erneutem Zeichnen
  document.getElementById('sbForm')?.addEventListener('submit', sbSpeichern);
}

/* ---------- Panels ---------- */
function pObjekte() {
  return `<section class="panel"><div class="ph"><h2>Mietobjekte</h2><button class="btn fill sm" data-a="oadd">+ Objekt</button></div>
    <ul class="rows vm-orows">${S.objekte.map((o) => `<li>${o.bild ? `<img src="${esc(o.bild)}" alt="" class="vm-th">` : '<span class="vm-th vm-ph">' + esc(o.titel.slice(0, 1)) + '</span>'}<div><b>${esc(o.titel)}${o.lage ? ' · ' + esc(o.lage) : ''}</b><small>${esc([o.ort, o.kaltmiete ? eur(o.kaltmiete) + ' kalt' : '', o.flaeche ? num(o.flaeche, 1) + ' m²' : '', o.frei ? 'frei ab ' + dt(Date.parse(o.frei)) : ''].filter(Boolean).join(' · '))}</small></div>
      <span class="acts"><button class="btn ghost sm" data-a="oedit" data-id="${esc(o.id)}">Bearbeiten</button><button class="btn ghost sm" data-a="odel" data-id="${esc(o.id)}">Löschen</button></span></li>`).join('') || '<li class="empty">Noch keine Mietobjekte. Mit „+ Objekt“ anlegen und danach veröffentlichen.</li>'}</ul>
    <p class="hint">Den Vermietungsstand (In Vermarktung, Reserviert, Vermietet) ändert ihr direkt im Objekt – das geht sofort und ohne Veröffentlichen. Hier stehen nur die festen Objektdaten.</p></section>`;
}
function pTeam() {
  return `<section class="panel"><div class="ph"><h2>Zugänge</h2><button class="btn fill sm" data-a="madd">+ Zugang</button></div>
    <ul class="rows">${S.team.map((m) => `<li><div><b>${esc(m.name)}</b><small>${esc(m.rolle || 'ohne Rolle')}${m.id === ctx.sess.id ? ' · das sind Sie' : ''}</small></div>
      <span class="acts"><button class="btn ghost sm" data-a="mshow" data-id="${esc(m.id)}">Passwort zeigen</button><button class="btn ghost sm" data-a="mlink" data-id="${esc(m.id)}">Zugang senden</button><button class="btn ghost sm" data-a="medit" data-id="${esc(m.id)}">Name &amp; Rolle</button><button class="btn ghost sm" data-a="mpw" data-id="${esc(m.id)}">Passwort ändern</button>${m.id === ctx.sess.id ? '' : `<button class="btn ghost sm" data-a="mdel" data-id="${esc(m.id)}">Entfernen</button>`}</span></li>`).join('')}</ul>
    <p class="hint">Alle Zugänge haben die gleichen Rechte und sehen alle Objekte, Chats und Unterlagen. Die Rolle (z. B. Vermieter, Vermittler) steht im Chat bei jeder Nachricht.</p></section>`;
}
function pEinst() {
  const sql = S.sb?.url?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  return `<section class="panel"><h2>Speicherdienst (Supabase)</h2>
    <p class="hint">Hier liegen Chat, Besichtigungen, Mietdaten und Unterlagen – Ende-zu-Ende verschlüsselt. Einmalig im Supabase-Projekt das Einrichtungs-Skript ausführen (dasselbe wie im Handwerkerbereich – einmal reicht für beide).</p>
    <form class="grid" id="sbForm"><label class="f"><span>Projekt-Adresse</span><input name="url" placeholder="https://abcdxyz.supabase.co" value="${esc(S.sb?.url || '')}" autocomplete="off" spellcheck="false"></label>
      <label class="f"><span>Öffentlicher Schlüssel (anon / Publishable)</span><input name="key" type="password" value="${esc(S.sb?.key || '')}" autocomplete="off" spellcheck="false"></label>
      <div class="acts wide"><button class="btn fill sm">Prüfen &amp; speichern</button><button type="button" class="btn ghost sm" data-a="sql">Einrichtungs-Skript</button>${sql ? `<a class="btn ghost sm" href="https://supabase.com/dashboard/project/${esc(sql)}/sql/new" target="_blank" rel="noopener noreferrer">SQL-Editor öffnen</a>` : ''}</div></form></section>
    <section class="panel"><h2>Veröffentlichen</h2>
      <p class="hint gh-z">${S.gh?.token ? '✓ GitHub-Token ist zentral hinterlegt – alle Zugänge können veröffentlichen. <button type="button" class="linkbtn" data-a="ghdel">Entfernen</button>'
        : token() ? 'Noch kein zentraler Token – andere brauchen bisher einen eigenen. <button type="button" class="btn fill sm" data-a="ghshare">Meinen Token für alle hinterlegen</button>'
        : 'Noch kein GitHub-Token. Beim ersten „Veröffentlichen“ eintragen (derselbe wie im Partnerbereich genügt).'}</p></section>`;
}

/* ---------- Aktionen ---------- */
async function aktion(e) {
  const b = e.target.closest('[data-a]'); if (!b || !app.contains(b)) return;
  const { a, id } = b.dataset;
  if (a === 'oadd') return editObjekt(null);
  if (a === 'oedit') return editObjekt(id);
  if (a === 'odel') { const o = S.objekte.find((x) => x.id === id); if (await confirmBox({ title: 'Objekt löschen?', text: `„${o.titel}“ verschwindet aus der Übersicht. Chat und Unterlagen bleiben im Archiv erhalten.`, ok: 'Löschen', danger: true })) { S.objekte = S.objekte.filter((x) => x.id !== id); adminRender(); } return; }
  if (a === 'madd') return editZugang(null);
  if (a === 'medit') return editZugang(id);
  if (a === 'mlink') { const m = S.team.find((x) => x.id === id), l = linkFor(m), t = `Hallo ${m.name}, hier ist dein Zugang zur Vermietungs-Plattform:\n${l}\n(Den Link nicht weitergeben – er enthält das Passwort.)`; try { await navigator.clipboard.writeText(t); toast('Zugangstext kopiert – jetzt z. B. per WhatsApp schicken.'); } catch { await askBox({ title: 'Zugang', label: 'Link (enthält das Passwort)', value: l, ok: 'Schließen' }); } return; }
  if (a === 'mshow') {
    const m = S.team.find((x) => x.id === id), neu = B?.team?.find((x) => x.id === id)?.code !== m.code, d = dlg('mini', 'mini');
    d.innerHTML = `<div class="mini-b"><h3>Passwort von ${esc(m.name)}</h3>
      <p class="vm-pw"><code id="pwT">${esc(m.code)}</code><button type="button" class="btn ghost sm" data-c="pw">Kopieren</button></p>
      <p class="hint">${neu ? '<b>Noch nicht gültig:</b> Das Passwort wurde geändert oder neu angelegt und gilt erst nach dem Veröffentlichen.' : 'Anmelden auf keuerleber-immobilien.de/vermietung/ mit diesem Passwort – oder direkt mit dem Zugangslink, der das Passwort schon enthält.'}</p>
      <div class="acts"><button type="button" class="btn ghost sm" data-c="link">Zugangslink kopieren</button><button type="button" class="btn fill sm" data-c="zu">Schließen</button></div></div>`;
    d.onclick = async (x) => {
      const c = x.target.closest('[data-c]')?.dataset.c; if (!c) return;
      if (c === 'zu') return d.close();
      try { await navigator.clipboard.writeText(c === 'pw' ? m.code : linkFor(m)); toast(c === 'pw' ? 'Passwort kopiert.' : 'Zugangslink kopiert.'); }
      catch { const r = document.createRange(); r.selectNodeContents(d.querySelector('#pwT')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Kopieren nicht möglich – Passwort ist markiert.', false); }
    };
    return d.showModal();
  }
  if (a === 'mpw') { const m = S.team.find((x) => x.id === id), n = await askBox({ title: `Neues Passwort für ${m.name}`, label: 'Passwort', ok: 'Ändern', hint: `Mindestens ${MIN_PW} Zeichen. Gilt nach dem Veröffentlichen.`, check: (v) => (v.length < MIN_PW ? `Mindestens ${MIN_PW} Zeichen.` : codeTaken(v, m.id) ? 'Dieses Passwort wird schon verwendet.' : '') }); if (n) { m.code = n; adminRender(); toast('Passwort geändert – bitte veröffentlichen.'); } return; }
  if (a === 'mdel') { const m = S.team.find((x) => x.id === id); if (await confirmBox({ title: 'Zugang entfernen?', text: `„${m.name}“ kann sich nach dem Veröffentlichen nicht mehr anmelden.`, ok: 'Entfernen', danger: true })) { S.team = S.team.filter((x) => x.id !== id); adminRender(); } return; }
  if (a === 'sql') { const d = dlg('sheet', 'sheet'); d.innerHTML = `<div class="panel form"><div class="sh-h"><h2>Einrichtungs-Skript</h2><button class="btn ghost sm" data-a="close">Schließen</button></div><p class="hint">In Supabase links „SQL Editor“ → „New query“ → einfügen → „Run“. Einmal genügt (auch für den Handwerkerbereich).</p><textarea readonly rows="16" class="code">${esc(SQL)}</textarea><div class="acts"><button class="btn fill sm" id="cp">Kopieren</button></div></div>`; d.onclick = (x) => { if (x.target.closest('[data-a=close]')) d.close(); }; d.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(SQL); toast('Skript kopiert.'); } catch { d.querySelector('textarea').select(); } }; return d.showModal(); }
  if (a === 'ghshare') { b.disabled = true; const f = await checkPubToken(token()); if (f) { adminRender(); return toast(f, false); } S.gh = { token: token() }; adminRender(); return toast('Token geprüft ✓ – jetzt unten „Veröffentlichen“.'); }
  if (a === 'ghdel') { S.gh = null; adminRender(); return toast('Zentraler Token entfernt – bitte veröffentlichen.'); }
  if (a === 'redeploy') { if (!pubToken()) return openPublish(); b.disabled = true; b.textContent = 'Stoße an …'; publish(pubToken()).then(() => adminRender(), (x) => { toast(x.message || String(x), false); adminRender(); }); }
}
async function sbSpeichern(e) {
  e.preventDefault(); const f = e.target, sb = { url: f.url.value.trim().replace(/\/+$/, ''), key: f.key.value.trim() };
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(sb.url)) return toast('Adresse bitte als https://….supabase.co eintragen.', false);
  const er = await testConnection(sb); if (er) return toast(er, false);
  S.sb = sb; adminRender(); toast('Speicherdienst verbunden – jetzt veröffentlichen.');
}

function editObjekt(id) {
  const o = id ? S.objekte.find((x) => x.id === id) : { id: '', titel: '', lage: '', ort: '95028 Hof', typ: 'Wohnung', zimmer: '', flaeche: '', kaltmiete: '', nk: '', kaution: '', frei: '', ausstattung: '', beschreibung: '', hinweis: '', bild: '', status0: 'vermarktung' };
  const d = dlg('sheet', 'sheet'); let bild = o.bild || '';
  const mv = { ...(id ? {} : vorlageVon(S.objekte)), ...(o.mv ?? {}) }, ab = ableiten(o), quellen = S.objekte.filter((x) => x.id !== id && x.mv?.mvName);
  const mvF = ([k, l, ph]) => {
    if (k === 'seite') return `<label class="f"><span>${l}</span><select name="mv_seite">${SEITEN.map(([v, t]) => `<option value="${v}"${(mv.seite ?? '') === v ? ' selected' : ''}>${v ? t : 'aus „Lage im Haus“'}</option>`).join('')}</select></label>`;
    if (k === 'stp') return `<label class="f"><span>${l}</span><select name="mv_stp">${STP.map((v) => `<option value="${v}"${(mv.stp ?? '') === v ? ' selected' : ''}>${v || 'keiner / aus Ausstattung'}</option>`).join('')}</select></label>`;
    if (k === 'schluessel') return schluesselEditor(mv.schluessel, 'mvsl');
    if (k === 'vereinbarungen') return `<label class="f wide"><span>${l}</span><textarea name="mv_${k}" rows="2" maxlength="2500" placeholder="${esc(ph)}">${esc(mv[k] ?? '')}</textarea></label>`;
    const auto = k === 'geschoss' ? ab.geschoss : k === 'ort' ? ab.ort : '';
    return `<label class="f"><span>${l}</span><input name="mv_${k}" value="${esc(mv[k] ?? '')}" maxlength="200" placeholder="${esc(auto ? auto + ' (aus Objekt)' : ph)}" autocomplete="off"${['kv', 'stpKosten', 'kuecheKosten', 'nutzflaeche'].includes(k) ? ' inputmode="decimal"' : ''}></label>`;
  };
  const mvPflicht = ['mvName', 'mvAnschrift', 'bank', 'iban'], mvOffen = mvPflicht.filter((k) => !mv[k]).length;
  const zahlF = (n, l, v, step = 'any') => `<label class="f"><span>${l}</span><input name="${n}" type="number" min="0" step="${step}" value="${esc(v ?? '')}"></label>`;
  d.innerHTML = `<form class="panel form" id="of"><div class="sh-h"><h2>${id ? 'Objekt bearbeiten' : 'Neues Mietobjekt'}</h2><button type="button" class="btn ghost sm" data-a="close">Abbrechen</button></div><div class="grid">
    <label class="f"><span>Straße und Hausnummer</span><input name="titel" required maxlength="80" value="${esc(o.titel)}" placeholder="z. B. Leopoldstraße 71"></label>
    <label class="f"><span>Lage im Haus</span><input name="lage" maxlength="60" value="${esc(o.lage || '')}" placeholder="z. B. 2. OG links"></label>
    <label class="f"><span>PLZ und Ort</span><input name="ort" maxlength="60" value="${esc(o.ort || '')}"></label>
    <label class="f"><span>Art</span><select name="typ">${['Wohnung', 'Haus', 'WG-Zimmer', 'Gewerbe', 'Stellplatz / Garage'].map((t) => `<option${o.typ === t ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    ${zahlF('zimmer', 'Zimmer', o.zimmer, '0.5')}${zahlF('flaeche', 'Wohnfläche (m²)', o.flaeche)}
    ${zahlF('kaltmiete', 'Kaltmiete (€)', o.kaltmiete)}${zahlF('nk', 'Nebenkosten-Vorauszahlung (€)', o.nk)}${zahlF('kaution', 'Kaution (€)', o.kaution)}<p class="f vm-kzhint" id="kzHint" aria-live="polite"></p>
    <label class="f"><span>Frei ab</span><input name="frei" type="date" value="${esc(o.frei || '')}"></label>
    ${id ? '' : `<label class="f"><span>Stand zu Beginn</span><select name="status0">${Object.entries(STATUS).filter(([k]) => k !== 'vermietet').map(([k, v]) => `<option value="${k}"${o.status0 === k ? ' selected' : ''}>${v.l}</option>`).join('')}</select></label>`}
    <label class="f wide"><span>Ausstattung (mit Komma getrennt)</span><input name="ausstattung" maxlength="400" value="${esc(o.ausstattung || '')}" placeholder="Balkon, Einbauküche, Stellplatz, Keller"></label>
    <label class="f wide"><span>Beschreibung</span><textarea name="beschreibung" rows="3" maxlength="3000">${esc(o.beschreibung || '')}</textarea></label>
    <label class="f wide"><span>Interne Hinweise (Schlüssel, Ansprechpartner, Besichtigungen)</span><textarea name="hinweis" rows="2" maxlength="1000">${esc(o.hinweis || '')}</textarea></label>
    <div class="f wide"><span>Titelbild</span><div class="vm-bild">${bild ? `<img src="${esc(bild)}" alt="" id="bVor">` : '<span class="hint" id="bVor">Kein Bild</span>'}<label class="btn ghost sm">Bild wählen<input type="file" accept="image/*" hidden id="bIn"></label>${bild ? '<button type="button" class="btn ghost sm" id="bWeg">Entfernen</button>' : ''}</div></div></div>
    <details class="f wide vm-mvd"${!id || mvOffen ? ' open' : ''}><summary><b>Für den Mietvertrag</b><small>${mvOffen ? `${mvOffen} wichtige Angabe${mvOffen > 1 ? 'n' : ''} offen` : 'Vermieter, Bank, Ausstattung, Schlüssel …'}</small></summary>
      <p class="hint">Diese Angaben setzt die Plattform beim Interessenten in den Mietvertrag ein. Was hier fehlt, kann dort noch ergänzt werden.${!id && Object.keys(vorlageVon(S.objekte)).length ? ' Vermieter, Bank und Hausverwaltung sind vom zuletzt gepflegten Objekt vorgeschlagen.' : ''}</p>
      ${quellen.length ? `<label class="f"><span>Vermieter und Bank übernehmen von</span><select id="mvVon"><option value="">– Objekt wählen –</option>${quellen.map((x) => `<option value="${esc(x.id)}">${esc(x.titel)}${x.lage ? ' · ' + esc(x.lage) : ''}</option>`).join('')}</select></label>` : ''}
      <div class="grid">${OBJ_FELDER.map(mvF).join('')}
        <fieldset class="f wide vm-chk"><legend>Ausstattung laut Vertrag</legend>${AUSST.map(([k, l]) => `<label><input type="checkbox" name="mvau_${k}"${(typeof mv.ausst?.[k] === 'boolean' ? mv.ausst[k] : ab[k]) ? ' checked' : ''}> ${l}</label>`).join('')}</fieldset></div>
    </details>
    <p class="lg-err hidden" id="oErr" role="alert"></p><div class="acts sticky-save"><button class="btn fill">Übernehmen</button></div></form>`;
  d.onclick = (e) => { if (e.target.closest('[data-a=close]')) d.close(); const p = e.target.closest('[data-sl-plus]'); if (p) schluesselPlus(d, p.dataset.slPlus); };
  // Kaution in Kaltmieten anzeigen (üblich: 2, höchstens 3 nach § 551 BGB)
  const kz = () => { const f = d.querySelector('#of'), km = Number(f.kaltmiete.value), ka = Number(f.kaution.value), h = d.querySelector('#kzHint'); const r = km > 0 && ka > 0 ? ka / km : 0; h.textContent = r ? `Kaution = ${r.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Kaltmieten${r > 3.001 ? ' – höchstens 3 erlaubt' : ''}` : km > 0 ? `Leer lassen = 2 Kaltmieten (${(km * 2).toLocaleString('de-DE')} €) im Vertrag` : ''; h.classList.toggle('warn', r > 3.001); };
  d.querySelector('#of').addEventListener('input', (e) => { if (['kaltmiete', 'kaution'].includes(e.target.name)) kz(); }); kz();
  d.querySelector('#mvVon')?.addEventListener('change', (e) => {
    const q = S.objekte.find((x) => x.id === e.target.value); if (!q) return;
    for (const k of UEBERNEHMBAR) { const el = d.querySelector(`[name=mv_${k}]`); if (el && q.mv?.[k] != null) el.value = q.mv[k]; }
    toast('Vermieter, Bank und Vertragsvorgaben übernommen.');
  });
  d.querySelector('#bIn').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const bytes = await shrinkImage(f, 1200); bild = 'data:image/jpeg;base64,' + toB64(bytes); const v = d.querySelector('#bVor'); v.outerHTML = `<img src="${bild}" alt="" id="bVor">`; } catch (x) { toast(x.message, false); }
  };
  d.querySelector('#bWeg')?.addEventListener('click', () => { bild = ''; d.querySelector('#bVor').outerHTML = '<span class="hint" id="bVor">Kein Bild</span>'; });
  d.querySelector('#of').onsubmit = (e) => {
    e.preventDefault(); const f = e.target, z = (k) => (f[k].value === '' ? '' : Number(f[k].value));
    const n = { ...o, titel: f.titel.value.trim(), lage: f.lage.value.trim(), ort: f.ort.value.trim(), typ: f.typ.value, zimmer: z('zimmer'), flaeche: z('flaeche'), kaltmiete: z('kaltmiete'), nk: z('nk'), kaution: z('kaution'), frei: f.frei.value, ausstattung: f.ausstattung.value.trim(), beschreibung: f.beschreibung.value.trim(), hinweis: f.hinweis.value.trim(), bild, ...(id ? {} : { status0: f.status0.value }) };
    const nmv = {}; for (const [k] of OBJ_FELDER) { const el = f[`mv_${k}`]; if (el && el.value.trim() !== '') nmv[k] = el.value.trim(); }
    if (nmv.iban) { if (!ibanOk(nmv.iban)) return toast('Die IBAN ist nicht gültig – bitte prüfen.', false); nmv.iban = ibanSchoen(nmv.iban); }
    for (const k of ['kv', 'stpKosten', 'kuecheKosten', 'nutzflaeche']) if (nmv[k] != null) { const z = Number(String(nmv[k]).replace(/\./g, '').replace(',', '.')); if (!Number.isFinite(z)) return toast(`„${OBJ_FELDER.find((x) => x[0] === k)[1]}“ bitte als Zahl.`, false); nmv[k] = z; }
    nmv.ausst = Object.fromEntries(AUSST.map(([k]) => [k, f[`mvau_${k}`].checked]));
    const sl = schluesselLesen(f, 'mvsl'); if (sl.length) nmv.schluessel = sl;
    n.mv = nmv;
    if (!n.titel) return toast('Bitte Straße und Hausnummer eintragen.', false);
    if (!id) { let s = slug(n.titel + (n.lage ? '-' + n.lage : '')), i = 2; while (S.objekte.some((x) => x.id === s)) s = slug(n.titel) + '-' + i++; n.id = s; S.objekte.push(n); }
    else S.objekte[S.objekte.findIndex((x) => x.id === id)] = n;
    d.close(); adminRender(); toast('Übernommen – zum Freischalten unten „Veröffentlichen“.');
  };
  d.showModal();
}
function editZugang(id) {
  const m = id ? S.team.find((x) => x.id === id) : null;
  const d = dlg('sheet', 'sheet');
  d.innerHTML = `<form class="panel form" id="mf"><div class="sh-h"><h2>${m ? 'Name und Rolle' : 'Neuer Zugang'}</h2><button type="button" class="btn ghost sm" data-a="close">Abbrechen</button></div><div class="grid">
    <label class="f"><span>Name</span><input name="name" required maxlength="60" value="${esc(m?.name || '')}"></label>
    <label class="f"><span>Rolle</span><select name="rolle">${ROLLEN.map((r) => `<option${(m?.rolle || 'Vermieter') === r ? ' selected' : ''}>${r}</option>`).join('')}</select></label></div>
    ${m ? '' : '<p class="hint">Das Passwort wird automatisch erzeugt. Danach „Zugang senden“ – der Link enthält es. Gilt nach dem Veröffentlichen.</p>'}
    <div class="acts sticky-save"><button class="btn fill">Übernehmen</button></div></form>`;
  d.onclick = (e) => { if (e.target.closest('[data-a=close]')) d.close(); };
  d.querySelector('#mf').onsubmit = (e) => {
    e.preventDefault(); const f = e.target, name = f.name.value.trim().slice(0, 60); if (!name) return toast('Bitte einen Namen eintragen.', false);
    if (m) { m.name = name; m.rolle = f.rolle.value; if (m.id === ctx.sess.id) { ctx.sess.n = name; ctx.sess.rolle = m.rolle; } }
    else { let mid; do mid = 'z' + randomId().slice(0, 5); while (S.team.some((x) => x.id === mid)); S.team.push({ id: mid, name, rolle: f.rolle.value, code: randomCode(20) }); }
    d.close(); tab = 'team'; adminRender(); if (!m) toast('Zugang angelegt – veröffentlichen, dann „Zugang senden“.');
  };
  d.showModal();
}

/* ---------- GitHub-Token ---------- */
const REPO_NAME = REPO.split('/')[1];
const TK_UNGUELTIG = 'Der GitHub-Token wird nicht angenommen: abgelaufen, gelöscht oder nicht vollständig kopiert. Bitte den Token komplett neu einfügen.';
const TK_OHNE_RECHT = `Der Token darf nicht in „${REPO_NAME}“ schreiben. Auf GitHub beim Token unter „Repository access“ ${REPO_NAME} auswählen und bei „Contents“ „Read and write“ einstellen.`;
function tokenFormat(tk) {
  if (/\s/.test(tk)) return 'Im Token stehen Leerzeichen oder Zeilenumbrüche – bitte nur den Token selbst einfügen.';
  if (!/^(github_pat_|gh[pousr]_)/.test(tk)) return 'Das ist kein GitHub-Token. Er beginnt mit „github_pat_“ (oder „ghp_“).';
  if (tk.length < 36) return 'Der Token ist zu kurz – wahrscheinlich nicht vollständig kopiert.';
  return '';
}
async function checkPubToken(tk) {
  if (!tk) return 'Bitte den GitHub-Token einfügen.';
  const fmt = tokenFormat(tk); if (fmt) return fmt;
  const r = await fetch(`https://api.github.com/repos/${REPO}`, { cache: 'no-store', headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' } }).catch(() => null);
  if (!r) return 'Keine Verbindung zu GitHub – bitte Internetverbindung prüfen.';
  if (r.status === 401) return TK_UNGUELTIG;
  if (!r.ok) return r.status === 403 || r.status === 404 ? TK_OHNE_RECHT : 'GitHub meldet Fehler ' + r.status;
  // Schreibrecht prüfen, ohne etwas zu schreiben: eine leere Anfrage führt GitHub nie aus (ohne Recht 403/404, mit Recht 422)
  const w = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, { method: 'PUT', cache: 'no-store', headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
  if (w && (w.status === 403 || w.status === 404)) return TK_OHNE_RECHT;
  return '';
}

/* ---------- Veröffentlichen ---------- */
function openPublish() {
  const d = dlg('sheet', 'sheet'), list = changes(), zentral = !!S.gh?.token, hasTk = !!pubToken();
  d.innerHTML = `<form class="panel form" id="pbf"><div class="sh-h"><h2>Veröffentlichen</h2><button type="button" class="btn ghost sm" data-a="close">Schließen</button></div>
    <div><h3 class="sub-h">Das ändert sich (${list.length})</h3><ul class="chg">${list.map((c) => `<li>${esc(c)}</li>`).join('') || '<li>Keine Änderungen.</li>'}</ul></div>
    <div class="tk">${hasTk ? `<p class="hint">✓ ${zentral ? 'GitHub-Token ist zentral hinterlegt.' : 'GitHub-Token ist in diesem Browser gespeichert.'} <button type="button" class="linkbtn" data-a="tkchange">Token ändern</button></p>`
      : '<p class="hint"><b>Einmalig:</b> Zum Veröffentlichen braucht die Seite einen GitHub-Token (Repository <b>keuerleber-real-estate</b>, „Contents: Read and write“) – derselbe wie im Partnerbereich genügt.</p>'}
      <div class="tk-row ${hasTk ? 'hidden' : ''}" id="tkWrap"><label class="f"><span>GitHub-Token</span><input type="password" id="gh" autocomplete="off" autocapitalize="off" spellcheck="false"></label></div>
      <label class="chk ${hasTk ? 'hidden' : ''}" id="tkAlleWrap"><input type="checkbox" id="tkAlle" checked> Für alle Zugänge hinterlegen (verschlüsselt)</label></div>
    <p class="lg-err hidden" id="pbErr" role="alert"></p><div class="acts sticky-save"><button class="btn fill" id="pbGo" ${list.length || !hasTk ? '' : 'disabled'}>Jetzt veröffentlichen</button></div></form>`;
  const err = (t) => { const p = d.querySelector('#pbErr'); p.textContent = t; p.classList.toggle('hidden', !t); };
  d.onclick = (e) => {
    if (e.target.closest('[data-a=close]')) d.close();
    else if (e.target.closest('[data-a=tkchange]')) { for (const w of ['#tkWrap', '#tkAlleWrap']) d.querySelector(w).classList.remove('hidden'); d.querySelector('#gh').focus(); d.querySelector('#pbGo').disabled = false; }
  };
  d.onclose = () => adminRender();
  d.querySelector('#pbf').onsubmit = async (e) => {
    e.preventDefault(); err('');
    const offen = !d.querySelector('#tkWrap').classList.contains('hidden'), typed = d.querySelector('#gh').value.trim();
    const tk = (offen && typed) || pubToken();
    if (!tk) return err('Bitte zuerst den GitHub-Token eintragen.');
    const check = offen && typed ? await checkPubToken(tk) : ''; if (check) return err(check);
    if (offen && typed && d.querySelector('#tkAlle').checked) S.gh = { token: typed };
    if (offen && typed) { try { localStorage.setItem(TOKEN_KEY, typed); } catch { /* egal */ } }
    if (!changes().length) { d.close(); return toast('Keine Änderungen zu veröffentlichen.'); }
    const go = d.querySelector('#pbGo'), force = go.dataset.force === '1'; go.disabled = true; go.textContent = 'Veröffentliche …';
    try { await publish(tk, force); d.close(); toast('Veröffentlicht ✓ – gespeichert und bestätigt.'); }
    catch (x) { err(x.message || String(x)); go.disabled = false; if (x.stale) { go.dataset.force = '1'; go.textContent = 'Trotzdem überschreiben'; } else go.textContent = 'Jetzt veröffentlichen'; }
  };
  d.showModal();
}

async function publish(tk, force = false) {
  syncThreads(S.threads, S.objekte);
  const built = await buildPackage({ stand: new Date().toLocaleDateString('de-DE'), objekte: S.objekte, team: S.team, threads: S.threads, sb: S.sb, gh: S.gh });
  built.pkg.pub = Math.max(Date.now(), verOf(ctx.pkg) + 1);
  const v = built.pkg.pub;
  const api = (path, o = {}, ms = 60000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return fetch(`https://api.github.com/repos/${REPO}/${path}`, { cache: 'no-store', ...o, signal: c.signal, headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json', ...o.headers } }).finally(() => clearTimeout(t)); };
  const rechte = (r) => { if (r.status === 401) throw new Error(TK_UNGUELTIG); if (r.status === 403) throw new Error(TK_OHNE_RECHT); };
  const stand = async () => {
    const m = await api(`contents/${FILE}?ref=main`);
    if (m.status === 404) return { sha: undefined, pkg: null };
    rechte(m); if (!m.ok) throw new Error('GitHub meldet Fehler ' + m.status + ' – bitte gleich noch einmal versuchen.');
    const { sha } = await m.json(), b = await api(`git/blobs/${sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    rechte(b); if (!b.ok) throw new Error('GitHub meldet Fehler ' + b.status + ' – bitte gleich noch einmal versuchen.');
    let pkg = null; try { pkg = await b.json(); } catch { /* unlesbar */ }
    return { sha, pkg };
  };
  const fremd = (cur) => !force && cur.pkg?.admin && canon(cur.pkg.admin) !== S.base;
  const konflikt = () => { const x = new Error('Seit dem Öffnen wurde von anderer Stelle veröffentlicht. Wenn Sie jetzt veröffentlichen, gehen diese Änderungen verloren. Besser: Seite neu laden und die Änderungen erneut vornehmen – oder bewusst überschreiben.'); x.stale = true; return x; };
  let cur = await stand();
  if (fremd(cur)) throw konflikt();
  const content = toB64(new TextEncoder().encode(JSON.stringify(built.pkg)));
  let ok = false;
  for (let i = 0; i < 4 && !ok; i++) {
    let r = null;
    try { r = await api(`contents/${FILE}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Vermietung aktualisiert', content, branch: 'main', ...(cur.sha ? { sha: cur.sha } : {}) }) }, 120000); } catch { /* unten nachsehen */ }
    if (r?.ok) { ok = true; break; }
    if (r) { rechte(r); if (r.status === 404) throw new Error(TK_OHNE_RECHT); if (r.status === 413) throw new Error('Die Daten sind zu groß – bitte kleinere Titelbilder verwenden.'); }
    await warte(1000 * (i + 1));
    cur = await stand();
    if (verOf(cur.pkg) === v) { ok = true; break; }
    if (fremd(cur)) throw konflikt();
  }
  if (!ok) throw new Error('GitHub hat die Veröffentlichung gerade nicht angenommen. Nichts ist verloren – bitte in einer Minute noch einmal „Jetzt veröffentlichen“.');
  const fin = await stand();
  if (verOf(fin.pkg) < v) throw new Error('Die Veröffentlichung konnte nicht bestätigt werden. Nichts ist verloren – bitte noch einmal „Jetzt veröffentlichen“.');
  merke(v);
  try { localStorage.setItem(TOKEN_KEY, tk); } catch { /* egal */ }
  const me = S.team.find((m) => m.id === ctx.sess.id);
  ctx.pkg = built.pkg;
  if (!me) { location.href = location.pathname; return; }
  const payload = await openSlot(me.code, built.pkg.slots.find((x) => x.id === ctx.sess.id), built.pkg.iter);
  relogin({ ...payload, code: me.code, id: ctx.sess.id }, await openObjekte(payload, built.pkg));
  S.base = canon(built.pkg.admin); S.ver = v; B = snapshot();
  await load(true);
  liveVerfolgen(v);
}
async function liveVerfolgen(v) {
  Object.assign(LIVE, { v, seit: Date.now(), stand: 'warte' });
  const zeigen = () => { const h = document.getElementById('pubHint'); if (h && !changes().length) h.innerHTML = liveHint(); };
  zeigen();
  while (LIVE.v === v && Date.now() - LIVE.seit < 15 * 60000) {
    await warte(8000);
    if (LIVE.v !== v) return;
    let p = null; try { p = await vonSeite(); } catch { /* später erneut */ }
    if (verOf(p) >= v) { LIVE.stand = 'live'; zeigen(); return toast('✓ Live – für alle sichtbar.'); }
    if (LIVE.stand === 'warte' && Date.now() - LIVE.seit > 6 * 60000) { LIVE.stand = 'langsam'; zeigen(); }
  }
}
