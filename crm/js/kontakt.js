// „Kontakt gehabt“: Gespräche, Treffen, WhatsApp & Co. in Sekunden festhalten – auch für mehrere Personen auf einmal –
// und überall sichtbar machen, wann du zuletzt mit wem gesprochen hast (Frische-Anzeige, Zeitleiste, Übersicht).
// Gespeichert wird als normaler Verlaufseintrag (activities: art, text, datum, contactId) – keine neuen Tabellen.
import * as db from './db.js';
import { html, raw, esc, modal, toast, today, addDays, daysBetween, fmtDate, fullName, confirmDlg, iso } from './util.js';
const contactOpts = () => db.all('contacts').slice().sort((a, b) => fullName(a).localeCompare(fullName(b), 'de')).map(c => [c.id, fullName(c) + (c.firma && c.nachname ? ' · ' + c.firma : '')]);

// Kontaktwege (Schlüssel = Aktivitätsart, bleibt kompatibel mit Verlauf, Automationen und Mail-Abgleich)
export const WEGE = [['anruf', 'Anruf', '📞'], ['meeting', 'Treffen', '🤝'], ['whatsapp', 'WhatsApp', '💬'], ['email', 'E-Mail', '✉️'], ['besichtigung', 'Besichtigung', '🏠'], ['notiz', 'Notiz', '📝']];
const weg = art => WEGE.find(w => w[0] === art) || ['notiz', art || 'Eintrag', '📝'];
export const wegLabel = art => weg(art)[1];
export const wegIcon = art => weg(art)[2];
const FM = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }), FT = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }), FZ = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }), FD = new Intl.DateTimeFormat('de-DE');
const AUFGABE_NACHFASSEN = /^(⚡ )?(Nachfassen|Erneut anrufen|Anrufen|Rückruf|Wiedervorlage|Kontakt aufnehmen)\b/i;

// ---------------------------------------------------------------- Index: letzter Kontakt je Person
// Einmal pro Datenstand berechnet statt bei jeder Zeile alle Einträge zu durchsuchen (1000+ Einträge × 400 Kontakte).
let ver = 0, idx = null, idxVer = -1, idxRef = null, idxLen = -1;
db.onChange(() => { ver++; });
export function kontaktIndex() {
  const A = db.all('activities');
  if (idx && idxVer === ver && idxRef === A && idxLen === A.length) return idx;
  idx = new Map();
  for (const a of A) {
    if (!a.contactId || a.art === 'system' || !a.datum) continue;
    const x = idx.get(a.contactId);
    if (!x) idx.set(a.contactId, { last: a.datum, art: a.art, n: 1 });
    else { x.n++; if (a.datum > x.last) { x.last = a.datum; x.art = a.art; } }
  }
  idxVer = ver; idxRef = A; idxLen = A.length;
  return idx;
}
/** ISO-Zeitpunkt des letzten Kontakts (ohne automatische Einträge) – '' wenn nie */
export const letzterKontakt = id => kontaktIndex().get(id)?.last || '';
const lokalTag = ts => ts ? (ts.length > 10 ? iso(new Date(ts)) : ts) : '';

/** „heute“, „gestern“, „vor 5 Tagen“, „vor 3 Wochen“, „vor 4 Monaten“ */
export function vorWann(ts) {
  if (!ts) return 'noch nie';
  const t = daysBetween(lokalTag(ts), today());
  if (t <= 0) return 'heute'; if (t === 1) return 'gestern'; if (t < 14) return `vor ${t} Tagen`;
  if (t < 60) return `vor ${Math.round(t / 7)} Wochen`; if (t < 365) return `vor ${Math.round(t / 30.4)} Monaten`;
  const j = Math.floor(t / 365); return j === 1 ? 'vor über einem Jahr' : `vor über ${j} Jahren`;
}
export const grenzen = () => { const s = db.settings(); return { frisch: Number(s.kontaktFrisch) || 14, nachfassen: Number(s.nachfassTage) || 60 }; };

