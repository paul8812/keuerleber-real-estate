/* Mietvertrag: Felder, Vorschläge und Prüfung – genutzt in der Verwaltung (Objekt) und beim Interessenten (Vertrag erstellen). */

export const AUSST = [['kueche', 'Küche'], ['bad', 'Bad/WC'], ['flur', 'Flur'], ['keller', 'Keller'], ['dachboden', 'Dachboden'], ['balkon', 'Balkon'], ['terrasse', 'Terrasse']];
export const STP = ['', 'Stellplatz', 'Garage', 'Carport'];
export const SEITEN = [['', '–'], ['links', 'Links'], ['rechts', 'Rechts'], ['mitte', 'Mitte']];
/** Übliche Schlüsselarten – die ersten fünf stehen als Vorschlag im Formular und im Vertrag */
export const SCHLUESSEL_STD = ['Haustür', 'Wohnungstür', 'Briefkasten', 'Keller', 'Dachboden', 'Garage', 'Fahrradraum', 'Waschküche', 'Sonstiges'];

/** Felder, die fürs Objekt gelten (Verwaltung → Objekt → „Für den Mietvertrag“). */
export const OBJ_FELDER = [
  ['mvName', 'Vermieter (Name, Vorname oder Firma)', 'Sultanow, Sebastian'],
  ['mvAnschrift', 'Anschrift des Vermieters', 'Straße Nr., PLZ Ort'],
  ['mvTel', 'Telefon des Vermieters', ''],
  ['mvMail', 'E-Mail des Vermieters', ''],
  ['bank', 'Bank (Mietkonto)', 'z. B. Deutsche Kreditbank AG'],
  ['iban', 'IBAN', 'DE00 0000 0000 0000 0000 00'],
  ['bic', 'BIC', ''],
  ['hv', 'Hausverwaltung (für § 18 – leer lassen, wenn keine)', 'z. B. DOMUS Immobilien GmbH Hausverwaltung'],
  ['geschoss', 'Geschoss', 'z. B. EG, 2. OG, DG'],
  ['seite', 'Lage im Geschoss', ''],
  ['nutzflaeche', 'Nutzfläche (m², optional)', ''],
  ['stp', 'Stellplatz / Garage / Carport', ''],
  ['stpNr', 'Stellplatz-Nummer', ''],
  ['stpKosten', 'Kosten Stellplatz / Garage (€ mtl.)', ''],
  ['kuecheKosten', 'Kosten Küche / Mobiliar (€ mtl.)', ''],
  ['schluessel', 'Schlüssel (je Zeile: Anzahl und Art)', '2 Haustür\n2 Wohnungstür\n1 Briefkasten\n1 Keller'],
  ['kv', 'Kündigungsverzicht (Monate, 0 = keiner)', '12'],
  ['ort', 'Ort für die Unterschrift', 'Hof'],
  ['vereinbarungen', 'Individuelle Vereinbarungen (§ 20)', ''],
];
/** Was von einem anderen Objekt als Vorschlag übernommen werden kann (gleicher Vermieter). */
export const UEBERNEHMBAR = ['mvName', 'mvAnschrift', 'mvTel', 'mvMail', 'bank', 'iban', 'bic', 'hv', 'kv', 'ort'];

const zahl = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? '' : Number(v));

/** Aus „2. OG links“ → Geschoss „2. OG“, Seite „links“; aus der Ausstattung → Häkchen. */
export function ableiten(o = {}) {
  const lage = String(o.lage || ''), a = String(o.ausstattung || '').toLowerCase();
  const seite = /\blinks\b/i.test(lage) ? 'links' : /\brechts\b/i.test(lage) ? 'rechts' : /\bmitte\b/i.test(lage) ? 'mitte' : '';
  const geschoss = lage.replace(/\b(links|rechts|mitte)\b/ig, '').replace(/[·,]/g, ' ').replace(/\s+/g, ' ').trim();
  const stp = /garage/.test(a) ? 'Garage' : /carport/.test(a) ? 'Carport' : /stellplatz|parkplatz/.test(a) ? 'Stellplatz' : '';
  return {
    geschoss, seite, stp,
    kueche: true, bad: true, flur: true,
    keller: /keller/.test(a), dachboden: /dachboden|speicher/.test(a), balkon: /balkon|loggia/.test(a), terrasse: /terrasse/.test(a),
    ort: String(o.ort || '').replace(/^\d{4,5}\s*/, '') || '',
    kv: 12,
  };
}

/** Vorschlag für ein neues Objekt: Vermieter, Bank usw. vom zuletzt gepflegten Objekt. */
export function vorlageVon(objekte, ohneId) {
  const q = [...(objekte || [])].reverse().find((x) => x.id !== ohneId && x.mv?.mvName);
  if (!q) return {};
  const v = {}; for (const k of UEBERNEHMBAR) if (q.mv[k] != null && q.mv[k] !== '') v[k] = q.mv[k];
  return v;
}

