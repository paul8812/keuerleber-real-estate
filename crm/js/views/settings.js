import * as db from '../db.js';
import { html, raw, inp, sel, collect, toast, download, today, confirmDlg } from '../util.js';
import { BUNDESLAENDER } from '../consts.js';
import { seed } from '../seed.js';

export function render(el) {
  const s = db.settings(), c = db.cfg();
  el.innerHTML = html`<div class="head"><h1>Einstellungen</h1></div><div class="cols">
    <section class="card"><h2>Firma & Standardwerte</h2><form id="fs" class="grid">${inp('firma', 'Firma', s.firma)}${inp('inhaber', 'Inhaber / Absender', s.inhaber)}${inp('strasse', 'Straße', s.strasse)}${inp('plz', 'PLZ', s.plz)}${inp('ort', 'Ort', s.ort)}${inp('tel', 'Telefon', s.tel)}${inp('email', 'E-Mail', s.email)}${inp('web', 'Website', s.web)}
      ${sel('bundesland', 'Bundesland (Grunderwerbsteuer)', Object.keys(BUNDESLAENDER), s.bundesland)}${inp('provKaeufer', 'Käuferprovision (% brutto)', s.provKaeufer, { type: 'number', step: '0.01' })}${inp('provVerkaeufer', 'Verkäuferprovision (% brutto)', s.provVerkaeufer, { type: 'number', step: '0.01' })}${inp('nachfassTage', 'Erinnerung „lange nicht kontaktiert“ nach (Tagen)', s.nachfassTage, { type: 'number' })}
      <div class="full"><button class="btn primary">Speichern</button></div></form></section>
    <section class="card"><h2>Cloud-Datenbank (Supabase)</h2>
      <p class="muted">Status: <b>${db.isCloud() ? '☁ Cloud verbunden' : '💾 Nur lokal in diesem Browser'}</b>. Anleitung: <code>crm/SETUP.md</code></p>
      <form id="fc" class="grid">${inp('url', 'Project URL', c.url, { ph: 'https://xxxx.supabase.co', cls: 'full' })}${inp('key', 'Anon / Publishable Key', c.key, { cls: 'full' })}
      <div class="full actions"><button class="btn primary">Speichern & neu laden</button>${c.url ? html`<button type="button" class="btn" data-off>Cloud trennen</button>` : ''}${db.isCloud() ? html`<button type="button" class="btn" data-logout>Abmelden</button>` : ''}</div></form>
      ${!db.isCloud() && c.url ? '' : ''}
      <p class="muted">Der Anon-Key ist öffentlich vorgesehen – geschützt werden die Daten durch Login + Row Level Security.</p></section>
    <section class="card"><h2>Backup & Daten</h2><div class="actions col"><button class="btn" data-bk>Backup herunterladen (JSON)</button>
      <label class="btn">Backup einspielen<input type="file" accept=".json" data-rs hidden></label>
      <button class="btn" data-up>Lokale Daten in die Cloud hochladen</button><button class="btn" data-seed>Beispieldaten laden</button><button class="btn danger" data-wipe>Alle Daten löschen</button></div>
      <p class="muted">Empfehlung: wöchentlich ein Backup herunterladen.</p></section></div>`.s;
  el.querySelector('#fs').onsubmit = async e => { e.preventDefault(); await db.saveSettings({ ...s, ...collect(e.target) }); toast('Gespeichert'); };
  el.querySelector('#fc').onsubmit = e => { e.preventDefault(); const v = collect(e.target); db.setCfg({ url: v.url.replace(/\/+$/, ''), key: v.key }); location.reload(); };
  el.querySelector('[data-off]')?.addEventListener('click', () => { db.setCfg({ off: true }); location.reload(); });
  el.querySelector('[data-logout]')?.addEventListener('click', () => db.logout());
  el.querySelector('[data-bk]').onclick = () => download(`crm-backup-${today()}.json`, db.exportAll(), 'application/json');
  el.querySelector('[data-rs]').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (!await confirmDlg('Backup einspielen? Vorhandene Einträge mit gleicher ID werden überschrieben.')) return; try { await db.importAll(await f.text()); toast('Backup eingespielt'); } catch (x) { toast('Fehler: ' + x.message, 'err'); } };
  el.querySelector('[data-up]').onclick = async () => { if (!db.isCloud()) return toast('Zuerst Cloud verbinden', 'err'); if (!await confirmDlg('Lokal gespeicherte Daten in die Cloud kopieren?')) return; toast((await db.uploadLocalToCloud()) + ' Einträge hochgeladen'); await db.reload(); };
  el.querySelector('[data-seed]').onclick = async () => { if (await confirmDlg('Beispieldaten hinzufügen (Demo-Kontakte, -Objekte, -Vorgänge)?')) { await seed(); toast('Beispieldaten geladen'); } };
  el.querySelector('[data-wipe]').onclick = async () => { if (await confirmDlg('ALLE Daten unwiderruflich löschen?') && await confirmDlg('Wirklich sicher? Vorher ein Backup herunterladen!')) { await db.wipeAll(); toast('Alle Daten gelöscht'); } };
}
