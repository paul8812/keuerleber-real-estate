import * as db from '../db.js';
import { html, raw, toast, fmtDT, esc } from '../util.js';
import { RULES, ruleCfg, run, enableNotify, notifyEnabled } from '../automation.js';
import * as google from '../google.js';
import * as anfragen from '../anfragen.js';

function mailCard() {
  const st = db.get('sync', 'mailsync'), s = st?.stats || {};
  const neu = (db.all('mails') || []).filter(m => m.status === 'neu').length;
  const status = !st ? html`<p><b>Noch nicht eingerichtet.</b> Der Abgleich läuft auf deinem Mac: im Ordner <code>crm-mailsync</code> doppelt auf <b>„Einrichten“</b> klicken.</p>`
    : st.error ? html`<p class="bad">⚠️ ${st.error}</p><p class="muted small">Letzter erfolgreicher Abgleich: ${st.lastOk ? fmtDT(st.lastOk) : '–'}</p>`
    : html`<p>✓ Aktiv – zuletzt abgeglichen ${fmtDT(st.lastOk || st.lastRun)} (alle 3 Minuten, solange dein Mac an ist).</p>`;
  return html`${status}
    ${st ? html`<div class="kpis small"><a class="kpi" href="#/posteingang"><b>${neu}</b><span>neu im Posteingang</span></a><div class="kpi"><b>${s.anfragen || 0}</b><span>Anfragen erkannt</span></div><div class="kpi"><b>${s.aufgaben || 0}</b><span>Aufgaben angelegt</span></div><div class="kpi"><b>${s.erledigt || 0}</b><span>automatisch erledigt</span></div></div>` : ''}
    <ul class="steps"><li><b>Anfragen</b> über die Website (Kontakt, Objekt, Termin, Vorab-Liste, Renditerechner) und über ImmoScout24, Immowelt und Kleinanzeigen → Kontakt anlegen, Vorgang in der Vertriebs-Pipeline, Aufgabe „Erstkontakt“. Terminwünsche landen als Termin „(angefragt)“ im Kalender.</li>
      <li><b>Mail von einem Kontakt</b> → Eintrag im Verlauf + Aufgabe „Antworten“.</li>
      <li><b>Antwort gesendet</b> (Outlook → Gesendet) → Eintrag im Verlauf, offene Antwort-Aufgaben zu diesem Kontakt werden automatisch erledigt.</li>
      <li><b>Unbekannte Absender</b> → <a class="lnk" href="#/posteingang">Posteingang</a>: dort per Klick Kontakt anlegen, zuordnen, Aufgabe oder ignorieren.</li>
      <li>Newsletter, Werbung und Abwesenheitsnotizen werden übersprungen. Mails bleiben in Outlook ungelesen; es wird nie etwas gesendet oder gelöscht.</li></ul>`;
}

