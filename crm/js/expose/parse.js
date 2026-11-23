// Regelbasiertes Auslesen von Partner-Exposés (Norderfranken-Format) – ohne KI.
// 1:1 aus dem bisherigen Exposé-Tool (parse.py) übernommen: liefert { objekt, texte, bilder }.

const ZAHLWORT = { 1: 'ersten', 2: 'zweiten', 3: 'dritten', 4: 'vierten', 5: 'fünften', 6: 'sechsten', 7: 'siebten', 8: 'achten', 9: 'neunten', 10: 'zehnten', 11: 'elften', 12: 'zwölften', 13: 'dreizehnten', 14: 'vierzehnten', 15: 'fünfzehnten' };
const WERBEFLOSKELN = /unschlagbar|begeister|zögern|traum|atemberaubend|wunderschön|!|kontaktieren sie|besichtigungstermin|unterstützen wir|erstvermietung|zusammenfassend|ideal für/i;
const RAUM = { 'wohnen': 'ein Wohnbereich', 'wohnen/essen': 'ein Wohn- und Essbereich', 'schlafen': 'ein Schlafzimmer', 'kind': 'ein Kinderzimmer', 'küche': 'die Küche', 'bad': 'das Duschbad', 'flur': 'der Flur', 'eingang/flur': 'der Eingangsbereich', 'wc': 'ein Gäste-WC', 'abstellraum': 'ein Abstellraum' };

/** '156.500 EUR' / 'ca. 79,00 EUR' / '3,95%' → Zahl */
export function deNum(s) {
  if (s == null) return 0;
  const m = String(s).replace(/ /g, '').match(/-?\d[\d.]*(?:,\d+)?/);
  return m ? parseFloat(m[0].replace(/\./g, '').replace(',', '.')) || 0 : 0;
}
const linesOf = text => String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
/** Wert in der Zeile nach dem ersten passenden Label */
function after(lines, ...labels) {
  for (const lab of labels) {
    const rx = new RegExp('^(?:' + lab + ')$', 'i');
    for (let i = 0; i < lines.length - 1; i++) if (rx.test(lines[i])) return lines[i + 1];
  }
  return '';
}
/** Blocksatz-Zeilen zu Fließtext zusammenfügen */
const flow = lines => lines.join(' ').replace(/([\wäöüÄÖÜß])- ([\wäöüÄÖÜß])/g, '$1$2').replace(/\s+/g, ' ').trim();
function sentences(t) {
  const out = []; let start = 0; const rx = /[.!?]\s+(?=[A-ZÄÖÜ])/g; let m;
  while ((m = rx.exec(t))) { out.push(t.slice(start, m.index + 1).trim()); start = m.index + m[0].length; }
  out.push(t.slice(start).trim());
  return out.filter(Boolean);
}
function sectionText(pages, heading) {
  for (const txt of pages) {
    const ls = linesOf(txt);
    if (ls.length && ls.slice(0, 3).some(l => l.toLowerCase() === heading.toLowerCase())) {
      const body = ls.filter(l => l.toLowerCase() !== heading.toLowerCase() && !l.startsWith('Exposé |') && !/^(Kaufpreis|Abgabepreis):?$/.test(l) && !/^[\d.]+ EUR$/.test(l) && !l.toLowerCase().includes('norderfranken'));
      return flow(body);
    }
  }
  return '';
}
const und = xs => { xs = xs.filter(Boolean); return xs.length === 1 ? xs[0] : xs.length ? xs.slice(0, -1).join(', ') + ' und ' + xs[xs.length - 1] : ''; };
const fmt = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const strasseLang = s => String(s).replace(/str\.(\s*\d)/, 'straße$1');
const r2 = n => Math.round(n * 100) / 100;

