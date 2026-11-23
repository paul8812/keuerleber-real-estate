// Kundenlinks: persönliche Seiten für Interessenten unter keuerleber-immobilien.de/k/#<Link>
//   • objekt   – Exposé und freigegebene Unterlagen zu einem Objekt (du siehst, ob und wann geöffnet wurde)
//   • termin   – Besichtigungstermine eines Inserat-Ordners; Interessenten buchen selbst, der Termin landet im Kalender
//   • auskunft – Mieter-Selbstauskunft als Online-Formular; die Antworten kommen zurück und lassen sich als PDF speichern
// Der Link (Sammlung „links“) gehört dem CRM; die Kundenseite schreibt nur in „linkstatus“ (Aufrufe, Antworten) und „events“ (Buchungen).
import * as db from './db.js';
import * as mail from './mail.js';
import { html, raw, toast, modal, confirmDlg, today, addDays, fmtDate, fmtDT, fullName, idFor } from './util.js';
import { contactOpts } from './ui.js';
import { haptik } from './haptik.js';
import { vorWann } from './kontakt.js';
import * as U from './unterlagen.js';
import * as P from './portal.js';
import * as SA from './selbstauskunft.js';

export const BASIS = 'https://keuerleber-immobilien.de/k/';
const ABC = 'abcdefghijkmnpqrstuvwxyz23456789';
export const neuerSchluessel = () => Array.from(crypto.getRandomValues(new Uint8Array(28)), b => ABC[b % ABC.length]).join('');
export const adresse = (l, gast = '', vorschau = false) => `${BASIS}${vorschau ? '?v=1' : ''}#${l.id}${gast ? '.' + gast : ''}`;
export const absender = () => { const S = db.settings(); return { firma: S.firma || 'Keuerleber Immobilien', name: S.inhaber || '', tel: S.tel || '', email: S.email || '' }; };
export const stand = l => db.get('linkstatus', l.id + ':s') || {};
export const alle = typ => (db.all('links') || []).filter(l => (!typ || l.typ === typ) && l.aktiv !== false);
export const abgelaufen = l => l.aktiv === false || (l.gueltigBis && l.gueltigBis < today());
/** stabile Kennung einer Anfrage-Gruppe (älteste Mail) und kurzer Gast-Code für den Terminlink */
export const gid = g => g.alle[0].id;
export const gastCode = g => idFor('g', gid(g)).slice(2, 12);
const gruppeVon = id => P.gruppen().find(g => g.alle.some(a => a.id === id));
const WTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const tagKurz = d => WTAG.format(new Date(d + 'T12:00:00'));
const gruss = () => { const S = db.settings(); return `\n\nMit freundlichen Grüßen\n${S.inhaber || ''}\n${S.firma || ''}${S.tel ? '\nTel. ' + S.tel : ''}`; };
const telNr = t => String(t || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^0/, '49');

export async function anlegen(typ, daten) {
  return db.save('links', { id: neuerSchluessel(), typ, aktiv: true, gesendet: new Date().toISOString(), absender: absender(), gueltigBis: addDays(today(), 60), ...daten });
}
export async function deaktivieren(l) { await db.save('links', { ...l, aktiv: false }); }
export async function loeschen(l) { await db.del('links', l.id); if (db.get('linkstatus', l.id + ':s')) await db.del('linkstatus', l.id + ':s'); }
/** „noch nicht geöffnet“ / „3× geöffnet · zuletzt vor 2 Std.“ */
export function oeffnungen(l, gast = '') {
  const S = stand(l), x = gast ? (S.gaeste || {})[gast] : { n: S.aufrufe, letzter: S.letzter };
  return x && x.n ? `${x.n}× geöffnet · zuletzt ${vorWann(x.letzter)}` : 'noch nicht geöffnet';
}

