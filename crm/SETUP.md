# Keuerleber CRM – Einrichtung

Aufruf: `https://keuerleber-immobilien.de/crm/` (nach Merge in `main`).

Ohne Einrichtung läuft das CRM **lokal im Browser** (Daten nur auf diesem Gerät, Backup unter *Einstellungen*).
Für Handy + PC + Cloud-Speicherung: Supabase einrichten (kostenlos, ca. 5 Minuten).

## 1. Supabase-Projekt anlegen
1. https://supabase.com → *New project* (Region: Frankfurt/EU wegen DSGVO).
2. *SQL Editor* → folgendes ausführen:

```sql
create table public.records (
  id text primary key,
  collection text not null,
  data jsonb not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index on public.records (user_id, collection);
alter table public.records enable row level security;
create policy "eigene Daten" on public.records for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

3. *Authentication → Providers → Email*: **„Allow new users to sign up“ ausschalten** (sonst könnte sich jeder registrieren).
4. *Authentication → Users → Add user*: eigene E-Mail + starkes Passwort anlegen (*Auto Confirm* an).
5. *Project Settings → API*: **Project URL** und **anon public key** kopieren.

## 2. Im CRM verbinden
*Einstellungen → Cloud-Datenbank*: URL + Key eintragen → „Speichern & neu laden“ → mit dem angelegten Benutzer anmelden.
Bereits lokal erfasste Daten: *Einstellungen → Lokale Daten in die Cloud hochladen*.

## Sicherheit
- Der Anon-Key ist öffentlich vorgesehen; Schutz erfolgt über Login + Row Level Security (jeder sieht nur eigene Zeilen).
- Das GitHub-Repo ist öffentlich: **keine echten Kundendaten ins Repo committen** (nur Code). Daten liegen in Supabase.
- Für DSGVO: Auftragsverarbeitungsvertrag mit Supabase abschließen, Einwilligungs-Häkchen bei Kontakten pflegen.
- Wöchentliches Backup (*Einstellungen → Backup*).

## Automationen & Google
- *Automationen* im Menü: Regeln einzeln ein-/ausschaltbar, Fristen einstellbar. Sie laufen, solange das CRM im Browser geöffnet ist (Start, alle 5 Min., beim Zurückkehren in den Tab).
- Google Kalender/Kontakte: Client-ID gemäß Anleitung in *Automationen → Google* erstellen, dort eintragen, „Kalender synchronisieren“ klicken. Die Anmeldung läuft direkt zwischen deinem Browser und Google.
- Echte Hintergrund-Automation bei geschlossenem Browser (z. B. E-Mail-Versand) braucht serverseitige Funktionen (Supabase Edge Functions) und ist noch nicht eingerichtet.
