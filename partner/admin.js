// Verwaltung (nur Master): Partner, Master und Objekte pflegen und verschlüsselt veröffentlichen.
import { buildPackage, openJson, randomCode, randomId, toB64 } from './crypto.js';
import { esc, eur } from './app.js';

const REPO = 'paul8812/keuerleber-real-estate';
const FILE = 'partner/data.enc.json';
const TOKEN_KEY = 'nf-partner-gh';
const STEPS = ['Ankauf', 'Rückbau', 'Sanierung', 'Abnahme', 'Vermietung'];

let S = null; // Arbeitsstand (bleibt erhalten, solange der Tab offen ist)
let msg = null;

const clone = (x) => JSON.parse(JSON.stringify(x));
const token = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const linkFor = (p) => `${location.origin}${location.pathname}#${p.id}.${p.code}`;

export async function mount({ app, ctx, render, logout, header }) {
  if (!S) {
    const a = await openJson(ctx.sess.a, ctx.pkg.admin);
    S = { partners: a.partners, masters: a.masters, data: clone(ctx.data), dirty: false };
  }
  const draw = () => {
    app.innerHTML = `${header().replace('<button class="btn dark sm" id="toAdmin">Verwaltung</button>', '<button class="btn ghost sm" id="back">Zur Übersicht</button>').replace('<button class="btn ghost sm" id="print">Drucken / PDF</button>', '')}
    <main class="wrap adm">
      <h1>Verwaltung</h1>
      ${msg ? `<p class="msg ${msg.ok ? 'ok' : 'err'}" role="status">${esc(msg.text)}</p>` : ''}
      ${partnerPanel()}${masterPanel()}${objektPanel()}${hilfePanel()}
    </main>
    <div class="admin-bar"><div class="wrap">
      <span class="hint">${S.dirty ? '● Ungespeicherte Änderungen – erst nach „Veröffentlichen“ sehen die Partner sie.' : 'Alles veröffentlicht.'}</span>
      <div class="acts">
        <input type="password" id="gh" placeholder="GitHub-Token (einmalig)" value="${esc(token())}" autocomplete="off" aria-label="GitHub-Token">
        <button class="btn ghost sm" id="download">Datei sichern</button>
        <button class="btn fill sm" id="publish" ${S.dirty ? '' : 'disabled'}>Veröffentlichen</button>
      </div></div></div>
    <dialog class="sheet" id="sheet"></dialog>`;
    wire();
  };
  const markDirty = () => { S.dirty = true; msg = null; draw(); };

  function partnerPanel() {
    return `<section class="panel"><h2>Vertriebspartner &amp; Einladungslinks</h2>
      <p class="hint">Jeder Partner bekommt einen eigenen Link. „Entfernen“ sperrt ihn nach dem Veröffentlichen.</p>
      <form class="inline" id="addPartner"><input name="name" placeholder="Name des Partners / der Firma" required maxlength="80"><button class="btn fill sm">Partner anlegen</button></form>
      ${S.partners.length ? '' : '<p class="empty">Noch keine Partner angelegt.</p>'}
      <ul class="rows">${S.partners.map((p) => `<li><div><b>${esc(p.name)}</b><span class="codebox">${esc(linkFor(p))}</span></div>
        <div class="acts"><button class="btn ghost sm" data-copy="${esc(p.id)}">Link kopieren</button>
        <button class="btn ghost sm" data-newcode="${esc(p.id)}" title="Alter Link wird ungültig">Neuer Link</button>
        <button class="btn ghost sm danger" data-delpartner="${esc(p.id)}">Entfernen</button></div></li>`).join('')}</ul></section>`;
  }

  function masterPanel() {
    return `<section class="panel"><h2>Master-Zugänge</h2>
      <p class="hint">Master dürfen alles verwalten. Anmeldung mit dem Passwort (mind. 12 Zeichen).</p>
      <ul class="rows">${S.masters.map((m) => `<li><div><b>${esc(m.name)}</b></div>
        <div class="acts"><button class="btn ghost sm" data-pw="${esc(m.id)}">Passwort ändern</button>
        ${S.masters.length > 1 && m.id !== ctx.sess.id ? `<button class="btn ghost sm danger" data-delmaster="${esc(m.id)}">Entfernen</button>` : ''}</div></li>`).join('')}</ul>
      <form class="inline" id="addMaster"><input name="name" placeholder="Name" required maxlength="60"><input name="code" type="password" placeholder="Passwort (mind. 12 Zeichen)" required minlength="12" maxlength="100"><button class="btn ghost sm">Master hinzufügen</button></form></section>`;
  }

  function objektPanel() {
    const l = S.data.objekte;
    return `<section class="panel"><div class="ph"><h2>Objekte</h2><button class="btn fill sm" data-edit="neu">+ Objekt hinzufügen</button></div>
      ${l.length ? '' : '<p class="empty">Noch keine Objekte.</p>'}
      <ul class="rows">${l.map((o, i) => `<li><div class="obj"><img src="${esc(o.bild)}" alt=""><div><b>${esc(o.strasse)} · ${esc(o.lage)}</b><small>${esc(o.status.label)} · ${eur(o.preis)}</small></div></div>
        <div class="acts"><button class="btn ghost sm" data-up="${esc(o.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
        <button class="btn ghost sm" data-down="${esc(o.id)}" ${i === l.length - 1 ? 'disabled' : ''} aria-label="Nach unten">↓</button>
        <button class="btn dark sm" data-edit="${esc(o.id)}">Bearbeiten</button>
        <button class="btn ghost sm danger" data-del="${esc(o.id)}">Löschen</button></div></li>`).join('')}</ul></section>`;
  }

  function hilfePanel() {
    return `<section class="panel"><h2>Veröffentlichen – einmalige Einrichtung</h2>
      <p class="hint">Änderungen sehen die Partner erst nach „Veröffentlichen“. Dafür braucht diese Seite einmalig einen GitHub-Token (wird nur in diesem Browser gespeichert):</p>
      <ol class="hint" style="padding-left:20px;display:grid;gap:4px">
        <li>github.com → Einstellungen → Developer settings → Fine-grained tokens → „Generate new token“.</li>
        <li>Repository: nur <b>keuerleber-real-estate</b>. Berechtigung <b>Contents: Read and write</b>.</li>
        <li>Token unten links in das Feld „GitHub-Token“ einfügen und „Veröffentlichen“ klicken.</li></ol>
      <p class="hint">Hinweis: Die Daten liegen verschlüsselt im Repository. Ohne gültigen Code sind sie nicht lesbar – darum Codes und Passwörter nie weitergeben.</p></section>`;
  }

  function wire() {
    const $ = (s) => document.querySelector(s);
    $('#back').onclick = () => { document.body.onclick = null; render(); };
    $('#logout').onclick = () => { document.body.onclick = null; S = null; logout(); };
    $('#addPartner').onsubmit = (e) => {
      e.preventDefault();
      S.partners.push({ id: randomId(), name: new FormData(e.target).get('name').trim(), code: randomCode(24) });
      markDirty();
    };
    $('#addMaster').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      S.masters.push({ id: 'm' + randomId().slice(0, 4), name: f.get('name').trim(), code: String(f.get('code')) });
      markDirty();
    };
    document.body.onclick = async (e) => {
      const b = e.target.closest('button[data-copy],button[data-newcode],button[data-delpartner],button[data-pw],button[data-delmaster],button[data-edit],button[data-up],button[data-down],button[data-del]');
      if (!b) return;
      const d = b.dataset;
      if (d.copy) {
        await navigator.clipboard.writeText(linkFor(S.partners.find((p) => p.id === d.copy)));
        b.textContent = 'Kopiert ✓'; setTimeout(() => (b.textContent = 'Link kopieren'), 1800);
      } else if (d.newcode) { S.partners.find((p) => p.id === d.newcode).code = randomCode(24); markDirty(); }
      else if (d.delpartner) { if (confirm('Partner wirklich entfernen? Der Zugang ist nach dem Veröffentlichen gesperrt.')) { S.partners = S.partners.filter((p) => p.id !== d.delpartner); markDirty(); } }
      else if (d.pw) { const n = prompt('Neues Passwort (mind. 12 Zeichen):'); if (n && n.length >= 12) { S.masters.find((m) => m.id === d.pw).code = n; markDirty(); } else if (n) alert('Zu kurz – mindestens 12 Zeichen.'); }
      else if (d.delmaster) { if (confirm('Master-Zugang entfernen?')) { S.masters = S.masters.filter((m) => m.id !== d.delmaster); markDirty(); } }
      else if (d.edit) openEditor(d.edit);
      else if (d.up || d.down) {
        const id = d.up || d.down, l = S.data.objekte, i = l.findIndex((o) => o.id === id), j = i + (d.up ? -1 : 1);
        if (j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; markDirty(); }
      } else if (d.del) { if (confirm('Objekt wirklich löschen?')) { S.data.objekte = S.data.objekte.filter((o) => o.id !== d.del); markDirty(); } }
    };
    $('#download').onclick = async () => {
      const { pkg } = await buildNext();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(pkg)], { type: 'application/json' }));
      a.download = 'data.enc.json'; a.click();
    };
    $('#publish').onclick = publish;
  }

  async function buildNext() {
    const data = { stand: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }), objekte: S.data.objekte };
    return buildPackage({ data, partners: S.partners, masters: S.masters });
  }

  async function publish() {
    const tk = document.getElementById('gh').value.trim();
    if (!tk) { msg = { ok: false, text: 'Bitte zuerst den GitHub-Token eintragen (siehe Hinweis unten auf der Seite).' }; return draw(); }
    const btn = document.getElementById('publish');
    btn.disabled = true; btn.textContent = 'Veröffentliche …';
    try {
      const built = await buildNext();
      const h = { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' };
      const meta = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}?ref=main`, { headers: h });
      if (meta.status === 401 || meta.status === 403) throw new Error('GitHub-Token ungültig oder ohne Schreibrecht.');
      const sha = meta.ok ? (await meta.json()).sha : undefined;
      const body = { message: 'Partnerbereich aktualisiert', content: toB64(new TextEncoder().encode(JSON.stringify(built.pkg))), branch: 'main', ...(sha ? { sha } : {}) };
      const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(r.status === 409 ? 'Zwischenzeitlich wurde etwas anderes veröffentlicht – bitte Seite neu laden.' : 'GitHub meldet Fehler ' + r.status);
      try { localStorage.setItem(TOKEN_KEY, tk); } catch { /* egal */ }
      // eigene Sitzung auf die neuen Schlüssel umstellen
      ctx.pkg = built.pkg; ctx.sess = { ...ctx.sess, k: built.k, a: built.a };
      ctx.data = { stand: undefined, objekte: clone(S.data.objekte) };
      ctx.data = await openJson(built.k, built.pkg.data);
      try { sessionStorage.setItem('nf-partner-session', JSON.stringify(ctx.sess)); } catch { /* egal */ }
      S.dirty = false;
      msg = { ok: true, text: 'Veröffentlicht. Die Partner sehen die Änderungen in ca. 1–2 Minuten.' };
    } catch (e) {
      msg = { ok: false, text: e.message || String(e) };
    }
    draw();
  }

  /* ---------- Objekt bearbeiten ---------- */
  function openEditor(id) {
    const isNew = id === 'neu';
    const o = isNew
      ? { id: '', bild: '', strasse: '', lage: '', status: { label: '', tone: 'prep' }, baujahr: 1970, energie: '', hausgeld: 0, ort: '95030 Hof — ', tags: [], zimmer: 2, flaeche: 0, miete: 0, mieteTyp: 'SOLL', preis: 0, preisHinweis: 'provisionsfrei für Käufer', fortschritt: 0, sanierung: '', hinweis: '', schritte: STEPS.map((label, i) => ({ label, state: i === 0 ? 'current' : 'todo' })) }
      : clone(S.data.objekte.find((x) => x.id === id));
    const f = (n, l, v, t = 'text', wide = false, extra = '') => `<label class="f${wide ? ' wide' : ''}"><span>${l}</span><input name="${n}" type="${t}" value="${esc(v)}" ${t === 'number' ? 'step="any"' : ''} ${extra}></label>`;
    const sheet = document.getElementById('sheet');
    sheet.innerHTML = `<form class="panel form" id="objForm">
      <h2>${isNew ? 'Objekt hinzufügen' : esc(o.strasse + ' · ' + o.lage)}</h2>
      <div class="grid">${f('strasse', 'Straße & Hausnummer', o.strasse, 'text', false, 'required')}${f('lage', 'Lage im Haus (z. B. 3. OG links)', o.lage)}
        ${f('ort', 'Lagebeschreibung', o.ort, 'text', true)}${f('tags', 'Ausstattung (mit Komma trennen)', o.tags.join(', '), 'text', true)}
        ${f('baujahr', 'Baujahr', o.baujahr, 'number')}${f('energie', 'Energieklasse', o.energie)}${f('hausgeld', 'Hausgeld (€/Mon.)', o.hausgeld, 'number')}${f('zimmer', 'Zimmer', o.zimmer, 'number')}${f('flaeche', 'Wohnfläche (m²)', o.flaeche, 'number', false, 'required')}</div>
      <h2>Zahlen</h2><div class="grid">${f('miete', 'Kaltmiete (€/Mon.)', o.miete, 'number')}
        <label class="f"><span>Miet-Art</span><select name="mieteTyp">${[['IST', 'IST – laut Mietvertrag'], ['SOLL', 'SOLL – kalkulierte Marktmiete'], ['PLAN', 'PLAN – Planwert vor Sanierung']].map(([v, l]) => `<option value="${v}"${o.mieteTyp === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        ${f('zl', 'Zuschlag (z. B. Garage, Stellplatz)', o.zuschlag?.label ?? '')}${f('zb', 'Zuschlag (€/Mon.)', o.zuschlag?.betrag ?? '', 'number')}
        ${f('preis', 'Abgabepreis (€)', o.preis, 'number', false, 'required')}${f('preisHinweis', 'Hinweis zum Preis', o.preisHinweis)}</div>
      <p class="hint">Preis pro m², Rendite und Faktor werden automatisch berechnet.</p>
      <h2>Sanierung &amp; Status</h2><div class="grid">${f('fortschritt', 'Sanierungsstand (0–100 %)', o.fortschritt, 'number')}${f('statusLabel', 'Statusbezeichnung am Foto (leer = automatisch)', o.status.label)}
        <label class="f wide"><span>Beschreibung der Sanierung</span><textarea name="sanierung" rows="3">${esc(o.sanierung)}</textarea></label>${f('hinweis', 'Hinweis fett (z. B. Unvermietet · Erstvermietung möglich)', o.hinweis, 'text', true)}</div>
      <h3 class="sub-h">Zeitplan</h3><div class="steps-ed">${o.schritte.map((s, i) => `<div><b>${esc(s.label)}</b><select name="ss${i}">${[['done', 'erledigt'], ['current', 'aktuell'], ['todo', 'offen']].map(([v, l]) => `<option value="${v}"${s.state === v ? ' selected' : ''}>${l}</option>`).join('')}</select><input name="sd${i}" placeholder="Datum, z. B. 07/2026" value="${esc(s.datum ?? '')}"></div>`).join('')}</div>
      <h2>Foto</h2><label class="f wide"><span>${o.bild ? 'Neues Foto hochladen (ersetzt das aktuelle)' : 'Foto hochladen'} · JPG, PNG oder WebP</span><input type="file" name="foto" accept="image/jpeg,image/png,image/webp"></label>
      ${o.bild ? `<img src="${esc(o.bild)}" alt="" class="prev" id="prev">` : '<img alt="" class="prev hidden" id="prev">'}
      <p class="lg-err hidden" id="formErr" role="alert"></p>
      <div class="acts"><button class="btn fill">Übernehmen</button><button type="button" class="btn ghost" id="cancel">Abbrechen</button></div></form>`;
    sheet.showModal();
    let photo = o.bild;
    sheet.querySelector('#cancel').onclick = () => sheet.close();
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
      if (!oid) { oid = (strasse + '-' + lage).toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'objekt-' + Date.now(); while (S.data.objekte.some((x) => x.id === oid)) oid += '-2'; }
      const zl = g('zl'), zb = n('zb');
      const neu = {
        id: oid, bild: photo, strasse, lage,
        status: { label: g('statusLabel') || (tone === 'done' ? 'Saniert' : tone === 'prep' ? 'In Vorbereitung' : `In Sanierung · ${fort} %`), tone },
        baujahr: Math.round(n('baujahr')), energie: g('energie'), hausgeld: n('hausgeld'), ort: g('ort'),
        tags: g('tags').split(',').map((t) => t.trim()).filter(Boolean), zimmer: n('zimmer'), flaeche: n('flaeche') || 1,
        miete: n('miete'), mieteTyp: ['IST', 'SOLL', 'PLAN'].includes(g('mieteTyp')) ? g('mieteTyp') : 'SOLL', ...(zl && zb ? { zuschlag: { label: zl, betrag: zb } } : {}),
        preis: n('preis') || 1, preisHinweis: g('preisHinweis') || 'provisionsfrei für Käufer', fortschritt: fort, sanierung: g('sanierung'), hinweis: g('hinweis'),
        schritte: STEPS.map((label, i) => ({ label, state: ['done', 'current', 'todo'].includes(g('ss' + i)) ? g('ss' + i) : 'todo', datum: g('sd' + i) || undefined })),
      };
      const i = S.data.objekte.findIndex((x) => x.id === o.id);
      if (i >= 0) S.data.objekte[i] = neu; else S.data.objekte.push(neu);
      sheet.close();
      markDirty();
    };
  }

  draw();
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
