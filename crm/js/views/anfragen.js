// Anfragen: alle Interessenten-Anfragen aus den Portalen (ohne-makler.net) an einem Ort.
// Kommen automatisch aus dem Gmail-Postfach (geplanter Abruf) – mit Kontaktdaten, Nachricht und Zusatzangaben.
// Hier: sichten, vergleichen, mit einem Tipp anrufen/antworten, Besichtigung planen, zu- oder absagen.
import * as db from '../db.js';
import * as P from '../portal.js';
import { html, raw, esc, modal, toast, fmtDT, fullName, uid, today } from '../util.js';
import { eventForm } from '../forms.js';
import { vorWann } from '../kontakt.js';
import { haptik } from '../haptik.js';

const z = { filter: 'offen', inserat: '', ansicht: 'karten', auf: new Set() };
const FILTER = [['offen', 'Offen', g => P.OFFEN.includes(st(g))], ['neu', 'Neu', g => st(g) === 'neu'], ['kontaktiert', 'Kontaktiert', g => st(g) === 'kontaktiert'], ['besichtigung', 'Besichtigung', g => st(g) === 'besichtigung'],
  ['zusage', 'Zusage', g => st(g) === 'zusage'], ['erledigt', 'Absage / abgelegt', g => ['absage', 'archiv'].includes(st(g))], ['alle', 'Alle', () => true]];
const st = g => g.haupt.status || 'neu';
const telNr = t => String(t || '').replace(/[^\d+]/g, '');
const wa = t => telNr(t).replace(/^\+/, '').replace(/^0/, '49');
const initialen = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const vorname = n => String(n || '').trim().split(/\s+/)[0] || '';
const stBadge = s => html`<span class="an-st" style="--a:${P.STATUS[s]?.farbe || '#888'}">${P.STATUS[s]?.name || s}</span>`;
const inseratK = g => g.haupt.inseratNr || g.haupt.inseratTitel || '–';

function mailLink(g, art) {
  const S = db.settings(), h = g.haupt, was = h.inseratTitel ? `„${h.inseratTitel.split(' - ')[0]}“` : 'unsere Wohnung';
  const gruss = `\n\nMit freundlichen Grüßen\n${S.inhaber || ''}\n${S.firma || ''}${S.tel ? '\nTel. ' + S.tel : ''}`;
  const text = art === 'absage'
    ? `Guten Tag ${g.name},\n\nvielen Dank für Ihr Interesse an ${was}. Leider müssen wir Ihnen mitteilen, dass die Wohnung inzwischen anderweitig vergeben wurde.\n\nWir wünschen Ihnen viel Erfolg bei der weiteren Suche.${gruss}`
    : `Guten Tag ${g.name},\n\nvielen Dank für Ihre Anfrage zu ${was}. Gerne zeige ich Ihnen die Wohnung – wann würde es Ihnen passen?\n\nMögliche Termine:\n– \n– ${gruss}`;
  return `mailto:${encodeURIComponent(g.email)}?subject=${encodeURIComponent((art === 'absage' ? 'Ihre Anfrage: ' : 'Besichtigung: ') + (h.inseratTitel || 'Wohnung').split(' - ').slice(0, 2).join(' – '))}&body=${encodeURIComponent(text)}`;
}