/** Titelbild verkleinern, damit es im Link mitreisen kann (≈ 60–90 KB) */
async function bildKlein(quelle) {
  if (!quelle || !/^(data:image|blob:)/.test(quelle)) return '';
  try {
    const img = await new Promise((ok, nein) => { const i = new Image(); i.onload = () => ok(i); i.onerror = nein; i.src = quelle; });
    const s = Math.min(1, 1000 / img.naturalWidth), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const d = c.toDataURL('image/jpeg', 0.72); return d.length < 220000 ? d : c.toDataURL('image/jpeg', 0.5);
  } catch { return ''; }
}
async function ordnerBild(i) {
  if (i?.objekt?.bildIntern) return bildKlein(i.objekt.bildIntern);
  const id = (i?.bilder || [])[0]; if (!id) return '';
  try { const f = await db.getFile(id); return bildKlein(f?.dataUrl || ''); } catch { return ''; }
}
const objAdresse = p => p ? [p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
const ordnerTitel = i => i?.objekt?.titel || (i?.titel ? String(i.titel).split(' - ').slice(0, 2).join(' – ') : '') || i?.name || 'Wohnung';

// ---------------------------------------------------------------- Verschicken (Mail-Entwurf, WhatsApp, kopieren)
/** Dialog nach dem Anlegen: Text anpassen und über den gewünschten Weg verschicken */
export function teilen(l, { gast = '', an = {}, betreff, text, protokoll = {} }) {
  const url = adresse(l, gast);
  modal('Link verschicken', html`
    <label class="f full"><span>Nachricht <small class="muted">(kannst du anpassen)</small></span><textarea name="text" rows="9">${text.replace('{link}', url)}</textarea></label>
    <div class="full kl-wege">
      ${an.tel ? html`<button type="button" class="btn" data-wa>WhatsApp</button>` : ''}
      <button type="button" class="btn" data-kopie>Text kopieren</button>
      <button type="button" class="btn" data-nurlink>Nur Link kopieren</button>
      <a class="btn ghost" href="${adresse(l, gast, true)}" target="_blank" rel="noopener">Vorschau ↗</a>
    </div>
    <p class="full muted small">${db.isCloud() ? 'Du siehst im CRM, sobald der Link geöffnet wurde.' : '⚠️ Lokaler Modus: Der Link funktioniert erst, wenn du in der Cloud angemeldet bist.'}</p>`, {
    wide: true, saveLabel: an.email ? '✉ Mail-Entwurf öffnen' : 'Fertig',
    onMount: m => {
      const t = () => m.querySelector('[name=text]').value, kopiere = async (w, was) => { try { await navigator.clipboard.writeText(w); toast(was + ' kopiert'); haptik('leicht'); } catch { toast('Kopieren nicht erlaubt – bitte von Hand markieren', 'err'); } };
      m.querySelector('[data-kopie]').onclick = () => kopiere(t(), 'Text');
      m.querySelector('[data-nurlink]').onclick = () => kopiere(url, 'Link');
      const wa = m.querySelector('[data-wa]'); if (wa) wa.onclick = () => { window.open(`https://wa.me/${telNr(an.tel)}?text=${encodeURIComponent(t())}`, '_blank', 'noopener'); };
    },
    onSave: async v => {
      if (protokoll.text) await db.log('email', protokoll.text, { contactId: protokoll.contactId || '', propertyId: protokoll.propertyId || '' });
      if (an.email) { try { await navigator.clipboard.writeText(v.text); } catch { /* egal */ } setTimeout(() => mail.oeffnen(`mailto:${encodeURIComponent(an.email)}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(v.text)}`, { contactId: protokoll.contactId || '', propertyId: protokoll.propertyId || '' }), 250); if (!mail.verfuegbar()) toast('Mail-Entwurf geöffnet · Text in der Zwischenablage'); }
    },
  });
}

// ---------------------------------------------------------------- Objekt: Exposé + Unterlagen als Link
export function objektLinkDlg(p) {
  const L = U.liste(p.id).filter(u => !u.intern), G = new Map();
  for (const u of L) { const k = u.kategorie || 'Sonstiges'; if (!G.has(k)) G.set(k, []); G.get(k).push(u); }
  if (!L.length) { toast('Lade zuerst Unterlagen (z. B. dein Exposé) zum Objekt hoch', 'err'); return; }
  modal('Kundenlink erstellen', html`
    <label class="f full"><span>Für wen?</span><select name="contactId"><option value="">– Kontakt wählen (oder Name unten eintragen) –</option>${contactOpts().map(([id, n]) => html`<option value="${id}">${n}</option>`)}</select></label>
    <label class="f"><span>Name (falls kein Kontakt)</span><input name="name" placeholder="z. B. Herr Weber"></label>
    <label class="f"><span>E-Mail (falls kein Kontakt)</span><input name="email" type="email" placeholder="name@beispiel.de"></label>
    <div class="f full"><span>Was soll auf der Seite stehen? <small class="muted">(vorausgewählt: dein Exposé)</small></span><div class="unt-wahl">${[...G].map(([k, D]) => html`<div class="unt-wk"><label class="unt-wkk"><input type="checkbox" data-alle="${k}"> <b>${k}</b><small>${D.length}</small></label>
      ${D.map(u => html`<label data-k="${k}"><input type="checkbox" name="u_${u.id}" ${k === 'Exposé' ? raw('checked') : ''}> <span>${u.name}</span></label>`)}</div>`)}</div></div>
    <label class="f"><span>Link gültig</span><select name="tage"><option value="14">14 Tage</option><option value="30" selected>30 Tage</option><option value="90">90 Tage</option></select></label>
    <p class="muted small full">Der Interessent bekommt eine eigene Seite mit Bild, Exposé und den gewählten Unterlagen. Du siehst, ob und wann er sie geöffnet hat.</p>`, {
    wide: true, saveLabel: 'Link erstellen',
    onMount: m => m.querySelectorAll('[data-alle]').forEach(a => a.onchange = () => m.querySelectorAll(`label[data-k="${a.dataset.alle}"] input`).forEach(i => { i.checked = a.checked; })),
    onSave: async v => {
      const wahl = L.filter(u => v['u_' + u.id]); if (!wahl.length) { toast('Bitte mindestens eine Datei auswählen', 'err'); return false; }
      const c = v.contactId && db.get('contacts', v.contactId), name = c ? ([c.anrede, c.nachname].filter(Boolean).join(' ') || fullName(c)) : (v.name || '').trim(), email = (c?.email || v.email || '').trim(), tage = Number(v.tage) || 30;
      const l = await anlegen('objekt', { propertyId: p.id, contactId: c?.id || '', name, email, tel: c?.mobil || c?.tel || '', titel: p.titel || 'Objekt', adresse: objAdresse(p), bild: await bildKlein(p.bildIntern || ''),
        gueltigBis: addDays(today(), tage), unterlagen: wahl.map(u => ({ id: u.id, name: u.name, kategorie: u.kategorie || '', groesse: u.groesse || 0, pfad: u.pfad })) });
      setTimeout(() => teilen(l, { an: { name, email, tel: l.tel }, betreff: 'Unterlagen: ' + (p.titel || 'Objekt'),
        text: `Guten Tag${name ? ' ' + name : ''},\n\nwie besprochen finden Sie das Exposé und die Unterlagen zu „${p.titel}“ auf Ihrer persönlichen Seite:\n\n{link}\n\nDer Link ist bis ${fmtDate(l.gueltigBis)} gültig. Bei Fragen melden Sie sich gerne.${gruss()}`,
        protokoll: { text: `Kundenlink verschickt${email ? ' an ' + email : name ? ' an ' + name : ''}: ${wahl.map(u => u.name).join(', ')}`, contactId: c?.id, propertyId: p.id } }), 250);
    },
  });
}
/** Karte am Objekt: verschickte Links mit Öffnungs-Status */
export function objektKarte(p) {
  const L = (db.all('links') || []).filter(l => l.typ === 'objekt' && l.propertyId === p.id).sort((a, b) => (b.gesendet || '').localeCompare(a.gesendet || ''));
  return html`<section class="card kl" id="kl"><h2>Kundenlinks <span class="unt-akt"><button type="button" class="mini" data-kl-neu>🔗 Link erstellen</button></span></h2>
    ${L.length ? html`<ul class="kl-liste">${L.map(l => { const S = stand(l), aus = abgelaufen(l), dl = (S.downloads || []).length; return html`<li class="${aus ? 'aus' : S.aufrufe ? 'offen' : ''}" data-kl="${l.id}">
      <span class="kl-pkt" aria-hidden="true"></span>
      <div><b>${l.name || l.email || 'ohne Namen'}</b><small class="muted">${fmtDate((l.gesendet || '').slice(0, 10))} · ${(l.unterlagen || []).length} Datei${(l.unterlagen || []).length === 1 ? '' : 'en'}${aus ? ' · abgelaufen' : ` · gültig bis ${fmtDate(l.gueltigBis)}`}</small>
        <small class="${S.aufrufe ? 'kl-auf' : 'muted'}">${oeffnungen(l)}${dl ? ` · ${dl} Download${dl === 1 ? '' : 's'}` : ''}</small></div>
      <span class="kl-akt">${aus ? '' : html`<button type="button" class="mini" data-kl-kopie title="Link kopieren">Kopieren</button>`}<button type="button" class="mini" data-kl-weg title="Link entfernen" aria-label="Link entfernen">×</button></span></li>`; })}</ul>`
      : html`<p class="muted small">Schick Interessenten statt Anhängen einen Link zu ihrer eigenen Seite mit Exposé und Unterlagen – du siehst, ob und wann sie geöffnet wurde.</p>`}
  </section>`;
}
export function objektBinden(el, p) {
  const k = el.querySelector('#kl'); if (!k) return;
  k.querySelector('[data-kl-neu]').onclick = () => objektLinkDlg(p);
  k.querySelectorAll('[data-kl]').forEach(li => {
    const l = db.get('links', li.dataset.kl);
    li.querySelector('[data-kl-kopie]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(adresse(l)); toast('Link kopiert'); } catch { toast(adresse(l)); } });
    li.querySelector('[data-kl-weg]').onclick = async () => { if (await confirmDlg(`Link für ${l.name || l.email || 'diesen Empfänger'} entfernen?\n\nDie Seite ist danach nicht mehr erreichbar.`)) { await loeschen(l); toast('Link entfernt'); } };
  });
}

// ---------------------------------------------------------------- Besichtigungstermine eines Ordners
export const terminLink = k => (db.all('links') || []).find(l => l.typ === 'termin' && l.ordner === k && l.aktiv !== false);
export const buchungen = l => (db.all('events') || []).filter(e => e.linkId === l.id);
const jetztUhr = () => new Date().toTimeString().slice(0, 5);
export const zukunft = s => s.datum > today() || (s.datum === today() && s.start > jetztUhr());
/** { frei, gebucht } der kommenden Termine */
export function terminStand(k) {
  const l = terminLink(k); if (!l) return { link: null, frei: 0, gebucht: 0 };
  const B = new Set(buchungen(l).map(e => e.slot)), Z = (l.slots || []).filter(zukunft);
  return { link: l, frei: Z.filter(s => !B.has(s.id)).length, gebucht: Z.filter(s => B.has(s.id)).length };
}
export function slotsErzeugen(datum, von, bis, dauer) {
  const m = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)), t = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`, out = [];
  for (let a = m(von); a + dauer <= m(bis); a += dauer) out.push({ id: `${datum.replace(/-/g, '')}${t(a).replace(':', '')}`, datum, start: t(a), ende: t(a + dauer) });
  return out;
}
/** Termine anlegen / ansehen. i = Ordner aus P.inserate(); danach() wird nach dem Speichern aufgerufen (z. B. um direkt einzuladen) */
export function termineDlg(i, danach) {
  let l = terminLink(i.k), slots = [...(l?.slots || [])];
  const morgen = addDays(today(), 1);
  const zeichne = m => {
    const B = new Map((l ? buchungen(l) : []).map(e => [e.slot, e])), tage = new Map();
    for (const s of slots.filter(zukunft).sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start))) { if (!tage.has(s.datum)) tage.set(s.datum, []); tage.get(s.datum).push(s); }
    m.querySelector('#kl-slots').innerHTML = String(tage.size ? html`${[...tage].map(([d, L]) => html`<div class="kl-tag"><b>${tagKurz(d)}</b><div>${L.map(s => { const e = B.get(s.id); return html`<span class="kl-slot ${e ? 'belegt' : ''}" title="${e ? (e.gastName || e.titel) + (e.notiz ? ' · ' + e.notiz : '') : 'frei'}">${s.start}${e ? html` <em>${(e.gastName || e.titel || '').replace(/^Besichtigung: /, '')}</em>` : html`<button type="button" data-slotweg="${s.id}" aria-label="Termin ${s.start} entfernen">×</button>`}</span>`; })}</div></div>`)}` : html`<p class="muted small">Noch keine Termine – oben ein Zeitfenster eintragen und „Hinzufügen“.</p>`);
    m.querySelectorAll('[data-slotweg]').forEach(b => b.onclick = () => { slots = slots.filter(s => s.id !== b.dataset.slotweg); zeichne(m); });
  };
  modal('Besichtigungstermine – ' + i.name, html`
    <p class="full muted small">Trag Zeitfenster ein, in denen du vor Ort bist. Interessenten suchen sich über ihren Link selbst einen freien Termin aus – er steht dann sofort in deinem Kalender.</p>
    <label class="f"><span>Datum</span><input name="datum" type="date" value="${morgen}" min="${today()}"></label>
    <label class="f"><span>Dauer je Besichtigung</span><select name="dauer">${[15, 20, 30, 45, 60].map(d => html`<option value="${d}" ${d === 20 ? raw('selected') : ''}>${d} Minuten</option>`)}</select></label>
    <label class="f"><span>Von</span><input name="von" type="time" value="16:00" step="300"></label>
    <label class="f"><span>Bis</span><input name="bis" type="time" value="18:00" step="300"></label>
    <div class="full"><button type="button" class="btn" id="kl-add">+ Hinzufügen</button></div>
    <div class="full" id="kl-slots"></div>
    <label class="f full"><span>Treffpunkt</span><input name="ort" value="${l?.ort || objAdresse(i.objekt)}" placeholder="Straße Nr., PLZ Ort – z. B. vor dem Hauseingang"></label>
    <label class="f full"><span>Hinweis für Interessenten (optional)</span><input name="hinweis" value="${l?.hinweis || ''}" placeholder="z. B. Bitte klingeln bei Keuerleber, 3. OG"></label>`, {
    wide: true, saveLabel: danach ? 'Speichern und einladen' : 'Speichern',
    onMount: m => {
      zeichne(m);
      m.querySelector('#kl-add').onclick = () => {
        const g = n => m.querySelector(`[name=${n}]`).value;
        if (!g('datum') || !g('von') || !g('bis') || g('bis') <= g('von')) { toast('Bitte Datum und ein gültiges Zeitfenster eintragen', 'err'); return; }
        const neu = slotsErzeugen(g('datum'), g('von'), g('bis'), Number(g('dauer'))).filter(s => zukunft(s) && !slots.some(x => x.id === s.id));
        if (!neu.length) { toast('In diesem Zeitfenster passt kein (neuer) Termin', 'err'); return; }
        slots.push(...neu); haptik('leicht'); zeichne(m); toast(`${neu.length} Termin${neu.length === 1 ? '' : 'e'} hinzugefügt`);
      };
    },
    onSave: async v => {
      if (!slots.some(zukunft)) { toast('Bitte mindestens einen Termin hinzufügen', 'err'); return false; }
      const felder = { slots: slots.filter(s => zukunft(s) || (l && buchungen(l).some(e => e.slot === s.id))), ort: (v.ort || '').trim(), hinweis: (v.hinweis || '').trim(), titel: ordnerTitel(i), adresse: objAdresse(i.objekt), propertyId: i.propertyId || '', gueltigBis: addDays(slots.map(s => s.datum).sort().pop(), 1), absender: absender() };
      l = l ? await db.save('links', { ...db.get('links', l.id), ...felder }) : await anlegen('termin', { ordner: i.k, bild: await ordnerBild(i), gaeste: {}, ...felder });
      toast('Besichtigungstermine gespeichert');
      if (danach) setTimeout(() => danach(l), 250);
    },
  });
}
/** Interessenten zur Terminwahl einladen (legt bei Bedarf erst Termine an) */
export function terminEinladen(g, i) {
  const S = terminStand(i.k);
  if (!S.link || !S.frei) { termineDlg(i, () => terminEinladen(g, i)); return; }
  (async () => {
    const l = db.get('links', S.link.id), code = gastCode(g), h = g.haupt;
    await db.save('links', { ...l, gaeste: { ...(l.gaeste || {}), [code]: { ...(l.gaeste || {})[code], anfrageId: gid(g), contactId: h.contactId || '', name: g.name, email: g.email, tel: g.tel, eingeladen: new Date().toISOString() } } });
    if (['neu', 'versucht'].includes(h.status || 'neu')) await P.status(g, 'kontaktiert');
    teilen(l, { gast: code, an: { name: g.name, email: g.email, tel: g.tel }, betreff: 'Besichtigung: ' + l.titel,
      text: `Guten Tag ${g.name},\n\nvielen Dank für Ihr Interesse an „${l.titel}“. Gerne zeige ich Ihnen die Wohnung. Über diesen Link können Sie sich direkt einen passenden Termin aussuchen:\n\n{link}\n\nSollte kein Termin passen, melden Sie sich einfach kurz.${gruss()}`,
      protokoll: { text: `Terminlink verschickt an ${g.name}`, contactId: h.contactId, propertyId: l.propertyId } });
  })();
}

// ---------------------------------------------------------------- Selbstauskunft
export const auskunftLink = g => (db.all('links') || []).find(l => l.typ === 'auskunft' && l.aktiv !== false && g.alle.some(a => a.id === l.anfrageId));
export async function auskunftSenden(g, i) {
  let l = auskunftLink(g);
  if (!l) l = await anlegen('auskunft', { anfrageId: gid(g), ordner: i?.k || '', contactId: g.haupt.contactId || '', propertyId: i?.propertyId || '', name: g.name, email: g.email, tel: g.tel, titel: ordnerTitel(i), adresse: objAdresse(i?.objekt), bild: await ordnerBild(i), gueltigBis: addDays(today(), 30) });
  else await db.save('links', { ...l, gesendet: new Date().toISOString(), gueltigBis: addDays(today(), 30) });
  teilen(l, { an: { name: g.name, email: g.email, tel: g.tel }, betreff: 'Selbstauskunft: ' + l.titel,
    text: `Guten Tag ${g.name},\n\ndamit wir Sie für „${l.titel}“ berücksichtigen können, füllen Sie bitte die kurze Selbstauskunft aus – das dauert etwa 5 Minuten und geht bequem am Handy:\n\n{link}\n\nVielen Dank!${gruss()}`,
    protokoll: { text: `Selbstauskunft angefordert bei ${g.name}`, contactId: g.haupt.contactId, propertyId: l.propertyId } });
}
let jspdfP = null;
const jsPDF = () => jspdfP ||= new Promise((ok, nein) => { if (window.jspdf) return ok(window.jspdf.jsPDF); const s = document.createElement('script'); s.src = new URL('../vendor/jspdf.umd.min.js', import.meta.url).href; s.onload = () => ok(window.jspdf.jsPDF); s.onerror = () => { jspdfP = null; nein(new Error('PDF-Baustein konnte nicht geladen werden')); }; document.head.append(s); });
export async function auskunftPdf(l) {
  const S = stand(l); if (!S.antwort) { toast('Noch keine Antwort eingegangen', 'err'); return; }
  try { SA.pdf(await jsPDF(), S.antwort, { titel: l.titel, adresse: l.adresse, absender: l.absender || absender(), eingereicht: S.eingereicht }).save(SA.pdfName(S.antwort)); haptik('erfolg'); }
  catch (e) { toast(e.message, 'err'); }
}
export function auskunftAnsehen(l) {
  const S = stand(l), d = S.antwort; if (!d) return;
  modal('Selbstauskunft – ' + [d.vorname, d.nachname].filter(Boolean).join(' '), html`
    <p class="full muted small">Online übermittelt am ${fmtDT(S.eingereicht)}${S.erstEingereicht && S.erstEingereicht !== S.eingereicht ? ` (erstmals ${fmtDT(S.erstEingereicht)}, danach korrigiert)` : ''} · ${l.titel}</p>
    ${SA.ABSCHNITTE.filter(a => a.id !== 'mieter2' || d.zweiter === 'ja').map(a => html`<div class="full kl-sa"><h4>${a.titel}</h4><dl>${a.felder.filter(f => SA.sichtbar(f, d) && f.k !== 'zweiter').map(f => { const w = SA.wert(f, d), warn = (['rueckstand', 'raeumung', 'vermoegensauskunft', 'insolvenz'].includes(f.k) && w === 'ja') || (f.k === 'kaution' && w === 'nein'); return html`<dt>${f.l}</dt><dd class="${warn ? 'warn' : w ? '' : 'muted'}">${w || '–'}</dd>`; })}</dl></div>`)}`, {
    wide: true, saveLabel: '⬇ Als PDF herunterladen', onSave: async () => { await auskunftPdf(l); return false; },
  });
}

// ---------------------------------------------------------------- Anfragen-Karte: Knöpfe und Status
/** Zeilen unter der Anfrage: was verschickt wurde und was zurückkam */
export function anfrageStatus(g, i) {
  const out = [], a = auskunftLink(g), t = i && terminLink(i.k), code = gastCode(g);
  const ev = (db.all('events') || []).filter(e => e.quelle === 'online' && e.anfrageId && g.alle.some(x => x.id === e.anfrageId) && e.datum >= today()).sort((x, y) => (x.datum + x.start).localeCompare(y.datum + y.start))[0];
  if (ev) out.push(html`<span class="kl-chip ok">🗓 Termin gebucht: <b>${tagKurz(ev.datum)}, ${ev.start} Uhr</b></span>`);
  else if (t && (stand(t).storno || []).some(x => x.gast === code && x.zeit > ((t.gaeste || {})[code]?.eingeladen || ''))) { const x = [...stand(t).storno].reverse().find(y => y.gast === code); out.push(html`<span class="kl-chip warn">🗓 Termin${x.termin ? ' am ' + tagKurz(x.termin.slice(0, 10)) + ', ' + x.termin.slice(11) + ' Uhr' : ''} vom Interessenten abgesagt ${vorWann(x.zeit)}</span>`); }
  else if (t && (t.gaeste || {})[code]) out.push(html`<span class="kl-chip">🗓 Terminlink verschickt ${vorWann(t.gaeste[code].eingeladen)} · ${oeffnungen(t, code)}</span>`);
  if (a) { const S = stand(a);
    out.push(S.eingereicht ? html`<span class="kl-chip ok">📝 Selbstauskunft ausgefüllt ${vorWann(S.eingereicht)} <button type="button" class="mini" data-sa-zeig="${a.id}">Ansehen</button><button type="button" class="mini" data-sa-pdf="${a.id}">⬇ PDF</button></span>`
      : html`<span class="kl-chip">📝 Selbstauskunft angefordert ${vorWann(a.gesendet)} · ${oeffnungen(a)}</span>`);
    if (S.eingereicht) { const K = SA.kurz(S.antwort); if (K.length) out.push(html`<span class="kl-kurz">${K.map(([k, v]) => html`<span class="an-chip"><small>${k}</small>${v}</span>`)}</span>`); } }
  return out.length ? html`<div class="kl-status">${out}</div>` : '';
}
export function anfrageBinden(el, grp, ordnerVon) {
  el.querySelectorAll('[data-terminlink]').forEach(b => b.onclick = () => { const g = grp(b), i = ordnerVon(g); if (g && i) terminEinladen(g, i); });
  el.querySelectorAll('[data-auskunft]').forEach(b => b.onclick = async () => { const g = grp(b); if (g) { b.disabled = true; await auskunftSenden(g, ordnerVon(g)); b.disabled = false; } });
  el.querySelectorAll('[data-sa-zeig]').forEach(b => b.onclick = () => auskunftAnsehen(db.get('links', b.dataset.saZeig)));
  el.querySelectorAll('[data-sa-pdf]').forEach(b => b.onclick = () => auskunftPdf(db.get('links', b.dataset.saPdf)));
  el.querySelectorAll('[data-termine]').forEach(b => b.onclick = () => { const i = P.inserate().find(x => x.k === b.dataset.termine); if (i) termineDlg(i); });
}

// ---------------------------------------------------------------- Für die Automationen
/** Online gebuchte Termine verarbeiten: Anfrage auf „Besichtigung“, Kontakt verknüpfen. Liefert die Zahl neuer Buchungen. */
export async function buchungenVerarbeiten() {
  let n = 0;
  for (const e of db.all('events') || []) {
    if (e.quelle !== 'online' || e.verarbeitet) continue;
    const g = e.anfrageId ? gruppeVon(e.anfrageId) : null;
    if (g && ['neu', 'versucht', 'kontaktiert'].includes(g.haupt.status || 'neu')) await P.status(g, 'besichtigung');
    await db.save('events', { ...e, verarbeitet: true, contactId: e.contactId || g?.haupt.contactId || '' });
    await db.log('system', `🗓 Online gebucht: ${e.gastName || e.titel} – ${tagKurz(e.datum)}, ${e.start} Uhr`, { contactId: e.contactId || g?.haupt.contactId || '', propertyId: e.propertyId || '' });
    n++;
  }
  return n;
}
/** Nachfass-Vorschläge: [{ key, titel, faellig, ref: {contactId, propertyId, notiz}, prio }] */
export function nachfassen(tage) {
  const out = [], t0 = today(), alt = (iso, d) => iso && addDays(iso.slice(0, 10), d) <= t0, G = P.gruppen();
  const offenG = g => g && P.OFFEN.includes(g.haupt.status || 'neu');
  for (const l of db.all('links') || []) {
    if (abgelaufen(l)) continue;
    const S = stand(l);
    if (l.typ === 'objekt' && alt(l.gesendet, tage.objekt)) {
      const reagiert = l.contactId && (db.all('activities') || []).some(a => a.contactId === l.contactId && ['anruf', 'email', 'meeting', 'whatsapp', 'besichtigung'].includes(a.art) && a.datum > new Date(new Date(l.gesendet).getTime() + 3e5).toISOString());
      if (!reagiert) out.push({ key: 'ln:' + l.id, titel: `Nachfassen: ${l.name || l.email || 'Interessent'} – Unterlagen „${l.titel}“ (${oeffnungen(l)})`, faellig: t0, ref: { contactId: l.contactId || '', propertyId: l.propertyId || '',
        notiz: S.aufrufe ? `Vorschlag: „Guten Tag ${l.name || ''}, Sie haben sich die Unterlagen zu ${l.titel} angesehen – welche Fragen darf ich Ihnen beantworten? Gerne zeige ich Ihnen die Wohnung auch vor Ort.“` : `Vorschlag: „Guten Tag ${l.name || ''}, ich wollte kurz nachfragen, ob mein Link mit den Unterlagen zu ${l.titel} bei Ihnen angekommen ist: ${adresse(l)}“` } });
    }
    if (l.typ === 'auskunft') {
      const g = G.find(x => x.alle.some(a => a.id === l.anfrageId));
      if (S.eingereicht) out.push({ key: 'ap:' + l.id + ':' + S.eingereicht.slice(0, 16), titel: `Selbstauskunft prüfen: ${l.name}`, faellig: t0, prio: 'hoch', ref: { contactId: l.contactId || '', propertyId: l.propertyId || '', notiz: SA.kurz(S.antwort).map(([k, v]) => `${k}: ${v}`).join(' · ') } });
      else if (offenG(g) && alt(l.gesendet, tage.auskunft)) out.push({ key: 'ae:' + l.id + ':' + l.gesendet.slice(0, 10), titel: `Selbstauskunft fehlt noch: ${l.name} (${oeffnungen(l)})`, faellig: t0, ref: { contactId: l.contactId || '', propertyId: l.propertyId || '',
        notiz: `Vorschlag: „Guten Tag ${l.name}, für ${l.titel} fehlt mir noch Ihre Selbstauskunft – hier noch einmal der Link: ${adresse(l)}“` } });
    }
    if (l.typ === 'termin') {
      const B = buchungen(l);
      for (const [code, x] of Object.entries(l.gaeste || {})) {
        const g = G.find(y => y.alle.some(a => a.id === x.anfrageId));
        if (!offenG(g) || B.some(e => e.gast === code) || !alt(x.eingeladen, tage.termin) || !(l.slots || []).some(zukunft)) continue;
        out.push({ key: 'te:' + l.id + ':' + code, titel: `Noch kein Termin gebucht: ${x.name} (${oeffnungen(l, code)})`, faellig: t0, ref: { contactId: x.contactId || '', propertyId: l.propertyId || '',
          notiz: `Vorschlag: „Guten Tag ${x.name}, es sind noch Besichtigungstermine für ${l.titel} frei – hier können Sie sich einen aussuchen: ${adresse(l, code)}“` } });
      }
    }
  }
  return out;
}
