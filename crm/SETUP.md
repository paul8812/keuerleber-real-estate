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
- Damit CRM-Termine in **Outlook** erscheinen: in Outlook unter Einstellungen → Konten das Google-Konto hinzufügen. Nach dem ersten Klick auf „Kalender synchronisieren“ gleicht das CRM alle 10 Minuten automatisch ab, solange es geöffnet ist.

## E-Mail (Outlook / Strato) – Mail-Abgleich
Läuft auf Pauls Mac im Ordner `~/crm-mailsync` (launchd, alle 3 Minuten, nur Python-Standardbibliothek). Er liest das Strato-Postfach per IMAP (nur lesend, Mails bleiben ungelesen) und schreibt mit Pauls CRM-Login in die `records`-Tabelle:
- Website-Formulare (Kontakt, Objekt, Termin, Vorab-Liste, Renditerechner) und ImmoScout24/Immowelt/Kleinanzeigen → Kontakt, Vorgang, Aufgabe „Erstkontakt“ (gleicher Schlüssel wie die Regel „Neuer Interessent“), Terminwunsch als Termin „(angefragt)“.
- Mail eines Kontakts → Verlauf + Aufgabe „Antworten“; gesendete Antwort → Verlauf, Antwort-Aufgaben werden erledigt.
- Unbekannte Absender → Sammlung `mails` (Menü *Posteingang*). Status des Abgleichs → Sammlung `sync` (Datensatz `mailsync`).
- Einrichten: im Ordner `crm-mailsync` doppelt auf „Einrichten.command“ klicken (Postfach- und CRM-Passwort eingeben; gespeichert wird nur das Postfach-Passwort und ein CRM-Token, in `~/.config/keuerleber-crm/zugang.json`, nur für Paul lesbar).
- Keine Mail-Inhalte ins Repo: der Abgleich liegt bewusst außerhalb von `~/keuerleber-real-estate` (der Immo-Manager veröffentlicht diesen Ordner per `git add -A`).

## Website-Anfragen direkt ins CRM
- Alle Formulare der Website (Beratungs-Popup, Kontakt, Objekt, Termin, Vorab-Liste, Renditerechner) spiegeln jede Anfrage zusätzlich per `lead-sync.js` in die Supabase-Tabelle `website_anfragen` (nur Einfügen für `anon`; lesen/löschen nur der CRM-Inhaber). Die Mail über Web3Forms bleibt als Sicherheit bestehen.
- Das CRM holt neue Zeilen alle 2 Minuten (solange offen, sowie beim Öffnen/Fokus) ab → Kontakt (Quelle „Website“, Dubletten über E-Mail/Telefon), Vorgang „Anfrage“, Verlauf, Aufgabe „Rückruf“ bzw. „beantworten“ – danach wird die Zeile gelöscht. Unabhängig vom Mail-Abgleich auf dem Mac.
- Einmalige Einrichtung: *Automationen → Website-Anfragen → CRM* → „SQL kopieren“ → im Supabase-SQL-Editor ausführen.

## Objekte & Website
- Das CRM ist die Quelle für die Objekte auf der Website. „Website aktualisieren“ (Objekte) bzw. „Auf Website veröffentlichen / Von Website entfernen“ (Objektansicht) schreibt über die GitHub-API: `index.html` (Block zwischen `/*IMMO_START*/` und `/*IMMO_END*/`), die Karten auf `eigentumswohnung-kaufen-hof/` (zwischen `<!--OBJEKTE_START-->`/`<!--OBJEKTE_END-->`) und die Bild-Einträge der `sitemap.xml` (`<!--OBJEKTBILDER_START-->`). Die Ausgabe entspricht exakt dem früheren `tools/publish.rb` des Immo-Managers (Teaser-Logik, Kurzkalkulation).
- Einmalig: Einstellungen → Website → Fine-grained GitHub-Token (nur dieses Repo, Contents: Read and write). Der Token wird nicht in Backups geschrieben.
- Fotos aus dem CRM landen in `objektbilder/` – das Repo ist öffentlich, also nur Fotos hochladen, die gezeigt werden dürfen. „Weitere Fotos auf Anfrage“ als Anzahl pflegen.
- Status „Verkauft / Vermietet“ oder „Archiv“ nimmt ein Objekt beim nächsten Veröffentlichen von der Website.

## Finanzen
- Menü *Finanzen*: Einnahmen/Ausgaben (Sammlung `buchungen`), Rechnungen (`rechnungen`, Nummern RE-JJJJ-NNN), Übersicht mit Gewinn und USt-Zahllast, CSV-Export für den Steuerberater.
- Rechnung aus Eckdaten: Vorgang wählen → Empfänger, Objekt, Kaufpreis, Provision (Einstellungen) werden übernommen; Druck/PDF im Keuerleber-Design. „Als bezahlt buchen“ erzeugt die Einnahme.
- Automationen: abgeschlossener Vorgang ohne Rechnung → „Rechnung stellen“, überfällige Rechnung → „Zahlung anmahnen“.
- Pflichtangaben (§ 14 UStG) unter Einstellungen → Rechnungen & Steuer pflegen (Steuernummer/USt-IdNr., IBAN, Anschrift).

## Automationen (neu)
- **📋 Anfrage einfügen** (Übersicht oder „+ Neu“): Anfrage-Text reinkopieren → Name, Mail, Telefon, Quelle und Objekt werden erkannt; Kontakt, Vorgang und Aufgaben entstehen automatisch. Bekannte Kontakte werden zugeordnet statt doppelt angelegt.
- **Pipeline-Schritte:** Jede Phase erzeugt die passende nächste To-do; beim Weiterschieben hakt sich die alte ab.
- **Termin bestätigen** am Vortag, **Suchprofil erfragen** bei neuen Interessenten, **Doppelte Kontakte**, **Aktives Objekt nicht online**.
- **Selbst-erledigend:** Anruf/Mail/Treffen beim Kontakt eingetragen (oder 📞/✉ in der Aufgabe geklickt) → Kontakt-Aufgaben haken sich ab.
- In jeder Aufgabe: 📞 anrufen, ✉ mailen, ⏭ auf morgen schieben.
Alle Regeln sind unter „Automationen“ einzeln abschaltbar.

## KI-Belegerkennung
- Einmalig: Einstellungen → 🤖 KI-Belegerkennung → Anthropic-Schlüssel (console.anthropic.com → API Keys) einfügen → „Speichern & testen“.
- Finanzen → **📷 Belege hochladen** (am Handy öffnet sich die Kamera) oder Dateien auf die Seite ziehen. Fotos und PDFs, mehrere gleichzeitig.
- Die KI erkennt Datum, Lieferant, Rechnungsnummer, Beträge je Steuersatz, Kategorie, Konto (SKR03-Vorschlag), Zahlart und das Objekt. Danach wird automatisch gebucht; der Beleg wird gespeichert (📎 in der Buchung).
- Unsichere Belege oder Belege mit Hinweis (z. B. Bewirtung) landen unter „⚠ Zu prüfen“ und erzeugen eine Aufgabe. Doppelte Belege werden erkannt und übersprungen. Offene Eingangsrechnungen → Aufgabe „Rechnung bezahlen“; sie zählen erst nach Zahlung in der Übersicht (EÜR).
- Kosten: ca. 1–2 Cent pro Beleg.
