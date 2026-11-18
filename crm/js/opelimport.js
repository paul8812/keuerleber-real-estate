// myOpel-Fahrtberichte („My Trip Report“) ins Fahrtenbuch übernehmen.
// Die myOpel-App zeichnet jede Fahrt mit Start/Ende (Zeit + Straße), Strecke, Dauer und Kilometerstand auf und kann die Berichte
// teilen/herunterladen. Eine offizielle Schnittstelle für Privatkunden gibt es nicht – deshalb: Datei, PDF oder Screenshots
// hochladen, die KI liest die Fahrten aus, danach Abgleich:
//   • passt zu einer CarPlay-Fahrt (Startzeit ± 15 Min.) → Tacho-Kilometerstand und Strecke ergänzen (protokolliert)
//   • schon importiert → überspringen
//   • sonst → neue Fahrt „aus myOpel“ zum Benennen
// Zusätzlich werden erster und letzter Kilometerstand als Tacho-Stände gespeichert (Gesamtfahrleistung, Leasing-Kilometer).
import * as db from './db.js';
import * as ki from './ki.js';
import * as FB from './fahrtenbuch.js';
import { uid } from './util.js';

const SYSTEM = `Du liest Fahrtberichte aus der myOpel-App (Opel Connect „My Trip Report“ / „Fahrten“) – als Datei, PDF oder Screenshot, Sprache meist Deutsch.
Gib NUR JSON zurück: {"fahrten":[{"datum":"YYYY-MM-DD","start":"HH:MM","ende":"HH:MM","von":"Startadresse/Straße","nach":"Zieladresse/Straße","km":Zahl,"kmStandStart":Zahl|null,"kmStandEnde":Zahl|null,"dauerMin":Zahl|null,"verbrauch":Zahl|null}]}
Regeln:
- Jede Fahrt genau einmal, in der Reihenfolge der Vorlage. Keine Fahrten erfinden; unlesbare Werte = null.
- Deutsche Zahlen umrechnen: „1.234,5 km“ → 1234.5; Kilometerstand „41.250 km“ → 41250.
- Ist nur ein Kilometerstand je Fahrt angegeben, ist das der Stand am Ende (kmStandEnde); kmStandStart = kmStandEnde − km, falls sinnvoll.
- Datum ohne Jahr: aktuelles Jahr ${new Date().getFullYear()} annehmen (bei Monaten nach dem aktuellen Monat das Vorjahr).
- Uhrzeiten 24-Stunden-Format; „von/nach“ so genau wie angegeben (Straße, Ort).`;

const istText = f => /\.(csv|txt|tsv|json)$/i.test(f.name) || /^text\/|json/.test(f.type);
async function inhalt(file) {
  if (istText(file)) return (await file.text()).slice(0, 120000);
  if (/\.(xlsx?|numbers)$/i.test(file.name)) throw new Error(`${file.name}: Excel/Numbers bitte als CSV oder PDF teilen`);
  return ki.lesen(file);
}

/** Dateien auslesen → normalisierte Fahrten (sortiert, ohne Dubletten innerhalb des Imports) */
export async function auslesen(files) {
  if (!ki.hasKey()) throw new Error('Für den Import wird der KI-Schlüssel gebraucht (Einstellungen → KI-Belegerkennung).');
  const alle = [];
  // Screenshots gemeinsam (max. 6 je Anfrage), Dateien/PDFs einzeln
  const bilder = [], andere = [];
  for (const f of files) (/^image\//.test(f.type) ? bilder : andere).push(f);
  const pakete = [...andere.map(f => [f]), ...Array.from({ length: Math.ceil(bilder.length / 6) }, (_, i) => bilder.slice(i * 6, i * 6 + 6))];
  for (const paket of pakete) {
    const teile = await Promise.all(paket.map(inhalt));
    const j = await ki.dateiJson(SYSTEM, teile, { frage: 'Alle Fahrten aus diesem myOpel-Fahrtbericht als JSON.' });
    alle.push(...(j.fahrten || j || []));
  }
  return normalisieren(alle);
}
const hhmm = t => /^\d{1,2}:\d{2}$/.test(String(t || '').trim()) ? String(t).trim().padStart(5, '0') : '';
export function normalisieren(liste) {
  const out = [], seen = new Set();
  for (const x of liste || []) {
    const datum = /^\d{4}-\d{2}-\d{2}$/.test(x?.datum || '') ? x.datum : '';
    const km = FB.zahl(x?.km), ke = FB.zahl(x?.kmStandEnde);
    let ks = FB.zahl(x?.kmStandStart);
    if (!datum || !(km > 0) || km > 2000) continue;
    if (ks == null && ke != null) ks = Math.round((ke - km) * 10) / 10;
    const f = { datum, start: hhmm(x.start), ende: hhmm(x.ende), von: String(x.von || '').trim().slice(0, 200), nach: String(x.nach || '').trim().slice(0, 200), km: Math.round(km * 10) / 10,
      kmStandStart: ks != null && ks > 0 ? ks : null, kmStandEnde: ke != null && ke > 0 ? ke : null, dauerMin: FB.zahl(x.dauerMin), verbrauch: FB.zahl(x.verbrauch) };
    f.schluessel = `${f.datum}|${f.start}|${f.km}`;
    if (seen.has(f.schluessel)) continue; seen.add(f.schluessel); out.push(f);
  }
  return out.sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start));
}

