// Speicherdienst (Supabase, nur REST). Alles Inhaltliche ist vorher verschlüsselt – der Dienst sieht nur Zufallskennungen und Chiffretext.
import { openBytes, openJson, sealBytes, sealJson } from '../partner/crypto.js';

const H = (sb, extra = {}) => ({ apikey: sb.key, Authorization: 'Bearer ' + sb.key, ...extra });
const base = (sb) => sb.url.replace(/\/+$/, '');
const fail = async (r, what) => { throw new Error(`${what} (${r.status}${r.status === 401 || r.status === 403 ? ' – Zugriff verweigert' : r.status === 404 ? ' – Tabelle/Speicher nicht eingerichtet' : ''})`); };

/** Lädt neue Einträge der angegebenen Verläufe (id > since) und entschlüsselt sie. */
export async function fetchEvents(sb, threads, since = 0) {
  const ids = Object.keys(threads), out = [];
  for (let i = 0; i < ids.length; i += 20) {
    const part = ids.slice(i, i + 20);
    for (let from = since; ;) {
      const r = await fetch(`${base(sb)}/rest/v1/msgs?select=id,thread,body,created_at&thread=in.(${part.join(',')})&id=gt.${from}&order=id.asc&limit=1000`, { headers: H(sb), cache: 'no-store' });
      if (!r.ok) await fail(r, 'Nachrichten konnten nicht geladen werden');
      const rows = await r.json();
      for (const row of rows) {
        try { out.push({ ...(await openJson(threads[row.thread].k, JSON.parse(row.body))), rid: row.id, tid: row.thread, at: Date.parse(row.created_at) }); } catch { /* fremder oder beschädigter Eintrag */ }
      }
      if (rows.length < 1000) break;
      from = rows[rows.length - 1].id;
    }
  }
  return out.sort((a, b) => a.rid - b.rid);
}

export async function postEvent(sb, tid, key, ev) {
  const body = JSON.stringify(await sealJson(key, ev));
  const r = await fetch(`${base(sb)}/rest/v1/msgs`, { method: 'POST', headers: H(sb, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify({ thread: tid, body }) });
  if (!r.ok) await fail(r, 'Nachricht konnte nicht gesendet werden');
}

const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Verschlüsselt und lädt eine Datei hoch; gibt den Pfad zurück. */
export async function putFile(sb, tid, key, bytes) {
  const path = `${tid}/${rid()}`;
  const r = await fetch(`${base(sb)}/storage/v1/object/hw/${path}`, { method: 'POST', headers: H(sb, { 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' }), body: await sealBytes(key, bytes) });
  if (!r.ok) await fail(r, 'Datei konnte nicht hochgeladen werden');
  return path;
}
const cache = new Map();
export async function getFile(sb, path, key, type) {
  const ck = path;
  if (cache.has(ck)) return cache.get(ck);
  const r = await fetch(`${base(sb)}/storage/v1/object/hw/${path}`, { headers: H(sb) });
  if (!r.ok) await fail(r, 'Datei konnte nicht geladen werden');
  const url = URL.createObjectURL(new Blob([await openBytes(key, await r.arrayBuffer())], { type: type || 'application/octet-stream' }));
  cache.set(ck, url);
  return url;
}

export async function testConnection(sb) {
  try {
    const r = await fetch(`${base(sb)}/rest/v1/msgs?select=id&limit=1`, { headers: H(sb), cache: 'no-store' });
    if (r.status === 401 || r.status === 403) return 'Schlüssel ungültig oder ohne Zugriff.';
    if (r.status === 404) return 'Tabelle „msgs“ fehlt – bitte zuerst das Einrichtungs-Skript in Supabase ausführen.';
    if (!r.ok) return 'Speicherdienst meldet Fehler ' + r.status;
    return '';
  } catch { return 'Adresse nicht erreichbar.'; }
}

export const SQL = `-- Einmalig im Supabase-Dashboard unter „SQL Editor“ ausführen
create table if not exists public.msgs (
  id bigint generated always as identity primary key,
  thread text not null check (char_length(thread) = 24),
  body text not null check (char_length(body) < 30000),
  created_at timestamptz not null default now()
);
create index if not exists msgs_thread_id on public.msgs (thread, id);
alter table public.msgs enable row level security;
drop policy if exists "msgs lesen" on public.msgs;
drop policy if exists "msgs schreiben" on public.msgs;
create policy "msgs lesen" on public.msgs for select to anon using (true);
create policy "msgs schreiben" on public.msgs for insert to anon with check (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('hw', 'hw', false, 15728640) on conflict (id) do nothing;
drop policy if exists "hw lesen" on storage.objects;
drop policy if exists "hw hochladen" on storage.objects;
create policy "hw lesen" on storage.objects for select to anon using (bucket_id = 'hw');
create policy "hw hochladen" on storage.objects for insert to anon with check (bucket_id = 'hw');
-- Löschen und Ändern ist für die Handwerker-Seite bewusst nicht erlaubt.
`;