/** status: null (aus dem PDF lesen) | 'unvermietet' | 'frisch' | 'vermietet' */
export function parse(pages, images, status = null) {
  const alltext = pages.join('\n'), L = linesOf(alltext), low = alltext.toLowerCase();

  // --- Deckblatt
  const cover = pages.length ? linesOf(pages[0]) : [];
  const objektart = cover.length > 1 && cover[1].length < 40 ? cover[1] : 'Eigentumswohnung';
  const adrLine = cover.find(l => /\d{5}/.test(l)) || '';
  let m = adrLine.match(/(.+?),\s*(\d{5})\s+(.+)/);
  let [strasse, plz, ort] = m ? [m[1].trim(), m[2], m[3].trim()] : ['', '', ''];
  if (!ort) { const m2 = after(L, 'Ort').match(/^(\d{5}),?\s*(.+)/); if (m2) { plz = m2[1]; ort = m2[2]; } }
  const idx = cover.includes(adrLine) && adrLine ? cover.indexOf(adrLine) : 2;
  const tagline = flow(cover.slice(idx + 1, idx + 4).filter(l => !l.toLowerCase().replace(/\s+/g, '').includes('norderfranken') && !/No rd|Gm b H/.test(l)));

  // --- Objektdaten
  const etageRaw = after(L, 'Etage');
  let etage = etageRaw.replace(/\s*\(.*?\)/g, '').trim();
  let wohnflaeche = deNum(after(L, 'Wohnfläche'));
  let zimmer = deNum(after(L, 'Zimmeranzahl', 'Zimmer'));
  let baujahr = after(L, 'Baujahr').replace(/\D/g, '').slice(0, 4);
  let vermietung = after(L, 'Vermietung') || '';
  let kaufpreis = deNum(after(L, 'Kaufpreis', 'Abgabepreis', 'Kaufpreis:'));
  let nkm = deNum(after(L, 'NKM', 'Nettokaltmiete', 'Kaltmiete'));
  const garage = deNum(after(L, 'Garage(/ ?Stpl\\.?)?', 'Stellplatz'));
  let hausgeld = deNum(after(L, 'Hausgeld'));
  let hgnu = deNum(after(L, 'davon nicht uml(egbar|agefähig)'));
  const provision = after(L, 'Provision');
  let energieklasse = after(L, 'Energieausweis'); if (energieklasse.length > 5) energieklasse = '';
  const energie = { art: '', kennwert: '', klasse: energieklasse, traeger: '', baujahr: '', gueltig_bis: '' };
  const et = pages.find(t => t.toLowerCase().slice(0, 200).includes('energieausweis') && t.toLowerCase().includes('kwh')) || '';
  if (et) {
    const flat = et.replace(/\s+/g, ' ');
    energie.art = flat.toLowerCase().includes('verbrauch') ? 'Energieverbrauchsausweis' : 'Energiebedarfsausweis';
    const km = flat.match(/End(?:energie)?(?:verbrauch|bedarf)[^0-9]{0,80}?(\d{1,3}(?:,\d)?)\s*kWh/i);
    if (km) energie.kennwert = km[1] + ' kWh/(m²·a)';
    for (const [w, name] of [['heizöl', 'Heizöl'], ['erdgas', 'Erdgas'], ['fernwärme', 'Fernwärme'], ['pellet', 'Holzpellets'], ['wärmepumpe', 'Strom (Wärmepumpe)'], ['gas', 'Erdgas']])
      if (flat.toLowerCase().includes(w)) { energie.traeger = name; break; }
    const gm = flat.match(/gültig bis:?\s*(\d{2}\.\d{2}\.\d{4})/i);
    if (gm) energie.gueltig_bis = gm[1];
  }
  m = alltext.match(/(vorhandenes|angenommenes)?\s*Gutachten f[üu]r Restnutzungsdauer:?\s*(\d+)\s*Jahre/i);
  let rnd = m ? parseInt(m[2], 10) : 0;
  let rndAngenommen = !!(m && (m[1] || '').toLowerCase().startsWith('angenommen'));

  // --- Fallback für fremde Formate: Werte im Fließtext suchen
  const flat = alltext.replace(/\s+/g, ' ');
  const such = rx => { const x = flat.match(rx); if (!x) return ''; for (let i = x.length - 1; i > 0; i--) if (x[i] != null) return x[i]; return ''; };
  if (!kaufpreis) kaufpreis = deNum(such(/(?:Kaufpreis|Abgabepreis|Verkaufspreis|Preis)\s*:?\s*(?:ca\.\s*)?([\d.]{5,}(?:,\d{2})?)\s*(?:€|EUR|Euro)/i));
  if (!nkm) {
    nkm = deNum(such(/(?:Nettokaltmiete|Kaltmiete|NKM|Ist-?Miete|Miete netto|Mieteinnahmen(?: mtl\.?| monatlich)?)\s*(?:\(mtl\.?\))?\s*:?\s*(?:ca\.\s*)?([\d.]+(?:,\d{1,2})?)\s*(?:€|EUR|Euro)/i));
    if (nkm > 5000) nkm = r2(nkm / 12);      // Jahresmiete erwischt
  }
  if (!wohnflaeche) wohnflaeche = deNum(such(/Wohnfläche\s*:?\s*(?:ca\.\s*)?([\d.]+(?:,\d+)?)\s*m/i));
  if (!zimmer) zimmer = deNum(such(/(?:Zimmer(?:anzahl)?\s*:?\s*([\d,]+))|(?:([\d,]+)\s*-?\s*Zimmer)/i));
  if (!baujahr) baujahr = such(/Baujahr\s*:?\s*(?:ca\.\s*)?(\d{4})/i);
  if (!hausgeld) hausgeld = deNum(such(/Hausgeld\s*(?:mtl\.?|monatlich)?\s*:?\s*(?:ca\.\s*)?([\d.]+(?:,\d{1,2})?)\s*(?:€|EUR)/i));
  if (!hgnu) hgnu = deNum(such(/nicht umlage(?:fähig|bar)[\wäöüß]*\s*:?\s*(?:ca\.\s*)?([\d.]+(?:,\d{1,2})?)\s*(?:€|EUR)/i));
  if (!etageRaw) {
    etage = such(/(\d{1,2}\.\s*(?:Obergeschoss|OG|Etage|Stock))/i) || (/Erdgeschoss|\bEG\b/.test(flat) ? 'Erdgeschoss' : '');
    etage = etage.replace(/\bOG\b|Stock|Etage/g, 'Obergeschoss');
  }
  if (!vermietung) vermietung = /\bvermietet\b/i.test(flat) && !/unvermietet|leerstehend|bezugsfrei/i.test(flat) ? 'vermietet' : /unvermietet|leerstehend|bezugsfrei/i.test(flat) ? 'unvermietet' : '';
  if (!m) {
    m = flat.match(/Restnutzungsdauer[^.]{0,40}?(\d{1,2})\s*Jahre/i);
    rnd = m ? parseInt(m[1], 10) : 0;
    rndAngenommen = !!(m && /angenommen|geplant|in Vorbereitung|wird erstellt/i.test(flat));
  }

  // --- Merkmale
  const inkl = L.find(l => l.toLowerCase().startsWith('inkl.')) || '';
  const hat = (...w) => w.some(x => low.includes(x));
  const fahrstuhl = hat('fahrstuhl', 'aufzug'), loggia = low.includes('loggia'), balkon = loggia || hat('balkon', 'terrasse');
  const aussen = loggia ? 'Loggia' : balkon ? 'Balkon' : '';
  const kueche = hat('einbauküche'), beispiel = hat('beispielbild', 'vergleichswohnung', 'fast gleichen wohnung');
  const saniert = hat('kernsanier') ? 'kernsaniert' : hat('saniert', 'sanierung') ? 'saniert' : hat('renoviert') ? 'renoviert' : '';
  const grad = { kernsaniert: 'Kernsanierte', saniert: hat('top saniert', 'hochwertig saniert') ? 'Topsanierte' : 'Sanierte', renoviert: 'Renovierte' }[saniert] || 'Gepflegte';
  const etageNr = /^\d/.test(etage) ? Math.trunc(deNum(etage)) : 0;
  const z = Number.isInteger(zimmer) ? zimmer : String(zimmer).replace('.', ',');
  let unvermietet = vermietung.toLowerCase().includes('unvermietet') || ['frei', 'leerstehend'].includes(vermietung.toLowerCase());
  if (!['unvermietet', 'frisch', 'vermietet'].includes(status)) status = unvermietet ? 'unvermietet' : 'vermietet';
  const vermSatz = { unvermietet: ' Bezugsfertig, unvermietet und sofort verfügbar.', frisch: ' Frisch vermietet – die Mieteinnahmen laufen ab Übergabe.', vermietet: ' Vermietet – die Mieteinnahmen laufen ab Übergabe.' }[status];

  // --- Grundriss-Räume
  const raeume = [];
  for (let i = 0; i < L.length - 1; i++) {
    const l = L[i];
    if (/m²/.test(L[i + 1]) && !L[i + 1].includes('EUR') && !l.replace(/ \| /g, '').includes('/') && /^[A-ZÄÖÜ][\wäöüÄÖÜß |/()%.,-]*:?$/.test(l) && l.length < 40 && !/^(Gesamt|Wohnfläche|WOHNF)/i.test(l)) {
      let name = l.replace(/\s*\(.*/, '').replace(/:+$/, '').replace(/ \| /g, '/').trim();
      name = RAUM[name.toLowerCase()] || name;
      if (name && !raeume.includes(name) && !/^(balkon|loggia|terrasse)/i.test(name)) raeume.push(name);
    }
  }

  // --- Texte
  const feats = [aussen, fahrstuhl ? 'Fahrstuhl' : '', kueche && !fahrstuhl ? 'Einbauküche' : ''].filter(Boolean).slice(0, 2);
  const basisTitel = zimmer ? `${grad} ${z}-Zimmer-Wohnung` : `${grad} ${objektart}`;
  const titel = basisTitel + (feats.length ? '\nmit ' + feats.join(' und ') : '');
  const etageTxt = etageNr ? `im ${ZAHLWORT[etageNr] || etageNr + '.'} Obergeschoss` : etage.toLowerCase().includes('erd') ? 'im Erdgeschoss' : '';
  const mit = [aussen, fahrstuhl ? 'Fahrstuhl' : '', kueche ? 'neuer Einbauküche' : ''].filter(Boolean);
  const zustand = { kernsaniert: 'vollständig kernsanierte', saniert: 'vollständig sanierte', renoviert: 'renovierte' }[saniert] || 'gepflegte';
  let intro = `Eine ${zustand} Eigentumswohnung ${etageTxt}`.trim();
  intro += mit.length ? ' — mit ' + und(mit) + '.' : '.';
  intro += vermSatz;
  if (rnd && !rndAngenommen) intro += ' Dazu ein Restnutzungsdauer-Gutachten, das die Abschreibung deutlich erhöht.';
  const chips = [provision.toLowerCase().includes('keine') || !provision ? 'Für Käufer provisionsfrei' : provision,
    { unvermietet: 'Unvermietet und sofort verfügbar', frisch: 'Frisch vermietet', vermietet: 'Vermietet ab Übergabe' }[status],
    { kernsaniert: 'Kernsaniert und bezugsfertig', saniert: 'Saniert und bezugsfertig', renoviert: 'Renoviert und bezugsfertig' }[saniert] || 'Bezugsfertig'];

  const headline = fahrstuhl && etageNr >= 5 ? (ort ? `Weiter Blick über ${ort}, alles neu` : 'Weiter Blick, alles neu') : balkon ? `Hell, durchdacht, mit ${aussen}` : 'Klar geschnitten, alles neu';

  const ausst = [], add = (cond, t) => { if (cond && t && !ausst.includes(t)) ausst.push(t); };
  add(kueche, 'Neue Einbauküche');
  add(hat('ebenerdig', 'bodengleich', 'bodentief'), 'Bad mit nahezu ebenerdiger Dusche');
  add(!hat('ebenerdig', 'bodengleich') && hat('dusche'), 'Bad mit Dusche');
  add(hat('badewanne'), 'Bad mit Badewanne');
  add(hat('gäste-wc', 'separates wc'), 'Separates Gäste-WC');
  add(hat('klick-vinyl', 'vinylboden'), 'Klick-Vinylboden in Landhausdielen-Optik');
  add(hat('parkett'), 'Parkettboden');
  add(hat('einbauschrank'), 'Einbauschrank (Garderobe)');
  add(balkon, fahrstuhl && etageNr >= 5 ? `${aussen} mit weitem Blick` : aussen);
  add(fahrstuhl, 'Fahrstuhl im Haus');
  add(hat('stellplatz', 'stpl'), 'Stellplatznutzung');
  add(hat('barrierefrei', 'barrierearm'), 'Barrierearmer Zuschnitt');
  add(hat('elektro'), 'Erneuerte Elektroinstallation');
  add(!!saniert, { kernsaniert: 'Kernsaniert und bezugsfertig', saniert: 'Frisch saniert und bezugsfertig', renoviert: 'Renoviert und bezugsfertig' }[saniert] || '');
  if (rnd) ausst.push(rndAngenommen ? 'Restnutzungsdauer-Gutachten in Vorbereitung' : 'Restnutzungsdauer-Gutachten liegt vor');

  let p1 = etageTxt ? `Die Wohnung liegt ${etageTxt} eines gepflegten Wohnhauses` : 'Die Wohnung liegt in einem gepflegten Wohnhaus';
  p1 += (fahrstuhl ? ' mit Aufzug' : '') + (baujahr ? `, Baujahr ${baujahr}` : '') + '.';
  const teile = [kueche ? 'neuer Einbauküche' : '', hat('dusche') ? 'modernem Duschbad' : '', hat('klick-vinyl', 'vinylboden') ? 'hochwertigem Klick-Vinylboden' : '', hat('einbauschrank') ? 'Einbauschrank in der Garderobe' : ''].filter(Boolean);
  if (teile.length) p1 += ` Sie wurde ${['saniert', 'kernsaniert'].includes(saniert) ? 'vollständig ' : ''}${saniert || 'modernisiert'} — mit ` + und(teile) + '.';
  let p2 = '';
  if (raeume.length) {
    p2 = `Auf ${fmt(wohnflaeche)} m² verteilen sich ` + und(raeume) + '.';
    if (aussen) p2 += ` ${aussen === 'Loggia' ? 'Die' : 'Der'} ${aussen} erweitert den Wohnbereich nach draußen` + (fahrstuhl && etageNr >= 5 ? ' — mit Blick weit über die Stadt.' : '.');
  }
  let p3 = { unvermietet: 'Die Wohnung ist unvermietet und sofort verfügbar. Sie können sie also frei vermieten oder selbst beziehen.', frisch: 'Die Wohnung ist frisch vermietet; die Mieteinnahmen fließen ab Übergabe an Sie.', vermietet: 'Die Wohnung ist vermietet; die Mieteinnahmen fließen ab Übergabe an Sie.' }[status];
  if (beispiel) p3 += ' Einzelne Bilder zeigen eine baugleiche Vergleichswohnung im selben Haus.';

  const lageRaw = sectionText(pages, 'Lage');
  let lage = sentences(lageRaw).filter(s => !WERBEFLOSKELN.test(s)).join(' ');
  for (const [a, b] of [['Ernst-Reuther', 'Ernst-Reuter'], ['ein absoluter Vorteil', 'ein Vorteil'], ['eine hervorragende Anbindung', 'eine gute Verbindung'], ['sehr gute Anbindung', 'gute Anbindung'], ['Sport und Gesundheitszentrum', 'Sport- und Gesundheitszentrum'], ['Freizeitaktivitäten, sowie', 'Freizeitaktivitäten sowie']])
    lage = lage.split(a).join(b);
  if (!lage) lage = sentences(sectionText(pages, 'Objektbeschreibung')).filter(s => /lage|nähe|anbindung|erreich|zentrum/i.test(s) && !WERBEFLOSKELN.test(s)).join(' ');
  if (!lage && ort) lage = `Die Wohnung liegt in ${ort}; Einkaufsmöglichkeiten, Ärzte und Nahverkehr sind gut erreichbar.`;

  const texte = { kicker: `Exposé · ${objektart}`, titel, intro, chips, objekt_kicker: 'Das Objekt', objekt_headline: headline, objekt_text: [p1, p2, p3].filter(Boolean), ausstattung: ausst.slice(0, 9), lage_text: lage };
  const objekt = { objektart, strasse: strasseLang(strasse), plz, ort, etage, wohnflaeche, zimmer, baujahr, kaufpreis_partner: kaufpreis, kaltmiete: r2(nkm + garage), hausgeld, hausgeld_nicht_umlagefaehig: hgnu,
    restnutzungsdauer: rnd, rnd_angenommen: rndAngenommen, vermietung: { unvermietet: 'unvermietet, sofort frei', frisch: 'frisch vermietet', vermietet: 'vermietet' }[status], vermietung_status: status,
    provision: provision.toLowerCase().includes('keine') || !provision ? 'keine' : provision, energie, tagline, inkl };
  return { objekt, texte, bilder: waehleBilder(pages, images) };
}

/** Hamming-Abstand zweier Wahrnehmungs-Hashes (Hex-Strings) */
function hamming(a, b) { let n = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } } return n; }

