// Angebote: persönliche Modellrechnung für einen Kunden – eine Wohnung oder mehrere als Paket – im Keuerleber-Design.
// Kunde wählen, Vertriebsobjekte anhaken, Konditionen anpassen; rechts die Live-Vorschau mit den Schiebereglern.
// Ausgabe: Präsentieren (eigenes Fenster) oder als eigenständige HTML-Datei speichern (alles eingebettet).
import * as db from '../db.js';
import { html, raw, modal, toast, confirmDlg, fmtDate, fullName, uid } from '../util.js';
import { haptik } from '../haptik.js';
import * as U from '../unterlagen.js';

const z = { id: '', a: null, el: null, bilder: new Map(), sendeT: 0 };
const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const erste = (...w) => { for (const x of w) { const n = num(x); if (n != null && n > 0) return n; } return 0; };
const de = (n, d = 2) => n == null || n === '' ? '' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: d });
const eur = n => Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';
const terminText = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const etageKurz = e => String(e || '').replace(/Obergeschoss/i, 'OG').replace(/Erdgeschoss/i, 'EG').replace(/Dachgeschoss/i, 'DG').trim();
const STANDARD = { st: 42, ek: 20, tilg: 1, nk: 5.5, zins: 4.5 };
const FELDER = [['kp', 'Kaufpreis €', 0], ['miete', 'Kaltmiete €', 2], ['nu', 'Hausgeld n. uml. €', 2], ['hg', 'Hausgeld ges. €', 2], ['zins', 'Zins %', 2], ['afa', 'AfA %', 2], ['geb', 'Gebäude %', 0]];

/** Objekte im Vertrieb (Kauf, nicht archiviert/verkauft) */
export const vertriebsObjekte = () => db.all('properties').filter(p => (p.vermarktung || 'Kauf') === 'Kauf' && !['Archiv', 'Verkauft / Vermietet'].includes(p.status)).sort((a, b) => (a.nr || '').localeCompare(b.nr || ''));
/** Konditionen eines Objekts: zuerst die fürs Angebot gespeicherten (property.angebot), sonst Kalkulation / Exposé */
export function objektWerte(p) {
  const ex = p.exposeId ? db.get('exposes', p.exposeId) : null, o = ex?.objekt || {}, A = p.angebot || {};
  const verm = A.verm ?? (/vermietet/i.test(o.vermietung_status || o.vermietung || '') && !/unvermietet/i.test(o.vermietung_status || o.vermietung || ''));
  const afa = erste(A.afa, p.kalkAfa, o.afa_satz, o.restnutzungsdauer ? 100 / o.restnutzungsdauer : 0) || 2;
  const text = String(p.beschreibung || '').split(/\n/)[0].trim();
  return {
    id: p.id, n: p.strasse || p.titel || 'Wohnung', e: etageKurz(A.e || p.etage || o.etage), plzOrt: [p.plz, p.ort].filter(Boolean).join(' '),
    t: A.t || p.titel || '', d: A.d || (text.length > 260 ? text.slice(0, text.lastIndexOf('.', 260) + 1) || text.slice(0, 260) : text) || o.tagline || '',
    qm: erste(A.qm, p.flaeche, o.wohnflaeche), zi: erste(p.zimmer, o.zimmer), bj: p.baujahr || o.baujahr || '',
    kp: erste(p.preis), miete: erste(A.miete, p.kalkMiete, o.kaltmiete), nu: erste(A.nu, p.kalkHg, o.hausgeld_nicht_umlagefaehig), hg: erste(A.hg, p.hausgeld, o.hausgeld),
    zins: erste(A.zins, db.settings().angebot?.zins, STANDARD.zins), afa: Math.round(afa * 100) / 100, geb: erste(A.geb, p.kalkGeb) || 80,
    gut: A.gut ?? !!p.kalkGutachten, verm, stat: A.stat || (verm ? 'Vermietet' : 'Unvermietet, sofort frei'), mn: A.mn || (verm ? 'Kaltmiete' : 'Kaltmiete (angesetzt)'),
    en: p.eKlasse || o.energie?.klasse || '', pl: A.pl || String(p.ausstattung || '').split(';').map(x => x.trim()).filter(x => x && x.length < 34 && !/provision|afa|gutachten|energie|baujahr|unvermietet|vermietet/i.test(x)).slice(0, 5),
  };
}

