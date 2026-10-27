# RacePilot

This is the single product repository for RacePilot, a clean rebuild that uses the MSC
event application only as a read-only reference. It contains the architecture baseline
from issues #34 and #38 and the monorepo foundation from issue #52. It does **not** yet
contain product functionality, a Community distribution, or the cross-edition CI matrix.
Cloud infrastructure and the control plane live in a separate private repository.

RacePilot is one product with one shared domain core and two explicit deployment
modes:

- **Community:** self-hosted, single tenant, exactly one organization per installation.
- **Cloud:** managed by RacePilot, multi-tenant, with strictly isolated organizations.

The following documents form the baseline:

- [ADR 0001: editions, shared core, and deployment modes](docs/adr/0001-editions-shared-core-and-deployment-modes.md)
- [ADR 0002: product repository, clean start, and package boundaries](docs/adr/0002-product-repository-clean-start-and-package-boundaries.md)
- [ADR 0003: HTTP framework, background jobs, and database tooling](docs/adr/0003-http-jobs-and-database-tooling.md)
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

Local development PostgreSQL is available through `docker compose -f compose.dev.yaml up -d` (Docker is optional; tests can use any PostgreSQL 16 instance). Configure `DATABASE_URL`, `DEPLOYMENT_MODE=community`, `COMMUNITY_ORGANIZATION_SLUG`, `COMMUNITY_ORGANIZATION_NAME`, `COMMUNITY_ORGANIZATION_TIMEZONE`, and `COMMUNITY_ORGANIZATION_LOCALE`; `PORT` defaults to 3000. Run `npm run db:migrate` and `npm run db:seed`. Integration tests use `RACEPILOT_TEST_DATABASE_URL`.

To enable Community OIDC, set `OIDC_PROVIDER=oidc`, `OIDC_ISSUER_URL`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID`, and `OIDC_REDIRECT_URI`. Configure exactly one initial-admin selector: `OIDC_BOOTSTRAP_SUBJECT` (matched together with the configured issuer) or `OIDC_BOOTSTRAP_EMAIL` (matched only to a verified email from that issuer). `/auth/config` exposes only the public web-client settings. The API verifies bearer tokens against issuer discovery/JWKS and grants admin permissions only from an active database membership; provider role/group claims are ignored. Leave `OIDC_PROVIDER` unset to keep authentication disabled.

## Produktseite

Die eigenständige deutsche Produkt-/Marketingseite liegt in `packages/site`; sie ist
kein Teil der Veranstaltungsanwendung und macht keine Live-Demo verfügbar. Lokal
starten: `npm run dev:site` (Vite bindet an `127.0.0.1`). Einen statischen Build
erstellen: `npm run build --workspace @racepilot/site`; veröffentlichbar ist
`packages/site/dist/`.
