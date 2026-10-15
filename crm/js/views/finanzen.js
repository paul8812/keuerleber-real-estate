// Finanzen: Übersicht, Rechnungen, Einnahmen & Ausgaben
import * as db from '../db.js';
import { html, raw, inp, area, sel, chk, modal, toast, confirmDlg, download, toCSV, today, addDays, fmtDate, eur, eur2, fullName } from '../util.js';
import { contactOpts, propOpts, cLink, pLink, empty, badge, adresse } from '../ui.js';
import { PIPELINES, sl } from '../consts.js';
import * as F from '../finanzen.js';
import * as KI from '../ki.js';
import { esc } from '../util.js';

let tab = 'uebersicht', jahrSel = today().slice(0, 4), artSel = '';
const MN = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const ST = { entwurf: ['Entwurf', '#777'], offen: ['Offen', '#e0a84a'], bezahlt: ['Bezahlt', '#5bbf8a'], storniert: ['Storniert', '#e06a5a'] };
const reStatus = re => F.istUeberfaellig(re) ? badge('Überfällig', '#e06a5a') : badge(...(ST[re.status] || ST.offen));
const dealOpts = () => db.all('deals').slice().sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).map(d => [d.id, `${d.titel} · ${sl(d.stage)}`]);

function anrede(c) {
  if (!c) return 'Sehr geehrte Damen und Herren,';
  if (c.anrede === 'Frau' && c.nachname) return `Sehr geehrte Frau ${c.nachname},`;
  if (c.anrede === 'Herr' && c.nachname) return `Sehr geehrter Herr ${c.nachname},`;
  return 'Sehr geehrte Damen und Herren,';
}