/** Frische eines Kontakts: k = frisch | bald | ueber | nie | ruhig (archiviert/ruhend) */
export function frische(c) {
  const x = kontaktIndex().get(c.id), t0 = today(), g = grenzen();
  const tage = x ? daysBetween(lokalTag(x.last), t0) : null;
  const wv = c.followup && c.followup <= t0 && c.status !== 'Archiv';
  const base = { tage, last: x?.last || '', art: x?.art || '', n: x?.n || 0, wv };
  if (wv) return { ...base, k: 'ueber', l: `Wiedervorlage ${c.followup === t0 ? 'heute' : 'seit ' + fmtDate(c.followup)}` };
  if (c.status && c.status !== 'Aktiv') return { ...base, k: 'ruhig', l: x ? vorWann(x.last) : 'kein Kontakt' };
  if (!x) return { ...base, k: 'nie', l: 'noch kein Kontakt' };
  if (tage <= g.frisch) return { ...base, k: 'frisch', l: 'frisch' };
  if (tage <= g.nachfassen) return { ...base, k: 'bald', l: 'bald nachfassen' };
  return { ...base, k: 'ueber', l: 'Nachfassen überfällig' };
}
export const FRISCHE = [['frisch', 'Frisch'], ['bald', 'Bald nachfassen'], ['ueber', 'Nachfassen fällig'], ['nie', 'Noch kein Kontakt']];

/** kleine Anzeige „● vor 3 Tagen“ für Listen */
export function frischeTag(c, { kurz = false } = {}) {
  const f = frische(c);
  const txt = f.last ? vorWann(f.last) : 'noch nie';
  const tip = `${f.l}${f.last ? ` · letzter Kontakt ${fmtDate(lokalTag(f.last))} (${wegLabel(f.art)})` : ''}`;
  return html`<span class="frische f-${f.k}" title="${tip}"><i aria-hidden="true"></i>${kurz && f.wv ? '⏰ ' : ''}${txt}<span class="sr">, ${f.l}</span></span>`;
}

// ---------------------------------------------------------------- Speichern
const zeitpunkt = (tag, zeit) => {
  if (!zeit && tag === today()) return new Date().toISOString();
  return new Date(`${tag}T${zeit || '12:00'}:00`).toISOString();
};
/** Was beim Erfassen nebenbei erledigt wird: fällige Wiedervorlage + offene Nachfass-Aufgaben */
function mitErledigt(ids) {
  const t0 = today(), wv = [], tasks = [];
  for (const id of ids) {
    const c = db.get('contacts', id); if (!c) continue;
    if (c.followup && c.followup <= t0) wv.push(c);
    for (const t of db.all('tasks')) if (!t.done && t.contactId === id && t.faellig && t.faellig <= t0 && AUFGABE_NACHFASSEN.test(t.titel || '')) tasks.push(t);
  }
  return { wv, tasks };
}
export async function kontaktSpeichern({ ids, art, tag, zeit = '', text = '', naechst = '', naechstTitel = '', erledigen = true }) {
  const datum = zeitpunkt(tag || today(), zeit);
  const { wv, tasks } = erledigen ? mitErledigt(ids) : { wv: [], tasks: [] };
  const out = [];
  for (const id of ids) {
    const c = db.get('contacts', id); if (!c) continue;
    out.push(await db.save('activities', { art, text: text.trim(), datum, contactId: id }));
    const neu = { ...c }; let geaendert = false;
    if (wv.some(x => x.id === c.id)) { neu.followup = ''; geaendert = true; }
    if (naechst) {
      neu.followup = naechst; geaendert = true;
      await db.save('tasks', { titel: `${(naechstTitel || 'Nachfassen').trim()}: ${fullName(c)}`, faellig: naechst, prio: 'normal', contactId: id, done: false });
    }
    if (geaendert) await db.save('contacts', neu);
  }
  for (const t of tasks) await db.save('tasks', { ...t, done: true, doneAt: new Date().toISOString() });
  return out;
}

