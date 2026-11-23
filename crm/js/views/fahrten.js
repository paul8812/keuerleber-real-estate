// Fahrtenbuch: Fahrten kommen automatisch vom iPhone (CarPlay verbindet/trennt → Start/Ziel per GPS, Strecke und Adressen
// ermittelt der Server). Hier werden sie nur noch benannt (Art + Anlass), als Nachweis fürs Finanzamt festgeschrieben und
// die Fahrtkosten berechnet (0,30 €/km oder tatsächliche Kosten je km, je nachdem was mehr bringt).
import * as db from '../db.js';
import * as FB from '../fahrtenbuch.js';
import { html, raw, esc, modal, toast, today, fmtDate, fmtDT, eur, eur2, num, pct, fullName, confirmDlg, download, toCSV } from '../util.js';
import { haptik } from '../haptik.js';
import { belegAnsehen } from './finanzen.js';
import * as OPEL from '../opelimport.js';
import * as F from '../finanzen.js';

const z = { tab: '', wahl: '', auswahl: false, gewaehlt: new Set(), jahr: today().slice(0, 4) };
const FZEIT = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const FTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const FMON = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const uhr = ts => ts ? FZEIT.format(new Date(ts)) : '';
const tagLang = f => { const t = FB.tag(f); return t ? FTAG.format(new Date(t + 'T12:00:00')) : ''; };
const kmTxt = n => num(n, n < 100 ? 1 : 0) + ' km';
const artBadge = art => FB.ARTEN[art] ? html`<span class="fb-art" style="--a:${FB.ARTEN[art].farbe}">${FB.ARTEN[art].kurz}</span>` : html`<span class="fb-art offen">offen</span>`;
const dauer = f => { if (f.start?.zeit && f.ende?.zeit && !f.start.zeitUnbekannt && !f.ende.zeitUnbekannt) { const m = Math.round((new Date(f.ende.zeit) - new Date(f.start.zeit)) / 60000); return m > 0 && m < 24 * 60 ? (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`) : ''; } return f.minRoute ? `ca. ${f.minRoute} min` : ''; };
const zeiten = f => {
  const a = f.start?.zeitUnbekannt || f.start?.zeitUngefaehr ? '?' : uhr(f.start?.zeit), b = f.ende?.zeitUnbekannt || f.ende?.zeitUngefaehr ? '?' : uhr(f.ende?.zeit);
  return a === '?' && b === '?' ? '' : `${a} – ${b} Uhr`;
};

// ---------------------------------------------------------------- Endpunkt (Kurzbefehl + Strecke berechnen)
let geheimCache = '';
async function geheim(neu = false) { if (!geheimCache || neu) geheimCache = await db.fahrtGeheim(neu); return geheimCache; }
const basisUrl = () => `${(db.cfg().url || '').replace(/\/$/, '')}/functions/v1/fahrt`;
export async function strecke(von, nach) {
  const k = await geheim(), q = new URLSearchParams({ k, a: 'strecke' });
  for (const [n, v] of [['von', von], ['nach', nach]]) { if (v && typeof v === 'object' && v.lat != null) { q.set(n + 'Lat', v.lat); q.set(n + 'Lon', v.lon); } else q.set(n, v || ''); }
  const r = await fetch(`${basisUrl()}?${q}`); const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error('Strecke konnte nicht berechnet werden');
  if (!j.ok) throw new Error(j.fehler || 'Keine Route gefunden');
  return j;
}

// ---------------------------------------------------------------- Ansicht
export function render(el, arg) {
  const offen = FB.offene(), unterwegs = FB.unterwegs();
  // Tab: per Link (#/fahrten/kosten) oder angetippt; sonst automatisch – offene Fahrten zuerst
  if (arg && ['benennen', 'fahrten', 'kosten', 'einrichten'].includes(arg)) z.wahl = arg;
  z.tab = z.wahl || (!FB.eingerichtet() ? 'einrichten' : offen.length || z.tab === 'benennen' ? 'benennen' : 'fahrten');
  const jahre = FB.jahre(); if (!jahre.includes(z.jahr)) z.jahr = jahre[0];
  const fz = FB.fahrzeug();
  const TABS = [['benennen', 'Zu benennen', offen.length], ['fahrten', 'Fahrtenbuch'], ['kosten', 'Auto & Kosten'], ['einrichten', 'Einrichten']];
  el.innerHTML = String(html`<div class="fb">
    <div class="head">
      <div><h1>Fahrtenbuch</h1><p class="muted">Privatauto, betrieblich mitgenutzt · Fahrten kommen automatisch über CarPlay</p></div>
      <div class="actions">
        <select class="chipsel" id="fb-jahr" aria-label="Jahr">${jahre.map(j => html`<option ${j === z.jahr ? raw('selected') : ''}>${j}</option>`)}</select>
        <button type="button" class="btn" id="fb-neu">+ Fahrt eintragen</button>
        <button type="button" class="btn" id="fb-opel" title="Fahrtberichte aus der myOpel-App übernehmen">⇪ myOpel</button>
        <button type="button" class="btn" id="fb-export">⤓ Export</button>
      </div>
    </div>
    ${autoKarte(fz)}
    ${unterwegs ? html`<div class="fb-live" role="status"><i class="fb-puls" aria-hidden="true"></i><div><b>Fahrt läuft</b> seit ${uhr(unterwegs.start?.zeit)} Uhr · ab ${FB.ortName(unterwegs.start)}</div></div>` : ''}
    <div class="seg fb-tabs" role="tablist">${TABS.map(([k, l, n]) => html`<button type="button" role="tab" data-tab="${k}" class="${z.tab === k ? 'on' : ''}" aria-selected="${z.tab === k}">${l}${n ? html` <b class="fb-n">${n}</b>` : ''}</button>`)}</div>
    <div class="fb-body">${z.tab === 'benennen' ? benennen(offen) : z.tab === 'fahrten' ? liste() : z.tab === 'kosten' ? kosten() : einrichten()}</div>
    <datalist id="fb-zwecke">${FB.letzteZwecke().map(x => html`<option value="${x}">`)}</datalist>
    <datalist id="fb-partner">${db.all('contacts').filter(c => c.status !== 'Archiv').slice(0, 600).map(c => html`<option value="${fullName(c)}">`)}</datalist>
  </div>`);
  binden(el);
}

// ---------------------------------------------------------------- Auto-Karte mit Foto
function autoKarte(fz) {
  const A = FB.auswertung(z.jahr);
  return html`<section class="fb-auto">
    <div class="fb-auto-txt">
      <span class="fb-auto-k">Dein Fahrzeug</span>
      <h2>${fz.name || 'Fahrzeug'}</h2>
      <p class="muted">${[fz.baujahr && 'Baujahr ' + fz.baujahr, fz.antrieb, fz.finanzierung === 'kauf' ? '' : 'Leasing', fz.kennzeichen].filter(Boolean).join(' · ')}</p>
      <div class="fb-auto-z">
        <div><b>${kmTxt(A.kmGesamt)}</b><span>gefahren ${z.jahr}</span></div>
        <div><b>${kmTxt(A.kmG)}</b><span>geschäftlich</span></div>
        <div><b class="gold">${eur2(A.absetzbar)}</b><span>absetzbar</span></div>
      </div>
      <div class="fb-auto-akt"><button type="button" class="btn small" id="fb-auto">Fahrzeug bearbeiten</button><button type="button" class="btn ghost small" id="fb-foto">📷 ${fz.fotoId ? 'Foto ändern' : 'Eigenes Foto'}</button></div>
    </div>
    <figure class="fb-auto-bild"><img id="fb-auto-img" src="${fz.fotoId ? '' : FB.PRESSEFOTO}" alt="${fz.name || 'Fahrzeug'}" ${fz.fotoId ? raw('data-foto="' + esc(fz.fotoId) + '"') : ''} referrerpolicy="no-referrer" decoding="async">${fz.fotoId ? '' : html`<figcaption>Bild: Carscoops</figcaption>`}</figure>
  </section>`;
}
/** Eigenes Foto: verkleinert (max. 1400 px) als Datei gespeichert, auf allen Geräten gleich */
function fotoWaehlen() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return;
    try {
      const bmp = await createImageBitmap(f), s = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const id = 'fahrzeug-foto-' + Date.now().toString(36), alt = FB.fahrzeug().fotoId;
      await db.putFile(id, c.toDataURL('image/jpeg', 0.84), { name: f.name, typ: 'image/jpeg' });
      await FB.fahrzeugSpeichern({ fotoId: id });
      if (alt) db.delFile(alt).catch(() => {});
      haptik('erfolg'); toast('Foto gespeichert');
    } catch (e) { toast('Foto konnte nicht gelesen werden: ' + e.message, 'err'); }
  };
  i.click();
}
const fotoCache = new Map();
async function fotoLaden(el) {
  const img = el.querySelector('#fb-auto-img[data-foto]'); if (!img) return;
  const id = img.dataset.foto;
  try { if (!fotoCache.has(id)) fotoCache.set(id, (await db.getFile(id))?.dataUrl || ''); img.src = fotoCache.get(id) || FB.PRESSEFOTO; } catch { img.src = FB.PRESSEFOTO; }
}

// ---------------------------------------------------------------- Tab: Zu benennen
function benennen(offen) {
  if (!offen.length) return html`<div class="card fb-leer"><div class="fb-leer-ic">✓</div><h3>Alles benannt</h3><p class="muted">Neue Fahrten erscheinen hier automatisch, sobald du aussteigst (CarPlay getrennt). Du gibst nur noch an, ob privat oder geschäftlich und worum es ging.</p><p class="fb-leer-akt"><button type="button" class="btn primary" data-eintragen>+ Fahrt eintragen</button>${FB.eingerichtet() ? '' : html` <button type="button" class="btn" data-tab="einrichten">Automatik einrichten</button>`}</p></div>`;
  return html`<p class="muted small fb-tipp">${offen.length === 1 ? '1 Fahrt wartet' : offen.length + ' Fahrten warten'} auf Art und Anlass. Vorschläge kommen aus Kalender, Kontakten, Objekten und früheren Fahrten – antippen genügt.</p>
    <div class="fb-karten">${offen.map(karte)}</div>
    ${offen.length > 1 ? html`<p class="fb-unten"><button type="button" class="btn ghost" id="fb-allprivat">Alle übrigen als privat markieren</button></p>` : ''}`;
}
function karte(f) {
  const v = FB.vorschlaege(f), erst = v[0] || {}, props = db.all('properties');
  const art = erst.art || '', kmW = FB.km(f);
  return html`<article class="card fb-karte" data-f="${f.id}" data-art="${art}">
    <header class="fb-kopf">
      <div><b>${tagLang(f)}</b><span class="muted"> · ${zeiten(f)}</span></div>
      <div class="fb-km" title="${FB.kmQuelle(f)}">${kmTxt(kmW)}${dauer(f) ? html`<span class="muted"> · ${dauer(f)}</span>` : ''}</div>
    </header>
    <ol class="fb-weg">
      <li><i class="fb-dot a"></i><span>${FB.vonText(f)}</span></li>
      ${(f.zwischenhalt || []).map(x => html`<li class="zw"><i class="fb-dot z"></i><span>${x}</span></li>`)}
      <li><i class="fb-dot b"></i><span><b>${FB.ortName(f.ende, 'Ziel unbekannt')}</b></span></li>
    </ol>
    ${v.length ? html`<div class="fb-vor" aria-label="Vorschläge">${v.map((x, i) => html`<button type="button" class="chip fb-v ${i === 0 ? 'on' : ''}" data-v="${i}" data-json="${JSON.stringify(x)}"><small>${x.quelle}</small> ${x.zweck || FB.ARTEN[x.art]?.name}</button>`)}</div>` : ''}
    <div class="fb-arten" role="group" aria-label="Art der Fahrt">${Object.entries(FB.ARTEN).map(([k, a]) => html`<button type="button" data-a="${k}" class="${art === k ? 'on' : ''}" style="--a:${a.farbe}" aria-pressed="${art === k}">${a.icon} ${a.name}</button>`)}</div>
    <div class="fb-felder">
      <label class="f fb-zweck"><span>Anlass / Reisezweck</span><input name="zweck" list="fb-zwecke" value="${erst.zweck || ''}" placeholder="z. B. Besichtigung ETW Hof, Notartermin, Bank"></label>
      <label class="f"><span>Geschäftspartner</span><input name="partner" list="fb-partner" value="${erst.partner || ''}" placeholder="optional"></label>
      ${props.length ? html`<label class="f"><span>Objekt</span><select name="propertyId"><option value=""></option>${props.map(p => html`<option value="${p.id}" ${p.id === erst.propertyId ? raw('selected') : ''}>${p.nr ? p.nr + ' · ' : ''}${p.titel}</option>`)}</select></label>` : ''}
      <details class="fb-mehr"><summary>Kilometer, Umweg, Ziel</summary>
        <div class="fb-felder">
          <label class="f"><span>Kilometer (sonst ${kmTxt(kmW)} lt. ${FB.kmQuelle(f)})</span><input name="kmManuell" inputmode="decimal" value="${f.kmManuell ?? ''}" placeholder="${num(kmW, 1)}"></label>
          <label class="f"><span>Ziel (Bezeichnung)</span><input name="ziel" value="${erst.ziel || ''}" placeholder="${f.ende?.adresse || ''}"></label>
          <label class="f full"><span>Umweg / Route (falls nicht direkt)</span><input name="umweg" value="${f.umweg || ''}" placeholder="z. B. über Tankstelle Rehau"></label>
        </div>
      </details>
    </div>
    <input type="hidden" name="contactId" value="${erst.contactId || ''}">
    <footer class="fb-fuss">
      <button type="button" class="btn ghost small" data-mehr>⋯</button>
      ${FB.kartenLink(f) ? html`<a class="btn ghost small" href="${FB.kartenLink(f)}" target="_blank" rel="noopener">Karte</a>` : ''}
      <span class="grow"></span>
      <button type="button" class="btn" data-privat>🏡 Privat</button>
      <button type="button" class="btn primary" data-speichern>Speichern</button>
    </footer>
  </article>`;
}
async function karteSpeichern(card, artFest) {
  const f = db.get('fahrten', card.dataset.f); if (!f) return;
  const q = n => card.querySelector(`[name=${n}]`)?.value ?? '';
  const art = artFest || card.dataset.art;
  const partner = q('partner').trim();
  let contactId = q('contactId');
  const c = partner ? db.all('contacts').find(x => fullName(x).toLowerCase() === partner.toLowerCase()) : null;
  if (c) contactId = c.id; else if (!partner) contactId = '';
  try {
    await FB.erfassen(f, { art, zweck: art === 'privat' && !q('zweck').trim() ? 'Privatfahrt' : q('zweck'), partner, contactId, propertyId: q('propertyId'), ziel: q('ziel'), umweg: q('umweg'), kmManuell: q('kmManuell') });
    haptik('erfolg');
    toast(`Fahrt gespeichert · ${FB.ARTEN[art].name}`, 'ok', { label: 'Rückgängig', fn: async () => { const x = db.get('fahrten', f.id); await db.save('fahrten', { ...x, status: 'offen', art: '', erfasstAm: '' }); } });
  } catch (e) { toast(e.message, 'err'); card.querySelector(art === 'geschaeftlich' ? '[name=zweck]' : '[data-a]')?.focus(); }
}

// ---------------------------------------------------------------- Tab: Fahrtenbuch (Liste)
function liste() {
  const A = FB.auswertung(z.jahr), F = [...A.fahrten].reverse();
  const nachMonat = new Map(); for (const f of F) { const m = FB.tag(f).slice(0, 7); if (!nachMonat.has(m)) nachMonat.set(m, []); nachMonat.get(m).push(f); }
  return html`<div class="kpis strip fb-strip">
      <div class="kpi"><span>Geschäftlich</span><b>${kmTxt(A.kmG)}</b></div>
      <div class="kpi"><span>Privat</span><b>${kmTxt(A.kmP)}</b></div>
      ${A.kmA ? html`<div class="kpi"><span>Wohnung ↔ Betrieb</span><b>${kmTxt(A.kmA)}</b></div>` : ''}
      <div class="kpi"><span>Anteil geschäftlich</span><b>${pct(A.anteil * 100, 0)}</b></div>
      <div class="kpi"><span>Fahrten</span><b>${A.anzahl}</b>${A.offen ? html`<span class="warn">${A.offen} offen</span>` : ''}</div>
      <div class="kpi"><span>Absetzbar ${z.jahr}</span><b class="gold">${eur2(A.absetzbar)}</b></div>
    </div>
    <div class="fb-listakt">
      <button type="button" class="btn primary" data-eintragen>+ Fahrt eintragen</button>
      ${F.length ? html`<button type="button" class="btn ghost" id="fb-auswahl">${z.auswahl ? 'Auswahl beenden' : '☑ Mehrere bewerten'}</button>` : ''}
      ${z.auswahl ? html`<span class="muted small">${z.gewaehlt.size} ausgewählt</span>${z.gewaehlt.size ? html`${Object.entries(FB.ARTEN).map(([k, a]) => html`<button type="button" class="btn small" data-massen="${k}" style="--a:${a.farbe}">${a.icon} ${a.kurz}</button>`)}` : ''}` : ''}
    </div>
    ${!F.length ? html`<div class="card fb-leer"><p class="muted">Noch keine Fahrten in ${z.jahr}. Fahrten vor dem Start der Automatik einfach mit „+ Fahrt eintragen“ nachtragen.</p></div>` : [...nachMonat].map(([m, arr]) => html`<section class="card flush fb-monat">
      <header><h3>${FMON.format(new Date(m + '-15T12:00:00'))}</h3><span class="muted">${arr.length} Fahrten · ${kmTxt(arr.filter(f => f.art === 'geschaeftlich').reduce((s, f) => s + FB.km(f), 0))} geschäftlich</span></header>
      <ul class="fb-zeilen ${z.auswahl ? 'auswahl' : ''}">${arr.map(f => html`<li data-detail="${f.id}" tabindex="0" role="button" class="${f.status !== 'erfasst' ? 'offen' : ''}">
        ${z.auswahl ? html`<input type="checkbox" class="fb-sel" data-sel="${f.id}" aria-label="Fahrt auswählen" ${z.gewaehlt.has(f.id) ? raw('checked') : ''}>` : ''}<div class="fb-zt"><b>${FB.tag(f).slice(8, 10)}.${FB.tag(f).slice(5, 7)}.</b><span>${f.start?.zeitUnbekannt || f.start?.zeitUngefaehr ? '' : uhr(f.start?.zeit)}</span></div>
        <div class="fb-zm"><div class="fb-zw">${FB.vonText(f)} → ${FB.nachText(f)}</div><div class="muted small">${f.zweck || (f.status === 'unterwegs' ? 'unterwegs …' : 'noch nicht benannt')}${f.partner ? ' · ' + f.partner : ''}</div></div>
        <div class="fb-zr"><button type="button" class="fb-artbtn" data-artwahl="${f.id}" aria-label="Bewertung ändern" title="Bewertung ändern">${artBadge(f.status === 'erfasst' ? f.art : '')}</button><b>${kmTxt(FB.km(f))}</b>${FB.fahrtBetrag(f, A) ? html`<span class="fb-ze" title="absetzbar: ${kmTxt(FB.km(f))} × ${eur2(A.satz)}">${eur2(FB.fahrtBetrag(f, A))}</span>` : ''}${FB.festgeschrieben(f) ? html`<i class="fb-lock" title="festgeschrieben">🔒</i>` : ''}${(f.historie || []).length ? html`<i class="fb-hist" title="geändert">✎</i>` : ''}</div>
      </li>`)}</ul></section>`)}`;
}
const artWahl = (aktuell, name = 'art') => html`<div class="full fb-arten" role="radiogroup" aria-label="Bewertung">${Object.entries(FB.ARTEN).map(([k, a]) => html`<label style="--a:${a.farbe}" class="${k === aktuell ? 'on' : ''}"><input type="radio" name="${name}" value="${k}" ${k === aktuell ? raw('checked') : ''}>${a.icon} ${a.name}</label>`)}</div>`;
const artWahlBinden = m => m.querySelectorAll('.fb-arten input[type=radio]').forEach(r => r.onchange = () => { r.closest('.fb-arten').querySelectorAll('label').forEach(l => l.classList.toggle('on', l.contains(r))); haptik('leicht'); });
const GRUENDE = ['Falsch zugeordnet', 'Nachträglich geklärt', 'Tippfehler', 'km laut Tacho'];
function detail(f) {
  const fest = FB.festgeschrieben(f), erfasst = f.status === 'erfasst', hand = f.quelle === 'hand';
  const props = db.all('properties');
  const naechste = FB.alle().filter(x => x.id !== f.id && FB.beginn(x) > FB.beginn(f)).sort((a, b) => FB.beginn(a).localeCompare(FB.beginn(b)))[0];
  modal(erfasst ? 'Fahrt bearbeiten' : 'Fahrt benennen', html`
    <div class="full fb-dkopf">
      <p><b>${tagLang(f)}</b> <span class="muted">· ${zeiten(f) || 'Uhrzeit offen'} · ${kmTxt(FB.km(f))} (${FB.kmQuelle(f)}) · ${hand ? 'von Hand eingetragen' : f.quelle === 'opel' ? 'aus myOpel-Fahrtbericht' : 'automatisch (CarPlay)'}${f.opel && f.quelle !== 'opel' ? ' · mit myOpel abgeglichen' : ''}${f.erfasstAm ? ' · benannt ' + fmtDT(f.erfasstAm) : ''}</span>${FB.kartenLink(f) ? raw(` · <a class="lnk" href="${esc(FB.kartenLink(f))}" target="_blank" rel="noopener">Karte</a>`) : ''}</p>
      ${fest ? html`<p class="fb-hinweis">🔒 Festgeschrieben (älter als ${FB.FESTSCHREIBEN_TAGE} Tage). Du kannst trotzdem alles ändern – mit Grund, die Änderung wird protokolliert.</p>` : ''}
    </div>
    <p class="full fb-lbl">Bewertung</p>
    ${artWahl(f.art || '')}
    <label class="f full"><span>Anlass / Reisezweck</span><input name="zweck" list="fb-zwecke" value="${f.zweck || ''}" placeholder="bei Geschäftsfahrten Pflicht"></label>
    <label class="f"><span>Geschäftspartner</span><input name="partner" list="fb-partner" value="${f.partner || ''}"></label>
    ${props.length ? html`<label class="f"><span>Objekt</span><select name="propertyId"><option value=""></option>${props.map(p => html`<option value="${p.id}" ${p.id === f.propertyId ? raw('selected') : ''}>${p.nr ? p.nr + ' · ' : ''}${p.titel}</option>`)}</select></label>` : ''}
    <label class="f"><span>Von</span><input name="startText" value="${f.startText || ''}" placeholder="${FB.ortName(f.start, 'Start')}"></label>
    <label class="f"><span>Nach</span><input name="ziel" value="${f.ziel || ''}" placeholder="${FB.ortName(f.ende, 'Ziel')}"></label>
    ${hand ? html`<label class="f"><span>Datum</span><input name="datum" type="date" value="${f.datum || FB.tag(f)}"></label>
    <label class="f"><span>Abfahrt</span><input name="abfahrt" type="time" value="${f.abfahrt || (f.start?.zeitUngefaehr ? '' : uhr(f.start?.zeit))}"></label>` : ''}
    <label class="f"><span>Kilometer</span><input name="kmManuell" inputmode="decimal" value="${f.kmManuell ?? ''}" placeholder="${num(FB.km(f), 1)}"></label>
    <label class="f"><span>Umweg / Route</span><input name="umweg" value="${f.umweg || ''}"></label>
    <label class="f"><span>Kilometerstand Beginn</span><input name="kmStart" inputmode="numeric" value="${f.kmStart ?? ''}"></label>
    <label class="f"><span>Kilometerstand Ende</span><input name="kmEnde" inputmode="numeric" value="${f.kmEnde ?? ''}"></label>
    ${erfasst ? html`<div class="full"><label class="f"><span>Grund der Änderung${fest ? ' (Pflicht)' : ' (optional)'}</span><input name="grund" placeholder="z. B. falsch zugeordnet"></label><div class="chips fb-gruende">${GRUENDE.map(g => html`<button type="button" class="chip" data-grund="${g}">${g}</button>`)}</div></div>` : ''}
    ${(f.historie || []).length ? html`<div class="full fb-historie"><h4>Änderungsprotokoll</h4><ul>${f.historie.map(h => html`<li><b>${fmtDT(h.zeit)}</b>${h.grund ? html` – ${h.grund}` : ''}<br><span class="muted small">${Object.entries(h.felder || {}).map(([k, [a, b]]) => `${k}: „${a}“ → „${b}“`).join(' · ')}</span></li>`)}</ul></div>` : ''}
    <div class="full fb-dakt">
      <button type="button" class="btn ghost small" data-kopie>⧉ Als Vorlage für neue Fahrt</button>
      ${naechste && !fest && !FB.festgeschrieben(naechste) ? html`<button type="button" class="btn ghost small" data-zus>Mit nächster Fahrt zusammenfassen (${uhr(naechste.start?.zeit)} → ${FB.nachText(naechste)})</button>` : ''}
    </div>`, {
    wide: true, saveLabel: erfasst ? 'Änderung speichern' : 'Fahrt erfassen',
    danger: { label: 'Verwerfen', confirm: 'Fahrt verwerfen? Sie bleibt im Protokoll als „verworfen“ sichtbar.', fn: () => verwerfenDlg(f) },
    onMount: (m, close) => {
      artWahlBinden(m);
      m.querySelectorAll('[data-grund]').forEach(b => b.onclick = () => { m.querySelector('[name=grund]').value = b.dataset.grund; });
      m.querySelector('[data-zus]')?.addEventListener('click', async () => { try { await FB.zusammenfassen(f, naechste); close(); toast('Fahrten zusammengefasst'); } catch (e) { toast(e.message, 'err'); } });
      m.querySelector('[data-kopie]').onclick = () => { close(); fahrtEintragen({ von: FB.vonText(f, ''), nach: FB.nachText(f, ''), km: FB.km(f), art: f.art, zweck: f.zweck, partner: f.partner, propertyId: f.propertyId, vonPunkt: f.start, nachPunkt: f.ende }); };
    },
    onSave: async v => {
      const art = v.art || f.art;
      if (!art) { toast('Bitte eine Bewertung wählen', 'err'); return false; }
      const c = v.partner ? db.all('contacts').find(x => fullName(x).toLowerCase() === v.partner.trim().toLowerCase()) : null;
      try {
        if (!erfasst) await FB.erfassen(f, { ...v, art, contactId: c?.id || '' });
        const patch = { art, zweck: (v.zweck || '').trim() || (art === 'privat' ? 'Privatfahrt' : ''), partner: (v.partner || '').trim(), contactId: c?.id || (v.partner ? f.contactId || '' : ''), propertyId: v.propertyId || '', startText: (v.startText || '').trim(), ziel: (v.ziel || '').trim(), umweg: (v.umweg || '').trim(), kmManuell: v.kmManuell === '' ? '' : FB.zahl(v.kmManuell) ?? '', kmStart: FB.zahl(v.kmStart) ?? '', kmEnde: FB.zahl(v.kmEnde) ?? '' };
        if (hand) { patch.datum = v.datum || f.datum || FB.tag(f); patch.abfahrt = v.abfahrt || ''; }
        if (art === 'geschaeftlich' && !patch.zweck) throw new Error('Bitte den Anlass der Geschäftsfahrt angeben.');
        await FB.speichern(db.get('fahrten', f.id), patch, { grund: (v.grund || '').trim() });
        haptik('erfolg'); toast('Gespeichert');
      } catch (e) { toast(e.message, 'err'); return false; }
    },
  });
}
/** Bewertung schnell ändern (eine oder mehrere Fahrten) */
function bewertenDlg(ids, art0 = '') {
  const fs = ids.map(id => db.get('fahrten', id)).filter(Boolean);
  const fest = fs.some(FB.festgeschrieben), ohneZweck = fs.filter(f => !f.zweck || f.zweck === 'Privatfahrt').length;
  modal(fs.length === 1 ? 'Bewertung ändern' : `${fs.length} Fahrten bewerten`, html`
    ${fs.length === 1 ? html`<p class="full muted">${tagLang(fs[0])} · ${FB.vonText(fs[0])} → ${FB.nachText(fs[0])} · ${kmTxt(FB.km(fs[0]))}</p>` : html`<p class="full muted">${kmTxt(fs.reduce((s, f) => s + FB.km(f), 0))} insgesamt</p>`}
    ${artWahl(art0 || (fs.length === 1 ? fs[0].art : ''))}
    <label class="f full fb-zweckf"><span>Anlass${fs.length > 1 ? ' (für Fahrten ohne Anlass)' : ''}</span><input name="zweck" list="fb-zwecke" value="${fs.length === 1 && fs[0].zweck !== 'Privatfahrt' ? fs[0].zweck || '' : ''}" placeholder="bei Geschäftsfahrten Pflicht"></label>
    ${fs.some(f => f.status === 'erfasst') ? html`<div class="full"><label class="f"><span>Grund der Änderung${fest ? ' (Pflicht – festgeschriebene Fahrten dabei)' : ' (optional)'}</span><input name="grund"></label><div class="chips fb-gruende">${GRUENDE.slice(0, 2).map(g => html`<button type="button" class="chip" data-grund="${g}">${g}</button>`)}</div></div>` : ''}`, {
    saveLabel: 'Übernehmen',
    onMount: m => { artWahlBinden(m); m.querySelectorAll('[data-grund]').forEach(b => b.onclick = () => { m.querySelector('[name=grund]').value = b.dataset.grund; }); },
    onSave: async v => {
      if (!v.art) { toast('Bitte eine Bewertung wählen', 'err'); return false; }
      const zweck = (v.zweck || '').trim();
      if (v.art === 'geschaeftlich' && !zweck && fs.some(f => !f.zweck || f.zweck === 'Privatfahrt')) { toast('Bitte einen Anlass für die Geschäftsfahrt(en) angeben', 'err'); return false; }
      if (fest && !(v.grund || '').trim()) { toast('Bitte einen Grund angeben – festgeschriebene Fahrten dabei', 'err'); return false; }
      try {
        for (const f of fs) {
          const z2 = fs.length === 1 ? (zweck || (v.art === 'privat' ? 'Privatfahrt' : f.zweck)) : (!f.zweck || f.zweck === 'Privatfahrt' || v.art === 'privat' ? (zweck || (v.art === 'privat' ? 'Privatfahrt' : f.zweck)) : f.zweck);
          if (f.status !== 'erfasst') await FB.erfassen(f, { art: v.art, zweck: z2, partner: f.partner || '', contactId: f.contactId || '', propertyId: f.propertyId || '', ziel: f.ziel || '', umweg: f.umweg || '' });
          else await FB.speichern(f, { art: v.art, zweck: z2 }, { grund: (v.grund || '').trim() });
        }
        haptik('erfolg'); toast(fs.length === 1 ? `Bewertung: ${FB.ARTEN[v.art].name}` : `${fs.length} Fahrten: ${FB.ARTEN[v.art].name}`);
        z.gewaehlt.clear(); z.auswahl = false;
      } catch (e) { toast(e.message, 'err'); return false; }
    },
  });
}

function verwerfenDlg(f) {
  modal('Fahrt verwerfen', html`<p class="full muted">Verworfene Fahrten bleiben mit Begründung im Protokoll (durchgestrichen im Export).</p>
    <div class="full chips">${['Nicht selbst gefahren', 'Fehlauslösung (nicht gefahren)', 'Doppelt erfasst'].map(g => html`<button type="button" class="chip" data-g="${g}">${g}</button>`)}</div>
    <label class="f full"><span>Grund</span><input name="grund" required></label>`, {
    saveLabel: 'Verwerfen',
    onMount: m => m.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { m.querySelector('[name=grund]').value = b.dataset.g; }),
    onSave: async v => { try { await FB.verwerfen(f, v.grund); toast('Fahrt verworfen'); } catch (e) { toast(e.message, 'err'); return false; } },
  });
}

// ---------------------------------------------------------------- Tab: Auto & Kosten
function kosten() {
  const A = FB.auswertung(z.jahr), fz = FB.fahrzeug(), st = FB.kmStaende();
  const gewinner = A.methode, diff = Math.abs(A.tatsaechlich - A.pauschal);
  return html`
    ${A.hinweis === 'ueber50' ? html`<div class="fb-warn">⚠️ <div><b>Über 50 % geschäftlich (${pct(A.anteil * 100, 0)})</b><br>Dann gehört das Auto steuerlich zwingend ins Betriebsvermögen (notwendiges Betriebsvermögen) – Privatnutzung wird dann per 1 %-Regel oder Fahrtenbuch versteuert. Bitte mit dem Steuerberater klären.</div></div>` : ''}
    <section class="fb-hero">
      <div class="fb-hl"><span class="muted">Absetzbar ${z.jahr} (bisher)</span><b class="fb-big">${eur2(A.absetzbar)}</b>
        <span class="muted small">${kmTxt(A.kmG)} geschäftlich${A.arbeitsweg ? ` · ${A.tage} Tage Arbeitsweg` : ''}${A.kZusatz ? ' · Parken/Maut' : ''}</span></div>
      <div class="fb-vgl">
        <div class="fb-m ${gewinner === 'pauschal' ? 'sieg' : ''}"><span>Kilometerpauschale</span><b>${eur2(A.pauschal)}</b><small>${kmTxt(A.kmG)} × 0,30 €</small></div>
        <div class="fb-m ${gewinner === 'tatsaechlich' ? 'sieg' : ''}"><span>Tatsächliche Kosten</span>${A.odo ? html`<b>${eur2(A.tatsaechlich)}</b><small>${kmTxt(A.kmG)} × ${eur2(A.proKm)}/km</small>` : html`<b class="muted">≈ ${eur2(A.vorl.betrag)}</b><small>Hochrechnung mit ${eur2(A.vorl.proKm)}/km – zählt erst mit 2 Kilometerständen</small>`}</div>
      </div>
      <p class="small fb-empf">${A.kmG ? html`${A.odo ? html`<b>${gewinner === 'pauschal' ? 'Pauschale' : 'Tatsächliche Kosten'}</b> ${diff >= 1 ? html`bringt ${eur2(diff)} mehr` : 'ist gleichauf'} – wird in der Buchhaltung angesetzt.` : html`Angesetzt wird die <b>Pauschale</b> – die tatsächlichen Kosten zählen erst, wenn Kilometerstände die Gesamtfahrleistung belegen.`}${!A.odo && A.vorl.mehr >= 1 ? html` Mit Kilometerständen wären voraussichtlich <b class="gold">${eur2(A.vorl.mehr)} mehr</b> drin. <button type="button" class="btn small" data-check="km" data-datum="${today()}">Kilometerstand eintragen</button>` : ''}` : 'Sobald Geschäftsfahrten benannt sind, erscheint hier der Abzug.'}</p>
    </section>
    ${tatsKarte(A, fz)}
    ${erfassenLeiste()}
    <div class="kpis small">
      <div class="kpi"><span>Gesamt gefahren ${z.jahr}</span><b>${kmTxt(A.kmGesamt)}</b>${A.nichtErfasst ? html`<span>davon ${kmTxt(A.nichtErfasst)} nicht aufgezeichnet (zählt privat)</span>` : html`<span>${A.odo ? 'lt. Kilometerständen' : 'aufgezeichnete Fahrten'}</span>`}</div>
      <div class="kpi"><span>Autokosten ${z.jahr}</span><b>${eur2(A.kGesamt)}</b><span>bis heute: Leasing, Versicherung, Steuer, Sprit … (Belege, sonst Plan)</span></div>
      <div class="kpi"><span>Kosten je km</span><b>${A.proKm ? eur2(A.proKm) : '–'}</b><span>${A.odo ? `${eur(A.kostenZeitraum)} ÷ ${num(A.odo.km)} km (${fmtDate(A.odo.von.datum)}–${fmtDate(A.odo.bis.datum)})` : 'Kilometerstände eintragen'}</span></div>
      <div class="kpi"><span>Anteil geschäftlich</span><b>${pct(A.anteil * 100, 0)}</b><span>${A.hinweis === 'ueber50' ? 'über 50 % – siehe Hinweis' : 'unter 50 % – Privatvermögen ok'}</span></div>
      ${A.arbeitsweg ? html`<div class="kpi"><span>Wohnung ↔ Betrieb</span><b>${eur2(A.arbeitsweg)}</b><span>${A.tage} Tage × ${num(A.entf, 1)} km × ${String(FB.entfernungssatz(z.jahr, A.entf)).replace('.', ',')} €</span></div>` : ''}
      ${A.kZusatzAlle ? html`<div class="kpi"><span>Parken, Maut & Co.</span><b>${eur2(A.kZusatz)}</b><span>an Tagen mit Geschäftsfahrt (gesamt ${eur2(A.kZusatzAlle)})</span></div>` : ''}
    </div>

    ${monatsKarte(A)}
    ${kostenplanKarte(fz, A)}
    ${leasingKarte(fz)}
    <section class="card">
      <div class="fb-kh"><h3>Belege rund ums Auto ${z.jahr}</h3><span class="muted small">${A.belege.length} Beleg${A.belege.length === 1 ? '' : 'e'} · ${eur(A.kBelege + A.kZusatzAlle)}</span></div>
      <p class="muted small">Tanken, Werkstatt, Versicherung, Steuer, Reifen, Wäsche … werden von der KI automatisch als „Fahrzeug & Fahrtkosten“ erkannt und landen hier. Beim Privatauto zählen sie nicht direkt als Betriebsausgabe, sondern über die Kosten je km. Parken und Maut an Geschäftstagen sind zusätzlich absetzbar.</p>
      ${A.belege.length ? html`<table class="tbl fb-tbl ${z.alleBelege ? '' : 'fb-kurz'}"><thead><tr><th>Datum</th><th>Lieferant</th><th>Art</th><th class="r">Betrag</th><th></th></tr></thead><tbody>${A.belege.sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, z.alleBelege ? 999 : 8).map(b => html`<tr><td>${fmtDate(b.datum)}</td><td>${b.lieferant || b.beschreibung || ''}${b.kmStand ? html`<br><small class="muted">km-Stand ${num(b.kmStand)}${b.liter ? ` · ${num(b.liter, 1)} l` : ''}</small>` : ''}</td><td>${FB.istZusatz(b) ? 'Parken/Maut' : (() => { const id = FB.postenFuer(b); return id === 'leasing' ? 'Leasing (Vertrag)' : FB.kostenPosten().find(p => p.id === id)?.name || 'sonstige Kfz-Kosten'; })()}</td><td class="r">${eur2(db.settings().kleinunternehmer ? b.brutto : (b.netto ?? b.brutto))}</td><td>${b.belegId ? html`<button type="button" class="mini" data-beleg="${b.belegId}" title="Beleg ansehen">📎</button>` : ''}</td></tr>`)}</tbody></table>${A.belege.length > 8 ? html`<button type="button" class="btn small ghost fb-mehr" id="fb-allebelege">${z.alleBelege ? 'Weniger anzeigen' : `Alle ${A.belege.length} Belege anzeigen`}</button>` : ''}` : html`<p class="muted">Noch keine Kfz-Belege in ${z.jahr}.</p>`}
    </section>

    <div class="fb-zwei">
      <section class="card">
        <div class="fb-kh"><h3>Fahrzeug</h3><button type="button" class="btn small" data-autoform>Bearbeiten</button></div>
        <dl class="fb-dl">
          <dt>Fahrzeug</dt><dd>${fz.name || '–'}${fz.baujahr ? ' (' + fz.baujahr + ')' : ''}${fz.antrieb ? ' · ' + fz.antrieb : ''}${fz.kennzeichen ? ' · ' + fz.kennzeichen : ''}</dd>
          <dt>Steuerlich</dt><dd>${fz.vermoegen === 'betrieb' ? 'Betriebsvermögen' : 'Privatvermögen, betrieblich mitgenutzt'}</dd>
          <dt>Finanzierung</dt><dd>${fz.finanzierung === 'kauf' ? (fz.kaufpreis ? `Kauf ${eur2(FB.zahl(fz.kaufpreis))} · AfA ${fz.nutzungsdauer || 6} Jahre` : 'Kauf') : `Leasing${FB.zahl(fz.leasing.rate) ? ' · ' + eur2(FB.zahl(fz.leasing.rate)) + '/Monat' : ''}${fz.leasing.laufzeit ? ' · ' + fz.leasing.laufzeit + ' Monate' : ''}`}</dd>
          <dt>Zuhause</dt><dd>${fz.zuhause ? (fz.zuhause.adresse || 'gesetzt') : html`<span class="warn">noch nicht gesetzt</span>`}</dd>
          <dt>Betriebsstätte</dt><dd>${fz.betrieb ? (fz.betrieb.name || fz.betrieb.adresse) + (fz.entfernungKm ? ` · ${fz.entfernungKm} km entfernt` : '') : 'zuhause (Homeoffice)'}</dd>
        </dl>
      </section>
      <section class="card">
        <div class="fb-kh"><h3>Kilometerstände</h3><button type="button" class="btn small" id="fb-kmstand">+ Eintragen</button></div>
        <p class="muted small">Mind. Jahresanfang und -ende eintragen (z. B. beim Tanken). Daraus ergibt sich die Gesamtfahrleistung – auch Fahrten ohne Handy zählen dann mit (als privat).</p>
        ${st.length ? html`<ul class="fb-st">${st.slice(-8).reverse().map(s => html`<li><span>${fmtDate(s.datum)}</span><b>${num(FB.zahl(s.km))} km</b><small class="muted">${s.quelle}</small>${s.id && !String(s.id).startsWith('b:') ? html`<button type="button" class="mini" data-kmweg="${s.id}" aria-label="Eintrag löschen">×</button>` : ''}</li>`)}</ul>` : html`<p class="muted">Noch keine Kilometerstände.</p>`}
      </section>
    </div>
    <p class="muted small fb-rechts">Rechengrundlage: Privatfahrzeug mit betrieblicher Nutzung – Geschäftsfahrten wahlweise 0,30 €/km (R 4.12 EStR i. V. m. § 5 BRKG) oder anteilige tatsächliche Kosten inkl. AfA; Wohnung ↔ erste Betriebsstätte mit Entfernungspauschale (${z.jahr >= '2026' ? '0,38 € ab dem 1. km' : '0,30/0,38 €'}). Keine Steuerberatung – im Zweifel mit dem Steuerberater abstimmen.</p>`;
}
// ---------------------------------------------------------------- Tatsächliche Kosten
const FARBE = { leasingrate: '#c9a96e', sonderzahlung: '#a8893f', afa: '#c9a96e', kraftstoff: '#5fa8d3', versicherung: '#8e7cc3', wartung: '#6fbf8f', steuer: '#e0926a', reifen: '#d47fa6', hu: '#9aa3ad', pflege: '#57b8b0', sonstige: '#7c8591' };
const farbe = id => FARBE[id] || '#7c8591';
const ct = n => (n * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ct';
const QK = { Belege: 'beleg', Vertrag: 'vertrag', Vorgabe: 'vorgabe', 'Schätzung': 'schaetz', fehlt: 'fehlt' };
function tatsKarte(A, fz) {
  const K = FB.kostenAufteilung(A, fz), G = FB.grenzKm(fz), C = FB.kostenCheck(A, fz), V = FB.verbrauch(z.jahr);
  const d = K.proKm - FB.PAUSCHALE_KM, max = Math.max(0.6, K.proKm * 1.15), tacho = K.basis === 'tacho';
  const fehlt = K.teile.filter(t => t.quelle === 'fehlt');
  const kmJahr = tacho ? Math.round(A.odo.km / Math.max(1, A.zeitraumTage) * 365) : K.km;
  return html`<section class="card fb-tk">
    <div class="fb-kh"><h3>Tatsächliche Kosten je Kilometer</h3><span class="fb-q ${tacho ? 'beleg' : 'schaetz'}">${tacho ? `aus Kilometerständen ${fmtDate(A.odo.von.datum)}–${fmtDate(A.odo.bis.datum)}` : `Hochrechnung bei ${num(K.km)} km/Jahr`}</span></div>
    <div class="fb-tk-top">
      <div class="fb-tk-satz">
        <b class="${d > 0 ? 'gold' : ''}">${eur2(K.proKm)}</b><span>je km · ${eur(K.summe)} ÷ ${num(K.km)} km</span>
        <div class="fb-skala" role="img" aria-label="${eur2(K.proKm)} je km, Pauschale 0,30 € je km">
          <i class="fb-sk-w" style="width:${Math.min(100, K.proKm / max * 100).toFixed(1)}%"></i>
          <i class="fb-sk-p" style="left:${(FB.PAUSCHALE_KM / max * 100).toFixed(1)}%"><em>Pauschale 0,30 €</em></i>
        </div>
      </div>
      <div class="fb-tk-txt">
        ${fehlt.length ? html`<p class="fb-hinweis small">📄 ${fehlt.map(t => t.name).join(', ')} fehlt noch – der Satz ist deshalb zu niedrig. <button type="button" class="btn small" data-check="auto">Vertrag eintragen</button></p>` : ''}
        <p>${d > 0.005 ? html`Je Geschäfts-km <b>${ct(d)} mehr</b> als die Pauschale${A.kmG ? html` – bei ${kmTxt(A.kmG)} sind das <b class="gold">${eur2(A.kmG * d)}</b> zusätzlicher Abzug` : ''}.` : d < -0.005 ? html`Dein Auto ist günstiger als 0,30 €/km – die <b>Pauschale</b> bringt je Geschäfts-km ${ct(-d)} mehr.` : 'Tatsächliche Kosten und Pauschale liegen gleichauf.'}
        ${!tacho ? html` <span class="muted">Angesetzt wird das erst, wenn zwei Kilometerstände die Gesamtfahrleistung belegen.</span>` : ''}</p>
        <p class="muted small">${Number.isFinite(G.km) ? html`Faustregel: Bis etwa <b>${num(G.km)} km im Jahr</b> lohnen sich die tatsächlichen Kosten, darüber die Pauschale – du liegst bei rund ${num(kmJahr)} km/Jahr${tacho ? ' (hochgerechnet)' : ' (Annahme)'}.` : 'Allein der Sprit kostet schon mehr als 0,30 €/km – die tatsächlichen Kosten sind immer besser.'}</p>
      </div>
    </div>
    <div class="fb-seg" role="img" aria-label="Zusammensetzung der Kosten">${K.teile.filter(t => t.wert > 0).map(t => html`<i style="flex:${t.wert};background:${farbe(t.id)}" title="${t.name}: ${eur(t.wert)} (${pct(t.anteil * 100, 0)})"></i>`)}</div>
    <table class="tbl fb-tbl fb-tk-tbl"><thead><tr><th>Kostenart</th><th>Grundlage</th><th class="r">${tacho ? 'Im Zeitraum' : 'Pro Jahr'}</th><th class="r">je km</th><th class="r">Anteil</th></tr></thead><tbody>
      ${K.teile.map(t => html`<tr class="${t.quelle === 'fehlt' ? 'fehlt' : ''}"><td><i class="fb-pkt" style="background:${farbe(t.id)}"></i>${t.name.replace(/ \(.*\)$/, '')}</td><td><span class="fb-q ${QK[t.quelle] || 'vorgabe'}">${t.quelle === 'Belege' && t.belege ? `${t.belege} Beleg${t.belege > 1 ? 'e' : ''}` : t.quelle === 'Vorgabe' ? 'ADAC' : t.quelle}</span></td><td class="r">${t.quelle === 'fehlt' ? '–' : eur(t.wert)}</td><td class="r">${t.quelle === 'fehlt' ? '–' : ct(t.proKm)}</td><td class="r">${t.quelle === 'fehlt' ? '–' : pct(t.anteil * 100, 0)}</td></tr>`)}
    </tbody><tfoot><tr><td>Summe</td><td></td><td class="r">${eur(K.summe)}</td><td class="r">${ct(K.proKm)}</td><td class="r">100 %</td></tr></tfoot></table>
    <div class="fb-tk-unten">
      <div class="fb-chk">
        <div class="fb-chk-k"><b>So belastbar ist die Rechnung</b><span class="muted small">${C.ok} von ${C.n} erledigt · ${pct(K.belegt * 100, 0)} der Kosten durch Belege oder Vertrag gedeckt</span></div>
        <div class="fb-chk-b"><i style="width:${(C.ok / C.n * 100).toFixed(0)}%"></i></div>
        <ul>${C.punkte.map(p => html`<li class="${p.ok ? 'ok' : ''}"><span class="fb-hk" aria-hidden="true">${p.ok ? '✓' : ''}</span><div><b>${p.text}</b>${p.ok ? '' : html`<small class="muted">${p.fehlt}</small>`}</div>${p.ok ? '' : html`<button type="button" class="btn small" data-check="${p.aktion}" data-datum="${p.datum || ''}">${p.aktion === 'km' ? 'Eintragen' : p.aktion === 'tanken' ? '⛽ Tanken' : 'Eintragen'}</button>`}</li>`)}</ul>
      </div>
      <div class="fb-vb">
        <b>Verbrauch ${z.jahr}</b>
        ${V.anzahl ? html`<dl>
          <dt>Getankt</dt><dd>${eur(V.summe)}${V.liter ? ` · ${num(V.liter, 0)} l` : ''} <small class="muted">(${V.anzahl}×)</small></dd>
          <dt>Verbrauch</dt><dd>${V.l100 ? html`<b>${V.l100.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} l/100 km</b>` : html`<span class="muted">braucht Liter + km-Stand auf 2 Tankbelegen</span>`}</dd>
          <dt>Literpreis</dt><dd>${V.preisL ? `Ø ${num(V.preisL, 2)} €` : '–'}</dd>
          <dt>Sprit je 100 km</dt><dd>${V.je100 ? eur2(V.je100) : '–'}</dd>
        </dl>` : html`<p class="muted small">Noch keine Tankbelege. Trag beim Tanken Betrag, Liter und Kilometerstand ein – daraus ergeben sich Verbrauch und Gesamtfahrleistung ganz nebenbei.</p>`}
      </div>
    </div>
  </section>`;
}
// Schnell erfassen ohne Foto – landet als Buchung „Fahrzeug & Fahrtkosten“ und fließt sofort in die Kosten je km ein
const ERFASSEN = {
  tanken: { icon: '⛽', name: 'Tanken', text: 'Tanken', liter: true, km: true, ort: 'Tankstelle (z. B. Aral Hof)' },
  werkstatt: { icon: '🔧', name: 'Werkstatt', text: 'Werkstatt / Inspektion', km: true, ort: 'Werkstatt' },
  versicherung: { icon: '🛡', name: 'Versicherung', text: 'Kfz-Versicherung', ohneUst: true, ort: 'Versicherer' },
  steuer: { icon: '🏛', name: 'Kfz-Steuer', text: 'Kfz-Steuer', ohneUst: true, ort: 'Hauptzollamt' },
  reifen: { icon: '🛞', name: 'Reifen', text: 'Reifen / Räderwechsel', ort: 'Reifenhändler' },
  hu: { icon: '📋', name: 'TÜV', text: 'TÜV Hauptuntersuchung', km: true, ort: 'Prüfstelle' },
  pflege: { icon: '🧽', name: 'Wäsche', text: 'Autowäsche', ort: 'Waschanlage' },
  parken: { icon: '🅿️', name: 'Parken / Maut', text: 'Parken', ort: 'Parkhaus, Mautstelle …' },
  sonst: { icon: '＋', name: 'Sonstiges', text: '', ort: 'Wofür?' },
};
function erfassenLeiste() {
  return html`<section class="card fb-erf">
    <div class="fb-kh"><h3>Kosten erfassen</h3><button type="button" class="btn small" id="fb-beleg">📷 Beleg fotografieren</button></div>
    <div class="fb-erf-b">${Object.entries(ERFASSEN).map(([k, t]) => html`<button type="button" data-erfassen="${k}"><i aria-hidden="true">${t.icon}</i>${t.name}</button>`)}<button type="button" data-check="km" data-datum="${today()}"><i aria-hidden="true">🔢</i>Kilometerstand</button></div>
  </section>`;
}
function kostenErfassen(typ) {
  const t = ERFASSEN[typ] || ERFASSEN.sonst, kl = F.kleinunternehmer();
  modal(`${t.icon} ${t.name} erfassen`, html`
    <label class="f"><span>Datum</span><input name="datum" type="date" value="${today()}" max="${today()}" required></label>
    <label class="f"><span>Betrag (€, brutto)</span><input name="brutto" inputmode="decimal" required placeholder="z. B. 68,40" autofocus></label>
    ${t.liter ? html`<label class="f"><span>Liter</span><input name="liter" inputmode="decimal" placeholder="z. B. 38,2"></label>` : ''}
    ${t.km ? html`<label class="f"><span>Kilometerstand</span><input name="kmStand" inputmode="numeric" placeholder="vom Tacho, z. B. 17.650"></label>` : ''}
    <label class="f full"><span>${typ === 'sonst' ? 'Beschreibung' : 'Wo? (optional)'}</span><input name="lieferant" placeholder="${t.ort}" ${typ === 'sonst' ? raw('required') : ''}></label>
    ${t.km ? html`<p class="full muted small">Tipp: Mit dem Kilometerstand kennt das CRM deine Gesamtfahrleistung – die Voraussetzung, um die tatsächlichen Kosten anzusetzen.</p>` : ''}`, {
    saveLabel: 'Speichern',
    onSave: async v => {
      const brutto = FB.zahl(v.brutto); if (!brutto || brutto <= 0) { toast('Bitte einen Betrag eingeben', 'err'); return false; }
      const satz = kl || t.ohneUst ? 0 : 19, { netto, ust } = F.bruttoZuNetto(brutto, satz), wo = (v.lieferant || '').trim();
      const liter = FB.zahl(v.liter), kmS = FB.zahl(v.kmStand);
      if (kmS != null) { const vor = FB.kmStaende().filter(s => s.datum <= v.datum).pop(); if (vor && kmS < FB.zahl(vor.km)) { toast(`Kilometerstand liegt unter dem vom ${fmtDate(vor.datum)} (${num(FB.zahl(vor.km))} km)`, 'err'); return false; } }
      await db.save('buchungen', { art: 'ausgabe', datum: v.datum, kategorie: 'Fahrzeug & Fahrtkosten', konto: F.konto('Fahrzeug & Fahrtkosten', satz),
        beschreibung: typ === 'sonst' ? wo : t.text, lieferant: typ === 'sonst' ? '' : wo, brutto: F.r2(brutto), netto, ust, ustSatz: satz, offen: false, quelle: 'fahrtenbuch',
        ...(kmS > 0 ? { kmStand: Math.round(kmS) } : {}), ...(liter > 0 ? { liter } : {}) });
      haptik('erfolg'); toast(`${t.name} gespeichert`);
    },
  });
}
function monatsKarte(A) {
  const M = A.monate.filter(m => m.m <= today().slice(0, 7) || m.betrag), max = Math.max(1, ...M.map(m => m.betrag));
  if (!A.kmG) return '';
  return html`<section class="card fb-mon">
    <div class="fb-kh"><h3>Abzug je Monat ${z.jahr}</h3><span class="muted small">${A.methode === 'tatsaechlich' ? `tatsächliche Kosten · ${eur2(A.satz)}/km` : 'Kilometerpauschale · 0,30 €/km'}</span></div>
    <div class="fb-bars">${M.map(m => html`<div class="fb-bar" tabindex="0" title="${FMON.format(new Date(m.m + '-15T12:00:00'))}: ${eur2(m.betrag)} · ${kmTxt(m.km)} geschäftlich"><span>${m.betrag ? eur(m.betrag) : ''}</span><i style="height:${(m.betrag / max * 100).toFixed(1)}%"></i><small>${new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(m.m + '-15T12:00:00')).replace('.', '')}</small><em>${m.km ? num(m.km, 0) + ' km' : ''}</em></div>`)}</div>
  </section>`;
}
// ---------------------------------------------------------------- Kostenplan & Leasing
function kostenplanKarte(fz, A) {
  const P = FB.kostenplan(fz), J = A.kJahr;
  const quelleVon = id => J?.zeilen.find(z => z.id === id);
  return html`<section class="card fb-plan">
    <div class="fb-kh"><h3>Was dein ${fz.name.replace(/^Opel /, '') || 'Auto'} kostet</h3><button type="button" class="btn small" id="fb-kosten">Kosten anpassen</button></div>
    <div class="fb-plan-top">
      <div><b>${eur(P.monat)}</b><span>pro Monat</span></div>
      <div><b>${eur(P.jahr)}</b><span>pro Jahr</span></div>
      <div><b>${eur2(P.proKm)}</b><span>je km bei ${num(P.km)} km/Jahr</span></div>
    </div>
    ${P.unvollstaendig ? html`<p class="fb-hinweis small">📄 Trag die Daten aus deinem Leasingvertrag ein (Rate, Laufzeit, Freikilometer) – dann stimmt die Rechnung. <button type="button" class="btn small" data-autoform>Leasingdaten eintragen</button></p>` : ''}
    <table class="tbl fb-tbl fb-plan-tbl"><thead><tr><th>Kostenart</th><th class="r">Monat</th><th class="r">Jahr</th><th>Grundlage</th><th class="r">${z.jahr} bisher</th></tr></thead><tbody>
      ${P.zeilen.map(p => { const q = quelleVon(p.id); return html`<tr class="${p.fehlt ? 'fehlt' : ''}"><td>${p.name}${p.hinweis ? html`<br><small class="muted">${p.hinweis}</small>` : ''}</td><td class="r">${p.fehlt ? '–' : eur(p.monat)}</td><td class="r">${p.fehlt ? '–' : eur(p.jahr)}</td><td><span class="fb-q ${q?.quelle === 'Belege' ? 'beleg' : p.vertrag ? 'vertrag' : p.geschaetzt ? 'schaetz' : 'vorgabe'}">${q?.quelle === 'Belege' ? `${q.belege} Beleg${q.belege > 1 ? 'e' : ''}` : p.vertrag ? (p.fehlt ? 'fehlt' : 'Vertrag') : p.geschaetzt ? 'Schätzung' : 'ADAC'}</span>${p.rhythmus === '100km' ? html` <small class="muted">${eur2(p.betrag)}/100 km</small>` : ''}</td><td class="r">${q ? eur(q.wert) : '–'}</td></tr>`; })}
      ${P.afa ? html`<tr><td>Abschreibung (AfA)</td><td class="r">${eur(P.afa / 12)}</td><td class="r">${eur(P.afa)}</td><td><span class="fb-q vertrag">Kaufpreis</span></td><td class="r">${eur(A.kAfa)}</td></tr>` : ''}
      ${J?.sonstige ? html`<tr><td>Sonstige Kfz-Belege</td><td></td><td></td><td><span class="fb-q beleg">Belege</span></td><td class="r">${eur(J.sonstige)}</td></tr>` : ''}
    </tbody><tfoot><tr><td>Summe</td><td class="r">${eur(P.monat)}</td><td class="r">${eur(P.jahr)}</td><td></td><td class="r">${eur(A.kGesamt)}</td></tr></tfoot></table>
    <p class="small fb-plan-fazit">${P.proKm > FB.PAUSCHALE_KM
      ? html`💡 Dein Auto kostet dich voraussichtlich <b>${eur2(P.proKm)} je km</b> – mehr als die Pauschale von 0,30 €. Mit den tatsächlichen Kosten setzt du je Geschäfts-km rund <b>${eur2(P.proKm - FB.PAUSCHALE_KM)}</b> mehr ab. Dafür braucht das Finanzamt die Gesamtfahrleistung: <b>Kilometerstand zum Jahresanfang und -ende eintragen</b>.`
      : html`Dein Auto kostet voraussichtlich ${eur2(P.proKm)} je km – die Pauschale von 0,30 €/km ist hier günstiger.`}</p>
  </section>`;
}
function leasingKarte(fz) {
  if (fz.finanzierung !== 'leasing') return '';
  const L = FB.leasingStand(fz);
  if (!L) return html`<section class="card fb-leasing"><div class="fb-kh"><h3>Leasing-Kilometer</h3><button type="button" class="btn small" data-autoform>Vertrag eintragen</button></div><p class="muted small">Mit Leasingbeginn, Laufzeit, Freikilometern und dem km-Stand bei Übernahme zeigt dir das CRM laufend, ob du im Rahmen bleibst – und was Mehrkilometer am Ende kosten würden.</p></section>`;
  const ampel = L.diff > 0 ? 'rot' : L.anteilKm > L.anteilZeit + 0.05 ? 'gelb' : 'gruen';
  return html`<section class="card fb-leasing">
    <div class="fb-kh"><h3>Leasing-Kilometer</h3><span class="muted small">Vertragsende ${fmtDate(L.ende)} · noch ${L.restMonate} Monate</span></div>
    <div class="fb-lbar" role="img" aria-label="${num(L.gefahren)} von ${num(L.frei)} Freikilometern gefahren">
      <i class="fb-lzeit" style="left:${Math.min(100, L.anteilZeit * 100).toFixed(1)}%" title="heute"></i>
      <b class="${ampel}" style="width:${Math.min(100, L.anteilKm * 100).toFixed(1)}%"></b>
    </div>
    <div class="fb-plan-top">
      <div><b>${num(L.gefahren)} km</b><span>gefahren (${L.quelle})</span></div>
      <div><b>${num(L.erlaubtBisher)} km</b><span>frei bis heute</span></div>
      <div><b class="${ampel}">${num(L.prognose)} km</b><span>Prognose bei Vertragsende (frei: ${num(L.frei)})</span></div>
    </div>
    <p class="small ${ampel === 'rot' ? 'fb-warn-t' : 'muted'}">${L.diff > 0
      ? html`⚠️ Beim jetzigen Tempo ca. <b>${num(L.diff)} Mehrkilometer</b>${L.kosten ? html` ≈ <b>${eur(L.kosten)}</b> Nachzahlung` : ''} bei Rückgabe – ggf. jetzt mit der Leasinggesellschaft die Laufleistung anpassen (meist günstiger als die Nachzahlung).`
      : html`✓ Im Rahmen: voraussichtlich ${num(-L.diff)} km unter den Freikilometern${L.kosten ? html` (≈ ${eur(-L.kosten)} Minderkilometer-Vergütung)` : ''}.`}</p>
  </section>`;
}
function kostenForm() {
  const fz = FB.fahrzeug(), posten = FB.kostenPosten(fz).filter(p => !p.vertrag);
  modal('Kosten anpassen', html`<p class="full muted small">Vorgaben für deinen Mokka (ADAC bzw. Schätzung). Trag deine echten Werte ein – Belege ersetzen die Planwerte später automatisch. Leasingrate und Sonderzahlung stehen beim Fahrzeug.</p>
    ${posten.map(p => html`<div class="full fb-krow">
      <span>${p.name}${p.hinweis ? html`<small class="muted">${p.hinweis}</small>` : ''}</span>
      <input name="b_${p.id}" inputmode="decimal" value="${String(p.betrag).replace('.', ',')}" aria-label="${p.name} Betrag">
      <select name="r_${p.id}" aria-label="${p.name} Rhythmus">${Object.entries(FB.RHYTHMUS).map(([k, l]) => html`<option value="${k}" ${k === p.rhythmus ? raw('selected') : ''}>${l}</option>`)}</select>
    </div>`)}`, {
    wide: true,
    onSave: async v => {
      const kosten = { ...(fz.kosten || {}) };
      for (const p of posten) {
        const b = FB.zahl(v['b_' + p.id]) ?? 0, r = v['r_' + p.id];
        const std = FB.STANDARD_KOSTEN.find(x => x.id === p.id);
        if (std && b === std.betrag && r === std.rhythmus) { delete kosten[p.id]; continue; }
        kosten[p.id] = { ...(kosten[p.id] || {}), betrag: b, rhythmus: r, geschaetzt: false };
      }
      await FB.fahrzeugSpeichern({ kosten }); toast('Kosten gespeichert');
    },
  });
}

function autoForm() {
  const fz = FB.fahrzeug();
  modal('Fahrzeug', html`
    <label class="f"><span>Marke / Modell</span><input name="name" value="${fz.name}" placeholder="z. B. VW Golf"></label>
    <label class="f"><span>Baujahr</span><input name="baujahr" inputmode="numeric" value="${fz.baujahr}"></label>
    <label class="f"><span>Motor / Getriebe</span><input name="antrieb" value="${fz.antrieb}" placeholder="z. B. 130 PS · Automatik"></label>
    <label class="f"><span>Kennzeichen</span><input name="kennzeichen" value="${fz.kennzeichen}" placeholder="HO-…"></label>
    <label class="f full"><span>Steuerlich</span><select name="vermoegen"><option value="privat" ${fz.vermoegen !== 'betrieb' ? raw('selected') : ''}>Privatauto, auch geschäftlich genutzt</option><option value="betrieb" ${fz.vermoegen === 'betrieb' ? raw('selected') : ''}>Firmenwagen (Betriebsvermögen)</option></select></label>
    <label class="f full"><span>Finanzierung</span><select name="finanzierung"><option value="leasing" ${fz.finanzierung !== 'kauf' ? raw('selected') : ''}>Leasing</option><option value="kauf" ${fz.finanzierung === 'kauf' ? raw('selected') : ''}>Gekauft</option></select></label>
    <div class="full fb-fin" data-fin="leasing">
      <p class="muted small">Aus deinem Leasingvertrag – damit rechnet das CRM die echten Kosten und behält die Freikilometer im Blick.</p>
      <div class="fb-felder">
        <label class="f"><span>Leasingrate / Monat (€)</span><input name="l_rate" inputmode="decimal" value="${fz.leasing.rate}"></label>
        <label class="f"><span>Sonderzahlung (€, einmalig)</span><input name="l_sonderzahlung" inputmode="decimal" value="${fz.leasing.sonderzahlung}"></label>
        <label class="f"><span>Leasingbeginn</span><input name="l_beginn" type="date" value="${fz.leasing.beginn}"></label>
        <label class="f"><span>Laufzeit (Monate)</span><input name="l_laufzeit" inputmode="numeric" value="${fz.leasing.laufzeit}" placeholder="z. B. 36"></label>
        <label class="f"><span>Freikilometer / Jahr</span><input name="l_freiKmJahr" inputmode="numeric" value="${fz.leasing.freiKmJahr}" placeholder="z. B. 15.000"></label>
        <label class="f"><span>km-Stand bei Übernahme</span><input name="l_kmUebernahme" inputmode="numeric" value="${fz.leasing.kmUebernahme}"></label>
        <label class="f"><span>Mehrkilometer (Cent/km)</span><input name="l_mehrKmCt" inputmode="decimal" value="${fz.leasing.mehrKmCt}" placeholder="z. B. 8,5"></label>
        <label class="f"><span>Minderkilometer (Cent/km)</span><input name="l_minderKmCt" inputmode="decimal" value="${fz.leasing.minderKmCt}" placeholder="z. B. 4"></label>
      </div>
    </div>
    <div class="full fb-fin" data-fin="kauf">
      <div class="fb-felder">
        <label class="f"><span>Kaufpreis (brutto)</span><input name="kaufpreis" inputmode="decimal" value="${fz.kaufpreis}"></label>
        <label class="f"><span>Kaufdatum</span><input name="kaufdatum" type="date" value="${fz.kaufdatum}"></label>
        <label class="f"><span>Nutzungsdauer (Jahre)</span><input name="nutzungsdauer" inputmode="numeric" value="${fz.nutzungsdauer}"></label>
      </div>
    </div>
    <label class="f full"><span>Zuhause (Adresse)</span><input name="zuhauseAdr" value="${fz.zuhause?.adresse || ''}" placeholder="Straße Nr, PLZ Ort"></label>
    <label class="f full chk"><input type="checkbox" name="mitBetrieb" ${fz.betrieb ? raw('checked') : ''}><span>Ich habe ein Büro außerhalb der Wohnung (Fahrten dorthin = Wohnung ↔ Betrieb)</span></label>
    <label class="f"><span>Büro (Adresse)</span><input name="betriebAdr" value="${fz.betrieb?.adresse || ''}"></label>
    <label class="f"><span>Entfernung Wohnung–Büro (km, einfach)</span><input name="entfernungKm" inputmode="decimal" value="${fz.entfernungKm}"></label>`, {
    wide: true,
    onMount: m => { const sel = m.querySelector('[name=finanzierung]'), zeig = () => m.querySelectorAll('[data-fin]').forEach(d => { d.hidden = d.dataset.fin !== sel.value; }); sel.onchange = zeig; zeig(); },
    onSave: async v => {
      const leasing = {}; for (const k of ['rate', 'sonderzahlung', 'beginn', 'laufzeit', 'freiKmJahr', 'kmUebernahme', 'mehrKmCt', 'minderKmCt']) leasing[k] = (v['l_' + k] || '').trim();
      const patch = { name: v.name.trim(), baujahr: v.baujahr.trim(), antrieb: v.antrieb.trim(), kennzeichen: v.kennzeichen.trim().toUpperCase(), vermoegen: v.vermoegen, finanzierung: v.finanzierung, leasing, kaufpreis: v.kaufpreis.trim(), kaufdatum: v.kaufdatum, nutzungsdauer: FB.zahl(v.nutzungsdauer) || 6, entfernungKm: v.entfernungKm.trim() };
      try {
        if (v.zuhauseAdr.trim() && v.zuhauseAdr.trim() !== (fz.zuhause?.adresse || '')) { const r = await strecke(v.zuhauseAdr, v.zuhauseAdr); patch.zuhause = { lat: r.von.lat, lon: r.von.lon, adresse: v.zuhauseAdr.trim() }; }
        if (!v.zuhauseAdr.trim()) patch.zuhause = null;
        if (v.mitBetrieb && v.betriebAdr.trim() && v.betriebAdr.trim() !== (fz.betrieb?.adresse || '')) {
          const r = await strecke(patch.zuhause || fz.zuhause || v.betriebAdr, v.betriebAdr);
          patch.betrieb = { lat: r.nach.lat, lon: r.nach.lon, adresse: v.betriebAdr.trim(), name: 'Büro' };
          if (!patch.entfernungKm && r.km && (patch.zuhause || fz.zuhause)) patch.entfernungKm = String(r.km).replace('.', ',');
        }
        if (!v.mitBetrieb) patch.betrieb = null;
      } catch (e) { toast('Adresse nicht gefunden: ' + e.message, 'err'); return false; }
      await FB.fahrzeugSpeichern(patch); toast('Fahrzeug gespeichert');
    },
  });
}
function kmStandForm(datum) {
  const letzter = FB.kmStaende().pop();
  modal('Kilometerstand eintragen', html`
    ${letzter ? html`<p class="full muted small">Letzter Stand: ${num(FB.zahl(letzter.km))} km am ${fmtDate(letzter.datum)}</p>` : ''}
    <label class="f"><span>Datum</span><input name="datum" type="date" value="${typeof datum === 'string' && datum ? datum : today()}" max="${today()}" required></label>
    <label class="f"><span>Kilometerstand</span><input name="km" inputmode="numeric" required placeholder="z. B. 48.250"></label>`, {
    onSave: async v => {
      const k = FB.zahl(v.km); if (k == null || k < 0) { toast('Bitte Kilometerstand eingeben', 'err'); return false; }
      const fz = FB.fahrzeug();
      await FB.fahrzeugSpeichern({ kmStaende: [...(fz.kmStaende || []), { id: 'km-' + Date.now().toString(36), datum: v.datum, km: k, eingetragen: new Date().toISOString() }] });
      toast('Kilometerstand gespeichert');
    },
  });
}

// ---------------------------------------------------------------- Tab: Einrichten
function einrichten() {
  const fz = FB.fahrzeug();
  return html`<div class="fb-setup">
    <section class="card fb-schritt">
      <div class="fb-nr">1</div>
      <div><h3>Auto & Zuhause</h3>
        <p class="muted">Damit Heimfahrten erkannt und die Kosten je km berechnet werden.</p>
        <p>${db.settings().fahrzeug ? html`✅ ${fz.name || 'Fahrzeug'}${fz.kennzeichen ? ' · ' + fz.kennzeichen : ''}${fz.zuhause ? ' · Zuhause gesetzt' : html` · <span class="warn">Zuhause fehlt</span>`} ` : ''}<button type="button" class="btn ${db.settings().fahrzeug ? 'small' : 'primary'}" data-autoform>${db.settings().fahrzeug ? 'Ändern' : 'Fahrzeug anlegen'}</button></p>
      </div>
    </section>
    <section class="card fb-schritt">
      <div class="fb-nr">2</div>
      <div><h3>Automatische Erfassung über CarPlay</h3>
        <p class="muted">Zwei Kurzbefehle auf dem iPhone melden Start und Ziel, sobald sich das iPhone mit CarPlay verbindet bzw. trennt. Läuft im Hintergrund, ohne dass du etwas tippen musst.</p>
        <div id="fb-links" class="fb-links"><p class="muted small">Zugangslinks werden geladen …</p></div>
        <ol class="fb-anl">
          <li>iPhone → App <b>Kurzbefehle</b> → <b>Automation</b> → <b>+</b> → <b>CarPlay</b> → „<b>Verbindet</b>“ → <b>Sofort ausführen</b> → Weiter.</li>
          <li>Aktion „<b>Aktuellen Standort abrufen</b>“ hinzufügen.</li>
          <li>Aktion „<b>Inhalt von URL abrufen</b>“ hinzufügen, als URL den <b>Start-Link</b> oben einfügen und ganz am Ende hinter <code>lat=</code> und <code>lon=</code> die Variablen <b>Aktueller Standort → Breitengrad</b> bzw. <b>Längengrad</b> einsetzen.</li>
          <li>Genauso eine zweite Automation für CarPlay „<b>Trennt</b>“ mit dem <b>Ziel-Link</b>.</li>
        </ol>
        <p class="muted small">Ohne CarPlay geht es auch mit dem Auslöser „Bluetooth“ (dein Auto) – oder du trägst Fahrten mit „+ Fahrt eintragen“ ein.</p>
      </div>
    </section>
    <section class="card fb-schritt">
      <div class="fb-nr">⇪</div>
      <div><h3>myOpel-Fahrtberichte übernehmen</h3>
        <p class="muted">Die myOpel-App zeichnet jede Fahrt mit Tacho-Kilometerstand auf („Fahren“ → Fahrten / My Trip Report). Bericht für einen Zeitraum dort <b>teilen bzw. herunterladen</b> (oder Screenshots machen) und hier hochladen – das CRM ergänzt die CarPlay-Fahrten um den echten Kilometerstand und trägt Fahrten ohne Handy nach.</p>
        <p><button type="button" class="btn small" data-opel>⇪ myOpel-Bericht importieren</button></p>
      </div>
    </section>
    <section class="card fb-schritt">
      <div class="fb-nr">3</div>
      <div><h3>Belege & Kilometerstand</h3>
        <p class="muted">Tank- und Werkstattbelege einfach mit „📷 Beleg fotografieren“ erfassen – sie erscheinen unter „Auto & Kosten“. Einmal zum Jahresanfang den Kilometerstand eintragen.</p>
        <p><button type="button" class="btn small" id="fb-kmstand">Kilometerstand eintragen</button></p>
      </div>
    </section>
    <section class="card fb-schritt">
      <div class="fb-nr">✓</div>
      <div><h3>So bleibt es finanzamtsfest</h3>
        <ul class="fb-liste">
          <li>Start, Ziel, Uhrzeit und Kilometer kommen automatisch per GPS – du ergänzt nur Art, Anlass und Geschäftspartner.</li>
          <li>Benenne Fahrten möglichst am selben Tag („zeitnah“). Nach ${FB.FESTSCHREIBEN_TAGE} Tagen wird jede Fahrt festgeschrieben; spätere Korrekturen werden mit Grund protokolliert.</li>
          <li>Verworfene Fahrten verschwinden nicht, sondern bleiben als „verworfen“ mit Begründung im Protokoll.</li>
          <li>Export als PDF/CSV für Steuerberater und Finanzamt unter „⤓ Export“.</li>
        </ul>
      </div>
    </section>
  </div>`;
}
async function linksLaden(el) {
  const box = el.querySelector('#fb-links'); if (!box) return;
  if (!db.isCloud()) { box.innerHTML = '<p class="warn small">Nur mit Cloud-Anmeldung verfügbar.</p>'; return; }
  try {
    const k = await geheim(), b = basisUrl();
    const link = a => `${b}?k=${k}&a=${a}&lat=`;
    box.innerHTML = String(html`
      <div class="fb-link"><span>Start-Link (CarPlay verbindet)</span><code>${link('start')}<i>[Breitengrad]</i>&amp;lon=<i>[Längengrad]</i></code><button type="button" class="btn small" data-kopie="${link('start')}">Kopieren</button></div>
      <div class="fb-link"><span>Ziel-Link (CarPlay trennt)</span><code>${link('ende')}<i>[Breitengrad]</i>&amp;lon=<i>[Längengrad]</i></code><button type="button" class="btn small" data-kopie="${link('ende')}">Kopieren</button></div>
      <p class="small"><button type="button" class="btn ghost small" id="fb-test">Verbindung testen</button> <button type="button" class="btn ghost small" id="fb-neuerschluessel">Neuen Schlüssel erzeugen</button> <span id="fb-teststat" class="muted"></span></p>`);
    box.querySelectorAll('[data-kopie]').forEach(bt => bt.onclick = async () => {
      // Für die Kurzbefehle-App: Link bis „lat=“; danach Variable Breitengrad, „&lon=“, Variable Längengrad
      try { await navigator.clipboard.writeText(bt.dataset.kopie); haptik('erfolg'); toast('Kopiert – im Kurzbefehl hinten Breitengrad, „&lon=“ und Längengrad ergänzen'); } catch { toast('Kopieren nicht möglich – Link bitte markieren', 'err'); }
    });
    box.querySelector('#fb-test').onclick = async () => {
      const s = box.querySelector('#fb-teststat'); s.textContent = 'teste …';
      try { const r = await strecke('Hof', 'Oberkotzau'); s.textContent = `✅ Server erreichbar · Testroute Hof → Oberkotzau: ${num(r.km, 1)} km`; } catch (e) { s.textContent = '❌ ' + e.message; }
    };
    box.querySelector('#fb-neuerschluessel').onclick = async () => {
      if (!await confirmDlg('Neuen Schlüssel erzeugen? Die bisherigen Kurzbefehle funktionieren dann nicht mehr und müssen den neuen Link bekommen.')) return;
      await geheim(true); linksLaden(el); toast('Neuer Schlüssel erzeugt');
    };
  } catch (e) {
    box.innerHTML = String(html`<p class="warn small">Der Fahrten-Server ist noch nicht eingerichtet (${e.message}). Das richtet Claude für dich ein.</p>`);
  }
}

// ---------------------------------------------------------------- Fahrt eintragen (von Hand, auch rückwirkend)
export function fahrtEintragen(vorlage = {}) {
  const fz = FB.fahrzeug(), props = db.all('properties'), ziele = FB.haeufigeZiele();
  let berechnet = vorlage.vonPunkt?.lat != null && vorlage.nachPunkt?.lat != null ? { von: vorlage.vonPunkt, nach: vorlage.nachPunkt, km: vorlage.km, min: null } : null;
  modal('Fahrt eintragen', html`
    <p class="full muted small">Für Fahrten ohne CarPlay-Aufzeichnung – auch rückwirkend (z. B. vor Start der Automatik). Die Strecke wird berechnet, du kannst sie anpassen.</p>
    ${ziele.length ? html`<div class="full"><span class="fb-lbl">Häufige Ziele</span><div class="chips fb-ziele">${ziele.map((x, i) => html`<button type="button" class="chip" data-ziel="${i}">${x.text}<small> · ${num(x.kmTyp, 0)} km</small></button>`)}</div></div>` : ''}
    <label class="f"><span>Datum</span><input name="datum" type="date" value="${today()}" required></label>
    <label class="f"><span>Abfahrt (Uhrzeit, optional)</span><input name="zeit" type="time"></label>
    <label class="f full"><span>Von</span><input name="von" value="${vorlage.von || (fz.zuhause ? 'Zuhause' : '')}" placeholder="Adresse oder Ort" required></label>
    <label class="f full"><span>Nach</span><input name="nach" value="${vorlage.nach || ''}" placeholder="Adresse, Ort oder Kontakt" required list="fb-orte"></label>
    <datalist id="fb-orte">${[...props.filter(p => p.strasse).map(p => [p.strasse, p.plz, p.ort].filter(Boolean).join(', ')), ...db.all('contacts').filter(c => c.strasse && c.ort).slice(0, 300).map(c => [c.strasse, c.plz, c.ort].filter(Boolean).join(', '))].map(x => html`<option value="${x}">`)}</datalist>
    <label class="f"><span>Kilometer (einfach)</span><input name="km" inputmode="decimal" value="${vorlage.km ? String(vorlage.km).replace('.', ',') : ''}" placeholder="wird berechnet"></label>
    <div class="f"><span>&nbsp;</span><button type="button" class="btn" id="fb-ber">km berechnen</button></div>
    <details class="full fb-mehr"><summary>Kilometerstand vom Tacho (optional)</summary><div class="fb-felder">
      <label class="f"><span>km-Stand Beginn</span><input name="kmStart" inputmode="numeric"></label>
      <label class="f"><span>km-Stand Ende</span><input name="kmEnde" inputmode="numeric"></label></div></details>
    <p class="full fb-lbl">Bewertung</p>
    ${artWahl(vorlage.art || 'geschaeftlich')}
    <label class="f full"><span>Anlass / Reisezweck</span><input name="zweck" list="fb-zwecke" value="${vorlage.zweck || ''}"></label>
    <label class="f"><span>Geschäftspartner</span><input name="partner" list="fb-partner" value="${vorlage.partner || ''}"></label>
    ${props.length ? html`<label class="f"><span>Objekt</span><select name="propertyId"><option value=""></option>${props.map(p => html`<option value="${p.id}" ${p.id === vorlage.propertyId ? raw('selected') : ''}>${p.nr ? p.nr + ' · ' : ''}${p.titel}</option>`)}</select></label>` : ''}
    <label class="f full chk"><input type="checkbox" name="hinzurueck" checked><span>Hin- und Rückfahrt (zwei Fahrten)</span></label>
    <label class="f full chk"><input type="checkbox" name="mehrtage"><span>Gleiche Fahrt an weiteren Tagen</span></label>
    <div class="full fb-tage" hidden><div class="fb-tagliste"></div><button type="button" class="btn ghost small" id="fb-tag-plus">+ Tag</button></div>
    <p class="full muted small" id="fb-berstat"></p>`, {
    wide: true, saveLabel: 'Eintragen',
    onMount: m => {
      artWahlBinden(m);
      const q = n => m.querySelector(`[name=${n}]`), st = m.querySelector('#fb-berstat');
      const punkt = t => t.trim().toLowerCase() === 'zuhause' && fz.zuhause ? fz.zuhause : t;
      const rechnen = async () => {
        if (!q('von').value.trim() || !q('nach').value.trim()) return;
        st.textContent = 'berechne Strecke …';
        try { berechnet = await strecke(punkt(q('von').value), punkt(q('nach').value)); q('km').value = String(berechnet.km).replace('.', ','); st.textContent = `${berechnet.von.adresse || q('von').value} → ${berechnet.nach.adresse}: ${num(berechnet.km, 1)} km, ca. ${berechnet.min} min`; }
        catch (e) { st.textContent = '⚠️ ' + e.message + ' – Kilometer bitte selbst eintragen.'; }
      };
      m.querySelector('#fb-ber').onclick = rechnen;
      q('nach').addEventListener('change', () => { berechnet = null; if (!q('km').value) rechnen(); });
      q('von').addEventListener('change', () => { berechnet = null; });
      m.querySelectorAll('[data-ziel]').forEach(b => b.onclick = () => {
        const x = ziele[+b.dataset.ziel]; haptik('leicht');
        q('nach').value = x.text; q('km').value = String(x.kmTyp).replace('.', ',');
        berechnet = x.punkt ? { von: fz.zuhause || null, nach: { ...x.punkt, adresse: x.text }, km: x.kmTyp, min: null } : null;
        if (x.zweck && !q('zweck').value) q('zweck').value = x.zweck;
        if (x.partner && !q('partner').value) q('partner').value = x.partner;
        const r = m.querySelector(`.fb-arten input[value="${x.art}"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
        st.textContent = `${x.text}: zuletzt ${num(x.kmTyp, 1)} km (${x.n}× gefahren)`;
      });
      const liste = m.querySelector('.fb-tagliste');
      const tagDazu = () => { const i = document.createElement('input'); i.type = 'date'; i.className = 'fb-tag'; i.setAttribute('aria-label', 'weiterer Tag'); liste.appendChild(i); i.focus(); };
      q('mehrtage').onchange = () => { m.querySelector('.fb-tage').hidden = !q('mehrtage').checked; if (q('mehrtage').checked && !liste.children.length) tagDazu(); };
      m.querySelector('#fb-tag-plus').onclick = tagDazu;
    },
    onSave: async (v, _close, form) => {
      const kmW = FB.zahl(v.km), kS = FB.zahl(v.kmStart), kE = FB.zahl(v.kmEnde);
      if (!kmW && !(kS != null && kE != null && kE > kS)) { toast('Bitte Kilometer eintragen oder berechnen lassen', 'err'); return false; }
      if (v.art === 'geschaeftlich' && !v.zweck.trim()) { toast('Bitte den Anlass der Geschäftsfahrt angeben', 'err'); return false; }
      const c = v.partner ? db.all('contacts').find(x => fullName(x).toLowerCase() === v.partner.trim().toLowerCase()) : null;
      const vonP = v.von.trim().toLowerCase() === 'zuhause' && fz.zuhause ? { ...fz.zuhause, adresse: 'Zuhause' } : berechnet?.von || null;
      const nachP = berechnet?.nach || null;
      const tage = [v.datum, ...[...form.querySelectorAll('.fb-tag')].map(i => i.value).filter(Boolean)].filter((d, i, a) => d && a.indexOf(d) === i);
      const basis = { art: v.art, partner: v.partner, contactId: c?.id || '', propertyId: v.propertyId || '', kmWert: kmW ?? '', minRoute: berechnet?.min || null };
      try {
        let n = 0;
        for (const d of tage) {
          await FB.nachtragen({ ...basis, datum: d, zeit: d === v.datum ? v.zeit : '', zweck: v.zweck, von: v.von.trim(), nach: v.nach.trim(), vonPunkt: vonP, nachPunkt: nachP, kmStart: d === v.datum ? v.kmStart : '', kmEnde: d === v.datum ? v.kmEnde : '', kmWert: kmW ?? (d === v.datum ? '' : kE - kS) }); n++;
          if (v.hinzurueck) { await FB.nachtragen({ ...basis, datum: d, zeit: '', zweck: v.art === 'geschaeftlich' ? `Rückfahrt: ${v.zweck}` : v.zweck, von: v.nach.trim(), nach: v.von.trim(), vonPunkt: nachP, nachPunkt: vonP, kmWert: kmW ?? (kE - kS) }); n++; }
        }
        haptik('erfolg'); toast(n === 1 ? 'Fahrt eingetragen' : `${n} Fahrten eingetragen`);
      } catch (e) { toast(e.message, 'err'); return false; }
    },
  });
}

