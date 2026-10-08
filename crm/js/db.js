// Datenschicht: lokal (localStorage) oder Cloud (Supabase). Gleiche API für beide.
import { uid, today, toast } from './util.js';
export const COLS = ['contacts', 'properties', 'deals', 'tasks', 'events', 'activities', 'templates', 'settings'];
const LS = 'kre-crm-data', CFG = 'kre-crm-cfg';
const SB_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
let data = Object.fromEntries(COLS.map(c => [c, []]));
let sb = null, cloud = false;
const listeners = new Set();

// Standard-Verbindung (anon-Key ist öffentlich vorgesehen; Schutz via Login + RLS)
const DEFAULT_CFG = { url: 'https://silkguwwkfwoqdfisfky.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbGtndXd3a2Z3b3FkZmlzZmt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODQyNDQsImV4cCI6MjEwNzA2MDI0NH0.zetUJKtz6w4za2-M1yaEYPenE84ML0sPUXFS3DLaABA' };
export const cfg = () => { try { const c = JSON.parse(localStorage.getItem(CFG)) || {}; if (c.off) return {}; return c.url ? c : DEFAULT_CFG; } catch { return DEFAULT_CFG; } };
export const setCfg = c => localStorage.setItem(CFG, JSON.stringify(c));
export const isCloud = () => cloud;
export const onChange = f => { listeners.add(f); return () => listeners.delete(f); };
const emit = () => listeners.forEach(f => f());

function loadLocal() {
  try { const d = JSON.parse(localStorage.getItem(LS)); if (d) COLS.forEach(c => data[c] = d[c] || []); } catch { /* leer */ }
}
function saveLocal() {
  try { localStorage.setItem(LS, JSON.stringify(data)); }
  catch { toast('Speicher voll – bitte Backup exportieren', 'err'); }
}

export async function init() {
  const c = cfg();
  if (c.url && c.key) {
    try {
      const { createClient } = await import(SB_CDN);
      sb = createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data: s } = await sb.auth.getSession();
      cloud = true;
      if (!s.session) return { needsLogin: true };
      await loadCloud();
      return { ok: true };
    } catch (e) {
      console.error(e); cloud = false; sb = null;
      toast('Cloud nicht erreichbar – lokaler Modus', 'err');
    }
  }
  loadLocal(); await ensureDefaults(); return { ok: true };
}
export async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await loadCloud();
}
export async function signup(email, password) {
  const { data: d, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  if (!d.session) return 'confirm';
  await loadCloud(); return 'ok';
}
export const SETUP_SQL = `create table if not exists public.records (
  id text primary key,
  collection text not null,
  data jsonb not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index if not exists records_user_col on public.records (user_id, collection);
alter table public.records enable row level security;
drop policy if exists "eigene Daten" on public.records;
create policy "eigene Daten" on public.records for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());`;
export const SQL_URL = () => { const m = (cfg().url || '').match(/https:\/\/([^.]+)\.supabase\.co/); return m ? `https://supabase.com/dashboard/project/${m[1]}/sql/new` : 'https://supabase.com/dashboard'; };
export async function logout() { if (sb) await sb.auth.signOut(); location.reload(); }
export const userEmail = async () => sb ? (await sb.auth.getUser()).data.user?.email : null;

async function loadCloud() {
  COLS.forEach(c => data[c] = []);
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await sb.from('records').select('collection,data').range(from, from + 999);
    if (error) throw error;
    rows.forEach(r => (data[r.collection] ||= []).push(r.data));
    if (rows.length < 1000) break;
  }
  await ensureDefaults();
}
export async function reload() { if (cloud) { await loadCloud(); emit(); } }

async function persist(col, rec) {
  if (!cloud) return saveLocal();
  const { error } = await sb.from('records').upsert({ id: rec.id, collection: col, data: rec, updated_at: new Date().toISOString() });
  if (error) { toast('Speichern fehlgeschlagen: ' + error.message, 'err'); throw error; }
}
async function unpersist(col, id) {
  if (!cloud) return saveLocal();
  const { error } = await sb.from('records').delete().eq('id', id);
  if (error) { toast('Löschen fehlgeschlagen: ' + error.message, 'err'); throw error; }
}

export const all = col => data[col];
export const get = (col, id) => data[col].find(r => r.id === id);
export async function save(col, rec) {
  const now = new Date().toISOString();
  if (!rec.id) { rec.id = uid(); rec.created = now; data[col].push(rec); }
  else if (!data[col].includes(rec)) { const i = data[col].findIndex(r => r.id === rec.id); if (i >= 0) data[col][i] = rec; else data[col].push(rec); }
  rec.updated = now;
  await persist(col, rec); emit(); return rec;
}
export async function del(col, id) {
  data[col] = data[col].filter(r => r.id !== id);
  await unpersist(col, id); emit();
}
export function nextNr(prefix, col, field = 'nr') {
  const n = data[col].reduce((m, r) => Math.max(m, parseInt((r[field] || '').replace(/\D/g, '')) || 0), 0) + 1;
  return prefix + String(n).padStart(4, '0');
}
export async function log(art, text, refs = {}) {
  return save('activities', { art, text, datum: new Date().toISOString(), ...refs });
}