// ---------------------------------------------------------------- Bilder (aus dem Exposé, dem Titelbild und den Foto-Unterlagen)
const klein = (quelle, max = 1200, q = 0.74) => new Promise(ok => {
  const i = new Image(); i.crossOrigin = 'anonymous';
  i.onload = () => { const s = Math.min(1, max / Math.max(i.naturalWidth, i.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(i.naturalWidth * s); c.height = Math.round(i.naturalHeight * s); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); try { ok(c.toDataURL('image/jpeg', q)); } catch { ok(''); } };
  i.onerror = () => ok(''); i.src = quelle;
});
/** Verfügbare Bilder eines Objekts: [{ k, name, plan, laden() → dataUrl }] – k ist der Schlüssel, der im Angebot gespeichert wird */
function bildQuellen(p) {
  const out = [], ex = p.exposeId ? db.get('exposes', p.exposeId) : null;
  if (p.bildIntern) out.push({ k: 'titel', name: 'Titelbild', plan: false, laden: () => klein(p.bildIntern) });
  if (ex) {
    const B = ex.bilder || {}, reihe = [B.titel, ...(B.seite1 || []), ...(B.seite2 || []), ...(B.galerie || []), ...(B.seite4 || [])].filter(Boolean);
    const L = [...(ex.images || [])].filter(i => !i.karte && i.id !== B.energieausweis_bild).sort((a, b) => (reihe.indexOf(a.id) < 0 ? 99 : reihe.indexOf(a.id)) - (reihe.indexOf(b.id) < 0 ? 99 : reihe.indexOf(b.id)));
    for (const i of L) out.push({ k: 'ex:' + i.id, name: i.caption || 'Bild', plan: !!i.plan, laden: async () => { const f = await db.getFile(`exp-${ex.id}-${i.id}`).catch(() => null); return f?.dataUrl ? klein(f.dataUrl) : ''; } });
  }
  for (const u of U.liste(p.id).filter(u => u.kategorie === 'Fotos' && /\.(jpe?g|png|webp)$/i.test(u.name || ''))) out.push({ k: 'u:' + u.id, name: u.name, plan: false, laden: async () => { try { return await klein(await U.adresse(u, 600)); } catch { return ''; } } });
  return out;
}
async function bild(p, k) {
  const key = p.id + '|' + k; if (z.bilder.has(key)) return z.bilder.get(key);
  const q = bildQuellen(p).find(x => x.k === k), pr = q ? q.laden().then(src => src ? { src, plan: q.plan } : null) : Promise.resolve(null);
  z.bilder.set(key, pr); return pr;
}
const standardBilder = p => { const Q = bildQuellen(p), fotos = Q.filter(q => !q.plan), plan = Q.find(q => q.plan); return [...fotos.slice(0, plan ? 5 : 6), ...(plan ? [plan] : [])].map(q => q.k); };

// ---------------------------------------------------------------- Angebot ↔ Daten für die Ansicht
const absender = () => { const S = db.settings(); return { name: S.inhaber || 'Paul Keuerleber', titel: 'Immobilienkaufmann (IHK)', adresse: [S.strasse || 'Hauptstraße 12', [S.plz || '95145', S.ort || 'Oberkotzau'].join(' ')].join(' · '), tel: S.tel || '0151 67692176', email: S.email || 'paul.keuerleber@keuerleber-immobilien.de' }; };
/** vollständige Daten für angebot.js (mit geladenen Bildern, wenn mitBildern) */
async function daten(a, mitBildern = true) {
  const objs = [];
  for (const o of a.objs) {
    const p = db.get('properties', o.id); if (!p) continue;
    const im = mitBildern ? (await Promise.all((o.bilder || []).map(k => bild(p, k)))).filter(Boolean) : [];
    objs.push({ ...objektWerte(p), ...Object.fromEntries(Object.entries(o).filter(([k, v]) => k !== 'bilder' && v !== '' && v != null)), im });
  }
  return { id: a.id, stand: a.updated || '', name: a.name || 'Interessent', termin: terminText(a.termin), st: a.st, ek: a.ek, tilg: a.tilg, nk: a.nk, start: a.ansicht === 'paket' && objs.length > 1 ? 'paket' : 0, ort: objs[0]?.plzOrt?.replace(/^\d+\s*/, '') || 'Hof',
    hinweis: a.hinweis || '', logo: new URL('../../../logo/Wappen_gold.svg', import.meta.url).href, absender: absender(), objs, angepasst: a.aus && Object.keys(a.aus).length ? { aus: a.aus } : null };
}
let spT = 0, offen = false;
async function jetztSpeichern() { clearTimeout(spT); if (offen && z.a) { offen = false; z.a = await db.save('angebote', z.a); } }
const speichern = () => { offen = true; clearTimeout(spT); spT = setTimeout(jetztSpeichern, 450); };
window.addEventListener('hashchange', () => { jetztSpeichern(); });
window.addEventListener('pagehide', () => { jetztSpeichern(); });
function geaendert(senden = true) { speichern(); if (senden) { clearTimeout(z.sendeT); z.sendeT = setTimeout(sende, 250); } listeZeichnen(); }
async function sende() {
  const f = z.el?.querySelector('#ag-rahmen'); if (!f?.contentWindow || !z.a) return;
  if (!z.a.objs.length) { z.el.querySelector('#ag-leer').hidden = false; f.hidden = true; return; }
  z.el.querySelector('#ag-leer').hidden = true; f.hidden = false;
  const id = z.a.id, d = await daten(z.a); if (z.a?.id !== id) return;
  f.contentWindow.postMessage({ typ: 'angebot-daten', daten: d }, location.origin);
}
/** Anpassungen aus der Vorschau (Regler, Tabelle, Schalter) ins Angebot übernehmen */
function ausVorschau(s) {
  if (!z.a || !s) return; const a = z.a;
  if (s.name) a.name = s.name; for (const k of ['st', 'ek', 'tilg', 'nk']) if (Number.isFinite(s[k])) a[k] = s[k];
  a.aus = s.aus || {};
  for (const x of s.objs || []) { const o = a.objs.find(y => y.id === x.id); if (o) for (const k of ['kp', 'miete', 'nu', 'zins', 'afa', 'geb']) if (Number.isFinite(x[k])) o[k] = x[k]; }
  speichern(); felderFuellen();
}
let horcht = false;
function horche() {
  if (horcht) return; horcht = true;
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.typ === 'angebot-bereit') { if (z.el?.querySelector('#ag-rahmen')?.contentWindow === e.source) sende(); }
    else if (e.data.typ === 'angebot-stand' && z.a && e.data.id === z.a.id) ausVorschau(e.data.stand);
  });
}

