// Keuerleber-Exposé: Kalkulation + HTML-Layout (A4-Seiten) – unverändert aus dem bisherigen Exposé-Tool übernommen.
// Einzige Anpassung: Bilder kommen als fertige Adressen (i.src), Logos/Foto aus dem Ordner crm/expose/.

export const eur0 = n => Math.round(n).toLocaleString('de-DE') + ' €';
export const eur2 = n => n.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €';
export const pct = (n, d = 2) => n.toLocaleString('de-DE', {minimumFractionDigits: d, maximumFractionDigits: d}) + ' %';
export const num = (n, d = 2) => n.toLocaleString('de-DE', {minimumFractionDigits: d, maximumFractionDigits: d});
export const sgn = (n, f) => (n < 0 ? '− ' : '+ ') + f(Math.abs(n));
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

// Alle angezeigten Werte werden gerundet und JEDE Summe aus den gerundeten Werten gebildet,
// damit jede Zeile im Exposé exakt nachrechenbar ist.
// Gerechnet wird in ganzen Zahlen (Euro bzw. Cent, Prozentsätze in Tausendstel-Prozent) – so gibt es keine
// Rundungsfehler durch Kommazahlen; gerundet wird kaufmännisch (ab ,5 vom Betrag weg).
export const r0 = n => Math.round(n), r2 = n => Math.round(n * 100) / 100;
const zahlOder = (v, sonst = 0) => { const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : +v; return Number.isFinite(n) ? n : sonst; };
/** ganzzahlige Division, kaufmännisch gerundet */
export const teile = (z, n) => { if (!n) return 0; const neg = (z < 0) !== (n < 0), q = Math.floor((2 * Math.abs(z) + Math.abs(n)) / (2 * Math.abs(n))); return neg ? -q : q; };
const P = x => Math.round(zahlOder(x) * 1000);     // Prozent → Tausendstel-Prozent
const C = x => Math.round(zahlOder(x) * 100);      // Euro → Cent
export function berechne(p, s) {
  const o = p.objekt || {}, a = Object.assign({}, s.annahmen, p.annahmen || {});
  for (const k of ['ek_quote', 'zins', 'tilgung', 'nebenkosten', 'steuersatz', 'gebaeudeanteil', 'afa_standard']) a[k] = zahlOder(a[k], zahlOder(s.annahmen[k]));
  const basis = zahlOder(o.kaufpreis_partner), rd = Math.max(1, Math.round(zahlOder(a.rundung, 100)));
  const fest = zahlOder(p.preis_override) > 0;
  const kp = fest ? Math.round(zahlOder(p.preis_override)) : teile(C(basis) * (100000 + P(p.aufschlag)), 100 * 100000 * rd) * rd;
  const nachlass = Math.max(0, Math.round(zahlOder(p.nachlass)));   // im Exposé gezeigter Nachlass (€) – der Kaufpreis kp bleibt der Endpreis
  const nk = teile(kp * P(a.nebenkosten), 100000);
  const ek = nk + teile(kp * P(a.ek_quote), 100000);
  const darlehen = kp + nk - ek;
  const rateC = teile(darlehen * (P(a.zins) + P(a.tilgung)), 12000);              // Cent pro Monat
  const mieteC = C(o.kaltmiete), hgnuC = C(o.hausgeld_nicht_umlagefaehig);
  const vorStC = mieteC - rateC - hgnuC;
  const rnd = Math.max(0, Math.round(zahlOder(o.restnutzungsdauer)));
  // fester AfA-Satz pro Objekt (z. B. aus Pauls eigener Rechnung) hat Vorrang vor 1/RND; Satz in Hundertstel-Prozent
  const afaH = zahlOder(o.afa_satz) > 0 ? Math.round(zahlOder(o.afa_satz) * 100) : rnd > 0 ? teile(10000, rnd) : Math.round(a.afa_standard * 100);
  const gebaeude = teile(kp * P(a.gebaeudeanteil), 100000);
  const afa = teile(gebaeude * afaH, 10000);
  const afaStd = teile(gebaeude * P(a.afa_standard), 100000);
  const miete12 = teile(mieteC * 12, 100), zinsen = teile(darlehen * P(a.zins), 100000), hg12 = teile(hgnuC * 12, 100);
  const ergebnis = miete12 - afa - zinsen - hg12;
  const steuer = teile(-ergebnis * P(a.steuersatz), 100000);                       // positiv = Ersparnis, pro Jahr
  const steuerMonatC = teile(steuer * 100, 12);
  const nachStC = vorStC + steuerMonatC;
  const W = C(o.wohnflaeche);
  return {a, basis, kp, nk, ek, darlehen, rate: rateC / 100, miete: mieteC / 100, hgnu: hgnuC / 100, vorSt: vorStC / 100, rnd, afaSatz: afaH / 100, gebaeude, afa, afaStd,
    miete12, zinsen, hg12, ergebnis, steuer, steuerMonat: steuerMonatC / 100, nachSt: nachStC / 100, marge: kp - Math.round(basis), fest, rundung: rd,
    nachlass, listenpreis: kp + nachlass,             // Nachlass nur für die Darstellung: gerechnet wird immer mit dem Preis nach Nachlass (kp)
    aufschlagEcht: basis > 0 ? teile((kp - basis) * 100000, basis) / 1000 : 0,       // tatsächlicher Aufschlag nach Rundung, in %
    rendite: kp ? teile(mieteC * 12 * 100, kp) / 100 : 0, faktor: mieteC ? teile(kp * 1000, mieteC * 12) / 10 : 0,
    qm: W ? teile(kp * 100, W) : 0, mieteQm: W ? teile(mieteC * 100, W) / 100 : 0};
}
/** Gegenprobe: rechnet jede Zeile des Exposés unabhängig nach (mit Kommazahlen statt ganzen Zahlen) und prüft alle Summen.
 *  Liefert eine Liste von Abweichungen – leer heißt: alles stimmt. */
