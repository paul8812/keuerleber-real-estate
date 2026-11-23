// Datenschicht: lokal (localStorage) oder Cloud (Supabase). Gleiche API für beide.
import { uid, today, toast, idFor } from './util.js';
export const COLS = ['contacts', 'properties', 'deals', 'tasks', 'events', 'activities', 'templates', 'settings', 'mails', 'sync', 'buchungen', 'rechnungen', 'social', 'fahrten', 'anfragen', 'exposes', 'unterlagen', 'links', 'linkstatus'];
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
      const { data: s, error: se } = await sb.auth.getSession();
      cloud = true;
      if (!s.session) {
        // Kein Netz und Zugang muss erneuert werden: mit dem Stand auf dem Gerät arbeiten, bei Netz automatisch weiter
        if (offlineFehler(se) && await offlineStart()) return { ok: true };
        return { needsLogin: true };
      }
      if (await needsMfa() && !(await geraetOk())) return { needsLogin: true, needsMfa: true };
      await startSync(s.session.user.id);
      return { ok: true };
    } catch (e) {
      console.error(e);
      // Kein Netz und noch nichts auf dem Gerät: NICHT in den lokalen Modus fallen (dort Eingetipptes käme nie in die Cloud)
      if (!navigator.onLine || /fetch|network|Load failed/i.test(e?.message || '')) return { offline: true };
      cloud = false; sb = null;
      toast('Cloud nicht erreichbar – lokaler Modus', 'err');
    }
  }
  loadLocal(); await ensureDefaults(); return { ok: true };
}
const offlineFehler = e => !navigator.onLine || /fetch|network|Load failed|timeout/i.test(e?.message || '');
async function offlineStart() {
  let u = ''; try { u = JSON.parse(localStorage.getItem(sb.auth.storageKey) || 'null')?.user?.id || ''; } catch { /* egal */ }
  if (!u || !(await loadDevice(u))) return false;
  userId = u; setStatus();
  const wieder = async () => {
    const { data: s2, error } = await sb.auth.getSession();
    if (s2.session) { removeEventListener('online', wieder); startSync(s2.session.user.id).then(emit, syncFehler); }
    else if (!offlineFehler(error)) location.reload();      // Zugang wirklich abgelaufen → Anmeldung
  };
  addEventListener('online', wieder);
  return true;
}
let angemeldet = false, abmeldeHook = false;
/** Nach der Anmeldung: sofort aus dem Gerätespeicher, im Hintergrund mit dem Server abgleichen, live bleiben */
async function startSync(uidNow) {
  userId = uidNow; angemeldet = true;
  if (!abmeldeHook) { abmeldeHook = true; sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { geraetLeeren().finally(() => location.reload()); } }); }
  const ausSpeicher = await loadDevice(uidNow);
  const holen = fullSync().then(() => { subscribe(); flush(); });
  if (ausSpeicher) { holen.catch(syncFehler); return; }   // sofort loslegen, Server-Stand kommt nach
  await holen;                                             // erstes Mal auf diesem Gerät: einmal alles laden
}
export async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (await needsMfa() && !(await geraetOk())) return 'mfa';
  await startSync((await sb.auth.getUser()).data.user.id); return 'ok';
}
// ---------- Zwei-Faktor-Anmeldung (TOTP, Authenticator-App) ----------
export async function needsMfa() { const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); return !!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'; }
export const mfaFactors = async () => ((await sb.auth.mfa.listFactors()).data?.totp || []).filter(f => f.status === 'verified');
export async function mfaLogin(code, merken = false) {
  const f = (await mfaFactors())[0]; if (!f) throw new Error('Keine Zwei-Faktor-App eingerichtet');
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: String(code).replace(/\D/g, '') });
  if (error) throw new Error(/invalid|expired/i.test(error.message) ? 'Code falsch oder abgelaufen – bitte den aktuellen Code eingeben.' : error.message);
  let gemerkt = false, fehler = '';
  if (merken) {
    const r = await sb.rpc('geraet_merken');
    if (r.error || typeof r.data !== 'string') fehler = /geraet_merken|schema cache|not find|does not exist|PGRST202/i.test(r.error?.message || '') ? 'Der Server-Teil fehlt noch (Einstellungen → Sicherheit → „Gerät merken“ einrichten).' : (r.error?.message || 'Unbekannter Fehler');
    else { try { localStorage.setItem(GERAET_KEY, r.data); gemerkt = true; } catch { fehler = 'Der Browser erlaubt kein Speichern.'; } }
  }
  await startSync((await sb.auth.getUser()).data.user.id);
  return { gemerkt, fehler };
}
export async function mfaEnroll() {
  for (const f of ((await sb.auth.mfa.listFactors()).data?.all || []).filter(f => f.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Keuerleber CRM ' + new Date().toISOString().slice(0, 16) });
  if (error) throw error; return data;
}
export async function mfaConfirm(factorId, code) { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: String(code).replace(/\D/g, '') }); if (error) throw new Error(/invalid|expired/i.test(error.message) ? 'Code falsch – bitte den aktuellen 6-stelligen Code eingeben.' : error.message); }
export async function mfaRemove(factorId) { const { error } = await sb.auth.mfa.unenroll({ factorId }); if (error) throw error; }
export async function logoutAll() { await flush().catch(() => {}); await geraetLeeren(); await geraeteVergessen().catch(() => {}); if (sb) await sb.auth.signOut({ scope: 'global' }); location.reload(); }
// ---------- Gerät 90 Tage merken (2FA-Code entfällt auf diesem Gerät) ----------
const GERAET_KEY = 'kre-crm-geraet';
export const geraetGemerkt = () => { try { return !!localStorage.getItem(GERAET_KEY); } catch { return false; } };
async function geraetOk() {
  let t = null; try { t = localStorage.getItem(GERAET_KEY); } catch { /* egal */ }
  if (!t) return false;
  const { data, error } = await sb.rpc('geraet_pruefen', { t });
  if (error) return offlineFehler(error);                   // Server-Teil fehlt: Code abfragen · kein Netz: mit Gerätestand starten (Server prüft beim nächsten Abgleich)
  if (data !== true) { try { localStorage.removeItem(GERAET_KEY); } catch { /* egal */ } return false; }   // abgelaufen/widerrufen
  return true;
}
export async function geraeteVergessen() {
  try { localStorage.removeItem(GERAET_KEY); } catch { /* egal */ }
  const { error } = await sb.rpc('geraete_vergessen'); if (error) throw error;
}
export const GERAET_SQL = `create schema if not exists privat;
revoke all on schema privat from public, anon, authenticated;
create table if not exists privat.geraete (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  bis timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists privat.vertraute_sitzungen (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bis timestamptz not null
);
alter table privat.geraete enable row level security;
alter table privat.vertraute_sitzungen enable row level security;
revoke all on privat.geraete, privat.vertraute_sitzungen from public, anon, authenticated;

-- Ist die Anfrage ausreichend abgesichert? 2FA-Code bestätigt (aal2) ODER diese Sitzung gehört zu einem gemerkten Gerät
create or replace function public.mfa_ok() returns boolean language sql stable security definer set search_path = public, privat as $$
  select coalesce((auth.jwt()->>'aal') = 'aal2', false)
      or exists (select 1 from privat.vertraute_sitzungen s
                 where s.user_id = auth.uid() and s.bis > now()
                   and s.session_id = nullif(auth.jwt()->>'session_id', '')::uuid)
$$;

-- Nach bestätigtem 2FA-Code: dieses Gerät 90 Tage merken. Gibt den geheimen Geräte-Schlüssel zurück (nur sein Hash wird gespeichert).
create or replace function public.geraet_merken() returns text language plpgsql security definer set search_path = public, privat as $$
declare t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal', '') <> 'aal2' then raise exception 'Zuerst den 2FA-Code bestätigen'; end if;
  delete from privat.geraete where bis < now(); delete from privat.vertraute_sitzungen where bis < now();
  insert into privat.geraete (user_id, token_hash, bis) values (auth.uid(), encode(sha256(convert_to(t, 'utf8')), 'hex'), now() + interval '90 days');
  if sid is not null then insert into privat.vertraute_sitzungen (session_id, user_id, bis) values (sid, auth.uid(), now() + interval '90 days') on conflict (session_id) do update set bis = excluded.bis; end if;
  return t;
end $$;

-- Beim Anmelden auf einem gemerkten Gerät: Schlüssel prüfen und die neue Sitzung als vertraut markieren
create or replace function public.geraet_pruefen(t text) returns boolean language plpgsql security definer set search_path = public, privat as $$
declare g privat.geraete; sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if auth.uid() is null or sid is null or coalesce(t, '') = '' then return false; end if;
  select * into g from privat.geraete where user_id = auth.uid() and token_hash = encode(sha256(convert_to(t, 'utf8')), 'hex') and bis > now();
  if not found then return false; end if;
  insert into privat.vertraute_sitzungen (session_id, user_id, bis) values (sid, auth.uid(), g.bis) on conflict (session_id) do update set bis = excluded.bis;
  return true;
end $$;

-- Alle gemerkten Geräte vergessen (setzt bei der nächsten Anmeldung wieder den Code voraus)
create or replace function public.geraete_vergessen() returns void language plpgsql security definer set search_path = public, privat as $$
begin
  if auth.uid() is null or not public.mfa_ok() then raise exception 'Nicht angemeldet'; end if;
  delete from privat.geraete where user_id = auth.uid(); delete from privat.vertraute_sitzungen where user_id = auth.uid();
end $$;

revoke all on function public.mfa_ok(), public.geraet_merken(), public.geraet_pruefen(text), public.geraete_vergessen() from public, anon;
grant execute on function public.mfa_ok(), public.geraet_merken(), public.geraet_pruefen(text), public.geraete_vergessen() to authenticated;

-- 2FA auf dem Server erzwingen (Code ODER gemerktes Gerät)
drop policy if exists "eigene Daten" on public.records;
create policy "eigene Daten" on public.records for all to authenticated
  using (user_id = auth.uid() and (select public.mfa_ok()))
  with check (user_id = auth.uid() and (select public.mfa_ok()));`;
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
  await startSync((await sb.auth.getUser()).data.user.id); return 'ok';
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
// Live-Abgleich: Server stempelt die Änderungszeit (Geräteuhren gehen falsch), Index für „was hat sich seit … geändert“,
// und die Tabelle wird für Supabase Realtime freigegeben (Änderungen kommen sofort auf alle Geräte).
export const SYNC_SQL = `create or replace function public.records_zeit() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists records_zeit on public.records;
create trigger records_zeit before insert or update on public.records for each row execute function public.records_zeit();
create index if not exists records_user_updated on public.records (user_id, updated_at);
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records') then
    alter publication supabase_realtime add table public.records;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and to_regclass('public.website_anfragen') is not null
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'website_anfragen') then
    alter publication supabase_realtime add table public.website_anfragen;
  end if;
end $$;`;
// Social-Media-Zahlen: ein täglicher Abruf (Metricool) liefert sie über social_push() an – geschützt durch einen Zufallswert,
// der nur diese eine Funktion öffnet. Gespeichert als Datensatz 'social-stats' und per Realtime sofort auf allen Geräten.
export const SOCIAL_SQL = `create schema if not exists privat;
create table if not exists privat.social (
  id int primary key default 1 check (id = 1),
  geheim text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  geaendert timestamptz not null default now()
);
alter table privat.social enable row level security;
revoke all on privat.social from public, anon, authenticated;
insert into privat.social (id) values (1) on conflict (id) do nothing;
create or replace function public.social_push(p_geheim text, p_daten jsonb) returns text language plpgsql security definer set search_path = public, privat as $$
declare u uuid; g text;
begin
  select geheim into g from privat.social where id = 1;
  if g is null or coalesce(p_geheim, '') <> g then raise exception 'nicht erlaubt'; end if;
  if coalesce(jsonb_typeof(p_daten), '') <> 'object' or coalesce(jsonb_typeof(p_daten->'kanaele'), '') <> 'object' then raise exception 'Datenformat: kanaele fehlt'; end if;
  if octet_length(p_daten::text) > 600000 then raise exception 'Daten zu groß'; end if;
  select user_id into u from public.records where id = 'main' and collection = 'settings' limit 1;
  if u is null then raise exception 'CRM nicht eingerichtet'; end if;
  insert into public.records (id, collection, data, user_id)
  values ('social-stats', 'social', p_daten || jsonb_build_object('id', 'social-stats', 'empfangen', now()), u)
  on conflict (id) do update set data = excluded.data, collection = excluded.collection, user_id = excluded.user_id;
  return 'ok';
end $$;
revoke all on function public.social_push(text, jsonb) from public;
grant execute on function public.social_push(text, jsonb) to anon, authenticated;`;
// Portal-Anfragen (ohne-makler.net u. a.): Ein geplanter Abruf liest die Anfrage-Mails aus dem Gmail-Postfach und legt sie hier ab.
// anfragen_push() nimmt nur bekannte Felder an und überschreibt nie eine vorhandene Anfrage (Status/Notizen bleiben erhalten).
export const PORTAL_SQL = `create schema if not exists privat;
create table if not exists privat.anfragen (
  id int primary key default 1 check (id = 1),
  geheim text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  geaendert timestamptz not null default now()
);
alter table privat.anfragen enable row level security;
revoke all on privat.anfragen from public, anon, authenticated;
insert into privat.anfragen (id) values (1) on conflict (id) do nothing;

create or replace function public.anfragen_push(p_geheim text, p_anfragen jsonb) returns jsonb language plpgsql security definer set search_path = public, privat as $$
declare u uuid; g text; a jsonb; nid text; d jsonb; k text; neu int := 0; r int;
begin
  select geheim into g from privat.anfragen where id = 1;
  if g is null or coalesce(p_geheim, '') <> g then raise exception 'nicht erlaubt'; end if;
  if jsonb_typeof(p_anfragen) <> 'array' or jsonb_array_length(p_anfragen) > 200 then raise exception 'Liste mit höchstens 200 Anfragen erwartet'; end if;
  select user_id into u from public.records where id = 'main' and collection = 'settings' limit 1;
  if u is null then raise exception 'CRM nicht eingerichtet'; end if;
  for a in select * from jsonb_array_elements(p_anfragen) loop
    if coalesce(a->>'mailId', '') = '' or coalesce(a->>'name', '') = '' then continue; end if;
    nid := left('anf-' || left(regexp_replace(lower(coalesce(a->>'quelle', 'portal')), '[^a-z0-9]', '', 'g'), 12) || '-' || regexp_replace(a->>'mailId', '[^A-Za-z0-9]', '', 'g'), 80);
    d := jsonb_build_object('id', nid, 'status', 'neu', 'importiert', now());
    foreach k in array array['quelle', 'mailId', 'eingang', 'inseratNr', 'inseratTitel', 'inseratUrl', 'name', 'email', 'tel', 'adresse'] loop
      if jsonb_typeof(a->k) = 'string' then d := d || jsonb_build_object(k, left(a->>k, 300)); end if;
    end loop;
    if jsonb_typeof(a->'nachricht') = 'string' then d := d || jsonb_build_object('nachricht', left(a->>'nachricht', 6000)); end if;
    if jsonb_typeof(a->'angaben') = 'object' and length((a->'angaben')::text) < 3000 then d := d || jsonb_build_object('angaben', a->'angaben'); end if;
    insert into public.records (id, collection, data, user_id) values (nid, 'anfragen', d, u) on conflict (id) do nothing;
    get diagnostics r = row_count; neu := neu + r;
  end loop;
  return jsonb_build_object('ok', true, 'neu', neu, 'gesamt', (select count(*) from public.records where user_id = u and collection = 'anfragen'));
end $$;

-- Für den Abruf: wie viele Anfragen gibt es schon und von wann ist die neueste?
create or replace function public.anfragen_stand(p_geheim text) returns jsonb language plpgsql security definer set search_path = public, privat as $$
declare g text;
begin
  select geheim into g from privat.anfragen where id = 1;
  if g is null or coalesce(p_geheim, '') <> g then raise exception 'nicht erlaubt'; end if;
  return (select jsonb_build_object('anzahl', count(*), 'neueste', max(data->>'eingang')) from public.records where collection = 'anfragen');
end $$;
revoke all on function public.anfragen_push(text, jsonb), public.anfragen_stand(text) from public;
grant execute on function public.anfragen_push(text, jsonb), public.anfragen_stand(text) to anon, authenticated;`;
// Fahrtenbuch: Das iPhone meldet beim Verbinden/Trennen von CarPlay (Kurzbefehl-Automation) Start und Ende einer Fahrt
// über die Edge Function „fahrt“ → fahrt_punkt(). Geschützt durch einen Zufallswert, der nur diese Funktionen öffnet.
// Die Fahrt landet als Datensatz in 'fahrten' und ist per Realtime sofort im CRM zum Benennen da.
export const FAHRTEN_SQL = `create schema if not exists privat;
create table if not exists privat.fahrt (
  id int primary key default 1 check (id = 1),
  geheim text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  geaendert timestamptz not null default now()
);
alter table privat.fahrt enable row level security;
revoke all on privat.fahrt from public, anon, authenticated;
insert into privat.fahrt (id) values (1) on conflict (id) do nothing;

create or replace function public.fahrt_punkt(p_geheim text, p_art text, p_lat double precision, p_lon double precision, p_genau double precision default null, p_quelle text default 'carplay')
returns jsonb language plpgsql security definer set search_path = public, privat as $$
declare u uuid; g text; jetzt timestamptz := now(); pkt jsonb; nid text; o_id text; l_id text; l_data jsonb;
begin
  select geheim into g from privat.fahrt where id = 1;
  if g is null or coalesce(p_geheim, '') <> g then raise exception 'nicht erlaubt'; end if;
  if p_art not in ('start', 'ende') then raise exception 'art muss start oder ende sein'; end if;
  if p_lat is null or p_lon is null or abs(p_lat) > 90 or abs(p_lon) > 180 or (p_lat = 0 and p_lon = 0) then raise exception 'Standort fehlt'; end if;
  select user_id into u from public.records where id = 'main' and collection = 'settings' limit 1;
  if u is null then raise exception 'CRM nicht eingerichtet'; end if;
  perform pg_advisory_xact_lock(470811);
  pkt := jsonb_build_object('zeit', jetzt, 'lat', round(p_lat::numeric, 6), 'lon', round(p_lon::numeric, 6), 'genau', round(p_genau::numeric));
  select id into o_id from public.records where user_id = u and collection = 'fahrten' and data->>'status' = 'unterwegs'
    order by data->'start'->>'zeit' desc limit 1;
  if p_art = 'start' then
    if o_id is not null then
      -- Ende wurde nicht gemeldet: das Auto stand seitdem hier → Fahrt endet an diesem Punkt (Zeit unbekannt)
      update public.records set data = data || jsonb_build_object('ende', pkt || jsonb_build_object('zeitUnbekannt', true), 'status', 'offen') where id = o_id;
    else
      -- Nur kurz getrennt (< 4 Min., z. B. Kabel/Bluetooth-Aussetzer)? → dieselbe Fahrt geht weiter
      select id, data into l_id, l_data from public.records where user_id = u and collection = 'fahrten' and data->>'status' = 'offen' and data->'ende' ? 'zeit'
        order by data->'ende'->>'zeit' desc limit 1;
      if l_id is not null and coalesce((l_data->'ende'->>'zeitUnbekannt')::boolean, false) = false
         and jetzt - (l_data->'ende'->>'zeit')::timestamptz < interval '4 minutes' then
        update public.records set data = (data - 'ende') || jsonb_build_object('status', 'unterwegs', 'aussetzer', coalesce((data->>'aussetzer')::int, 0) + 1) where id = l_id;
        return jsonb_build_object('ok', true, 'id', l_id, 'fortgesetzt', true);
      end if;
    end if;
    nid := 'fahrt-' || gen_random_uuid();
    insert into public.records (id, collection, data, user_id)
    values (nid, 'fahrten', jsonb_build_object('id', nid, 'status', 'unterwegs', 'quelle', left(coalesce(p_quelle, 'carplay'), 20), 'start', pkt, 'erstellt', jetzt), u);
    return jsonb_build_object('ok', true, 'id', nid, 'art', 'start');
  end if;
  if o_id is null then
    -- Start fehlte: letzter bekannter Standort des Autos ist der Start
    select data into l_data from public.records where user_id = u and collection = 'fahrten' and data->'ende' ? 'lat' and data->>'status' <> 'verworfen'
      order by data->'ende'->>'zeit' desc limit 1;
    nid := 'fahrt-' || gen_random_uuid();
    insert into public.records (id, collection, data, user_id)
    values (nid, 'fahrten', jsonb_build_object('id', nid, 'status', 'offen', 'quelle', left(coalesce(p_quelle, 'carplay'), 20), 'erstellt', jetzt, 'ende', pkt,
      'start', coalesce((l_data->'ende') || jsonb_build_object('zeitUnbekannt', true), jsonb_build_object('zeitUnbekannt', true))), u);
    return jsonb_build_object('ok', true, 'id', nid, 'art', 'ende', 'ohneStart', true, 'start', l_data->'ende');
  end if;
  update public.records set data = data || jsonb_build_object('ende', pkt, 'status', 'offen') where id = o_id returning data into l_data;
  return jsonb_build_object('ok', true, 'id', o_id, 'art', 'ende', 'start', l_data->'start');
end $$;

-- Adressen/Strecke nachtragen (nur solange die Fahrt noch nicht erfasst ist, nur diese Felder)
create or replace function public.fahrt_ergaenzen(p_geheim text, p_id text, p_daten jsonb) returns boolean language plpgsql security definer set search_path = public, privat as $$
declare g text; d jsonb;
begin
  select geheim into g from privat.fahrt where id = 1;
  if g is null or coalesce(p_geheim, '') <> g then raise exception 'nicht erlaubt'; end if;
  select data into d from public.records where id = p_id and collection = 'fahrten' for update;
  if d is null or d->>'status' not in ('unterwegs', 'offen') then return false; end if;
  if p_daten ? 'startAdresse' and d ? 'start' then d := jsonb_set(d, '{start,adresse}', to_jsonb(left(p_daten->>'startAdresse', 200))); end if;
  if p_daten ? 'endeAdresse' and d ? 'ende' then d := jsonb_set(d, '{ende,adresse}', to_jsonb(left(p_daten->>'endeAdresse', 200))); end if;
  if jsonb_typeof(p_daten->'kmRoute') = 'number' then d := d || jsonb_build_object('kmRoute', least((p_daten->>'kmRoute')::numeric, 3000)); end if;
  if jsonb_typeof(p_daten->'minRoute') = 'number' then d := d || jsonb_build_object('minRoute', least((p_daten->>'minRoute')::numeric, 3000)); end if;
  update public.records set data = d where id = p_id;
  return true;
end $$;

-- Für das CRM (angemeldet + 2FA): Zufallswert anzeigen bzw. erneuern
create or replace function public.fahrt_geheim(p_neu boolean default false) returns text language plpgsql security definer set search_path = public, privat as $$
declare g text;
begin
  if auth.uid() is null or not public.mfa_ok() or not exists (select 1 from public.records r where r.user_id = auth.uid() and r.id = 'main') then raise exception 'nicht berechtigt'; end if;
  if p_neu then update privat.fahrt set geheim = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), geaendert = now() where id = 1; end if;
  select geheim into g from privat.fahrt where id = 1;
  return g;
end $$;
revoke all on function public.fahrt_punkt(text, text, double precision, double precision, double precision, text), public.fahrt_ergaenzen(text, text, jsonb), public.fahrt_geheim(boolean) from public;
grant execute on function public.fahrt_punkt(text, text, double precision, double precision, double precision, text), public.fahrt_ergaenzen(text, text, jsonb) to anon, authenticated;
grant execute on function public.fahrt_geheim(boolean) to authenticated;`;
// E-Mail senden aus dem CRM (Edge Function „mailsenden“): Einmal-Schein für den angemeldeten Benutzer, den nur der Server gegen die
// Postfach-Daten aus dem Vault tauschen kann. Höchstens 60 Mails je Stunde.
export const MAILSENDEN_SQL = `create table if not exists privat.mailticket (ticket text primary key, user_id uuid not null, ablauf timestamptz not null);
alter table privat.mailticket enable row level security;
revoke all on privat.mailticket from public, anon, authenticated;
create or replace function public.mailsenden_ticket() returns text language plpgsql security definer set search_path = public, privat as $$
declare t text;
begin
  if auth.uid() is null or not public.mfa_ok() or not exists (select 1 from public.records r where r.user_id = auth.uid() and r.id = 'main') then raise exception 'nicht berechtigt'; end if;
  delete from privat.mailticket where ablauf < now() - interval '1 hour';
  if (select count(*) from privat.mailticket where user_id = auth.uid()) >= 60 then raise exception 'zu viele Mails in kurzer Zeit'; end if;
  t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into privat.mailticket (ticket, user_id, ablauf) values (t, auth.uid(), now() + interval '2 minutes');
  return t;
end $$;
create or replace function public.mailsenden_start(p_ticket text) returns jsonb language plpgsql security definer set search_path = public, privat as $$
declare u uuid; pw text; pf text; nm text;
begin
  update privat.mailticket set ticket = 'x-' || ticket where ticket = p_ticket and ablauf > now() and ticket not like 'x-%' returning user_id into u;
  if u is null then return jsonb_build_object('ok', false, 'grund', 'ungültig'); end if;
  select m.postfach into pf from privat.mailsync m where m.id = 1;
  select d.decrypted_secret into pw from vault.decrypted_secrets d where d.name = 'mailsync_imap';
  if coalesce(pf, '') = '' or coalesce(pw, '') = '' then return jsonb_build_object('ok', false, 'grund', 'kein Postfach'); end if;
  select r.data->>'inhaber' into nm from public.records r where r.id = 'main' and r.collection = 'settings' and r.user_id = u;
  return jsonb_build_object('ok', true, 'user_id', u, 'postfach', pf, 'passwort', pw, 'name', coalesce(nm, ''));
end $$;
revoke all on function public.mailsenden_ticket(), public.mailsenden_start(text) from public, anon, authenticated;
grant execute on function public.mailsenden_ticket() to authenticated;
grant execute on function public.mailsenden_start(text) to service_role;`;
export async function fahrtGeheim(neu = false) { if (!sb) throw new Error('Keine Cloud-Datenbank verbunden'); const { data, error } = await sb.rpc('fahrt_geheim', { p_neu: neu }); if (error) throw error; return data; }
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
alter table privat.sofort enable row level security;

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
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 20000);
  return new;
