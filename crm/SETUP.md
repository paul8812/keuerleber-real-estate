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

### Live-Abgleich zwischen Geräten (Handy, Mac, Tablet)
- Einmalig im SQL-Editor ausführen: `SYNC_SQL` aus `js/db.js` (steckt auch im „SQL kopieren“ der Ersteinrichtung). Es setzt die Änderungszeit serverseitig, legt einen Index an und gibt `records` und `website_anfragen` für Supabase Realtime frei.
- Jedes Gerät hält einen eigenen Stand im Gerätespeicher (IndexedDB): Start ohne Warten, Lesen und Erfassen auch ohne Netz.
- Speichern ist sofort sichtbar; eine Warteschlange schickt die Änderung zum Server – auch nach Funkloch oder wenn das Handy die App zwischendurch beendet. Beim Abmelden bleiben nur noch nicht gesendete Änderungen auf dem Gerät, bis sie raus sind.
- Änderungen anderer Geräte, des Mail-Abgleichs und neue Website-Anfragen kommen per Realtime sofort an; nach Ruhezustand/Funkloch werden nur die Änderungen seitdem nachgeladen (plus Abgleich gelöschter Einträge).
- Punkt oben rechts: grün = live, gold mit Zahl = wird gesendet, „Offline · n“ = n Änderungen warten auf Netz. Antippen = sofort abgleichen. Herunterziehen auf dem Handy = alles neu laden.
- Gleicher Datensatz auf zwei Geräten gleichzeitig geändert: der zuletzt beim Server angekommene Stand gilt auf allen Geräten.
- App-Dateien hält ein Service Worker (`sw.js`) für das Öffnen ohne Netz vor; online wird immer die aktuelle Fassung geladen.

## Sicherheit
- Der Anon-Key ist öffentlich vorgesehen; Schutz erfolgt über Login + Row Level Security (jeder sieht nur eigene Zeilen).
- Das GitHub-Repo ist öffentlich: **keine echten Kundendaten ins Repo committen** (nur Code). Daten liegen in Supabase.
- Für DSGVO: Auftragsverarbeitungsvertrag mit Supabase abschließen, Einwilligungs-Häkchen bei Kontakten pflegen.
- Wöchentliches Backup (*Einstellungen → Backup*).

## Automationen & Google
- *Automationen* im Menü: Regeln einzeln ein-/ausschaltbar, Fristen einstellbar. Sie laufen, solange das CRM im Browser geöffnet ist (Start, alle 5 Min., beim Zurückkehren in den Tab).
- Google Kalender/Kontakte: Client-ID gemäß Anleitung in *Automationen → Google* erstellen, dort eintragen, „Kalender synchronisieren“ klicken. Die Anmeldung läuft direkt zwischen deinem Browser und Google.
- Damit CRM-Termine in **Outlook** erscheinen: in Outlook unter Einstellungen → Konten das Google-Konto hinzufügen. Nach dem ersten Klick auf „Kalender synchronisieren“ gleicht das CRM alle 10 Minuten automatisch ab, solange es geöffnet ist.