// ---------- Einstellungen & Standardvorlagen ----------
export const DEFAULT_SETTINGS = { id: 'main', firma: 'Keuerleber Immobilien', inhaber: 'Paul Keuerleber', strasse: '', plz: '95145', ort: 'Oberkotzau', tel: '', email: '', web: 'www.keuerleber-real-estate.de', provKaeufer: 3.57, provVerkaeufer: 3.57, bundesland: 'Bayern', nachfassTage: 60 };
export const settings = () => data.settings[0] || DEFAULT_SETTINGS;
export const saveSettings = s => save('settings', { ...s, id: 'main' });

const TPL = [
  ['Besichtigungseinladung', 'Interessent', 'Besichtigungstermin: {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nvielen Dank für Ihr Interesse an der Immobilie „{{objekt.titel}}“ ({{objekt.adresse}}).\n\nGerne lade ich Sie zu einer Besichtigung ein. Mein Terminvorschlag: {{datum}}.\nBitte geben Sie mir kurz Bescheid, ob der Termin für Sie passt.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Nachfassen nach Besichtigung', 'Interessent', 'Ihr Eindruck von {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nvielen Dank für Ihr Kommen zur Besichtigung von „{{objekt.titel}}“. Wie haben Sie die Immobilie empfunden? Gerne beantworte ich offene Fragen oder vereinbare einen zweiten Termin.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Absage an Interessenten', 'Interessent', 'Ihre Anfrage zu {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nleider muss ich Ihnen mitteilen, dass die Immobilie „{{objekt.titel}}“ inzwischen vergeben ist. Ich nehme Sie gerne in meinen Interessentenkreis auf und melde mich, sobald ein passendes Objekt verfügbar ist.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}'],
  ['Erstansprache Eigentümer', 'Akquise', 'Ihre Immobilie in {{ort}}', 'Guten Tag {{anrede_name}},\n\nich bin als Immobilienmakler in der Region {{firma_ort}} tätig und werde regelmäßig nach Objekten wie Ihrem in {{ort}} gefragt. Gerne ermittle ich Ihnen kostenlos und unverbindlich den aktuellen Marktwert.\n\nDarf ich Sie hierzu in den nächsten Tagen kurz anrufen?\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Nachfassen Maklerauftrag', 'Akquise', 'Unser Gespräch zu {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nvielen Dank für das persönliche Gespräch. Wie besprochen sende ich Ihnen anbei das Angebot zur Vermarktung Ihrer Immobilie. Bei Fragen erreichen Sie mich jederzeit.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Terminbestätigung', 'Allgemein', 'Terminbestätigung {{datum}}', 'Guten Tag {{anrede_name}},\n\nhiermit bestätige ich unseren Termin am {{datum}}.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Geburtstagsgruß', 'Allgemein', 'Alles Gute zum Geburtstag!', 'Liebe/r {{anrede_name}},\n\nzum Geburtstag wünsche ich Ihnen alles Gute, Gesundheit und viel Freude!\n\nHerzliche Grüße\n{{absender}}\n{{firma}}'],
];
async function ensureDefaults() {
  if (!data.settings.length) { data.settings.push({ ...DEFAULT_SETTINGS }); if (!cloud) saveLocal(); else await persist('settings', data.settings[0]); }
  if (!data.templates.length && !localStorage.getItem('kre-crm-tpl-seeded')) {
    localStorage.setItem('kre-crm-tpl-seeded', '1');
    for (const [name, kategorie, betreff, text] of TPL) { const r = { id: uid(), name, kategorie, betreff, text, created: new Date().toISOString() }; data.templates.push(r); if (cloud) await persist('templates', r); }
    if (!cloud) saveLocal();
  }
}

// ---------- Backup ----------
export const exportAll = () => JSON.stringify({ version: 1, exported: new Date().toISOString(), data }, null, 2);
export async function importAll(json, { replace = false } = {}) {
  const d = JSON.parse(json).data; if (!d) throw new Error('Ungültiges Backup');
  for (const c of COLS) {
    if (replace) { for (const r of [...data[c]]) await unpersist(c, r.id); data[c] = []; }
    for (const r of d[c] || []) { const i = data[c].findIndex(x => x.id === r.id); if (i >= 0) data[c][i] = r; else data[c].push(r); await persist(c, r); }
  }
  if (!cloud) saveLocal(); emit();
}
export async function uploadLocalToCloud() {
  const d = JSON.parse(localStorage.getItem(LS) || '{}'); let n = 0;
  for (const c of COLS) for (const r of d[c] || []) { await persist(c, r); n++; }
  return n;
}
export async function wipeAll() { for (const c of COLS) for (const r of [...data[c]]) await unpersist(c, r.id); COLS.forEach(c => data[c] = []); if (!cloud) saveLocal(); await ensureDefaults(); emit(); }