// ---------------------------------------------------------------- myOpel-Import
const AKTION = { neu: ['Neu', 'neu'], ergaenzen: ['km-Stand ergänzt', 'erg'], doppelt: ['schon da', 'dop'] };
export function opelImport() {
  let plan = null;
  modal('myOpel-Fahrtbericht importieren', html`
    <ol class="full fb-anl small"><li>myOpel-App → <b>Fahren</b> → <b>Fahrten</b> (My Trip Report) → Zeitraum wählen (z. B. Monat)</li><li><b>Teilen / Herunterladen</b> und in „Dateien“ sichern – oder einfach Screenshots der Fahrtenliste machen</li><li>Hier auswählen (mehrere Dateien/Screenshots gehen auf einmal)</li></ol>
    <label class="f full fb-drop"><span>Bericht (CSV, PDF oder Screenshots)</span><input type="file" name="dateien" multiple accept=".csv,.txt,.tsv,.json,.pdf,image/*,application/pdf,text/csv"></label>
    <div class="full" id="fb-opel-vorschau"></div>`, {
    wide: true, saveLabel: 'Auslesen',
    onSave: async (_v, _close, form) => {
      const box = form.querySelector('#fb-opel-vorschau'), knopf = form.querySelector('footer .btn.primary');
      if (plan) {
        try { const r = await OPEL.uebernehmen(plan.filter(o => o.aktion !== 'doppelt'));
          toast(`myOpel: ${r.neu} neue Fahrt${r.neu === 1 ? '' : 'en'}, ${r.ergaenzt} ergänzt${r.staende ? `, ${r.staende} Kilometerstand${r.staende > 1 ? 'stände' : ''}` : ''}`, 'ok');
          if (r.neu) { z.wahl = 'benennen'; }
        } catch (e) { toast(e.message, 'err'); return false; }
        return;
      }
      const files = [...form.querySelector('[name=dateien]').files];
      if (!files.length) { toast('Bitte Bericht oder Screenshots auswählen', 'err'); return false; }
      box.innerHTML = '<p class="muted">⏳ KI liest den Bericht …</p>'; knopf.disabled = true;
      try {
        const liste = await OPEL.auslesen(files);
        if (!liste.length) { box.innerHTML = '<p class="warn">Keine Fahrten erkannt – bitte die Fahrtenliste (mit Datum, Uhrzeit und km) teilen oder abfotografieren.</p>'; return false; }
        plan = OPEL.planen(liste);
        const n = k => plan.filter(o => o.aktion === k).length;
        box.innerHTML = String(html`<p><b>${plan.length} Fahrten erkannt</b> · ${n('neu')} neu · ${n('ergaenzen')} passen zu vorhandenen Fahrten (Kilometerstand wird ergänzt)${n('doppelt') ? ` · ${n('doppelt')} schon importiert` : ''}</p>
          <div class="fb-opel-tbl"><table class="tbl"><thead><tr><th>Datum</th><th>Zeit</th><th>Strecke</th><th class="r">km</th><th class="r">km-Stand</th><th></th></tr></thead><tbody>
          ${plan.map(o => html`<tr class="${AKTION[o.aktion][1]}"><td>${fmtDate(o.datum)}</td><td>${o.start}${o.ende ? '–' + o.ende : ''}</td><td>${o.von || '?'} → ${o.nach || '?'}</td><td class="r">${num(o.km, 1)}</td><td class="r">${o.kmStandEnde != null ? num(o.kmStandEnde) : '–'}</td><td><span class="fb-q ${AKTION[o.aktion][1] === 'neu' ? 'vertrag' : AKTION[o.aktion][1] === 'erg' ? 'beleg' : ''}">${AKTION[o.aktion][0]}</span></td></tr>`)}
          </tbody></table></div>`);
        knopf.textContent = plan.some(o => o.aktion !== 'doppelt') ? `${plan.filter(o => o.aktion !== 'doppelt').length} übernehmen` : 'Schließen';
        if (!plan.some(o => o.aktion !== 'doppelt')) plan = [];
      } catch (e) { box.innerHTML = String(html`<p class="warn">⚠️ ${e.message}</p>`); }
      finally { knopf.disabled = false; }
      return false;
    },
  });
}

