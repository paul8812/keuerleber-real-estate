// Posteingang: Mails aus dem Strato-Postfach (Outlook), die der Mail-Abgleich auf dem Mac ins CRM legt.
// Anfragen und Mails bekannter Kontakte ordnet der Abgleich selbst zu; hier landen vor allem unbekannte Absender.
import * as db from '../db.js';
import { html, raw, esc, fmtDT, toast, fullName, modal, sel, today, addDays, debounce } from '../util.js';
import { contactForm, taskForm } from '../forms.js';
import { cLink, empty, badge, contactOpts, contactName } from '../ui.js';
import { ORDNER, verschieben, sortieren, absenderKey } from '../mailsort.js';
import * as ki from '../ki.js';

const FILTERS = [['neu', 'Neu'], ['bearbeitet', 'Bearbeitet'], ['alle', 'Alle']];
const TYP = { anfrage: ['Anfrage', '#5bbf8a'], kontakt: ['Kontakt', '#5fa8d3'], unbekannt: ['Unbekannt', '#e0a84a'] };
let filter = 'neu', ordnerFilter = 'alle', suche = '', gewaehlt = '';

export const mails = () => db.all('mails') || [];
// Portal-Anfragen (ohne-makler) stehen schon unter „Anfragen“ – sie zählen hier nicht mehr als „neu“
const istAnfrage = m => !!db.get('anfragen', 'anf-ohnemakler-' + String(m.id).replace(/^mail-/, ''));
const istNeu = m => m.status === 'neu' && !istAnfrage(m);
export const newCount = () => mails().filter(istNeu).length;

