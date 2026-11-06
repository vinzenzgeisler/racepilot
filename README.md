# NENNBOX

NENNBOX (formerly RacePilot) is an event registration and management application.
This public repository contains the shared product core, contracts, API, worker, UI,
and adapters, plus a runnable **Community Alpha local preview**. It is not yet a
production-ready Community distribution or Cloud platform. Cloud infrastructure,
control plane, and the separately deployed product website live in a private repository.
Internal package names and the repository URL still use `racepilot`.

NENNBOX is one product with one shared domain core and two explicit deployment
modes:

- **Community:** self-hosted, single tenant, exactly one organization per installation.
- **Cloud:** managed by NENNBOX, multi-tenant, with strictly isolated organizations.

The following documents form the baseline:

- [ADR 0001: editions, shared core, and deployment modes](docs/adr/0001-editions-shared-core-and-deployment-modes.md)
- [ADR 0002: product repository, clean start, and package boundaries](docs/adr/0002-product-repository-clean-start-and-package-boundaries.md)
- [ADR 0003: HTTP framework, background jobs, and database tooling](docs/adr/0003-http-jobs-and-database-tooling.md)
- [ADR 0004: Event modules and capabilities](docs/adr/0004-event-modules-and-capabilities.md)
- [Repository and module map](docs/architecture/repository-module-map.md)
- [Current coupling inventory](docs/architecture/current-couplings.md)
- [Required CI coverage and ownership](docs/architecture/ci-coverage.md)
- [Tenant resource inventory and isolation-test contract](docs/security/tenant-resource-inventory.md)
- [Machine-readable tenant resource inventory v1](docs/security/tenant-resource-inventory.v1.json)

## Status language

All architecture documents use these labels deliberately:

- **Current fact:** verified in the evidence snapshot; it describes what exists now.
- **Target decision:** accepted architecture for future implementation; it is not a
  claim that code or infrastructure already implements the decision.
- **Follow-up obligation:** work that must be implemented and verified before the
  affected mode can be called ready.

## What the current checks prove

The [CI workflow](.github/workflows/ci.yml) runs lint, typecheck, tests, build, the
package-boundary check, and the documentation validators. The documentation
validators check the tenant inventory, fixture, test references, global rationales,
and relative links.

## Development

Prerequisites: Node.js 24 and npm. Verify the checkout before local agent work with
`bash scripts/validate-repo-identity.sh` (forks may set `RACEPILOT_EXPECTED_REPO`).
Install dependencies with `npm ci`, then use the root commands `npm run lint`,
`npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, and
`npm run check:boundaries`.

| Package                     | Responsibility                                | Allowed product dependencies |
| --------------------------- | --------------------------------------------- | ---------------------------- |
| `packages/core`             | Domain, use cases, ports, and context types   | None                         |
| `packages/contracts`        | Versioned wire and job schemas                | None                         |
| `packages/api`              | HTTP application and API entry points         | `core`, `contracts`          |
| `packages/worker`           | Job runtime and handlers                      | `core`, `contracts`          |
| `packages/app`              | React/Vite web application                    | `contracts` only             |
| `packages/adapter-postgres` | Drizzle PostgreSQL persistence and migrations | `core` only                  |

The package boundaries follow [ADR 0002](docs/adr/0002-product-repository-clean-start-and-package-boundaries.md).

## Package artifacts (pre-release)

The initial product artifact set is versioned together at `0.1.0` and can be built as
local npm tarballs with `npm run release:pack`. The command builds each workspace,
restricts its pack contents to declared runtime outputs, and writes a manifest with
the exact public Git commit and SHA-256 for every tarball. It does not publish to an
npm registry or make a license/publication decision. The private Cloud consumer must
pin and verify the full source commit before rebuilding this pack set. See the
[artifact contract](docs/release/artifact-contract.md).

Local development PostgreSQL is available through `docker compose -f compose.dev.yaml up -d` (Docker is optional; tests can use any PostgreSQL 16 instance). Configure `DATABASE_URL`, `DEPLOYMENT_MODE=community`, `COMMUNITY_ORGANIZATION_SLUG`, `COMMUNITY_ORGANIZATION_NAME`, `COMMUNITY_ORGANIZATION_TIMEZONE`, and `COMMUNITY_ORGANIZATION_LOCALE`; `PORT` defaults to 3000. Mail delivery is disabled by default. Enable it with `MAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, optional paired `SMTP_USER`/`SMTP_PASSWORD`, and `CANONICAL_BASE_URL` (HTTPS outside localhost). Configure each organization’s validated `mail_from` and optional `mail_reply_to` before delivery. The worker uses a 30-second SMTP timeout and a configurable `MAIL_OUTBOX_LEASE_MS` (default 300000; must exceed 90000). Delivery is at-least-once: if a worker crashes after the SMTP server accepts a message but before the database records success, the expired lease can cause a duplicate send; providers should honor the stable idempotency key where supported. The development Compose stack exposes Mailpit SMTP on `127.0.0.1:1025` and its UI on `http://127.0.0.1:8025`. Run `npm run db:migrate` and `npm run db:seed`. Integration tests use `RACEPILOT_TEST_DATABASE_URL`.