export function render(el) {
  const G = P.gruppen(), ins = P.inserate();
  if (z.inserat && !ins.some(i => i.k === z.inserat)) z.inserat = '';
  const imIns = z.inserat ? G.filter(g => inseratK(g) === z.inserat) : G;
  const f = FILTER.find(x => x[0] === z.filter) || FILTER[0], liste = imIns.filter(f[2]);
  const n = k => imIns.filter(FILTER.find(x => x[0] === k)[2]).length;
  const neuester = G.reduce((m, g) => (g.letzte.importiert || '') > m ? g.letzte.importiert : m, '');
  el.innerHTML = String(html`<div class="an">
    <div class="head"><div><h1>Anfragen</h1><p class="muted">Interessenten aus deinen Portalen – kommen automatisch aus den ohne-makler-Mails.</p></div>
      <div class="actions"><button type="button" class="btn" id="an-neu">+ Anfrage von Hand</button></div></div>
    <div class="kpis strip an-kpis">
      <div class="kpi"><span>Neu</span><b class="${n('neu') ? 'gold' : ''}">${n('neu')}</b></div>
      <div class="kpi"><span>In Bearbeitung</span><b>${n('kontaktiert') + n('besichtigung')}</b></div>
      <div class="kpi"><span>Besichtigungen</span><b>${n('besichtigung')}</b></div>
      <div class="kpi"><span>Zusagen</span><b>${n('zusage')}</b></div>
      <div class="kpi"><span>Gesamt</span><b>${imIns.length}</b></div>
    </div>
    ${ins.length ? html`<div class="an-ins">${ins.map(i => html`<div class="an-in ${z.inserat === i.k ? 'on' : ''}">
      <button type="button" class="an-inb" data-ins="${i.k}" aria-pressed="${z.inserat === i.k}"><b>${i.nr || 'Inserat'}</b><span>${i.titel || ''}</span><small>${i.n} Anfrage${i.n === 1 ? '' : 'n'}${i.offen ? ` · ${i.offen} offen` : ''}</small></button>
      <label class="an-obj"><span>Objekt</span><select data-insobj="${i.k}" aria-label="Objekt zu ${i.nr || i.titel}"><option value="">– zuordnen –</option>${db.all('properties').map(p => html`<option value="${p.id}" ${p.id === i.propertyId ? raw('selected') : ''}>${p.nr ? p.nr + ' · ' : ''}${p.titel}</option>`)}</select></label>
      ${i.url ? html`<a class="lnk small" href="${i.url}" target="_blank" rel="noopener">Inserat ansehen ↗</a>` : ''}</div>`)}</div>` : ''}
    <div class="an-bar">
      <div class="chips" role="group" aria-label="Status">${FILTER.map(([k, l]) => html`<button type="button" class="chip ${z.filter === k ? 'on' : ''}" data-f="${k}">${l}${n(k) && k !== 'alle' ? html` <i>${n(k)}</i>` : ''}</button>`)}</div>
      <div class="seg an-sicht" role="group" aria-label="Ansicht"><button type="button" data-sicht="karten" class="${z.ansicht === 'karten' ? 'on' : ''}">Karten</button><button type="button" data-sicht="vergleich" class="${z.ansicht === 'vergleich' ? 'on' : ''}">Vergleich</button></div>
    </div>
    ${!G.length ? html`<div class="card an-leer"><h3>Noch keine Anfragen</h3><p class="muted">Sobald eine Anfrage von ohne-makler in deinem Gmail-Postfach landet, erscheint sie hier – mit Name, Telefon, E-Mail, Nachricht und den Angaben zu Haushalt, Einkommen und Schufa. Der Abruf läuft stündlich.</p></div>`
      : !liste.length ? html`<div class="card an-leer"><p class="muted">Keine Anfragen in „${f[1]}“.</p></div>`
      : z.ansicht === 'vergleich' ? vergleich(liste) : html`<div class="an-liste">${liste.map(karte)}</div>`}
    <p class="muted small an-fuss">Automatischer Abruf aus Gmail: stündlich zwischen 7 und 22 Uhr.${neuester ? ` Letzte neue Anfrage übernommen ${vorWann(neuester)}.` : ''} Mehrere Mails derselben Person zum selben Inserat zählen als eine Anfrage.</p>
  </div>`);
  binden(el);
}