exception when others then return new;
end $$;
drop trigger if exists anfrage_telegram on public.website_anfragen;
create trigger anfrage_telegram after insert on public.website_anfragen for each row execute function public.notify_anfrage();

create or replace function public.antwort_anfrage() returns trigger language plpgsql security definer set search_path = public, privat, extensions as $$
declare d jsonb := new.daten; c privat.sofort; html text; gruss text;
  mail text := trim(coalesce(nullif(trim(d->>'email'), ''), nullif(trim(d->>'E-Mail'), ''), nullif(trim(d->>'Email'), ''), ''));
  nm text := left(coalesce(nullif(trim(d->>'name'), ''), nullif(trim(d->>'Name'), ''), ''), 60);
  leit boolean := coalesce(new.betreff, '') ilike 'Leitfaden%';
begin
  select * into c from privat.sofort where id = 1;
  if c.rs_key is null then return new; end if;
  if mail !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' or length(mail) > 120 or coalesce(new.betreff, '') ilike 'Vorab-Liste%' then return new; end if;
  if nm ~ '@' then nm := ''; end if;
  if (select count(*) from public.website_anfragen where created_at > now() - interval '10 minutes') > 30 then return new; end if;
  -- Gestaltete Fassung im Stil der Keuerleber-Signatur; {{GRUSS}} wird durch „ Vorname Nachname“ ersetzt (HTML-maskiert)
  gruss := case when nm <> '' then ' ' || replace(replace(replace(replace(nm, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;') else '' end;
  html := replace(case when leit then $m1$<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ihre Anfrage bei Keuerleber Immobilien</title></head><body style="margin:0;padding:0;background:#f6f3ee;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f3ee;"><tr><td align="center" style="padding:20px 8px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #eee7d6;border-radius:6px;"><tr><td align="center" style="padding:28px 24px 20px 24px;"><a href="https://keuerleber-immobilien.de/" target="_blank"><img src="https://keuerleber-immobilien.de/signatur/logo-signatur.png" width="260" alt="Keuerleber Immobilien" style="display:block;border:0;width:260px;max-width:100%;height:auto;"></a></td></tr><tr><td style="padding:0 24px;"><div style="border-top:1px solid #c9a96e;font-size:1px;line-height:1px;">&nbsp;</div></td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;padding:24px 24px 0 24px;font-size:15px;line-height:1.6;color:#1a1a1a;"><p style="margin:0 0 14px 0;">Guten Tag{{GRUSS}},</p><p style="margin:0 0 14px 0;">vielen Dank für Ihre Anfrage. Ich melde mich <b>werktags innerhalb von 24 Stunden persönlich</b> bei Ihnen.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f1;border:1px solid #eee7d6;border-radius:6px;margin:6px 0 18px 0;"><tr><td style="font-family:Arial,Helvetica,sans-serif;padding:18px 20px;font-size:15px;line-height:1.5;color:#1a1a1a;"><b style="color:#9c7f4d;">Ihr Leitfaden „Kapitalanlage in Hof“</b><br>Zehn Seiten zu Rendite, Abschreibung, Nebenkosten und Ablauf.<div style="margin-top:12px;"><a href="https://keuerleber-immobilien.de/leitfaden-kapitalanlage-hof.pdf" target="_blank" style="font-family:Arial,Helvetica,sans-serif;display:inline-block;white-space:nowrap;margin:0 8px 10px 0;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:24px;background:#1a1a1a;color:#ffffff;border:1px solid #1a1a1a;">Leitfaden herunterladen (PDF)</a></div></td></tr></table><p style="margin:0 0 12px 0;">Bis dahin können Sie Ihre Rendite selbst durchrechnen oder direkt einen Termin wählen:</p><div><a href="https://keuerleber-immobilien.de/rendite/" target="_blank" style="font-family:Arial,Helvetica,sans-serif;display:inline-block;white-space:nowrap;margin:0 8px 10px 0;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:24px;background:#ffffff;color:#9c7f4d;border:1px solid #c9a96e;">Rendite berechnen</a><a href="https://keuerleber-immobilien.de/#kontakt" target="_blank" style="font-family:Arial,Helvetica,sans-serif;display:inline-block;white-space:nowrap;margin:0 8px 10px 0;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:24px;background:#ffffff;color:#9c7f4d;border:1px solid #c9a96e;">Termin wählen</a></div></td></tr><tr><td style="padding:14px 24px 26px 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.45;"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;padding:6px 0 12px 0;">Mit freundlichen Grüßen</td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;padding:0 0 2px 0;font-size:17px;font-weight:bold;color:#1a1a1a;">Paul Keuerleber</td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;padding:0 0 12px 0;font-size:13px;color:#6b6459;">Immobilienkaufmann (IHK) &middot; Vertrieb Kapitalanlagen</td></tr><tr><td style="border-top:1px solid #c9a96e;font-size:1px;line-height:1px;height:1px;padding:0;">&nbsp;</td></tr><tr><td style="padding:12px 0 10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9c7f4d;font-weight:bold;padding:2px 10px 2px 0;" valign="top">T</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;padding:2px 0;"><a href="tel:+4915167692176" style="color:#1a1a1a;text-decoration:none;">+49 151 67692176</a></td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9c7f4d;font-weight:bold;padding:2px 10px 2px 0;" valign="top">E</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;padding:2px 0;"><a href="mailto:paul.keuerleber@keuerleber-immobilien.de" style="color:#1a1a1a;text-decoration:none;">paul.keuerleber@keuerleber-immobilien.de</a></td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9c7f4d;font-weight:bold;padding:2px 10px 2px 0;" valign="top">W</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:2px 0;"><a href="https://keuerleber-immobilien.de/" style="color:#9c7f4d;text-decoration:none;">keuerleber-immobilien.de</a></td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9c7f4d;font-weight:bold;padding:2px 10px 2px 0;" valign="top">A</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;padding:2px 0;">Hauptstraße 12 &middot; 95145 Oberkotzau</td></tr></table></td></tr><tr><td style="padding:2px 0 10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 8px 0 0;"><a href="https://wa.me/4915167692176" target="_blank"><img src="https://keuerleber-immobilien.de/signatur/icon-whatsapp.png" width="28" height="28" alt="WhatsApp" style="display:block;border:0;"></a></td><td style="padding:0 8px 0 0;"><a href="https://keuerleber-immobilien.de/" target="_blank"><img src="https://keuerleber-immobilien.de/signatur/icon-web.png" width="28" height="28" alt="Website" style="display:block;border:0;"></a></td><td style="padding:0 8px 0 0;"><a href="mailto:paul.keuerleber@keuerleber-immobilien.de"><img src="https://keuerleber-immobilien.de/signatur/icon-mail.png" width="28" height="28" alt="E-Mail" style="display:block;border:0;"></a></td></tr></table></td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-style:italic;color:#9c7f4d;padding:0 0 10px 0;">Kernsanierte Eigentumswohnungen in Hof &amp; Oberfranken &middot; Beratung kostenfrei</td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8a8378;line-height:1.5;padding:8px 0 0 0;border-top:1px solid #eee7d6;">Keuerleber Immobilien &middot; Inhaber: Paul Keuerleber &middot; Hauptstraße 12 &middot; 95145 Oberkotzau<br>Sie erhalten diese automatische Bestätigung, weil Sie auf keuerleber-immobilien.de eine Anfrage gestellt haben. Antworten Sie einfach auf diese E-Mail, sie geht direkt an mich.</td></tr></table></td></tr></table></td></tr></table></body></html>$m1$ else $m0$<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ihre Anfrage bei Keuerleber Immobilien</title></head><body style="margin:0;padding:0;background:#f6f3ee;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f3ee;"><tr><td align="center" style="padding:20px 8px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #eee7d6;border-radius:6px;"><tr><td align="center" style="padding:28px 24px 20px 24px;"><a href="https://keuerleber-immobilien.de/" target="_blank"><img src="https://keuerleber-immobilien.de/signatur/logo-signatur.png" width="260" alt="Keuerleber Immobilien" style="display:block;border:0;width:260px;max-width:100%;height:auto;"></a></td></tr><tr><td style="padding:0 24px;"><div style="border-top:1px solid #c9a96e;font-size:1px;line-height:1px;">&nbsp;</div></td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;padding:24px 24px 0 24px;font-size:15px;line-height:1.6;color:#1a1a1a;"><p style="margin:0 0 14px 0;">Guten Tag{{GRUSS}},</p><p style="margin:0 0 14px 0;">vielen Dank für Ihre Anfrage. Ich melde mich <b>werktags innerhalb von 24 Stunden persönlich</b> bei Ihnen.</p><p style="margin:0 0 12px 0;">Bis dahin können Sie Ihre Rendite selbst durchrechnen oder direkt einen Termin wählen:</p><div><a href="https://keuerleber-immobilien.de/rendite/" target="_blank" style="font-family:Arial,Helvetica,sans-serif;display:inline-block;white-space:nowrap;margin:0 8px 10px 0;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:24px;background:#1a1a1a;color:#ffffff;border:1px solid #1a1a1a;">Rendite berechnen</a><a href="https://keuerleber-immobilien.de/#kontakt" target="_blank" style="font-family:Arial,Helvetica,sans-serif;display:inline-block;white-space:nowrap;margin:0 8px 10px 0;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:24px;background:#ffffff;color:#9c7f4d;border:1px solid #c9a96e;">Termin wählen</a></div></td></tr><tr><td style="padding:14px 24px 26px 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.45;"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;padding:6px 0 12px 0;">Mit freundlichen Grüßen</td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;padding:0 0 2px 0;font-size:17px;font-weight:bold;color:#1a1a1a;">Paul Keuerleber</td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;padding:0 0 12px 0;font-size:13px;color:#6b6459;">Immobilienkaufmann (IHK) &middot; Vertrieb Kapitalanlagen</td></tr><tr><td style="border-top:1px solid #c9a96e;font-size:1px;line-height:1px;height:1px;padding:0;">&nbsp;</td></tr><tr><td style="padding:12px 0 10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9c7f4d;font-weight:bold;padding:2px 10px 2px 0;" valign="top">T</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;padding:2px 0;"><a href="tel:+4915167692176" style="color:#1a1a1a;text-decoration:none;">+49 151 67692176</a></td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9c7f4d;font-weight:bold;padding:2px 10px 2px 0;" valign="top">E</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;padding:2px 0;"><a href="mailto:paul.keuerleber@keuerleber-immobilien.de" style="color:#1a1a1a;text-decoration:none;">paul.keuerleber@keuerleber-immobilien.de</a></td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9c7f4d;font-weight:bold;padding:2px 10px 2px 0;" valign="top">W</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:2px 0;"><a href="https://keuerleber-immobilien.de/" style="color:#9c7f4d;text-decoration:none;">keuerleber-immobilien.de</a></td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9c7f4d;font-weight:bold;padding:2px 10px 2px 0;" valign="top">A</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;padding:2px 0;">Hauptstraße 12 &middot; 95145 Oberkotzau</td></tr></table></td></tr><tr><td style="padding:2px 0 10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 8px 0 0;"><a href="https://wa.me/4915167692176" target="_blank"><img src="https://keuerleber-immobilien.de/signatur/icon-whatsapp.png" width="28" height="28" alt="WhatsApp" style="display:block;border:0;"></a></td><td style="padding:0 8px 0 0;"><a href="https://keuerleber-immobilien.de/" target="_blank"><img src="https://keuerleber-immobilien.de/signatur/icon-web.png" width="28" height="28" alt="Website" style="display:block;border:0;"></a></td><td style="padding:0 8px 0 0;"><a href="mailto:paul.keuerleber@keuerleber-immobilien.de"><img src="https://keuerleber-immobilien.de/signatur/icon-mail.png" width="28" height="28" alt="E-Mail" style="display:block;border:0;"></a></td></tr></table></td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-style:italic;color:#9c7f4d;padding:0 0 10px 0;">Kernsanierte Eigentumswohnungen in Hof &amp; Oberfranken &middot; Beratung kostenfrei</td></tr><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8a8378;line-height:1.5;padding:8px 0 0 0;border-top:1px solid #eee7d6;">Keuerleber Immobilien &middot; Inhaber: Paul Keuerleber &middot; Hauptstraße 12 &middot; 95145 Oberkotzau<br>Sie erhalten diese automatische Bestätigung, weil Sie auf keuerleber-immobilien.de eine Anfrage gestellt haben. Antworten Sie einfach auf diese E-Mail, sie geht direkt an mich.</td></tr></table></td></tr></table></td></tr></table></body></html>$m0$ end, '{{GRUSS}}', gruss);
  perform net.http_post(url := 'https://api.resend.com/emails',
    body := jsonb_build_object('from', coalesce(c.rs_from, 'Paul Keuerleber <paul.keuerleber@keuerleber-immobilien.de>'), 'to', jsonb_build_array(mail), 'reply_to', 'paul.keuerleber@keuerleber-immobilien.de',
      'subject', case when leit then 'Ihr Leitfaden Kapitalanlage' else 'Ihre Anfrage bei Keuerleber Immobilien' end,
      'html', html,
      'text', 'Guten Tag' || case when nm <> '' then ' ' || nm else '' end || E',\n\nvielen Dank für Ihre Anfrage. Ich melde mich werktags innerhalb von 24 Stunden persönlich bei Ihnen.\n\n'
        || case when leit then E'Ihren Leitfaden finden Sie hier: https://keuerleber-immobilien.de/leitfaden-kapitalanlage-hof.pdf\n\n' else '' end
        || E'Bis dahin können Sie Ihre Rendite selbst durchrechnen: https://keuerleber-immobilien.de/rendite/\nOder direkt einen Termin wählen: https://keuerleber-immobilien.de/#kontakt\n\nMit freundlichen Grüßen\nPaul Keuerleber\nKeuerleber Immobilien · Hauptstraße 12 · 95145 Oberkotzau\n+49 151 67692176'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || c.rs_key),
    timeout_milliseconds := 20000);
  return new;
exception when others then return new;
end $$;
drop trigger if exists anfrage_antwort on public.website_anfragen;
create trigger anfrage_antwort after insert on public.website_anfragen for each row execute function public.antwort_anfrage();`;
export async function sofortStatus() { if (!sb) throw new Error('Keine Cloud-Datenbank verbunden'); const { data, error } = await sb.rpc('sofort_status'); if (error) throw error; return data; }
export async function sofortSetzen(p) { if (!sb) throw new Error('Keine Cloud-Datenbank verbunden'); const { data, error } = await sb.rpc('sofort_setzen', { p }); if (error) throw error; return data; }
// Mail-Abgleich auf dem Server (Edge Function „mailsync“, alle 3 Minuten über pg_cron). Ersetzt den Abgleich auf dem Mac.
// Das Strato-Passwort liegt verschlüsselt im Supabase Vault (Name „mailsync_imap“), gesetzt nur über mailsync_setzen();
// die Edge Function holt es über mailsync_start() mit dem Zufallswert aus privat.mailsync (nur service_role darf das).
// Dieses SQL enthält keine Geheimnisse (der Anon-Key ist öffentlich).
export const mailsyncSQL = () => { const c = cfg(); return `create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create schema if not exists privat;
revoke all on schema privat from public, anon, authenticated;
create table if not exists privat.mailsync (
  id int primary key default 1 check (id = 1),
  postfach text not null default 'paul.keuerleber@keuerleber-immobilien.de',
  aktiv boolean not null default false,
  geheim text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  stand jsonb not null default '{}'::jsonb,
  sperre_bis timestamptz,
  geaendert timestamptz not null default now()
);
insert into privat.mailsync (id) values (1) on conflict (id) do nothing;
alter table privat.mailsync enable row level security;
revoke all on privat.mailsync from public, anon, authenticated;

create or replace function public.mailsync_status() returns jsonb language sql stable security definer set search_path = public, privat as $$
  select case when auth.uid() is not null and exists (select 1 from public.records r where r.user_id = auth.uid()) then
    (select jsonb_build_object('aktiv', m.aktiv, 'postfach', m.postfach, 'geaendert', m.geaendert,
      'passwort', exists (select 1 from vault.secrets v where v.name = 'mailsync_imap')) from privat.mailsync m where m.id = 1)
  end
$$;
create or replace function public.mailsync_setzen(p_passwort text, p_postfach text default null) returns jsonb language plpgsql security definer set search_path = public, privat as $$
declare sid uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.records r where r.user_id = auth.uid()) then raise exception 'nicht berechtigt'; end if;
  select v.id into sid from vault.secrets v where v.name = 'mailsync_imap';
  if coalesce(p_passwort, '') = '' then
    if sid is not null then delete from vault.secrets where id = sid; end if;
    update privat.mailsync set aktiv = false, sperre_bis = null, geaendert = now() where id = 1;
  else
    if sid is null then perform vault.create_secret(p_passwort, 'mailsync_imap', 'Strato-Postfach für den Mail-Abgleich (Server)');
    else perform vault.update_secret(sid, p_passwort); end if;
    update privat.mailsync set aktiv = true, sperre_bis = null, geaendert = now(),
      postfach = coalesce(nullif(lower(trim(p_postfach)), ''), postfach) where id = 1;
  end if;
  return public.mailsync_status();
end $$;
create or replace function public.mailsync_start(p_geheim text) returns jsonb language plpgsql security definer set search_path = public, privat as $$
declare m privat.mailsync; pw text; uid uuid;
begin
  select * into m from privat.mailsync where id = 1 for update;
  if m.id is null or m.geheim is distinct from p_geheim then return jsonb_build_object('ok', false, 'grund', 'falsch'); end if;
  if not m.aktiv then return jsonb_build_object('ok', false, 'grund', 'nicht aktiv'); end if;
  if m.sperre_bis > now() then return jsonb_build_object('ok', false, 'grund', 'läuft bereits'); end if;
  select d.decrypted_secret into pw from vault.decrypted_secrets d where d.name = 'mailsync_imap';
  if coalesce(pw, '') = '' then return jsonb_build_object('ok', false, 'grund', 'kein Passwort'); end if;
  select r.user_id into uid from public.records r limit 1;
  update privat.mailsync set sperre_bis = now() + interval '5 minutes' where id = 1;
  return jsonb_build_object('ok', true, 'postfach', m.postfach, 'passwort', pw, 'stand', m.stand, 'user_id', uid);
end $$;
create or replace function public.mailsync_ende(p_geheim text, p_stand jsonb) returns boolean language plpgsql security definer set search_path = public, privat as $$
begin
  update privat.mailsync set stand = coalesce(p_stand, stand), sperre_bis = null where id = 1 and geheim = p_geheim;
  return found;
end $$;
revoke all on function public.mailsync_status() from public, anon;
revoke all on function public.mailsync_setzen(text, text) from public, anon;
revoke all on function public.mailsync_start(text) from public, anon, authenticated;
revoke all on function public.mailsync_ende(text, jsonb) from public, anon, authenticated;
grant execute on function public.mailsync_status() to authenticated;
grant execute on function public.mailsync_setzen(text, text) to authenticated;
grant execute on function public.mailsync_start(text) to service_role;
grant execute on function public.mailsync_ende(text, jsonb) to service_role;
-- Auffangnetz: Website-Anfrage nur per Mail angekommen (lead-sync.js im Browser blockiert) → Telegram trotzdem
create or replace function public.mailsync_push(p_geheim text, p_text text) returns boolean language plpgsql security definer set search_path = public, privat, extensions as $$
declare c privat.sofort;
begin
  if not exists (select 1 from privat.mailsync m where m.id = 1 and m.geheim = p_geheim) then return false; end if;
  select * into c from privat.sofort where id = 1;
  if c.tg_token is null or c.tg_chat is null then return false; end if;
  perform net.http_post(url := 'https://api.telegram.org/bot' || c.tg_token || '/sendMessage',
    body := jsonb_build_object('chat_id', c.tg_chat, 'text', left(p_text, 3500)),
    headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 20000);
  return true;
end $$;
revoke all on function public.mailsync_push(text, text) from public, anon, authenticated;
grant execute on function public.mailsync_push(text, text) to service_role;

select cron.schedule('crm-mailsync', '*/3 * * * *', $c$
  select net.http_post(
    url := '${c.url}/functions/v1/mailsync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ${c.key}', 'x-mailsync', m.geheim),
    body := '{}'::jsonb, timeout_milliseconds := 150000)
  from privat.mailsync m where m.id = 1 and m.aktiv
$c$);`; };
export async function mailsyncStatus() { if (!sb) throw new Error('Keine Cloud-Datenbank verbunden'); const { data, error } = await sb.rpc('mailsync_status'); if (error) throw error; return data; }
export async function mailsyncSetzen(passwort, postfach) { if (!sb) throw new Error('Keine Cloud-Datenbank verbunden'); const { data, error } = await sb.rpc('mailsync_setzen', { p_passwort: passwort, p_postfach: postfach || null }); if (error) throw error; return data; }
export const SQL_URL = () => { const m = (cfg().url || '').match(/https:\/\/([^.]+)\.supabase\.co/); return m ? `https://supabase.com/dashboard/project/${m[1]}/sql/new` : 'https://supabase.com/dashboard'; };
// Nur dieses Gerät abmelden. Ohne scope meldet supabase-js *global* ab und macht damit auch den
// Zugang des Mail-Abgleichs auf dem Mac ungültig (refresh_token_not_found) – das passierte bei jedem Auto-Logout.
export async function logout() { await flush().catch(() => {}); await geraetLeeren(); if (sb) await sb.auth.signOut({ scope: 'local' }); location.reload(); }
/** Supabase-Client und Benutzer-ID (für den Dateispeicher der Objektunterlagen) */
export const klient = () => sb;
export const benutzer = () => userId;
export const userEmail = async () => sb ? (await sb.auth.getUser()).data.user?.email : null;

// ================================================================ Sync (Cloud)
// Ziel: auf Handy, Mac und Tablet flüssig und gleich.
//  • Gerätespeicher (IndexedDB): die App startet sofort mit dem letzten Stand und ist offline lesbar.
//  • Speichern ist sofort sichtbar; die Übertragung läuft im Hintergrund über eine Warteschlange, die
//    Funklöcher und das Schließen der App übersteht (Handy-Browser beenden Hintergrund-Apps gern).
//  • Live: Änderungen anderer Geräte und des Servers (Mail-Abgleich, Website-Anfragen) kommen per
//    Supabase Realtime sofort an. Nach Ruhezustand/Funkloch werden nur die Änderungen nachgeladen.
//  • Gleiches Feld auf zwei Geräten geändert: der zuletzt beim Server angekommene Stand gilt.
const IDB_NAME = 'kre-crm-sync';
let idbP = null;
function idb() {
  if (idbP) return idbP;
  idbP = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('kein IndexedDB'));
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { for (const st of ['rec', 'meta', 'outbox']) if (!r.result.objectStoreNames.contains(st)) r.result.createObjectStore(st); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('Gerätespeicher blockiert'));
  }).catch(e => { console.warn('Gerätespeicher nicht verfügbar – nur online', e); return null; });
  return idbP;
}
const idbReq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbAll(store) {
  const d = await idb(); if (!d) return [];
  try { const t = d.transaction(store), o = t.objectStore(store); const [v, k] = await Promise.all([idbReq(o.getAll()), idbReq(o.getAllKeys())]); return k.map((key, i) => [key, v[i]]); }
  catch (e) { console.warn(e); return []; }
}
async function idbWrite(store, puts = [], dels = [], clear = false) {
  const d = await idb(); if (!d) return;
  try {
    await new Promise((res, rej) => {
      const t = d.transaction(store, 'readwrite'), o = t.objectStore(store);
      if (clear) o.clear();
      for (const [k, v] of puts) o.put(v, k);
      for (const k of dels) o.delete(k);
      t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  } catch (e) { console.warn('Gerätespeicher: Schreiben fehlgeschlagen', e); }
}
async function clearDevice() { await Promise.all(['rec', 'meta', 'outbox'].map(st => idbWrite(st, [], [], true))); }
// Beim Abmelden: Daten vom Gerät nehmen – außer noch nicht gesendeten Änderungen (gehen nach der nächsten Anmeldung raus)
async function geraetLeeren() {
  if (!outbox.size) return clearDevice();
  await Promise.all([idbWrite('rec', [], [], true), idbWrite('meta', [['user', userId]], [], true)]);
}

const srvU = new Map();            // id → updated_at laut Server (für Abgleich)
const outbox = new Map();          // id → { op: 'up'|'del', col, rec }  – noch nicht beim Server
const spaet = new Map();           // id → Server-Zeile, die während einer eigenen ungesendeten Änderung kam (wird danach verglichen)
let userId = '', since = '', chan = null, live = false, flushing = false, flushTimer = 0, backoff = 0, lastErr = '', lastSyncAt = 0, lastIdCheck = 0, synced = false;
const statusL = new Set();
export const onStatus = f => { statusL.add(f); f(syncState()); return () => statusL.delete(f); };
export const syncState = () => ({ cloud, online: navigator.onLine, live, pending: outbox.size, busy: flushing, error: lastErr, lastSync: lastSyncAt, synced });
const setStatus = () => statusL.forEach(f => { try { f(syncState()); } catch (e) { console.error(e); } });

// Gerätespeicher gebündelt schreiben (viele Änderungen hintereinander = ein Schreibvorgang)
const dirty = new Map(); let dirtyT = 0;
function cacheLater(id, val) { dirty.set(id, val); clearTimeout(dirtyT); dirtyT = setTimeout(cacheNow, 250); }
function cacheNow() {
  if (!dirty.size) return;
  const puts = [], dels = [];
  for (const [id, v] of dirty) v ? puts.push([id, v]) : dels.push(id);
  dirty.clear();
  idbWrite('rec', puts, dels);
  idbWrite('meta', [['since', since], ['user', userId], ['at', lastSyncAt]]);
}
addEventListener('pagehide', cacheNow);

const colOf = id => { for (const c of COLS) if (data[c].some(r => r.id === id)) return c; return null; };
function setLocal(col, rec) {
  for (const c of COLS) if (c !== col) { const j = data[c].findIndex(r => r.id === rec.id); if (j >= 0) data[c].splice(j, 1); }
  (data[col] ||= []);
  const i = data[col].findIndex(r => r.id === rec.id);
  if (i >= 0) data[col][i] = rec; else data[col].push(rec);
}
function dropLocal(id) { const c = colOf(id); if (c) data[c] = data[c].filter(r => r.id !== id); return !!c; }
const same = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };

let mitschnitt = null;   // während eines vollständigen Abgleichs eintreffende Live-Meldungen (danach erneut anwenden)
/** Zeile vom Server übernehmen; true, wenn sich lokal etwas geändert hat */
function applyRow(row) {
  if (!row?.id || row.collection === 'dateien' || !COLS.includes(row.collection)) return false;
  if (mitschnitt) mitschnitt.push(['up', row]);
  if (row.updated_at && (!since || row.updated_at > since)) since = row.updated_at;
  srvU.set(row.id, row.updated_at || '');
  if (outbox.has(row.id)) { spaet.set(row.id, row); return false; }   // eigene, noch nicht übertragene Änderung hat Vorrang – vorerst
  const cur = get(row.collection, row.id);
  if (cur && same(cur, row.data)) return false;
  setLocal(row.collection, row.data);
  cacheLater(row.id, { c: row.collection, d: row.data, u: row.updated_at || '' });
  return true;
}
function applyDelete(id) {
  if (mitschnitt && id) mitschnitt.push(['del', id]);
  if (!id || outbox.has(id)) return false;
  srvU.delete(id);
  const hit = dropLocal(id);
  if (hit) cacheLater(id, null);
  return hit;
}
const emitSoon = (() => { let t = 0; return () => { clearTimeout(t); t = setTimeout(emit, 40); }; })();

async function loadDevice(uidNow) {
  const meta = Object.fromEntries(await idbAll('meta'));
  if (meta.user && meta.user !== uidNow) { await clearDevice(); return false; }   // anderes Konto auf diesem Gerät
  const recs = await idbAll('rec');
  for (const [id, op] of await idbAll('outbox')) outbox.set(id, op);
  if (!recs.length) return false;
  COLS.forEach(c => data[c] = []);
  for (const [id, r] of recs) { if (COLS.includes(r.c)) { data[r.c].push(r.d); srvU.set(id, r.u || ''); } }
  for (const [id, op] of outbox) { if (op.op === 'up') setLocal(op.col, op.rec); else dropLocal(id); }   // Ungesendetes obendrauf
  since = meta.since || ''; lastSyncAt = meta.at || 0;
  return true;
}

async function fetchAll(cols = 'id,collection,data,updated_at') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await sb.from('records').select(cols).neq('collection', 'dateien').order('id').range(from, from + 999);
    if (error) throw error;
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
/** Vollständiger Abgleich (Start, „Aktualisieren“): Server-Stand + eigene ungesendete Änderungen */
async function fullSync() {
  mitschnitt = [];
  let rows, live;
  try { rows = await fetchAll(); } finally { live = mitschnitt; mitschnitt = null; }
  // Ein eingerichtetes CRM hat immer mindestens die Einstellungen. Leere Antwort = Zugang/Berechtigung stimmt nicht → nichts überschreiben
  if (!rows.length && COLS.some(c => data[c].length) && srvU.size) throw new Error('Server liefert keine Daten – bitte neu anmelden');
  const next = Object.fromEntries(COLS.map(c => [c, []]));
  srvU.clear(); since = '';
  for (const r of rows) {
    if (!COLS.includes(r.collection)) continue;
    next[r.collection].push(r.data); srvU.set(r.id, r.updated_at || '');
    if (r.updated_at && r.updated_at > since) since = r.updated_at;
  }
  const changed = COLS.some(c => !same(next[c], data[c]));
  data = next;
  for (const [id, op] of outbox) { if (op.op === 'up') setLocal(op.col, op.rec); else dropLocal(id); }
  // Was während des Ladens live kam, ist neuer als der geladene Stand
  let nachgereicht = false;
  for (const [art, x] of live) nachgereicht = (art === 'up' ? x.updated_at > (srvU.get(x.id) || '') && applyRow(x) : srvU.has(x) && applyDelete(x)) || nachgereicht;
  lastSyncAt = Date.now(); lastIdCheck = Date.now(); synced = true; lastErr = '';
  idbWrite('rec', rows.filter(r => COLS.includes(r.collection)).map(r => [r.id, { c: r.collection, d: r.data, u: r.updated_at || '' }]), [], true);
  idbWrite('meta', [['since', since], ['user', userId], ['at', lastSyncAt]]);
  await ensureDefaults();
  if (changed || nachgereicht) emit();
  setStatus();
}
/** Nur Änderungen seit dem letzten Stand (+ gelöschte Datensätze, höchstens alle 2 Min. geprüft) */
async function catchUp({ ids = false } = {}) {
  if (!since) return fullSync();
  let changed = false;
  const ab = new Date(Date.parse(since) - 120000).toISOString();   // 2 Min. Überlappung gegen spät sichtbare Schreibvorgänge
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await sb.from('records').select('id,collection,data,updated_at').neq('collection', 'dateien').gt('updated_at', ab).order('updated_at').range(from, from + 999);
    if (error) throw error;
    for (const r of rows) changed = applyRow(r) || changed;
    if (rows.length < 1000) break;
  }
  if (ids || Date.now() - lastIdCheck > 120000) {
    const serverIds = new Set((await fetchAll('id')).map(r => r.id));
    if (!serverIds.size && srvU.size) throw new Error('Server liefert keine Daten – bitte neu anmelden');
    for (const c of COLS) for (const r of [...data[c]]) if (!serverIds.has(r.id) && srvU.has(r.id)) changed = applyDelete(r.id) || changed;
    lastIdCheck = Date.now();
  }
  lastSyncAt = Date.now(); synced = true; lastErr = '';
  idbWrite('meta', [['since', since], ['user', userId], ['at', lastSyncAt]]);
  if (changed) emit();
  setStatus();
}