const zeitVon = (d, t) => t ? new Date(`${d}T${t}:00`).getTime() : null;
/** passende vorhandene Fahrt: gleicher Tag, Startzeit (oder Ankunft) ± 15 Min. bzw. ohne Zeit gleiche Strecke ± 15 % */
export function finden(o, fahrten = (db.all('fahrten') || []).filter(f => f.status !== 'verworfen')) {
  const s = zeitVon(o.datum, o.start), e = zeitVon(o.datum, o.ende);
  let best = null, bestD = Infinity;
  for (const f of fahrten) {
    if (FB.tag(f) !== o.datum || f.opel?.schluessel === o.schluessel) continue;
    let d = Infinity;
    if (s != null && f.start?.zeit && !f.start.zeitUnbekannt && !f.start.zeitUngefaehr) d = Math.abs(new Date(f.start.zeit).getTime() - s);
    else if (e != null && f.ende?.zeit && !f.ende.zeitUnbekannt && !f.ende.zeitUngefaehr) d = Math.abs(new Date(f.ende.zeit).getTime() - e);
    else if (s == null && Math.abs(FB.km(f) - o.km) <= Math.max(1, o.km * 0.15)) d = 0;
    if (d <= 15 * 60000 && d < bestD) { best = f; bestD = d; }
  }
  return best;
}
/** Vorschau: was mit jeder Fahrt passiert */
export function planen(liste) {
  const vorhanden = (db.all('fahrten') || []).filter(f => f.status !== 'verworfen');
  return liste.map(o => {
    if (vorhanden.some(f => f.opel?.schluessel === o.schluessel)) return { ...o, aktion: 'doppelt' };
    const f = finden(o, vorhanden);
    return f ? { ...o, aktion: 'ergaenzen', fahrtId: f.id } : { ...o, aktion: 'neu' };
  });
}

/** Import ausführen */
export async function uebernehmen(plan) {
  let neu = 0, ergaenzt = 0, doppelt = 0;
  for (const o of plan) {
    const opel = { schluessel: o.schluessel, km: o.km, kmStandStart: o.kmStandStart, kmStandEnde: o.kmStandEnde, von: o.von, nach: o.nach, dauerMin: o.dauerMin, verbrauch: o.verbrauch, importiert: new Date().toISOString() };
    if (o.aktion === 'doppelt') { doppelt++; continue; }
    if (o.aktion === 'ergaenzen') {
      const f = db.get('fahrten', o.fahrtId); if (!f) continue;
      const patch = {};
      if (o.kmStandStart != null && (f.kmStart === '' || f.kmStart == null)) patch.kmStart = o.kmStandStart;
      if (o.kmStandEnde != null && (f.kmEnde === '' || f.kmEnde == null)) patch.kmEnde = o.kmStandEnde;
      const mitKm = Object.keys(patch).length ? patch : {};
      await FB.speichern(f, mitKm, { grund: 'Kilometerstand aus myOpel-Fahrtbericht ergänzt' });
      const nachher = db.get('fahrten', f.id);
      // Strecke laut Auto als Route übernehmen (genauer als die berechnete), Opel-Daten anhängen
      await db.save('fahrten', { ...nachher, opel, kmRoute: o.km, start: { ...nachher.start, adresse: nachher.start?.adresse || o.von || undefined }, ende: { ...nachher.ende, adresse: nachher.ende?.adresse || o.nach || undefined } });
      ergaenzt++; continue;
    }
    const zs = o.start ? new Date(`${o.datum}T${o.start}:00`).toISOString() : new Date(`${o.datum}T12:00:00`).toISOString();
    const ze = o.ende ? new Date(`${o.datum}T${o.ende}:00`).toISOString() : o.dauerMin && o.start ? new Date(new Date(zs).getTime() + o.dauerMin * 60000).toISOString() : zs;
    await db.save('fahrten', { id: 'fahrt-' + uid(), quelle: 'opel', status: 'offen', erstellt: new Date().toISOString(),
      start: { zeit: zs, adresse: o.von || '', zeitUngefaehr: !o.start }, ende: { zeit: ze, adresse: o.nach || '', zeitUngefaehr: !o.ende },
      kmRoute: o.km, minRoute: o.dauerMin || null, kmStart: o.kmStandStart ?? '', kmEnde: o.kmStandEnde ?? '', opel });
    neu++;
  }
  // Tacho-Stände: erster und letzter des Imports (für Gesamtfahrleistung und Leasing-Kilometer)
  const mitStand = plan.filter(o => o.kmStandEnde != null);
  let staende = 0;
  if (mitStand.length) {
    const fz = FB.fahrzeug(), liste = [...(fz.kmStaende || [])];
    const erst = plan.find(o => o.kmStandStart != null), letzt = mitStand[mitStand.length - 1];
    for (const [d, km] of [[erst?.datum, erst?.kmStandStart], [letzt.datum, letzt.kmStandEnde]]) {
      if (!d || km == null || liste.some(s => s.datum === d && Math.abs(FB.zahl(s.km) - km) < 1)) continue;
      liste.push({ id: 'km-' + uid(), datum: d, km, quelle: 'myOpel', eingetragen: new Date().toISOString() }); staende++;
    }
    if (staende) await FB.fahrzeugSpeichern({ kmStaende: liste });
  }
  return { neu, ergaenzt, doppelt, staende };
}