### NENNBOX jetzt lokal nutzen (Community Alpha)

**Voraussetzungen:** Git, **Node.js 24**, **npm 11** (siehe `packageManager`),
**Docker mit Compose v2** und eine Bash-Umgebung (Linux, macOS oder WSL2).
Docker muss laufen und für deinen Benutzer erreichbar sein. Internetzugang wird
beim ersten Start zum Laden der npm-Pakete und Container-Images benötigt.
Ein Cloud-Konto, kostenpflichtiger Dienst oder externer Mailserver ist für diesen
lokalen Test nicht erforderlich.

```bash
git clone https://github.com/vinzenzgeisler/racepilot.git
cd racepilot
git switch main
git pull --ff-only
bash scripts/community-up.sh
```

Der erste Start dauert einige Minuten. Das Skript installiert die Abhängigkeiten,
baut die Pakete, startet PostgreSQL, Keycloak und Mailpit in Docker sowie API,
Worker und Web-App auf dem Host. Es migriert die Datenbank und legt genau eine
Community-Organisation an. Separate `npm ci`-, Migrations- oder Seed-Aufrufe sind
für diesen Startweg **nicht nötig**. Insbesondere ist `db:seed` kein Seed für
diesen Stack: Es verwendet einen anderen Organisations-Slug.

| Oberfläche / Dienst     | Lokale Adresse / Port          |
| ----------------------- | ------------------------------ |
| Admin-App               | <http://127.0.0.1:5173/app>    |
| Test-E-Mails in Mailpit | <http://127.0.0.1:8025>        |
| API-Gesundheitsprüfung  | <http://127.0.0.1:3000/health> |
| Keycloak / Anmeldung    | <http://127.0.0.1:8080>        |
| PostgreSQL              | `127.0.0.1:5433`               |
| Mailpit SMTP            | `127.0.0.1:1025`               |

Diese Ports müssen frei sein. Verwende im Browser **`127.0.0.1` wie angegeben**,
nicht `localhost` oder die LAN-IP; die OIDC-Weiterleitungen sind darauf eingestellt.

1. Öffne die Admin-App und klicke **Anmelden**.
2. Nutze die im Terminal ausgegebene E-Mail-Adresse (standardmäßig
   `admin@nennbox.local`) und das automatisch generierte Passwort.
3. Eine frische Installation enthält noch keine Veranstaltung. Öffne in der Admin-App
   **Veranstaltung einrichten**, trage Name, Zeitraum, mindestens eine Klasse und
   Startgeld ein, ergänze bei Bedarf Teilnahmebedingungen und wähle **Speichern und
   Nennung öffnen**. Die App zeigt anschließend den öffentlichen Nennungslink.
   Ein gespeicherter Entwurf kann später über **Einrichten** fortgesetzt werden;
   zusätzliche Formularfelder findest du unter **Einstellungen**.
