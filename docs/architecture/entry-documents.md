# Nennungsunterlagen und Orga-Code (#116)

## Abgeleitete Fachregeln

- Unterlagen sind Event-Vorlagen mit Name, Pflichtkennzeichen und Hinweis. Uploads sind eigene, tenant- und nennungsgebundene Datensätze. Pro Vorlage und Nennung gibt es höchstens einen aktiven Upload; ein erneuter Upload ersetzt die vorherige Datei nicht still, sondern erhält eine nachvollziehbare Revision.
- Der Uploadstatus folgt `missing -> uploaded -> reviewed | rejected`. Ablehnung benötigt einen Grund; erneuter Upload startet wieder bei `uploaded`. Prüfung und Ablehnung werden mit Akteur und UTC-Zeitpunkt protokolliert.
- Vollständigkeit wird aus konfigurierten Pflichttypen und deren aktuellen Upload-Datensätzen berechnet. Optionale Typen zählen nicht. Zahlung und Haftverzicht bleiben eigenständige, typisierte Statuszeilen und sind niemals Dokument-Uploads.
- Dateiinhalte liegen ausschließlich im bestehenden tenant-scoped ObjectStorage-Port. Dokumentmetadaten/Audit sind relational. Bei Nennungs-Löschung werden zugeordnete Objekte über den Storage-Port gelöscht; ein fehlgeschlagener Löschlauf muss wiederholbar bleiben. Die bestehende Aufbewahrungs-/Löschpolitik hat Vorrang; Dokumente erben keine unbegrenzte Aufbewahrung.
- Orga-Codes sind persistente Event-/Nennungskennungen: `<getrimmtes Event-Präfix>-<5-stellige Base36-Sequenz>`, Sequenz beginnend bei `00001` und pro Event durch eine transaktionale Datenbanksequenz eindeutig vergeben. Ohne gesetztes Präfix wird `NEN-<Sequenz>` verwendet. Bestehende Nennungen werden in stabiler Erstellungsreihenfolge nachgezogen.
- Die MSC-Referenz berechnet Codes aus Event und Fahrer via MD5/Base36; das erzeugt keine garantierte Eindeutigkeit (Hash-Kollisionen) und bindet Identität an die Person statt an die konkrete Nennung. RacePilot verwendet daher eine DB-gesicherte, nennungsbezogene Sequenz.

## API

Admin-Listenprojektion enthält Code und Dokumentenzähler; Vorschau/Detail enthalten zusätzlich typisierte Unterlagen- und Statuszeilen. Uploads, Prüfung und Ablehnung sind serverseitige Use Cases mit Tenant-/Entry-Ownership-Prüfung und `entry:write`; lesende Projektionen erfordern `entry:read`.
