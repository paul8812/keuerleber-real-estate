import * as db from '../db.js';
import { kapitalanlage } from '../anlage.js';
import { html, raw, eur, eur2, num, pct } from '../util.js';
import { BUNDESLAENDER } from '../consts.js';

const n = (el, id) => parseFloat(el.querySelector('#' + id).value.replace(',', '.')) || 0;
const f = (id, label, val, step = 'any') => html`<label class="f"><span>${label}</span><input id="${id}" type="number" step="${step}" value="${val}"></label>`;
const out = (l, v, strong) => html`<div class="kv ${strong ? 'strong' : ''}"><span>${l}</span><b>${v}</b></div>`;

export function render(el) {
  const s = db.settings();
  el.innerHTML = html`<div class="head"><h1>Rechner</h1></div><div class="cols calc">
    <section class="card" id="c1"><h2>Kaufnebenkosten</h2><div class="grid">
      ${f('k_preis', 'Kaufpreis (€)', 350000)}<label class="f"><span>Bundesland</span><select id="k_bl">${Object.keys(BUNDESLAENDER).map(b => html`<option ${b === s.bundesland ? raw('selected') : ''}>${b}</option>`)}</select></label>
      ${f('k_notar', 'Notar (%)', 1.5, 0.1)}${f('k_gb', 'Grundbuch (%)', 0.5, 0.1)}${f('k_mak', 'Käuferprovision (%) – bei uns 0', 0, 0.01)}</div><div id="o1"></div></section>
    <section class="card" id="c6"><h2>Anleger-Rechner (Beratungsgespräch)</h2><div class="grid">
      ${f('a_preis', 'Kaufpreis (€)', 200000)}${f('a_nk', 'Kaufnebenkosten (%)', 6, 0.1)}${f('a_geb', 'Gebäudeanteil (%)', 80, 1)}${f('a_afa', 'AfA (% p. a.)', 2, 0.5)}
      ${f('a_ek', 'Eigenkapital (€)', 0)}${f('a_zins', 'Sollzins (%)', 3.6, 0.01)}${f('a_tilg', 'Tilgung (%)', 2, 0.1)}${f('a_miete', 'Kaltmiete / Monat (€)', 700)}
      ${f('a_hg', 'Nicht umlagef. Hausgeld / Monat (€)', 60)}${f('a_zve', 'Zu versteuerndes Einkommen (€/Jahr)', 65000, 1000)}<label class="f chk"><input type="checkbox" id="a_split"><span>Verheiratet (Splitting)</span></label><label class="f chk"><input type="checkbox" id="a_kist"><span>Kirchensteuer</span></label></div><div id="o6"></div><p class="muted small">Steuer exakt nach § 32a EStG inkl. Soli (Rechenkern wie Jarvis). Modellrechnung, ohne Gewähr – ersetzt keine Steuerberatung. Für ein PDF mit 10-Jahres-Tabelle: Objekt öffnen → „📄 Exposé & Modellrechnung“.</p></section>
    <section class="card" id="c2"><h2>Deine Vergütung</h2><div class="grid">
      ${f('p_anz', 'Verkaufte Einheiten', 1, 1)}${f('p_verg', 'Vergütung je Einheit (€ netto)', s.verguetung || 8000, 100)}${f('p_split', 'Anteil Partner / Tippgeber (%)', 0, 1)}</div><div id="o2"></div></section>
    <section class="card" id="c3"><h2>Rendite</h2><div class="grid">
      ${f('r_preis', 'Kaufpreis (€)', 350000)}${f('r_nk', 'Kaufnebenkosten (%)', 10, 0.1)}${f('r_miete', 'Kaltmiete / Monat (€)', 1200)}${f('r_bw', 'Nicht umlagefähige Kosten (% der Miete)', 20, 1)}${f('r_leer', 'Leerstand (%)', 3, 0.5)}${f('r_san', 'Sanierung / Einmalkosten (€)', 0)}</div><div id="o3"></div></section>
    <section class="card" id="c4"><h2>Finanzierung</h2><div class="grid">
      ${f('f_darl', 'Darlehen (€)', 300000)}${f('f_zins', 'Sollzins p. a. (%)', 3.6, 0.01)}${f('f_tilg', 'Anfängliche Tilgung (%)', 2, 0.1)}${f('f_bind', 'Zinsbindung (Jahre)', 10, 1)}${f('f_eigen', 'Eigenkapital (€)', 70000)}${f('f_preis', 'Kaufpreis (€) für Beleihung', 350000)}</div><div id="o4"></div></section>
    <section class="card" id="c5"><h2>Vergleichswert (Schnellschätzung)</h2><div class="grid">
      ${f('v_m2', 'Wohnfläche (m²)', 100)}${f('v_pm2', 'Ø Preis pro m² Region (€)', 3200)}${f('v_zu', 'Zu-/Abschlag Zustand & Lage (%)', 0, 1)}</div><div id="o5"></div><p class="muted">Orientierungswert – ersetzt kein Gutachten.</p></section></div>`.s;
  const calc = () => {
    const P = n(el, 'k_preis'), gr = BUNDESLAENDER[el.querySelector('#k_bl').value], parts = [['Grunderwerbsteuer', gr], ['Notar', n(el, 'k_notar')], ['Grundbuch', n(el, 'k_gb')], ...(n(el, 'k_mak') ? [['Käuferprovision', n(el, 'k_mak')]] : [])];
    const nk = parts.reduce((a, [, p]) => a + P * p / 100, 0);
    el.querySelector('#o1').innerHTML = html`${parts.map(([l, p]) => out(`${l} (${num(p, 2)} %)`, eur(P * p / 100)))}${out('Nebenkosten gesamt', eur(nk) + ` (${pct(nk / P * 100)})`, 1)}${out('Gesamtinvestition', eur(P + nk), 1)}`.s;
    const ust = s.kleinunternehmer ? 0 : 19, ne = n(el, 'p_anz') * n(el, 'p_verg'), sp = ne * n(el, 'p_split') / 100;
    el.querySelector('#o2').innerHTML = html`${out('Vergütung netto', eur2(ne), 1)}${ust ? out('zzgl. 19 % USt (an das Finanzamt)', eur2(ne * .19)) : ''}${out('Rechnungsbetrag an Verkäufer', eur2(ne * (1 + ust / 100)))}${sp ? out('Abzgl. Anteil Partner (netto)', eur2(sp)) : ''}${out('Verbleibt bei dir (netto, vor Einkommensteuer)', eur2(ne - sp), 1)}<p class="muted small">Der Käufer zahlt keine Provision.</p>`.s;
    const ap = n(el, 'a_preis'), nkP = n(el, 'a_nk'), grest = BUNDESLAENDER[s.bundesland] ?? 3.5;
    const R = ap && n(el, 'a_miete') ? kapitalanlage({ kaufpreis: ap, miete: n(el, 'a_miete'), hausgeld: n(el, 'a_hg'), afa: n(el, 'a_afa'), gebaeudeanteil: n(el, 'a_geb'), eigenkapital: n(el, 'a_ek'), zins: n(el, 'a_zins'), tilgung: n(el, 'a_tilg'),
      zve: n(el, 'a_zve'), splitting: el.querySelector('#a_split').checked, kirche: el.querySelector('#a_kist').checked, bundesland: s.bundesland || 'Bayern', notar: Math.max(0, nkP - grest), mietausfall: 0, jahre: 10 }) : null;
    if (R) { const z = R.jahre[0], K = R.kennzahlen;
      el.querySelector('#o6').innerHTML = html`${out('Gesamtinvestition', eur(R.nebenkosten.gesamtkosten))}${out('Darlehen', eur(R.darlehen))}${out('Monatsrate (Zins + Tilgung)', eur2(R.rateMonat))}${out('Cashflow vor Steuern / Monat', eur2(K.cfMonatVor))}${out('Abschreibung (AfA) p. a.', eur(R.afaJahr))}${out('Steuerliches Ergebnis p. a.', eur(z.ergebnis))}${out(z.steuerwirkung >= 0 ? 'Steuerersparnis / Monat' : 'Steuerlast / Monat', eur2(Math.abs(z.steuerwirkung / 12)))}${out(K.cfMonatNach < 0 ? 'Monatlicher Eigenaufwand nach Steuern' : 'Monatlicher Überschuss nach Steuern', eur2(Math.abs(K.cfMonatNach)), 1)}${out('Davon Vermögensaufbau (Tilgung) / Monat', eur2(z.tilgung / 12))}${out('Nettovermögen nach 10 Jahren', eur(K.nettovermoegenEnde))}`.s; }
    else el.querySelector('#o6').innerHTML = '<p class="muted">Kaufpreis und Miete eingeben.</p>';
    const rp = n(el, 'r_preis'), inv = rp * (1 + n(el, 'r_nk') / 100) + n(el, 'r_san'), jm = n(el, 'r_miete') * 12, netto = jm * (1 - n(el, 'r_leer') / 100) * (1 - n(el, 'r_bw') / 100);
    el.querySelector('#o3').innerHTML = html`${out('Jahresmiete (kalt)', eur(jm))}${out('Kaufpreisfaktor', rp && jm ? num(rp / jm, 1) + '×' : '–')}${out('Bruttomietrendite', pct(jm / rp * 100, 2), 1)}${out('Nettomietrendite (auf Gesamtinvestition)', pct(netto / inv * 100, 2), 1)}${out('Reinertrag p. a.', eur(netto))}`.s;
    const D = n(el, 'f_darl'), z = n(el, 'f_zins'), t = n(el, 'f_tilg'), by = n(el, 'f_bind'), rate = D * (z + t) / 100 / 12;
    let rest = D; for (let m = 0; m < by * 12; m++) { rest = rest * (1 + z / 1200) - rate; if (rest < 0) { rest = 0; break; } }
    let months = 0, r2 = D; while (r2 > 0 && months < 1200 && rate > 0) { r2 = r2 * (1 + z / 1200) - rate; months++; }
    const fp = n(el, 'f_preis'); el.querySelector('#o4').innerHTML = html`${out('Monatsrate', eur2(rate), 1)}${out(`Restschuld nach ${by} Jahren`, eur(Math.max(rest, 0)))}${out('Volltilgung nach ca.', months < 1200 ? num(months / 12, 1) + ' Jahren' : '> 100 Jahre')}${out('Beleihungsauslauf', fp ? pct(D / fp * 100) : '–')}${out('Eigenkapitalquote', fp ? pct(n(el, 'f_eigen') / fp * 100) : '–')}`.s;
    const v = n(el, 'v_m2') * n(el, 'v_pm2') * (1 + n(el, 'v_zu') / 100); el.querySelector('#o5').innerHTML = html`${out('Geschätzter Wert', eur(v), 1)}${out('Spanne (±8 %)', `${eur(v * .92)} – ${eur(v * 1.08)}`)}`.s;
  };
  el.querySelectorAll('input,select').forEach(i => i.oninput = calc); calc();
}