// ---------------------------------------------------------------- Neu / Liste
async function neu(vorgabe = {}) {
  const S = db.settings().angebot || {};
  const a = await db.save('angebote', { id: 'ang-' + uid().slice(0, 12), name: '', contactId: '', termin: '', st: S.st ?? STANDARD.st, ek: S.ek ?? STANDARD.ek, tilg: S.tilg ?? STANDARD.tilg, nk: S.nk ?? STANDARD.nk, objs: [], aus: {}, ...vorgabe });
  location.hash = '#/angebote/' + a.id;
}
const titelVon = a => a.objs.length ? a.objs.map(o => { const p = db.get('properties', o.id); return p ? (p.strasse || p.titel) : 'gelöschtes Objekt'; }).join(' · ') : 'noch keine Wohnung gewählt';
function liste(el) {
  const L = [...(db.all('angebote') || [])].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  el.innerHTML = String(html`<div class="ag">
    <div class="head"><div><h1>Angebote</h1><p class="muted">Persönliche Modellrechnung für einen Kunden – eine Wohnung oder mehrere als Paket. Zum Zeigen im Termin oder als Datei zum Mitgeben.</p></div>
      <div class="actions"><button type="button" class="btn primary" id="ag-neu">+ Neues Angebot</button></div></div>
    ${L.length ? html`<div class="ag-liste">${L.map(a => html`<a class="card ag-karte" href="#/angebote/${a.id}">
        <span class="ag-art">${a.objs.length > 1 ? 'Angebot · ' + a.objs.length + ' Wohnungen' : 'Angebot'}</span>
        <b>${a.name || 'Ohne Namen'}</b><small class="muted">${titelVon(a)}</small>
        <small class="muted">${a.termin ? 'Termin ' + fmtDate(a.termin) + ' · ' : ''}geändert ${fmtDate((a.updated || a.created || '').slice(0, 10))}</small></a>`)}</div>`
      : html`<div class="card ag-leerliste"><h3>Noch kein Angebot</h3><p class="muted">Wähle einen Kunden und eine oder mehrere Wohnungen aus dem Vertrieb – das CRM baut daraus die Modellrechnung mit Steuerersparnis, monatlichem Ergebnis und Zehn-Jahres-Übersicht. Unten in der Vorschau passt du Steuersatz, Eigenkapital, Zins und Tilgung per Schieberegler auf die Person an.</p><button type="button" class="btn primary" id="ag-neu2">+ Erstes Angebot erstellen</button></div>`}
  </div>`);
  el.querySelectorAll('#ag-neu, #ag-neu2').forEach(b => b.onclick = () => neu());
}

