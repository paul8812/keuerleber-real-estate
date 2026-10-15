// Finanzen: Übersicht, Rechnungen, Einnahmen & Ausgaben
import * as db from '../db.js';
import { html, raw, inp, area, sel, chk, modal, toast, confirmDlg, download, toCSV, today, addDays, fmtDate, eur, eur2, fullName } from '../util.js';
import { contactOpts, propOpts, cLink, pLink, empty, badge, adresse } from '../ui.js';
import { PIPELINES } from '../consts.js';
import * as F from '../finanzen.js';

let tab = 'uebersicht', jahrSel = today().slice(0, 4), artSel = '';
const MN = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const ST = { entwurf: ['Entwurf', '#777'], offen: ['Offen', '#e0a84a'], bezahlt: ['Bezahlt', '#5bbf8a'], storniert: ['Storniert', '#e06a5a'] };
const reStatus = re => F.istUeberfaellig(re) ? badge('Überfällig', '#e06a5a') : badge(...(ST[re.status] || ST.offen));
const dealOpts = () => db.all('deals').slice().sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).map(d => [d.id, `${d.titel} · ${d.stage}`]);

function anrede(c) {
  if (!c) return 'Sehr geehrte Damen und Herren,';
  if (c.anrede === 'Frau' && c.nachname) return `Sehr geehrte Frau ${c.nachname},`;
  if (c.anrede === 'Herr' && c.nachname) return `Sehr geehrter Herr ${c.nachname},`;
  return 'Sehr geehrte Damen und Herren,';
}