function webCard() {
  const st = anfragen.status;
  const st1 = st.ok ? html`<p>✓ <b>Aktiv.</b> Anfragen aus allen Website-Formularen (Beratungs-Popup, Kontakt, Objekt, Termin, Vorab-Liste, Renditerechner) landen sofort als Kontakt, Vorgang und Aufgabe im CRM – auch wenn dein Mac aus ist. Geprüft wird alle 2 Minuten, solange das CRM offen ist; sonst beim nächsten Öffnen.</p><p class="muted small">${st.neu ? st.neu + ' Anfrage(n) in dieser Sitzung übernommen · ' : ''}zuletzt geprüft ${fmtDT(st.zuletzt)}</p>`
    : st.ok === false && st.fehler === 'nicht eingerichtet' ? html`<p><b>Noch nicht eingerichtet</b> – einmalig (1 Minute):</p>
      <ol class="steps"><li><a class="lnk" target="_blank" rel="noopener" href="${db.SQL_URL()}">SQL-Editor in Supabase öffnen</a></li><li><button type="button" class="btn" data-websql>SQL kopieren</button> und dort einfügen</li><li>Auf <b>Run</b> klicken, hier auf <button type="button" class="btn ghost" data-webcheck>Erneut prüfen</button></li></ol>`
    : st.ok === false ? html`<p class="bad">⚠️ ${st.fehler}</p><div class="actions"><button type="button" class="btn ghost" data-webcheck>Erneut prüfen</button></div>`
    : html`<p class="muted">Wird geprüft …</p><div class="actions"><button type="button" class="btn ghost" data-webcheck>Jetzt prüfen</button></div>`;
  const sofort = html`<h3 style="margin:18px 0 6px">⚡ Sofort-Push aufs Handy &amp; Sofort-Antwort</h3>
    <p class="muted small">Läuft in Supabase selbst: In dem Moment, in dem jemand ein Formular abschickt, bekommst du eine Telegram-Nachricht, und der Interessent (wenn er eine E-Mail angegeben hat) eine Bestätigung von dir. Funktioniert auch bei geschlossenem CRM und ausgeschaltetem Mac. Zugangsdaten werden nirgends gespeichert, nur in das SQL eingesetzt, das du in Supabase ausführst.</p>
    <details open><summary><b>1. Telegram-Bot (Sofort-Push)</b></summary>
      <ol class="steps"><li>In Telegram <b>@BotFather</b> öffnen → <code>/newbot</code> → Namen vergeben → den <b>Token</b> kopieren.</li><li>Deinen neuen Bot in Telegram öffnen und <b>/start</b> schicken.</li><li>Token hier einfügen, auf „Chat-ID finden“ klicken, dann „SQL kopieren“ und in Supabase ausführen.</li></ol>
      <div class="grid"><label class="f"><span>Bot-Token</span><input id="tgtok" autocomplete="off" placeholder="123456789:AA…"></label><label class="f"><span>Chat-ID</span><input id="tgchat" autocomplete="off" placeholder="wird gefunden"></label></div>
      <div class="actions"><button type="button" class="btn" data-tgfind>Chat-ID finden</button><button type="button" class="btn primary" data-tgsql>SQL kopieren</button><a class="btn" target="_blank" rel="noopener" href="${db.SQL_URL()}">SQL-Editor öffnen</a></div><p class="muted small" id="tgmsg"></p></details>
    <details><summary><b>2. Sofort-Antwort per E-Mail (optional)</b></summary>
      <ol class="steps"><li>Kostenloses Konto auf <a class="lnk" target="_blank" rel="noopener" href="https://resend.com">resend.com</a>, dort die Domain <b>keuerleber-immobilien.de</b> hinzufügen und die angezeigten DNS-Einträge bei Strato setzen (Mails von deiner Adresse sind sonst nicht erlaubt).</li><li>API-Key erstellen und unten einfügen.</li></ol>
      <div class="grid"><label class="f"><span>Resend API-Key</span><input id="rskey" autocomplete="off" placeholder="re_…"></label><label class="f"><span>Absender</span><input id="rsfrom" value="Paul Keuerleber &lt;paul.keuerleber@keuerleber-immobilien.de&gt;"></label></div>
      <div class="actions"><button type="button" class="btn primary" data-rssql>SQL kopieren</button></div></details>`;
  return html`${st1}${sofort}<p class="muted small">Die Mail an dich bleibt zusätzlich als Sicherheit bestehen. Die Tabelle nimmt von der Website nur Einträge entgegen und kann nur von dir gelesen werden; abgeholte Einträge werden gelöscht.</p>`;
}

