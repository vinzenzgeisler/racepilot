# Nennungsunterlagen und Orga-Code (#116)

## Abgeleitete Fachregeln

- Unterlagen sind Event-Vorlagen mit Name, Pflichtkennzeichen und Hinweis. Uploads sind eigene, tenant- und nennungsgebundene Datensätze. Pro Vorlage und Nennung gibt es höchstens einen aktiven Upload; ein erneuter Upload ersetzt die vorherige Datei nicht still, sondern erhält eine nachvollziehbare Revision.
- Der Uploadstatus folgt `missing -> uploaded -> reviewed | rejected`. Ablehnung benötigt einen Grund; erneuter Upload startet wieder bei `uploaded`. Prüfung und Ablehnung werden mit Akteur und UTC-Zeitpunkt protokolliert.
- Vollständigkeit wird aus konfigurierten Pflichttypen und deren aktuellen Upload-Datensätzen berechnet. Optionale Typen zählen nicht. Zahlung und Haftverzicht bleiben eigenständige, typisierte Statuszeilen und sind niemals Dokument-Uploads.
- Dateiinhalte liegen ausschließlich im bestehenden tenant-scoped ObjectStorage-Port. Dokumentmetadaten/Audit sind relational. Soft-Delete einer Nennung löscht die Datei nicht: die Datei wird wie die Nennungsdaten bis zum Ende der für Nennungen geltenden Aufbewahrungsfrist behalten. #119 löscht ausschließlich abgelaufene, noch nicht gebundene Uploads; gebundene Unterlagen werden durch diesen Cleanup nicht erfasst. Eine endgültige Nennungsbereinigung muss Metadaten und Storage-Objekte gemeinsam, tenant-scoped und retryfähig löschen; diese Issue liefert keinen automatischen Hard-Delete und vermeidet dadurch vorzeitigen Datenverlust.
- Orga-Codes sind persistente Event-/Nennungskennungen: `<Event-Präfix>-<5-stellige Base36-Sequenz>`, Sequenz beginnend bei `00001` und pro Event durch eine transaktionale Datenbanksequenz eindeutig vergeben. Das Event-Präfix ist optional konfigurierbar (1–12 alphanumerische Zeichen, normalisiert auf Großbuchstaben); sonst wird der bereinigte Event-Slug (erste 8 alphanumerische Zeichen), ersatzweise `NEN`, verwendet. Bestehende Nennungen werden in stabiler Erstellungsreihenfolge nachgezogen.
- Der Wert steht als `orgaCode`-Mailvariable und in der Bestätigungsprojektion (PDF) als `orgaCodes` für Verwendungszweck-/Mailvorlagen bereit.

Die MSC-Referenz berechnet Codes aus Event und Fahrer via MD5/Base36; das erzeugt keine garantierte Eindeutigkeit (Hash-Kollisionen) und bindet Identität an die Person statt an die konkrete Nennung. RacePilot verwendet daher eine DB-gesicherte, nennungsbezogene Sequenz.

## API

Admin-Listenprojektion enthält Code und Dokumentenzähler; Vorschau/Detail enthalten zusätzlich typisierte Unterlagen- und Statuszeilen. Uploads, Prüfung und Ablehnung sind serverseitige Use Cases mit Tenant-/Entry-Ownership-Prüfung und `entry:write`; lesende Projektionen erfordern `entry:read`.
