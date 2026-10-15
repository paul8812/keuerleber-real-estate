// Kapitalanlage-Rechner (exakte Portierung aus Jarvis calc.py): ESt nach § 32a EStG inkl. Soli/KiSt,
// Kaufnebenkosten, Annuitätendarlehen, mehrjährige Rechnung vor/nach Steuern, IRR. Modellrechnung – keine Steuerberatung.
import { BUNDESLAENDER } from './consts.js';

const r2 = x => Math.round(x * 100) / 100;

export function estGrundtarif(zve, jahr = 2026) {
  const x = Math.floor(Math.max(zve, 0));
  if (jahr >= 2026) {
    if (x <= 12348) return 0;
    if (x <= 17799) { const y = (x - 12348) / 10000; return Math.floor((914.51 * y + 1400) * y); }
    if (x <= 69878) { const z = (x - 17799) / 10000; return Math.floor((173.10 * z + 2397) * z + 1034.87); }
    if (x <= 277825) return Math.floor(0.42 * x - 11135.63);
    return Math.floor(0.45 * x - 19470.38);
  }
  if (x <= 12096) return 0;
  if (x <= 17443) { const y = (x - 12096) / 10000; return Math.floor((932.30 * y + 1400) * y); }
  if (x <= 68480) { const z = (x - 17443) / 10000; return Math.floor((176.64 * z + 2397) * z + 1015.13); }
  if (x <= 277825) return Math.floor(0.42 * x - 10911.92);
  return Math.floor(0.45 * x - 19246.67);
}

export function steuerlast(zve, splitting = false, kirche = false, kistSatz = 8, jahr = 2026) {
  const est = splitting ? 2 * estGrundtarif(zve / 2, jahr) : estGrundtarif(zve, jahr);
  const frei = (jahr >= 2026 ? 20350 : 19950) * (splitting ? 2 : 1);
  const soli = est <= frei ? 0 : Math.min(0.055 * est, 0.119 * (est - frei));
  const kist = kirche ? est * kistSatz / 100 : 0;
  return { est, soli: r2(soli), kist: r2(kist), gesamt: r2(est + soli + kist) };
}

export const grestSatz = bl => BUNDESLAENDER[bl] ?? 3.5;

export function kaufnebenkosten(kaufpreis, bundesland = 'Bayern', notarProzent = 2, maklerProzent = 0) {
  const g = grestSatz(bundesland), grest = kaufpreis * g / 100, notar = kaufpreis * notarProzent / 100, makler = kaufpreis * maklerProzent / 100, summe = grest + notar + makler;
  return { kaufpreis, bundesland, grestSatz: g, grunderwerbsteuer: r2(grest), notarGrundbuch: r2(notar), makler: r2(makler), summe: r2(summe), summeProzent: kaufpreis ? r2(summe / kaufpreis * 100) : 0, gesamtkosten: r2(kaufpreis + summe) };
}