export function render(el) {
  const cfg = ruleCfg(), s = db.settings();
  const log = db.all('activities').filter(a => (a.text || '').startsWith('⚡')).sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 12);
  el.innerHTML = html`<div class="head"><div><h1>Automationen</h1><p class="muted">Laufen automatisch, sobald das CRM geöffnet ist (beim Start, alle 5 Minuten und beim Zurückkehren in den Tab).</p><p class="sicherhinweis">🔒 Das CRM verschickt <b>nie selbst</b> E-Mails oder Nachrichten. Automationen legen nur Aufgaben an – bei Mail-Aufgaben liegt über ✉ ein fertiger Entwurf bereit, den du prüfst und selbst aus Outlook sendest.</p></div><div class="actions"><button class="btn primary" data-run>⚡ Jetzt ausführen</button></div></div>
    <div class="cols"><section class="card" style="grid-column:1/-1"><h2>Regeln</h2>
      ${RULES.map(r => html`<div class="rule"><label class="sw"><input type="checkbox" data-on="${r.id}" ${cfg[r.id].on ? raw('checked') : ''}><i></i></label><div class="grow"><div class="ttl">${r.name}</div><div class="sub">${r.desc}</div></div>
        ${r.days != null ? html`<label class="rd"><input type="number" min="0" data-days="${r.id}" value="${cfg[r.id].days}"><small>${r.unit}</small></label>` : ''}</div>`)}
    </section>
    <section class="card"><h2>Benachrichtigungen</h2><p class="muted">Browser-Hinweis für Termine (1 Std. vorher) und fällige Aufgaben, solange das CRM offen ist.</p>
      <div class="actions"><button class="btn" data-notify>${notifyEnabled() ? '✓ Aktiv – neu anfragen' : 'Benachrichtigungen aktivieren'}</button></div></section>
    <section class="card"><h2>Letzte automatische Aktionen</h2>${log.length ? html`<ul class="list">${log.map(a => html`<li><div class="grow"><div class="ttl">${a.text.replace('⚡ Automatisch: ', '')}</div><div class="sub">${fmtDT(a.datum)}</div></div></li>`)}</ul>` : html`<p class="muted">Noch keine.</p>`}</section>
    <section class="card" style="grid-column:1/-1"><h2>Website-Anfragen → CRM</h2>${webCard()}</section>
    <section class="card" style="grid-column:1/-1"><h2>E-Mail (Outlook / Strato)</h2>${mailCard()}</section>
    <section class="card" style="grid-column:1/-1"><h2>Google Kalender & Kontakte</h2>
      <p class="muted">Termine werden in beide Richtungen mit deinem Google-Hauptkalender abgeglichen (CRM-Termine → Google, Google-Termine → CRM). Nach dem ersten Klick auf „Kalender synchronisieren“ gleicht das CRM alle 10 Minuten automatisch ab, solange es geöffnet ist. <b>Damit die Termine in Outlook erscheinen:</b> in Outlook unter Einstellungen → Konten dein Google-Konto hinzufügen.</p>
      <div class="grid"><label class="f full"><span>Google OAuth Client-ID</span><input id="gid" value="${s.googleClientId || ''}" placeholder="123456789-abc….apps.googleusercontent.com"></label></div>
      <div class="actions" style="margin-top:12px"><button class="btn" data-gsave>Client-ID speichern</button><button class="btn primary" data-gsync>Kalender synchronisieren</button><button class="btn" data-gcon>Kontakte aus Google importieren</button><button class="btn ghost" data-gout>Trennen</button></div>
      <p class="muted" id="gmsg" style="margin-top:10px"></p>
      <details><summary class="muted">Client-ID erstellen (einmalig, ca. 5 Min.)</summary><ol class="steps"><li><a class="lnk" target="_blank" rel="noopener" href="https://console.cloud.google.com/projectcreate">console.cloud.google.com</a> → neues Projekt anlegen.</li><li>„APIs & Dienste → Bibliothek“: <b>Google Calendar API</b> und <b>People API</b> aktivieren.</li><li>„OAuth-Zustimmungsbildschirm“: Typ <i>Extern</i>, App-Name eintragen, deine Gmail als <b>Testnutzer</b> hinzufügen.</li><li>„Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID“, Typ <b>Webanwendung</b>. Bei „Autorisierte JavaScript-Quellen“ eintragen: <code>https://keuerleber-immobilien.de</code> und <code>https://www.keuerleber-immobilien.de</code>.</li><li>Client-ID kopieren, oben einfügen und speichern.</li></ol></details></section></div>`.s;
  const save = async () => { const auto = {}; el.querySelectorAll('[data-on]').forEach(i => { auto[i.dataset.on] = { on: i.checked }; }); el.querySelectorAll('[data-days]').forEach(i => { auto[i.dataset.days].days = Number(i.value); }); await db.saveSettings({ ...db.settings(), auto }); };
  el.querySelectorAll('[data-on],[data-days]').forEach(i => i.onchange = async () => { await save(); toast('Gespeichert'); });
  el.querySelector('[data-run]').onclick = async () => { const n = await run({ manual: true }); toast(n ? `⚡ ${n} Aktion${n > 1 ? 'en' : ''} ausgeführt` : 'Nichts zu tun – alles aktuell'); };
  el.querySelector('[data-notify]').onclick = async () => toast((await enableNotify()) ? 'Benachrichtigungen aktiv' : 'Nicht erlaubt – im Browser freigeben');
  el.querySelector('[data-websql]')?.addEventListener('click', async () => { await navigator.clipboard.writeText(db.ANFRAGEN_SQL); toast('SQL kopiert'); });
  el.querySelector('[data-webcheck]')?.addEventListener('click', async () => { await anfragen.pull({ manual: true }); render(el); });
  if (anfragen.status.ok === null) anfragen.pull().then(() => { if (el.isConnected) render(el); });
  const val = id => (el.querySelector('#' + id)?.value || '').trim();
  el.querySelector('[data-tgfind]')?.addEventListener('click', async () => {
    const m = el.querySelector('#tgmsg'); if (!val('tgtok')) { m.textContent = 'Bitte zuerst den Token einfügen.'; return; }
    try { const r = await (await fetch(`https://api.telegram.org/bot${val('tgtok')}/getUpdates`)).json(); const c = (r.result || []).map(u => u.message?.chat || u.my_chat_member?.chat).filter(Boolean).pop();
      if (c) { el.querySelector('#tgchat').value = c.id; m.textContent = `Gefunden: ${c.first_name || c.title || c.id}`; } else m.textContent = r.ok ? 'Noch keine Nachricht gefunden. Schick deinem Bot in Telegram „/start“ und versuch es nochmal.' : 'Token ungültig.'; }
    catch { m.textContent = 'Telegram nicht erreichbar.'; } });
  el.querySelector('[data-tgsql]')?.addEventListener('click', async () => { if (!val('tgtok') || !val('tgchat')) return toast('Token und Chat-ID fehlen', 'err'); await navigator.clipboard.writeText(db.telegramSQL(val('tgtok'), val('tgchat'))); toast('SQL kopiert – jetzt im Supabase-SQL-Editor ausführen'); });
  el.querySelector('[data-rssql]')?.addEventListener('click', async () => { if (!val('rskey')) return toast('API-Key fehlt', 'err'); await navigator.clipboard.writeText(db.antwortSQL(val('rskey'), val('rsfrom'))); toast('SQL kopiert – jetzt im Supabase-SQL-Editor ausführen'); });
  const msg = t => el.querySelector('#gmsg').textContent = t;
  const guard = f => async () => { try { msg('Bitte warten …'); await f(); } catch (e) { msg('Fehler: ' + e.message); } };
  el.querySelector('[data-gsave]').onclick = async () => { await db.saveSettings({ ...db.settings(), googleClientId: el.querySelector('#gid').value.trim() }); toast('Client-ID gespeichert'); };
  el.querySelector('[data-gsync]').onclick = guard(async () => { const r = await google.syncCalendar(); msg(`Fertig: ${r.pushed} zu Google gesendet, ${r.pulled} neu importiert, ${r.updated} aktualisiert. Ab jetzt automatisch alle 10 Minuten, solange das CRM offen ist.`); });
  el.querySelector('[data-gcon]').onclick = guard(async () => { msg(`${await google.importContacts()} Kontakte importiert.`); });
  el.querySelector('[data-gout]').onclick = () => { google.disconnect(); msg('Getrennt.'); };
}