4. Teilnehmende öffnen anschließend
   `http://127.0.0.1:5173/events/<veranstaltungs-slug>/register`.
   Die Bestätigungs-E-Mail erscheint in **Mailpit**, nicht im echten Postfach.
   Nach der Bestätigung lässt sich die Nennung in der Admin-App prüfen und zulassen.

Optional kannst du **vor dem allerersten Start** deine Admin-E-Mail setzen:

```bash
COMMUNITY_ADMIN_EMAIL=du@example.org bash scripts/community-up.sh
```

**Stoppen und fortsetzen:** Ctrl+C im Startterminal beendet App/API/Worker und die
Compose-Dienste. Erneut `bash scripts/community-up.sh` startet mit den vorhandenen
Daten. Zugangsdaten, Realm-Konfiguration und Uploads liegen im ignorierten
Verzeichnis `.community-local/`; Datenbank und Keycloak-Zustand in Docker-Volumes.
Beides bleibt beim normalen Stoppen erhalten. Ein erneutes Setzen von
`COMMUNITY_ADMIN_EMAIL` ändert einen bereits importierten Benutzer nicht.
Das gespeicherte lokale Passwort kannst du bei Bedarf mit
`node scripts/community-config.mjs --password` erneut anzeigen.

**Stand der Alpha:** Der Stack ist eine lokale Entwicklungsvorschau, kein
abgesichertes öffentliches Hosting. Nennung, E-Mail-Bestätigung, Bild-Upload und
Admin-Bearbeitung sind vorhanden. Veranstaltungen, Klassen, Startgeld, Teilnahmebedingungen und das Öffnen der Nennung
werden über die Admin-Oberfläche eingerichtet. Zahlungserfassung und CSV-Export
benötigen teilweise noch die API. PDF-Belege und
Einzelprüfung hochgeladener Dokumente fehlen noch. Details und ausdrücklich noch
nicht verfügbare UI-Aktionen stehen im [lokalen Leitfaden](docs/getting-started/community-local.md)
und im [Community-Alpha-Issue](https://github.com/vinzenzgeisler/racepilot/issues/120).

Public registration is rate-limited through PostgreSQL so multiple API processes
share the same budgets. Defaults are 60 requests/minute per client and organization
and 8 requests/minute per client, organization, and event. Configure global
defaults with `PUBLIC_REGISTRATION_ORG_LIMIT`, `PUBLIC_REGISTRATION_EVENT_LIMIT`,
and `PUBLIC_REGISTRATION_WINDOW_SECONDS`. Authorized organization/event managers
can set audited tenant-scoped overrides via the management API; event values take
precedence over organization overrides, which take precedence over these defaults.
See the [override management contract](docs/architecture/public-registration.md#rate-limit-overrides).
Direct connection addresses are used by
default; configure `TRUSTED_PROXIES` with a comma-separated list of proxy IPs/CIDRs
only when the API is reachable exclusively through those proxies and they append
the actual upstream address to `X-Forwarded-For`. Other client-supplied address
headers are ignored. See the [public registration security notes](docs/architecture/public-registration.md).

To enable Community OIDC, set `OIDC_PROVIDER=oidc`, `OIDC_ISSUER_URL`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID`, and `OIDC_REDIRECT_URI`. Configure exactly one initial-admin selector: `OIDC_BOOTSTRAP_SUBJECT` (matched together with the configured issuer) or `OIDC_BOOTSTRAP_EMAIL` (matched only to a verified email from that issuer). `/auth/config` exposes only the public web-client settings. The API verifies bearer tokens against issuer discovery/JWKS and grants admin permissions only from an active database membership; provider role/group claims are ignored. Leave `OIDC_PROVIDER` unset to keep authentication disabled.