// ---------------------------------------------------------------- Dialog „Kontakt gehabt“
const chipsHtml = (items, aktiv, attr) => items.map(([v, l, ic]) => html`<button type="button" class="kchip ${v === aktiv ? 'on' : ''}" data-${raw(attr)}="${v}" aria-pressed="${v === aktiv ? 'true' : 'false'}">${ic ? html`<span aria-hidden="true">${ic}</span> ` : ''}${l}</button>`);
const NAECHST = [['', 'Keiner'], ['3', 'in 3 Tagen'], ['7', '1 Woche'], ['14', '2 Wochen'], ['30', '1 Monat'], ['datum', 'Datum …']];
const TAGE = () => [[today(), 'Heute'], [addDays(today(), -1), 'Gestern'], [addDays(today(), -2), 'Vorgestern']];

function vorschlaege(q, ausser) {
  const s = q.trim().toLowerCase(), ix = kontaktIndex();
  const C = db.all('contacts').filter(c => !ausser.has(c.id) && c.status !== 'Archiv');
  if (!s) {
    // ohne Eingabe: fällige Wiedervorlagen, dann zuletzt kontaktierte
    const t0 = today();
    return C.map(c => ({ c, w: c.followup && c.followup <= t0 ? 'z' + c.followup : ix.get(c.id)?.last || '' })).filter(x => x.w).sort((a, b) => b.w.localeCompare(a.w)).slice(0, 6).map(x => x.c);
  }
  const teile = s.split(/\s+/);
  return C.filter(c => { const h = [fullName(c), c.firma, c.ort, c.email, c.mobil, c.tel].join(' ').toLowerCase(); return teile.every(t => h.includes(t)); })
    .sort((a, b) => (ix.get(b.id)?.last || '').localeCompare(ix.get(a.id)?.last || '')).slice(0, 8);
}

/**
 * Schnellerfassung. contactIds: vorausgewählte Personen (leer = suchen), art: vorgewählter Weg.
 */
