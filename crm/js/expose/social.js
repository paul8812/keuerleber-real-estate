// Social-Formate: Instagram-Story (4 × 1080×1920) und Meta-Werbeanzeige (1080×1350) – aus dem bisherigen Exposé-Tool übernommen.
// Nutzt dieselbe Rechnung wie das Exposé → identische Zahlen. Bilder kommen als fertige Adressen (i.src), Logo/Foto aus crm/expose/.
import { berechne, eur0, eur2, pct, sgn, num, esc, r0 } from './layout.js';
let BASIS = '';

function socialDaten(p, s) {
  const o = p.objekt || {}, t = p.texte || {}, b = p.bilder || {}, k = s.kontakt;
  const c = berechne(p, s);
  const imgs = Object.fromEntries((p.images || []).map(i => [i.id, i]));
  const fotos = [b.titel, ...(b.seite1 || []), ...(b.seite2 || []), ...(b.galerie || []), ...(b.seite4 || [])]
    .filter((id, i, a) => imgs[id] && !imgs[id].plan && !imgs[id].karte && a.indexOf(id) === i);
  const src = id => imgs[id] ? imgs[id].src || '' : '';
  // „2-Zimmer-Wohnung“ nie am Bindestrich umbrechen (geschützte Bindestriche)
  const schuetze = x => String(x).replace(/(\d)-Zimmer-/g, '$1\u2011Zimmer\u2011').replace(/(\d)-Zi\b/g, '$1\u2011Zi');
  const titel = schuetze(String(t.titel || '').split(/\\n|\n/)[0]);
  const zusatz = String(t.titel || '').split(/\\n|\n/)[1] || '';
  const zi = +o.zimmer ? num(+o.zimmer, o.zimmer % 1 ? 1 : 0) + ' Zimmer' : '';
  const eckzeile = [zi, +o.wohnflaeche ? num(+o.wohnflaeche) + ' m²' : '', o.etage, o.ort].filter(Boolean).join(' · ');
  const plus = c.nachSt >= 0;
  return {o, t, c, k, fotos, src, titel, zusatz, eckzeile, plus,
    cfLabel: plus ? 'Cashflow nach Steuern' : 'Ihr Eigenanteil nach Steuern',
    cfWert: plus ? sgn(c.nachSt, eur2) : eur2(Math.abs(c.nachSt)),
    fussnote: `Rechenbeispiel mit ${pct(c.a.ek_quote, 0)} Eigenkapital, ${pct(c.a.zins)} Zins, ${pct(c.a.tilgung)} Tilgung und ${pct(c.a.steuersatz, 0)} Steuersatz${c.rnd ? `, AfA ${pct(c.afaSatz)} lt. ${o.rnd_angenommen ? 'geplantem ' : ''}RND-Gutachten` : ''}. Keine Zusicherung, keine Steuerberatung.`,
    insta: k.instagram || '@keuerleber_immobilien'};
}

const logoZeile = (hell = true) => `<div class="s-logo ${hell ? '' : 'dunkel'}"><img src="${BASIS}Logo_horizontal_gold.svg" alt="Keuerleber Immobilien"></div>`;
const bg = url => url ? `style="background-image:url('${url}')"` : '';

// Zahl ohne überflüssige Nachkommastellen: 70,6 · 64,26 · 11
const kurz = (n, max = 2) => n.toLocaleString('de-DE', {minimumFractionDigits: 0, maximumFractionDigits: max});
const eurKurz = n => (Math.abs(n % 1) < 0.005 ? kurz(n, 0) : num(n, 2)) + ' €';
const sgnKurz = n => (n < 0 ? '−' : '+') + num(Math.abs(n), 2) + ' €';

