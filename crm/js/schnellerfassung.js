// Schnellerfassung: Anfrage-Text (Mail, ImmoScout, WhatsApp, Notiz) einfügen → Kontakt + Vorgang + Verlauf in einem Schritt.
import * as db from './db.js';
import { html, inp, sel, chk, area, toast, modal, fullName } from './util.js';
import { QUELLEN } from './consts.js';
import { propOpts } from './ui.js';

const EIGENE = /keuerleber|immobilienscout|immowelt|kleinanzeigen|noreply|no-reply|mailer-daemon|example\./i;
const EIGENE_TEL = '15167692176';

export function parseAnfrage(text) {
  const t = String(text || ''), r = {};
  r.email = (t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []).find(e => !EIGENE.test(e)) || '';
  const tels = (t.match(/(?:\+|00)?\d[\d \t/().-]{6,}\d/g) || []).map(x => x.trim()).filter(x => { const d = x.replace(/\D/g, ''); return d.length >= 8 && d.length <= 15 && !d.endsWith(EIGENE_TEL) && !/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(x) && !/^(19|20)\d{2}\b/.test(x) && /^(\+|00|0)/.test(x); });
  r.tel = tels[0] || '';
  const grab = re => (t.match(re) || [])[1]?.trim() || '';
  let vor = grab(/vorname\s*[:=]\s*([^\n,;]+)/i), nach = grab(/nachname\s*[:=]\s*([^\n,;]+)/i);
  let anrede = grab(/anrede\s*[:=]\s*(Frau|Herr)/i);
  if (!vor && !nach) {
    let name = grab(/(?:^|\n)\s*(?:name|kontakt(?:name)?|absender|von)\s*[:=]\s*(?:(?:Frau|Herr)\s+)?([^\n<,;]+)/i);
    if (!name) name = grab(/(?:freundlichen|besten|lieben|herzlichen|viele|beste|liebe)\s+grüße?n?,?\s*\n+\s*([A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+){0,2})\s*(?:\n|$)/i);
    const m = [...t.matchAll(/\b(Frau|Herr)\s+((?:Dr\.\s*)?[A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+)?)/g)].find(x => !/keuerleber/i.test(x[2]));
    if (!name && m) { name = m[2]; anrede ||= m[1]; }
    else if (m && name.includes(m[2].split(/\s+/).pop())) anrede ||= m[1];
    if (!name && r.email) { const lp = r.email.split('@')[0].split(/[._-]/).filter(x => /^[a-zäöü]{2,}$/i.test(x)); if (lp.length >= 2) name = lp.slice(0, 2).map(x => x[0].toUpperCase() + x.slice(1)).join(' '); }
    const parts = name.replace(/^Dr\.\s*/, '').split(/\s+/).filter(Boolean);
    if (parts.length > 1) { nach = parts.pop(); vor = parts.join(' '); } else nach = parts[0] || '';
  }
  if (!anrede) { const m = [...t.matchAll(/\b(Frau|Herr)\b(?!\s+(?:Dr\.\s*)?Keuerleber)/g)][0]; anrede = m && !/sehr geehrte[rs]?\s*$/i.test(t.slice(0, m.index)) ? m[1] : ''; }
  Object.assign(r, { vorname: vor, nachname: nach, anrede: anrede || 'Frau' });
  r.quelle = /immobilienscout|immoscout|is24/i.test(t) ? 'ImmoScout24' : /immowelt/i.test(t) ? 'Immowelt' : /kleinanzeigen/i.test(t) ? 'Kleinanzeigen' : /keuerleber-immobilien\.de|website|homepage|kontaktformular/i.test(t) ? 'Website' : /instagram|facebook|tiktok/i.test(t) ? 'Social Media' : '';
  r.kategorie = /\bmiet(e|en|wohnung|interess)|kaltmiete\b/i.test(t) && !/\bkauf/i.test(t) ? 'Interessent (Miete)' : 'Interessent (Kauf)';
  r.propertyId = findeObjekt(t)?.id || '';
  return r;
}

export function findeObjekt(text) {
  const t = text.toLowerCase(); let best = null, bs = 0;
  for (const p of db.all('properties')) {
    if (['Archiv'].includes(p.status)) continue;
    let s = 0;
    if (p.nr && t.includes(p.nr.toLowerCase())) s += 10;
    if (p.extId && t.includes(String(p.extId).toLowerCase())) s += 10;
    const str = (p.strasse || '').toLowerCase().replace(/\s*\d+\w?$/, '').replace(/straße$/, 'str');
    if (str.length > 3 && t.includes(str)) s += 6;
    const words = (p.titel || '').toLowerCase().split(/[^a-zäöüß0-9-]+/).filter(w => w.length > 4);
    if (words.length) s += 5 * words.filter(w => t.includes(w)).length / words.length;
    if (p.ort && t.includes(p.ort.toLowerCase())) s += 1;
    if (p.zimmer && new RegExp(`\\b${String(p.zimmer).replace('.', '[.,]')}[ -]?zimmer`).test(t)) s += 2;
    if (s > bs) { bs = s; best = p; }
  }
  return bs >= 4 ? best : null;
}