// ---------- Rechnung aus Eckdaten ----------
export function rechnungForm(re = {}, done) {
  const isNew = !re.id, S = db.settings();
  const v0 = { typ: 'kaeufer', prozent: S.provKaeufer ?? 3.57, monatsmieten: 2, ust: F.kleinunternehmer() ? 0 : 19, ...(re.eingabe || {}), ...(isNew ? re : {}) };
  const fehlend = F.fehlendeAngaben();
  modal(isNew ? 'Neue Rechnung' : `Rechnung ${re.nr} bearbeiten`, html`
    ${fehlend.length ? html`<p class="full bad small">Für eine vollständige Rechnung fehlen in den Einstellungen noch: ${fehlend.join(', ')}.</p>` : ''}
    ${sel('typ', 'Art', F.RE_TYPEN.map(t => [t[0], t[1]]), v0.typ)}${sel('dealId', 'Vorgang (füllt den Rest automatisch)', dealOpts(), v0.dealId, { blank: 1 })}
    ${sel('contactId', 'Rechnungsempfänger', contactOpts(), v0.contactId, { blank: 1 })}${sel('propertyId', 'Objekt', propOpts(), v0.propertyId, { blank: 1 })}
    <div class="full grid sub-grid" data-show="kaeufer verkaeufer">${inp('kaufpreis', 'Kaufpreis (€)', v0.kaufpreis, { type: 'number', step: '0.01' })}${inp('prozent', 'Provision in % inkl. USt', v0.prozent, { type: 'number', step: '0.01' })}</div>
    <div class="full grid sub-grid" data-show="vermietung">${inp('kaltmiete', 'Nettokaltmiete (€/Monat)', v0.kaltmiete, { type: 'number', step: '0.01' })}${inp('monatsmieten', 'Anzahl Monatsmieten', v0.monatsmieten, { type: 'number', step: '0.5' })}</div>
    <div class="full grid sub-grid" data-show="frei">${inp('leistung', 'Leistung', v0.leistung, { cls: 'full' })}${inp('betragNetto', 'Betrag netto (€)', v0.betragNetto, { type: 'number', step: '0.01' })}${sel('ust', 'Umsatzsteuer', F.UST_SAETZE, v0.ust)}</div>
    ${inp('datum', 'Rechnungsdatum', re.datum || today(), { type: 'date' })}${inp('leistungsdatum', 'Leistungsdatum (z. B. Notartermin)', re.leistungsdatum || today(), { type: 'date' })}
    ${area('textAnpassung', 'Leistungstext anpassen (optional – leer = automatisch)', v0.textAnpassung, { rows: 2 })}
    ${area('notiz', 'Zusatz auf der Rechnung (optional)', re.notiz, { rows: 2 })}
    <div class="full repreview" id="repreview"></div>`, {
    wide: true, saveLabel: isNew ? 'Rechnung erstellen' : 'Speichern',
    onMount: el => {
      const f = el.querySelector('form'), g = n => f.querySelector(`[name=${n}]`);
      const show = () => el.querySelectorAll('[data-show]').forEach(d => d.hidden = !d.dataset.show.split(' ').includes(g('typ').value));
      const fillFromDeal = () => {
        const d = db.get('deals', g('dealId').value); if (!d) return;
        if (d.contactId) g('contactId').value = d.contactId;
        if (d.propertyId) g('propertyId').value = d.propertyId;
        const p = db.get('properties', d.propertyId);
        const kp = d.wert || p?.preis; if (kp && !g('kaufpreis').value) g('kaufpreis').value = kp;
        if (p?.vermarktung === 'Miete') { g('typ').value = 'vermietung'; if (p.preis && !g('kaltmiete').value) g('kaltmiete').value = p.preis; }
        else if (d.board === 'akquise') { g('typ').value = 'verkaeufer'; g('prozent').value = S.provVerkaeufer ?? 3.57; }
        if (d.provision) g('prozent').value = d.provision;
      };
      const prev = () => { const r = build(collectForm(f)); const s = F.summen(r); el.querySelector('#repreview').innerHTML = html`<div class="kv"><span>Leistung</span><b class="pre">${r.positionen[0]?.text || '–'}</b></div><div class="kv"><span>Netto</span><b>${eur2(s.netto)}</b></div>${Object.entries(s.steuern).map(([k, v]) => html`<div class="kv"><span>USt ${k} %</span><b>${eur2(v)}</b></div>`)}<div class="kv strong"><span>Rechnungsbetrag</span><b>${eur2(s.brutto)}</b></div><p class="muted small">Nr. ${r.nr} · fällig ${fmtDate(r.faellig)} · an: ${(r.empfaenger || '– bitte Empfänger wählen').split('\n')[0]}</p>`.s; };
      g('typ').addEventListener('change', () => { if (g('typ').value === 'verkaeufer') g('prozent').value = S.provVerkaeufer ?? 3.57; if (g('typ').value === 'kaeufer') g('prozent').value = S.provKaeufer ?? 3.57; show(); prev(); });
      g('dealId').addEventListener('change', () => { fillFromDeal(); show(); prev(); });
      f.addEventListener('input', prev); f.addEventListener('change', prev);
      show(); prev();
    },
    onSave: async (v, close, form) => {
      const r = build(collectForm(form));
      if (!r.contactId) { toast('Bitte einen Rechnungsempfänger wählen', 'err'); return false; }
      const s = F.summen(r); if (!s.netto) { toast('Betrag fehlt', 'err'); return false; }
      const rec = await db.save('rechnungen', r);
      if (isNew) await db.log('system', `Rechnung ${r.nr} erstellt (${eur2(s.brutto)})`, { contactId: r.contactId, propertyId: r.propertyId, dealId: r.dealId });
      toast(`Rechnung ${r.nr} gespeichert`); done ? done(rec) : rechnungDetail(rec);
    },
    danger: isNew ? null : { label: 'Löschen', confirm: `Rechnung ${re.nr} löschen? (Besser stornieren – gelöschte Nummern fehlen in der Folge.)`, fn: async () => { await db.del('rechnungen', re.id); } },
  });
  function collectForm(form) { const o = {}; form.querySelectorAll('[name]').forEach(e => o[e.name] = e.value); return o; }
  function build(v) {
    const c = db.get('contacts', v.contactId), p = db.get('properties', v.propertyId);
    const objekt = p ? `„${p.titel}“${adresse(p) ? ', ' + adresse(p) : ''}` : '';
    let pos;
    if (v.typ === 'frei') pos = { text: v.leistung || 'Leistung', menge: 1, einzel: F.r2(v.betragNetto), ust: Number(v.ust) };
    else pos = F.provisionsPosition(v.typ, { kaufpreis: Number(v.kaufpreis), prozentBrutto: Number(v.prozent), objekt, monatsmieten: Number(v.monatsmieten), kaltmiete: Number(v.kaltmiete) });
    if (v.textAnpassung) pos.text = v.textAnpassung;
    const base = isNew ? F.neueRechnung() : re;
    const datum = v.datum || base.datum;
    return { ...base, typ: v.typ, contactId: v.contactId, propertyId: v.propertyId, dealId: v.dealId, datum, leistungsdatum: v.leistungsdatum,
      nr: isNew && datum.slice(0, 4) !== base.nr.slice(3, 7) ? F.naechsteNr(datum) : base.nr,
      faellig: isNew || datum !== re.datum ? addDays(datum, Number(S.zahlungsziel) || 14) : base.faellig,
      empfaenger: F.empfaenger(c), anrede: anrede(c), betreff: p ? `Objekt: ${p.titel}${adresse(p) ? ', ' + adresse(p) : ''}` : '',
      positionen: [pos], notiz: v.notiz, eingabe: { typ: v.typ, dealId: v.dealId, contactId: v.contactId, propertyId: v.propertyId, kaufpreis: v.kaufpreis, prozent: v.prozent, kaltmiete: v.kaltmiete, monatsmieten: v.monatsmieten, leistung: v.leistung, betragNetto: v.betragNetto, ust: v.ust, textAnpassung: v.textAnpassung } };
  }
}

