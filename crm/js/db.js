// Datenschicht: lokal (localStorage) oder Cloud (Supabase). Gleiche API für beide.
import { uid, today, toast } from './util.js';
export const COLS = ['contacts', 'properties', 'deals', 'tasks', 'events', 'activities', 'templates', 'settings', 'mails', 'sync', 'buchungen', 'rechnungen'];
const LS = 'kre-crm-data', CFG = 'kre-crm-cfg';
// Supabase-Bibliothek liegt im eigenen Repository (kein fremdes CDN zur Laufzeit)
const SB_LIB = new URL('../vendor/supabase.js?v=2.45.4', import.meta.url).href;
async function sbLib() {
  if (window.supabase?.createClient) return window.supabase;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = SB_LIB; s.onload = res; s.onerror = () => rej(new Error('Supabase-Bibliothek konnte nicht geladen werden')); document.head.appendChild(s); });
  return window.supabase;
}
let data = Object.fromEntries(COLS.map(c => [c, []]));
let sb = null, cloud = false;
// Link aus der „Passwort zurücksetzen“-Mail: Supabase hängt #access_token…&type=recovery bzw. #error… an
const H0 = location.hash;
export const RECOVERY = /type=recovery/.test(H0);
export const AUTH_ERROR = /error_code=([^&]+)/.exec(H0)?.[1] || '';
const listeners = new Set();