function subscribe() {
  if (!sb) return;
  if (chan) { try { sb.removeChannel(chan); } catch { /* egal */ } }
  live = false;
  const onRow = p => {
    if (!p.new?.id || !p.new.data || typeof p.new.data !== 'object' || p.errors?.length) { nachladen(); return; }   // gekürzt (sehr großer Datensatz)
    if (applyRow(p.new)) emitSoon();
  };
  const onDel = p => { if (applyDelete(p.old?.id)) emitSoon(); };
  chan = sb.channel('crm-records')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'records', filter: 'collection=neq.dateien' }, onRow)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'records', filter: 'collection=neq.dateien' }, onRow)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'records' }, onDel)
    .subscribe(st => {
      const war = live; live = st === 'SUBSCRIBED'; setStatus();
      if (live && !war && synced) catchUp().catch(syncFehler);   // nach Verbindungsabbruch Lücke schließen
    });
}
const nachladen = (() => { let t = 0; return () => { clearTimeout(t); t = setTimeout(() => catchUp().catch(syncFehler), 400); }; })();
function syncFehler(e) { lastErr = e?.message || String(e); console.warn('Sync', e); setStatus(); }

// ---- Warteschlange: eigene Änderungen zum Server
const netzfehler = e => !e?.code || /fetch|network|Load failed|timeout|abort|JWT|row-level security/i.test(e.message || '') || /^(PGRST30|401|403|42501|5)/.test(String(e.code));
function queue(id, op) {
  outbox.set(id, op);
  idbWrite('outbox', [[id, op]]);
  setStatus(); planFlush(30);
}
function planFlush(ms) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms); }
export async function flush() {
  if (!cloud || !sb || flushing || !outbox.size) return;
  if (!navigator.onLine) { setStatus(); return; }
  flushing = true; setStatus();
  const done = [];
  try {
    const ops = [...outbox.entries()];
    const ups = ops.filter(([, o]) => o.op === 'up'), dels = ops.filter(([, o]) => o.op === 'del');
    for (let i = 0; i < ups.length; i += 200) {
      const part = ups.slice(i, i + 200);
      const rows = part.map(([id, o]) => ({ id, collection: o.col, data: o.rec, updated_at: new Date().toISOString() }));
      let { data: back, error } = await sb.from('records').upsert(rows).select('id,updated_at');
      if (error && !netzfehler(error) && part.length > 1) {          // einen kaputten Datensatz finden, Rest trotzdem speichern
        back = [];
        for (const r of rows) { const x = await sb.from('records').upsert(r).select('id,updated_at'); if (x.error) { if (netzfehler(x.error)) throw x.error; verwerfen(r.id, x.error); done.push([r.id, outbox.get(r.id)]); } else back.push(...x.data); }
        error = null;
      }
      if (error) { if (netzfehler(error)) throw error; part.forEach(([id]) => verwerfen(id, error)); }
      for (const r of back || []) { srvU.set(r.id, r.updated_at); if (r.updated_at > since) since = r.updated_at; }
      done.push(...part);
    }
    for (let i = 0; i < dels.length; i += 100) {
      const part = dels.slice(i, i + 100);
      const { error } = await sb.from('records').delete().in('id', part.map(([id]) => id));
      if (error) { if (netzfehler(error)) throw error; part.forEach(([id]) => verwerfen(id, error)); }
      part.forEach(([id]) => srvU.delete(id));
      done.push(...part);
    }
    backoff = 0; lastErr = '';
  } catch (e) {
    backoff = Math.min(60000, backoff ? backoff * 2 : 2000);
    lastErr = !navigator.onLine ? '' : /JWT|row-level security|PGRST30|401|403|42501/i.test((e.message || '') + (e.code || '')) ? 'Anmeldung abgelaufen – bitte neu anmelden, dann wird gesendet' : (e.message || 'Verbindung gestört');
    planFlush(backoff);
  } finally {
    const weg = [];
    for (const [id, op] of done) if (outbox.get(id) === op) { outbox.delete(id); weg.push(id); }   // in der Zwischenzeit neu geändert? dann bleibt es drin
    if (weg.length) idbWrite('outbox', [], weg);
    // Kam während der Übertragung ein neuerer Stand eines anderen Geräts an, gilt der (zuletzt beim Server = gültig)
    let neu = false;
    for (const id of weg) { const r = spaet.get(id); spaet.delete(id); if (r && r.updated_at && r.updated_at > (srvU.get(id) || '')) neu = applyRow(r) || neu; }
    if (neu) emitSoon();
    flushing = false; setStatus();
    if (outbox.size && !backoff) planFlush(50);
  }
}
function verwerfen(id, e) { toast('Speichern fehlgeschlagen: ' + (e.message || e), 'err'); console.error('Datensatz abgelehnt', id, e); }
addEventListener('online', () => { backoff = 0; setStatus(); flush(); resume({ force: true }); });
addEventListener('offline', setStatus);
setInterval(() => { if (outbox.size && !flushing && !backoff) flush(); }, 30000);