function irr(flows) {
  const npv = r => flows.reduce((s, f, i) => s + f / (1 + r) ** i, 0);
  let lo = -0.99, hi = 5;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

export function kapitalanlage(o) {
  const a = {
    kaufpreis: 0, miete: 0, zve: 60000, wohnflaeche: null, hausgeld: 0, ruecklageAnteil: 50, gebaeudeanteil: 80, afa: 2, eigenkapital: null,
    zins: 3.9, tilgung: 2, splitting: false, kirche: false, bundesland: 'Bayern', notar: 2, makler: 0,
    mietsteigerung: 1.5, kostensteigerung: 2, wertsteigerung: 1.5, mietausfall: 2, jahre: 10, jahrStart: new Date().getFullYear(), ...o,
  };
  for (const k of Object.keys(a)) if (typeof a[k] === 'string' && k !== 'bundesland' && a[k] !== '') a[k] = Number(String(a[k]).replace(',', '.'));
  if (a.eigenkapital === '') a.eigenkapital = null;
  const nk = kaufnebenkosten(a.kaufpreis, a.bundesland, a.notar, a.makler), gesamt = nk.gesamtkosten;
  const ek = a.eigenkapital == null ? nk.summe : a.eigenkapital, darlehen = Math.max(gesamt - ek, 0);
  const afaBasis = gesamt * a.gebaeudeanteil / 100, rateM = darlehen * (a.zins + a.tilgung) / 100 / 12;
  let afaRest = afaBasis, rest = darlehen, summeCf = 0;
  const zeilen = [], flows = [-ek];
  for (let j = 1; j <= a.jahre; j++) {
    const fM = (1 + a.mietsteigerung / 100) ** (j - 1), fK = (1 + a.kostensteigerung / 100) ** (j - 1);
    const miete = a.miete * 12 * fM * (1 - a.mietausfall / 100), hg = a.hausgeld * 12 * fK, ruecklage = hg * a.ruecklageAnteil / 100;
    let zinsen = 0, tilg = 0;
    for (let m = 0; m < 12 && rest > 0; m++) { const z = rest * a.zins / 100 / 12, t = Math.min(rateM - z, rest); rest -= t; zinsen += z; tilg += t; }
    const afa = Math.min(afaBasis * a.afa / 100, afaRest); afaRest -= afa;
    const ergebnis = miete - (hg - ruecklage) - zinsen - afa, jahr = a.jahrStart + j - 1;
    const steuerwirkung = steuerlast(a.zve, a.splitting, a.kirche, 8, jahr).gesamt - steuerlast(a.zve + ergebnis, a.splitting, a.kirche, 8, jahr).gesamt;
    const cfVor = miete - hg - zinsen - tilg, cfNach = cfVor + steuerwirkung; summeCf += cfNach;
    const wert = a.kaufpreis * (1 + a.wertsteigerung / 100) ** j;
    zeilen.push({ jahr: j, miete: r2(miete), hausgeld: r2(hg), zinsen: r2(zinsen), tilgung: r2(tilg), afa: r2(afa), ergebnis: r2(ergebnis), steuerwirkung: r2(steuerwirkung),
      cfVor: r2(cfVor), cfNach: r2(cfNach), cfNachMonat: r2(cfNach / 12), restschuld: r2(rest), wert: r2(wert), nettovermoegen: r2(wert - rest) });
    flows.push(cfNach);
  }
  const end = zeilen[zeilen.length - 1];
  flows[flows.length - 1] += end.nettovermoegen;  // fiktiver Verkauf nach Ablauf (steuerfrei nach 10 Jahren)
  const i = irr(flows), mieteJ1 = a.miete * 12;
  const g0 = zeilen[0].ergebnis < 0 ? Math.round(zeilen[0].steuerwirkung / -zeilen[0].ergebnis * 1000) / 10 : r2(steuerlast(a.zve + 100, a.splitting, a.kirche).gesamt - steuerlast(a.zve, a.splitting, a.kirche).gesamt);
  return {
    annahmen: { ...a, preisQm: a.wohnflaeche ? r2(a.kaufpreis / a.wohnflaeche) : null, mieteQm: a.wohnflaeche ? r2(a.miete / a.wohnflaeche) : null },
    nebenkosten: nk, eigenkapital: r2(ek), darlehen: r2(darlehen), rateMonat: r2(rateM), afaBasis: r2(afaBasis), afaJahr: r2(afaBasis * a.afa / 100),
    kennzahlen: {
      bruttomietrendite: a.kaufpreis ? r2(mieteJ1 / a.kaufpreis * 100) : 0, kaufpreisfaktor: mieteJ1 ? Math.round(a.kaufpreis / mieteJ1 * 10) / 10 : 0,
      nettomietrendite: gesamt ? r2((mieteJ1 - a.hausgeld * 12) / gesamt * 100) : 0, grenzsteuersatz: g0,
      cfMonatVor: r2(zeilen[0].cfVor / 12), cfMonatNach: zeilen[0].cfNachMonat, summeCfNach: r2(summeCf),
      nettovermoegenEnde: end.nettovermoegen, vermoegenszuwachs: r2(end.nettovermoegen - ek + summeCf), irr: i == null ? null : r2(i * 100),
    },
    jahre: zeilen,
  };
}
