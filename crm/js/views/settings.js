import * as db from '../db.js';
import * as KI from '../ki.js';
const MSG = {};  // Statusmeldungen überleben das Neuzeichnen nach dem Speichern
import { html, raw, inp, sel, chk, collect, toast, download, today, confirmDlg, modal } from '../util.js';
import { BUNDESLAENDER } from '../consts.js';
import { seed } from '../seed.js';
import * as W from '../website.js';

export function render(el) {
  const s = db.settings(), c = db.cfg();
  el.innerHTML = html`<div class="head"><h1>Einstellungen</h1></div><div class="cols">
    <section class="card widgetcard"><h2>📱 Widget für den Home-Bildschirm</h2>
      <p class="muted">Fällige Aufgaben, Termine, neue Anfragen und offene Vorgänge direkt auf dem iPhone-Home-Bildschirm (auch Sperrbildschirm). Antippen öffnet das CRM. Läuft über die kostenlose App <b>Scriptable</b>.</p>
      <ol class="schritte">
        <li><a class="lnk" target="_blank" rel="noopener" href="https://apps.apple.com/de/app/scriptable/id1405459188">Scriptable im App Store laden</a></li>
        <li>Hier auf <b>„Skript kopieren“</b> tippen</li>
        <li>Scriptable öffnen → <b>＋</b> oben rechts → einfügen → oben den Namen „Keuerleber CRM“ eintragen → <b>Fertig</b></li>
        <li>Skript einmal antippen und mit deinen CRM-Daten anmelden (mit 2FA: Code eingeben). Das Passwort wird nicht gespeichert.</li>
        <li>Home-Bildschirm lange drücken → <b>＋</b> → Scriptable → Größe wählen → Widget antippen → bei „Script“ <b>Keuerleber CRM</b> wählen</li>
      </ol>
      <div class="actions"><button type="button" class="btn primary" data-widgetcopy>📋 Skript kopieren</button><a class="btn" target="_blank" rel="noopener" href="widget/keuerleber-widget.js">Skript ansehen</a></div>
      <p class="muted small">Klein: 3 Zahlen · Mittel: Zahlen, nächster Termin, 2 Aufgaben · Groß: zusätzlich dein Fokus heute. Aktualisiert sich etwa alle 15 Minuten. „Auf allen Geräten abmelden“ sperrt auch das Widget.</p></section>
    ${db.isCloud() ? html`<section class="card"><h2>🔐 Mein Zugang</h2>
      <p class="muted">Angemeldet als <b id="myemail">…</b></p>
      <form id="fpw" class="grid"><h4 class="full">Passwort ändern</h4>
        <label class="f"><span>Neues Passwort</span><input name="pw1" type="password" autocomplete="new-password" minlength="8" required></label>
        <label class="f"><span>Wiederholen</span><input name="pw2" type="password" autocomplete="new-password" minlength="8" required></label>
        <div class="full actions"><button class="btn primary">Passwort speichern</button></div></form>
      <form id="fem" class="grid"><h4 class="full">Login-E-Mail ändern</h4>
        <label class="f full"><span>Neue E-Mail-Adresse</span><input name="email" type="email" autocomplete="email" required></label>
        <div class="full actions"><button class="btn">E-Mail ändern</button></div></form>
      <h4 class="full" style="margin-top:14px">Zwei-Faktor-Anmeldung (2FA)</h4>
      <div id="mfabox" class="muted small">wird geprüft …</div>
      <h4 class="full" style="margin-top:14px">Sitzung</h4>
      <div class="grid"><label class="f"><span>Automatisch abmelden nach Inaktivität</span><select id="idle">${[[15, '15 Minuten'], [30, '30 Minuten'], [60, '1 Stunde'], [240, '4 Stunden'], [0, 'nie (nicht empfohlen)']].map(([v, l]) => html`<option value="${v}" ${String(v) === String(s.autoLogoutMin ?? 60) ? raw('selected') : ''}>${l}</option>`)}</select></label>
        <div class="f"><span>&nbsp;</span><button type="button" class="btn danger" data-logoutall>Auf allen Geräten abmelden</button></div></div>
      <p class="muted small" id="zmsg">${MSG.z || ''}</p></section>` : ''}
    <section class="card"><h2>Firma & Standardwerte</h2><form id="fs" class="grid">${inp('firma', 'Firma', s.firma)}${inp('inhaber', 'Inhaber / Absender', s.inhaber)}${inp('strasse', 'Straße', s.strasse)}${inp('plz', 'PLZ', s.plz)}${inp('ort', 'Ort', s.ort)}${inp('tel', 'Telefon', s.tel)}${inp('email', 'E-Mail', s.email)}${inp('web', 'Website', s.web)}
      ${sel('bundesland', 'Bundesland (Grunderwerbsteuer)', Object.keys(BUNDESLAENDER), s.bundesland)}${inp('verguetung', 'Standard-Vergütung je verkaufter Einheit (€ netto, zahlt der Verkäufer)', s.verguetung ?? 8000, { type: 'number', step: '100' })}${inp('nachfassTage', 'Erinnerung „lange nicht kontaktiert“ nach (Tagen)', s.nachfassTage, { type: 'number' })}
      <h4 class="full">Rechnungen & Steuer</h4>${inp('steuernummer', 'Steuernummer', s.steuernummer)}${inp('ustId', 'USt-IdNr. (falls vorhanden)', s.ustId)}
      ${inp('iban', 'IBAN', s.iban)}${inp('bic', 'BIC', s.bic)}${inp('bank', 'Bank', s.bank)}${inp('zahlungsziel', 'Zahlungsziel (Tage)', s.zahlungsziel ?? 14, { type: 'number' })}
      ${chk('kleinunternehmer', 'Kleinunternehmer nach § 19 UStG (keine Umsatzsteuer ausweisen)', s.kleinunternehmer, { cls: 'full' })}
      <div class="full"><button class="btn primary">Speichern</button></div></form></section>
    <section class="card"><h2>Cloud-Datenbank (Supabase)</h2>
      <p class="muted">Status: <b>${db.isCloud() ? '☁ Cloud verbunden' : '💾 Nur lokal in diesem Browser'}</b>. Anleitung: <code>crm/SETUP.md</code></p>
      <form id="fc" class="grid">${inp('url', 'Project URL', c.url, { ph: 'https://xxxx.supabase.co', cls: 'full' })}${inp('key', 'Anon / Publishable Key', c.key, { cls: 'full' })}
      <div class="full actions"><button class="btn primary">Speichern & neu laden</button>${c.url ? html`<button type="button" class="btn" data-off>Cloud trennen</button>` : ''}${db.isCloud() ? html`<button type="button" class="btn" data-logout>Abmelden</button>` : ''}</div></form>
      ${!db.isCloud() && c.url ? '' : ''}
      <p class="muted">Der Anon-Key ist öffentlich vorgesehen – geschützt werden die Daten durch Login + Row Level Security.</p></section>
    <section class="card"><h2>Website (Objekte veröffentlichen)</h2>
      <p class="muted">Damit das CRM Objekte auf keuerleber-immobilien.de veröffentlichen, ändern und entfernen kann, braucht es einmalig einen GitHub-Zugangsschlüssel – nur für das Website-Repository.</p>
      <form id="fw" class="grid"><label class="f full"><span>GitHub-Zugangsschlüssel ${s.githubToken ? '(hinterlegt ✓)' : ''}</span><input name="githubToken" type="password" autocomplete="off" placeholder="${s.githubToken ? '•••••••• (zum Ändern neu eingeben)' : 'github_pat_…'}"></label>
      <div class="full actions"><button class="btn primary">Speichern & testen</button>${s.githubToken ? html`<button type="button" class="btn ghost" data-wdel>Entfernen</button>` : ''}</div></form>
      <p class="muted small" id="wmsg">${MSG.w || ''}</p>
      <details><summary class="muted">Schlüssel erstellen (einmalig, ca. 2 Min.)</summary><ol class="steps">
        <li><a class="lnk" target="_blank" rel="noopener" href="https://github.com/settings/personal-access-tokens/new">github.com → Neuer Fine-grained Token</a> öffnen (bei GitHub angemeldet).</li>
        <li>Name z. B. „Keuerleber CRM“, Ablauf: 1 Jahr.</li><li>„Repository access“: <b>Only select repositories</b> → <b>${W.REPO}</b>.</li>
        <li>„Permissions → Repository permissions → Contents“: <b>Read and write</b>.</li><li>„Generate token“ klicken, Schlüssel kopieren und hier einfügen.</li></ol>
        <p class="muted small">Der Schlüssel wird mit deinen CRM-Daten geschützt gespeichert und nicht in Backups geschrieben.</p></details></section>
    <section class="card"><h2>🤖 KI-Belegerkennung</h2>
      <p class="muted">Belege fotografieren oder als PDF hochladen (Finanzen → 📷 Belege hochladen) – die KI liest Betrag, Datum, Lieferant und Steuer, ordnet Kategorie, Konto (SKR03) und Objekt zu und bucht automatisch. Kosten ca. 1–2 Cent pro Beleg über dein eigenes Anthropic-Guthaben.</p>
      <form id="fk" class="grid"><label class="f full"><span>KI-Schlüssel (Anthropic) ${s.anthropicKey ? '(hinterlegt ✓)' : ''}</span><input name="anthropicKey" type="password" autocomplete="off" placeholder="${s.anthropicKey ? '•••••••• (zum Ändern neu eingeben)' : 'sk-ant-…'}"></label>
      <div class="full actions"><button class="btn primary">Speichern & testen</button>${s.anthropicKey ? html`<button type="button" class="btn ghost" data-kdel>Entfernen</button>` : ''}</div></form>
      <p class="muted small" id="kmsg">${MSG.k || ''}</p>
      <details ${s.anthropicKey ? '' : raw('open')}><summary class="muted">Schlüssel erstellen (einmalig, ca. 3 Min.)</summary><ol class="steps">
        <li><a class="lnk" target="_blank" rel="noopener" href="https://console.anthropic.com/">console.anthropic.com</a> öffnen und mit deiner E-Mail anmelden bzw. registrieren.</li>
        <li>Unter <b>Billing</b> Guthaben aufladen (z. B. 10 € reichen für mehrere hundert Belege).</li>
        <li>Unter <b>API Keys</b> → <b>Create Key</b>, Name z. B. „Keuerleber CRM“.</li><li>Schlüssel kopieren (beginnt mit <code>sk-ant-</code>) und hier einfügen → „Speichern & testen“.</li></ol>
        <p class="muted small">Der Schlüssel wird geschützt mit deinen CRM-Daten gespeichert und nicht in Backups geschrieben. Belege bleiben in deiner CRM-Datenbank abgelegt (Aufbewahrungspflicht beachten).</p></details></section>
    <section class="card"><h2>Backup & Daten</h2><div class="actions col"><button class="btn" data-bk>Backup herunterladen (JSON)</button>
      <label class="btn">Backup einspielen<input type="file" accept=".json" data-rs hidden></label>
      <button class="btn" data-up>Lokale Daten in die Cloud hochladen</button><button class="btn" data-seed>Beispieldaten laden</button><button class="btn danger" data-wipe>Alle Daten löschen</button></div>
      <p class="muted">Empfehlung: wöchentlich ein Backup herunterladen.</p></section></div>`.s;
  el.querySelector('[data-widgetcopy]').onclick = async () => {
    const laden = () => fetch('widget/keuerleber-widget.js', { cache: 'no-store' }).then(r => r.text());
    try {
      // Safari erlaubt das Kopieren nur direkt im Tipp → Inhalt als Promise übergeben
      if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/plain': laden().then(t => new Blob([t], { type: 'text/plain' })) })]);
      else await navigator.clipboard.writeText(await laden());
      toast('✓ Skript kopiert – jetzt in Scriptable einfügen');
    }
    catch { toast('Kopieren ging nicht – „Skript ansehen“ öffnen und alles kopieren', 'err'); }
  };
  el.querySelector('#fs').onsubmit = async e => { e.preventDefault(); await db.saveSettings({ ...s, ...collect(e.target) }); toast('Gespeichert'); };
  const wmsg = t => { MSG.w = t; const m = document.querySelector('#wmsg'); if (m) m.textContent = t; };
  el.querySelector('#fw').onsubmit = async e => { e.preventDefault(); const t = e.target.githubToken.value.trim(); if (t) await db.saveSettings({ ...db.settings(), githubToken: t });
    try { wmsg('Teste …'); wmsg('✓ Verbunden mit ' + await W.testToken() + ' – Veröffentlichen ist bereit.'); } catch (x) { wmsg('✗ ' + x.message); } };
  const kmsg = t => { MSG.k = t; const m = document.querySelector('#kmsg'); if (m) m.textContent = t; };
  el.querySelector('#fk').onsubmit = async e => { e.preventDefault(); const t = e.target.anthropicKey.value.trim(); if (t) await db.saveSettings({ ...db.settings(), anthropicKey: t });
    try { kmsg('Teste …'); await KI.testKey(); kmsg('✓ KI verbunden – Belege können jetzt unter Finanzen hochgeladen werden.'); } catch (x) { kmsg('✗ ' + x.message); } };
  el.querySelector('[data-kdel]')?.addEventListener('click', async () => { const { anthropicKey, ...rest } = db.settings(); await db.saveSettings(rest); toast('KI-Schlüssel entfernt'); });
  el.querySelector('[data-wdel]')?.addEventListener('click', async () => { const { githubToken, ...rest } = db.settings(); await db.saveSettings(rest); toast('Schlüssel entfernt'); });
  el.querySelector('#fc').onsubmit = e => { e.preventDefault(); const v = collect(e.target); db.setCfg({ url: v.url.replace(/\/+$/, ''), key: v.key }); location.reload(); };
  el.querySelector('[data-off]')?.addEventListener('click', () => { db.setCfg({ off: true }); location.reload(); });
  const zmsg = (t, okk) => { MSG.z = t; const m = document.querySelector('#zmsg'); if (m) { m.textContent = t; m.style.color = okk ? 'var(--ok)' : ''; } };
  if (db.isCloud()) {
    db.userEmail().then(m => { const b = el.querySelector('#myemail'); if (b) b.textContent = m || '–'; });
    el.querySelector('#idle').onchange = async e => { await db.saveSettings({ ...db.settings(), autoLogoutMin: Number(e.target.value) }); toast('Gespeichert'); };
    el.querySelector('[data-logoutall]').onclick = async () => { if (await confirmDlg('Auf allen Geräten (Handy, Mac, Browser) abmelden? Danach musst du dich überall neu anmelden – auch der Mail-Abgleich auf dem Mac (dort im Ordner crm-mailsync „Einrichten“ starten).')) db.logoutAll(); };
    mfaBox(el);
    el.querySelector('#fpw').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      if (f.pw1.value.length < 8) return zmsg('Das Passwort braucht mindestens 8 Zeichen.');
      if (f.pw1.value !== f.pw2.value) return zmsg('Die beiden Passwörter stimmen nicht überein.');
      try { await db.setPassword(f.pw1.value); f.reset(); zmsg('✓ Neues Passwort gespeichert – ab jetzt damit anmelden.', 1); } catch (x) { zmsg('✗ ' + (/different from the old/i.test(x.message) ? 'Das neue Passwort muss sich vom alten unterscheiden.' : /weak|short/i.test(x.message) ? 'Passwort zu schwach – bitte länger oder mit Zahlen/Zeichen.' : x.message)); }
    };
    el.querySelector('#fem').onsubmit = async e => {
      e.preventDefault(); const em = e.target.email.value.trim();
      try { await db.setEmail(em); e.target.reset(); zmsg(`✓ Bestätigungs-Mail an ${em} gesendet (je nach Einstellung auch an die alte Adresse). Erst nach Klick auf den Link gilt die neue Login-E-Mail.`, 1); } catch (x) { zmsg('✗ ' + x.message); }
    };
  }
  el.querySelector('[data-logout]')?.addEventListener('click', () => db.logout());
  el.querySelector('[data-bk]').onclick = () => download(`crm-backup-${today()}.json`, db.exportAll(), 'application/json');
  el.querySelector('[data-rs]').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (!await confirmDlg('Backup einspielen? Vorhandene Einträge mit gleicher ID werden überschrieben.')) return; try { await db.importAll(await f.text()); toast('Backup eingespielt'); } catch (x) { toast('Fehler: ' + x.message, 'err'); } };
  el.querySelector('[data-up]').onclick = async () => { if (!db.isCloud()) return toast('Zuerst Cloud verbinden', 'err'); if (!await confirmDlg('Lokal gespeicherte Daten in die Cloud kopieren?')) return; toast((await db.uploadLocalToCloud()) + ' Einträge hochgeladen'); await db.reload(); };
  el.querySelector('[data-seed]').onclick = async () => { if (await confirmDlg('Beispieldaten hinzufügen (Demo-Kontakte, -Objekte, -Vorgänge)?')) { await seed(); toast('Beispieldaten geladen'); } };
  el.querySelector('[data-wipe]').onclick = async () => { if (await confirmDlg('ALLE Daten unwiderruflich löschen?') && await confirmDlg('Wirklich sicher? Vorher ein Backup herunterladen!')) { await db.wipeAll(); toast('Alle Daten gelöscht'); } };
}