export function rechnungDetail(re) {
  const s = F.summen(re), c = db.get('contacts', re.contactId);
  const mail = c?.email ? `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent('Rechnung ' + re.nr)}&body=${encodeURIComponent(`${re.anrede || 'Guten Tag,'}\n\nanbei erhalten Sie unsere Rechnung ${re.nr} über ${eur2(s.brutto)}, zahlbar bis ${fmtDate(re.faellig)}.\n\nMit freundlichen Grüßen\n${db.settings().inhaber || ''}\n${db.settings().firma || ''}`)}` : '';
  const { el, close } = modal(`Rechnung ${re.nr}`, html`
    <div class="full"><div class="kv"><span>Empfänger</span><b>${c ? cLink(c.id) : (re.empfaenger || '').split('\n')[0]}</b></div>
      ${re.propertyId ? html`<div class="kv"><span>Objekt</span><b>${pLink(re.propertyId)}</b></div>` : ''}
      <div class="kv"><span>Datum / fällig</span><b>${fmtDate(re.datum)} · ${fmtDate(re.faellig)}</b></div>
      <div class="kv"><span>Status</span><b>${reStatus(re)}${re.bezahltAm ? ' am ' + fmtDate(re.bezahltAm) : ''}</b></div>
      <div class="kv"><span>Netto / USt</span><b>${eur2(s.netto)} / ${eur2(s.ust)}</b></div><div class="kv strong"><span>Rechnungsbetrag</span><b>${eur2(s.brutto)}</b></div>
      <p class="note">${(re.positionen || []).map(p => p.text).join('\n\n')}</p></div>
    <div class="full actions wrap"><button type="button" class="btn primary" data-a="pdf">⎙ PDF / Drucken</button>
      ${mail ? html`<a class="btn" href="${mail}" data-a="mail">✉ Per E-Mail senden</a>` : ''}
      ${re.status === 'offen' ? html`<button type="button" class="btn" data-a="paid">✓ Als bezahlt buchen</button>` : ''}
      ${re.status !== 'bezahlt' && re.status !== 'storniert' ? html`<button type="button" class="btn" data-a="edit">Bearbeiten</button><button type="button" class="btn ghost" data-a="storno">Stornieren</button>` : ''}
      ${re.status === 'bezahlt' ? html`<button type="button" class="btn ghost" data-a="unpaid">Zahlung zurücknehmen</button>` : ''}</div>
    ${mail ? html`<p class="full muted small">Tipp: zuerst „PDF“ speichern, dann „Per E-Mail senden“ und das PDF anhängen.</p>` : ''}`, { wide: true });
  const act = {
    pdf: () => F.druck(re),
    mail: async () => { if (re.contactId) await db.log('email', `Rechnung ${re.nr} per E-Mail versendet`, { contactId: re.contactId, propertyId: re.propertyId }); },
    paid: () => { close(); modal('Zahlungseingang buchen', html`${inp('datum', 'Bezahlt am', today(), { type: 'date' })}<p class="full muted">Es wird eine Einnahme über ${eur2(s.brutto)} gebucht.</p>`, { saveLabel: 'Buchen', onSave: async v => { await F.alsBezahlt(re, v.datum || today()); toast('Zahlung gebucht'); } }); },
    edit: () => { close(); rechnungForm(re); },
    storno: async () => { if (await confirmDlg(`Rechnung ${re.nr} stornieren?`)) { await db.save('rechnungen', { ...re, status: 'storniert' }); close(); toast('Storniert'); } },
    unpaid: async () => { if (await confirmDlg('Zahlung zurücknehmen und Einnahme löschen?')) { await db.save('rechnungen', { ...re, status: 'offen', bezahltAm: '' }); if (db.get('buchungen', 'b-' + re.id)) await db.del('buchungen', 'b-' + re.id); close(); } },
  };
  el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act[b.dataset.a]()));
}

