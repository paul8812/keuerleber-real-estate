// Keuerleber CRM – Widget für den iPhone-Home-Bildschirm (App „Scriptable“)
// Zeigt: fällige Aufgaben, Termine, neue Anfragen, offene Vorgänge. Tippen öffnet das CRM.
// Sicherheit: Dein Passwort wird NICHT gespeichert. Nach der einmaligen Anmeldung liegt nur ein
// Sitzungs-Schlüssel im iOS-Schlüsselbund. „Auf allen Geräten abmelden“ im CRM sperrt auch das Widget.
const URL_ = 'https://silkguwwkfwoqdfisfky.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbGtndXd3a2Z3b3FkZmlzZmt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODQyNDQsImV4cCI6MjEwNzA2MDI0NH0.zetUJKtz6w4za2-M1yaEYPenE84ML0sPUXFS3DLaABA';
const CRM = 'https://keuerleber-immobilien.de/crm/#/dashboard';
const KC = 'keuerleber-crm-widget';
const GOLD = new Color('#c9a96e'), TXT = new Color('#f2efe9'), MUT = new Color('#9a968f'), BG = new Color('#0b0b0c'), ROT = new Color('#e06a5a');

async function api(path, { method = 'GET', body, token } = {}) {
  const r = new Request(URL_ + path); r.method = method;
  r.headers = { apikey: KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || KEY) };
  if (body) r.body = JSON.stringify(body);
  const j = await r.loadJSON().catch(() => null);
  const st = r.response && r.response.statusCode;
  if (st >= 400 || !j) throw new Error((j && (j.msg || j.error_description || j.message)) || 'Fehler ' + st);
  return j;
}
function speichern(s) { Keychain.set(KC, JSON.stringify({ refresh: s.refresh_token })); }
async function sitzung() {
  if (!Keychain.contains(KC)) return null;
  const { refresh } = JSON.parse(Keychain.get(KC));
  const s = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refresh } });
  speichern(s); return s.access_token;
}
async function eingabe(titel, text, felder) {
  const a = new Alert(); a.title = titel; a.message = text;
  felder.forEach(([ph, geheim]) => geheim ? a.addSecureTextField(ph) : a.addTextField(ph));
  a.addAction('Weiter'); a.addCancelAction('Abbrechen');
  if ((await a.presentAlert()) === -1) return null;
  return felder.map((_, i) => a.textFieldValue(i).trim());
}
async function anmelden() {
  const e = await eingabe('Keuerleber CRM', 'Einmal mit deinen CRM-Zugangsdaten anmelden. Das Passwort wird nicht gespeichert.', [['E-Mail', false], ['Passwort', true]]);
  if (!e) return false;
  let s = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: e[0], password: e[1] } });
  const f = ((s.user && s.user.factors) || []).find(x => x.status === 'verified');
  if (f) {   // Zwei-Faktor aktiv → Code aus der Authenticator-App
    const c = await eingabe('Bestätigungscode', '6-stelliger Code aus deiner Authenticator-App', [['123456', false]]);
    if (!c) return false;
    const ch = await api(`/auth/v1/factors/${f.id}/challenge`, { method: 'POST', token: s.access_token, body: {} });
    s = await api(`/auth/v1/factors/${f.id}/verify`, { method: 'POST', token: s.access_token, body: { challenge_id: ch.id, code: c[0] } });
  }
  speichern(s); return true;
}

const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
async function daten(token) {
  const heute = iso(new Date()), in7 = iso(new Date(Date.now() + 7 * 864e5));
  const q = p => api('/rest/v1/records?select=data&' + p.replace(/>/g, '%3E'), { token }).then(r => r.map(x => x.data));
  const [tasks, events, deals] = await Promise.all([
    q('collection=eq.tasks&or=(data->>done.is.null,data->>done.eq.false)'),
    q(`collection=eq.events&and=(data->>datum.gte.${heute},data->>datum.lte.${in7})`),
    q('collection=eq.deals'),
  ]);
  const faellig = tasks.filter(t => t.faellig && t.faellig <= heute).sort((a, b) => ((b.prio === 'hoch') - (a.prio === 'hoch')) || a.faellig.localeCompare(b.faellig));
  const termine = events.sort((a, b) => (a.datum + (a.start || '')).localeCompare(b.datum + (b.start || '')));
  const ende = { akquise: ['Auftrag erhalten', 'Verloren'], vertrieb: ['Abgeschlossen', 'Absage'] };
  return {
    heute, faellig, ueber: faellig.filter(t => t.faellig < heute).length,
    termineHeute: termine.filter(e => e.datum === heute), naechster: termine.find(e => e.datum > heute || (e.datum === heute && (e.start || '24') >= new Date().toTimeString().slice(0, 5))),
    neu: tasks.filter(t => /^ni:/.test(t.auto || '')).length,
    offen: deals.filter(d => ende[d.board] && !ende[d.board].includes(d.stage)).length,
  };
}