const MFA_SQL = `drop policy if exists "eigene Daten" on public.records;
create policy "eigene Daten" on public.records for all to authenticated
  using (user_id = auth.uid() and (select auth.jwt()->>'aal') = 'aal2')
  with check (user_id = auth.uid() and (select auth.jwt()->>'aal') = 'aal2');`;
// 2FA: Authenticator-App (z. B. Google Authenticator, Microsoft Authenticator, Apple Passwörter) koppeln
async function mfaBox(el) {
  const box = el.querySelector('#mfabox'); if (!box) return;
  let f = [];
  try { f = await db.mfaFactors(); } catch (e) { box.textContent = '2FA nicht verfügbar: ' + e.message; return; }
  if (f.length) {
    box.innerHTML = html`<p class="ok">✓ Aktiv – bei jeder Anmeldung wird zusätzlich der Code aus deiner Authenticator-App abgefragt.</p>
      <details style="margin-top:10px"><summary>📱 Geräte 90 Tage merken ${db.geraetGemerkt() ? '(dieses Gerät ist gemerkt)' : ''}</summary>
        <p class="muted small" style="margin:8px 0">Auf einem gemerkten Gerät entfällt der Code 90 Tage lang. Das Passwort wird weiter abgefragt. Der Server-Teil (einmalig im Supabase-SQL-Editor ausführen) ersetzt außerdem den Server-Schutz unten, du brauchst also nur dieses SQL:</p>
        <pre class="sqlbox">${db.GERAET_SQL}</pre>
        <div class="actions"><button type="button" class="btn" data-geraetsql>SQL kopieren</button><a class="btn" target="_blank" rel="noopener" href="${db.SQL_URL()}">SQL-Editor öffnen</a><button type="button" class="btn ghost" data-geraetweg>Alle gemerkten Geräte vergessen</button></div></details>
      <details style="margin-top:10px"><summary>🛡 Letzter Schritt: 2FA auch auf dem Server erzwingen (empfohlen)</summary>
        <p class="muted small" style="margin:8px 0">Dann gibt die Datenbank selbst ohne 2FA-Code keine einzige Zeile heraus – auch nicht, wenn jemand dein Passwort hätte und das CRM umgeht. Einmal im Supabase-SQL-Editor ausführen:</p>
        <pre class="sqlbox">${MFA_SQL}</pre>
        <div class="actions"><button type="button" class="btn" data-sqlcopy>SQL kopieren</button><a class="btn" target="_blank" rel="noopener" href="${db.SQL_URL()}">SQL-Editor öffnen</a></div>
        <p class="muted small" style="margin-top:6px">Läuft der Mail-Abgleich auf dem Mac: danach dort einmal „Einrichten“ starten (fragt den Code ab).</p></details>
      <div class="actions" style="margin-top:8px"><button type="button" class="btn ghost" data-mfaoff>2FA entfernen</button></div>`.s;
    box.querySelector('[data-geraetsql]').onclick = async () => { await navigator.clipboard.writeText(db.GERAET_SQL); toast('SQL kopiert'); };
    box.querySelector('[data-geraetweg]').onclick = async () => { try { await db.geraeteVergessen(); toast('Alle Geräte vergessen – nächste Anmeldung fragt wieder den Code'); } catch (e) { toast('Nicht möglich: ' + e.message, 'err'); } };
    box.querySelector('[data-sqlcopy]').onclick = async () => { await navigator.clipboard.writeText(MFA_SQL); toast('SQL kopiert'); };
    box.querySelector('[data-mfaoff]').onclick = async () => { if (!await confirmDlg('2FA wirklich entfernen? Dann reicht wieder allein das Passwort. Hast du den Server-Schutz aktiviert, musst du ihn vorher im SQL-Editor zurücknehmen – sonst sperrst du dich aus.')) return; try { await db.mfaRemove(f[0].id); toast('2FA entfernt'); mfaBox(el); } catch (x) { toast(x.message, 'err'); } };
    return;
  }
  box.innerHTML = html`<p>Noch nicht aktiv. Mit 2FA kommt niemand in dein CRM, selbst wenn er dein Passwort kennt – zusätzlich wird ein Code aus der Authenticator-App auf deinem Handy verlangt.</p>
    <div class="actions" style="margin-top:8px"><button type="button" class="btn primary" data-mfaon>2FA jetzt einrichten</button></div>`.s;
  box.querySelector('[data-mfaon]').onclick = async () => {
    let d; try { d = await db.mfaEnroll(); } catch (x) { toast('2FA konnte nicht gestartet werden: ' + x.message, 'err'); return; }
    modal('🔐 Zwei-Faktor-Anmeldung einrichten', html`<div class="full mfasetup">
      <ol class="steps"><li>Öffne auf deinem Handy eine Authenticator-App (z. B. <b>Google Authenticator</b>, <b>Microsoft Authenticator</b> oder am iPhone <b>Passwörter → Codes</b>).</li>
      <li>Scanne diesen QR-Code – oder tippe den Schlüssel ein.</li><li>Gib den 6-stelligen Code ein, den die App anzeigt.</li></ol>
      <div class="mfaqr"><img alt="QR-Code für die Authenticator-App" src="${d.totp.qr_code}"></div>
      <p class="muted small">Schlüssel zum Eintippen: <code class="mfasecret">${d.totp.secret}</code></p></div>
      <label class="f full"><span>6-stelliger Code aus der App</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123 456" required></label>`, {
      saveLabel: 'Bestätigen & aktivieren',
      onSave: async v => { try { await db.mfaConfirm(d.id, v.code); toast('✓ 2FA ist aktiv'); mfaBox(el); } catch (x) { toast(x.message, 'err'); return false; } },
    });
  };
}