// ---------------------------------------------------------------- Export (PDF zum Drucken + CSV)
function exportMenue() {
  modal(`Fahrtenbuch ${z.jahr} exportieren`, html`<div class="full quickgrid">
    <button type="button" class="btn big" data-x="pdf">🖨 PDF / Drucken</button>
    <button type="button" class="btn big" data-x="csv">⤓ CSV (Excel, Steuerberater)</button></div>
    <p class="full muted small">Enthält alle Fahrten ${z.jahr} mit Datum, Uhrzeit, Start, Ziel, Kilometern, Art, Anlass und Geschäftspartner, dazu Summen, Kostenrechnung und das Änderungsprotokoll.</p>`, {
    onMount: (m, close) => m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { close(); b.dataset.x === 'pdf' ? druck() : csv(); }),
  });
}
const exportZeilen = () => FB.imJahr(z.jahr).concat((db.all('fahrten') || []).filter(f => f.status === 'verworfen' && FB.tag(f).startsWith(z.jahr) && !f.teilVon)).sort((a, b) => FB.beginn(a).localeCompare(FB.beginn(b)));
function csv() {
  download(`fahrtenbuch-${z.jahr}.csv`, toCSV(exportZeilen(), [
    [f => fmtDate(FB.tag(f)), 'Datum'], [f => f.start?.zeitUnbekannt ? '' : uhr(f.start?.zeit), 'Abfahrt'], [f => f.ende?.zeitUnbekannt ? '' : uhr(f.ende?.zeit), 'Ankunft'],
    [f => FB.vonText(f, ''), 'Start'], [f => FB.nachText(f, ''), 'Ziel'], [f => f.ende?.adresse || '', 'Zieladresse'], [f => f.umweg || (f.zwischenhalt || []).join(' / '), 'Route/Umweg'],
    [f => String(FB.km(f)).replace('.', ','), 'km'], [f => f.kmStart ?? '', 'km-Stand Beginn'], [f => f.kmEnde ?? '', 'km-Stand Ende'],
    [f => f.status === 'verworfen' ? 'verworfen' : FB.ARTEN[f.art]?.name || 'nicht benannt', 'Art'], [f => f.status === 'verworfen' ? f.verworfenGrund : (f.zweck || ''), 'Reisezweck'], [f => f.partner || '', 'Geschäftspartner'],
    [f => f.erfasstAm ? fmtDT(f.erfasstAm) : '', 'Benannt am'], [f => (f.historie || []).map(h => `${fmtDT(h.zeit)}: ${h.grund || 'Änderung'} (${Object.entries(h.felder || {}).map(([k, [a, b]]) => `${k} ${a}→${b}`).join(', ')})`).join(' | '), 'Änderungen'],
  ]), 'text/csv');
}
function druck() {
  const A = FB.auswertung(z.jahr), S = db.settings(), fz = FB.fahrzeug(), rows = exportZeilen();
  const w = window.open('', '_blank'); if (!w) { toast('Pop-up blockiert – bitte erlauben', 'err'); return; }
  const e = esc;
  w.document.write(`<!doctype html><html lang="de"><meta charset="utf-8"><title>Fahrtenbuch ${e(z.jahr)} – ${e(fz.kennzeichen || fz.name || '')}</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font:10.5px/1.4 Helvetica,Arial,sans-serif;color:#14110d;margin:0;padding:18px}
    h1{font-size:20px;margin:0 0 2px}h2{font-size:13px;margin:18px 0 6px;color:#9c7f4d}.meta{color:#555;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#9c7f4d;border-bottom:1px solid #a8813f;padding:5px 4px}td{padding:4px;border-bottom:.5px solid #ddd;vertical-align:top}
    td.r,th.r{text-align:right;white-space:nowrap}tr.v td{color:#999;text-decoration:line-through}tr.v td.g{text-decoration:none}.sum td{font-weight:600;border-top:1px solid #a8813f}
    .box{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.box div{border:.5px solid #cbbd9f;border-radius:6px;padding:8px}.box b{display:block;font-size:14px}
    .klein{color:#666;font-size:9.5px}.noprint{position:fixed;top:10px;right:10px}.noprint button{font:inherit;background:#c9a96e;border:0;padding:7px 14px;border-radius:6px;cursor:pointer}@media print{.noprint{display:none}body{padding:0}}
  </style><body><div class="noprint"><button type="button" class="druckknopf">Drucken / als PDF speichern</button></div>
  <h1>Fahrtenbuch ${e(z.jahr)}</h1>
  <div class="meta">${e(S.firma || '')} · ${e(S.inhaber || '')} · Fahrzeug: ${e(fz.name || '–')} ${fz.kennzeichen ? '· Kennzeichen ' + e(fz.kennzeichen) : ''} · ${fz.vermoegen === 'betrieb' ? 'Betriebsvermögen' : 'Privatfahrzeug, betrieblich mitgenutzt'} · erstellt ${e(fmtDT(new Date().toISOString()))}</div>
  <div class="box"><div>Geschäftlich<b>${e(kmTxt(A.kmG))}</b></div><div>Privat${A.nichtErfasst ? ' (inkl. nicht aufgezeichnet)' : ''}<b>${e(kmTxt(A.kmP + A.nichtErfasst))}</b></div><div>Wohnung ↔ Betrieb<b>${e(kmTxt(A.kmA))}</b></div><div>Anteil geschäftlich<b>${e(pct(A.anteil * 100, 1))}</b></div></div>
  <table><thead><tr><th>Datum</th><th>Zeit</th><th>Start</th><th>Ziel</th><th>Route/Umweg</th><th class="r">km</th><th class="r">km-Stand</th><th>Art</th><th>Reisezweck</th><th>Geschäftspartner</th><th>benannt</th></tr></thead><tbody>
  ${rows.map(f => `<tr class="${f.status === 'verworfen' ? 'v' : ''}"><td>${e(fmtDate(FB.tag(f)))}</td><td>${e(zeiten(f).replace(' Uhr', ''))}</td><td>${e(FB.vonText(f, ''))}</td><td>${e(f.ziel ? f.ziel + (f.ende?.adresse && f.ziel !== f.ende.adresse ? ' – ' + f.ende.adresse : '') : FB.ortName(f.ende))}</td><td>${e(f.umweg || (f.zwischenhalt || []).join(' / '))}</td><td class="r">${e(num(FB.km(f), 1))}</td><td class="r">${f.kmStart != null && f.kmStart !== '' ? e(num(f.kmStart)) + '–' + e(num(f.kmEnde)) : ''}</td><td class="g">${e(f.status === 'verworfen' ? 'verworfen' : FB.ARTEN[f.art]?.name || 'offen')}</td><td class="g">${e(f.status === 'verworfen' ? f.verworfenGrund || '' : f.zweck || '')}</td><td>${e(f.partner || '')}</td><td class="klein">${e(f.erfasstAm ? fmtDT(f.erfasstAm) : '')}${(f.historie || []).length ? ' ✎' : ''}</td></tr>`).join('')}
  <tr class="sum"><td colspan="5">Summe ${e(z.jahr)}</td><td class="r">${e(num(A.kmErfasst, 1))}</td><td colspan="5"></td></tr></tbody></table>
  <h2>Kostenrechnung</h2>
  <table style="width:auto"><tbody>
    <tr><td>Gesamtfahrleistung ${e(z.jahr)}</td><td class="r">${e(kmTxt(A.kmGesamt))}</td></tr>
    ${(A.kZeitraum || A.kJahr).zeilen.filter(z => z.wert).map(z => `<tr><td>${e(z.name)} (${e(z.quelle)})</td><td class="r">${e(eur2(z.wert))}</td></tr>`).join('')}${(A.kZeitraum || A.kJahr).sonstige ? `<tr><td>Sonstige Kfz-Belege</td><td class="r">${e(eur2((A.kZeitraum || A.kJahr).sonstige))}</td></tr>` : ''}${(A.kZeitraum || A.kJahr).afa ? `<tr><td>AfA</td><td class="r">${e(eur2((A.kZeitraum || A.kJahr).afa))}</td></tr>` : ''}
    <tr><td>Kosten je km${A.odo ? ` (Kosten ${e(fmtDate(A.odo.von.datum))}–${e(fmtDate(A.odo.bis.datum))}: ${e(eur2(A.kostenZeitraum))} ÷ ${e(num(A.odo.km))} km lt. Tacho)` : ' (ohne Kilometerstände nicht berechenbar)'}</td><td class="r">${e(A.proKm ? eur2(A.proKm) : '–')}</td></tr>
    <tr><td>Geschäftsfahrten × 0,30 €/km</td><td class="r">${e(eur2(A.pauschal))}</td></tr><tr><td>Geschäftsfahrten × tatsächliche Kosten je km</td><td class="r">${e(eur2(A.tatsaechlich))}</td></tr>
    ${A.arbeitsweg ? `<tr><td>Wohnung ↔ Betrieb: ${A.tage} Tage × ${e(num(A.entf, 1))} km × ${e(String(FB.entfernungssatz(z.jahr, A.entf)).replace('.', ','))} €</td><td class="r">${e(eur2(A.arbeitsweg))}</td></tr>` : ''}
    ${A.kZusatz ? `<tr><td>Parken, Maut u. ä. an Geschäftstagen</td><td class="r">${e(eur2(A.kZusatz))}</td></tr>` : ''}
    <tr class="sum"><td>Abziehbare Fahrtkosten (${A.methode === 'pauschal' ? 'Kilometerpauschale' : 'tatsächliche Kosten'})</td><td class="r">${e(eur2(A.absetzbar))}</td></tr></tbody></table>
  <p class="klein">Aufzeichnung: Start und Ziel automatisch per GPS beim Verbinden/Trennen von CarPlay (Uhrzeit vom Server), Strecke per Routenberechnung bzw. Kilometerstand; Art, Anlass und Geschäftspartner zeitnah ergänzt. Fahrten werden ${FB.FESTSCHREIBEN_TAGE} Tage nach Erfassung festgeschrieben; spätere Änderungen sind mit Zeitpunkt und Grund protokolliert (✎). Verworfene Fahrten sind durchgestrichen mit Begründung aufgeführt.</p>
  ${rows.some(f => (f.historie || []).length) ? `<h2>Änderungsprotokoll</h2><table><thead><tr><th>Fahrt</th><th>Geändert am</th><th>Grund</th><th>Änderung</th></tr></thead><tbody>${rows.flatMap(f => (f.historie || []).map(h => `<tr><td>${e(fmtDate(FB.tag(f)))} ${e(FB.vonText(f, ''))} → ${e(FB.nachText(f, ''))}</td><td>${e(fmtDT(h.zeit))}</td><td>${e(h.grund || '')}</td><td>${e(Object.entries(h.felder || {}).map(([k, [a, b]]) => `${k}: „${a}“ → „${b}“`).join('; '))}</td></tr>`)).join('')}</tbody></table>` : ''}
  </body></html>`);
  w.document.close(); w.document.querySelector('.druckknopf')?.addEventListener('click', () => w.print());
}