const nameParts = m => {
  const n = (m.vonName || '').replace(/["']/g, '').trim();
  if (!n || n.includes('@')) return { vorname: '', nachname: '' };
  const p = n.split(/\s+/);
  return p.length > 1 ? { vorname: p.slice(0, -1).join(' '), nachname: p[p.length - 1] } : { vorname: '', nachname: p[0] };
};
const snippet = m => (m.text || '').replace(/\s+/g, ' ').slice(0, 160);
const replyHref = m => `mailto:${encodeURIComponent(m.antwortAn || m.vonAdresse || '')}?subject=${encodeURIComponent(/^(aw|re):/i.test(m.betreff || '') ? m.betreff : 'AW: ' + (m.betreff || ''))}`;

async function setStatus(m, status, extra = {}) { await db.save('mails', { ...m, ...extra, status }); }

async function linkTo(m, contactId) {
  await setStatus(m, 'zugeordnet', { contactId });
  await db.log('email', `✉️ E-Mail erhalten: ${m.betreff || '(ohne Betreff)'}\n${snippet(m)}`, { contactId });
}

const ini = m => { const n = (m.vonName || m.vonAdresse || '?').replace(/["'<>]/g, '').trim(); const p = n.includes('@') ? [n] : n.split(/\s+/); return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
const absender = m => (m.typ === 'anfrage' && m.contactId && contactName(m.contactId)) || m.vonName || m.vonAdresse || '(unbekannt)';
const zeit = d => { if (!d) return ''; const t = d.slice(0, 10), h = today(); return t === h ? d.slice(11, 16) : t === addDays(h, -1) ? 'Gestern' : t > addDays(h, -6) ? new Date(d).toLocaleDateString('de-DE', { weekday: 'short' }) : new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: t.slice(0, 4) === h.slice(0, 4) ? undefined : '2-digit' }); };
const tagGruppe = d => { const t = (d || '').slice(0, 10), h = today(); return t === h ? 'Heute' : t === addDays(h, -1) ? 'Gestern' : t > addDays(h, -7) ? 'Diese Woche' : t.slice(0, 7) === h.slice(0, 7) ? 'Diesen Monat' : 'Älter'; };

/** Inhalt einer Mail mit allen Aktionen – wird rechts im Lesebereich (Rechner) oder als Blatt (Handy) gezeigt */
function lesen(m) {
  const o = m.ordner && ORDNER[m.ordner];
  return html`<div class="pe-mail" data-lesen="${m.id}">
    <div class="pe-akt">
      <a class="btn primary" href="${replyHref(m)}" data-a="reply">↩ Antworten</a>
      ${m.status === 'neu' ? html`<button type="button" class="btn" data-a="done">✓ Erledigt</button>` : html`<button type="button" class="btn" data-a="reopen">Wieder als neu</button>`}
      <button type="button" class="btn" data-a="task">Aufgabe</button>
      ${m.contactId ? '' : html`<button type="button" class="btn" data-a="contact">Kontakt anlegen</button><button type="button" class="btn ghost" data-a="link">zuordnen</button>`}
      ${m.status === 'neu' ? html`<button type="button" class="btn ghost" data-a="ignore" title="Aus „Neu“ entfernen, ohne etwas zu tun">Ignorieren</button>` : ''}
    </div>
    <h2 class="pe-betreff">${m.betreff || '(ohne Betreff)'}</h2>
    <div class="pe-von"><span class="pe-av" style="--k:${o ? o.farbe : '#888'}" aria-hidden="true">${ini(m)}</span>
      <div class="grow"><b>${m.vonName || m.vonAdresse}</b>${m.vonName ? html` <span class="muted">&lt;${m.vonAdresse}&gt;</span>` : ''}
        <div class="muted small">${fmtDT(m.datum)}${m.an ? ' · an ' + m.an : ''}${m.contactId ? html` · ${cLink(m.contactId)}` : ''}${istAnfrage(m) ? html` · <a class="lnk" href="#/anfragen">steht unter Anfragen →</a>` : ''}</div>
        ${m.anhaenge?.length ? html`<div class="muted small">📎 ${m.anhaenge.join(', ')}</div>` : ''}</div>
      <label class="pe-ow" title="${m.ordnerVon === 'ki' ? 'von der KI sortiert' : m.ordnerVon === 'hand' ? 'von dir sortiert' : m.ordnerVon ? 'automatisch sortiert' : 'noch nicht sortiert'}"><span class="muted small">Ordner</span>
        <select data-ordner>${Object.entries(ORDNER).map(([k, x]) => html`<option value="${k}" ${k === (m.ordner || '') ? raw('selected') : ''}>${x.name}</option>`)}${m.ordner ? '' : html`<option value="" selected>– unsortiert –</option>`}</select></label></div>
    <div class="pe-text">${m.text || '(kein Text)'}</div>
  </div>`;
}
function bindLesen(root, m, zu = () => {}) {
  const act = {
    reply: async () => { if (m.contactId) await db.log('email', `✉️ Antwort auf „${m.betreff || ''}“ in Outlook geöffnet`, { contactId: m.contactId }); },
    contact: () => { zu(); contactForm({ ...nameParts(m), email: m.vonAdresse, kategorie: 'Interessent (Kauf)', quelle: 'Sonstige', status: 'Aktiv', notiz: `Erste Mail: ${m.betreff || ''}` }, async c => { await linkTo(m, c.id); toast('Kontakt angelegt und Mail zugeordnet'); }); },
    link: () => { zu(); modal('Mail einem Kontakt zuordnen', html`${sel('contactId', 'Kontakt', contactOpts(), '', { blank: 1, cls: 'full' })}`, { saveLabel: 'Zuordnen', onSave: async v => { if (!v.contactId) { toast('Bitte Kontakt wählen', 'err'); return false; } await linkTo(m, v.contactId); toast('Zugeordnet'); } }); },
    task: () => { zu(); taskForm({ titel: `Antworten: ${m.vonName || m.vonAdresse} – ${m.betreff || ''}`, contactId: m.contactId || '', notiz: snippet(m), prio: 'normal' }, async () => { if (m.status === 'neu') await setStatus(m, 'erledigt'); }); },
    done: async () => { zu(); weiter(m); await setStatus(m, 'erledigt'); toast('Erledigt', 'ok', { label: 'Rückgängig', fn: () => setStatus(db.get('mails', m.id), 'neu') }); },
    ignore: async () => { zu(); weiter(m); await setStatus(m, 'ignoriert'); toast('Ignoriert', 'ok', { label: 'Rückgängig', fn: () => setStatus(db.get('mails', m.id), 'neu') }); },
    reopen: async () => { zu(); await setStatus(m, 'neu'); },
  };
  root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act[b.dataset.a]()));
  root.querySelector('[data-ordner]')?.addEventListener('change', async e => {
    const o = e.target.value; if (!o) return;
    const mit = await verschieben(m, o), wer = absenderKey(m).replace(/^(domain|adresse):/, '');
    toast(`In „${ORDNER[o].name}“ verschoben${wer ? ` – Mails von ${wer} landen ab jetzt automatisch dort` : ''}${mit ? ` (${mit} weitere umsortiert)` : ''}`);
  });
}
// nach „Erledigt“ gleich die nächste Mail der Liste zeigen
let reihenfolge = [];
function weiter(m) { const i = reihenfolge.indexOf(m.id); gewaehlt = i >= 0 ? reihenfolge[i + 1] || reihenfolge[i - 1] || '' : ''; }
function blatt(m) { const { el, close } = modal(m.betreff || '(ohne Betreff)', lesen(m), { wide: true }); el.querySelector('.pe-betreff')?.remove(); bindLesen(el, m, close); }
const breit = () => window.matchMedia('(min-width: 1000px)').matches;

export function render(el, arg) {
  if (arg && db.get('mails', arg)) { gewaehlt = arg; filter = 'alle'; ordnerFilter = 'alle'; }
  const all = mails().slice().sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  // archiv = ältere Mails unbekannter Absender aus der rückwirkenden Übernahme (nur unter „Alle“)
  const stat = { neu: istNeu, bearbeitet: m => !['neu', 'ignoriert', 'archiv'].includes(m.status) || (m.status === 'neu' && istAnfrage(m)), alle: () => true };
  const w = suche.toLowerCase().split(/\s+/).filter(Boolean);
  const passt = m => !w.length || w.every(x => [m.vonName, m.vonAdresse, m.betreff, m.text].join(' ').toLowerCase().includes(x));
  const nachStatus = all.filter(stat[filter]).filter(passt);
  const zahl = k => nachStatus.filter(m => (m.ordner || '') === k).length, unsortiert = nachStatus.filter(m => !m.ordner).length;
  if (ordnerFilter !== 'alle' && !zahl(ordnerFilter)) ordnerFilter = 'alle';
  const list = ordnerFilter === 'alle' ? nachStatus : nachStatus.filter(m => m.ordner === ordnerFilter);
  reihenfolge = list.map(m => m.id);
  const st = db.get('sync', 'mailsync'), neuN = newCount();
  const zeigen = list.slice(0, 300), gruppen = []; for (const m of zeigen) { const g = tagGruppe(m.datum); if (!gruppen.length || gruppen[gruppen.length - 1][0] !== g) gruppen.push([g, []]); gruppen[gruppen.length - 1][1].push(m); }
  const sel = breit() ? (list.find(m => m.id === gewaehlt) || (gewaehlt ? db.get('mails', gewaehlt) : null) || list[0] || null) : null;
  if (sel) gewaehlt = sel.id;
  const scroll = el.querySelector('.pe-liste')?.scrollTop || 0, fokus = document.activeElement?.id === 'pe-suche';
  el.innerHTML = html`<div class="pe">
    <div class="pe-kopf"><h1>Posteingang</h1>
      <label class="pe-such"><span aria-hidden="true">⌕</span><input id="pe-suche" type="search" placeholder="Absender, Betreff oder Text suchen" value="${suche}" aria-label="Im Posteingang suchen"></label>
      <span class="muted small pe-sync">${st ? (st.error ? html`⚠️ ${st.error}` : html`abgeglichen ${fmtDT(st.lastOk || st.lastRun)}`) : 'Mail-Abgleich noch nicht eingerichtet'}</span></div>
    <div class="pe-body">
      <nav class="pe-ordner" aria-label="Ordner">
        ${FILTERS.map(([k, l]) => html`<button type="button" class="${k === filter ? 'on' : ''}" data-f="${k}"><span>${{ neu: '●', bearbeitet: '✓', alle: '≡' }[k]}</span><b>${l}</b>${k === 'neu' && neuN ? html`<i class="gold">${neuN}</i>` : ''}</button>`)}
        <hr>
        <button type="button" class="${ordnerFilter === 'alle' ? 'on' : ''}" data-o="alle"><span>▢</span><b>Alle Ordner</b><i>${nachStatus.length}</i></button>
        ${Object.entries(ORDNER).filter(([k]) => zahl(k)).map(([k, o]) => html`<button type="button" class="${ordnerFilter === k ? 'on' : ''}" data-o="${k}"><span class="kd" style="--k:${o.farbe}"></span><b>${o.name}</b><i>${zahl(k)}</i></button>`)}
        ${unsortiert ? html`<p class="muted small">${unsortiert} werden gerade sortiert …</p>` : ''}
        <hr><button type="button" class="pe-neu" data-sort title="Alle automatisch sortierten Mails neu einordnen (von Hand sortierte bleiben)"><span>⟳</span><b>Neu sortieren</b></button>
      </nav>
      <div class="pe-mitte">
        <div class="pe-leiste"><b>${{ neu: 'Neu', bearbeitet: 'Bearbeitet', alle: 'Alle Mails' }[filter]}${ordnerFilter !== 'alle' ? ' · ' + ORDNER[ordnerFilter].name : ''}</b><span class="muted small">${list.length} ${list.length === 1 ? 'Mail' : 'Mails'}${list.length > 300 ? ' · die neuesten 300' : ''}</span>
          ${filter === 'neu' && list.length > 1 ? html`<button type="button" class="btn ghost small" data-alle>Alle ${list.length} erledigen</button>` : ''}</div>
        <div class="pe-liste">${zeigen.length ? gruppen.map(([g, L]) => html`<div class="pe-tag">${g}</div><ul class="list mails">${L.map(m => { const o = m.ordner && ORDNER[m.ordner]; return html`<li data-m="${m.id}" class="${istNeu(m) ? 'unread' : ''} ${sel && sel.id === m.id ? 'sel' : ''}">
            <span class="pe-av" style="--k:${o ? o.farbe : '#888'}" aria-hidden="true">${ini(m)}</span>
            <div class="grow"><div class="pe-z1"><span class="ttl">${absender(m)}</span><time>${zeit(m.datum)}</time></div>
              <div class="pe-z2">${m.typ === 'anfrage' ? `Anfrage über ${m.quelle || 'Website'}` : m.betreff || '(ohne Betreff)'}</div>
              <div class="pe-z3"><span class="sub">${snippet(m)}</span>${istAnfrage(m) ? html`<em class="pe-anf">Anfrage</em>` : ''}${o && ordnerFilter === 'alle' ? html`<em style="--k:${o.farbe}">${o.name}</em>` : ''}</div></div>
            ${istNeu(m) ? html`<button type="button" class="pe-ok" data-ok title="Erledigt" aria-label="${absender(m)}: als erledigt markieren">✓</button>` : ''}</li>`; })}</ul>`)
          : html`<div class="pe-leer">${suche ? html`<b>Nichts gefunden</b><span>Keine Mail passt zu „${suche}“.</span>` : filter === 'neu' ? html`<b>Alles erledigt ✓</b><span>Keine neuen Mails${ordnerFilter !== 'alle' ? ' in diesem Ordner' : ''}.</span>` : html`<b>Keine Mails</b><span>${st ? '' : 'Den Mail-Abgleich richtest du einmal unter Automationen → E-Mail ein.'}</span>`}</div>`}</div>
      </div>
      <aside class="pe-lesen">${sel ? lesen(sel) : html`<div class="pe-leer"><b>Keine Mail ausgewählt</b><span>Links eine Mail antippen – hier erscheint sie mit allen Aktionen.</span></div>`}</aside>
    </div></div>`.s;
  const ls = el.querySelector('.pe-liste'); if (ls) ls.scrollTop = scroll;
  const inp = el.querySelector('#pe-suche'); inp.oninput = debounce(() => { suche = inp.value.trim(); render(el); }, 180); if (fokus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; gewaehlt = ''; render(el); });
  el.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { ordnerFilter = b.dataset.o; gewaehlt = ''; render(el); });
  el.querySelector('[data-sort]')?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; b.querySelector('b').textContent = 'sortiere …';
    try { const n = await sortieren({ nurNeue: false }); toast(n ? `${n} Mails sortiert${ki.hasKey() ? '' : ' (ohne KI-Schlüssel nur nach Stichwörtern)'}` : 'Alles schon sortiert'); }
    catch (err) { toast('Sortieren fehlgeschlagen: ' + err.message, 'err'); } finally { b.disabled = false; }
  });
  el.querySelector('[data-alle]')?.addEventListener('click', async () => {
    const ids = list.filter(istNeu).map(m => m.id); if (!ids.length) return;
    const { confirmDlg } = await import('../util.js'); if (!(await confirmDlg(`${ids.length} Mails als erledigt markieren? In deinem Postfach ändert sich nichts.`))) return;
    for (const id of ids) await setStatus(db.get('mails', id), 'erledigt');
    toast(`${ids.length} Mails erledigt`, 'ok', { label: 'Rückgängig', fn: async () => { for (const id of ids) await setStatus(db.get('mails', id), 'neu'); } });
  });
  el.querySelectorAll('[data-ok]').forEach(b => b.onclick = async e => { e.stopPropagation(); const m = db.get('mails', b.closest('[data-m]').dataset.m); if (gewaehlt === m.id) weiter(m); await setStatus(m, 'erledigt'); toast('Erledigt', 'ok', { label: 'Rückgängig', fn: () => setStatus(db.get('mails', m.id), 'neu') }); });
  el.querySelectorAll('[data-m]').forEach(li => li.onclick = e => { if (e.target.closest('a, button')) return; const m = db.get('mails', li.dataset.m); if (breit()) { gewaehlt = m.id; render(el); } else blatt(m); });
  const lp = el.querySelector('[data-lesen]'); if (lp && sel) bindLesen(lp, sel);
  if (arg && !breit() && db.get('mails', arg)) blatt(db.get('mails', arg));
}