// ---------- Einnahme / Ausgabe ----------
export function buchungForm(b = {}, done) {
  const isNew = !b.id, art = b.art || 'ausgabe';
  modal(isNew ? (art === 'einnahme' ? 'Neue Einnahme' : 'Neue Ausgabe') : 'Buchung bearbeiten', html`
    ${sel('art', 'Art', [['ausgabe', 'Ausgabe'], ['einnahme', 'Einnahme']], art)}${inp('datum', 'Datum', b.datum || today(), { type: 'date', req: 1 })}
    ${sel('kategorie', 'Kategorie', art === 'einnahme' ? F.KAT_EINNAHME : F.KAT_AUSGABE, b.kategorie)}${inp('beschreibung', 'Beschreibung', b.beschreibung, { ph: 'z. B. ImmoScout24 Inserat Oktober' })}
    ${inp('brutto', 'Betrag brutto (€)', b.brutto, { type: 'number', step: '0.01', req: 1 })}${sel('ustSatz', 'Enthaltene USt', F.UST_SAETZE, b.ustSatz ?? (F.kleinunternehmer() && art === 'einnahme' ? 0 : 19))}
    ${sel('contactId', 'Kontakt (optional)', contactOpts(), b.contactId, { blank: 1 })}${sel('propertyId', 'Objekt (optional)', propOpts(), b.propertyId, { blank: 1 })}
    ${inp('beleg', 'Beleg-Nr. / Ablage', b.beleg, { ph: 'z. B. RE 4711, Ordner 2026' })}${sel('zahlart', 'Bezahlt per', ['Überweisung', 'Lastschrift', 'Karte', 'PayPal', 'Bar'], b.zahlart || 'Überweisung')}
    <p class="full muted small" id="bsplit"></p>`, {
    onMount: el => {
      const f = el.querySelector('form'), g = n => f.querySelector(`[name=${n}]`);
      const upd = () => { const { netto, ust } = F.bruttoZuNetto(g('brutto').value || 0, g('ustSatz').value); el.querySelector('#bsplit').textContent = `Netto ${eur2(netto)} · USt ${eur2(ust)}`; };
      g('art').addEventListener('change', () => { const k = g('art').value === 'einnahme' ? F.KAT_EINNAHME : F.KAT_AUSGABE; g('kategorie').innerHTML = k.map(x => `<option>${x}</option>`).join(''); });
      f.addEventListener('input', upd); upd();
    },
    onSave: async v => {
      const { netto, ust } = F.bruttoZuNetto(v.brutto, v.ustSatz);
      await db.save('buchungen', { ...b, ...v, brutto: F.r2(v.brutto), ustSatz: Number(v.ustSatz), netto, ust });
      toast('Gebucht'); done && done();
    },
    danger: isNew ? null : { label: 'Löschen', confirm: 'Buchung löschen?', fn: async () => { await db.del('buchungen', b.id); } },
  });
}