// ---------------------------------------------------------------- Ereignisse
function binden(el) {
  el.querySelector('#fb-jahr').onchange = e => { z.jahr = e.target.value; render(el); };
  el.querySelector('#fb-neu').onclick = () => fahrtEintragen();
  el.querySelectorAll('[data-eintragen]').forEach(b => b.onclick = () => fahrtEintragen());
  el.querySelector('#fb-auswahl')?.addEventListener('click', () => { z.auswahl = !z.auswahl; z.gewaehlt.clear(); render(el); });
  el.querySelectorAll('[data-sel]').forEach(c => { c.onclick = e => e.stopPropagation(); c.onchange = () => { c.checked ? z.gewaehlt.add(c.dataset.sel) : z.gewaehlt.delete(c.dataset.sel); render(el); }; });
  el.querySelectorAll('[data-massen]').forEach(b => b.onclick = () => bewertenDlg([...z.gewaehlt], b.dataset.massen));
  el.querySelectorAll('[data-artwahl]').forEach(b => b.onclick = e => { e.stopPropagation(); haptik('leicht'); bewertenDlg([b.dataset.artwahl]); });
  el.querySelector('#fb-export').onclick = exportMenue;
  el.querySelectorAll('#fb-opel, [data-opel]').forEach(b => b.onclick = opelImport);
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { haptik('leicht'); z.wahl = b.dataset.tab; if (location.hash !== '#/fahrten/' + z.wahl) history.replaceState(null, '', '#/fahrten/' + z.wahl); render(el); });
  el.querySelectorAll('#fb-auto, [data-autoform]').forEach(b => b.onclick = autoForm);
  el.querySelector('#fb-foto')?.addEventListener('click', fotoWaehlen);
  el.querySelector('#fb-kosten')?.addEventListener('click', kostenForm);
  fotoLaden(el);
  el.querySelectorAll('#fb-kmstand').forEach(b => b.onclick = () => kmStandForm());
  el.querySelectorAll('[data-erfassen]').forEach(b => b.onclick = () => { haptik('leicht'); kostenErfassen(b.dataset.erfassen); });
  el.querySelectorAll('[data-check]').forEach(b => b.onclick = () => { const a = b.dataset.check; if (a === 'km') kmStandForm(b.dataset.datum); else if (a === 'auto') autoForm(); else if (a === 'posten') kostenForm(); else kostenErfassen('tanken'); });
  el.querySelector('#fb-allebelege')?.addEventListener('click', () => { z.alleBelege = !z.alleBelege; render(el); });
  el.querySelector('#fb-beleg')?.addEventListener('click', () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,application/pdf'; i.multiple = true; i.onchange = async () => { if (i.files.length) { const { belegeHochladen } = await import('./finanzen.js'); belegeHochladen(i.files); } }; i.click(); });
  el.querySelectorAll('[data-beleg]').forEach(b => b.onclick = () => belegAnsehen(b.dataset.beleg));
  el.querySelectorAll('[data-kmweg]').forEach(b => b.onclick = async () => { if (!await confirmDlg('Kilometerstand löschen?')) return; const fz = FB.fahrzeug(); await FB.fahrzeugSpeichern({ kmStaende: (fz.kmStaende || []).filter(s => s.id !== b.dataset.kmweg) }); });
  if (z.tab === 'einrichten') linksLaden(el);
  // Karten: Art wählen, Vorschlag übernehmen, speichern
  el.querySelectorAll('.fb-karte').forEach(card => {
    const setArt = a => { card.dataset.art = a; card.querySelectorAll('[data-a]').forEach(b => { b.classList.toggle('on', b.dataset.a === a); b.setAttribute('aria-pressed', b.dataset.a === a); }); };
    card.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { haptik('leicht'); setArt(b.dataset.a); if (b.dataset.a === 'geschaeftlich') card.querySelector('[name=zweck]').focus({ preventScroll: true }); });
    card.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      haptik('leicht'); const v = JSON.parse(b.dataset.json);
      card.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x === b));
      setArt(v.art); const set = (n, w) => { const i = card.querySelector(`[name=${n}]`); if (i) i.value = w || ''; };
      set('zweck', v.zweck); set('partner', v.partner); set('contactId', v.contactId); set('propertyId', v.propertyId); set('ziel', v.ziel);
    });
    card.querySelector('[data-speichern]').onclick = () => karteSpeichern(card);
    card.querySelector('[data-privat]').onclick = () => karteSpeichern(card, 'privat');
    card.querySelector('[data-mehr]').onclick = () => detail(db.get('fahrten', card.dataset.f));
    card.querySelector('[name=zweck]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); karteSpeichern(card); } });
  });
  el.querySelector('#fb-allprivat')?.addEventListener('click', async () => {
    const o = FB.offene(); if (!await confirmDlg(`${o.length} Fahrten als privat markieren?`)) return;
    for (const f of o) await FB.erfassen(f, { art: 'privat', zweck: 'Privatfahrt' });
    toast(`${o.length} Fahrten als privat gespeichert`);
  });
  el.querySelectorAll('[data-detail]').forEach(r => { const auf = () => { if (z.auswahl) { const c = r.querySelector('[data-sel]'); c.checked = !c.checked; c.onchange(); return; } detail(db.get('fahrten', r.dataset.detail)); }; r.onclick = auf; r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); auf(); } }; });
}
export const offenAnzahl = () => FB.offene().length;