let lastResume = 0;
/** Beim Zurückkehren in die App, bei „online“ und Fokus: Warteschlange senden, Live-Verbindung prüfen, Lücke schließen */
export async function resume({ force = false } = {}) {
  if (!cloud || !sb || !angemeldet) return;
  if (!force && Date.now() - lastResume < 8000) return;
  lastResume = Date.now();
  if (!synced) { try { await fullSync(); } catch (e) { syncFehler(e); return; } subscribe(); flush(); return; }
  flush();
  if (!live) subscribe();
  try { await catchUp({ ids: force }); } catch (e) { syncFehler(e); }
}
/** „Aktualisieren“: alles frisch vom Server */
export async function reload() { if (!cloud) return; await flush(); try { await fullSync(); } catch (e) { syncFehler(e); throw e; } }

export const all = col => data[col];
export const get = (col, id) => data[col].find(r => r.id === id);
export async function save(col, rec) {
  const now = new Date().toISOString();
  if (!rec.id) { rec.id = uid(); rec.created = now; data[col].push(rec); }
  else if (!data[col].includes(rec)) { const i = data[col].findIndex(r => r.id === rec.id); if (i >= 0) data[col][i] = rec; else { rec.created ||= now; data[col].push(rec); } }
  rec.updated = now;
  if (!cloud) { saveLocal(); emit(); return rec; }
  const snap = JSON.parse(JSON.stringify(rec));
  queue(rec.id, { op: 'up', col, rec: snap });
  cacheLater(rec.id, { c: col, d: snap, u: srvU.get(rec.id) || '' });
  emit(); return rec;
}
export async function del(col, id) {
  data[col] = data[col].filter(r => r.id !== id);
  if (!cloud) { saveLocal(); emit(); return; }
  queue(id, { op: 'del', col }); cacheLater(id, null);
  emit();
}
// Viele Datensätze auf einmal löschen (ein Neuzeichnen am Ende; Übertragung gebündelt über die Warteschlange)
export async function delMany(col, ids, onProgress) {
  const set = new Set(ids);
  data[col] = data[col].filter(r => !set.has(r.id));
  if (!cloud) { saveLocal(); emit(); onProgress && onProgress(ids.length, ids.length); return ids.length; }
  const puts = ids.map(id => [id, { op: 'del', col }]);
  for (const [id, op] of puts) { outbox.set(id, op); dirty.set(id, null); }
  await idbWrite('outbox', puts); cacheNow();
  emit(); setStatus(); onProgress && onProgress(ids.length, ids.length);
  await flush();
  return ids.length;
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

// Über die Warteschlange zum Server (für ensureDefaults)
async function persist(col, rec) { if (!cloud) return saveLocal(); const snap = JSON.parse(JSON.stringify(rec)); queue(rec.id, { op: 'up', col, rec: snap }); cacheLater(rec.id, { c: col, d: snap, u: srvU.get(rec.id) || '' }); }
async function unpersist(col, id) { if (!cloud) return saveLocal(); queue(id, { op: 'del', col }); cacheLater(id, null); }
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
    for (const [name, kategorie, betreff, text] of TPL) { const r = { id: idFor('tpl', name), name, kategorie, betreff, text, created: new Date().toISOString() }; data.templates.push(r); if (cloud) await persist('templates', r); }
    if (!cloud) saveLocal();
  } else if (data.templates.length && !(data.settings[0]?.tplVersion >= 2)) {
    // Kapitalanlagevertrieb: alte Makler-Standardvorlagen (unverändert) entfernen, neue Vorlagen einmalig ergänzen
    for (const t of [...data.templates]) if (/Immobilienmakler in der Region|Angebot zur Vermarktung Ihrer Immobilie/.test(t.text || '')) { data.templates = data.templates.filter(x => x !== t); if (cloud) await unpersist('templates', t.id); }
    for (const [name, kategorie, betreff, text] of TPL) if (!data.templates.some(t => t.name === name)) { const r = { id: idFor('tpl', name), name, kategorie, betreff, text, created: new Date().toISOString() }; data.templates.push(r); if (cloud) await persist('templates', r); }
    data.settings[0] = { ...data.settings[0], tplVersion: 2 }; if (cloud) await persist('settings', data.settings[0]);
    if (!cloud) saveLocal();
  }
  if (data.templates.length && !(data.settings[0]?.tplVersion >= 3)) {
    // WhatsApp-Textbausteine einmalig ergänzen
    for (const [name, kategorie, betreff, text] of TPL) if (kategorie === 'WhatsApp' && !data.templates.some(t => t.name === name)) { const r = { id: idFor('tpl', name), name, kategorie, betreff, text, created: new Date().toISOString() }; data.templates.push(r); if (cloud) await persist('templates', r); }
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