export function kontrolle(p, s) {
  const c = berechne(p, s), a = c.a, o = p.objekt || {}, F = [];
  const cent = x => Math.round(x * 100), nah = (ist, soll, tol, name) => { if (!(Math.abs(ist - soll) <= tol)) F.push(`${name}: ${ist} statt ${soll}`); };
  const gleich = (ist, soll, name) => { if (ist !== soll) F.push(`${name}: ${ist} statt ${soll}`); };
  if (![c.kp, c.nk, c.ek, c.darlehen, c.rate, c.miete, c.vorSt, c.afa, c.zinsen, c.ergebnis, c.steuer, c.nachSt, c.rendite].every(Number.isFinite)) F.push('ungültige Zahl in der Rechnung');
  // 1. Summen genau so, wie sie im Exposé untereinander stehen
  gleich(c.kp + c.nk - c.ek, c.darlehen, 'Gesamtinvestition − Eigenkapital = Darlehen');
  gleich(c.listenpreis - c.nachlass, c.kp, 'Angebotspreis − Nachlass = Kaufpreis');
  if (c.nachlass && !(c.nachlass < c.listenpreis)) F.push('Nachlass ist größer als der Preis');
  gleich(cent(c.miete) - cent(c.rate) - cent(c.hgnu), cent(c.vorSt), 'Miete − Rate − Hausgeld = vor Steuern (Cent)');
  gleich(cent(c.vorSt) + cent(c.steuerMonat), cent(c.nachSt), 'vor Steuern + Steuerwirkung = nach Steuern (Cent)');
  gleich(c.miete12 - c.afa - c.zinsen - c.hg12, c.ergebnis, 'Mieteinnahmen − AfA − Zinsen − Hausgeld = steuerliches Ergebnis');
  // 2. jede Einzelzeile unabhängig nachgerechnet (höchstens Rundung auf den letzten Euro/Cent darf abweichen)
  const ae = +a.ek_quote, az = +a.zins, at = +a.tilgung, an = +a.nebenkosten, ast = +a.steuersatz, ag = +a.gebaeudeanteil;
  if (!c.fest) nah(c.kp, Math.round((+o.kaufpreis_partner || 0) * (1 + (+p.aufschlag || 0) / 100) / c.rundung) * c.rundung, c.rundung, 'Kaufpreis');
  nah(c.nk, c.kp * an / 100, 0.51, 'Kaufnebenkosten'); nah(c.ek, c.nk + c.kp * ae / 100, 0.51, 'Eigenkapital');
  nah(c.rate, c.darlehen * (az + at) / 100 / 12, 0.0051, 'Kreditrate'); nah(c.zinsen, c.darlehen * az / 100, 0.51, 'Schuldzinsen');
  nah(c.gebaeude, c.kp * ag / 100, 0.51, 'Gebäudeanteil'); nah(c.afa, c.gebaeude * c.afaSatz / 100, 0.51, 'Abschreibung');
  nah(c.miete12, c.miete * 12, 0.51, 'Jahresmiete'); nah(c.hg12, c.hgnu * 12, 0.51, 'Hausgeld pro Jahr');
  nah(c.steuer, -c.ergebnis * ast / 100, 0.51, 'Steuerwirkung pro Jahr'); nah(c.steuerMonat, c.steuer / 12, 0.0051, 'Steuerwirkung pro Monat');
  if (c.kp) nah(c.rendite, c.miete * 12 / c.kp * 100, 0.0051, 'Brutto-Mietrendite');
  if (c.miete) nah(c.faktor, c.kp / (c.miete * 12), 0.051, 'Kaufpreisfaktor');
  if (+o.wohnflaeche > 0) { nah(c.qm, c.kp / +o.wohnflaeche, 0.51, 'Preis je m²'); nah(c.mieteQm, c.miete / +o.wohnflaeche, 0.0051, 'Miete je m²'); }
  return F;
}
/** Zu volle Seiten schrittweise verkleinern (Schrift/Abstände), damit nichts abgeschnitten wird. Liefert die Nummern der Seiten, die trotzdem zu voll sind. */
const FIT = ['fit1', 'fit2', 'fit3', 'fit4'];   // fit4: zusätzlich die Bildreihe der Seite weglassen – Text geht vor
export function einpassen(root) {
  const voll = [];
  root.querySelectorAll('.page').forEach((pg, i) => {
    const m = pg.querySelector('main'); if (!m) return;
    pg.classList.remove(...FIT);
    const zuViel = () => m.scrollHeight > m.clientHeight + 1 || [...m.children].some(k => k.getBoundingClientRect().bottom > m.getBoundingClientRect().bottom + 1.5);
    for (const f of FIT) { if (!zuViel()) break; pg.classList.remove(...FIT); pg.classList.add(f); if (f === 'fit4') pg.classList.add('fit3'); }
    if (zuViel()) voll.push(i + 1);
  });
  return voll;
}