export function renderStory(p, s, basis) {
  BASIS = basis; const d = socialDaten(p, s), {c, t, o, k} = d;
  const imgs = Object.fromEntries((p.images || []).map(i => [i.id, i]));
  const f = d.fotos, a = c.a;
  const status = o.vermietung_status || (/unvermietet|frei/i.test(o.vermietung || '') ? 'unvermietet' : 'vermietet');
  const verm = status !== 'unvermietet';
  const badge = {frisch: 'Frisch vermietet', vermietet: 'Vermietet', unvermietet: 'Sofort frei'}[status];
  const ort = o.ort ? `${o.ort} / Oberfranken` : 'Oberfranken';
  const fl = +o.wohnflaeche ? kurz(+o.wohnflaeche) + ' m²' : '';
  const zi = +o.zimmer ? kurz(+o.zimmer, 1) : '';
  const etg = String(o.etage || '').replace(/\s*Obergeschoss/, '. OG').replace('..', '.').replace(/Erdgeschoss/i, 'EG');
  const beispiel = id => imgs[id] && /beispiel/i.test(imgs[id].caption || '');
  const saniert = /kernsan|topsan|sanier/i.test(t.titel || '') ? 'Saniert' : /renov/i.test(t.titel || '') ? 'Renoviert' : 'Modernisiert';
  const titelZeile = String(t.titel || '').replace(/\\n|\n/g, ' ');
  const storyTitel = p.story_titel || (c.kp && c.kp < 200000 ? 'Top Einsteiger-Kapitalanlage' : 'Top Kapitalanlage');
  const unter = titelZeile + {frisch: ' – frisch vermietet an solvente, zuverlässige Mieter',
    vermietet: ' – vermietet, die Mieteinnahmen laufen ab Übergabe', unvermietet: ' – bezugsfrei und sofort verfügbar'}[status];
  // „über“-Aussagen immer abrunden → stimmen garantiert
  // echte Untergrenze: 5,00 % → „über 4 %“, 5,18 % → „über 5 %“; 120,00 € → „über 110 €“
  const renditeSchwelle = Math.ceil(c.rendite * 2) / 2 - 0.5;     // halbe Prozent: 4,79 → „über 4,5 %“
  const cfSchwelle = Math.ceil(c.nachSt / 10) * 10 - 10;
  const tilgungMonat = r0(c.darlehen * a.tilgung / 100 / 12);
  const steuerTxt = c.steuerMonat >= 0 ? 'Steuerersparnis' : 'Steuerlast';
  const fussnote = `*Exemplarische Rechnung auf Basis des aktuellen Angebotspreises, unverbindlich, keine Steuer- oder Anlageberatung. `
    + `Annahmen: ${kurz(a.ek_quote)} % Eigenkapital zzgl. ${kurz(a.nebenkosten, 1)} % Nebenkosten, ${kurz(a.zins)} % Sollzins, ${kurz(a.tilgung)} % Tilgung, ${kurz(a.steuersatz)} % Steuersatz.`
    + (verm ? ` Wohnung ${status === 'frisch' ? 'frisch ' : ''}vermietet zu ${eurKurz(c.mieteQm)}/m² kalt.` : ` Kaltmiete ${eurKurz(c.mieteQm)}/m² (erzielbar).`)
    + (c.rnd ? ` AfA ${kurz(c.afaSatz)} % setzt ein Restnutzungsdauer-Gutachten voraus${o.rnd_angenommen ? ' (in Vorbereitung)' : ''}; ob das Finanzamt es anerkennt, ist nicht garantiert.` : '');
  const plan = (p.images || []).find(i => i.plan && !/2d/i.test(i.caption || '') && i.w / Math.max(i.h, 1) < 1.6) || (p.images || []).find(i => i.plan);
  // kurze Story-Stichpunkte wie in der Vorlage
  const kurzfassung = x => x.replace(/^Bad mit (nahezu )?ebenerdiger Dusche$/i, 'Modernes Duschbad').replace(/^Bad mit Dusche$/i, 'Modernes Duschbad')
    .replace(/^Klick-Vinylboden in Landhausdielen-Optik$/i, 'Klick-Vinylboden, Eichenoptik').replace(/ mit weitem Blick$/i, '')
    .replace(/^Einbauschrank \(Garderobe\)$/i, 'Einbauschrank');
  const ausst = [...(t.ausstattung || []).filter(x => !/gutachten|bezugsfertig|zuschnitt/i.test(x)).map(kurzfassung).slice(0, 4),
    ...(verm ? ['Solvente Mieter'] : []), 'Provisionsfrei für Käufer'].slice(0, 6);
  const raeume = [fl, zi ? zi + ' Zimmer' : '', /küche/i.test((t.ausstattung || []).join()) ? 'Küche' : '',
    /dusch/i.test((t.ausstattung || []).join()) ? 'Duschbad' : /bad/i.test((t.ausstattung || []).join()) ? 'Bad' : '',
    /loggia/i.test((t.ausstattung || []).join()) ? 'Loggia' : /balkon/i.test((t.ausstattung || []).join()) ? 'Balkon' : ''].filter(Boolean);
  const row = (l, v, key, cls = '') => `<div class="t-row ${cls}"><span>${l}</span><b class="${v < 0 ? 'neg' : 'pos'}" data-wert="${key}">${sgnKurz(v)}</b></div>`;
  const pill = `<div class="v-pill"><img src="${BASIS}Logo_horizontal_gold.svg" alt="Keuerleber Immobilien"></div>`;

  // 1 – Aufmacher (dunkel)
  let html = `<section class="story v1 dunkel">
    <div class="v-foto" ${bg(d.src(f[0]))}>${pill}${beispiel(f[0]) ? '<span class="v-bsp">Beispielbild</span>' : ''}</div>
    <div class="v-badge">${badge}</div>
    <div class="v-text">
      <div class="v-kicker">Kapitalanlage · ${esc(ort)}</div>
      <h1>${esc(storyTitel)}</h1>
      <p class="v-unter">${esc(unter)}</p>
      <div class="v-chips">
        ${fl ? `<span>${fl}</span>` : ''}${verm ? '<span>Solvente Mieter</span>' : ''}
        ${renditeSchwelle >= 1 ? `<span>Über <i data-wert="ueber_rendite" data-n="${renditeSchwelle}">${kurz(renditeSchwelle, 1)}</i> % Rendite</span>` : ''}
        <span>Provisionsfrei</span>
        ${cfSchwelle >= 10 ? `<span class="gold">Über <i data-wert="ueber_cf" data-n="${cfSchwelle}">${cfSchwelle}</i> € Cashflow mtl.*</span>` : ''}
      </div>
      ${cfSchwelle >= 10 ? '<p class="v-fuss">*Nach Steuern, exemplarische Rechnung – Details auf Slide 3</p>' : ''}
    </div>
  </section>`;

  // 2 – Die Wohnung (hell)
  const col = (f.length > 1 ? f.slice(1) : f).slice(0, 3);
  html += `<section class="story v2 hell">
    <div class="v-kicker">Die Wohnung · ${esc(ort)}</div>
    <h2>${saniert} &amp; ${{frisch: 'frisch vermietet', vermietet: 'vermietet', unvermietet: 'sofort frei'}[status]}</h2>
    <div class="v-collage n${col.length}">${col.map((id, i) => `<div class="${i ? 'klein' : 'gross'}" ${bg(d.src(id))}></div>`).join('')}</div>
    ${col.some(beispiel) || f.some(beispiel) ? '<p class="v-cap">Teilweise Beispielbilder einer baugleichen Wohnung im selben Haus.</p>' : ''}
    <div class="v-kpis">
      ${fl ? `<div><b>${fl}</b><span>Wohnfläche</span></div>` : ''}${zi ? `<div><b>${zi}</b><span>Zimmer</span></div>` : ''}
      ${etg ? `<div><b>${esc(etg)}</b><span>Etage</span></div>` : ''}
      <div><b data-wert="mieteqm">${eurKurz(c.mieteQm)}</b><span>Miete je m²</span></div>
    </div>
    <ul class="v-liste">${ausst.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  </section>`;

  // 3 – Exemplarische Rechnung (dunkel)
  html += `<section class="story v3 dunkel">
    <div class="v-kicker">Exemplarische Rechnung</div>
    <h2>Was die Wohnung monatlich ${c.nachSt >= 0 ? 'bringt' : 'kostet'}</h2>
    <div class="v-hero"><b data-wert="${c.nachSt >= 0 ? 'nachSt_gross' : 'eigenanteil'}">${c.nachSt >= 0 ? eur2(c.nachSt) : eur2(Math.abs(c.nachSt))}</b>
      <span>${c.nachSt >= 0 ? 'Cashflow pro Monat nach Steuern*' : 'Ihr monatlicher Eigenanteil nach Steuern*'}</span></div>
    <div class="v-tabelle">
      ${row(`Kaltmiete (${verm ? (status === 'frisch' ? 'frisch vermietet, ' : 'vermietet, ') : ''}${eurKurz(c.mieteQm)}/m²)`, c.miete, 'miete')}
      ${row(`Kreditrate (${kurz(a.zins)} % Zins, ${kurz(a.tilgung)} % Tilgung)`, -c.rate, 'rate')}
      ${row('Hausgeld, nicht umlagefähig', -c.hgnu, 'hgnu')}
      ${row('= vor Steuern', c.vorSt, 'vorSt', 'sum')}
      ${row(`${steuerTxt} (${kurz(a.steuersatz)} % Steuersatz)`, c.steuerMonat, 'steuer')}
      ${row('= nach Steuern', c.nachSt, 'nachSt', 'sum')}
    </div>
    <div class="v-tiles">
      <div><b data-wert="rendite">${pct(c.rendite)}</b><span>Brutto-Mietrendite</span></div>
      <div><b data-wert="mieteqm">${eurKurz(c.mieteQm)}/m²</b><span>Kaltmiete${verm ? (status === 'frisch' ? ', frisch vermietet' : ', vermietet') : ''}</span></div>
      <div><b data-wert="tilgung">${eur0(tilgungMonat)}</b><span>Tilgung pro Monat</span></div>
    </div>
    <p class="v-fuss lang">${esc(fussnote)}</p>
  </section>`;

  // 4 – Grundriss & Kontakt (hell)
  html += `<section class="story v4 hell">
    <div class="v-kicker">${plan ? 'Grundriss &amp; Kontakt' : 'Kontakt'}</div>
    <h2>Exposé per DM anfordern</h2>
    <p class="v-sub">Schreib „EXPOSÉ“ und du bekommst alle Unterlagen.</p>
    <div class="v-plan"><div class="bild ${plan ? 'contain' : ''}" ${bg(d.src(plan ? plan.id : f[0]))}></div>
      <p>${esc(raeume.join(' · '))}</p></div>
    <div class="v-kontakt"><img src="${BASIS}paul.jpg"><div>
      <b>${esc(k.name)}</b><span>${esc(k.titel)}</span><em>${esc(k.telefon)}</em><small>${esc(k.web)}</small></div></div>
    <p class="v-schluss">Für Käufer provisionsfrei · Kaufpreis im Exposé</p>
  </section>`;
  return html;
}

