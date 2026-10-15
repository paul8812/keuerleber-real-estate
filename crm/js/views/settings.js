import * as db from '../db.js';
import * as KI from '../ki.js';
const MSG = {};  // Statusmeldungen überleben das Neuzeichnen nach dem Speichern
import { html, raw, inp, sel, chk, collect, toast, download, today, confirmDlg } from '../util.js';
import { BUNDESLAENDER } from '../consts.js';
import { seed } from '../seed.js';
import * as W from '../website.js';

export function render(el) {
  const s = db.settings(), c = db.cfg();
  el.innerHTML = html`<div class="head"><h1>Einstellungen</h1></div><div class="cols">
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
  el.querySelector('[data-logout]')?.addEventListener('click', () => db.logout());
  el.querySelector('[data-bk]').onclick = () => download(`crm-backup-${today()}.json`, db.exportAll(), 'application/json');
  el.querySelector('[data-rs]').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (!await confirmDlg('Backup einspielen? Vorhandene Einträge mit gleicher ID werden überschrieben.')) return; try { await db.importAll(await f.text()); toast('Backup eingespielt'); } catch (x) { toast('Fehler: ' + x.message, 'err'); } };
  el.querySelector('[data-up]').onclick = async () => { if (!db.isCloud()) return toast('Zuerst Cloud verbinden', 'err'); if (!await confirmDlg('Lokal gespeicherte Daten in die Cloud kopieren?')) return; toast((await db.uploadLocalToCloud()) + ' Einträge hochgeladen'); await db.reload(); };
  el.querySelector('[data-seed]').onclick = async () => { if (await confirmDlg('Beispieldaten hinzufügen (Demo-Kontakte, -Objekte, -Vorgänge)?')) { await seed(); toast('Beispieldaten geladen'); } };
  el.querySelector('[data-wipe]').onclick = async () => { if (await confirmDlg('ALLE Daten unwiderruflich löschen?') && await confirmDlg('Wirklich sicher? Vorher ein Backup herunterladen!')) { await db.wipeAll(); toast('Alle Daten gelöscht'); } };
}