## E-Mail (Outlook / Strato) – Mail-Abgleich (Server)
Läuft seit 22.10.2026 auf dem Server: Supabase Edge Function `mailsync` (Quelltext: `supabase/functions/mailsync/index.ts`), alle 3 Minuten aufgerufen von pg_cron (Job `crm-mailsync`). Unabhängig vom Mac. Liest das Strato-Postfach per IMAP (nur lesend, BODY.PEEK – Mails bleiben ungelesen) und schreibt mit dem Service-Schlüssel in `records`:
- Website-Formulare (Kontakt, Objekt, Termin, Vorab-Liste, Renditerechner) und ImmoScout24/Immowelt/Kleinanzeigen → Kontakt, Vorgang, Aufgabe „Erstkontakt“, Terminwunsch als Termin „(angefragt)“. Website-Anfragen, die schon über `website_anfragen` kamen (lead-sync.js), werden nicht doppelt angelegt. Kam eine Website-Anfrage nur per Mail (lead-sync im Browser blockiert), schickt der Abgleich die Telegram-Nachricht selbst (`mailsync_push`, nur für Mails < 2 Std.).
- Mail eines Kontakts → Verlauf + Aufgabe „Antworten“; gesendete Antwort → Verlauf, Antwort-Aufgaben werden erledigt.
- Unbekannte Absender → Sammlung `mails` (Menü *Posteingang*). Status → Sammlung `sync` (Datensatz `mailsync`, `ort: "server"`).
- Einrichtung (einmalig, schon erledigt): `mailsyncSQL()` aus `crm/js/db.js` im SQL-Editor ausführen (Tabelle `privat.mailsync`, RPCs, Cron-Job), Edge Function `mailsync` im Dashboard bereitstellen (Editor, JWT-Prüfung an). Danach im CRM *Automationen → E-Mail* das Strato-Passwort eintragen → „Server-Abgleich aktivieren“. Das Passwort liegt verschlüsselt im Supabase Vault (`mailsync_imap`); die Funktion holt es über `mailsync_start()` (nur `service_role`, geschützt durch den Zufallswert in `privat.mailsync.geheim`, Sperre gegen Doppelläufe).
- Testen ohne echtes Postfach: Prüfstand mit falschem IMAP-Server und Supabase-Attrappe (siehe PR); die Logik entspricht 1:1 dem früheren `crm_mailsync.py`.
- Der frühere Mac-Abgleich (`~/crm-mailsync`, launchd) ist abgelöst und kann mit „Entfernen.command“ gelöscht werden.

## Website-Anfragen direkt ins CRM
- Alle Formulare der Website (Beratungs-Popup, Kontakt, Objekt, Termin, Vorab-Liste, Renditerechner) spiegeln jede Anfrage zusätzlich per `lead-sync.js` in die Supabase-Tabelle `website_anfragen` (nur Einfügen für `anon`; lesen/löschen nur der CRM-Inhaber). Die Mail über Web3Forms bleibt als Sicherheit bestehen.
- Das CRM holt neue Zeilen alle 2 Minuten (solange offen, sowie beim Öffnen/Fokus) ab → Kontakt (Quelle „Website“, Dubletten über E-Mail/Telefon), Vorgang „Anfrage“, Verlauf, Aufgabe „Rückruf“ bzw. „beantworten“ – danach wird die Zeile gelöscht. Unabhängig vom Mail-Abgleich auf dem Mac.
- Einmalige Einrichtung: *Automationen → Website-Anfragen → CRM* → „SQL kopieren“ → im Supabase-SQL-Editor ausführen.
- Sofort-Push (Telegram) und Sofort-Antwort (Resend): Datenbank-Trigger auf `website_anfragen` (pg_net). Token/Schlüssel liegen in `privat.sofort` (Schema nicht über die API erreichbar, keine Rechte für anon/authenticated) und werden nur über `sofort_setzen()` gesetzt; `sofort_status()` liefert nur an/aus. Einrichtung im CRM: Token bzw. API-Key einfügen → „Aktivieren“. Das einmalige SQL (`SOFORT_SQL`, ohne Geheimnisse) ist bereits ausgeführt; sonst zeigt die Karte es an.

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

### Social-Media-Dashboard (Menü „Social Media“)
- Zahlen kommen aus **Metricool** (Marke „keuerleberimmobilien“). Eine geplante Aufgabe holt sie jeden Morgen um 05:47 Uhr und schickt sie über `social_push()` ins CRM (Datensatz `social/social-stats`, per Realtime sofort auf allen Geräten).
- Server-Teil: `SOCIAL_SQL` in `js/db.js` (bereits eingerichtet). Der Zufallswert in `privat.social` öffnet nur diese eine Funktion.
- Neue Kanäle (Instagram, Facebook, LinkedIn) einfach in Metricool verbinden – ab dem nächsten Morgen erscheinen sie im Dashboard.
- Website-Anfragen merken sich die Herkunft (Bio-Link `?utm_source=tiktok` bzw. verweisende Seite, `lead-sync.js`); das CRM setzt daraus die Quelle (TikTok, Instagram …). So zählt der Trichter „Vom Aufruf zur Anfrage“.