// ---------- Ansicht ----------
function jahre() {
  const ys = new Set([today().slice(0, 4)]);
  db.all('buchungen').forEach(b => b.datum && ys.add(b.datum.slice(0, 4)));
  db.all('rechnungen').forEach(r => r.datum && ys.add(r.datum.slice(0, 4)));
  return [...ys].sort().reverse();
}

function uebersicht() {
  const J = F.jahr(jahrSel), offen = db.all('rechnungen').filter(r => r.status === 'offen');
  const offenSum = offen.reduce((s, r) => s + F.summen(r).brutto, 0), ueber = offen.filter(F.istUeberfaellig);
  const gewinn = J.einNetto - J.ausNetto, zahllast = J.ust - J.vorsteuer;
  const max = Math.max(1, ...J.monate.flatMap(m => [m.ein, m.aus]));
  const kat = Object.entries(J.kat).sort((a, b) => b[1] - a[1]), kmax = Math.max(1, ...kat.map(k => k[1]));
  const zuSchreiben = db.all('deals').filter(d => { const P = PIPELINES[d.board]; return P && d.stage === P.won && !db.all('rechnungen').some(r => r.dealId === d.id && r.status !== 'storniert'); });
  return html`<div class="kpis">
      <div class="kpi"><b>${eur(J.einNetto)}</b><span>Einnahmen ${jahrSel} (netto)</span></div>
      <div class="kpi"><b>${eur(J.ausNetto)}</b><span>Ausgaben ${jahrSel} (netto)</span></div>
      <div class="kpi ${gewinn < 0 ? 'warn' : ''}"><b>${eur(gewinn)}</b><span>Gewinn vor Steuern</span></div>
      <div class="kpi"><b>${eur(zahllast)}</b><span>${zahllast >= 0 ? 'USt an das Finanzamt' : 'USt-Erstattung'} (${eur(J.ust)} − ${eur(J.vorsteuer)} Vorsteuer)</span></div>
      <a class="kpi ${ueber.length ? 'warn' : ''}" href="#/finanzen" data-goto="rechnungen"><b>${eur(offenSum)}</b><span>${offen.length} offene Rechnung${offen.length === 1 ? '' : 'en'}${ueber.length ? ` · ${ueber.length} überfällig` : ''}</span></a>
    </div>
    <div class="cols">
      <section class="card" style="grid-column:1/-1"><h2>Monate ${jahrSel} <span class="muted small">netto · <i class="lg ein"></i> Einnahmen <i class="lg aus"></i> Ausgaben</span></h2>
        <div class="months">${J.monate.map((m, i) => html`<div class="mo" title="${MN[i]}: Einnahmen ${eur(m.ein)}, Ausgaben ${eur(m.aus)}"><div class="mb"><i class="ein" style="height:${m.ein / max * 100}%"></i><i class="aus" style="height:${m.aus / max * 100}%"></i></div><span>${MN[i]}</span><b class="${m.ein - m.aus < 0 ? 'bad' : ''}">${m.ein || m.aus ? eur(m.ein - m.aus) : ''}</b></div>`)}</div></section>
      <section class="card"><h2>Ausgaben nach Kategorie</h2>${kat.length ? html`<div class="bars">${kat.map(([k, v]) => html`<div class="bar"><span class="bl">${k}</span><div class="bt"><i style="width:${v / kmax * 100}%;background:var(--gold)"></i></div><b>${eur(v)}</b></div>`)}</div>` : empty('Noch keine Ausgaben', '„+ Ausgabe“ oben rechts')}</section>
      <section class="card"><h2>Rechnung fällig</h2>${zuSchreiben.length ? html`<ul class="list">${zuSchreiben.map(d => html`<li data-redeal="${d.id}"><span class="ic">€</span><div class="grow"><div class="ttl">${d.titel}</div><div class="sub">${d.stage}${d.contactId ? html` · ${cLink(d.contactId)}` : ''}</div></div><button class="mini">Rechnung</button></li>`)}</ul>` : html`<p class="muted">Alle abgeschlossenen Vorgänge sind abgerechnet.</p>`}
        ${ueber.length ? html`<h3>Überfällig</h3><ul class="list">${ueber.map(r => html`<li data-re="${r.id}"><b class="when">${fmtDate(r.faellig)}</b><div class="grow"><div class="ttl">${r.nr} · ${(r.empfaenger || '').split('\n')[0]}</div><div class="sub">${eur2(F.summen(r).brutto)}</div></div></li>`)}</ul>` : ''}</section>
    </div>`;
}