// Standard-Verbindung (anon-Key ist öffentlich vorgesehen; Schutz via Login + RLS)
const DEFAULT_CFG = { url: 'https://silkguwwkfwoqdfisfky.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbGtndXd3a2Z3b3FkZmlzZmt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODQyNDQsImV4cCI6MjEwNzA2MDI0NH0.zetUJKtz6w4za2-M1yaEYPenE84ML0sPUXFS3DLaABA' };
// ?cloud=1 im Link schaltet ein Gerät, das auf „lokal“ steht, zurück auf die Cloud-Datenbank
try { if (/[?&]cloud=1/.test(location.search)) { const c = JSON.parse(localStorage.getItem(CFG) || '{}'); if (c.off) localStorage.removeItem(CFG); history.replaceState(null, '', location.pathname + location.hash); } } catch { /* egal */ }
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
      const { createClient } = await sbLib();
      sb = createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data: s } = await sb.auth.getSession();
      cloud = true;
      if (!s.session) return { needsLogin: true };
      if (await needsMfa()) return { needsLogin: true, needsMfa: true };
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
  if (await needsMfa()) return 'mfa';
  await loadCloud(); return 'ok';
}
// ---------- Zwei-Faktor-Anmeldung (TOTP, Authenticator-App) ----------
export async function needsMfa() { const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); return !!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'; }
export const mfaFactors = async () => ((await sb.auth.mfa.listFactors()).data?.totp || []).filter(f => f.status === 'verified');
export async function mfaLogin(code) {
  const f = (await mfaFactors())[0]; if (!f) throw new Error('Keine Zwei-Faktor-App eingerichtet');
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: String(code).replace(/\D/g, '') });
  if (error) throw new Error(/invalid|expired/i.test(error.message) ? 'Code falsch oder abgelaufen – bitte den aktuellen Code eingeben.' : error.message);
  await loadCloud();
}
export async function mfaEnroll() {
  for (const f of ((await sb.auth.mfa.listFactors()).data?.all || []).filter(f => f.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Keuerleber CRM ' + new Date().toISOString().slice(0, 16) });
  if (error) throw error; return data;
}
export async function mfaConfirm(factorId, code) { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: String(code).replace(/\D/g, '') }); if (error) throw new Error(/invalid|expired/i.test(error.message) ? 'Code falsch – bitte den aktuellen 6-stelligen Code eingeben.' : error.message); }
export async function mfaRemove(factorId) { const { error } = await sb.auth.mfa.unenroll({ factorId }); if (error) throw error; }
export async function logoutAll() { if (sb) await sb.auth.signOut({ scope: 'global' }); location.reload(); }
export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}
export async function setPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}
export async function setEmail(email) {
  const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: location.origin + location.pathname });
  if (error) throw error;
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
// Website-Anfragen: Formulare der Website schreiben (nur einfügen!) in diese Tabelle, das CRM holt sie ab und löscht sie danach.
export const ANFRAGEN_SQL = `create table if not exists public.website_anfragen (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quelle text,
  betreff text,
  daten jsonb not null
);
alter table public.website_anfragen enable row level security;
drop policy if exists "Website darf senden" on public.website_anfragen;
create policy "Website darf senden" on public.website_anfragen for insert to anon
  with check (pg_column_size(daten) < 12000);
drop policy if exists "Inhaber verwaltet" on public.website_anfragen;
create policy "Inhaber verwaltet" on public.website_anfragen for all to authenticated
  using (exists (select 1 from public.records r where r.user_id = auth.uid()))
  with check (exists (select 1 from public.records r where r.user_id = auth.uid()));
grant insert on public.website_anfragen to anon;
grant select, insert, update, delete on public.website_anfragen to authenticated;`;
export const client = () => sb;
// Sofort-Benachrichtigung (Telegram) und Sofort-Antwort (E-Mail über Resend): laufen als Datenbank-Trigger in Supabase (pg_net),
// ohne eigenen Server. Zugangsdaten liegen in privat.sofort (nicht über die API erreichbar, keine Rechte für anon/authenticated).
// Das CRM setzt sie nur über sofort_setzen(); sofort_status() verrät nie die Werte selbst. Dieses SQL enthält keine Geheimnisse.
export const SOFORT_SQL = `create extension if not exists pg_net with schema extensions;
create schema if not exists privat;
revoke all on schema privat from public, anon, authenticated;
create table if not exists privat.sofort (
  id int primary key default 1 check (id = 1),
  tg_token text, tg_chat text, rs_key text, rs_from text,
  geaendert timestamptz not null default now()
);
insert into privat.sofort (id) values (1) on conflict (id) do nothing;
revoke all on privat.sofort from public, anon, authenticated;

create or replace function public.sofort_status() returns jsonb language sql stable security definer set search_path = public, privat as $$
  select case when auth.uid() is not null and exists (select 1 from public.records r where r.user_id = auth.uid()) then
    (select jsonb_build_object('telegram', s.tg_token is not null and s.tg_chat is not null, 'antwort', s.rs_key is not null, 'absender', s.rs_from, 'geaendert', s.geaendert) from privat.sofort s where s.id = 1)
  end
$$;
create or replace function public.sofort_setzen(p jsonb) returns jsonb language plpgsql security definer set search_path = public, privat as $$
begin
  if auth.uid() is null or not exists (select 1 from public.records r where r.user_id = auth.uid()) then raise exception 'nicht berechtigt'; end if;
  update privat.sofort set
    tg_token = case when p ? 'tg_token' then nullif(trim(p->>'tg_token'), '') else tg_token end,
    tg_chat = case when p ? 'tg_chat' then nullif(trim(p->>'tg_chat'), '') else tg_chat end,
    rs_key = case when p ? 'rs_key' then nullif(trim(p->>'rs_key'), '') else rs_key end,
    rs_from = case when p ? 'rs_from' then nullif(trim(p->>'rs_from'), '') else rs_from end,
    geaendert = now()
  where id = 1;
  return public.sofort_status();
end $$;
revoke all on function public.sofort_status() from public, anon;
revoke all on function public.sofort_setzen(jsonb) from public, anon;
grant execute on function public.sofort_status() to authenticated;
grant execute on function public.sofort_setzen(jsonb) to authenticated;

create or replace function public.notify_anfrage() returns trigger language plpgsql security definer set search_path = public, privat, extensions as $$
declare d jsonb := new.daten; txt text; c privat.sofort;
  -- Feldnamen je Formular: Renditerechner schickt Name/Email, Kontakt zusätzlich „Anfrage von“/„E-Mail“, leere Telefone als „—“
  nm text := coalesce(nullif(trim(d->>'name'), ''), nullif(trim(d->>'Name'), ''), nullif(trim(d->>'Anfrage von'), ''), '');
  tel text := coalesce(nullif(nullif(trim(d->>'Telefon'), '—'), ''), nullif(trim(d->>'tel'), ''), nullif(trim(d->>'phone'), ''), '');
  mail text := coalesce(nullif(trim(d->>'email'), ''), nullif(trim(d->>'E-Mail'), ''), nullif(trim(d->>'Email'), ''), '');
  obj text := coalesce(nullif(trim(d->>'objekt'), ''), nullif(trim(d->>'Objekt'), ''), '');
begin
  select * into c from privat.sofort where id = 1;
  if c.tg_token is null or c.tg_chat is null then return new; end if;
  if (select count(*) from public.website_anfragen where created_at > now() - interval '10 minutes') > 30 then return new; end if;
  txt := '🆕 Neue Website-Anfrage' || E'\n' || coalesce(new.betreff, '') || E'\n\n'
    || case when nm <> '' then '👤 ' || nm || E'\n' else '' end
    || case when tel <> '' then '📞 ' || tel || E'\n' else '' end
    || case when mail <> '' then '✉️ ' || mail || E'\n' else '' end
    || case when coalesce(d->>'Wunschzeit', '') <> '' then '🕒 ' || (d->>'Wunschzeit') || E'\n' else '' end
    || case when obj <> '' then '🏠 ' || obj || E'\n' else '' end
    || case when coalesce(trim(d->>'anschrift'), '') <> '' then '📍 ' || trim(d->>'anschrift') || E'\n' else '' end
    || case when coalesce(d->>'Ergebnis', '') <> '' then '📊 ' || (d->>'Ergebnis') || coalesce(' (' || (d->>'Punkte') || ')', '') || E'\n' else '' end
    || coalesce('🔗 ' || coalesce(nullif(d->>'Seite', ''), new.quelle), '');
  perform net.http_post(url := 'https://api.telegram.org/bot' || c.tg_token || '/sendMessage',
    body := jsonb_build_object('chat_id', c.tg_chat, 'text', left(txt, 3500)),
    headers := '{"Content-Type":"application/json"}'::jsonb);
  return new;
exception when others then return new;
end $$;
drop trigger if exists anfrage_telegram on public.website_anfragen;
create trigger anfrage_telegram after insert on public.website_anfragen for each row execute function public.notify_anfrage();

create or replace function public.antwort_anfrage() returns trigger language plpgsql security definer set search_path = public, privat, extensions as $$
declare d jsonb := new.daten; c privat.sofort;
  mail text := trim(coalesce(nullif(trim(d->>'email'), ''), nullif(trim(d->>'E-Mail'), ''), nullif(trim(d->>'Email'), ''), ''));
  nm text := split_part(coalesce(nullif(trim(d->>'name'), ''), nullif(trim(d->>'Name'), ''), ''), ' ', 1);
  leit boolean := coalesce(new.betreff, '') ilike 'Leitfaden%';
begin
  select * into c from privat.sofort where id = 1;
  if c.rs_key is null then return new; end if;
  if mail !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' or length(mail) > 120 or coalesce(new.betreff, '') ilike 'Vorab-Liste%' then return new; end if;
  if (select count(*) from public.website_anfragen where created_at > now() - interval '10 minutes') > 30 then return new; end if;
  perform net.http_post(url := 'https://api.resend.com/emails',
    body := jsonb_build_object('from', coalesce(c.rs_from, 'Paul Keuerleber <paul.keuerleber@keuerleber-immobilien.de>'), 'to', jsonb_build_array(mail), 'reply_to', 'paul.keuerleber@keuerleber-immobilien.de',
      'subject', case when leit then 'Ihr Leitfaden Kapitalanlage' else 'Ihre Anfrage bei Keuerleber Immobilien' end,
      'text', 'Guten Tag' || case when nm <> '' then ' ' || left(nm, 40) else '' end || E',\n\nvielen Dank für Ihre Anfrage. Ich melde mich werktags innerhalb von 24 Stunden persönlich bei Ihnen.\n\n'
        || case when leit then E'Ihren Leitfaden finden Sie hier: https://keuerleber-immobilien.de/leitfaden-kapitalanlage-hof.pdf\n\n' else '' end
        || E'Bis dahin können Sie Ihre Rendite selbst durchrechnen: https://keuerleber-immobilien.de/rendite/\nOder direkt einen Termin wählen: https://keuerleber-immobilien.de/#kontakt\n\nMit freundlichen Grüßen\nPaul Keuerleber\nKeuerleber Immobilien · Hauptstraße 12 · 95145 Oberkotzau\n+49 151 67692176'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || c.rs_key));
  return new;
exception when others then return new;
end $$;
drop trigger if exists anfrage_antwort on public.website_anfragen;
create trigger anfrage_antwort after insert on public.website_anfragen for each row execute function public.antwort_anfrage();`;
export async function sofortStatus() { if (!sb) throw new Error('Keine Cloud-Datenbank verbunden'); const { data, error } = await sb.rpc('sofort_status'); if (error) throw error; return data; }
export async function sofortSetzen(p) { if (!sb) throw new Error('Keine Cloud-Datenbank verbunden'); const { data, error } = await sb.rpc('sofort_setzen', { p }); if (error) throw error; return data; }
export const SQL_URL = () => { const m = (cfg().url || '').match(/https:\/\/([^.]+)\.supabase\.co/); return m ? `https://supabase.com/dashboard/project/${m[1]}/sql/new` : 'https://supabase.com/dashboard'; };
// Nur dieses Gerät abmelden. Ohne scope meldet supabase-js *global* ab und macht damit auch den
// Zugang des Mail-Abgleichs auf dem Mac ungültig (refresh_token_not_found) – das passierte bei jedem Auto-Logout.
export async function logout() { if (sb) await sb.auth.signOut({ scope: 'local' }); location.reload(); }
export const userEmail = async () => sb ? (await sb.auth.getUser()).data.user?.email : null;