/** „Frau Linda Narr“ → „Narr, Linda“ */
export function vertragsname(n) {
  const s = String(n || '').trim().replace(/^(frau|herr|familie|fam\.|eheleute|dr\.)\s+/i, '').trim();
  if (!s || s.includes(',')) return s;
  const t = s.split(/\s+/); if (t.length < 2) return s;
  return `${t.at(-1)}, ${t.slice(0, -1).join(' ')}`;
}

/**
 * Alle Vertragsdaten zusammenführen. Reihenfolge: zuletzt beim Interessenten gespeichert → Interessent → Objekt (mv) → Ableitung → Vorlage anderer Objekte.
 */
export function vertragsdaten(o, k, objekte = []) {
  const v = k?.vertrag ?? {}, mv = o?.mv ?? {}, ab = ableiten(o), vl = vorlageVon(objekte, o?.id);
  const w = (key, ...weitere) => { for (const x of [v[key], ...weitere]) if (x !== undefined && x !== null && x !== '' && !(Array.isArray(x) && !x.length)) return x; return ''; };
  const ausst = {}; for (const [key] of AUSST) ausst[key] = typeof v.ausst?.[key] === 'boolean' ? v.ausst[key] : typeof mv.ausst?.[key] === 'boolean' ? mv.ausst[key] : ab[key];
  return {
    vname: w('vname', k?.vname, vertragsname(k?.name)), vname2: w('vname2', k?.vname2), anschrift: w('anschrift', k?.anschrift), tel: w('tel', k?.tel), mail: w('mail', k?.mail),
    mvName: w('mvName', mv.mvName, vl.mvName), mvAnschrift: w('mvAnschrift', mv.mvAnschrift, vl.mvAnschrift), mvTel: w('mvTel', mv.mvTel, vl.mvTel), mvMail: w('mvMail', mv.mvMail, vl.mvMail),
    bank: w('bank', mv.bank, vl.bank), iban: w('iban', mv.iban, vl.iban), bic: w('bic', mv.bic, vl.bic), hv: w('hv', mv.hv),
    adresse: w('adresse', [o?.titel, o?.ort].filter(Boolean).join(', ')), geschoss: w('geschoss', mv.geschoss, ab.geschoss), seite: w('seite', mv.seite, ab.seite),
    zimmer: w('zimmer', o?.zimmer), flaeche: w('flaeche', o?.flaeche), nutzflaeche: w('nutzflaeche', mv.nutzflaeche), ausst,
    stp: w('stp', mv.stp, ab.stp), stpNr: w('stpNr', mv.stpNr), stpKosten: w('stpKosten', mv.stpKosten), kuecheKosten: w('kuecheKosten', mv.kuecheKosten),
    schluessel: w('schluessel', mv.schluessel),
    kalt: w('kalt', o?.kaltmiete), nk: w('nk', o?.nk), kaution: w('kaution', o?.kaution, Number(w('kalt', o?.kaltmiete)) ? Math.round(Number(w('kalt', o?.kaltmiete)) * 250) / 100 : ''),
    beginn: w('beginn', k?.einzug, o?.frei), kv: w('kv', mv.kv, vl.kv, ab.kv), arbBis: w('arbBis'), arbWas: w('arbWas'),
    vereinbarungen: w('vereinbarungen', mv.vereinbarungen), ort: w('ort', mv.ort, vl.ort, ab.ort),
    deckblatt: false, // Übersichtsseite entfällt
  };
}

/** Pflichtangaben – ohne diese ist der Vertrag nicht vollständig. */
export const PFLICHT = [
  ['vname', 'Mieter: Name, Vorname'], ['anschrift', 'Mieter: bisherige Anschrift'],
  ['mvName', 'Vermieter: Name'], ['mvAnschrift', 'Vermieter: Anschrift'],
  ['adresse', 'Adresse der Wohnung'], ['geschoss', 'Geschoss'], ['zimmer', 'Zimmer'], ['flaeche', 'Wohnfläche'],
  ['kalt', 'Kaltmiete'], ['nk', 'Betriebskosten-Vorauszahlung'], ['kaution', 'Kaution'], ['beginn', 'Mietbeginn'],
  ['iban', 'IBAN für die Mietzahlung'], ['bank', 'Bank'],
];
export const fehlt = (d) => PFLICHT.filter(([k]) => d[k] === '' || d[k] == null).map(([, l]) => l);