function rechnungen() {
  const list = db.all('rechnungen').filter(r => (r.datum || '').startsWith(jahrSel)).sort((a, b) => (b.nr || '').localeCompare(a.nr || ''));
  return html`<div class="card">${list.length ? html`<table class="tbl"><thead><tr><th>Nr.</th><th>Datum</th><th>Empfänger</th><th>Leistung</th><th class="right">Brutto</th><th>Status</th></tr></thead><tbody>
    ${list.map(r => { const s = F.summen(r); return html`<tr data-re="${r.id}" class="click"><td><b>${r.nr}</b></td><td>${fmtDate(r.datum)}</td><td>${r.contactId ? cLink(r.contactId) : (r.empfaenger || '').split('\n')[0]}</td><td class="muted">${(F.RE_TYPEN.find(t => t[0] === r.typ) || [, 'Leistung'])[1]}</td><td class="right">${eur2(s.brutto)}</td><td>${reStatus(r)}</td></tr>`; })}</tbody></table>` : empty(`Keine Rechnungen ${jahrSel}`, '„+ Rechnung“ – Kunde und Vorgang wählen, der Rest wird ausgefüllt.')}</div>`;
}

function buchungen() {
  const list = db.all('buchungen').filter(b => (b.datum || '').startsWith(jahrSel) && (!artSel || b.art === artSel)).sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  const ein = list.filter(b => b.art === 'einnahme').reduce((s, b) => s + (b.brutto || 0), 0), aus = list.filter(b => b.art === 'ausgabe').reduce((s, b) => s + (b.brutto || 0), 0);
  return html`<div class="chips"><button class="chip ${!artSel ? 'on' : ''}" data-art="">Alle</button><button class="chip ${artSel === 'einnahme' ? 'on' : ''}" data-art="einnahme">Einnahmen</button><button class="chip ${artSel === 'ausgabe' ? 'on' : ''}" data-art="ausgabe">Ausgaben</button>
      <span class="muted small" style="margin-left:auto">Brutto: +${eur2(ein)} / −${eur2(aus)}</span><button class="btn" data-csv>CSV für Steuerberater</button></div>
    <div class="card">${list.length ? html`<table class="tbl"><thead><tr><th>Datum</th><th>Kategorie</th><th>Beschreibung</th><th class="right">Netto</th><th class="right">USt</th><th class="right">Brutto</th></tr></thead><tbody>
    ${list.map(b => html`<tr data-b="${b.id}" class="click"><td>${fmtDate(b.datum)}</td><td>${b.kategorie}</td><td>${b.beschreibung || ''}${b.rechnungId ? html` <span class="muted">· aus Rechnung</span>` : ''}</td><td class="right">${eur2(b.netto)}</td><td class="right muted">${b.ustSatz ? eur2(b.ust) : '–'}</td><td class="right ${b.art === 'einnahme' ? 'ok' : 'bad'}">${b.art === 'einnahme' ? '+' : '−'}${eur2(b.brutto)}</td></tr>`)}</tbody></table>` : empty('Keine Buchungen', 'Bezahlte Rechnungen werden automatisch als Einnahme gebucht.')}</div>`;
}

