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
and relative links. None of these checks runs or claims product-level tenant
isolation; the Community/Cloud matrix follows with the request-context seam (#58).

## Development

Prerequisites: Node.js 24 and npm. Verify the checkout before local agent work with
`bash scripts/validate-repo-identity.sh` (forks may set `RACEPILOT_EXPECTED_REPO`).
Install dependencies with `npm ci`, then use the root commands `npm run lint`,
`npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, and
`npm run check:boundaries`.

| Package              | Responsibility                              | Allowed product dependencies |
| -------------------- | ------------------------------------------- | ---------------------------- |
| `packages/core`      | Domain, use cases, ports, and context types | None                         |
| `packages/contracts` | Versioned wire and job schemas              | None                         |
| `packages/api`       | HTTP application and API entry points       | `core`, `contracts`          |
| `packages/worker`    | Job runtime and handlers                    | `core`, `contracts`          |
| `packages/app`       | React/Vite web application                  | `contracts` only             |

The package boundaries follow [ADR 0002](docs/adr/0002-product-repository-clean-start-and-package-boundaries.md).
