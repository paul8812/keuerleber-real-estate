import * as db from '../db.js';
import { html, raw, toast, fmtDT, esc } from '../util.js';
import { RULES, ruleCfg, run, enableNotify, notifyEnabled } from '../automation.js';
import * as google from '../google.js';

export function render(el) {
  const cfg = ruleCfg(), s = db.settings();
  const log = db.all('activities').filter(a => (a.text || '').startsWith('⚡')).sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 12);
  el.innerHTML = html`<div class="head"><div><h1>Automationen</h1><p class="muted">Laufen automatisch, sobald das CRM geöffnet ist (beim Start, alle 5 Minuten und beim Zurückkehren in den Tab).</p></div><div class="actions"><button class="btn primary" data-run>⚡ Jetzt ausführen</button></div></div>
    <div class="cols"><section class="card" style="grid-column:1/-1"><h2>Regeln</h2>
      ${RULES.map(r => html`<div class="rule"><label class="sw"><input type="checkbox" data-on="${r.id}" ${cfg[r.id].on ? raw('checked') : ''}><i></i></label><div class="grow"><div class="ttl">${r.name}</div><div class="sub">${r.desc}</div></div>
        ${r.days != null ? html`<label class="rd"><input type="number" min="0" data-days="${r.id}" value="${cfg[r.id].days}"><small>${r.unit}</small></label>` : ''}</div>`)}
    </section>
    <section class="card"><h2>Benachrichtigungen</h2><p class="muted">Browser-Hinweis für Termine (1 Std. vorher) und fällige Aufgaben, solange das CRM offen ist.</p>
      <div class="actions"><button class="btn" data-notify>${notifyEnabled() ? '✓ Aktiv – neu anfragen' : 'Benachrichtigungen aktivieren'}</button></div></section>
    <section class="card"><h2>Letzte automatische Aktionen</h2>${log.length ? html`<ul class="list">${log.map(a => html`<li><div class="grow"><div class="ttl">${a.text.replace('⚡ Automatisch: ', '')}</div><div class="sub">${fmtDT(a.datum)}</div></div></li>`)}</ul>` : html`<p class="muted">Noch keine.</p>`}</section>
    <section class="card" style="grid-column:1/-1"><h2>Google Kalender & Kontakte</h2>
      <p class="muted">Termine werden in beide Richtungen mit deinem Google-Hauptkalender abgeglichen (CRM-Termine → Google, Google-Termine → CRM). Kontakte lassen sich aus Google importieren.</p>
      <div class="grid"><label class="f full"><span>Google OAuth Client-ID</span><input id="gid" value="${s.googleClientId || ''}" placeholder="123456789-abc….apps.googleusercontent.com"></label></div>
      <div class="actions" style="margin-top:12px"><button class="btn" data-gsave>Client-ID speichern</button><button class="btn primary" data-gsync>Kalender synchronisieren</button><button class="btn" data-gcon>Kontakte aus Google importieren</button><button class="btn ghost" data-gout>Trennen</button></div>
      <p class="muted" id="gmsg" style="margin-top:10px"></p>
      <details><summary class="muted">Client-ID erstellen (einmalig, ca. 5 Min.)</summary><ol class="steps"><li><a class="lnk" target="_blank" rel="noopener" href="https://console.cloud.google.com/projectcreate">console.cloud.google.com</a> → neues Projekt anlegen.</li><li>„APIs & Dienste → Bibliothek“: <b>Google Calendar API</b> und <b>People API</b> aktivieren.</li><li>„OAuth-Zustimmungsbildschirm“: Typ <i>Extern</i>, App-Name eintragen, deine Gmail als <b>Testnutzer</b> hinzufügen.</li><li>„Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID“, Typ <b>Webanwendung</b>. Bei „Autorisierte JavaScript-Quellen“ eintragen: <code>https://keuerleber-immobilien.de</code> und <code>https://www.keuerleber-immobilien.de</code>.</li><li>Client-ID kopieren, oben einfügen und speichern.</li></ol></details></section></div>`.s;
  const save = async () => { const auto = {}; el.querySelectorAll('[data-on]').forEach(i => { auto[i.dataset.on] = { on: i.checked }; }); el.querySelectorAll('[data-days]').forEach(i => { auto[i.dataset.days].days = Number(i.value); }); await db.saveSettings({ ...db.settings(), auto }); };
  el.querySelectorAll('[data-on],[data-days]').forEach(i => i.onchange = async () => { await save(); toast('Gespeichert'); });
  el.querySelector('[data-run]').onclick = async () => { const n = await run({ manual: true }); toast(n ? `⚡ ${n} Aktion${n > 1 ? 'en' : ''} ausgeführt` : 'Nichts zu tun – alles aktuell'); };
  el.querySelector('[data-notify]').onclick = async () => toast((await enableNotify()) ? 'Benachrichtigungen aktiv' : 'Nicht erlaubt – im Browser freigeben');
  const msg = t => el.querySelector('#gmsg').textContent = t;
  const guard = f => async () => { try { msg('Bitte warten …'); await f(); } catch (e) { msg('Fehler: ' + e.message); } };
  el.querySelector('[data-gsave]').onclick = async () => { await db.saveSettings({ ...db.settings(), googleClientId: el.querySelector('#gid').value.trim() }); toast('Client-ID gespeichert'); };
  el.querySelector('[data-gsync]').onclick = guard(async () => { const r = await google.syncCalendar(); msg(`Fertig: ${r.pushed} zu Google gesendet, ${r.pulled} neu importiert, ${r.updated} aktualisiert.`); });
  el.querySelector('[data-gcon]').onclick = guard(async () => { msg(`${await google.importContacts()} Kontakte importiert.`); });
  el.querySelector('[data-gout]').onclick = () => { google.disconnect(); msg('Getrennt.'); };
}