export function schnellerfassung(vorgabe = '') {
  const r = parseAnfrage(vorgabe);
  modal('📋 Anfrage einfügen', html`
    <p class="full muted">Text einer Anfrage einfügen (Mail, ImmoScout, WhatsApp, Notiz vom Telefonat) – Name, Kontaktdaten und Objekt werden automatisch erkannt. Danach entstehen Kontakt, Vorgang und die nächsten Aufgaben von selbst.</p>
    ${area('text', 'Anfrage-Text', vorgabe, { rows: 7, ph: 'Hier einfügen …' })}
    ${sel('anrede', 'Anrede', ['Frau', 'Herr', 'Divers', 'Firma'], r.anrede)}${inp('vorname', 'Vorname', r.vorname)}${inp('nachname', 'Nachname', r.nachname)}
    ${inp('email', 'E-Mail', r.email, { type: 'email' })}${inp('tel', 'Telefon', r.tel, { type: 'tel' })}
    ${sel('kategorie', 'Art', ['Interessent (Kauf)', 'Interessent (Miete)', 'Eigentümer', 'Sonstige'], r.kategorie)}
    ${sel('quelle', 'Quelle', QUELLEN, r.quelle, { blank: 1 })}
    ${sel('propertyId', 'Objekt', propOpts(), r.propertyId, { blank: 1, cls: 'full' })}
    ${chk('vorgang', 'Vorgang in der Pipeline anlegen', true, { cls: 'full' })}
    <div class="full sfhint" id="sfhint"></div>`, {
    wide: true, saveLabel: 'Anlegen',
    onMount: el => {
      const f = el.querySelector('form'), ta = f.text, hint = el.querySelector('#sfhint'), touched = new Set();
      f.querySelectorAll('[name]').forEach(x => x !== ta && x.addEventListener('input', () => touched.add(x.name)));
      const upd = () => {
        const p = parseAnfrage(ta.value);
        for (const k of ['anrede', 'vorname', 'nachname', 'email', 'tel', 'kategorie', 'quelle', 'propertyId']) if (!touched.has(k) && (p[k] || k !== 'propertyId')) f[k].value = p[k] || (k === 'anrede' ? 'Frau' : '');
        const vorh = dublette(f.email.value, f.tel.value);
        f.vorgang.parentElement.querySelector('span').textContent = (f.kategorie.value === 'Eigentümer' ? 'Akquise-Vorgang' : 'Vorgang') + ' in der Pipeline anlegen';
        hint.textContent = vorh ? `ℹ️ ${fullName(vorh)} ist schon im CRM – die Anfrage wird diesem Kontakt zugeordnet.` : '';
      };
      ta.addEventListener('input', upd); ta.addEventListener('paste', () => setTimeout(upd, 0));
      f.email.addEventListener('input', upd); upd();
    },
    onSave: async v => {
      if (!v.vorname && !v.nachname && !v.email) { toast('Bitte mindestens Name oder E-Mail angeben', 'err'); return false; }
      const c = await speichern(v);
      location.hash = '#/kontakte/' + c.id;
    },
  });
}

const norm = x => String(x || '').replace(/\D/g, '').replace(/^(49|0049)/, '0');
export const dublette = (email, tel) => db.all('contacts').find(c => (email && (c.email || '').toLowerCase() === email.toLowerCase()) || (norm(tel).length >= 7 && [c.tel, c.mobil].some(x => norm(x) === norm(tel))));

export async function speichern(v) {
  let c = dublette(v.email, v.tel);
  const neu = !c;
  if (neu) {
    const mobil = /^(\+49|0049|0)\s*1[5-7]/.test(v.tel) ? v.tel : '', tel = mobil ? '' : v.tel;
    c = await db.save('contacts', { anrede: v.anrede, vorname: v.vorname, nachname: v.nachname, email: v.email, tel, mobil, kategorie: v.kategorie, quelle: v.quelle, status: 'Aktiv', notiz: '' });
    await db.log('system', 'Kontakt angelegt (Schnellerfassung)', { contactId: c.id });
  } else {
    const patch = {}; if (!c.email && v.email) patch.email = v.email; if (!c.tel && !c.mobil && v.tel) patch.mobil = v.tel;
    if (Object.keys(patch).length) c = await db.save('contacts', { ...c, ...patch });
  }
  const p = v.propertyId ? db.get('properties', v.propertyId) : null;
  if (v.text) await db.log(/@/.test(v.text) || v.quelle ? 'email' : 'notiz', `Anfrage${p ? ' zu „' + p.titel + '“' : ''}${v.quelle ? ' über ' + v.quelle : ''}:\n${v.text.slice(0, 4000)}`, { contactId: c.id, propertyId: p?.id, eingehend: true });
  if (v.vorgang) {
    const board = v.kategorie === 'Eigentümer' ? 'akquise' : 'vertrieb';
    const offen = db.all('deals').find(d => d.contactId === c.id && d.board === board && (d.propertyId || '') === (p?.id || '') && !['Abgeschlossen', 'Absage', 'Auftrag erhalten', 'Verloren'].includes(d.stage));
    if (!offen) {
      const stage = board === 'akquise' ? 'Neuer Lead' : 'Anfrage';
      const d = await db.save('deals', { titel: `${board === 'akquise' ? 'Akquise' : 'Anfrage'} ${fullName(c)}${p ? ' – ' + (p.strasse || p.titel) : ''}`, board, stage, stageAt: new Date().toISOString(), contactId: c.id, propertyId: p?.id || '', wert: p?.preis || '' });
      await db.log('system', `Vorgang „${d.titel}“ angelegt (${stage})`, { contactId: c.id, propertyId: p?.id, dealId: d.id });
    }
  }
  toast(neu ? '✓ Kontakt, Vorgang und Aufgaben angelegt' : '✓ Anfrage dem vorhandenen Kontakt zugeordnet');
  import('./automation.js').then(m => m.run());
  return c;
}
