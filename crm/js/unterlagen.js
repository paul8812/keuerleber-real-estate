// Objektunterlagen: Dateien je Objekt (Exposé, Grundrisse, Energieausweis, Verträge …) – verwalten und per Link verschicken.
// Die Dateien liegen im privaten Cloud-Speicher „unterlagen“ (Supabase Storage) unter <Benutzer>/<Objekt>/<Datei>;
// der Datensatz (Sammlung „unterlagen“) merkt sich Name, Kategorie und ob die Datei nur intern ist (z. B. das Exposé des Verkäufers).
// Verschickt werden Download-Links mit Ablaufdatum – die Datei selbst bleibt bei dir.
import * as db from './db.js';
import { html, raw, esc, toast, modal, confirmDlg, uid, today, fmtDate, fullName } from './util.js';
import { contactOpts } from './ui.js';
import { haptik } from './haptik.js';

const BUCKET = 'unterlagen';
export const KATEGORIEN = ['Exposé', 'Bilder und Grundrisse', 'Energieausweis', 'Teilungserklärung, Protokolle, Hausgeld', 'Mietvertrag und Nebenkosten', 'Kaufvertrag und Notar', 'Finanzierung und Kalkulation', 'Sonstiges'];
const SYMBOL = { pdf: '📄', jpg: '🖼', jpeg: '🖼', png: '🖼', heic: '🖼', webp: '🖼', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', zip: '🗜' };
const endung = n => (String(n).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
const groesse = b => !b ? '' : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB';
const dateiName = n => String(n).normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Datei';
// Speicherpfad: nur einfache Zeichen (Umlaute u. Ä. machen in Adressen Ärger) – der Anzeigename bleibt wie er ist
const pfadName = n => dateiName(n).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[^\w.\- ]/g, '').replace(/\s+/g, '_');
const speicher = () => { const sb = db.klient(); if (!sb || !db.isCloud()) throw new Error('Unterlagen brauchen die Cloud – bitte anmelden.'); return sb.storage.from(BUCKET); };

export const liste = propertyId => (db.all('unterlagen') || []).filter(u => u.propertyId === propertyId).sort((a, b) => KATEGORIEN.indexOf(a.kategorie) - KATEGORIEN.indexOf(b.kategorie) || (a.name || '').localeCompare(b.name || '', 'de'));
function rateKategorie(name) {
  const n = name.toLowerCase();
  return /expos|factsheet|fact-sheet/.test(n) ? 'Exposé' : /energie/.test(n) ? 'Energieausweis' : /grundriss|plan|\.(jpe?g|png|heic|webp)$/.test(n) ? 'Bilder und Grundrisse' : /teilungs|protokoll|hausgeld|wirtschaftsplan|weg|abrechnung/.test(n) ? 'Teilungserklärung, Protokolle, Hausgeld'
    : /mietvertrag|miete|nebenkosten/.test(n) ? 'Mietvertrag und Nebenkosten' : /kaufvertrag|notar|grundbuch/.test(n) ? 'Kaufvertrag und Notar' : /finanz|kalkul|rechnung|darlehen/.test(n) ? 'Finanzierung und Kalkulation' : 'Sonstiges';
}
export async function hochladen(propertyId, files, melde = () => {}) {
  const st = speicher(), u = db.benutzer(); let n = 0;
  for (const f of files) {
    melde(++n, files.length, f.name);
    if (f.size > 100 * 1024 * 1024) { toast(`${f.name}: größer als 100 MB – übersprungen`, 'err'); continue; }
    const pfad = `${u}/${propertyId}/${Date.now().toString(36)}-${pfadName(f.name)}`;
    const { error } = await st.upload(pfad, f, { contentType: f.type || 'application/octet-stream', upsert: false });
    if (error) throw new Error(`${f.name}: ${error.message}`);
    await db.save('unterlagen', { id: 'unt-' + uid(), propertyId, name: dateiName(f.name), pfad, groesse: f.size, typ: f.type || '', kategorie: rateKategorie(f.name), intern: false });
  }
}
/** Zeitlich begrenzte Adresse zum Ansehen/Herunterladen (Standard 10 Minuten; fürs Verschicken 30 Tage) */
export async function adresse(u, sekunden = 600, laden = false) {
  const { data, error } = await speicher().createSignedUrl(u.pfad, sekunden, laden ? { download: u.name } : undefined);
  if (error) throw new Error(error.message); return data.signedUrl;
}
export async function loeschen(u) { const { error } = await speicher().remove([u.pfad]); if (error && !/not.?found/i.test(error.message)) throw new Error(error.message); await db.del('unterlagen', u.id); }

export function karte(p) {
  const L = liste(p.id), cloud = db.isCloud();
  return html`<section class="card unt" id="unt"><h2>Unterlagen <span class="unt-n">${L.length || ''}</span><span class="unt-akt">${L.length ? html`<button type="button" class="mini" data-unt-senden>✉ Verschicken</button>` : ''}<label class="mini unt-up">+ Dateien<input type="file" multiple hidden data-unt-file></label></span></h2>
    ${!cloud ? html`<p class="muted small">Unterlagen werden in der Cloud gespeichert – in diesem Gerät ist der lokale Modus aktiv.</p>` : ''}
    <div class="unt-drop" data-unt-drop>${L.length ? html`<ul class="unt-liste">${L.map(u => html`<li data-unt="${u.id}" class="${u.intern ? 'intern' : ''}">
        <button type="button" class="unt-auf" data-unt-auf title="Ansehen"><span class="unt-ic" aria-hidden="true">${SYMBOL[endung(u.name)] || '📎'}</span><span class="unt-t"><b>${u.name}</b><small>${[u.kategorie, groesse(u.groesse), u.intern ? 'nur intern – wird nicht verschickt' : ''].filter(Boolean).join(' · ')}</small></span></button>
        <button type="button" class="mini" data-unt-mehr aria-label="Mehr zu ${u.name}">⋯</button></li>`)}</ul>`
      : html`<p class="muted unt-leer">Noch keine Unterlagen. Dateien hierher ziehen oder über „+ Dateien“ hochladen.</p>`}</div>
  </section>`;
}

export function binden(el, p) {
  const k = el.querySelector('#unt'); if (!k) return;
  const neu = async files => { files = [...files]; if (!files.length) return;
    try { await hochladen(p.id, files, (i, n, name) => toast(`Lade ${i} von ${n}: ${name}`)); haptik('erfolg'); toast(`${files.length} Datei${files.length === 1 ? '' : 'en'} gespeichert`); }
    catch (e) { toast(e.message, 'err'); } };
  k.querySelector('[data-unt-file]').onchange = e => neu(e.target.files);
  const drop = k.querySelector('[data-unt-drop]');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); neu(e.dataTransfer.files); };
  const von = b => db.get('unterlagen', b.closest('[data-unt]').dataset.unt);
  k.querySelectorAll('[data-unt-auf]').forEach(b => b.onclick = async () => { const w = window.open('', '_blank'); try { const url = await adresse(von(b)); if (w) w.location = url; else location.href = url; } catch (e) { w?.close(); toast(e.message, 'err'); } });
  k.querySelectorAll('[data-unt-mehr]').forEach(b => b.onclick = () => bearbeiten(von(b)));
  k.querySelector('[data-unt-senden]')?.addEventListener('click', () => senden(p));
}