export function render(el) {
  const TABS = [['uebersicht', 'Übersicht'], ['rechnungen', 'Rechnungen'], ['buchungen', 'Einnahmen & Ausgaben']];
  el.innerHTML = html`<div class="head"><h1>Finanzen</h1><div class="actions"><select class="chipsel" data-jahr>${jahre().map(y => html`<option ${y === jahrSel ? raw('selected') : ''}>${y}</option>`)}</select>
      <button class="btn" data-neu="ausgabe">+ Ausgabe</button><button class="btn" data-neu="einnahme">+ Einnahme</button><button class="btn primary" data-neu="rechnung">+ Rechnung</button></div></div>
    <div class="chips">${TABS.map(([k, l]) => html`<button class="chip ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`)}</div>
    ${tab === 'uebersicht' ? uebersicht() : tab === 'rechnungen' ? rechnungen() : buchungen()}`.s;
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(el); });
  el.querySelector('[data-goto]')?.addEventListener('click', e => { e.preventDefault(); tab = 'rechnungen'; render(el); });
  el.querySelector('[data-jahr]').onchange = e => { jahrSel = e.target.value; render(el); };
  el.querySelectorAll('[data-neu]').forEach(b => b.onclick = () => b.dataset.neu === 'rechnung' ? rechnungForm() : buchungForm({ art: b.dataset.neu }));
  el.querySelectorAll('[data-re]').forEach(r => r.onclick = e => { if (!e.target.closest('a')) rechnungDetail(db.get('rechnungen', r.dataset.re)); });
  el.querySelectorAll('[data-redeal]').forEach(r => r.onclick = e => { if (!e.target.closest('a')) { const d = db.get('deals', r.dataset.redeal); rechnungForm({ dealId: d.id, contactId: d.contactId, propertyId: d.propertyId, kaufpreis: d.wert || db.get('properties', d.propertyId)?.preis, typ: d.board === 'akquise' ? 'verkaeufer' : 'kaeufer', prozent: d.provision || (d.board === 'akquise' ? db.settings().provVerkaeufer : db.settings().provKaeufer) }); } });
  el.querySelectorAll('[data-b]').forEach(r => r.onclick = e => { if (!e.target.closest('a')) { const b = db.get('buchungen', r.dataset.b); b.rechnungId ? rechnungDetail(db.get('rechnungen', b.rechnungId)) : buchungForm(b); } });
  el.querySelectorAll('[data-art]').forEach(b => b.onclick = () => { artSel = b.dataset.art; render(el); });
  el.querySelector('[data-csv]')?.addEventListener('click', () => {
    const rows = db.all('buchungen').filter(b => (b.datum || '').startsWith(jahrSel)).sort((a, b) => a.datum.localeCompare(b.datum));
    download(`buchungen-${jahrSel}.csv`, toCSV(rows, [[b => fmtDate(b.datum), 'Datum'], [b => b.art === 'einnahme' ? 'Einnahme' : 'Ausgabe', 'Art'], ['kategorie', 'Kategorie'], ['beschreibung', 'Beschreibung'],
      [b => String(b.netto).replace('.', ','), 'Netto'], ['ustSatz', 'USt-Satz %'], [b => String(b.ust).replace('.', ','), 'USt'], [b => String(b.brutto).replace('.', ','), 'Brutto'],
      [b => db.get('rechnungen', b.rechnungId)?.nr || '', 'Rechnung'], [b => fullName(db.get('contacts', b.contactId)) || '', 'Kontakt'], ['beleg', 'Beleg'], ['zahlart', 'Zahlart']]), 'text/csv');
  });
}