// ---------------------------------------------------------------- Bearbeiten
function listeZeichnen() {
  const el = z.el?.querySelector('#ag-objs'); if (!el || !z.a) return;
  const gew = new Map(z.a.objs.map(o => [o.id, o])), P = vertriebsObjekte(), fehlt = z.a.objs.filter(o => !P.some(p => p.id === o.id)).map(o => db.get('properties', o.id)).filter(Boolean);
  el.innerHTML = String(html`${[...P, ...fehlt].map(p => { const w = objektWerte(p), an = gew.has(p.id), ok = w.kp > 0 && w.miete > 0; return html`<label class="ag-obj ${an ? 'an' : ''}">
    <input type="checkbox" data-obj="${p.id}" ${an ? raw('checked') : ''}>
    <span><b>${p.strasse || p.titel}${w.e ? ', ' + w.e : ''}</b><small>${[p.nr, w.zi ? w.zi + ' Zi.' : '', w.qm ? de(w.qm) + ' m²' : '', w.kp ? eur(w.kp) : 'ohne Kaufpreis', p.status].filter(Boolean).join(' · ')}</small>${ok ? '' : html`<small class="warn">Kaufpreis oder Miete fehlt – bitte unten eintragen</small>`}</span></label>`; })}
    ${P.length ? '' : html`<p class="muted small">Keine Objekte im Vertrieb. Lege unter „Objekte“ eine Wohnung mit Vermarktung „Kauf“ an.</p>`}`);
  el.querySelectorAll('[data-obj]').forEach(c => c.onchange = () => {
    const id = c.dataset.obj;
    if (c.checked) { const p = db.get('properties', id); z.a.objs.push({ id, bilder: standardBilder(p) }); } else { z.a.objs = z.a.objs.filter(o => o.id !== id); if (z.a.aus) delete z.a.aus[id]; }
    haptik('leicht'); tabelleZeichnen(); geaendert();
  });
  const n = z.a.objs.length; z.el.querySelector('.ag-ans').hidden = n < 2;
  z.el.querySelector('#ag-art').textContent = n > 1 ? `Angebot mit ${n} Wohnungen` : n === 1 ? 'Angebot für eine Wohnung' : 'Noch keine Wohnung gewählt';
  z.el.querySelectorAll('[data-braucht]').forEach(b => { b.disabled = !n; });
}
function tabelleZeichnen() {
  const el = z.el?.querySelector('#ag-tab'); if (!el || !z.a) return;
  if (!z.a.objs.length) { el.innerHTML = '<p class="muted small">Wähle oben mindestens eine Wohnung.</p>'; return; }
  el.innerHTML = String(html`${z.a.objs.map(o => { const p = db.get('properties', o.id); if (!p) return ''; const w = { ...objektWerte(p), ...o }, nB = (o.bilder || []).length; return html`<div class="ag-zeile" data-o="${o.id}">
      <div class="ag-zk"><b>${w.n}${w.e ? ', ' + w.e : ''}</b><span><button type="button" class="mini" data-bilder>🖼 ${nB} Bild${nB === 1 ? '' : 'er'}</button><button type="button" class="mini" data-texte>✎ Texte</button><button type="button" class="mini" data-merken title="Diese Konditionen als Standard für das Objekt speichern">Als Standard</button></span></div>
      <div class="ag-zf">${FELDER.map(([k, l, d]) => html`<label><span>${l}</span><input inputmode="decimal" data-k="${k}" value="${de(w[k], d || 2)}" aria-label="${w.n}: ${l}"></label>`)}
        <label><span>Gutachten</span><select data-k="gut"><option value="1" ${w.gut ? raw('selected') : ''}>liegt vor</option><option value="0" ${w.gut ? '' : raw('selected')}>in Vorbereitung</option></select></label>
        <label><span>Vermietung</span><select data-k="verm"><option value="1" ${w.verm ? raw('selected') : ''}>vermietet</option><option value="0" ${w.verm ? '' : raw('selected')}>unvermietet</option></select></label></div></div>`; })}`);
  el.querySelectorAll('.ag-zeile').forEach(zl => {
    const o = z.a.objs.find(x => x.id === zl.dataset.o), p = db.get('properties', o.id);
    zl.querySelectorAll('input[data-k]').forEach(i => i.oninput = () => { const v = window.KreAngebotZahl(i.value); i.classList.toggle('falsch', !(v >= 0) && i.value.trim() !== ''); if (v >= 0) { o[i.dataset.k] = v; geaendert(); } });
    zl.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { const an = s.value === '1'; o[s.dataset.k] = an; if (s.dataset.k === 'verm') { o.stat = an ? 'Vermietet' : 'Unvermietet, sofort frei'; o.mn = an ? 'Kaltmiete' : 'Kaltmiete (angesetzt)'; } geaendert(); });
    zl.querySelector('[data-bilder]').onclick = () => bilderDlg(p, o);
    zl.querySelector('[data-texte]').onclick = () => texteDlg(p, o);
    zl.querySelector('[data-merken]').onclick = async () => { const w = { ...objektWerte(p), ...o }; await db.save('properties', { ...db.get('properties', p.id), angebot: { ...(p.angebot || {}), miete: w.miete, nu: w.nu, hg: w.hg, zins: w.zins, afa: w.afa, geb: w.geb, gut: !!w.gut, verm: !!w.verm, stat: w.stat, mn: w.mn, t: w.t, d: w.d, pl: w.pl, e: w.e }, ...(w.kp && w.kp !== p.preis ? { preis: w.kp } : {}) }); toast(`Konditionen für ${w.n} als Standard gespeichert`); };
  });
}
/** Formularfelder aus z.a nachziehen (nach Änderungen in der Vorschau) – ohne das Feld anzufassen, in dem gerade getippt wird */
function felderFuellen() {
  const el = z.el; if (!el || !z.a) return; const a = z.a, akt = document.activeElement;
  const setz = (sel, v) => { const i = el.querySelector(sel); if (i && i !== akt && i.value !== String(v)) i.value = v; };
  setz('#ag-name', a.name || ''); for (const k of ['st', 'ek', 'tilg', 'nk']) setz(`[data-g="${k}"]`, de(a[k]));
  el.querySelectorAll('.ag-zeile').forEach(zl => { const o = a.objs.find(x => x.id === zl.dataset.o); if (!o) return; const w = { ...objektWerte(db.get('properties', o.id) || {}), ...o }; zl.querySelectorAll('input[data-k]').forEach(i => { if (i !== akt) { const d = FELDER.find(f => f[0] === i.dataset.k)[2]; const neu = de(w[i.dataset.k], d || 2); if (i.value !== neu) i.value = neu; } }); });
}
function bilderDlg(p, o) {
  const Q = bildQuellen(p), gew = new Set(o.bilder || []);
  modal('Bilder – ' + (p.strasse || p.titel), html`<p class="full muted small">Tippe die Bilder an, die im Angebot erscheinen sollen (höchstens 8). Das erste gewählte ist das Hauptbild.</p>
    <div class="full ag-bilder">${Q.map(q => html`<button type="button" class="${gew.has(q.k) ? 'an' : ''}" data-b="${q.k}" title="${q.name}"><span class="ag-bl">lädt …</span><i></i></button>`)}</div>
    ${Q.length ? '' : html`<p class="full muted">Zu diesem Objekt gibt es noch keine Bilder. Lade Fotos bei den Unterlagen hoch (Kategorie „Fotos“) oder setze ein Titelbild.</p>`}`, {
    wide: true, saveLabel: 'Übernehmen',
    onMount: m => m.querySelectorAll('[data-b]').forEach(b => {
      bild(p, b.dataset.b).then(x => { if (x) { b.style.backgroundImage = `url(${x.src})`; b.querySelector('.ag-bl').remove(); if (x.plan) b.classList.add('plan'); } else b.querySelector('.ag-bl').textContent = 'nicht ladbar'; });
      b.onclick = () => { const k = b.dataset.b; if (gew.has(k)) gew.delete(k); else { if (gew.size >= 8) { toast('Höchstens 8 Bilder je Wohnung', 'err'); return; } gew.add(k); } b.classList.toggle('an', gew.has(k)); };
    }),
    onSave: () => { o.bilder = [...gew]; tabelleZeichnen(); geaendert(); },
  });
}
function texteDlg(p, o) {
  const w = { ...objektWerte(p), ...o };
  modal('Texte – ' + (p.strasse || p.titel), html`
    <label class="f full"><span>Überschrift</span><input name="t" value="${w.t}"></label>
    <label class="f full"><span>Kurzbeschreibung (2–3 Sätze)</span><textarea name="d" rows="4">${w.d}</textarea></label>
    <label class="f"><span>Etage</span><input name="e" value="${w.e}" placeholder="z. B. 3. OG"></label>
    <label class="f"><span>Status-Schild</span><input name="stat" value="${w.stat}" placeholder="z. B. Vermietet, inkl. Garage"></label>
    <label class="f"><span>Bezeichnung der Miete</span><input name="mn" value="${w.mn}" placeholder="Kaltmiete"></label>
    <label class="f"><span>Merkmale (mit Komma getrennt)</span><input name="pl" value="${(w.pl || []).join(', ')}" placeholder="Balkon, Fahrstuhl, Einbauküche"></label>`, {
    wide: true, saveLabel: 'Übernehmen',
    onSave: v => { Object.assign(o, { t: v.t.trim(), d: v.d.trim(), e: v.e.trim(), stat: v.stat.trim(), mn: v.mn.trim() || 'Kaltmiete', pl: v.pl.split(',').map(x => x.trim()).filter(Boolean).slice(0, 6) }); tabelleZeichnen(); geaendert(); },
  });
}