// ---------- Rechnung aus Eckdaten ----------
export function rechnungForm(re = {}, done) {
  const isNew = !re.id, S = db.settings();
  const v0 = { typ: 'vertrieb', betrag: F.standardVerguetung(), prozent: S.provKaeufer || 3.57, monatsmieten: 2, ust: F.kleinunternehmer() ? 0 : 19, ...(re.eingabe || {}), ...(isNew ? re : {}) };
  const fehlend = F.fehlendeAngaben();
  modal(isNew ? 'Neue Rechnung' : `Rechnung ${re.nr} bearbeiten`, html`
    ${fehlend.length ? html`<p class="full bad small">Für eine vollständige Rechnung fehlen in den Einstellungen noch: ${fehlend.join(', ')}.</p>` : ''}
    ${sel('typ', 'Art', F.RE_TYPEN.map(t => [t[0], t[1]]), v0.typ)}${sel('dealId', 'Vorgang (füllt den Rest automatisch)', dealOpts(), v0.dealId, { blank: 1 })}
    ${sel('contactId', 'Rechnungsempfänger', contactOpts(), v0.contactId, { blank: 1 })}${sel('propertyId', 'Objekt', propOpts(), v0.propertyId, { blank: 1 })}
    <div class="full grid sub-grid" data-show="vertrieb">${inp('betrag', 'Deine Vergütung (€ netto)', v0.betrag, { type: 'number', step: '0.01' })}${sel('kaeuferId', 'Käufer der Einheit', contactOpts(), v0.kaeuferId, { blank: 1 })}<p class="full muted small">Rechnungsempfänger ist der Verkäufer bzw. Bauträger – der Käufer zahlt nichts.</p></div>
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
        const p = db.get('properties', d.propertyId);
        if (d.propertyId) g('propertyId').value = d.propertyId;
        if (d.board === 'vertrieb' && p?.vermarktung !== 'Miete') {
          g('typ').value = 'vertrieb'; if (d.contactId) g('kaeuferId').value = d.contactId;
          if (p?.eigentuemerId) g('contactId').value = p.eigentuemerId;
          g('betrag').value = Number(d.verguetung) || Number(p?.verguetung) || F.standardVerguetung();
          if (d.closedAt) g('leistungsdatum').value = d.closedAt;
          return;
        }
        if (d.contactId) g('contactId').value = d.contactId;
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
    else if (v.typ === 'vertrieb') pos = F.provisionsPosition('vertrieb', { betrag: Number(v.betrag), objekt, kaeufer: fullName(db.get('contacts', v.kaeuferId)) || '', notartermin: v.leistungsdatum });
    else pos = F.provisionsPosition(v.typ, { kaufpreis: Number(v.kaufpreis), prozentBrutto: Number(v.prozent), objekt, monatsmieten: Number(v.monatsmieten), kaltmiete: Number(v.kaltmiete) });
    if (v.textAnpassung) pos.text = v.textAnpassung;
    const base = isNew ? F.neueRechnung() : re;
    const datum = v.datum || base.datum;
    return { ...base, typ: v.typ, contactId: v.contactId, propertyId: v.propertyId, dealId: v.dealId, datum, leistungsdatum: v.leistungsdatum,
      nr: isNew && datum.slice(0, 4) !== base.nr.slice(3, 7) ? F.naechsteNr(datum) : base.nr,
      faellig: isNew || datum !== re.datum ? addDays(datum, Number(S.zahlungsziel) || 14) : base.faellig,
      empfaenger: F.empfaenger(c), anrede: anrede(c), betreff: p ? `Objekt: ${p.titel}${adresse(p) ? ', ' + adresse(p) : ''}` : '',
      positionen: [pos], notiz: v.notiz, eingabe: { typ: v.typ, dealId: v.dealId, contactId: v.contactId, propertyId: v.propertyId, kaufpreis: v.kaufpreis, prozent: v.prozent, betrag: v.betrag, kaeuferId: v.kaeuferId, kaltmiete: v.kaltmiete, monatsmieten: v.monatsmieten, leistung: v.leistung, betragNetto: v.betragNetto, ust: v.ust, textAnpassung: v.textAnpassung } };
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
  modal(isNew ? (art === 'einnahme' ? 'Neue Einnahme' : 'Neue Ausgabe') : (b.ki ? 'Beleg prüfen' : 'Buchung bearbeiten'), html`
    ${b.pruefen || b.hinweis ? html`<p class="full kihint">${b.ki ? `🤖 KI-erkannt (${Math.round((b.kiSicherheit || 0) * 100)} % sicher)` : ''}${b.hinweis ? ' · ' + b.hinweis : ''}${b.pruefen ? ' – bitte kurz prüfen und speichern.' : ''}</p>` : b.ki ? html`<p class="full muted small">🤖 Von der KI erkannt und verbucht.</p>` : ''}
    ${sel('art', 'Art', [['ausgabe', 'Ausgabe'], ['einnahme', 'Einnahme']], art)}${inp('datum', 'Datum', b.datum || today(), { type: 'date', req: 1 })}
    ${sel('kategorie', 'Kategorie', art === 'einnahme' ? F.KAT_EINNAHME : F.KAT_AUSGABE, b.kategorie)}${inp('konto', 'Konto (SKR03)', b.konto || F.konto(b.kategorie || (art === 'einnahme' ? F.KAT_EINNAHME[0] : F.KAT_AUSGABE[0]), b.ustSatz ?? 19), { ph: 'automatisch' })}
    ${inp('beschreibung', 'Beschreibung', b.beschreibung, { ph: 'z. B. ImmoScout24 Inserat Oktober' })}${inp('lieferant', art === 'einnahme' ? 'Kunde' : 'Lieferant / Aussteller', b.lieferant)}
    ${inp('brutto', 'Betrag brutto (€)', b.brutto, { type: 'number', step: '0.01', req: 1 })}${sel('ustSatz', 'Enthaltene USt', F.UST_SAETZE, b.ustSatz ?? (F.kleinunternehmer() ? 0 : 19))}
    ${sel('contactId', 'Kontakt (optional)', contactOpts(), b.contactId, { blank: 1 })}${sel('propertyId', 'Objekt (optional)', propOpts(), b.propertyId, { blank: 1 })}
    ${inp('beleg', 'Beleg-/Rechnungs-Nr.', b.beleg || b.rechnungsnr, { ph: 'z. B. RE 4711' })}${sel('zahlart', 'Bezahlt per', ['Überweisung', 'Lastschrift', 'Karte', 'PayPal', 'Bar'], b.zahlart || 'Überweisung')}
    ${chk('offen', 'Noch nicht bezahlt (offene Rechnung)', !!b.offen, { cls: 'full' })}
    <p class="full muted small" id="bsplit"></p>
    ${b.belegId ? html`<div class="full"><button type="button" class="btn" data-beleg>📎 Beleg ansehen</button></div>` : ''}`, {
    wide: !!b.belegId,
    onMount: el => {
      const f = el.querySelector('form'), g = n => f.querySelector(`[name=${n}]`);
      let kontoManuell = !!b.konto && b.konto !== F.konto(b.kategorie, b.ustSatz);
      const upd = () => { const { netto, ust } = F.bruttoZuNetto(g('brutto').value || 0, g('ustSatz').value); el.querySelector('#bsplit').textContent = `Netto ${eur2(netto)} · USt ${eur2(ust)}`; if (!kontoManuell) g('konto').value = F.konto(g('kategorie').value, g('ustSatz').value); };
      g('konto').addEventListener('input', () => { kontoManuell = true; });
      g('art').addEventListener('change', () => { const k = g('art').value === 'einnahme' ? F.KAT_EINNAHME : F.KAT_AUSGABE; g('kategorie').innerHTML = k.map(x => `<option>${esc(x)}</option>`).join(''); upd(); });
      f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
      el.querySelector('[data-beleg]')?.addEventListener('click', () => belegAnsehen(b.belegId));
    },
    onSave: async v => {
      const { netto, ust } = F.bruttoZuNetto(v.brutto, v.ustSatz);
      await db.save('buchungen', { ...b, ...v, brutto: F.r2(v.brutto), ustSatz: Number(v.ustSatz), netto, ust, konto: v.konto || F.konto(v.kategorie, v.ustSatz), pruefen: false });
      if (b.pruefen && b.belegId) for (const x of db.all('buchungen')) if (x.belegId === b.belegId && x.id !== b.id && x.pruefen) await db.save('buchungen', { ...x, pruefen: false });
      toast(b.pruefen ? '✓ Geprüft' : 'Gebucht'); done && done();
    },
    danger: isNew ? null : { label: 'Löschen', confirm: 'Buchung löschen?' + (b.belegId ? ' Der Beleg wird mit gelöscht.' : ''), fn: async () => { await db.del('buchungen', b.id); if (b.belegId && !db.all('buchungen').some(x => x.belegId === b.belegId)) await db.delFile(b.belegId); } },
  });
}

export async function belegAnsehen(id) {
  const w = window.open('', '_blank'); if (!w) { toast('Pop-up blockiert – bitte erlauben', 'err'); return; }
  w.document.write('<title>Beleg</title><body style="margin:0;background:#222;color:#ccc;font:14px sans-serif"><p style="padding:20px">Beleg wird geladen …</p>');
  try {
    const f = await db.getFile(id); if (!f) throw new Error('Beleg nicht gefunden');
    const [kopf, b64] = f.dataUrl.split(','), bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    w.location.href = URL.createObjectURL(new Blob([u8], { type: (kopf.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream' }));
  } catch (e) { w.document.body.innerHTML = `<p style="padding:20px">${esc(e.message)}</p>`; }
}

// ---------- KI-Belegeingang ----------
function kiEinrichten() {
  modal('🤖 KI-Belegerkennung einrichten', html`<div class="full">
    <p>Die KI liest Fotos und PDFs deiner Belege, erkennt Betrag, Datum, Lieferant und Steuer, ordnet Kategorie, Konto (SKR03) und Objekt zu und bucht alles automatisch.</p>
    <p class="muted">Dafür braucht das CRM einmalig einen Zugangsschlüssel für die KI (Claude von Anthropic). Kosten: ca. 1–2 Cent pro Beleg, abgerechnet über dein eigenes Guthaben.</p>
    <p><a class="btn primary" href="#/einstellungen" data-close>Zu den Einstellungen → KI-Belegerkennung</a></p></div>`);
}

export function belegeHochladen(files) {
  files = [...files].filter(f => /^image\/|pdf$/.test(f.type) || /\.(jpe?g|png|heic|webp|pdf)$/i.test(f.name));
  if (!files.length) return;
  if (!KI.hasKey()) return kiEinrichten();
  const rows = files.map((f, i) => ({ i, f, st: 'wartet' }));
  const m = modal(`📷 Belegeingang (${files.length})`, html`<div class="full"><p class="muted small" id="kistat">Die KI liest deine Belege …</p><ul class="list kilist" id="kilist"></ul></div>`, { wide: true });
  const list = m.el.querySelector('#kilist'), stat = m.el.querySelector('#kistat');
  const draw = () => {
    list.innerHTML = rows.map(r => {
      const b = r.buchungen?.[0], ic = { wartet: '⏳', liest: '🔍', ok: '✅', pruefen: '⚠️', dublette: '⧉', fehler: '❌' }[r.st];
      const sub = r.st === 'liest' ? 'wird gelesen …' : r.st === 'wartet' ? 'in der Warteschlange' : r.st === 'fehler' ? r.err : r.st === 'dublette' ? `schon gebucht am ${fmtDate(r.dup.datum)} – übersprungen` :
        `${b.art === 'einnahme' ? '+' : '−'}${eur2(b.belegBrutto)} · ${b.kategorie} · Konto ${b.konto}${r.buchungen.length > 1 ? ` · ${r.buchungen.length} Steuersätze` : ''}${b.propertyId ? ' · ' + (db.get('properties', b.propertyId)?.titel || '') : ''}${b.hinweis ? ' · ' + b.hinweis : ''}`;
      return `<li data-ki="${r.i}" class="${r.buchungen || r.dup ? 'click' : ''}"><span class="ic">${ic}</span><div class="grow"><div class="ttl">${esc(b ? `${fmtDate(b.datum)} · ${b.lieferant || b.beschreibung}` : r.f.name)}</div><div class="sub ${r.st === 'fehler' ? 'bad' : ''}">${esc(sub)}</div></div>${r.st === 'pruefen' ? '<button type="button" class="mini">Prüfen</button>' : ''}</li>`;
    }).join('');
    const fertig = rows.filter(r => !['wartet', 'liest'].includes(r.st)).length, n = k => rows.filter(r => r.st === k).length;
    stat.textContent = fertig < rows.length ? `Die KI liest deine Belege … ${fertig} von ${rows.length}` :
      `Fertig: ${n('ok') + n('pruefen')} verbucht${n('pruefen') ? `, ${n('pruefen')} bitte kurz prüfen` : ''}${n('dublette') ? `, ${n('dublette')} doppelt (übersprungen)` : ''}${n('fehler') ? `, ${n('fehler')} Fehler` : ''}.`;
  };
  list.onclick = e => { const li = e.target.closest('[data-ki]'); const r = li && rows[li.dataset.ki]; if (!r) return; if (r.buchungen) buchungForm(db.get('buchungen', r.buchungen[0].id) || r.buchungen[0], () => { r.st = 'ok'; draw(); }); else if (r.dup) buchungForm(r.dup); };
  draw();
  const one = async r => {
    r.st = 'liest'; draw();
    try {
      const datei = await KI.lesen(r.f), e = await KI.analysieren(datei);
      if (e.sicherheit === 0 && !e.brutto) throw new Error(e.hinweis || 'Kein Beleg erkannt');
      const dup = KI.dublette(e);
      if (dup) { r.st = 'dublette'; r.dup = dup; }
      else { r.buchungen = await KI.verbuchen(e, datei, r.f.name); r.st = r.buchungen[0].pruefen ? 'pruefen' : 'ok'; }
    } catch (x) { r.st = 'fehler'; r.err = x.message; }
    draw();
  };
  (async () => { const q = [...rows]; await Promise.all([0, 1, 2].map(async () => { while (q.length) await one(q.shift()); })); })();
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
  const zuSchreiben = db.all('deals').filter(d => { const P = PIPELINES[d.board]; return d.board === 'vertrieb' && P && d.stage === P.won && !db.all('rechnungen').some(r => r.dealId === d.id && r.status !== 'storniert'); });
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
      <section class="card"><h2>Rechnung fällig</h2>${zuSchreiben.length ? html`<ul class="list">${zuSchreiben.map(d => html`<li data-redeal="${d.id}"><span class="ic">€</span><div class="grow"><div class="ttl">${d.titel}</div><div class="sub">${sl(d.stage)}${d.contactId ? html` · ${cLink(d.contactId)}` : ''}</div></div><button class="mini">Rechnung</button></li>`)}</ul>` : html`<p class="muted">Alle abgeschlossenen Vorgänge sind abgerechnet.</p>`}
        ${ueber.length ? html`<h3>Überfällig</h3><ul class="list">${ueber.map(r => html`<li data-re="${r.id}"><b class="when">${fmtDate(r.faellig)}</b><div class="grow"><div class="ttl">${r.nr} · ${(r.empfaenger || '').split('\n')[0]}</div><div class="sub">${eur2(F.summen(r).brutto)}</div></div></li>`)}</ul>` : ''}</section>
    </div>`;
}

function rechnungen() {
  const list = db.all('rechnungen').filter(r => (r.datum || '').startsWith(jahrSel)).sort((a, b) => (b.nr || '').localeCompare(a.nr || ''));
  return html`<div class="card">${list.length ? html`<table class="tbl"><thead><tr><th>Nr.</th><th>Datum</th><th>Empfänger</th><th>Leistung</th><th class="right">Brutto</th><th>Status</th></tr></thead><tbody>
    ${list.map(r => { const s = F.summen(r); return html`<tr data-re="${r.id}" class="click"><td><b>${r.nr}</b></td><td>${fmtDate(r.datum)}</td><td>${r.contactId ? cLink(r.contactId) : (r.empfaenger || '').split('\n')[0]}</td><td class="muted">${(F.RE_TYPEN.find(t => t[0] === r.typ) || [, 'Leistung'])[1]}</td><td class="right">${eur2(s.brutto)}</td><td>${reStatus(r)}</td></tr>`; })}</tbody></table>` : empty(`Keine Rechnungen ${jahrSel}`, '„+ Rechnung“ – Kunde und Vorgang wählen, der Rest wird ausgefüllt.')}</div>`;
}

function buchungen() {
  const nPr = db.all('buchungen').filter(b => b.pruefen).length;
  const list = db.all('buchungen').filter(b => artSel === 'pruefen' ? b.pruefen : (b.datum || '').startsWith(jahrSel) && (!artSel || b.art === artSel)).sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  const ein = list.filter(b => b.art === 'einnahme').reduce((s, b) => s + (b.brutto || 0), 0), aus = list.filter(b => b.art === 'ausgabe').reduce((s, b) => s + (b.brutto || 0), 0);
  return html`<div class="chips"><button class="chip ${!artSel ? 'on' : ''}" data-art="">Alle</button><button class="chip ${artSel === 'einnahme' ? 'on' : ''}" data-art="einnahme">Einnahmen</button><button class="chip ${artSel === 'ausgabe' ? 'on' : ''}" data-art="ausgabe">Ausgaben</button>${nPr ? html`<button class="chip ${artSel === 'pruefen' ? 'on' : ''}" data-art="pruefen">⚠ Zu prüfen <i>${nPr}</i></button>` : ''}
      <span class="muted small" style="margin-left:auto">Brutto: +${eur2(ein)} / −${eur2(aus)}</span><button class="btn" data-csv>CSV für Steuerberater</button></div>
    <div class="card">${list.length ? html`<table class="tbl"><thead><tr><th>Datum</th><th>Kategorie</th><th>Konto</th><th>Beschreibung</th><th class="right">Netto</th><th class="right">USt</th><th class="right">Brutto</th></tr></thead><tbody>
    ${list.map(b => html`<tr data-b="${b.id}" class="click"><td>${b.pruefen ? '⚠️ ' : ''}${fmtDate(b.datum)}</td><td>${b.kategorie}</td><td class="muted">${b.konto || F.konto(b.kategorie, b.ustSatz)}</td><td>${b.belegId ? '📎 ' : ''}${b.beschreibung || ''}${b.lieferant && !(b.beschreibung || '').includes(b.lieferant) ? html` <span class="muted">· ${b.lieferant}</span>` : ''}${b.offen ? html` <span class="bad small">offen</span>` : ''}${b.rechnungId ? html` <span class="muted">· aus Rechnung</span>` : ''}</td><td class="right">${eur2(b.netto)}</td><td class="right muted">${b.ustSatz ? eur2(b.ust) : '–'}</td><td class="right ${b.art === 'einnahme' ? 'ok' : 'bad'}">${b.art === 'einnahme' ? '+' : '−'}${eur2(b.brutto)}</td></tr>`)}</tbody></table>` : empty('Keine Buchungen', '📷 Belege hochladen – die KI bucht sie automatisch. Bezahlte Rechnungen werden automatisch als Einnahme gebucht.')}</div>`;
}

export function render(el) {
  const TABS = [['uebersicht', 'Übersicht'], ['rechnungen', 'Rechnungen'], ['buchungen', 'Einnahmen & Ausgaben']];
  el.innerHTML = html`<div class="head"><h1>Finanzen</h1><div class="actions"><select class="chipsel" data-jahr>${jahre().map(y => html`<option ${y === jahrSel ? raw('selected') : ''}>${y}</option>`)}</select>
      <label class="btn primary">📷 Belege hochladen<input type="file" accept="image/*,application/pdf,.pdf,.heic" multiple data-belege hidden></label>
      <button class="btn" data-neu="ausgabe">+ Ausgabe</button><button class="btn" data-neu="einnahme">+ Einnahme</button><button class="btn" data-neu="rechnung">+ Rechnung</button></div></div>
    <p class="muted small kidrop">${KI.hasKey() ? '🤖 Fotos oder PDFs von Belegen hochladen oder hierher ziehen – die KI erkennt alles und verbucht automatisch.' : raw('🤖 Neu: Belege einfach fotografieren, die KI verbucht sie. <a class="lnk" href="#/einstellungen">Einmalig einrichten →</a>')}</p>
    <div class="chips">${TABS.map(([k, l]) => html`<button class="chip ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`)}</div>
    ${tab === 'uebersicht' ? uebersicht() : tab === 'rechnungen' ? rechnungen() : buchungen()}`.s;
  el.querySelector('[data-belege]').onchange = e => { belegeHochladen(e.target.files); e.target.value = ''; };
  if (!el.dataset.drop) { el.dataset.drop = 1;
    el.addEventListener('dragover', e => { if (location.hash.startsWith('#/finanzen') && e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); el.classList.add('dropping'); } });
    el.addEventListener('dragleave', e => { if (e.target === el) el.classList.remove('dropping'); });
    el.addEventListener('drop', e => { if (!location.hash.startsWith('#/finanzen')) return; e.preventDefault(); el.classList.remove('dropping'); belegeHochladen(e.dataTransfer.files); }); }
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(el); });
  el.querySelector('[data-goto]')?.addEventListener('click', e => { e.preventDefault(); tab = 'rechnungen'; render(el); });
  el.querySelector('[data-jahr]').onchange = e => { jahrSel = e.target.value; render(el); };
  el.querySelectorAll('[data-neu]').forEach(b => b.onclick = () => b.dataset.neu === 'rechnung' ? rechnungForm() : buchungForm({ art: b.dataset.neu }));
  el.querySelectorAll('[data-re]').forEach(r => r.onclick = e => { if (!e.target.closest('a')) rechnungDetail(db.get('rechnungen', r.dataset.re)); });
  el.querySelectorAll('[data-redeal]').forEach(r => r.onclick = e => { if (!e.target.closest('a')) { const d = db.get('deals', r.dataset.redeal), p = db.get('properties', d.propertyId); rechnungForm({ dealId: d.id, typ: 'vertrieb', leistungsdatum: d.closedAt || today(), contactId: p?.eigentuemerId, kaeuferId: d.contactId, propertyId: d.propertyId, betrag: Number(d.verguetung) || Number(p?.verguetung) || F.standardVerguetung() }); } });
  el.querySelectorAll('[data-b]').forEach(r => r.onclick = e => { if (!e.target.closest('a')) { const b = db.get('buchungen', r.dataset.b); b.rechnungId ? rechnungDetail(db.get('rechnungen', b.rechnungId)) : buchungForm(b); } });
  el.querySelectorAll('[data-art]').forEach(b => b.onclick = () => { artSel = b.dataset.art; render(el); });
  el.querySelector('[data-csv]')?.addEventListener('click', () => {
    const rows = db.all('buchungen').filter(b => (b.datum || '').startsWith(jahrSel)).sort((a, b) => a.datum.localeCompare(b.datum));
    download(`buchungen-${jahrSel}.csv`, toCSV(rows, [[b => fmtDate(b.datum), 'Datum'], [b => b.art === 'einnahme' ? 'Einnahme' : 'Ausgabe', 'Art'], ['kategorie', 'Kategorie'], [b => b.konto || F.konto(b.kategorie, b.ustSatz), 'Konto SKR03'], ['beschreibung', 'Beschreibung'], ['lieferant', 'Lieferant/Kunde'],
      [b => String(b.netto).replace('.', ','), 'Netto'], ['ustSatz', 'USt-Satz %'], [b => String(b.ust).replace('.', ','), 'USt'], [b => String(b.brutto).replace('.', ','), 'Brutto'],
      [b => db.get('rechnungen', b.rechnungId)?.nr || '', 'Rechnung'], [b => fullName(db.get('contacts', b.contactId)) || '', 'Kontakt'], ['beleg', 'Beleg'], ['zahlart', 'Zahlart']]), 'text/csv');
  });
}