export function kontaktErfassen({ contactIds = [], art = 'anruf', text = '' } = {}) {
  const st = { ids: [...new Set(contactIds.filter(id => db.get('contacts', id)))], art, tag: today(), naechst: '', naechstDatum: addDays(today(), 7) };
  const { el } = modal(st.ids.length > 1 ? `Kontakt mit ${st.ids.length} Personen` : 'Kontakt gehabt', html`
    <div class="full kerf">
      <div class="kfeld"><span class="klabel" id="kl-wer">Mit wem?</span>
        <div class="kwer" role="group" aria-labelledby="kl-wer"><div class="kpersonen" data-personen></div>
          <div class="ksuche"><input type="search" data-suche autocomplete="off" enterkeyhint="done" placeholder="${st.ids.length ? 'Weitere Person hinzufügen …' : 'Name, Firma oder Ort eingeben …'}" aria-label="Person suchen und hinzufügen" aria-controls="kvorschlag"></div></div>
          <div class="kvorschlag" id="kvorschlag" role="listbox" aria-label="Vorschläge" data-vorschlag></div></div>
      <div class="kfeld"><span class="klabel" id="kl-wie">Wie?</span><div class="kchips" role="group" aria-labelledby="kl-wie" data-wege>${chipsHtml(WEGE, st.art, 'weg')}</div></div>
      <div class="kfeld"><span class="klabel" id="kl-wann">Wann?</span><div class="kchips" role="group" aria-labelledby="kl-wann" data-tage>${chipsHtml(TAGE(), st.tag, 'tag')}<input type="date" class="kdatum" data-datum value="${st.tag}" max="${today()}" aria-label="Anderes Datum"></div></div>
      <label class="kfeld"><span class="klabel">Worum ging's? <small>(optional)</small></span><textarea name="text" rows="2" placeholder="z. B. Interesse an ETW Hof, schickt Unterlagen bis Freitag">${text}</textarea></label>
      <div class="kfeld"><span class="klabel" id="kl-next">Nächster Schritt</span><div class="kchips" role="group" aria-labelledby="kl-next" data-naechst>${chipsHtml(NAECHST, '', 'n')}</div>
        <div class="knext" data-nextbox hidden><input type="date" data-ndatum value="${st.naechstDatum}" min="${today()}" aria-label="Datum für den nächsten Schritt"><input type="text" data-ntitel value="Nachfassen" aria-label="Was ist zu tun?" placeholder="Was ist zu tun?"></div>
        <p class="kinfo muted small" data-nextinfo hidden></p></div>
      <label class="kerledigt" data-erledigtbox hidden><input type="checkbox" data-erledigt checked><span data-erledigttxt></span></label>
    </div>`, {
    saveLabel: 'Speichern',
    onSave: async v => {
      if (!st.ids.length) { toast('Bitte mindestens eine Person auswählen', 'err'); el.querySelector('[data-suche]').focus(); return false; }
      const naechst = st.naechst === 'datum' ? el.querySelector('[data-ndatum]').value : st.naechst ? addDays(today(), Number(st.naechst)) : '';
      const n = st.ids.length, namen = st.ids.map(id => fullName(db.get('contacts', id)));
      await kontaktSpeichern({ ids: st.ids, art: st.art, tag: st.tag, text: v.text || '', naechst, naechstTitel: el.querySelector('[data-ntitel]').value, erledigen: el.querySelector('[data-erledigt]').checked });
      toast(`✓ ${wegLabel(st.art)} mit ${n > 2 ? n + ' Personen' : namen.join(' und ')} festgehalten${naechst ? ` · nächster Schritt ${fmtDate(naechst)}` : ''}`);
    },
  });
  el.querySelector('.modal').classList.add('kmodal');
  const box = el.querySelector('[data-personen]'), suche = el.querySelector('[data-suche]'), vor = el.querySelector('[data-vorschlag]');
  let auswahl = 0, liste = [];
  const titel = () => { el.querySelector('header h3').textContent = st.ids.length > 1 ? `Kontakt mit ${st.ids.length} Personen` : 'Kontakt gehabt'; };
  const erledigtInfo = () => {
    const { wv, tasks } = mitErledigt(st.ids), b = el.querySelector('[data-erledigtbox]');
    const teile = [wv.length ? (wv.length === 1 ? `Wiedervorlage vom ${fmtDate(wv[0].followup)}` : `${wv.length} Wiedervorlagen`) : '', tasks.length ? `${tasks.length} Nachfass-Aufgabe${tasks.length > 1 ? 'n' : ''}` : ''].filter(Boolean);
    b.hidden = !teile.length; el.querySelector('[data-erledigttxt]').textContent = `Gleich als erledigt markieren: ${teile.join(' und ')}`;
  };
  const personen = () => {
    box.innerHTML = st.ids.map(id => { const c = db.get('contacts', id), f = frische(c); return html`<span class="kperson"><b>${fullName(c)}</b><small>${f.last ? 'zuletzt ' + vorWann(f.last) : 'erster Kontakt'}</small><button type="button" data-weg-id="${id}" aria-label="${fullName(c)} entfernen">×</button></span>`.s; }).join('');
    box.querySelectorAll('[data-weg-id]').forEach(b => b.onclick = () => { st.ids = st.ids.filter(x => x !== b.dataset.wegId); personen(); zeigeVorschlaege(); suche.focus(); });
    suche.placeholder = st.ids.length ? 'Weitere Person hinzufügen …' : 'Name, Firma oder Ort eingeben …';
    titel(); erledigtInfo();
  };
  const zeigeVorschlaege = () => {
    liste = vorschlaege(suche.value, new Set(st.ids)); auswahl = 0;
    const leer = !suche.value.trim();
    vor.classList.toggle('kpills', leer);
    if (leer && st.ids.length && document.activeElement !== suche) { vor.innerHTML = ''; return; }   // Person steht schon fest → Platz sparen
    // ohne Eingabe: kompakte Vorschläge (fällige Wiedervorlagen, zuletzt kontaktiert) – mit Eingabe: Trefferliste
    vor.innerHTML = leer ? (liste.length ? '<span class="khint">Vorschläge:</span>' + liste.slice(0, 5).map(c => { const f = frische(c); return html`<button type="button" class="kpill" data-add="${c.id}" title="${f.l}"><span class="frische f-${f.k}"><i aria-hidden="true"></i></span>${fullName(c)}</button>`.s; }).join('') : '')
      : liste.length ? liste.map((c, i) => { const f = frische(c); return html`<button type="button" role="option" class="kvor ${i === 0 ? 'akt' : ''}" data-add="${c.id}" aria-selected="${i === 0 ? 'true' : 'false'}"><span class="kvn">${fullName(c)}${c.firma && c.nachname ? html` <small>${c.firma}</small>` : ''}${c.ort ? html` <small>· ${c.ort}</small>` : ''}</span><span class="frische f-${f.k}"><i aria-hidden="true"></i>${f.last ? vorWann(f.last) : 'noch nie'}</span></button>`.s; }).join('')
      : `<p class="khint">Keine Person gefunden für „${esc(suche.value)}“</p>`;
    vor.querySelectorAll('[data-add]').forEach(b => b.onclick = () => add(b.dataset.add));
  };
  const add = id => { if (!st.ids.includes(id)) st.ids.push(id); suche.value = ''; personen(); zeigeVorschlaege(); if (matchMedia('(hover:hover)').matches) suche.focus(); };
  suche.addEventListener('input', zeigeVorschlaege);
  suche.addEventListener('focus', zeigeVorschlaege); suche.addEventListener('blur', () => setTimeout(zeigeVorschlaege, 150));
  vor.addEventListener('pointerdown', e => { if (e.target.closest('[data-add]')) e.preventDefault(); });
  suche.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); if (liste[auswahl] && suche.value.trim()) add(liste[auswahl].id); return; }
    if (e.key === 'Backspace' && !suche.value && st.ids.length) { st.ids.pop(); personen(); zeigeVorschlaege(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); auswahl = Math.max(0, Math.min(liste.length - 1, auswahl + (e.key === 'ArrowDown' ? 1 : -1))); vor.querySelectorAll('.kvor').forEach((b, i) => { b.classList.toggle('akt', i === auswahl); b.setAttribute('aria-selected', i === auswahl ? 'true' : 'false'); }); }
  });
  const waehle = (key, nach) => el.querySelectorAll(`[data-${key}]`).forEach(b => b.onclick = () => {
    el.querySelectorAll(`[data-${key}]`).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); nach(b.dataset[key]);
  });
  waehle('weg', v => { st.art = v; });
  const datum = el.querySelector('[data-datum]');
  waehle('tag', v => { st.tag = v; datum.value = v; });
  datum.addEventListener('change', () => { if (!datum.value) return; st.tag = datum.value > today() ? today() : datum.value; el.querySelectorAll('[data-tag]').forEach(x => { const on = x.dataset.tag === st.tag; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); }); });
  const nbox = el.querySelector('[data-nextbox]'), ninfo = el.querySelector('[data-nextinfo]');
  const nInfo = () => { const d = st.naechst === 'datum' ? el.querySelector('[data-ndatum]').value : st.naechst ? addDays(today(), Number(st.naechst)) : ''; ninfo.hidden = !d; ninfo.textContent = d ? `Legt ${st.ids.length > 1 ? 'je Person ' : ''}die Aufgabe „${el.querySelector('[data-ntitel]').value || 'Nachfassen'}“ für ${fmtDate(d)} an und setzt die Wiedervorlage.` : ''; };
  waehle('n', v => { st.naechst = v; nbox.hidden = !v; nbox.querySelector('[data-ndatum]').hidden = v !== 'datum'; nInfo(); });
  el.querySelectorAll('[data-ndatum],[data-ntitel]').forEach(i => i.addEventListener('input', nInfo));
  personen(); zeigeVorschlaege();
  if (!st.ids.length && matchMedia('(hover:hover)').matches) setTimeout(() => suche.focus(), 0);
  return el;
}

