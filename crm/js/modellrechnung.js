// Exposé-Generator: Exposé im Keuerleber-Design + individuelle Modellrechnung (Rechenkern aus Jarvis) → Drucken / PDF
import * as db from './db.js';
import { html, raw, inp, sel, chk, modal, toast, esc, eur, eur2, num, fmtDate, today, fullName } from './util.js';
import { contactOpts, adresse } from './ui.js';
import { kapitalanlage } from './anlage.js';

const pz = (x, d = 2) => x == null || isNaN(x) ? '–' : Number(x).toFixed(d).replace('.', ',') + ' %';
const e0 = x => eur(x), e2 = x => eur2(x);
const zahl = v => v === '' || v == null ? null : Number(String(v).replace(',', '.'));

export function vorgaben(p, c) {
  const s = db.settings(), an = c?.anlage || {};
  return {
    kaufpreis: Number(p.preis) || 0, miete: Number(p.kalkMiete) || (Number(p.mieteJahr) ? Math.round(Number(p.mieteJahr) / 12 * 100) / 100 : 0),
    hausgeld: Number(p.kalkHg) || 0, afa: p.kalkAfa === '' || p.kalkAfa == null ? 2 : Number(p.kalkAfa), gebaeudeanteil: p.kalkGeb === '' || p.kalkGeb == null ? 80 : Number(p.kalkGeb),
    wohnflaeche: Number(p.flaeche) || null, bundesland: s.bundesland || 'Bayern',
    zve: an.zve ?? 60000, splitting: !!an.splitting, kirche: !!an.kirche, eigenkapital: an.eigenkapital ?? '', zins: an.zins ?? 3.6, tilgung: an.tilgung ?? 2, jahre: 10,
  };
}

export function exposeForm(p, { contactId = '' } = {}) {
  const c0 = db.get('contacts', contactId), v = vorgaben(p, c0);
  modal(`📄 Exposé & Modellrechnung – ${p.titel}`, html`
    <p class="full muted small">Erstellt ein Exposé im Keuerleber-Design mit Fotos und – optional – einer individuellen Modellrechnung für deinen Kunden (Steuer nach § 32a EStG inkl. Soli, 10-Jahres-Entwicklung). Danach „Drucken / als PDF speichern“.</p>
    ${sel('contactId', 'Für Kunde (optional)', contactOpts(), contactId, { blank: 1, cls: 'full' })}
    ${chk('mitExpose', 'Exposé (Fotos, Daten, Beschreibung)', true)}${chk('mitRechnung', 'Individuelle Modellrechnung', true)}
    ${chk('ohneAdresse', 'Straße ausblenden (nur Ort zeigen)', false)}${chk('mitAusstattung', 'Ausstattung & Lage mit aufnehmen', true)}
    <h4 class="full">Kunde & Finanzierung</h4>
    ${inp('zve', 'Zu versteuerndes Einkommen (€/Jahr)', v.zve, { type: 'number', step: 'any' })}${inp('eigenkapital', 'Eigenkapital (€) – leer = Nebenkosten', v.eigenkapital, { type: 'number', step: 'any' })}
    ${chk('splitting', 'Verheiratet (Splitting)', v.splitting)}${chk('kirche', 'Kirchensteuer', v.kirche)}
    ${inp('zins', 'Sollzins (%)', v.zins, { type: 'number', step: 'any' })}${inp('tilgung', 'Tilgung (%)', v.tilgung, { type: 'number', step: 'any' })}
    <h4 class="full">Objekt</h4>
    ${inp('kaufpreis', 'Kaufpreis (€)', v.kaufpreis, { type: 'number', step: 'any' })}${inp('miete', 'Kaltmiete / Monat (€)', v.miete, { type: 'number', step: 'any' })}
    ${inp('hausgeld', 'Hausgeld nicht umlagefähig / Monat (€)', v.hausgeld, { type: 'number', step: 'any' })}${inp('afa', 'AfA (% p. a.)', v.afa, { type: 'number', step: 'any' })}
    ${inp('gebaeudeanteil', 'Gebäudeanteil (%)', v.gebaeudeanteil, { type: 'number', step: 'any' })}${inp('jahre', 'Betrachtung (Jahre)', v.jahre, { type: 'number', step: 'any' })}
    <div class="full repreview" id="mrprev"></div>`, {
    wide: true, saveLabel: 'Exposé erstellen',
    onMount: el => {
      const f = el.querySelector('form'), prev = () => {
        const o = lesen(f); if (!o.kaufpreis || !o.miete) { el.querySelector('#mrprev').innerHTML = '<p class="muted small">Für die Modellrechnung Kaufpreis und Kaltmiete angeben.</p>'; return; }
        const r = kapitalanlage(o), k = r.kennzahlen;
        el.querySelector('#mrprev').innerHTML = html`<div class="kv"><span>Rate / Monat</span><b>${e2(r.rateMonat)}</b></div><div class="kv"><span>Cashflow vor Steuern / Monat (Jahr 1)</span><b>${e2(k.cfMonatVor)}</b></div>
          <div class="kv"><span>Steuerwirkung / Monat (Jahr 1)</span><b>${e2(r.jahre[0].steuerwirkung / 12)}</b></div><div class="kv strong"><span>${k.cfMonatNach < 0 ? 'Eigenaufwand' : 'Überschuss'} nach Steuern / Monat</span><b>${e2(Math.abs(k.cfMonatNach))}</b></div>
          <div class="kv"><span>Nettovermögen nach ${o.jahre} Jahren</span><b>${e0(k.nettovermoegenEnde)}</b></div>`.s;
      };
      f.addEventListener('input', prev); f.addEventListener('change', e => {
        if (e.target.name === 'contactId') { const c = db.get('contacts', e.target.value), an = c?.anlage; if (an) for (const k of ['zve', 'eigenkapital', 'zins', 'tilgung']) if (an[k] != null) f[k].value = an[k]; if (an) { f.splitting.checked = !!an.splitting; f.kirche.checked = !!an.kirche; } }
        prev();
      });
      prev();
    },
    onSave: async val => {
      const o = lesen(null, val), c = db.get('contacts', val.contactId);
      if (val.mitRechnung && (!o.kaufpreis || !o.miete)) { toast('Für die Modellrechnung Kaufpreis und Kaltmiete angeben', 'err'); return false; }
      if (!val.mitExpose && !val.mitRechnung) { toast('Bitte Exposé und/oder Modellrechnung wählen', 'err'); return false; }
      const r = val.mitRechnung ? kapitalanlage(o) : null;
      drucken(p, { ...val, kunde: c ? fullName(c) : '' }, r);
      if (c) {
        await db.save('contacts', { ...c, anlage: { zve: o.zve, splitting: o.splitting, kirche: o.kirche, eigenkapital: val.eigenkapital, zins: o.zins, tilgung: o.tilgung } });
        await db.log('system', `📄 ${val.mitExpose ? 'Exposé' : ''}${val.mitExpose && val.mitRechnung ? ' & ' : ''}${val.mitRechnung ? 'Modellrechnung' : ''} erstellt: ${p.titel}${r ? ` (Eigenaufwand ${e2(-r.kennzahlen.cfMonatNach)}/Monat)` : ''}`, { contactId: c.id, propertyId: p.id });
      }
    },
  });
}