export function waehleBilder(pages, images) {
  const cat = img => {
    const h = (img.heading || '').toLowerCase();
    if (img.plan && !h.includes('energie')) return 'grundriss';
    if (h.includes('eigentumswohnung') || h === 'objekttyp') return 'haus';
    const pageTxt = (pages[img.page - 1] || '').toLowerCase();
    for (const [k, words] of [['energie', ['energieausweis']], ['lage', ['lage']], ['grundriss', ['grundriss']], ['fahrstuhl', ['fahrstuhl', 'aufzug']], ['kueche', ['küche']], ['bad', ['bad', 'wc', 'dusch']],
      ['balkon', ['balkon', 'loggia', 'blick', 'terrasse']], ['wohn', ['wohn', 'ess']], ['schlaf', ['schlaf', 'kind', 'flur']], ['haus', ['haus', 'objekt', 'hochwertig']]])
      if (words.some(w => w === h || h.startsWith(w) || (h.includes(w) && k !== 'lage'))) return k;
    return pageTxt.includes('beispielbild') ? 'wohn' : 'haus';
  };
  // Bildunterschriften: „… (Beispielbild)“-Zeilen der Seite der Reihe nach zuordnen
  const perPage = new Map();
  for (const img of images) { if (!perPage.has(img.page)) perPage.set(img.page, []); perPage.get(img.page).push(img); }
  for (const [pno, imgs] of perPage) {
    const txt = pages[pno - 1] || '', caps = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l.toLowerCase().includes('beispielbild'));
    const vergleich = /fast gleichen wohnung|vergleichswohnung/i.test(txt);
    imgs.forEach((img, i) => {
      img.cat = cat(img);
      if (i < caps.length) { img.caption = caps[i]; img.cat = cat({ heading: caps[i], page: pno }); }
      else {
        let c = (img.heading || '').replace(/^Hochwertig.*/, 'Hausansicht'); if (c === 'OBJEKTTYP') c = 'Hausansicht';
        if (!/haus|wohn|ess|schlaf|kind|flur|küche|bad|wc|dusch|balkon|loggia|terrasse|blick|grundriss|fahrstuhl|aufzug|garten|keller|treppen|eingang|stellplatz|garage/i.test(c) || c.length > 60) c = '';
        img.caption = c ? c + (vergleich ? ' (Beispielbild)' : '') : vergleich ? 'Beispielbild' : '';
      }
    });
  }
  let usable = images.filter(i => !['energie', 'lage'].includes(i.cat) && !i.karte);
  // Beinahe-Dubletten (gleiche Ansicht) – nur das größere Bild behalten
  const eindeutig = [];
  for (const i of [...usable].sort((a, b) => b.w * b.h - a.w * a.h)) {
    if (i.dhash && eindeutig.some(j => j.dhash && hamming(i.dhash, j.dhash) <= 18)) continue;
    eindeutig.push(i);
  }
  usable = usable.filter(i => eindeutig.includes(i));
  const gross = usable.filter(i => i.w >= 700 || i.cat === 'grundriss');
  if (gross.length >= 4) usable = gross;
  const by = (...cs) => usable.filter(i => cs.includes(i.cat)).map(i => i.id), used = [];
  const take = (cands, n) => { const out = []; for (const c of cands) if (!used.includes(c) && out.length < n) { out.push(c); used.push(c); } return out; };
  const titel = take([...by('wohn'), ...by('schlaf'), ...by('balkon'), ...by('haus')], 1);
  let seite2 = [...take(by('kueche'), 1), ...take(by('bad'), 1)];
  const rest = () => usable.filter(i => !used.includes(i.id) && i.cat !== 'grundriss').map(i => i.id);
  if (seite2.length < 2) seite2 = [...seite2, ...take(rest(), 2 - seite2.length)];
  if (!seite2.length && titel.length) seite2 = titel.slice(0, 1);
  const hoch = usable.filter(i => i.cat === 'grundriss' && i.w / Math.max(i.h, 1) < 1.5).map(i => i.id).slice(0, 1);
  let seite4 = [...take(by('balkon').length ? by('balkon') : by('haus'), 1), ...take(hoch.length ? hoch : by('grundriss'), 1)];
  if (seite4.length < 2) seite4 = [...seite4, ...take(rest(), 2 - seite4.length)];
  const seite1 = take([...by('wohn'), ...by('schlaf'), ...by('fahrstuhl'), ...by('balkon'), ...by('kueche'), ...by('bad'), ...by('haus')], 3);
  const galerie = ['haus', 'wohn', 'schlaf', 'kueche', 'bad', 'balkon', 'fahrstuhl', 'grundriss'].flatMap(o => usable.filter(i => i.cat === o && !used.includes(i.id)).map(i => i.id));
  const energieSeite = pages.findIndex(t => linesOf(t).slice(0, 3).some(l => l.toLowerCase() === 'energieausweis')) + 1;
  return { titel: titel[0] || '', seite1, seite2, seite4, galerie, energieausweis_seite: energieSeite, energieausweis_bild: (images.find(i => i.cat === 'energie') || {}).id || '' };
}

/** Notfall-Struktur, wenn das Format gar nicht passt – Werte werden dann von Hand eingetragen */
export function leer(pages, images) {
  return { objekt: { objektart: 'Eigentumswohnung', strasse: '', plz: '', ort: '', etage: '', wohnflaeche: 0, zimmer: 0, baujahr: '', kaufpreis_partner: 0, kaltmiete: 0, hausgeld: 0, hausgeld_nicht_umlagefaehig: 0, restnutzungsdauer: 0, rnd_angenommen: false,
      vermietung: '', vermietung_status: 'vermietet', provision: 'keine', energie: { art: '', kennwert: '', klasse: '', traeger: '', baujahr: '', gueltig_bis: '' } },
    texte: { kicker: 'Exposé · Eigentumswohnung', titel: 'Eigentumswohnung', intro: '', chips: ['Für Käufer provisionsfrei'], objekt_kicker: 'Das Objekt', objekt_headline: 'Das Objekt', objekt_text: [], ausstattung: [], lage_text: '' },
    bilder: waehleBilder(pages, images) };
}