/** Summe der monatlichen Zahlung (Kaltmiete + Stellplatz + Küche + Betriebskosten). */
export const gesamt = (d) => ['kalt', 'stpKosten', 'kuecheKosten', 'nk'].reduce((a, k) => a + (Number(zahl(d[k])) || 0), 0);

/** Schlüssel: Liste [{art, n, nr}] – ältere Einträge als Text („2 Haustür Nr. 12“) werden ebenfalls gelesen */
export function schluesselListe(x) {
  const anz = (v) => (v === '' || v == null || !Number(v) ? '' : Number(v));
  if (Array.isArray(x)) return x.map((s) => ({ art: String(s?.art ?? '').trim(), n: anz(s?.n), nr: String(s?.nr ?? '').trim() })).filter((s) => s.art || s.n !== '' || s.nr);
  return String(x || '').split(/\n|;/).map((z) => z.trim()).filter(Boolean).map((z) => {
    let nr = ''; const m1 = z.match(/\s+(?:nr\.?|nummer|#)\s*(.+)$/i); if (m1) { nr = m1[1].trim(); z = z.slice(0, m1.index).trim(); }
    const m = z.match(/^(\d+)\s*[x×]?\s*(.+)$/i);
    return m ? { n: Number(m[1]), art: m[2].trim(), nr } : { n: '', art: z, nr };
  });
}
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slZeile = (name, s = { art: '', n: '', nr: '' }) => `<div class="vm-sl-z"><input name="${name}_art" list="${name}Liste" value="${escH(s.art)}" maxlength="60" placeholder="Art des Schlüssels" aria-label="Art des Schlüssels" autocomplete="off"><input name="${name}_n" inputmode="numeric" value="${escH(s.n)}" maxlength="3" placeholder="–" aria-label="Anzahl"><input name="${name}_nr" value="${escH(s.nr)}" maxlength="40" placeholder="z. B. 14" aria-label="Schlüssel-Nummer" autocomplete="off"></div>`;
/** Eingabe der Schlüssel: mindestens fünf Zeilen mit Art, Anzahl und Nummer */
export function schluesselEditor(wert, name = 'sl') {
  let l = schluesselListe(wert);
  if (!l.length) l = SCHLUESSEL_STD.slice(0, 5).map((art) => ({ art, n: '', nr: '' }));
  while (l.length < 5) l.push({ art: '', n: '', nr: '' });
  return `<fieldset class="f wide vm-sl"><legend>Schlüssel</legend><div class="vm-sl-z vm-sl-k" aria-hidden="true"><span>Art des Schlüssels</span><span>Anzahl</span><span>Schlüssel-Nr.</span></div>
    <div class="vm-sl-l">${l.map((s) => slZeile(name, s)).join('')}</div><datalist id="${name}Liste">${SCHLUESSEL_STD.map((a) => `<option value="${escH(a)}">`).join('')}</datalist>
    <div class="vm-sl-f"><button type="button" class="btn ghost sm" data-sl-plus="${name}">+ weitere Zeile</button><small>Ohne Anzahl wird die Zeile im Vertrag zum Ausfüllen von Hand gedruckt. Zeile leeren = entfällt.</small></div></fieldset>`;
}
export function schluesselPlus(root, name = 'sl') { root.querySelector('.vm-sl-l')?.insertAdjacentHTML('beforeend', slZeile(name)); root.querySelector('.vm-sl-l .vm-sl-z:last-child input')?.focus(); }
export function schluesselLesen(root, name = 'sl') {
  const a = [...root.querySelectorAll(`[name=${name}_art]`)], n = [...root.querySelectorAll(`[name=${name}_n]`)], nr = [...root.querySelectorAll(`[name=${name}_nr]`)];
  const l = schluesselListe(a.map((el, i) => ({ art: el.value, n: n[i].value.replace(/\D/g, ''), nr: nr[i].value })));
  // Nur die unveränderten Vorschläge ohne Anzahl/Nummer → nichts speichern (Vertrag zeigt sie trotzdem zum Ausfüllen)
  const nurVorschlag = l.every((s) => s.n === '' && !s.nr) && l.map((s) => s.art).join('|') === SCHLUESSEL_STD.slice(0, 5).join('|');
  return nurVorschlag ? [] : l;
}
/** „Graf, Antonia“ → „Antonia Graf“ */
export const natuerlich = (n) => { const s = String(n || '').trim(), i = s.indexOf(','); return i > 0 ? `${s.slice(i + 1).trim()} ${s.slice(0, i).trim()}` : s; };

/** IBAN in Vierergruppen und Prüfsumme */
export const ibanSchoen = (s) => String(s || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
export function ibanOk(s) {
  const x = String(s || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(x)) return false;
  const r = (x.slice(4) + x.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  let m = 0; for (const ch of r) m = (m * 10 + Number(ch)) % 97; return m === 1;
}
