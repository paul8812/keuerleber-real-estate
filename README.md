# Keuerleber Immobilien

Moderne, mehrsprachige One-Page-Website für Keuerleber Immobilien (Oberkotzau).

Die Website ist aktuell im **Coming-Soon-Modus** und passwortgeschützt:
Der gesamte Seiteninhalt ist AES-256-verschlüsselt und wird erst nach Eingabe
des korrekten Passworts im Browser entschlüsselt.

## Features
- Dark-Design mit Champagner-Gold-Akzenten
- Mehrsprachig: Deutsch / English / Español
- Immobilien-Listings mit Detail-Ansicht
- Homestaging Vorher/Nachher-Slider
- Marktwerteinschätzung & Investment-Bereich
- Online-Terminbuchung mit Kalender
- Voll responsive (Desktop / Tablet / Handy)

## Aufbau der Startseite (Stand Oktober 2026)
Die Startseite (`index.html`) ist in vier Bereiche mit Tabs gegliedert; jeder Tab ist ein bestehender Abschnitt mit eigener ID (Deep-Links wie `/#rechner` öffnen den passenden Tab):

| Bereich | Tabs (Abschnitts-IDs) |
|---|---|
| Objekte (`#hub-objekte`) | Kaufen (`#immobilien`) · Mieten (`#vermietung`) |
| Konzept (`#hub-konzept`) | `#konzept` · `#wege` · `#kapitalanlage` · `#ablauf` |
| Steuer & Rendite (`#hub-steuer`) | `#steuervorteil` · `#rechner` · `#vergleich` |
| Projekte (`#hub-projekte`) | `#sanierung` · `#referenz` · `#investment` · `#lage` |

Dazu: Themenseiten unter `kapitalanlage-hof/`, `restnutzungsdauer-gutachten/`, `eigentumswohnung-kaufen-hof/` (gemeinsames Stylesheet `lp.css`), CRM unter `crm/`, Rendite-Rechner unter `rendite/`, Schriften unter `fonts/` (selbst gehostet), Logos unter `logo/`, `404.html`, `sitemap.xml`, `llms.txt`.
Der Intro-Film läuft nur beim ersten Besuch einer Sitzung und nicht bei Direktlinks.