function karte(g) {
  const h = g.haupt, s = st(g), auf = z.auf.has(g.id), ang = P.angabenListe(g.angaben), c = h.contactId && db.get('contacts', h.contactId);
  const lang = (g.letzte.nachricht || '').length > 260 || g.nachrichten.length > 1;
  return html`<article class="card an-karte ${s}" data-g="${g.id}">
    <header class="an-kopf">
      <span class="an-av" aria-hidden="true">${initialen(g.name)}</span>
      <div class="an-wer"><b>${g.name}</b><small class="muted">${vorWann(g.eingang)} · ${fmtDT(g.eingang)}${g.alle.length > 1 ? ` · ${g.alle.length} Mails` : ''}${!z.inserat && h.inseratNr ? ' · ' + h.inseratNr : ''}</small></div>
      <button type="button" class="an-fav ${h.favorit ? 'on' : ''}" data-fav aria-pressed="${!!h.favorit}" aria-label="Favorit" title="Favorit">★</button>
      ${stBadge(s)}
    </header>
    ${ang.length ? html`<div class="an-ang">${ang.map(([k, v]) => html`<span class="an-chip"><small>${k}</small>${v}</span>`)}</div>` : ''}
    <div class="an-text ${auf ? 'auf' : ''}">${(auf ? g.nachrichten : [g.letzte]).map((m, i) => html`${auf && g.nachrichten.length > 1 ? html`<small class="muted an-mz">${fmtDT(m.eingang)}</small>` : ''}<p>${(auf ? m.nachricht : (m.nachricht || '').replace(/\n{2,}/g, '\n')) || '(ohne Nachricht)'}</p>`)}</div>
    ${lang ? html`<button type="button" class="an-mehr" data-mehr>${auf ? 'weniger' : g.nachrichten.length > 1 ? `alles lesen (${g.nachrichten.length} Nachrichten)` : 'alles lesen'}</button>` : ''}
    <div class="an-kontakt">
      ${g.tel ? html`<a class="btn primary" href="tel:${telNr(g.tel)}" data-k>📞 ${g.tel}</a><a class="btn" href="https://wa.me/${wa(g.tel)}" target="_blank" rel="noopener" data-k>WhatsApp</a>` : ''}
      ${g.email ? html`<a class="btn" href="${mailLink(g, 'antwort')}" data-k title="${g.email}">✉ Antworten</a>` : ''}
      <button type="button" class="btn" data-besichtigung>▦ Besichtigung</button>
    </div>
    <footer class="an-fuss2">
      <label class="an-stsel"><span class="muted small">Status</span><select data-status aria-label="Status von ${g.name}">${Object.entries(P.STATUS).map(([k, v]) => html`<option value="${k}" ${k === s ? raw('selected') : ''}>${v.name}</option>`)}</select></label>
      ${g.email && !['absage', 'archiv'].includes(s) ? html`<a class="btn ghost small" href="${mailLink(g, 'absage')}" data-absage>Absage schreiben</a>` : ''}
      ${c ? html`<a class="lnk small" href="#/kontakte/${c.id}">Kontakt öffnen →</a>` : ''}
    </footer>
    <textarea class="an-notiz" data-notiz rows="1" placeholder="Notiz (z. B. Eindruck am Telefon, Wunschtermin)" aria-label="Notiz zu ${g.name}">${h.notiz || ''}</textarea>
  </article>`;
}
function vergleich(liste) {
  const sp = [['Haushalt', /haushalt/i], ['Arbeit', /arbeit/i], ['Einkommen', /einkommen/i], ['Schufa', /schufa/i], ['Haustiere', /haustier/i]];
  const wert = (g, re) => (P.angabenListe(g.angaben).find(([k]) => re.test(k)) || [])[1] || '–';
  return html`<div class="card flush an-vgl"><table class="tbl"><thead><tr><th></th><th>Name</th><th>Eingang</th>${sp.map(([l]) => html`<th>${l}</th>`)}<th>Kontakt</th><th>Status</th></tr></thead><tbody>
    ${liste.map(g => html`<tr data-g="${g.id}"><td><button type="button" class="an-fav ${g.haupt.favorit ? 'on' : ''}" data-fav aria-label="Favorit">★</button></td><td><b>${g.name}</b>${g.haupt.notiz ? html`<br><small class="muted">${g.haupt.notiz}</small>` : ''}</td><td>${fmtDT(g.eingang).slice(0, 6)}</td>${sp.map(([, re]) => html`<td>${wert(g, re)}</td>`)}
      <td class="an-vk">${g.tel ? html`<a href="tel:${telNr(g.tel)}" data-k title="${g.tel}">📞</a>` : ''}${g.email ? html`<a href="${mailLink(g, 'antwort')}" data-k title="${g.email}">✉</a>` : ''}</td>
      <td><select data-status aria-label="Status von ${g.name}">${Object.entries(P.STATUS).map(([k, v]) => html`<option value="${k}" ${k === st(g) ? raw('selected') : ''}>${v.name}</option>`)}</select></td></tr>`)}
  </tbody></table></div>`;
}