function zahl(st, wert, label, farbe) {
  const s = st.addStack(); s.layoutVertically();
  const v = s.addText(String(wert)); v.font = Font.boldRoundedSystemFont(22); v.textColor = farbe || TXT;
  const l = s.addText(label); l.font = Font.systemFont(10); l.textColor = MUT; l.lineLimit = 1;
}
const kurz = t => (t || '').replace(/^⚡ /, '');
const wtag = (d, h) => d === h ? 'Heute' : ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(d + 'T12:00:00').getDay()];

function widget(D, fam) {
  const w = new ListWidget(); w.backgroundColor = BG; w.url = CRM; w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
  if (fam === 'accessoryRectangular' || fam === 'accessoryInline') {
    const t = w.addText(`✓ ${D.faellig.length} fällig · ▦ ${D.termineHeute.length} heute${D.neu ? ' · ⚡ ' + D.neu : ''}`); t.font = Font.semiboldSystemFont(12);
    if (fam === 'accessoryRectangular' && D.naechster) { const n = w.addText(`${D.naechster.start || ''} ${D.naechster.titel}`); n.font = Font.systemFont(11); n.lineLimit = 2; }
    return w;
  }
  w.setPadding(14, 14, 14, 14);
  const k = w.addText('KEUERLEBER CRM'); k.font = Font.semiboldSystemFont(10); k.textColor = GOLD;
  w.addSpacer(8);
  if (fam === 'small') {
    zahl(w, D.faellig.length, D.ueber ? `Aufgaben · ${D.ueber} überfällig` : 'Aufgaben fällig', D.ueber ? ROT : TXT); w.addSpacer(6);
    zahl(w, D.termineHeute.length, 'Termine heute'); w.addSpacer(6);
    zahl(w, D.neu, 'neue Anfragen', D.neu ? GOLD : TXT);
    return w;
  }
  const row = w.addStack(); row.spacing = 14;
  zahl(row, D.faellig.length, D.ueber ? `fällig · ${D.ueber} überf.` : 'fällig', D.ueber ? ROT : TXT);
  zahl(row, D.termineHeute.length, 'Termine heute'); zahl(row, D.neu, 'neue Anfragen', D.neu ? GOLD : TXT); zahl(row, D.offen, 'Vorgänge');
  w.addSpacer(10);
  if (D.naechster) {
    const n = w.addText(`▦ ${wtag(D.naechster.datum, D.heute)} ${D.naechster.start || ''} · ${D.naechster.titel}`); n.font = Font.mediumSystemFont(12); n.textColor = TXT; n.lineLimit = 1;
  } else { const n = w.addText('Keine Termine in den nächsten 7 Tagen'); n.font = Font.systemFont(12); n.textColor = MUT; }
  const anzahl = fam === 'large' ? 8 : 2;
  if (fam === 'large') { w.addSpacer(10); const h = w.addText('FOKUS HEUTE'); h.font = Font.semiboldSystemFont(10); h.textColor = GOLD; }
  w.addSpacer(4);
  D.faellig.slice(0, anzahl).forEach(t => { const x = w.addText(`${t.faellig < D.heute ? '⏰' : '✓'} ${kurz(t.titel)}`); x.font = Font.systemFont(12); x.textColor = t.faellig < D.heute ? ROT : TXT; x.lineLimit = 1; w.addSpacer(2); });
  if (!D.faellig.length) { const x = w.addText('✨ Alles erledigt'); x.font = Font.systemFont(12); x.textColor = MUT; }
  if (fam === 'large') { w.addSpacer(); const u = w.addText('Stand ' + new Date().toTimeString().slice(0, 5)); u.font = Font.systemFont(9); u.textColor = MUT; }
  return w;
}
function hinweis(text) { const w = new ListWidget(); w.backgroundColor = BG; w.url = 'scriptable:///run/' + encodeURIComponent(Script.name());
  const k = w.addText('KEUERLEBER CRM'); k.font = Font.semiboldSystemFont(10); k.textColor = GOLD; w.addSpacer(6);
  const t = w.addText(text); t.font = Font.systemFont(12); t.textColor = TXT; return w; }

// ---------- Ablauf ----------
let w;
try {
  if (!config.runsInWidget) {
    if (Keychain.contains(KC)) {
      const a = new Alert(); a.title = 'Keuerleber CRM Widget'; a.addAction('Vorschau anzeigen'); a.addAction('Neu anmelden'); a.addDestructiveAction('Abmelden'); a.addCancelAction('Schließen');
      const i = await a.presentSheet();
      if (i === 1) { Keychain.remove(KC); await anmelden(); }
      if (i === 2) { Keychain.remove(KC); }
      if (i === -1) { Script.complete(); return; }
    } else if (!(await anmelden())) { Script.complete(); return; }
  }
  const token = await sitzung();
  w = token ? widget(await daten(token), config.widgetFamily || 'medium') : hinweis('Einmal antippen und anmelden');
} catch (e) {
  if (/refresh|token|JWT|session/i.test(String(e.message))) { try { Keychain.remove(KC); } catch (_) {} }
  w = hinweis('Bitte antippen und neu anmelden\n(' + String(e.message).slice(0, 60) + ')');
}
if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