function bearbeiten(u) {
  modal(u.name, html`
    <label class="f full"><span>Name</span><input name="name" value="${u.name}" required></label>
    <label class="f full"><span>Kategorie</span><select name="kategorie">${KATEGORIEN.map(x => html`<option ${x === u.kategorie ? raw('selected') : ''}>${x}</option>`)}</select></label>
    <label class="f full chk"><input type="checkbox" name="intern" ${u.intern ? raw('checked') : ''}> <span>Nur intern (z. B. Exposé des Verkäufers) – wird beim Verschicken nicht angeboten</span></label>
    <div class="f full"><button type="button" class="btn" id="unt-laden">⬇ Herunterladen</button></div>`, {
    saveLabel: 'Speichern',
    onMount: m => { m.querySelector('#unt-laden').onclick = async () => { try { location.href = await adresse(u, 600, true); } catch (e) { toast(e.message, 'err'); } }; },
    onSave: async v => { await db.save('unterlagen', { ...db.get('unterlagen', u.id), name: dateiName(v.name), kategorie: v.kategorie, intern: !!v.intern }); toast('Gespeichert'); },
    danger: { label: 'Löschen', confirm: `„${u.name}“ endgültig löschen? Bereits verschickte Links funktionieren dann nicht mehr.`, fn: async () => { try { await loeschen(u); toast('Datei gelöscht'); } catch (e) { toast(e.message, 'err'); } } },
  });
}

