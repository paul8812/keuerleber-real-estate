import * as db from '../db.js';
import { html, raw, esc, inp, area, sel, modal, toast, fullName, fmtDate, today } from '../util.js';
import { contactOpts, propOpts, adresse, empty } from '../ui.js';

const PH = ['{{anrede_name}}', '{{vorname}}', '{{nachname}}', '{{ort}}', '{{objekt.titel}}', '{{objekt.adresse}}', '{{objekt.preis}}', '{{datum}}', '{{absender}}', '{{firma}}', '{{tel}}', '{{firma_ort}}'];
function fill(txt, c, p, datum) {
  const s = db.settings();
  const anrede = c ? (c.anrede === 'Frau' ? `Frau ${c.nachname}` : c.anrede === 'Herr' ? `Herr ${c.nachname}` : fullName(c)) : '';
  const map = { anrede_name: anrede, vorname: c?.vorname || '', nachname: c?.nachname || '', ort: c?.ort || p?.ort || '', 'objekt.titel': p?.titel || '', 'objekt.adresse': p ? adresse(p) : '', 'objekt.preis': p?.preis ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(p.preis) : '', datum: datum ? fmtDate(datum) : '[Datum]', absender: s.inhaber, firma: s.firma, tel: s.tel, firma_ort: s.ort };
  return (txt || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => map[k] ?? '');
}
let sel_ = null;

export function render(el) {
  const tpls = db.all('templates').slice().sort((a, b) => (a.kategorie + a.name).localeCompare(b.kategorie + b.name, 'de'));
  if (!sel_ || !db.get('templates', sel_)) sel_ = tpls[0]?.id;
  const t = db.get('templates', sel_);
  el.innerHTML = html`<div class="head"><h1>Vorlagen</h1><button class="btn primary" data-new>+ Vorlage</button></div>
    <div class="split wide"><section class="card"><h2>Textbausteine</h2>${tpls.length ? html`<ul class="list sel">${tpls.map(x => html`<li class="${x.id === sel_ ? 'on' : ''}" data-t="${x.id}"><div class="grow"><div class="ttl">${x.name}</div><div class="sub">${x.kategorie}</div></div></li>`)}</ul>` : empty('Noch keine Vorlagen')}</section>
    <section class="card">${t ? html`<h2>${t.name} <button class="mini" data-edit>Bearbeiten</button></h2>
      <div class="grid"><label class="f"><span>Kontakt</span><select id="tc"><option value=""></option>${contactOpts().map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
      <label class="f"><span>Objekt</span><select id="tp"><option value=""></option>${propOpts().map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
      <label class="f"><span>Datum / Termin</span><input type="date" id="td" value="${today()}"></label></div>
      <label class="f full"><span>Betreff</span><input id="tsub" readonly></label><label class="f full"><span>Text (frei bearbeitbar)</span><textarea id="ttxt" rows="14"></textarea></label>
      <div class="actions"><button class="btn" data-copy>Kopieren</button><a class="btn" id="tmail">✉ In E-Mail-Programm öffnen</a><button class="btn" data-print>Drucken / PDF</button></div>` : empty('Vorlage wählen')}</section></div>`.s;
  el.querySelector('[data-new]').onclick = () => form({});
  el.querySelectorAll('[data-t]').forEach(li => li.onclick = () => { sel_ = li.dataset.t; render(el); });
  if (!t) return;
  const upd = () => { const c = db.get('contacts', el.querySelector('#tc').value), p = db.get('properties', el.querySelector('#tp').value), d = el.querySelector('#td').value; const sub = fill(t.betreff, c, p, d), txt = fill(t.text, c, p, d);
    el.querySelector('#tsub').value = sub; el.querySelector('#ttxt').value = txt; refreshMail(); };
  const refreshMail = () => { const c = db.get('contacts', el.querySelector('#tc').value); el.querySelector('#tmail').href = `mailto:${c?.email || ''}?subject=${encodeURIComponent(el.querySelector('#tsub').value)}&body=${encodeURIComponent(el.querySelector('#ttxt').value)}`; };
  ['#tc', '#tp', '#td'].forEach(s => el.querySelector(s).onchange = upd);
  el.querySelector('#ttxt').oninput = refreshMail;
  upd();
  el.querySelector('[data-edit]').onclick = () => form(t);
  el.querySelector('[data-copy]').onclick = async () => { await navigator.clipboard.writeText(el.querySelector('#tsub').value + '\n\n' + el.querySelector('#ttxt').value); toast('In Zwischenablage kopiert'); };
  el.querySelector('[data-print]').onclick = () => { const w = window.open('', '_blank'); w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(t.name)}</title><body style="font-family:Helvetica,Arial;max-width:700px;margin:40px auto;line-height:1.6;white-space:pre-wrap">${esc(el.querySelector('#ttxt').value)}</body>`); w.document.close(); w.print(); };
  el.querySelector('#tmail').onclick = async () => { const c = el.querySelector('#tc').value; if (c) await db.log('email', 'E-Mail (Vorlage): ' + t.name, { contactId: c, propertyId: el.querySelector('#tp').value }); };
}
function form(t) {
  modal(t.id ? 'Vorlage bearbeiten' : 'Neue Vorlage', html`${inp('name', 'Name', t.name, { req: 1 })}${sel('kategorie', 'Kategorie', ['Interessent', 'Akquise', 'Eigentümer', 'Allgemein'], t.kategorie || 'Allgemein')}${inp('betreff', 'Betreff', t.betreff, { cls: 'full' })}${area('text', 'Text', t.text, { rows: 12 })}<p class="full muted">Platzhalter: ${PH.join('  ')}</p>`, {
    onSave: async v => { await db.save('templates', { ...t, ...v }); toast('Vorlage gespeichert'); },
    danger: t.id ? { label: 'Löschen', confirm: 'Vorlage löschen?', fn: async () => { await db.del('templates', t.id); } } : null,
  });
}
