# Erste lokale Testveranstaltung

Der [README-Schnellstart](../../README.md#nennbox-jetzt-lokal-nutzen-community-alpha)
startet die vollständige lokale Community-Alpha-Umgebung. Lasse dieses Terminal
geöffnet. Die folgende Einrichtung ist nur für diesen lokalen Teststack gedacht.

## 1. Veranstaltung in der Admin-App anlegen

Öffne <http://127.0.0.1:5173/app> und melde dich mit den ausgegebenen Zugangsdaten
an. Auf einer frischen Installation führt dich die App direkt zur Einrichtung.

1. Trage Name, Link-Kürzel und Veranstaltungszeitraum ein.
2. Lege mindestens eine Klasse mit Kürzel und Startgeld an. Weitere Klassen kannst
du ergänzen.
3. Hinterlege die Teilnahmebedingungen, wenn du die Nennung öffnen willst.
4. Wähle **Speichern und Nennung öffnen**, um die Veranstaltung anzulegen und die
   Registrierung über den vorgesehenen Statusübergang zu öffnen. Mit **Entwurf
   speichern** bleibt sie geschlossen.
5. Kopiere den angezeigten öffentlichen Nennungslink. Er hat die Form
   `http://127.0.0.1:5173/events/<link-kürzel>/register`.

Die Konfiguration lässt sich in der Admin-App unter **Einrichten** fortsetzen.
Weitere Formularfelder und die Darstellung des Teilnehmerformulars bearbeitest du
unter **Einstellungen**. Das hinterlegte Startgeld wird als Preisdatensatz geführt;
es löst keine Online-Zahlung aus. Verwende für den lokalen Test keine echten
Teilnahmebedingungen oder personenbezogenen Daten.

## 2. Eine Nennung durchspielen

1. Öffne den Nennungslink. Trage Testdaten und eine Test-E-Mail ein, wähle die
   Klasse und ein Fahrzeug, bestätige die Bedingungen und sende ab.
2. Öffne <http://127.0.0.1:8025>. Suche die Mail an die eingetragene Adresse und
   öffne deren Bestätigungslink. Mailpit fängt die lokale SMTP-Zustellung ab;
   es wird keine externe E-Mail verschickt.
3. Öffne <http://127.0.0.1:5173/app>, wähle die Veranstaltung und öffne die
   Nennung. Prüfe die Angaben und führe eine Statusänderung mit Audit-Grund aus.

## Was bereits geht und was noch fehlt

| Funktion | Aktueller Weg |
| --- | --- |
| Anmeldung als Community-Admin | Browser mit lokalem Keycloak |
| Veranstaltung/Klassen/Startgeld/Einwilligung anlegen, Nennung öffnen | Admin-App unter **Einrichten** |
| Öffentliche Nennung und E-Mail-Bestätigung | Browser und Mailpit |
| PNG/JPEG/WebP als eigenes Formularfeld hochladen | Teilnehmerformular, nach Feldkonfiguration über die API |
| Hochgeladenes Bild herunterladen | Nennungsdetail im Admin-Browser |
| Nennungen suchen, ansehen und Status ändern | Admin-App |
| Zahlung manuell erfassen | Admin-API, noch kein vollständiges UI |
| CSV-Export | Admin-API und Worker, noch kein Export-Steuerelement in der Nennungsliste |
| PDF-Unterlagen hochladen | Noch nicht implementiert |
| Einzelne hochgeladene Dokumente prüfen/freigeben | Noch nicht implementiert |

Das Bildfeld ist in der Einrichtung nicht konfiguriert; die API dafür steht in der
[Formularkonfiguration](../architecture/public-registration.md). Der
automatisierte reale Browserablauf steht im
[Community-E2E-Test](../../packages/app/e2e/community.smoke.spec.ts); dort sind
verbleibende UI-Lücken ausdrücklich als `fixme` markiert.

## Fehler beim Start

- **Docker/Compose nicht gefunden oder Daemon nicht erreichbar:** Docker starten,
  `docker compose version` und `docker info` prüfen. Unter Windows in WSL2 mit
  aktivierter Docker-Integration starten.
- **Port belegt:** Die im README gelisteten Ports freimachen. Nur den Vite-Port zu
  ändern reicht nicht, weil OIDC feste lokale Redirect-URIs verwendet.
- **Keine Veranstaltung:** `/app` öffnen und die Veranstaltung dort einrichten;
  `npm run db:seed` legt nicht die passende Community-Konfiguration an.
- **Keine Bestätigungsmail:** Im Startterminal auf API-/Worker-Fehler achten und
  Mailpit prüfen. App, API und Worker müssen gleichzeitig laufen.
- **Passwort vergessen:** Im Repository
  `node scripts/community-config.mjs --password` aufrufen. Das ist das ursprünglich
  generierte Passwort; ein nachträglich in Keycloak geändertes Passwort ersetzt es.

## Daten und Betrieb

Ctrl+C im Startterminal stoppt die Dienste. Der nächste Aufruf von
`bash scripts/community-up.sh` verwendet die vorhandene Installation weiter.
`.community-local/` enthält lokale Zugangsdaten, Import-Konfiguration und Uploads;
Docker-Volumes enthalten PostgreSQL- und Keycloak-Daten. Diese gehören zusammen
und dürfen für eine weiterzuverwendende Installation nicht verworfen werden.

Die Dienste sind an die Loopback-Adresse gebunden. Das Skript verwendet
Entwicklungsserver, lokales HTTP und Mailpit. Für LAN-/Internetbetrieb fehlen
unter anderem ein passender HTTPS-/OIDC-Betrieb, echte Mailzustellung und ein
getesteter Backup- und Wiederherstellungsweg. Der Schnellstart ist für lokales
Ausprobieren geeignet, nicht für produktives Hosting.