// ---------------------------------------------------------------- Ausgabe
async function praesentieren() {
  if (!z.a?.objs.length) return; toast('Angebot wird vorbereitet …');
  window.__angebot = await daten(z.a);
  const w = window.open(new URL('../../angebot/ansicht.html', import.meta.url).href, '_blank');
  if (!w) toast('Das Fenster wurde vom Browser blockiert – bitte Pop-ups für das CRM erlauben', 'err');
}
const b64 = async url => { const b = await (await fetch(url)).blob(); return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); };
/** Eigenständige HTML-Datei: Gestaltung, Schriften, Logo, Bilder und Rechnung stecken alle in der Datei */
export async function alsHtml(a) {
  const basis = new URL('../../angebot/', import.meta.url), wurzel = new URL('../../../', import.meta.url);
  let [css, js, d] = await Promise.all([fetch(new URL('angebot.css', basis)).then(r => r.text()), fetch(new URL('angebot.js', basis)).then(r => r.text()), daten(a)]);
  for (const f of [...new Set(css.match(/url\(\/fonts\/[^)]+\)/g) || [])]) css = css.split(f).join(`url(${await b64(new URL(f.slice(5, -1), wurzel))})`);
  d.logo = await b64(d.logo); d.id = a.id; d.stand = new Date().toISOString();
  const json = JSON.stringify(d).replace(/</g, '\\u003c').replace(new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g'), ' ');
  const titel = `Für ${d.name} · Wohnungsangebot`.replace(/[<>&]/g, '');
  return `<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow">\n<meta name="theme-color" content="#080808">\n<title>${titel}</title>\n<style>\n${css}\n</style>\n</head>\n<body>\n<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n<script>KreAngebot.starte(${json});</script>\n</body>\n</html>\n`;
}
async function herunterladen() {
  if (!z.a?.objs.length) return; toast('Datei wird erstellt …');
  try {
    const text = await alsHtml(z.a), name = `Angebot-${(z.a.name || 'Kunde').trim().replace(/\s+/g, '-').replace(/[^\wäöüÄÖÜß-]/g, '')}.html`;
    const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([text], { type: 'text/html' })); l.download = name; document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 5000);
    haptik('erfolg'); toast(`${name} gespeichert (${(text.length / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB)`);
  } catch (e) { toast('Datei konnte nicht erstellt werden: ' + e.message, 'err'); }
}