export function renderAd(p, s, basis) {
  BASIS = basis; const d = socialDaten(p, s), {c, t, o} = d;
  return `<section class="ad">
    <div class="a-bild" ${bg(d.src(d.fotos[0]))}><div class="s-verlauf"></div>
      <div class="a-oben">${logoZeile()}<span class="a-tag">Für Käufer provisionsfrei</span></div>
      <div class="a-titel"><div class="s-kicker">Kapitalanlage · ${esc(o.ort || 'Oberfranken')}</div>
        <h1>${esc(d.titel)}</h1><p>${esc(d.eckzeile)}</p></div>
    </div>
    <div class="a-panel">
      <div class="a-kpis">
        <div><span>Kaufpreis</span><b data-wert="kp">${eur0(c.kp)}</b></div>
        <div><span>Brutto-Mietrendite</span><b data-wert="rendite">${pct(c.rendite)}</b></div>
        <div class="hl"><span>${d.cfLabel}*</span><b data-wert="${d.plus ? 'nachSt' : 'eigenanteil'}">${d.cfWert}</b></div>
      </div>
      <div class="a-cta"><span>Jetzt Exposé &amp; Kalkulation anfordern</span><b>→</b></div>
      <p class="a-fuss">* ${esc(d.fussnote)} · ${esc(d.k.web)}</p>
    </div>
  </section>`;
}
