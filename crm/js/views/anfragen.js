// Anfragen: alle Interessenten-Anfragen aus den Portalen (ohne-makler.net) an einem Ort.
// Kommen automatisch aus dem Gmail-Postfach (geplanter Abruf) – mit Kontaktdaten, Nachricht und Zusatzangaben.
// Hier: sichten, vergleichen, mit einem Tipp anrufen/antworten, Besichtigung planen, zu- oder absagen.
import * as db from '../db.js';
import * as P from '../portal.js';
import { html, raw, esc, modal, toast, fmtDT, fullName, uid, today } from '../util.js';
import { eventForm } from '../forms.js';
import { vorWann } from '../kontakt.js';
import { haptik } from '../haptik.js';
import * as KL from '../kundenlinks.js';

const z = { filter: 'offen', inserat: '', ansicht: 'karten', auf: new Set(), archivAuf: false };
const FILTER = [['offen', 'Offen', g => P.OFFEN.includes(st(g))], ['neu', 'Neu', g => st(g) === 'neu'], ['versucht', 'Nicht erreicht', g => st(g) === 'versucht'], ['kontaktiert', 'Kontaktiert', g => st(g) === 'kontaktiert'], ['besichtigung', 'Besichtigung', g => st(g) === 'besichtigung'],
  ['zusage', 'Zusage', g => st(g) === 'zusage'], ['erledigt', 'Absage / abgelegt', g => ['absage', 'archiv'].includes(st(g))], ['alle', 'Alle', () => true]];