function vonHand() {
  const ins = P.inserate();
  modal('Anfrage von Hand eintragen', html`
    <label class="f full"><span>Name</span><input name="name" required></label>
    <label class="f"><span>Telefon</span><input name="tel" inputmode="tel"></label>
    <label class="f"><span>E-Mail</span><input name="email" type="email"></label>
    <label class="f full"><span>Inserat / Wohnung</span><input name="inserat" list="an-ins" value="${z.inserat && ins.find(i => i.k === z.inserat)?.nr || ''}" placeholder="z. B. OM-493407 oder „3-Zi-Wohnung Hof“"></label>
    <datalist id="an-ins">${ins.map(i => html`<option value="${i.nr || i.titel}">${i.titel}</option>`)}</datalist>
    <label class="f full"><span>Nachricht / Notiz</span><textarea name="nachricht" rows="4"></textarea></label>`, {
    saveLabel: 'Eintragen',
    onSave: async v => {
      if (!v.name.trim()) { toast('Bitte einen Namen eingeben', 'err'); return false; }
      const i = ins.find(x => x.nr === v.inserat.trim() || x.titel === v.inserat.trim());
      await db.save('anfragen', { id: 'anf-hand-' + uid(), quelle: 'Manuell', eingang: new Date().toISOString(), importiert: new Date().toISOString(), status: 'neu', name: v.name.trim(), tel: v.tel.trim(), email: v.email.trim().toLowerCase(),
        inseratNr: i ? i.nr : (/^OM-\d+/i.test(v.inserat.trim()) ? v.inserat.trim().toUpperCase() : ''), inseratTitel: i ? i.titel : (/^OM-\d+/i.test(v.inserat.trim()) ? '' : v.inserat.trim()), inseratUrl: i?.url || '', nachricht: v.nachricht.trim() });
      toast('Anfrage eingetragen'); P.verarbeiten().catch(() => {});
    },
  });
}

function binden(el) {
  const grp = e => P.gruppen().find(g => g.id === e.closest('[data-g]')?.dataset.g);
  el.querySelector('#an-neu').onclick = vonHand;
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { z.filter = b.dataset.f; render(el); });
  el.querySelectorAll('[data-sicht]').forEach(b => b.onclick = () => { z.ansicht = b.dataset.sicht; render(el); });
  el.querySelectorAll('[data-ins]').forEach(b => b.onclick = () => { z.inserat = z.inserat === b.dataset.ins ? '' : b.dataset.ins; render(el); });
  el.querySelectorAll('[data-insobj]').forEach(s => s.onchange = async () => { await P.inseratZuordnen(s.dataset.insobj, s.value); toast(s.value ? 'Objekt zugeordnet – gilt für alle Anfragen zu diesem Inserat' : 'Zuordnung entfernt'); });
  el.querySelectorAll('[data-mehr]').forEach(b => b.onclick = () => { const id = b.closest('[data-g]').dataset.g; z.auf.has(id) ? z.auf.delete(id) : z.auf.add(id); render(el); });
  el.querySelectorAll('[data-fav]').forEach(b => b.onclick = async () => { const g = grp(b); haptik('leicht'); await P.setzen(g, { favorit: !g.haupt.favorit }); });
  el.querySelectorAll('[data-status]').forEach(s => s.onchange = async () => { const g = grp(s); await P.status(g, s.value); haptik('erfolg'); toast(`${g.name}: ${P.STATUS[s.value].name}`); });
  // Anrufen / WhatsApp / Antworten: aus „Neu“ wird automatisch „Kontaktiert“
  el.querySelectorAll('[data-k]').forEach(a => a.addEventListener('click', () => { const g = grp(a); if (g && st(g) === 'neu') P.status(g, 'kontaktiert'); }));
  el.querySelectorAll('[data-absage]').forEach(a => a.addEventListener('click', () => { const g = grp(a); if (g) { P.status(g, 'absage'); toast(`${g.name}: Absage – Mail-Entwurf geöffnet`); } }));
  el.querySelectorAll('[data-besichtigung]').forEach(b => b.onclick = () => {
    const g = grp(b), h = g.haupt;
    eventForm({ titel: `Besichtigung: ${g.name}`, art: 'Besichtigung', datum: today(), contactId: h.contactId || '', propertyId: P.objektFuer(h) || '', notiz: [g.tel, g.email].filter(Boolean).join(' · ') }, async () => { await P.status(g, 'besichtigung'); toast(`Besichtigung mit ${vorname(g.name)} geplant`); });
  });
  el.querySelectorAll('[data-notiz]').forEach(t => {
    const hoch = () => { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight + 2) + 'px'; }; hoch(); t.oninput = hoch;
    t.onchange = async () => { const g = grp(t); if (g && (g.haupt.notiz || '') !== t.value.trim()) { await P.setzen(g, { notiz: t.value.trim() }); toast('Notiz gespeichert'); } };
  });
}
export const neuAnzahl = P.neuAnzahl;