export function renderExpose(p, s, basis) {
  const o = p.objekt || {}, t = p.texte || {}, b = p.bilder || {}, k = s.kontakt, e = o.energie || {};
  const c = berechne(p, s), a = c.a;
  const imgs = Object.fromEntries((p.images || []).map(i => [i.id, i]));
  const src = id => imgs[id] ? imgs[id].src || '' : '';
  const img = (id, cls = '') => imgs[id] ? `<div class="ph ${cls} ${(imgs[id].cat === 'grundriss' || imgs[id].plan) ? 'contain' : ''}" style="background-image:url('${src(id)}')"></div>` : '';
  const adr = [o.strasse, [o.plz, o.ort].filter(Boolean).join(' '), o.etage].filter(Boolean).join(' · ');
  let seite = 0;
  // helle Seiten: dunklere Goldvariante (Kontrast 4,1:1); auf Fotos: Original-Gold auf abgedunkeltem Bildrand
  const kopf = `<img class="logo-h" src="${basis}Logo_horizontal_gold_hell.svg" alt="Keuerleber Immobilien"><span>${esc(k.web)}</span>`;
  const kopfFoto = `<img class="logo-h" src="${basis}Logo_horizontal_gold.svg" alt="Keuerleber Immobilien"><span>${esc(k.web)}</span>`;
  const page = (inner, cls = '', top = '') => `<section class="page ${cls}">
    ${top || `<header>${kopf}</header>`}
    <main>${inner}</main>
    <footer><div><span>${esc(k.name)} · ${esc(k.telefon)} · ${esc(k.email)}</span><span>Seite ${++seite}</span></div><p>${esc(s.disclaimer_kurz)}</p></footer>
  </section>`;
  const bildreihe = ids => { ids = (ids || []).filter(id => imgs[id]);
    return ids.length ? `<div class="row2" style="grid-template-columns:repeat(${ids.length},1fr)">${ids.map(id => img(id, 'mid')).join('')}</div>` : ''; };
  const paare = ids => { const r = []; for (let i = 0; i < ids.length; i += 2) r.push(ids.slice(i, i + 2)); return r; };
  const box = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
  const row = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td>${v}</td></tr>`;
  const money = n => `<span class="${n < 0 ? 'neg' : 'pos'}">${sgn(n, eur2)}</span>`;
  const kosten = n => `<span class="neg">− ${eur2(Math.abs(n))}</span>`;   // Abzüge stehen immer mit Minus da, auch bei 0,00 €

  // Seite 1 – Titel. Für den Druck liegt das Titelbild fertig abgedunkelt als ein Bild vor (p.titelFertig) – manche Browser
  // drucken ein Hintergrundbild mit halbtransparentem Verlauf darüber sonst als schwarze Fläche.
  const titelBild = imgs[b.titel] ? `style="background-image:url('${src(b.titel)}')"` : '';
  let html = page(`
    <div class="kpis" style="grid-template-columns:repeat(${2 + (+o.wohnflaeche > 0) + (+o.zimmer > 0)},1fr)">${c.nachlass ? `<div class="kpi nachlass"><b><s>${eur0(c.listenpreis)}</s>${eur0(c.kp)}</b><span>Kaufpreis</span></div>` : box(eur0(c.kp), 'Kaufpreis')}${+o.wohnflaeche > 0 ? box(num(+o.wohnflaeche) + ' m²', 'Wohnfläche') : ''}${+o.zimmer > 0 ? box(num(+o.zimmer, o.zimmer % 1 ? 1 : 0), 'Zimmer') : ''}${box(pct(c.rendite), 'Brutto-Mietrendite')}</div>
    <p class="intro">${esc(t.intro)}</p>
    <div class="chips">${c.nachlass ? `<span class="chip-nachlass">${eur0(c.nachlass)} Nachlass</span>` : ''}${(t.chips || []).map(x => `<span>${esc(x)}</span>`).join('')}</div>`, 'cover', `
    <div class="cover-hero ${p.titelFertig ? 'gebacken' : ''}" ${p.titelFertig ? '' : titelBild}>
      ${p.titelFertig ? `<img class="cover-img" src="${p.titelFertig}" alt="">` : ''}
      <div class="cover-top">${kopfFoto}</div>
      <div class="cover-text">
        <div class="kicker">${esc(t.kicker || 'Exposé · Eigentumswohnung')}</div>
        <h1>${esc(t.titel).replace(/\\n|\n/g, '<br>')}</h1>
        <p class="sub">${esc(adr)}</p>
      </div>
    </div>`);

  // Seite 2 – Objekt
  const eck = [
    ['Objektart', o.objektart], ['Wohnfläche', +o.wohnflaeche > 0 ? num(+o.wohnflaeche) + ' m²' : ''], ['Zimmer', +o.zimmer > 0 ? num(+o.zimmer, o.zimmer % 1 ? 1 : 0) : ''], ['Etage', o.etage],
    ['Baujahr', o.baujahr], ['Preis je m²', c.qm ? eur0(c.qm) : ''], ['Kaltmiete', eur2(c.miete) + ' / Monat'],
    ['Miete je m²', o.wohnflaeche ? eur2(c.mieteQm) : ''], ['Hausgeld gesamt', o.hausgeld ? eur2(+o.hausgeld) + ' / Monat' : ''],
    ['davon nicht umlagefähig', c.hgnu ? eur2(c.hgnu) + ' / Monat' : ''], ['Vermietung', o.vermietung], ['Provision für Käufer', o.provision || 'keine'],
  ].filter(r => r[1] !== '' && r[1] != null && r[1] !== 0);
  html += page(`
    <div class="kicker">${esc(t.objekt_kicker || 'Das Objekt')}</div>
    <h2>${esc(t.objekt_headline)}</h2>
    ${(t.objekt_text || []).map(x => `<p class="txt">${esc(x)}</p>`).join('')}
    <div class="cols">
      <div><div class="kicker sm">Eckdaten</div><table>${eck.map(r => row(r[0], esc(r[1]))).join('')}</table></div>
      <div><div class="kicker sm">Ausstattung</div><ul class="list">${(t.ausstattung || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>
    ${bildreihe(b.seite2)}`);

  // Galerie-Seiten (je 6 Bilder)
  const gal = [...(b.seite1 || []), ...(b.galerie || [])].filter((id, i, arr) => imgs[id] && arr.indexOf(id) === i);
  const proSeite = gal.length ? Math.ceil(gal.length / Math.ceil(gal.length / 6)) : 6;
  for (let i = 0; i < gal.length; i += proSeite) {
    html += page(`
      ${i === 0 ? '<div class="kicker">Impressionen</div><h2>Bilder und Grundriss</h2>' : ''}
      <div class="gallery">${paare(gal.slice(i, i + proSeite)).map(r => `<div class="grow" style="grid-template-columns:repeat(${r.length},1fr)">${r.map(id => `<figure>${img(id, 'gal')}<figcaption>${esc(imgs[id].caption || '')}</figcaption></figure>`).join('')}</div>`).join('')}</div>`);
  }

  // Kalkulation
  html += page(`
    <div class="kicker">Kalkulation</div>
    <h2>Was die Wohnung monatlich bedeutet</h2>
    <p class="txt">Gerechnet mit ${pct(a.ek_quote, 0)} Eigenkapital auf den Kaufpreis (zuzüglich der Kaufnebenkosten), ${pct(a.zins)} Sollzins, ${pct(a.tilgung)} anfänglicher Tilgung, ${pct(a.nebenkosten, 1)} Kaufnebenkosten und einem persönlichen Steuersatz von ${pct(a.steuersatz, 0)}. Ihre tatsächlichen Konditionen können abweichen.</p>
    <div class="cols">
      <div><div class="kicker sm">Die Investition</div><table>
        ${c.nachlass ? row('Angebotspreis', eur0(c.listenpreis)) + row('− Nachlass', `<span class="neg">− ${eur0(c.nachlass)}</span>`) + row('= Kaufpreis', eur0(c.kp), 'strong') : row('Kaufpreis', eur0(c.kp))}${row(`+ Kaufnebenkosten (${pct(a.nebenkosten, 1)})`, eur0(c.nk))}
        ${row('= Gesamtinvestition', eur0(c.kp + c.nk), 'strong')}${row(`davon Eigenkapital (${pct(a.ek_quote, 0)} + Nebenkosten)`, eur0(c.ek))}${row('Darlehen', eur0(c.darlehen))}</table></div>
      <div><div class="kicker sm">Monatlich</div><table>
        ${row('Kaltmiete', money(c.miete))}${row('Kreditrate (Zins + Tilgung)', kosten(c.rate))}
        ${row('Hausgeld, nicht umlagefähig', kosten(c.hgnu))}${row('= vor Steuern', money(c.vorSt), 'strong')}
        ${row('Steuerwirkung', money(c.steuerMonat))}${row('= nach Steuern', money(c.nachSt), 'strong')}</table></div>
    </div>
    <div class="kicker sm">So entsteht die Steuerwirkung — pro Jahr</div>
    <table>
      ${row('Mieteinnahmen', sgn(c.miete12, eur0))}
      ${row(`− Abschreibung (${pct(c.afaSatz)} auf ${eur0(c.gebaeude)} Gebäudeanteil)`, '− ' + eur0(c.afa))}
      ${row('− Schuldzinsen', '− ' + eur0(c.zinsen))}
      ${row('− Hausgeld, nicht umlagefähig', '− ' + eur0(c.hg12))}
      ${row(c.ergebnis < 0 ? '= steuerlicher Verlust' : '= steuerlicher Überschuss', sgn(c.ergebnis, eur0), 'strong')}
      ${row(`× persönlicher Steuersatz ${pct(a.steuersatz, 0)} = ${c.steuer >= 0 ? 'Steuerersparnis' : 'Steuerlast'}`, eur0(Math.abs(c.steuer)), 'strong')}
    </table>
    <div class="band">${box(pct(c.rendite), 'Brutto-Mietrendite')}${box(num(c.faktor, 1), 'Kaufpreisfaktor')}<div class="kpi main"><b>${sgn(c.nachSt, eur2)}</b><span>monatlich nach Steuern</span></div></div>
    ${c.rnd && +o.afa_satz ? `<div class="note"><b>Restnutzungsdauer-Gutachten liegt vor</b>Für dieses Objekt liegt ein Restnutzungsdauer-Gutachten vor. In dieser Rechnung ist ein Abschreibungssatz von ${pct(c.afaSatz)} statt der üblichen ${pct(a.afa_standard, 0)} angesetzt — ${eur0(c.afa)} pro Jahr statt ${eur0(c.afaStd)}. Ob Ihr Finanzamt die verkürzte Restnutzungsdauer anerkennt, prüft Ihr Steuerberater; das Gutachten und alle Unterlagen erhalten Sie von uns.</div>`
    : c.rnd ? (o.rnd_angenommen
      ? `<div class="note"><b>Restnutzungsdauer-Gutachten in Vorbereitung</b>Die Rechnung unterstellt eine Restnutzungsdauer von ${c.rnd} Jahren, wie sie für dieses Objekt per Sachverständigengutachten ermittelt werden soll. Daraus ergäbe sich ein Abschreibungssatz von ${pct(c.afaSatz)} statt der üblichen ${pct(a.afa_standard, 0)} — in dieser Rechnung ${eur0(c.afa)} pro Jahr statt ${eur0(c.afaStd)}. Ob Ihr Finanzamt die verkürzte Restnutzungsdauer anerkennt, prüft Ihr Steuerberater.</div>`
      : `<div class="note"><b>Restnutzungsdauer-Gutachten liegt vor</b>Für dieses Objekt hat ein Sachverständiger eine Restnutzungsdauer von ${c.rnd} Jahren ermittelt. Daraus ergibt sich ein Abschreibungssatz von ${pct(c.afaSatz)} statt der üblichen ${pct(a.afa_standard, 0)} — in dieser Rechnung ${eur0(c.afa)} pro Jahr statt ${eur0(c.afaStd)}. Ob Ihr Finanzamt die verkürzte Restnutzungsdauer anerkennt, prüft Ihr Steuerberater; das Gutachten und alle Unterlagen erhalten Sie von uns.</div>`) : ''}`);

  // Energie & Lage + Kontakt
  const en = [['Art des Ausweises', e.art], ['Endenergie' + (/verbrauch/i.test(e.art || '') ? 'verbrauch' : 'bedarf'), e.kennwert],
    ['Energieeffizienzklasse', e.klasse], ['Wesentlicher Energieträger', e.traeger], ['Baujahr laut Ausweis', e.baujahr], ['Gültig bis', e.gueltig_bis]]
    .filter(r => r[1]);
  const anhang = !!imgs[b.energieausweis_bild];
  if (anhang) en.push(['Vollständiger Ausweis', 'siehe Anhang']);
  html += page(`
    <div class="kicker">Energie und Lage</div>
    <h2>Pflichtangaben und Umgebung</h2>
    <div class="cols">
      <div><div class="kicker sm">Energieausweis</div>${en.length ? `<table>${en.map(r => row(r[0], esc(r[1]))).join('')}</table>` : '<p class="txt">Energieausweis liegt zur Besichtigung vor.</p>'}</div>
      <div><div class="kicker sm">Lage</div><p class="txt">${esc(t.lage_text)}</p></div>
    </div>
    ${bildreihe((b.seite4 || []).filter(id => imgs[id]).length ? b.seite4 : [b.titel])}
    <div class="contact"><img src="${basis}paul.jpg"><div><b>${esc(k.name)}</b><span>${esc(k.titel)}</span><span>${esc(k.adresse)}</span>
      <p><em>${esc(k.telefon)}</em><em>${esc(k.email)}</em><em>${esc(k.web)}</em></p></div></div>
    <p class="legal">${esc(s.disclaimer_lang)}</p>`);

  // Anhang: Energieausweis (Original-Seite)
  if (imgs[b.energieausweis_bild]) {
    const f = imgs[b.energieausweis_bild] ? src(b.energieausweis_bild) : '';
    if (f) html += page(`<div class="kicker">Anhang</div><h2>Energieausweis</h2><img class="annex" src="${f}">`);
  }
  return html;
}