const st = g => g.haupt.status || 'neu';
const telNr = t => String(t || '').replace(/[^\d+]/g, '');
const wa = t => telNr(t).replace(/^\+/, '').replace(/^0/, '49');
const initialen = n => String(n || '?').replace(/^(Herr|Frau)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const vorname = n => String(n || '').trim().split(/\s+/)[0] || '';
const stBadge = s => html`<span class="an-st" style="--a:${P.STATUS[s]?.farbe || '#888'}">${P.STATUS[s]?.name || s}</span>`;
const inseratK = g => P.ordnerK(g.haupt);
const ALLE = '*';

function mailLink(g, art) {
  const S = db.settings(), h = g.haupt, was = h.inseratTitel ? `„${h.inseratTitel.split(' - ')[0]}“` : 'unsere Wohnung';
  const gruss = `\n\nMit freundlichen Grüßen\n${S.inhaber || ''}\n${S.firma || ''}${S.tel ? '\nTel. ' + S.tel : ''}`;
  const text = art === 'absage'
    ? `Guten Tag ${g.name},\n\nvielen Dank für Ihr Interesse an ${was}. Leider müssen wir Ihnen mitteilen, dass die Wohnung inzwischen anderweitig vergeben wurde.\n\nWir wünschen Ihnen viel Erfolg bei der weiteren Suche.${gruss}`
    : `Guten Tag ${g.name},\n\nvielen Dank für Ihre Anfrage zu ${was}. Gerne zeige ich Ihnen die Wohnung – wann würde es Ihnen passen?\n\nMögliche Termine:\n– \n– ${gruss}`;
  return `mailto:${encodeURIComponent(g.email)}?subject=${encodeURIComponent((art === 'absage' ? 'Ihre Anfrage: ' : 'Besichtigung: ') + (h.inseratTitel || 'Wohnung').split(' - ').slice(0, 2).join(' – '))}&body=${encodeURIComponent(text)}`;
}

const kurz = t => String(t || '').split(' - ').slice(0, 2).join(' – ');
function ordnerKarte(i) {
  return html`<div class="an-ord ${i.archiv ? 'archiv' : i.neu ? 'neu' : ''} ${i.bilder.length ? 'mitbild' : ''}" data-ord="${i.k}">
    ${i.bilder.length ? html`<button type="button" class="an-ordbild" data-ins="${i.k}" aria-label="Ordner ${i.name} öffnen"><img data-bild="${i.bilder[0]}" alt="" loading="lazy">${i.bilder.length > 1 ? html`<span>${i.bilder.length} Bilder</span>` : ''}</button>` : ''}
    <button type="button" class="an-ordb" data-ins="${i.k}" aria-label="Ordner ${i.name} öffnen">
      ${i.bilder.length ? '' : html`<span class="an-ordi" aria-hidden="true">${i.archiv ? '🗄' : '📁'}</span>`}
      <span class="an-ordt"><b>${i.name}</b><small>${i.nummern.length ? i.nummern.join(' + ') : 'ohne Inserat-Nummer'}${i.titel && i.name !== i.titel ? ' · ' + kurz(i.titel) : ''}</small></span>
    </button>
    <div class="an-ordz">${i.neu ? html`<span class="an-z gold">${i.neu} neu</span>` : ''}<span class="an-z">${i.offen} offen</span><span class="an-z">${i.n} gesamt</span>${i.letzte ? html`<small class="muted">letzte ${vorWann(i.letzte)}</small>` : ''}</div>
    <div class="an-ordf"><small class="${i.objekt ? '' : 'muted'}">${i.objekt ? '⌂ ' + (i.objekt.nr ? i.objekt.nr + ' · ' : '') + i.objekt.titel : 'noch keinem Objekt zugeordnet'}</small>
      <span class="an-ordk"><button type="button" class="btn ghost small" data-ordbilder="${i.k}">🖼 Bilder</button><button type="button" class="btn ghost small" data-ordedit="${i.k}">✎ Benennen / zuordnen</button></span></div>
  </div>`;
}
function ordnerDlg(k, el) {
  const i = P.inserate().find(x => x.k === k); if (!i) return;
  const andere = P.inserate().filter(x => x.k !== k);
  modal('Ordner ' + (i.nummern[0] || i.name), html`
    <p class="muted small full" style="margin:0">${i.nummern.length ? 'Inserat ' + i.nummern.join(' + ') : 'Ohne Inserat-Nummer'}${i.titel ? ' · ' + i.titel : ''} · ${i.n} Anfrage${i.n === 1 ? '' : 'n'}</p>
    <label class="f full"><span>Name des Ordners</span><input name="name" value="${i.eigen}" placeholder="${(i.objekt && i.objekt.titel) || i.nr || 'z. B. Ludwigstraße 12 – 3 Zi. EG'}" autocomplete="off"></label>
    <label class="f full"><span>Objekt</span><select name="propertyId"><option value="">– kein Objekt –</option>${db.all('properties').map(p => html`<option value="${p.id}" ${p.id === i.propertyId ? raw('selected') : ''}>${p.nr ? p.nr + ' · ' : ''}${p.titel}</option>`)}</select></label>
    ${andere.length ? html`<label class="f full"><span>Mit anderem Ordner zusammenlegen</span><select name="in"><option value="">– eigener Ordner –</option>${andere.map(x => html`<option value="${x.k}">${x.name}${x.nummern.length && x.name !== x.nummern[0] ? ' (' + x.nummern.join(' + ') + ')' : ''}</option>`)}</select><small class="muted">Für dieselbe Wohnung, die unter zwei Nummern inseriert war. Lässt sich wieder trennen.</small></label>` : ''}
    <div class="f full an-arch"><button type="button" class="btn" id="an-archiv">${i.archiv ? '↩ Aus dem Archiv zurückholen' : '🗄 Ordner archivieren'}</button><small class="muted">${i.archiv ? 'Der Ordner erscheint wieder in der Übersicht.' : 'Räumt den Ordner aus der Übersicht – nichts wird gelöscht. Kommt eine neue Anfrage zu diesem Inserat, taucht er von selbst wieder auf.'}</small></div>
    ${i.teile.length ? html`<div class="f full"><span>In diesem Ordner zusammengelegt</span>${i.teile.map(t => html`<div class="an-teil"><span>${t.nr || t.titel}${t.nr && t.titel ? html` <small class="muted">${kurz(t.titel)}</small>` : ''}</span><button type="button" class="btn ghost small" data-trennen="${t.k}">Trennen</button></div>`)}</div>` : ''}`, {
    saveLabel: 'Speichern',
    danger: { label: 'Ordner löschen', confirm: `Ordner „${i.name}“ mit ${i.n} Anfrage${i.n === 1 ? '' : 'n'} endgültig löschen?\n\nDie Anfragen, ihre Vorgänge bei den Mietinteressenten und die Bilder werden gelöscht – das lässt sich nicht rückgängig machen. Die Kontakte bleiben erhalten.\n\nTipp: „Archivieren“ räumt den Ordner nur weg.`, fn: async () => { const r = await P.ordnerLoeschen(k); if (z.inserat === k) z.inserat = ''; toast(`Ordner gelöscht (${r.anfragen} Anfrage${r.anfragen === 1 ? '' : 'n'})`); render(el); } },
    onMount: (m, close) => {
      m.querySelectorAll('[data-trennen]').forEach(b => b.onclick = async () => { await P.ordnerSpeichern(b.dataset.trennen, { in: '' }); close(); toast('Ordner getrennt'); render(el); });
      m.querySelector('#an-archiv').onclick = async () => { const an = !i.archiv; await P.ordnerArchivieren(k, an); if (an && z.inserat === k) z.inserat = ''; close(); toast(an ? `„${i.name}“ archiviert` : `„${i.name}“ zurückgeholt`, 'ok', { label: 'Rückgängig', fn: async () => { await P.ordnerArchivieren(k, !an); render(el); } }); render(el); };
    },
    onSave: async v => {
      try { await P.ordnerSpeichern(k, { name: v.name, propertyId: v.propertyId, in: v.in || undefined }); } catch (e) { toast(e.message, 'err'); return false; }
      if (v.in) { z.inserat = v.in; toast('Ordner zusammengelegt'); } else toast('Ordner gespeichert');
      render(el);
    },
  });
}

// ---- Bilder je Ordner (verkleinert als Datei gespeichert, auf allen Geräten gleich; das erste ist das Titelbild)
const bildCache = new Map();
function bilderLaden(root) {
  root.querySelectorAll('img[data-bild]').forEach(async img => {
    const id = img.dataset.bild;
    try { if (!bildCache.has(id)) bildCache.set(id, (await db.getFile(id))?.dataUrl || ''); if (bildCache.get(id)) img.src = bildCache.get(id); else img.closest('button, .an-bk')?.classList.add('fehlt'); } catch { img.closest('button, .an-bk')?.classList.add('fehlt'); }
  });
}
async function bildVerkleinern(f) {
  const bmp = await createImageBitmap(f), s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
function bilderDlg(k, el) {
  const ord = () => P.inserate().find(x => x.k === k); if (!ord()) return;
  modal('Bilder – ' + ord().name, html`<div class="full an-bilder" id="an-bilder"></div>
    <div class="full"><button type="button" class="btn primary" id="an-bildneu">＋ Bilder hinzufügen</button> <small class="muted">Mehrere auf einmal möglich. Das erste Bild ist das Titelbild des Ordners.</small></div>`, {
    wide: true, saveLabel: 'Fertig',
    onMount: m => {
      const box = m.querySelector('#an-bilder');
      const zeichnen = () => {
        const B = ord()?.bilder || [];
        box.innerHTML = B.length ? String(html`${B.map((id, n) => html`<div class="an-bk" data-id="${id}"><img data-bild="${id}" alt="">${n === 0 ? html`<span class="an-btitel">Titelbild</span>` : ''}
          <div class="an-bkn">${n > 0 ? html`<button type="button" class="btn ghost small" data-titel>Als Titelbild</button>` : ''}<button type="button" class="btn ghost small" data-weg aria-label="Bild entfernen">Entfernen</button></div></div>`)}`) : '<p class="muted">Noch keine Bilder in diesem Ordner.</p>';
        bilderLaden(box);
        box.querySelectorAll('[data-weg]').forEach(b => b.onclick = async () => { const id = b.closest('[data-id]').dataset.id; await P.bilderSetzen(k, (ord().bilder).filter(x => x !== id)); db.delFile(id).catch(() => {}); bildCache.delete(id); zeichnen(); render(el); });
        box.querySelectorAll('[data-titel]').forEach(b => b.onclick = async () => { const id = b.closest('[data-id]').dataset.id; await P.bilderSetzen(k, [id, ...ord().bilder.filter(x => x !== id)]); zeichnen(); render(el); });
      };
      zeichnen();
      m.querySelector('#an-bildneu').onclick = () => {
        const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
        i.onchange = async () => {
          const F = [...i.files].slice(0, 20); if (!F.length) return; let ok = 0;
          toast(`${F.length} Bild${F.length === 1 ? '' : 'er'} wird gespeichert …`);
          for (const f of F) {
            try { const id = 'anf-bild-' + uid(), url = await bildVerkleinern(f); await db.putFile(id, url, { name: f.name, typ: 'image/jpeg' }); bildCache.set(id, url); await P.bilderSetzen(k, [...(ord()?.bilder || []), id]); ok++; zeichnen(); }
            catch (e) { toast(`${f.name}: konnte nicht gelesen werden`, 'err'); }
          }
          if (ok) { haptik('erfolg'); toast(`${ok} Bild${ok === 1 ? '' : 'er'} gespeichert`); render(el); }
        };
        i.click();
      };
    },
    onSave: async () => {},
  });
}
function bildGross(k, n) {
  const B = P.inserate().find(x => x.k === k)?.bilder || []; if (!B.length) return;
  const d = document.createElement('div'); d.className = 'an-gross'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Bild');
  const zeig = () => { d.innerHTML = String(html`<button type="button" class="an-gx" data-zu aria-label="Schließen">✕</button>${B.length > 1 ? html`<button type="button" class="an-gp l" data-d="-1" aria-label="Vorheriges Bild">‹</button><button type="button" class="an-gp r" data-d="1" aria-label="Nächstes Bild">›</button>` : ''}<img data-bild="${B[n]}" alt=""><small>${n + 1} / ${B.length}</small>`); bilderLaden(d); };
  const zu = () => { d.remove(); document.removeEventListener('keydown', taste); };
  const taste = e => { if (e.key === 'Escape') zu(); else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { n = (n + (e.key === 'ArrowRight' ? 1 : -1) + B.length) % B.length; zeig(); } };
  d.onclick = e => { const p = e.target.closest('[data-d]'); if (p) { n = (n + Number(p.dataset.d) + B.length) % B.length; zeig(); } else if (e.target.tagName !== 'IMG') zu(); };
  document.addEventListener('keydown', taste); document.body.appendChild(d); zeig();
}

export function render(el) {
  const alleIns = P.inserate(), ins = alleIns.filter(i => !i.archiv), archiv = alleIns.filter(i => i.archiv);
  const offenArchiv = archiv.find(i => i.k === z.inserat);
  const G = offenArchiv ? P.gruppen() : P.aktiveGruppen();
  if (z.inserat && z.inserat !== ALLE && !alleIns.some(i => i.k === z.inserat)) z.inserat = '';
  const einzel = ins.length === 1 && !archiv.length, ord = einzel && z.inserat !== ALLE ? ins[0] : alleIns.find(i => i.k === z.inserat), offenO = z.inserat !== '' || einzel;
  const imIns = ord ? G.filter(g => inseratK(g) === ord.k) : G;
  const f = FILTER.find(x => x[0] === z.filter) || FILTER[0], liste = imIns.filter(f[2]);
  const n = k => imIns.filter(FILTER.find(x => x[0] === k)[2]).length;
  const neuester = G.reduce((m, g) => (g.letzte.importiert || '') > m ? g.letzte.importiert : m, '');
  el.innerHTML = String(html`<div class="an">
    <div class="head"><div><h1>Anfragen</h1><p class="muted">Interessenten aus deinen Portalen – je Inserat ein Ordner. Ordner kannst du benennen, einem Objekt zuordnen oder zusammenlegen.</p></div>
      <div class="actions"><button type="button" class="btn" id="an-neu">+ Anfrage von Hand</button></div></div>
    ${offenO ? html`<div class="an-pfad">${einzel ? '' : html`<button type="button" class="btn ghost small" data-ins="">← Alle Ordner</button>`}
      <div class="an-pfadt"><b>${ord && ord.archiv ? '🗄' : '📁'} ${ord ? ord.name : 'Alle Anfragen'}${ord && ord.archiv ? html` <span class="an-z">Archiv</span>` : ''}</b><small class="muted">${ord ? [ord.nummern.join(' + '), ord.titel && ord.name !== ord.titel ? kurz(ord.titel) : '', ord.objekt ? '⌂ ' + ord.objekt.titel : 'kein Objekt zugeordnet'].filter(Boolean).join(' · ') : 'aus allen Ordnern'}</small></div>
      ${ord ? html`<button type="button" class="btn small" data-ordbilder="${ord.k}">🖼 Bilder${ord.bilder.length ? ' (' + ord.bilder.length + ')' : ' hinzufügen'}</button><button type="button" class="btn small" data-ordedit="${ord.k}">✎ Benennen / zuordnen</button>${(() => { const T = KL.terminStand(ord.k); return html`<button type="button" class="btn small" data-termine="${ord.k}">🗓 Besichtigungstermine${T.link ? ` (${T.frei} frei${T.gebucht ? ` · ${T.gebucht} gebucht` : ''})` : ''}</button>`; })()}${ord.url ? html`<a class="lnk small" href="${ord.url}" target="_blank" rel="noopener">Inserat ansehen ↗</a>` : ''}` : ''}</div>` : ''}
    ${ord && ord.bilder.length ? html`<div class="an-galerie">${ord.bilder.map((id, n) => html`<button type="button" data-zeig="${n}" data-ordk="${ord.k}" aria-label="Bild ${n + 1} groß ansehen"><img data-bild="${id}" alt="" loading="lazy"></button>`)}</div>` : ''}
    <div class="kpis strip an-kpis">
      <div class="kpi"><span>Neu</span><b class="${n('neu') ? 'gold' : ''}">${n('neu')}</b></div>
      <div class="kpi"><span>In Bearbeitung</span><b>${n('kontaktiert') + n('besichtigung')}</b></div>
      <div class="kpi"><span>Besichtigungen</span><b>${n('besichtigung')}</b></div>
      <div class="kpi"><span>Zusagen</span><b>${n('zusage')}</b></div>
      <div class="kpi"><span>Gesamt</span><b>${imIns.length}</b></div>
    </div>
    ${!G.length ? html`<div class="card an-leer"><h3>Noch keine Anfragen</h3><p class="muted">Sobald eine Anfrage von ohne-makler in deinem Postfach landet, erscheint sie hier – mit Name, E-Mail, Nachricht und den Angaben zu Haushalt, Einkommen und Schufa.</p></div>`
      : !offenO ? html`${!ins.length ? html`<div class="card an-leer"><p class="muted">Alle Ordner liegen im Archiv.</p></div>` : ''}<div class="an-ords">${ins.map(ordnerKarte)}
          ${ins.length > 1 ? html`<div class="an-ord alle"><button type="button" class="an-ordb" data-ins="${ALLE}"><span class="an-ordi" aria-hidden="true">🗂</span><span class="an-ordt"><b>Alle Anfragen</b><small>aus allen ${ins.length} Ordnern in einer Liste</small></span></button><div class="an-ordz"><span class="an-z">${G.filter(g => P.OFFEN.includes(st(g))).length} offen</span><span class="an-z">${G.length} gesamt</span></div></div>` : ''}</div>
          ${archiv.length ? html`<button type="button" class="an-archt" id="an-archt" aria-expanded="${z.archivAuf}">🗄 Archiv (${archiv.length} Ordner) ${z.archivAuf ? '▾' : '▸'}</button>${z.archivAuf ? html`<div class="an-ords">${archiv.map(ordnerKarte)}</div>` : ''}` : ''}`
      : html`<div class="an-bar">
      <div class="chips" role="group" aria-label="Status">${FILTER.map(([k, l]) => html`<button type="button" class="chip ${z.filter === k ? 'on' : ''}" data-f="${k}">${l}${n(k) && k !== 'alle' ? html` <i>${n(k)}</i>` : ''}</button>`)}</div>
      <div class="seg an-sicht" role="group" aria-label="Ansicht"><button type="button" data-sicht="karten" class="${z.ansicht === 'karten' ? 'on' : ''}">Karten</button><button type="button" data-sicht="vergleich" class="${z.ansicht === 'vergleich' ? 'on' : ''}">Vergleich</button></div>
    </div>
    ${!liste.length ? html`<div class="card an-leer"><p class="muted">Keine Anfragen in „${f[1]}“.</p>${z.filter !== 'alle' && imIns.length ? html`<p><button type="button" class="btn" data-f="alle">Alle ${imIns.length} Anfragen zeigen</button></p>` : ''}</div>`
      : z.ansicht === 'vergleich' ? vergleich(liste) : html`<div class="an-liste">${liste.map(g => karte(g, ins))}</div>`}`}
    <p class="muted small an-fuss">Anfrage-Mails von ohne-makler werden automatisch aus dem CRM-Posteingang übernommen (zusätzlich zweimal täglich aus Gmail).${neuester ? ` Letzte neue Anfrage übernommen ${vorWann(neuester)}.` : ''} Mehrere Mails derselben Person zum selben Inserat zählen als eine Anfrage.</p>
  </div>`);
  binden(el);
}

function karte(g, ins = []) {
  const h = g.haupt, s = st(g), auf = z.auf.has(g.id), ang = P.angabenListe(g.angaben), c = h.contactId && db.get('contacts', h.contactId);
  const lang = (g.letzte.nachricht || '').length > 260 || g.nachrichten.length > 1 || (h.versuche || []).length > 3;
  return html`<article class="card an-karte ${s}" data-g="${g.id}">
    <header class="an-kopf">
      <span class="an-av" aria-hidden="true">${initialen(g.name)}</span>
      <div class="an-wer"><b>${g.name}</b><small class="muted">${vorWann(g.eingang)} · ${fmtDT(g.eingang)}${g.alle.length > 1 ? ` · ${g.alle.length} Mails` : ''}${z.inserat === ALLE ? ' · ' + (ins.find(i => i.k === inseratK(g))?.name || h.inseratNr || '') : ''}</small></div>
      ${(() => { const i = P.versucheInfo(h); return i && i.fehl ? html`<span class="an-fehl" title="Anrufversuche ohne Erfolg">📵 ${i.fehl}×</span>` : ''; })()}
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
    ${['absage', 'archiv'].includes(s) ? '' : html`<div class="an-kontakt kl-knoepfe">
      <button type="button" class="btn small" data-terminlink title="Interessent sucht sich selbst einen Besichtigungstermin aus">🗓 Terminlink schicken</button>
      <button type="button" class="btn small" data-auskunft title="Selbstauskunft als Online-Formular anfordern">📝 Selbstauskunft anfordern</button>
    </div>`}
    ${KL.anfrageStatus(g, ins.find(i => i.k === inseratK(g)))}
    <div class="an-erg" role="group" aria-label="Ergebnis festhalten"><span class="muted small">Ergebnis:</span>${Object.entries(P.VERSUCH).map(([k, v]) => html`<button type="button" class="chip an-vb" data-versuch="${k}">${v.icon} ${v.name}</button>`)}</div>
    ${(h.versuche || []).length ? html`<ul class="an-verlauf">${[...h.versuche].reverse().slice(0, auf ? 20 : 3).map(v => html`<li><span aria-hidden="true">${P.VERSUCH[v.art]?.icon || '•'}</span><b>${P.VERSUCH[v.art]?.name || v.art}</b><small class="muted">${vorWann(v.zeit)} · ${fmtDT(v.zeit)}</small>${v.notiz ? html`<em>${v.notiz}</em>` : ''}</li>`)}${!auf && h.versuche.length > 3 ? html`<li class="muted small">+ ${h.versuche.length - 3} frühere</li>` : ''}</ul>` : ''}
    <footer class="an-fuss2">
      <label class="an-stsel"><span class="muted small">Status</span><select data-status aria-label="Status von ${g.name}">${Object.entries(P.STATUS).map(([k, v]) => html`<option value="${k}" ${k === s ? raw('selected') : ''}>${v.name}</option>`)}</select></label>
      ${g.email && !['absage', 'archiv'].includes(s) ? html`<a class="btn ghost small" href="${mailLink(g, 'absage')}" data-absage>Absage schreiben</a>` : ''}
      ${ins.length > 1 ? html`<label class="an-stsel"><span class="muted small">Ordner</span><select data-ordner aria-label="Ordner von ${g.name}">${ins.map(i => html`<option value="${i.k}" ${i.k === inseratK(g) ? raw('selected') : ''}>${i.name}</option>`)}</select></label>` : ''}
      ${c ? html`<a class="lnk small" href="#/kontakte/${c.id}">Kontakt öffnen →</a>` : ''}
    </footer>
    <textarea class="an-notiz" data-notiz rows="1" placeholder="Notiz (z. B. Eindruck am Telefon, Wunschtermin)" aria-label="Notiz zu ${g.name}">${h.notiz || ''}</textarea>
  </article>`;
}
function vergleich(liste) {
  const sp = [['Haushalt', /haushalt/i], ['Arbeit', /arbeit/i], ['Einkommen', /einkommen/i], ['Schufa', /schufa/i], ['Haustiere', /haustier/i]];
  const wert = (g, re) => (P.angabenListe(g.angaben).find(([k]) => re.test(k)) || [])[1] || '–';
  return html`<div class="card flush an-vgl"><table class="tbl"><thead><tr><th></th><th>Name</th><th>Eingang</th>${sp.map(([l]) => html`<th>${l}</th>`)}<th>Versuche</th><th>Kontakt</th><th>Status</th></tr></thead><tbody>
    ${liste.map(g => html`<tr data-g="${g.id}"><td><button type="button" class="an-fav ${g.haupt.favorit ? 'on' : ''}" data-fav aria-label="Favorit">★</button></td><td><b>${g.name}</b>${g.haupt.notiz ? html`<br><small class="muted">${g.haupt.notiz}</small>` : ''}</td><td>${fmtDT(g.eingang).slice(0, 6)}</td>${sp.map(([, re]) => html`<td>${wert(g, re)}</td>`)}
      <td>${(() => { const i = P.versucheInfo(g.haupt); return i ? html`${i.fehl ? `📵 ${i.fehl}× ` : ''}${i.erreicht ? '✅ ' : ''}<small class="muted">${vorWann(i.letzter.zeit)}</small>` : html`<span class="muted">–</span>`; })()}</td>
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
    <label class="f full"><span>Inserat / Wohnung</span><input name="inserat" list="an-ins" value="${(ins.find(i => i.k === z.inserat) || (ins.length === 1 ? ins[0] : null))?.nr || ''}" placeholder="z. B. OM-493407 oder „3-Zi-Wohnung Hof“"></label>
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
  { const a = el.querySelector('#an-archt'); if (a) a.onclick = () => { z.archivAuf = !z.archivAuf; render(el); }; }
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { z.filter = b.dataset.f; render(el); });
  el.querySelectorAll('[data-sicht]').forEach(b => b.onclick = () => { z.ansicht = b.dataset.sicht; render(el); });
  el.querySelectorAll('[data-ins]').forEach(b => b.onclick = () => { z.inserat = b.dataset.ins; z.filter = 'offen'; render(el); window.scrollTo(0, 0); });
  el.querySelectorAll('[data-ordbilder]').forEach(b => b.onclick = () => bilderDlg(b.dataset.ordbilder, el));
  el.querySelectorAll('[data-zeig]').forEach(b => b.onclick = () => bildGross(b.dataset.ordk, Number(b.dataset.zeig)));
  bilderLaden(el);
  el.querySelectorAll('[data-ordedit]').forEach(b => b.onclick = () => ordnerDlg(b.dataset.ordedit, el));
  el.querySelectorAll('[data-ordner]').forEach(s => s.onchange = async () => { const g = grp(s), alt = inseratK(g), ziel = P.inserate().find(i => i.k === s.value); await P.verschieben(g, s.value); toast(`${g.name} → Ordner „${ziel?.name || s.value}“`, 'ok', { label: 'Rückgängig', fn: () => P.verschieben({ alle: g.alle.map(x => db.get('anfragen', x.id) || x) }, alt) }); });
  el.querySelectorAll('[data-mehr]').forEach(b => b.onclick = () => { const id = b.closest('[data-g]').dataset.g; z.auf.has(id) ? z.auf.delete(id) : z.auf.add(id); render(el); });
  el.querySelectorAll('[data-fav]').forEach(b => b.onclick = async () => { const g = grp(b); haptik('leicht'); await P.setzen(g, { favorit: !g.haupt.favorit }); });
  el.querySelectorAll('[data-status]').forEach(s => s.onchange = async () => { const g = grp(s); await P.status(g, s.value); haptik('erfolg'); toast(`${g.name}: ${P.STATUS[s.value].name}`); });
  // Ergebnis eines Anrufs/Kontakts mit einem Tipp festhalten (Notizfeld der Karte wird mitgenommen, wenn gerade etwas Neues drinsteht)
  el.querySelectorAll('[data-versuch]').forEach(b => b.onclick = async () => {
    const g = grp(b), V = P.VERSUCH[b.dataset.versuch]; if (!g) return;
    try {
      const zurueck = await P.versuch(g, b.dataset.versuch);
      haptik(V.status === 'versucht' ? 'leicht' : 'erfolg');
      toast(`${V.icon} ${g.name}: ${V.name}${V.erinnern ? ' · Erinnerung für morgen angelegt' : ''}`, 'ok', { label: 'Rückgängig', fn: zurueck });
    } catch (e) { toast(e.message, 'err'); }
  });
  // WhatsApp / Antworten: aus „Neu“ wird „Kontaktiert“. Anrufen ändert nichts – das Ergebnis tippst du danach an.
  el.querySelectorAll('[data-k]').forEach(a => a.addEventListener('click', () => { const g = grp(a); if (g && ['neu', 'versucht'].includes(st(g)) && !/^tel:/.test(a.getAttribute('href') || '')) P.status(g, 'kontaktiert'); }));
  el.querySelectorAll('[data-absage]').forEach(a => a.addEventListener('click', () => { const g = grp(a); if (g) { P.status(g, 'absage'); toast(`${g.name}: Absage – Mail-Entwurf geöffnet`); } }));
  el.querySelectorAll('[data-besichtigung]').forEach(b => b.onclick = () => {
    const g = grp(b), h = g.haupt;
    eventForm({ titel: `Besichtigung: ${g.name}`, art: 'Besichtigung', datum: today(), contactId: h.contactId || '', propertyId: P.objektFuer(h) || '', notiz: [g.tel, g.email].filter(Boolean).join(' · ') }, async () => { await P.status(g, 'besichtigung'); toast(`Besichtigung mit ${vorname(g.name)} geplant`); });
  });
  KL.anfrageBinden(el, grp, g => P.inserate().find(i => i.k === inseratK(g)));
  el.querySelectorAll('[data-notiz]').forEach(t => {
    const hoch = () => { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight + 2) + 'px'; }; hoch(); t.oninput = hoch;
    t.onchange = async () => { const g = grp(t); if (g && (g.haupt.notiz || '') !== t.value.trim()) { await P.setzen(g, { notiz: t.value.trim() }); toast('Notiz gespeichert'); } };
  });
}
export const neuAnzahl = P.neuAnzahl;
