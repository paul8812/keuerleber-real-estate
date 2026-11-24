import * as db from '../db.js';
// Vorlagen: links nach Kategorie sortiert, rechts ausfüllen (Kontakt, Objekt, Termin), prüfen und direkt senden.
import { html, raw, esc, inp, area, sel, modal, toast, fullName } from '../util.js';
import { contactOpts, propOpts, empty } from '../ui.js';
import { fuellen, PLATZHALTER } from '../entwurf.js';
import * as mail from '../mail.js';

const KAT = ['Interessent', 'Akquise', 'Eigentümer', 'Allgemein', 'WhatsApp'];
const KAT_INFO = { Interessent: 'Anleger & Käufer', Akquise: 'Bauträger & Verkäufer', Eigentümer: 'Eigentümer', Allgemein: 'Für alle', WhatsApp: 'Kurznachrichten' };
let sel_ = null, wahl = { c: '', p: '', d: '', z: '' };

export function render(el) {
  const tpls = db.all('templates').slice().sort((a, b) => (KAT.indexOf(a.kategorie) - KAT.indexOf(b.kategorie)) || a.name.localeCompare(b.name, 'de'));
  if (!sel_ || !db.get('templates', sel_)) sel_ = tpls[0]?.id;
  const t = db.get('templates', sel_), gruppen = KAT.map(k => [k, tpls.filter(x => (KAT.includes(x.kategorie) ? x.kategorie : 'Allgemein') === k)]).filter(([, l]) => l.length), wa = t?.kategorie === 'WhatsApp';
  const kurz = x => x.name.replace(/^WA: /, '');
  el.innerHTML = html`<div class="head"><div><h1>Vorlagen</h1><p class="muted">Vorlage wählen, Kontakt und Objekt einsetzen, prüfen – dann ${mail.verfuegbar() ? 'direkt senden' : 'im Mail-Programm öffnen'}.</p></div><button class="btn primary" data-new>+ Vorlage</button></div>
    <div class="vl">
      <nav class="card vl-liste" aria-label="Vorlagen">${gruppen.length ? gruppen.map(([k, l]) => html`<h2>${k}<small>${KAT_INFO[k]}</small></h2><ul>${l.map(x => html`<li><button type="button" class="${x.id === sel_ ? 'on' : ''}" data-t="${x.id}"><b>${kurz(x)}</b><span>${x.betreff ? fuellen(x.betreff, null, null, '', '', { luecken: true }).replace(/\[(Termin|Datum)\]/g, '…').replace(/\[Objekt\]/g, 'Objekt').replace(/\[Ort\]/g, '…') : (x.text || '').slice(0, 60)}</span></button></li>`)}</ul>`) : empty('Noch keine Vorlagen')}</nav>
      <section class="card vl-edit">${t ? html`
        <label class="f vl-wahl"><span>Vorlage</span><select data-tsel>${gruppen.map(([k, l]) => html`<optgroup label="${k}">${l.map(x => html`<option value="${x.id}" ${x.id === sel_ ? raw('selected') : ''}>${kurz(x)}</option>`)}</optgroup>`)}</select></label>
        <div class="vl-kopf"><div><h2>${kurz(t)}</h2><span class="vl-kat">${t.kategorie}</span></div><button class="btn ghost small" data-edit>✎ Vorlage ändern</button></div>
        <div class="vl-fuer"><label class="f"><span>Für wen?</span><select id="tc"><option value="">Kontakt wählen …</option>${contactOpts().map(([v, l]) => html`<option value="${v}" ${v === wahl.c ? raw('selected') : ''}>${l}</option>`)}</select></label>
          <label class="f"><span>Welches Objekt?</span><select id="tp"><option value="">Objekt wählen …</option>${propOpts().map(([v, l]) => html`<option value="${v}" ${v === wahl.p ? raw('selected') : ''}>${l}</option>`)}</select></label>
          <label class="f"><span>Termin am</span><input type="date" id="td" value="${wahl.d}"></label><label class="f"><span>um</span><input type="time" id="tz" value="${wahl.z}"></label></div>
        <p class="vl-offen" id="toffen" hidden></p>
        ${wa ? '' : html`<label class="f full"><span>Betreff</span><input id="tsub"></label>`}<label class="f full"><span>${wa ? 'Nachricht' : 'Text'} <small>– hier frei anpassbar, die Vorlage selbst bleibt unverändert</small></span><textarea id="ttxt" rows="${wa ? 6 : 16}"></textarea></label>
        ${wa ? '' : html`<p class="muted small vl-sig">${mail.verfuegbar() ? 'Beim Senden ersetzt deine Signatur (Logo, Kontaktdaten) den Gruß am Ende.' : 'Im Mail-Programm hängt Outlook deine Signatur an.'}</p>`}
        <div class="actions vl-akt">${wa ? html`<button class="btn primary" data-wa>💬 In WhatsApp öffnen</button>` : html`<button class="btn primary" data-mail>✉ E-Mail schreiben</button>`}<button class="btn" data-copy>Kopieren</button>${wa ? '' : html`<button class="btn" data-print>Drucken / PDF</button>`}</div>` : empty('Vorlage wählen')}</section></div>`.s;
  el.querySelector('[data-new]').onclick = () => form({});
  el.querySelectorAll('[data-t]').forEach(li => li.onclick = () => { sel_ = li.dataset.t; render(el); });
  if (!t) return;
  el.querySelector('[data-tsel]').onchange = e => { sel_ = e.target.value; render(el); };
  const $ = s => el.querySelector(s), txt = () => $('#ttxt').value, sub = () => $('#tsub')?.value || '';
  const offen = () => { const l = [...new Set(((sub() + ' ' + txt()).match(/\[(Kontakt|Vorname|Nachname|Objekt|Objekt-Adresse|Ort|Preis|Termin|Datum|Uhrzeit|Name Käufer)\]/g) || []))], o = $('#toffen'); o.hidden = !l.length; o.textContent = l.length ? `Noch offen: ${l.map(x => x.slice(1, -1)).join(', ')} – oben auswählen oder im Text ersetzen.` : ''; };
  const upd = () => { wahl = { c: $('#tc').value, p: $('#tp').value, d: $('#td').value, z: $('#tz').value }; const c = db.get('contacts', wahl.c), p = db.get('properties', wahl.p);
    if ($('#tsub')) $('#tsub').value = fuellen(t.betreff, c, p, wahl.d, wahl.z, { luecken: true }); $('#ttxt').value = fuellen(t.text, c, p, wahl.d, wahl.z, { luecken: true }); offen(); };
  ['#tc', '#tp', '#td', '#tz'].forEach(s => $(s).onchange = upd);
  $('#ttxt').oninput = offen; if ($('#tsub')) $('#tsub').oninput = offen;
  upd();
  $('[data-edit]').onclick = () => form(t);
  $('[data-copy]').onclick = async () => { await navigator.clipboard.writeText((sub() ? sub() + '\n\n' : '') + txt()); toast('In Zwischenablage kopiert'); };
  $('[data-mail]')?.addEventListener('click', async () => {
    const c = db.get('contacts', wahl.c), v = { an: c?.email || '', betreff: sub(), text: txt(), contactId: wahl.c, propertyId: wahl.p };
    if (c && !c.email) toast(`Bei ${fullName(c)} ist keine E-Mail-Adresse hinterlegt`, 'err');
    if (mail.verfuegbar()) return mail.schreiben(v);
    location.href = `mailto:${encodeURIComponent(v.an).replace('%40', '@')}?subject=${encodeURIComponent(v.betreff)}&body=${encodeURIComponent(v.text)}`;
    if (wahl.c) await db.log('email', 'E-Mail (Vorlage): ' + t.name, { contactId: wahl.c, propertyId: wahl.p });
  });
  $('[data-wa]')?.addEventListener('click', async () => {
    const c = db.get('contacts', wahl.c), n = String(c?.mobil || c?.tel || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '').replace(/^0/, '49');
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(txt())}`, '_blank', 'noopener');
    if (wahl.c) await db.log('whatsapp', 'WhatsApp geschrieben: ' + kurz(t), { contactId: wahl.c, propertyId: wahl.p });
  });
  if (!$('[data-print]')) return;
  el.querySelector('[data-print]').onclick = () => { const w = window.open('', '_blank'); const A = u => new URL(u, location.href.replace(/crm\/.*$/, '')).href, S = db.settings();
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(t.name)}</title><style>@font-face{font-family:Jost;src:url(${A('fonts/jost-var.woff2')}) format('woff2');font-weight:100 900}@font-face{font-family:'Cormorant Garamond';src:url(${A('fonts/cormorant-600.woff2')}) format('woff2');font-weight:500 700}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Jost,Helvetica,Arial,sans-serif;max-width:700px;margin:40px auto;line-height:1.6;color:#14110d}.kopf{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #a8813f;padding-bottom:12px;margin-bottom:32px}.lk{display:flex;align-items:center;gap:12px}.lk img{height:56px}.lc{display:flex;flex-direction:column;gap:5px}.ln{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:21px;letter-spacing:.2em;padding-left:.2em;text-transform:uppercase;color:#9c7f4d;line-height:1;text-align:center}.ls{display:flex;align-items:center;gap:8px;font-weight:500;font-size:10.5px;letter-spacing:.5em;text-transform:uppercase;line-height:1}.ls i{flex:1;height:.5px;background:#a8813f;min-width:5px}.ls span{margin-right:-.5em}.k{text-align:right;font-size:11px;color:#6b6459;line-height:1.5}.txt{white-space:pre-wrap}</style><body><div class="kopf"><div class="lk"><img src="${esc(A('logo/Wappen_gold.svg'))}"><span class="lc"><span class="ln">Keuerleber</span><span class="ls"><i></i><span>Immobilien</span><i></i></span></span></div><div class="k"><b>${esc(S.inhaber || '')}</b><br>${esc([S.strasse, [S.plz, S.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '))}<br>${esc([S.tel, S.email].filter(Boolean).join(' · '))}<br>${esc(S.web || '')}</div></div><div class="txt">${esc(txt())}</div></body>`); w.document.close(); w.print(); };
}
function form(t) {
  modal(t.id ? 'Vorlage bearbeiten' : 'Neue Vorlage', html`${inp('name', 'Name', t.name, { req: 1 })}${sel('kategorie', 'Kategorie', KAT, t.kategorie || 'Allgemein')}${inp('betreff', 'Betreff (bei WhatsApp leer lassen)', t.betreff, { cls: 'full' })}${area('text', 'Text', t.text, { rows: 14 })}
    <div class="full vl-ph"><span>Platzhalter – antippen fügt ihn an der Schreibmarke ein:</span><div>${PLATZHALTER.map(([p, l]) => html`<button type="button" data-ph="${p}" title="${l}">${p.slice(2, -2)}</button>`)}</div></div>`, {
    wide: true,
    onMount: m => { let ziel = m.querySelector('[name=text]'); m.querySelectorAll('[name=text],[name=betreff]').forEach(x => x.addEventListener('focus', () => { ziel = x; }));
      m.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => { const a = ziel.selectionStart ?? ziel.value.length, e = ziel.selectionEnd ?? a; ziel.setRangeText(b.dataset.ph, a, e, 'end'); ziel.focus(); }); },
    onSave: async v => { await db.save('templates', { ...t, ...v }); toast('Vorlage gespeichert'); },
    danger: t.id ? { label: 'Löschen', confirm: 'Vorlage löschen?', fn: async () => { await db.del('templates', t.id); } } : null,
  });
}
