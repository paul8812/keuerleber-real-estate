// Überfällig-Assistent: einen Berg überfälliger Aufgaben in einem Zug in Ordnung bringen.
// Aufgaben werden nach Art gruppiert (Rückruf, Nachfassen, Exposé senden …). Für die gewählten Gruppen:
//   • auf die nächsten Werktage verteilen (wichtige und älteste zuerst, höchstens N pro Tag)
//   • alle auf heute setzen  • als erledigt abhaken  • löschen
// Jede Aktion lässt sich direkt rückgängig machen. Das ursprüngliche Datum bleibt in „urspruenglich“ erhalten.
import * as db from './db.js';
import { html, modal, toast, today, addDays, fmtDate, daysBetween } from './util.js';
import { haptik } from './haptik.js';

export const ueberfaellige = () => db.all('tasks').filter(t => !t.done && t.faellig && t.faellig < today());
/** Art der Aufgabe aus dem Titel: „⚡ Rückruf: Max Müller (3)“ / „Rückruf 48“ → „Rückruf“ */
export const artName = t => (t.titel || '').replace(/^⚡ /, '').split(':')[0].replace(/\s*\(.*$/, '').replace(/\s+\d+$/, '').trim() || 'Sonstige';
const werktag = d => { const w = new Date(d + 'T12:00:00').getDay(); return w !== 0 && w !== 6; };
const naechsterWerktag = d => { let x = d; while (!werktag(x)) x = addDays(x, 1); return x; };

/** Verteilung berechnen: wichtige zuerst, dann älteste; proTag Aufgaben je Werktag ab heute */
export function verteilung(tasks, proTag, start = today()) {
  const n = Math.max(1, Math.round(proTag) || 1);
  const sort = [...tasks].sort((a, b) => ((b.prio === 'hoch') - (a.prio === 'hoch')) || ((a.prio === 'niedrig') - (b.prio === 'niedrig')) || a.faellig.localeCompare(b.faellig));
  let tag = naechsterWerktag(start), i = 0; const out = [];
  for (const t of sort) { if (i >= n) { tag = naechsterWerktag(addDays(tag, 1)); i = 0; } out.push([t, tag]); i++; }
  return out;
}

export function assistent() {
  const alle = ueberfaellige();
  if (!alle.length) { toast('Keine überfälligen Aufgaben 🎉'); return; }
  const gr = new Map(); for (const t of alle) { const a = artName(t); if (!gr.has(a)) gr.set(a, []); gr.get(a).push(t); }
  const G = [...gr].sort((a, b) => b[1].length - a[1].length);
  let wahlFn = () => [];
  const aeltest = ts => ts.reduce((m, t) => t.faellig < m ? t.faellig : m, '9999');
  modal(`${alle.length} überfällige Aufgaben ordnen`, html`
    <p class="full muted">Wähle, welche Arten du jetzt in Ordnung bringen willst – und was mit ihnen passieren soll. Alles lässt sich danach rückgängig machen.</p>
    <div class="full">${G.map(([name, ts], i) => html`<label class="uf-gr"><input type="checkbox" data-g="${i}" checked><span>${name}<small>älteste seit ${fmtDate(aeltest(ts))} (${daysBetween(aeltest(ts), today())} Tage)${ts.some(t => t.prio === 'hoch') ? ` · ${ts.filter(t => t.prio === 'hoch').length} wichtig` : ''}</small></span><b class="uf-n">${ts.length}</b></label>`)}</div>
    <label class="f"><span>Nur Aufgaben, die überfällig sind seit</span><select name="alter"><option value="0">egal wie lange</option><option value="7">mehr als 1 Woche</option><option value="30">mehr als 1 Monat</option><option value="90">mehr als 3 Monaten</option></select></label>
    <label class="f"><span>Beim Verteilen: Aufgaben pro Werktag</span><input name="proTag" type="number" min="1" max="50" value="8" inputmode="numeric"></label>
    <div class="full uf-akt" role="radiogroup" aria-label="Was soll passieren?">
      <label><input type="radio" name="aktion" value="verteilen" checked><span>Auf die nächsten Werktage verteilen<small>Wichtige und älteste zuerst – so wird der Berg machbar</small></span></label>
      <label><input type="radio" name="aktion" value="heute"><span>Alle auf heute setzen<small>Wenn du sie heute wirklich abarbeiten willst</small></span></label>
      <label><input type="radio" name="aktion" value="erledigt"><span>Als erledigt abhaken<small>Hat sich erledigt oder ist längst passiert</small></span></label>
      <label><input type="radio" name="aktion" value="loeschen"><span>Löschen<small>Nicht mehr relevant – verschwinden ganz</small></span></label>
    </div>
    <p class="full muted small" id="uf-vorschau"></p>`, {
    wide: true, saveLabel: 'Übernehmen',
    onMount: m => {
      const wahl = () => { const alter = Number(m.querySelector('[name=alter]').value); return G.filter((_, i) => m.querySelector(`[data-g="${i}"]`).checked).flatMap(g => g[1]).filter(t => !alter || daysBetween(t.faellig, today()) > alter); };
      const vorschau = () => {
        const ts = wahl(), a = m.querySelector('[name=aktion]:checked').value, p = Number(m.querySelector('[name=proTag]').value) || 8, box = m.querySelector('#uf-vorschau');
        if (!ts.length) { box.textContent = 'Keine Aufgaben ausgewählt.'; return; }
        if (a === 'verteilen') { const v = verteilung(ts, p), letzter = v[v.length - 1][1]; box.textContent = `${ts.length} Aufgaben werden auf ${new Set(v.map(x => x[1])).size} Werktage verteilt – ${p} pro Tag, bis ${fmtDate(letzter)}.`; }
        else box.textContent = { heute: `${ts.length} Aufgaben werden auf heute gesetzt.`, erledigt: `${ts.length} Aufgaben werden als erledigt abgehakt.`, loeschen: `${ts.length} Aufgaben werden gelöscht.` }[a];
      };
      m.addEventListener('change', vorschau); m.addEventListener('input', vorschau); vorschau();
      wahlFn = wahl;
    },
    onSave: async v => {
      const ts = wahlFn();
      if (!ts.length) { toast('Keine Aufgaben ausgewählt', 'err'); return false; }
      const vorher = ts.map(t => ({ ...t })), jetzt = new Date().toISOString(); let text = '';
      if (v.aktion === 'verteilen') { for (const [t, tag] of verteilung(ts, Number(v.proTag) || 8)) await db.save('tasks', { ...t, faellig: tag, urspruenglich: t.urspruenglich || t.faellig }); text = `${ts.length} Aufgaben auf die nächsten Werktage verteilt`; }
      else if (v.aktion === 'heute') { for (const t of ts) await db.save('tasks', { ...t, faellig: today(), urspruenglich: t.urspruenglich || t.faellig }); text = `${ts.length} Aufgaben auf heute gesetzt`; }
      else if (v.aktion === 'erledigt') { for (const t of ts) await db.save('tasks', { ...t, done: true, doneAt: jetzt }); text = `${ts.length} Aufgaben abgehakt`; }
      else { await db.delMany('tasks', ts.map(t => t.id)); text = `${ts.length} Aufgaben gelöscht`; }
      haptik('erfolg');
      toast(text, 'ok', { label: 'Rückgängig', fn: async () => { for (const t of vorher) await db.save('tasks', t); toast('Wiederhergestellt'); } });
    },
  });
}
