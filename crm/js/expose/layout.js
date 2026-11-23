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
export const r0 = n => Math.round(n), r2 = n => Math.round(n * 100) / 100;
export function berechne(p, s) {
  const o = p.objekt || {}, a = Object.assign({}, s.annahmen, p.annahmen || {});
  const basis = +o.kaufpreis_partner || 0;
  const rd = +a.rundung || 100;
  const kp = p.preis_override ? r0(+p.preis_override) : Math.round(basis * (1 + (+p.aufschlag || 0) / 100) / rd) * rd;
  const nk = r0(kp * a.nebenkosten / 100);
  const ek = nk + r0(kp * a.ek_quote / 100);
  const darlehen = kp + nk - ek;
  const rate = r2(darlehen * (a.zins + a.tilgung) / 100 / 12);
  const miete = r2(+o.kaltmiete || 0), hgnu = r2(+o.hausgeld_nicht_umlagefaehig || 0);
  const vorSt = r2(miete - rate - hgnu);
  const rnd = +o.restnutzungsdauer || 0;
  // fester AfA-Satz pro Objekt (z. B. aus Pauls eigener Rechnung) hat Vorrang vor 1/RND
  const afaSatz = +o.afa_satz ? r2(+o.afa_satz) : rnd > 0 ? r2(100 / rnd) : a.afa_standard;
  const gebaeude = r0(kp * a.gebaeudeanteil / 100);
  const afa = r0(gebaeude * afaSatz / 100);
  const afaStd = r0(gebaeude * a.afa_standard / 100);
  const miete12 = r0(miete * 12), zinsen = r0(darlehen * a.zins / 100), hg12 = r0(hgnu * 12);
  const ergebnis = miete12 - afa - zinsen - hg12;
  const steuer = r0(-ergebnis * a.steuersatz / 100);          // positiv = Ersparnis, pro Jahr
  const steuerMonat = r2(steuer / 12);
  const nachSt = r2(vorSt + steuerMonat);
  return {a, basis, kp, nk, ek, darlehen, rate, miete, hgnu, vorSt, rnd, afaSatz, gebaeude, afa, afaStd,
    miete12, zinsen, hg12, ergebnis, steuer, steuerMonat, nachSt, marge: kp - basis,
    rendite: kp ? r2(miete * 12 / kp * 100) : 0, faktor: miete ? Math.round(kp / (miete * 12) * 10) / 10 : 0,
    qm: o.wohnflaeche ? r0(kp / o.wohnflaeche) : 0, mieteQm: o.wohnflaeche ? r2(miete / o.wohnflaeche) : 0};
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

  // Seite 1 – Titel
  const titelBild = imgs[b.titel] ? `style="background-image:url('${src(b.titel)}')"` : '';
  let html = page(`
    <div class="kpis">${box(eur0(c.kp), 'Kaufpreis')}${box(num(+o.wohnflaeche || 0) + ' m²', 'Wohnfläche')}${box(num(+o.zimmer || 0, o.zimmer % 1 ? 1 : 0), 'Zimmer')}${box(pct(c.rendite), 'Brutto-Mietrendite')}</div>
    <p class="intro">${esc(t.intro)}</p>
    <div class="chips">${(t.chips || []).map(x => `<span>${esc(x)}</span>`).join('')}</div>`, 'cover', `
    <div class="cover-hero" ${titelBild}>
      <div class="cover-top">${kopfFoto}</div>
      <div class="cover-text">
        <div class="kicker">${esc(t.kicker || 'Exposé · Eigentumswohnung')}</div>
        <h1>${esc(t.titel).replace(/\\n|\n/g, '<br>')}</h1>
        <p class="sub">${esc(adr)}</p>
      </div>
    </div>`);

  // Seite 2 – Objekt
  const eck = [
    ['Objektart', o.objektart], ['Wohnfläche', num(+o.wohnflaeche || 0) + ' m²'], ['Zimmer', o.zimmer], ['Etage', o.etage],
    ['Baujahr', o.baujahr], ['Preis je m²', eur0(c.qm)], ['Kaltmiete', eur2(c.miete) + ' / Monat'],
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
    <p class="txt">Gerechnet mit ${pct(a.ek_quote, 0)} Eigenkapital, ${pct(a.zins)} Sollzins, ${pct(a.tilgung)} anfänglicher Tilgung, ${pct(a.nebenkosten, 1)} Kaufnebenkosten und einem persönlichen Steuersatz von ${pct(a.steuersatz, 0)}. Ihre tatsächlichen Konditionen können abweichen.</p>
    <div class="cols">
      <div><div class="kicker sm">Die Investition</div><table>
        ${row('Kaufpreis', eur0(c.kp))}${row(`+ Kaufnebenkosten (${pct(a.nebenkosten, 1)})`, eur0(c.nk))}
        ${row('= Gesamtinvestition', eur0(c.kp + c.nk), 'strong')}${row('davon Eigenkapital', eur0(c.ek))}${row('Darlehen', eur0(c.darlehen))}</table></div>
      <div><div class="kicker sm">Monatlich</div><table>
        ${row('Kaltmiete', money(c.miete))}${row('Kreditrate (Zins + Tilgung)', money(-c.rate))}
        ${row('Hausgeld, nicht umlagefähig', money(-c.hgnu))}${row('= vor Steuern', money(c.vorSt), 'strong')}
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
