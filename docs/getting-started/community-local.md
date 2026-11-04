# Erste lokale Testveranstaltung

Der [README-Schnellstart](../../README.md#nennbox-jetzt-lokal-nutzen-community-alpha)
startet die vollständige lokale Community-Alpha-Umgebung. Lasse dieses Terminal
geöffnet. Die folgende Einrichtung ist nur für diesen lokalen Teststack gedacht.

## 1. Als Admin anmelden

Öffne <http://127.0.0.1:5173/app> und melde dich mit den ausgegebenen Zugangsdaten
an. Der erste konfigurierte Admin erhält seine Berechtigungen beim Login.
Die anfänglich leere Veranstaltungsauswahl ist normal.

Die Einrichtung von Veranstaltungen und Klassen hat noch keine vollständige
Bedienoberfläche. Für das folgende API-Beispiel brauchst du deshalb den
**kurzlebigen Access-Token deiner eigenen angemeldeten Sitzung**:

1. Öffne die Browser-Entwicklerwerkzeuge und dort **Netzwerk / Network**.
2. Lade `/app` neu und wähle die Anfrage `GET /admin/events` aus.
3. Kopiere aus deren Request-Header `Authorization: Bearer …` **nur den Token**,
   also ohne `Bearer `.
4. Öffne ein zweites Terminal im Repository und lies den Token verdeckt ein:

```bash
read -r -s -p 'Lokaler Admin-Access-Token: ' NENNBOX_ADMIN_TOKEN
export NENNBOX_ADMIN_TOKEN
```

Teile den Token nicht und speichere ihn nicht im Repository. Bei `401` erneut
anmelden und einen aktuellen Token verwenden. Der Stack aktiviert bewusst keinen
Passwort-Grant und verwendet für die API keine Keycloak-Operator-Zugangsdaten.

## 2. Veranstaltung, Klasse und Teilnahmebedingungen anlegen

Führe im zweiten Terminal dieses Beispiel aus. Es legt eine neue Veranstaltung
mit einer Klasse an, hinterlegt einen **reinen Testtext** für die Einwilligung und
öffnet die Nennung. Der zufällige Slug verhindert Kollisionen bei Wiederholungen.
Das Beispiel ändert keine vorhandene Veranstaltung.

```bash
node --input-type=module <<'JS'
import { createHash, randomUUID } from 'node:crypto';

const token = process.env.NENNBOX_ADMIN_TOKEN;
if (!token) throw new Error('NENNBOX_ADMIN_TOKEN fehlt');
async function api(path, method, body, expected = 200) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (response.status !== expected) {
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
const slug = `lokaler-test-${randomUUID().slice(0, 8)}`;
const event = await api('/admin/events', 'POST', {
  slug,
  name: 'Lokale NENNBOX-Testveranstaltung',
  startsOn: '2027-06-01',
  endsOn: '2027-06-02',
}, 201);
const eventClass = await api(`/admin/events/${event.id}/classes`, 'POST', {
  name: 'Testklasse',
  code: 'A',
  vehicleType: 'car',
  sortOrder: 0,
  maxParticipants: null,
  closed: false,
}, 201);
await api(`/admin/events/${event.id}/pricing/${eventClass.id}`, 'PUT', {
  baseCents: 1000,
  additionalEntryAdjustmentCents: 0,
  earlyBirdDeadline: null,
  earlyBirdDiscountCents: 0,
});
const text = 'Ich nehme an dieser rein lokalen Testveranstaltung teil.';
await api(`/admin/events/${event.id}/consents`, 'PUT', {
  terms: [{
    key: 'participation',
    version: '1',
    language: 'de',
    text,
    hash: createHash('sha256').update(text).digest('hex'),
    required: true,
  }],
});
await api(`/admin/events/${event.id}/transitions`, 'POST', { status: 'open' });
console.log(`Nennung: http://127.0.0.1:5173/events/${slug}/register`);
console.log(`Veranstaltungs-ID: ${event.id}`);
JS
unset NENNBOX_ADMIN_TOKEN
```

Die Teilnahmebedingungen sind nur ein Beispiel, keine Vorlage für echte
Veranstaltungen. Die hier konfigurierte Gebühr von 10 EUR ist ein interner
Preisdatensatz; das Beispiel löst keine Online-Zahlung aus.

## 3. Eine Nennung durchspielen

1. Öffne den ausgegebenen Nennungslink. Trage Testdaten und eine Test-E-Mail ein,
   wähle die Klasse und ein Fahrzeug, bestätige die Bedingungen und sende ab.
2. Öffne <http://127.0.0.1:8025>. Suche die Mail an die eingetragene Adresse und
   öffne deren Bestätigungslink. Mailpit fängt die lokale SMTP-Zustellung ab;
   es wird keine externe E-Mail verschickt.
3. Lade <http://127.0.0.1:5173/app> neu und wähle die neue Veranstaltung.
4. Öffne die Nennung. Prüfe die Angaben und führe die gewünschte Statusänderung
   mit einem Grund für den Audit-Verlauf aus.

## Was bereits geht und was noch fehlt

| Funktion | Aktueller Weg |
| --- | --- |
| Anmeldung als Community-Admin | Browser mit lokalem Keycloak |
| Veranstaltung/Klassen/Preis/Einwilligung anlegen, Nennung öffnen | Admin-API wie oben |
| Öffentliche Nennung und E-Mail-Bestätigung | Browser und Mailpit |
| PNG/JPEG/WebP als eigenes Formularfeld hochladen | Teilnehmerformular, nach Feldkonfiguration über die API |
| Hochgeladenes Bild herunterladen | Nennungsdetail im Admin-Browser |
| Nennungen suchen, ansehen und Status ändern | Admin-App |
| Zahlung manuell erfassen | Admin-API, noch kein vollständiges UI |
| CSV-Export | Admin-API und Worker, noch kein Export-Steuerelement in der Nennungsliste |
| PDF-Unterlagen hochladen | Noch nicht implementiert |
| Einzelne hochgeladene Dokumente prüfen/freigeben | Noch nicht implementiert |

Das Bildfeld ist im minimalen Beispiel oben nicht konfiguriert; die API dafür
steht in der [Formularkonfiguration](../architecture/public-registration.md).
Der automatisierte reale Browserablauf steht im
[Community-E2E-Test](../../packages/app/e2e/community.smoke.spec.ts); dort sind
verbleibende UI-Lücken ausdrücklich als `fixme` markiert.

## Fehler beim Start

- **Docker/Compose nicht gefunden oder Daemon nicht erreichbar:** Docker starten,
  `docker compose version` und `docker info` prüfen. Unter Windows in WSL2 mit
  aktivierter Docker-Integration starten.
- **Port belegt:** Die im README gelisteten Ports freimachen. Nur den Vite-Port
  zu ändern reicht nicht, weil OIDC feste lokale Redirect-URIs verwendet.
- **Keine Veranstaltung:** Die Einrichtung oben ausführen und `/app` neu laden;
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
getesteter Backup-/Wiederherstellungsweg. Der Schnellstart ist daher derzeit
für lokales Ausprobieren geeignet, nicht die Anleitung für produktives Hosting.