async function loadCloud() {
  COLS.forEach(c => data[c] = []);
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await sb.from('records').select('collection,data').neq('collection', 'dateien').range(from, from + 999);
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
// Belegdateien (Fotos/PDFs) – getrennt gespeichert und nur bei Bedarf geladen
export async function putFile(id, dataUrl, meta = {}) {
  const rec = { id, dataUrl, ...meta, created: new Date().toISOString() };
  if (!cloud) { try { localStorage.setItem('kre-crm-file-' + id, JSON.stringify(rec)); } catch { toast('Lokaler Speicher voll – Beleg nur in der Cloud speicherbar', 'err'); } return; }
  const { error } = await sb.from('records').upsert({ id, collection: 'dateien', data: rec, updated_at: rec.created });
  if (error) { toast('Beleg speichern fehlgeschlagen: ' + error.message, 'err'); throw error; }
}
export async function getFile(id) {
  if (!cloud) { try { return JSON.parse(localStorage.getItem('kre-crm-file-' + id)); } catch { return null; } }
  const { data: rows, error } = await sb.from('records').select('data').eq('id', id).limit(1);
  if (error) throw error; return rows[0]?.data || null;
}
export async function delFile(id) {
  if (!cloud) { localStorage.removeItem('kre-crm-file-' + id); return; }
  await sb.from('records').delete().eq('id', id);
}
export async function log(art, text, refs = {}) {
  return save('activities', { art, text, datum: new Date().toISOString(), ...refs });
}

// ---------- Einstellungen & Standardvorlagen ----------
export const DEFAULT_SETTINGS = { id: 'main', firma: 'Keuerleber Immobilien', inhaber: 'Paul Keuerleber', strasse: '', plz: '95145', ort: 'Oberkotzau', tel: '', email: '', web: 'keuerleber-immobilien.de', provKaeufer: 0, provVerkaeufer: 0, verguetung: 8000, tplVersion: 3, bundesland: 'Bayern', nachfassTage: 60 };
export const settings = () => data.settings[0] || DEFAULT_SETTINGS;
export const saveSettings = s => save('settings', { ...s, id: 'main' });

const TPL = [
  ['Besichtigungseinladung', 'Interessent', 'Besichtigungstermin: {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nvielen Dank für Ihr Interesse an der Immobilie „{{objekt.titel}}“ ({{objekt.adresse}}).\n\nGerne lade ich Sie zu einer Besichtigung ein. Mein Terminvorschlag: {{datum}}.\nBitte geben Sie mir kurz Bescheid, ob der Termin für Sie passt.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Nachfassen nach Besichtigung', 'Interessent', 'Ihr Eindruck von {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nvielen Dank für Ihr Kommen zur Besichtigung von „{{objekt.titel}}“. Wie haben Sie die Immobilie empfunden? Gerne beantworte ich offene Fragen oder vereinbare einen zweiten Termin.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Absage an Interessenten', 'Interessent', 'Ihre Anfrage zu {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nleider muss ich Ihnen mitteilen, dass die Immobilie „{{objekt.titel}}“ inzwischen vergeben ist. Ich nehme Sie gerne in meinen Interessentenkreis auf und melde mich, sobald ein passendes Objekt verfügbar ist.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}'],
  ['Exposé & Kurzkalkulation an Anleger', 'Interessent', 'Ihre Kapitalanlage: {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nvielen Dank für Ihr Interesse an „{{objekt.titel}}“. Anbei erhalten Sie Exposé und Kurzkalkulation.\n\nFür Sie als Käufer fällt keine Provision an.\n\nGerne berechne ich Ihnen in einem kurzen Beratungsgespräch Ihren persönlichen Steuervorteil und Ihren monatlichen Aufwand. Passt Ihnen {{datum}}?\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Einladung Beratungsgespräch', 'Interessent', 'Ihr Beratungstermin am {{datum}}', 'Guten Tag {{anrede_name}},\n\nhiermit bestätige ich unser Beratungsgespräch am {{datum}}.\n\nDamit ich Ihre persönliche Berechnung (Steuervorteil, Cashflow, Finanzierung) vorbereiten kann, halten Sie bitte Ihren letzten Steuerbescheid und eine grobe Übersicht Ihres Eigenkapitals bereit.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Finanzierungsunterlagen anfordern', 'Interessent', 'Unterlagen für Ihre Finanzierung – {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nfür die Finanzierungsanfrage zu „{{objekt.titel}}“ benötige ich folgende Unterlagen:\n\n– Personalausweis (Vorder- und Rückseite)\n– die letzten 3 Gehaltsabrechnungen\n– letzter Einkommensteuerbescheid\n– Übersicht Eigenkapital / Bestandsimmobilien und laufende Kredite\n\nSie können mir alles einfach per Mail schicken.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Erstansprache Bauträger / Verkäufer', 'Akquise', 'Vertrieb Ihrer Wohnungen in {{ort}}', 'Guten Tag {{anrede_name}},\n\nich bin auf den Vertrieb von Kapitalanlage-Immobilien spezialisiert und betreue einen festen Kreis von Anlegern in der Region {{firma_ort}}.\n\nGerne würde ich Ihre Einheiten in {{ort}} in meinen Vertrieb aufnehmen. Für Sie entstehen erst Kosten, wenn ich eine Einheit erfolgreich vermittelt habe.\n\nKönnten Sie mir Preisliste, Grundrisse und Exposé zusenden?\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Nachfassen Vertriebsvereinbarung', 'Akquise', 'Vertriebsvereinbarung {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nvielen Dank für das Gespräch. Wie besprochen sende ich Ihnen anbei den Entwurf der Vertriebsvereinbarung für „{{objekt.titel}}“. Sobald sie unterschrieben ist, nehme ich die Einheiten sofort in die Vermarktung an meine Anleger auf.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Reservierung an Verkäufer melden', 'Akquise', 'Reservierung: {{objekt.titel}}', 'Guten Tag {{anrede_name}},\n\nhiermit melde ich die Reservierung der Einheit „{{objekt.titel}}“ ({{objekt.adresse}}) für meinen Kunden [Name Käufer].\n\nBitte senden Sie mir den Kaufvertragsentwurf zu und nennen Sie mir mögliche Notartermine.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['Terminbestätigung', 'Allgemein', 'Terminbestätigung {{datum}}', 'Guten Tag {{anrede_name}},\n\nhiermit bestätige ich unseren Termin am {{datum}}.\n\nMit freundlichen Grüßen\n{{absender}}\n{{firma}}\n{{tel}}'],
  ['WA: Nach der Anfrage', 'WhatsApp', '', 'Hallo {{anrede_name}}, hier ist {{absender}} von {{firma}}. Vielen Dank für Ihre Anfrage{{objekt.titel_zu}}! Wann passt Ihnen ein kurzes Telefonat (ca. 10 Min.)? Exposé und Berechnung schicke ich Ihnen gern vorab.'],
  ['WA: Nicht erreicht', 'WhatsApp', '', 'Hallo {{anrede_name}}, ich habe gerade versucht, Sie telefonisch zu erreichen. Wann passt es Ihnen am besten? Viele Grüße, {{absender}}'],
  ['WA: Nachfassen', 'WhatsApp', '', 'Hallo {{anrede_name}}, konnten Sie sich Exposé und Berechnung schon anschauen? Gern gehe ich alles in 10 Minuten mit Ihnen durch – wann passt es Ihnen? Viele Grüße, {{absender}}'],
  ['WA: Termin-Erinnerung', 'WhatsApp', '', 'Hallo {{anrede_name}}, kurze Erinnerung an unseren Termin am {{datum}}. Ich freue mich auf Sie! Viele Grüße, {{absender}}'],
  ['Geburtstagsgruß', 'Allgemein', 'Alles Gute zum Geburtstag!', 'Liebe/r {{anrede_name}},\n\nzum Geburtstag wünsche ich Ihnen alles Gute, Gesundheit und viel Freude!\n\nHerzliche Grüße\n{{absender}}\n{{firma}}'],
];
async function ensureDefaults() {
  if (!data.settings.length) { data.settings.push({ ...DEFAULT_SETTINGS }); if (!cloud) saveLocal(); else await persist('settings', data.settings[0]); }
  if (!data.templates.length && !localStorage.getItem('kre-crm-tpl-seeded')) {
    localStorage.setItem('kre-crm-tpl-seeded', '1');
    for (const [name, kategorie, betreff, text] of TPL) { const r = { id: uid(), name, kategorie, betreff, text, created: new Date().toISOString() }; data.templates.push(r); if (cloud) await persist('templates', r); }
    if (!cloud) saveLocal();
  } else if (data.templates.length && !(data.settings[0]?.tplVersion >= 2)) {
    // Kapitalanlagevertrieb: alte Makler-Standardvorlagen (unverändert) entfernen, neue Vorlagen einmalig ergänzen
    for (const t of [...data.templates]) if (/Immobilienmakler in der Region|Angebot zur Vermarktung Ihrer Immobilie/.test(t.text || '')) { data.templates = data.templates.filter(x => x !== t); if (cloud) await unpersist('templates', t.id); }
    for (const [name, kategorie, betreff, text] of TPL) if (!data.templates.some(t => t.name === name)) { const r = { id: uid(), name, kategorie, betreff, text, created: new Date().toISOString() }; data.templates.push(r); if (cloud) await persist('templates', r); }
    data.settings[0] = { ...data.settings[0], tplVersion: 2 }; if (cloud) await persist('settings', data.settings[0]);
    if (!cloud) saveLocal();
  }
  if (data.templates.length && !(data.settings[0]?.tplVersion >= 3)) {
    // WhatsApp-Textbausteine einmalig ergänzen
    for (const [name, kategorie, betreff, text] of TPL) if (kategorie === 'WhatsApp' && !data.templates.some(t => t.name === name)) { const r = { id: uid(), name, kategorie, betreff, text, created: new Date().toISOString() }; data.templates.push(r); if (cloud) await persist('templates', r); }
    data.settings[0] = { ...data.settings[0], tplVersion: 3 }; if (cloud) await persist('settings', data.settings[0]);
    if (!cloud) saveLocal();
  }
}

// ---------- Backup ----------
// Zugangsschlüssel (GitHub) nicht in Backup-Dateien schreiben
export const exportAll = () => JSON.stringify({ version: 1, exported: new Date().toISOString(), data: { ...data, settings: data.settings.map(({ githubToken, anthropicKey, ...s }) => s) } }, null, 2);
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