// ---------------------------------------------------------------- Eintrag bearbeiten / löschen
export function eintragBearbeiten(a, done) {
  if (!a) return;
  const st = { art: WEGE.some(w => w[0] === a.art) ? a.art : 'notiz' };
  const d = new Date(a.datum || Date.now()), tag = iso(d), zeit = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const { el } = modal('Eintrag bearbeiten', html`
    <div class="full kerf">
      <div class="kfeld"><span class="klabel" id="kl-wie2">Wie?</span><div class="kchips" role="group" aria-labelledby="kl-wie2">${chipsHtml(WEGE, st.art, 'weg')}</div></div>
    </div>
    <label class="f"><span>Datum</span><input type="date" name="tag" value="${tag}" required></label>
    <label class="f"><span>Uhrzeit</span><input type="time" name="zeit" value="${zeit}"></label>
    <label class="f full"><span>Kontakt</span><select name="contactId"><option value=""></option>${contactOpts().map(([v, t]) => html`<option value="${v}" ${v === a.contactId ? raw('selected') : ''}>${t}</option>`)}</select></label>
    <label class="f full"><span>Notiz</span><textarea name="text" rows="4">${a.text || ''}</textarea></label>`, {
    onSave: async v => {
      if (!v.tag) { toast('Bitte ein Datum angeben', 'err'); return false; }
      await db.save('activities', { ...a, art: st.art, text: v.text, contactId: v.contactId, datum: new Date(`${v.tag}T${v.zeit || '12:00'}:00`).toISOString() });
      toast('Eintrag gespeichert'); done && done();
    },
    danger: { label: 'Löschen', confirm: 'Diesen Eintrag aus dem Verlauf löschen?', fn: async () => { await db.del('activities', a.id); toast('Eintrag gelöscht'); done && done(); } },
  });
  el.querySelectorAll('[data-weg]').forEach(b => b.onclick = () => { st.art = b.dataset.weg; el.querySelectorAll('[data-weg]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); });
  return el;
}

// ---------------------------------------------------------------- Kontakt-Karte in der Detailansicht
const zeigeAlle = new Set();
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function rhythmus(acts) {
  const jetzt = new Date(), m = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(jetzt.getFullYear(), jetzt.getMonth() - i, 1); m.push({ k: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, l: MONATE[d.getMonth()], n: 0 }); }
  const byK = Object.fromEntries(m.map(x => [x.k, x]));
  for (const a of acts) { const k = iso(new Date(a.datum)).slice(0, 7); if (byK[k]) byK[k].n++; }
  const max = Math.max(1, ...m.map(x => x.n)), summe = m.reduce((s, x) => s + x.n, 0);
  return html`<div class="krhythmus" role="img" aria-label="${summe} Kontakte in den letzten 12 Monaten">${m.map(x => html`<span title="${x.l}: ${x.n} ${x.n === 1 ? 'Kontakt' : 'Kontakte'}"><i style="--h:${x.n ? Math.max(14, Math.round(x.n / max * 100)) : 0}%" class="${x.n ? '' : 'leer'}"></i><small>${x.l[0]}</small></span>`)}</div>`;
}
export function kontaktKarte(c) {
  const alle = db.all('activities').filter(a => a.contactId === c.id).sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  const echt = alle.filter(a => a.art !== 'system'), sys = alle.length - echt.length, f = frische(c);
  const offen = zeigeAlle.has(c.id), mitSys = zeigeAlle.has(c.id + ':sys');
  const sicht = (mitSys ? alle : echt), zeig = offen ? sicht : sicht.slice(0, 6);
  let monat = '';
  const zeilen = zeig.map(a => {
    const d = new Date(a.datum), mk = FM.format(d);
    const kopf = mk !== monat ? (monat = mk, html`<li class="kmonat" aria-hidden="true">${mk}</li>`) : '';
    const sysE = a.art === 'system';
    return html`${kopf}<li class="kev k-${sysE ? 'system' : weg(a.art)[0]}"><span class="kic" aria-hidden="true">${sysE ? '⚙️' : wegIcon(a.art)}</span>
      <button type="button" class="kbody" data-ke="${a.id}" aria-label="Eintrag vom ${FD.format(d)} bearbeiten"><span class="kmeta"><b>${sysE ? 'Automatisch' : wegLabel(a.art)}</b> · ${FT.format(d)}${d.getHours() !== 12 || d.getMinutes() ? ', ' + FZ.format(d) : ''} · <span class="muted">${vorWann(a.datum)}</span></span>${a.text ? html`<span class="ktxt">${(a.text || '').replace(/^⚡ /, '')}</span>` : ''}</button></li>`;
  });
  return html`<section class="card kkarte" data-kkarte="${c.id}">
    <div class="kkopf"><div><h2>Kontaktverlauf</h2>
      <p class="kstatus">${frischeTag(c)}${f.last ? html` <span class="muted">· ${wegLabel(f.art)} am ${fmtDate(iso(new Date(f.last)))} · ${f.n} ${f.n === 1 ? 'Kontakt' : 'Kontakte'} insgesamt</span>` : html` <span class="muted">· Halte den ersten Kontakt fest</span>`}${c.followup ? html` <span class="kwv ${c.followup <= today() ? 'late' : ''}">⏰ Wiedervorlage ${fmtDate(c.followup)}</span>` : ''}</p></div>
      ${echt.length ? rhythmus(echt) : ''}</div>
    <div class="kschnell" role="group" aria-label="Kontakt festhalten"><button type="button" class="btn primary" data-kg="${c.id}">＋ Kontakt gehabt</button>${WEGE.slice(0, 5).map(([k, l, ic]) => html`<button type="button" class="btn kweg" data-kg="${c.id}" data-kart="${k}" title="${l} festhalten" aria-label="${l} festhalten"><span aria-hidden="true">${ic}</span><span class="kwl">${l}</span></button>`)}</div>
    ${zeig.length ? html`<ul class="ktl">${zeilen}</ul>` : html`<p class="muted kleer">Noch kein Kontakt festgehalten. Ein Tipp auf „Anruf“ oder „Treffen“ genügt.</p>`}
    <div class="kmehr"><button type="button" class="mini" data-act>📝 Notiz mit Objektbezug</button>${sicht.length > 6 ? html`<button type="button" class="mini" data-kalle="${c.id}">${offen ? 'Weniger anzeigen' : `Alle ${sicht.length} Einträge anzeigen`}</button>` : ''}${sys ? html`<button type="button" class="mini" data-ksys="${c.id}">${mitSys ? 'Automatische ausblenden' : `${sys} automatische einblenden`}</button>` : ''}</div>
  </section>`;
}
export function bindKontaktKarte(el, neu) {
  el.querySelectorAll('[data-ke]').forEach(b => b.onclick = () => eintragBearbeiten(db.get('activities', b.dataset.ke)));
  el.querySelectorAll('[data-kalle]').forEach(b => b.onclick = () => { const id = b.dataset.kalle; zeigeAlle.has(id) ? zeigeAlle.delete(id) : zeigeAlle.add(id); neu(); });
  el.querySelectorAll('[data-ksys]').forEach(b => b.onclick = () => { const k = b.dataset.ksys + ':sys'; zeigeAlle.has(k) ? zeigeAlle.delete(k) : zeigeAlle.add(k); neu(); });
}

// Überall gleich: Knopf mit data-kg="<id>" (optional data-kart) öffnet die Schnellerfassung
export function initKontakt() {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-kg]'); if (!b || b.closest('.modal')) return;
    e.preventDefault(); e.stopPropagation();
    const gr = b.closest('#gresults'); if (gr) { gr.hidden = true; document.getElementById('gsearch').value = ''; }
    const ids = b.dataset.kg ? b.dataset.kg.split(',') : [];
    kontaktErfassen({ contactIds: ids, art: b.dataset.kart || 'anruf' });
  }, true);
}