/** Unterlagen verschicken: Auswahl → Download-Links (30 Tage gültig) → Mail-Entwurf an den Kontakt, Eintrag im Verlauf */
function senden(p) {
  const L = liste(p.id), S = db.settings();
  modal('Unterlagen verschicken', html`
    <label class="f full"><span>An</span><select name="contactId"><option value="">– Kontakt wählen (oder E-Mail unten eintragen) –</option>${contactOpts().map(([id, n]) => html`<option value="${id}">${n}</option>`)}</select></label>
    <label class="f full"><span>E-Mail (falls kein Kontakt gewählt)</span><input name="email" type="email" placeholder="name@beispiel.de"></label>
    <div class="f full"><span>Welche Unterlagen?</span><div class="unt-wahl">${L.map(u => html`<label class="${u.intern ? 'intern' : ''}"><input type="checkbox" name="u_${u.id}" ${u.intern ? '' : raw('checked')}> <span>${u.name}<small>${[u.kategorie, groesse(u.groesse), u.intern ? 'nur intern' : ''].filter(Boolean).join(' · ')}</small></span></label>`)}</div></div>
    <label class="f"><span>Links gültig</span><select name="tage"><option value="7">7 Tage</option><option value="30" selected>30 Tage</option><option value="90">90 Tage</option></select></label>
    <p class="muted small full">Es öffnet sich ein Mail-Entwurf mit den Download-Links; der Text liegt zusätzlich in der Zwischenablage. Die Dateien selbst bleiben in deinem CRM.</p>`, {
    wide: true, saveLabel: 'Mail-Entwurf öffnen',
    onSave: async v => {
      const wahl = L.filter(u => v['u_' + u.id]); if (!wahl.length) { toast('Bitte mindestens eine Datei auswählen', 'err'); return false; }
      const c = v.contactId && db.get('contacts', v.contactId), an = (c?.email || v.email || '').trim(), tage = Number(v.tage) || 30;
      let links;
      try { links = await Promise.all(wahl.map(async u => [u.name, await adresse(u, tage * 86400, true)])); } catch (e) { toast(e.message, 'err'); return false; }
      const anrede = c ? `Guten Tag ${[c.anrede, c.nachname].filter(Boolean).join(' ') || fullName(c)}` : 'Guten Tag';
      const bis = new Date(Date.now() + tage * 864e5).toLocaleDateString('de-DE');
      const text = `${anrede},\n\nwie besprochen erhalten Sie die Unterlagen zu „${p.titel}“${p.strasse ? ' (' + [p.strasse, p.ort].filter(Boolean).join(', ') + ')' : ''}:\n\n${links.map(([n, l]) => `• ${n}\n  ${l}`).join('\n\n')}\n\nDie Links sind bis ${bis} gültig. Bei Fragen melden Sie sich gerne.\n\nMit freundlichen Grüßen\n${S.inhaber || ''}\n${S.firma || ''}${S.tel ? '\nTel. ' + S.tel : ''}`;
      try { await navigator.clipboard.writeText(text); } catch { /* Zwischenablage nicht erlaubt */ }
      await db.log('email', `Unterlagen verschickt${an ? ' an ' + an : ''}: ${wahl.map(u => u.name).join(', ')} (Links gültig bis ${bis})`, { contactId: c?.id || '', propertyId: p.id });
      location.href = `mailto:${encodeURIComponent(an)}?subject=${encodeURIComponent('Unterlagen: ' + p.titel)}&body=${encodeURIComponent(text)}`;
      toast('Mail-Entwurf geöffnet · Text in der Zwischenablage'); haptik('erfolg');
    },
  });
}