function bearbeiten(el, a) {
  z.id = a.id; z.a = JSON.parse(JSON.stringify(a)); z.el = el; horche();
  const K = db.all('contacts').filter(c => fullName(c)).sort((x, y) => fullName(x).localeCompare(fullName(y)));
  el.innerHTML = String(html`<div class="ag ag-ed">
    <div class="ag-kopf"><a class="btn ghost small" href="#/angebote">← Alle Angebote</a><span class="muted" id="ag-art"></span>
      <span class="ag-akt"><button type="button" class="btn primary" id="ag-zeig" data-braucht>▶ Präsentieren</button><button type="button" class="btn" id="ag-datei" data-braucht>⬇ Als HTML-Datei</button><button type="button" class="btn ghost" id="ag-kopie">Duplizieren</button><button type="button" class="btn ghost" id="ag-weg" aria-label="Angebot löschen">Löschen</button></span></div>
    <div class="ag-spalten">
      <div class="ag-form">
        <section class="card"><h3>1 · Für wen?</h3>
          <div class="ag-raster"><label class="f full"><span>Kunde</span><input id="ag-name" value="${z.a.name || ''}" list="ag-kontakte" placeholder="Name des Kunden" autocomplete="off"></label>
            <datalist id="ag-kontakte">${K.slice(0, 500).map(c => html`<option value="${fullName(c)}">`)}</datalist>
            <label class="f"><span>Termin (optional)</span><input id="ag-termin" type="date" value="${z.a.termin || ''}"></label></div></section>
        <section class="card"><h3>2 · Welche Wohnungen?</h3><p class="muted small">Standard ist eine Wohnung. Bei mehreren zeigt das Angebot zuerst die erste einzeln – der Kunde kann weitere „dazu nehmen“, dann wird alles zusammen gerechnet.</p><div id="ag-objs" class="ag-objs"></div>
          <label class="f full ag-ans"><span>Beim Öffnen zeigen</span><select id="ag-ansicht"><option value="einzel">Eine Wohnung (die erste angehakte)</option><option value="paket" ${z.a.ansicht === 'paket' ? raw('selected') : ''}>Alle zusammen gerechnet</option></select></label></section>
        <section class="card"><h3>3 · Konditionen für diese Person</h3>
          <div class="ag-global">${[['st', 'Steuersatz %'], ['ek', 'Eigenkapital %'], ['tilg', 'Tilgung %'], ['nk', 'Kaufnebenkosten %']].map(([k, l]) => html`<label><span>${l}</span><input inputmode="decimal" data-g="${k}" value="${de(z.a[k])}"></label>`)}</div>
          <p class="muted small">Dieselben Werte stellst du in der Vorschau unter „Annahmen anpassen“ per Schieberegler ein – beides bleibt gleich.</p>
          <div id="ag-tab" class="ag-tab"></div>
          <label class="f full"><span>Zusätzlicher Hinweis im Kleingedruckten (optional)</span><input id="ag-hinweis" value="${z.a.hinweis || ''}" placeholder="z. B. Bei der Jahnstraße zeigen einzelne Bilder eine baugleiche Wohnung."></label></section>
      </div>
      <div class="ag-vor"><div class="ag-vork"><b>Vorschau</b><span class="muted small">So sieht es der Kunde – alles ist anklickbar</span></div>
        <div class="ag-leer" id="ag-leer" hidden><p class="muted">Wähle links mindestens eine Wohnung, dann erscheint hier das Angebot.</p></div>
        <iframe id="ag-rahmen" title="Vorschau des Angebots" src="${new URL('../../angebot/ansicht.html', import.meta.url).href}"></iframe></div>
    </div></div>`);
  const q = s => el.querySelector(s);
  q('#ag-name').oninput = () => { z.a.name = q('#ag-name').value.trim(); const c = K.find(x => fullName(x) === z.a.name); z.a.contactId = c?.id || ''; geaendert(); };
  q('#ag-ansicht').onchange = () => { z.a.ansicht = q('#ag-ansicht').value; geaendert(); };
  q('#ag-termin').onchange = () => { z.a.termin = q('#ag-termin').value; geaendert(); };
  q('#ag-hinweis').oninput = () => { z.a.hinweis = q('#ag-hinweis').value.trim(); geaendert(); };
  el.querySelectorAll('[data-g]').forEach(i => i.oninput = () => { const v = window.KreAngebotZahl(i.value), k = i.dataset.g, max = { st: 45, ek: 60, tilg: 10, nk: 15 }[k]; const ok = v >= 0 && v <= max; i.classList.toggle('falsch', !ok && i.value.trim() !== ''); if (ok) { z.a[k] = v; geaendert(); } });
  q('#ag-zeig').onclick = praesentieren; q('#ag-datei').onclick = herunterladen;
  q('#ag-kopie').onclick = async () => { await jetztSpeichern(); const k = JSON.parse(JSON.stringify(z.a)); delete k.id; delete k.created; delete k.updated; await neu({ ...k, name: '' }); toast('Kopie angelegt – jetzt den neuen Kunden eintragen'); };
  q('#ag-weg').onclick = async () => { if (!await confirmDlg(`Angebot für ${z.a.name || 'diesen Kunden'} löschen?`)) return; const id = z.a.id; z.a = null; z.id = ''; await db.del('angebote', id); toast('Angebot gelöscht'); location.hash = '#/angebote'; };
  listeZeichnen(); tabelleZeichnen();
}

export function render(el, arg) {
  if (!window.KreAngebotZahl) window.KreAngebotZahl = s => { s = String(s ?? '').replace(/[\s€% ]/g, ''); if (!s) return NaN; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); return /^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN; };
  const a = arg ? db.get('angebote', arg) : null;
  if (!a) { z.id = ''; z.a = null; z.el = null; return liste(el); }
  if (z.id === a.id && z.el === el && el.querySelector('#ag-rahmen')) { listeZeichnen(); return; }   // bei Datenänderungen nicht neu aufbauen (Tippen, Vorschau bleiben erhalten)
  bearbeiten(el, a);
}