function lesen(f, val) {
  const g = n => f ? (f[n].type === 'checkbox' ? f[n].checked : f[n].value) : val[n];
  const n = k => zahl(g(k));
  return { kaufpreis: n('kaufpreis') || 0, miete: n('miete') || 0, hausgeld: n('hausgeld') || 0, afa: n('afa') ?? 2, gebaeudeanteil: n('gebaeudeanteil') ?? 80,
    zve: n('zve') || 0, eigenkapital: n('eigenkapital'), zins: n('zins') ?? 3.6, tilgung: n('tilgung') ?? 2, jahre: Math.min(30, Math.max(1, n('jahre') || 10)),
    splitting: !!g('splitting'), kirche: !!g('kirche'), bundesland: db.settings().bundesland || 'Bayern', wohnflaeche: null };
}

function drucken(p, o, r) {
  const S = db.settings(), A = u => { try { return new URL(u, location.href.replace(/crm\/.*$/, '')).href; } catch { return u; } };
  const bilder = String(p.bilder || '').split('\n').map(x => x.trim()).filter(Boolean).map(A);
  const ort = [p.plz, p.ort].filter(Boolean).join(' '), adr = o.ohneAdresse ? ort : adresse(p);
  const fakten = [['Objektart', p.art], ['Wohnfläche', p.flaeche && num(p.flaeche, 1) + ' m²'], ['Zimmer', p.zimmer], ['Etage', p.etage], ['Baujahr', p.baujahr], ['Badezimmer', p.bad], ['Stellplätze', p.stellplaetze],
    ['Heizung', p.heizung], ['Hausgeld', p.hausgeld && eur(p.hausgeld) + ' / Monat'], ['Kaltmiete (Ist/Soll)', p.kalkMiete && eur2(Number(p.kalkMiete)) + ' / Monat'],
    ['Energieausweis', [p.eArt, p.eWert && p.eWert + ' kWh/(m²·a)', p.eKlasse && 'Klasse ' + p.eKlasse, p.eTraeger, p.eBaujahr && 'Bj. ' + p.eBaujahr].filter(Boolean).join(', ')]].filter(x => x[1]);
  const ausst = String(p.ausstattung || '').split(/\n|;/).map(x => x.replace(/^[-•·\s]+/, '').trim()).filter(Boolean);
  const k = r?.kennzahlen, a = r?.annahmen, nk = r?.nebenkosten;
  const w = window.open('', '_blank'); if (!w) { toast('Pop-up blockiert – bitte erlauben', 'err'); return; }
  const kopf = `<div class="kopf"><div class="lk"><img src="${esc(A('logo/Wappen_gold.svg'))}" alt=""><span class="lc"><span class="ln">Keuerleber</span><span class="ls"><i></i><span>Immobilien</span><i></i></span></span></div><div class="k">Kernsanierte Kapitalanlagen<br>${esc(fmtDate(today()))}${o.kunde ? `<br>für ${esc(o.kunde)}` : ''}</div></div>`;
  const fuss = `<div class="fuss"><div><b>${esc(S.firma || 'Keuerleber Immobilien')}</b><br>${esc(S.inhaber || '')}<br>${esc([S.strasse, [S.plz, S.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</div><div><b>Kontakt</b><br>${esc(S.tel || '')}<br>${esc(S.email || '')}<br>${esc(S.web || '')}</div><div><b>Hinweis</b><br>Für den Käufer provisionsfrei. Alle Angaben ohne Gewähr, Irrtümer und Zwischenverkauf vorbehalten.</div></div>`;
  const expose = !o.mitExpose ? '' : `<section class="seite">${kopf}
    <p class="ober">Exposé${p.nr ? ' · ' + esc(p.nr) : ''}</p><h1>${esc(p.titel)}</h1><p class="adr">${esc(adr)}</p>
    ${bilder[0] ? `<img class="hero" src="${esc(bilder[0])}" alt="">` : ''}
    <div class="eck"><div><span>Kaufpreis</span><b>${p.preis ? esc(eur(p.preis)) : 'auf Anfrage'}</b></div>${p.flaeche ? `<div><span>Wohnfläche</span><b>${esc(num(p.flaeche, 1))} m²</b></div>` : ''}${p.zimmer ? `<div><span>Zimmer</span><b>${esc(String(p.zimmer))}</b></div>` : ''}${p.preis && p.kalkMiete ? `<div><span>Bruttomietrendite</span><b>${esc(pz(Number(p.kalkMiete) * 12 / Number(p.preis) * 100))}</b></div>` : ''}</div>
    <table class="fakten">${fakten.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${esc(String(v))}</td></tr>`).join('')}</table>
    ${fuss}</section>
    ${p.beschreibung || ausst.length || p.lage || bilder.length > 1 ? `<section class="seite">${kopf}
      ${p.beschreibung ? `<h2>Objektbeschreibung</h2><p class="txt">${esc(p.beschreibung)}</p>` : ''}
      ${o.mitAusstattung && ausst.length ? `<h2>Ausstattung</h2><ul class="aus">${ausst.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${o.mitAusstattung && p.lage ? `<h2>Lage</h2><p class="txt">${esc(p.lage)}</p>` : ''}
      ${bilder.length > 1 ? `<h2>Impressionen</h2><div class="gal">${bilder.slice(1, 9).map(b => `<img src="${esc(b)}" alt="">`).join('')}</div>` : ''}
      ${fuss}</section>` : ''}`;
  const rechnung = !r ? '' : `<section class="seite">${kopf}
    <p class="ober">Individuelle Modellrechnung</p><h1>${esc(p.titel)}</h1><p class="adr">${esc(adr)}${o.kunde ? ' · erstellt für ' + esc(o.kunde) : ''}</p>
    <div class="tiles"><div><span>Monatl. ${k.cfMonatNach < 0 ? 'Eigenaufwand' : 'Überschuss'} nach Steuern (Jahr 1)</span><b>${esc(e2(Math.abs(k.cfMonatNach)))}</b></div><div><span>Nettovermögen nach ${a.jahre} Jahren</span><b>${esc(e0(k.nettovermoegenEnde))}</b></div><div><span>Bruttomietrendite</span><b>${esc(pz(k.bruttomietrendite))}</b></div></div>
    <div class="zwei"><div><h2>Investition</h2><table class="kv">
      <tr><td>Kaufpreis</td><td>${esc(e0(a.kaufpreis))}</td></tr>${p.flaeche ? `<tr><td>Preis je m²</td><td>${esc(e0(a.kaufpreis / p.flaeche))}</td></tr>` : ''}
      <tr><td>Grunderwerbsteuer (${esc(pz(nk.grestSatz, 1))})</td><td>${esc(e0(nk.grunderwerbsteuer))}</td></tr><tr><td>Notar & Grundbuch</td><td>${esc(e0(nk.notarGrundbuch))}</td></tr>
      <tr><td>Maklerprovision</td><td>0 €</td></tr><tr class="s"><td>Gesamtinvestition</td><td>${esc(e0(nk.gesamtkosten))}</td></tr><tr><td>Eigenkapital</td><td>${esc(e0(r.eigenkapital))}</td></tr></table></div>
     <div><h2>Finanzierung & Bewirtschaftung</h2><table class="kv">
      <tr><td>Darlehen</td><td>${esc(e0(r.darlehen))}</td></tr><tr><td>Sollzins / Tilgung</td><td>${esc(pz(a.zins))} / ${esc(pz(a.tilgung))}</td></tr><tr><td>Rate monatlich</td><td>${esc(e2(r.rateMonat))}</td></tr>
      <tr><td>Kaltmiete monatlich</td><td>${esc(e2(a.miete))}</td></tr><tr><td>Hausgeld n. umlagef. mtl.</td><td>${esc(e2(a.hausgeld))}</td></tr><tr><td>AfA ${esc(pz(a.afa))} p. a.</td><td>${esc(e0(r.afaJahr))}</td></tr></table></div></div>
    <h2>Entwicklung über ${a.jahre} Jahre</h2>
    <table class="jt"><thead><tr><th>Jahr</th><th>Miete</th><th>Zinsen</th><th>Tilgung</th><th>AfA</th><th>Steuer-<br>wirkung</th><th>Cashflow<br>vor Steuer</th><th>Cashflow<br>nach Steuer</th><th>Restschuld</th><th>Netto-<br>vermögen</th></tr></thead><tbody>
    ${r.jahre.map(z => `<tr><td>${z.jahr}</td><td>${e0(z.miete)}</td><td>${e0(z.zinsen)}</td><td>${e0(z.tilgung)}</td><td>${e0(z.afa)}</td><td>${e0(z.steuerwirkung)}</td><td>${e0(z.cfVor)}</td><td><b>${e0(z.cfNach)}</b></td><td>${e0(z.restschuld)}</td><td>${e0(z.nettovermoegen)}</td></tr>`).join('')}</tbody></table>
    <h2>Annahmen</h2><p class="klein">Zu versteuerndes Einkommen ${esc(e0(a.zve))} (${a.splitting ? 'Splitting' : 'Grundtarif'}${a.kirche ? ', mit Kirchensteuer' : ''}), wirksamer Steuersatz auf den Vermietungsverlust ca. ${esc(pz(k.grenzsteuersatz, 1))}; Mietsteigerung ${esc(pz(a.mietsteigerung, 1))} p. a., Kostensteigerung ${esc(pz(a.kostensteigerung, 1))} p. a., Wertentwicklung ${esc(pz(a.wertsteigerung, 1))} p. a., Mietausfallwagnis ${esc(pz(a.mietausfall, 1))}; Gebäudeanteil ${esc(pz(a.gebaeudeanteil, 0))} der Gesamtinvestition als AfA-Basis; ${esc(pz(a.ruecklageAnteil, 0))} des nicht umlagefähigen Hausgelds als nicht sofort abziehbare Erhaltungsrücklage. Steuer nach § 32a EStG (Tarif ${a.jahrStart}) inkl. Solidaritätszuschlag.${k.irr != null ? ` Eigenkapitalrendite (IRR) bei fiktivem Verkauf nach ${a.jahre} Jahren: ${esc(pz(k.irr, 1))}.` : ''}</p>
    <h2>Wichtige Hinweise</h2><p class="klein">Diese Modellrechnung dient ausschließlich der Veranschaulichung und beruht auf den genannten Annahmen. Sie stellt keine Steuer-, Rechts- oder Anlageberatung dar. Tatsächliche Mieten, Kosten, Zinsen nach Ablauf der Zinsbindung, Wertentwicklung und steuerliche Auswirkungen können abweichen. Eine erhöhte Abschreibung auf Basis eines Restnutzungsdauer-Gutachtens unterliegt der Prüfung durch das Finanzamt. Bitte lassen Sie Ihre persönliche Situation von einem Steuerberater prüfen.</p>
    ${fuss}</section>`;
  w.document.write(`<!doctype html><html lang="de"><meta charset="utf-8"><title>${esc((o.mitExpose ? 'Exposé ' : 'Modellrechnung ') + p.titel)}</title><style>
  @font-face{font-family:Jost;src:url(${A('fonts/jost-var.woff2')}) format('woff2');font-weight:100 900}@font-face{font-family:'Cormorant Garamond';src:url(${A('fonts/cormorant-600.woff2')}) format('woff2');font-weight:500 700}
  @page{size:A4;margin:12mm 14mm 14mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
  body{font-family:Jost,Helvetica,Arial,sans-serif;color:#14110d;font-size:12px;line-height:1.5;max-width:800px;margin:0 auto;padding:24px;background:#fff}
  .seite{page-break-after:always;break-after:page;position:relative;padding-bottom:4px}.seite:last-child{page-break-after:auto;break-after:auto}
  .kopf{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #a8813f;padding-bottom:12px;margin-bottom:22px}
  .lk{display:flex;align-items:center;gap:12px}.lk img{height:52px}.lc{display:flex;flex-direction:column;gap:5px}
  .ln{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:21px;letter-spacing:.2em;padding-left:.2em;text-transform:uppercase;color:#9c7f4d;line-height:1;text-align:center}
  .ls{display:flex;align-items:center;gap:8px;font-weight:500;font-size:10px;letter-spacing:.5em;text-transform:uppercase;line-height:1}.ls i{flex:1;height:.5px;background:#a8813f;min-width:5px}.ls span{margin-right:-.5em}
  .k{text-align:right;font-size:10.5px;color:#6b6459;line-height:1.55}
  .ober{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#9c7f4d;margin:0 0 4px}
  h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:28px;line-height:1.15;margin:0 0 4px}.adr{color:#6b6459;margin:0 0 14px}
  h2{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#9c7f4d;margin:20px 0 8px;border-bottom:.5px solid #e2d9c6;padding-bottom:4px}
  .hero{width:100%;height:330px;object-fit:cover;border-radius:4px;display:block}
  .eck{display:flex;gap:0;margin:14px 0;border:1px solid #c9a96e;border-radius:4px;background:#f8f3ea}.eck div{flex:1;padding:10px 14px;border-right:1px solid #fff}.eck div:last-child{border:0}
  .eck span,.tiles span{display:block;font-size:9.5px;color:#6b6459;letter-spacing:.04em}.eck b{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:#14110d;font-variant-numeric:lining-nums}
  table{border-collapse:collapse;width:100%}.fakten td{padding:5px 2px;border-bottom:.5px solid #e2d9c6}.fakten td:first-child{color:#6b6459;width:42%}
  .txt{white-space:pre-line;margin:0}.aus{columns:2;margin:0;padding-left:18px}.aus li{margin:0 0 4px;break-inside:avoid}
  .gal{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.gal img{width:100%;height:190px;object-fit:cover;border-radius:3px}
  .tiles{display:grid;grid-template-columns:1.2fr 1.2fr 1fr;border:1px solid #c9a96e;background:#f8f3ea;border-radius:4px;margin:6px 0 4px}.tiles div{padding:10px 14px;border-right:1px solid #fff}.tiles div:last-child{border:0}
  .tiles b{font-size:19px;font-weight:600;font-variant-numeric:lining-nums}
  .zwei{display:grid;grid-template-columns:1fr 1fr;gap:22px}.kv td{padding:3px 2px;border-bottom:.5px solid #ece5d8;font-size:11.5px}.kv td:last-child{text-align:right;white-space:nowrap}.kv td:first-child{color:#6b6459}.kv tr.s td{font-weight:600;color:#14110d}
  .jt th{background:#14110d;color:#fff;font-size:8.5px;font-weight:600;padding:5px 4px;text-align:right;line-height:1.2}.jt th:first-child,.jt td:first-child{text-align:center}
  .jt td{font-size:9.5px;padding:3.5px 4px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.jt tr:nth-child(even) td{background:#faf7f1}
  .klein{font-size:9.5px;color:#4d473f;line-height:1.5;margin:0}
  .fuss{margin-top:22px;padding-top:10px;border-top:1px solid #a8813f;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;font-size:9px;color:#6b6459;line-height:1.5}.fuss b{color:#14110d}
  @media print{body{padding:0}.noprint{display:none}}.noprint{position:fixed;top:12px;right:12px}.noprint button{font:inherit;background:#c9a96e;border:0;padding:8px 16px;border-radius:6px;cursor:pointer}
  </style><body><div class="noprint"><button onclick="print()">Drucken / als PDF speichern</button></div>${expose}${rechnung}</body></html>`);
  w.document.close();
}