// ---------------------------------------------------------------- Übersicht
export function heuteKarte() {
  const t0 = today(), ix = kontaktIndex();
  const heute = db.all('activities').filter(a => a.contactId && a.art !== 'system' && a.datum && lokalTag(a.datum) === t0 && db.get('contacts', a.contactId))
    .sort((a, b) => b.datum.localeCompare(a.datum));
  const proPerson = new Map(); for (const a of heute) { const x = proPerson.get(a.contactId) || []; x.push(a); proPerson.set(a.contactId, x); }
  let liste = [...proPerson.entries()].map(([id, acts]) => ({ c: db.get('contacts', id), acts }));
  const nurZuletzt = !liste.length;
  if (nurZuletzt) liste = [...ix.entries()].filter(([id]) => db.get('contacts', id)).sort((a, b) => b[1].last.localeCompare(a[1].last)).slice(0, 5).map(([id, x]) => ({ c: db.get('contacts', id), acts: [{ art: x.art, datum: x.last }] }));
  return html`<section class="card kheute"><h2>${nurZuletzt ? 'Zuletzt in Kontakt' : html`Heute in Kontakt <span class="kzahl">${liste.length}</span>`}<button type="button" class="mini primary" data-kg="">＋ Kontakt gehabt</button></h2>
    ${liste.length ? html`<ul class="list">${liste.slice(0, 8).map(({ c, acts }) => html`<li><a class="kav" href="#/kontakte/${c.id}" aria-hidden="true" tabindex="-1"><span class="avatar">${(c.vorname || '')[0] || ''}${(c.nachname || c.firma || '')[0] || ''}</span></a><div class="grow"><div class="ttl"><a class="lnk" href="#/kontakte/${c.id}">${fullName(c)}</a></div><div class="sub">${acts.map(a => wegIcon(a.art)).join(' ')} ${acts.length === 1 ? wegLabel(acts[0].art) : acts.length + ' Einträge'} · ${nurZuletzt ? vorWann(acts[0].datum) : FZ.format(new Date(acts[0].datum)) + ' Uhr'}${acts[0].text ? ' · ' + acts[0].text.slice(0, 60) : ''}</div></div><button type="button" class="mini" data-kg="${c.id}" aria-label="Weiteren Kontakt mit ${fullName(c)} festhalten">＋</button></li>`)}</ul>${liste.length > 8 ? html`<p class="muted small">und ${liste.length - 8} weitere</p>` : ''}`
      : html`<p class="muted">Noch nichts festgehalten. Hattest du heute Kontakt? Ein Tipp auf „＋ Kontakt gehabt“ – auch für mehrere Personen auf einmal.</p>`}
  </section>`;
}
/** Wer ist mit Nachfassen dran? Fällige Wiedervorlagen zuerst, dann lange ohne Kontakt (wichtige Kontaktarten) */
export function nachfassenListe() {
  const t0 = today(), g = grenzen(), ix = kontaktIndex(), WICHTIG = ['Eigentümer', 'Investor', 'Verkäufer', 'Vermieter', 'Bauträger / Verkäufer', 'Käufer', 'Interessent (Kauf)'];
  const L = [];
  for (const c of db.all('contacts')) {
    if (c.status === 'Archiv') continue;
    if (c.followup && c.followup <= t0) { L.push({ c, w: 0, s: c.followup, sub: `Wiedervorlage ${c.followup === t0 ? 'heute' : 'seit ' + fmtDate(c.followup)}` }); continue; }
    if (c.status !== 'Aktiv' || !WICHTIG.includes(c.kategorie)) continue;
    const last = ix.get(c.id)?.last || (c.created || '');
    if (!last) continue;
    const tage = daysBetween(lokalTag(last), t0);
    if (tage > g.nachfassen) L.push({ c, w: 1, s: last, sub: `${ix.get(c.id) ? 'letzter Kontakt ' + vorWann(last) : 'seit Anlage kein Kontakt'} (${tage} Tage)` });
  }
  return L.sort((a, b) => a.w - b.w || a.s.localeCompare(b.s));
}
export function nachfassenKarte(L = nachfassenListe()) {
  const tel = c => (c.mobil || c.tel || '').replace(/[^\d+]/g, '');
  return html`<section class="card knach"><h2>Nachfassen fällig <span class="kzahl">${L.length}</span>${L.length > 8 ? html`<a class="mini" href="#/kontakte/~nachfassen">Alle ansehen</a>` : ''}</h2>
    <ul class="list">${L.slice(0, 8).map(x => html`<li><span class="frische f-ueber kpunkt" aria-hidden="true"><i></i></span><div class="grow"><div class="ttl"><a class="lnk" href="#/kontakte/${x.c.id}">${fullName(x.c)}</a></div><div class="sub">${x.c.kategorie} · ${x.sub}</div></div><span class="fact">${tel(x.c) ? html`<a href="tel:${tel(x.c)}" aria-label="${fullName(x.c)} anrufen" title="Anrufen">📞</a>` : ''}<button type="button" data-kg="${x.c.id}" title="Kontakt festhalten" aria-label="Kontakt mit ${fullName(x.c)} festhalten">✓</button></span></li>`)}</ul></section>`;
}
