# Repository and module map

This map separates the verified repository state on 2026-10-28 from accepted target
ownership. Paths under `/home/node/.openclaw/workspace` and MSC references below are
read-only evidence paths from the 2026-08-15 snapshot; they are historical evidence,
not the current product or website layout.

Status terms follow the definitions in the [repository README](../../README.md).

## Current repository map

| Concern | Current repository/module | Status and evidence |
|---|---|---|
| Shared product | `vinzenzgeisler/racepilot` | **Current fact:** public npm-workspaces monorepo with core, contracts, API, worker, UI, and adapters. Packages remain unreleased; this issue's pack contract is not a registry publication. |
| Community distribution | `vinzenzgeisler/racepilot` | **Current fact:** not yet available; no supported installation, upgrade, backup, or restore bundle exists. |
| Cloud repository | Private `vinzenzgeisler/racepilot-cloud` | **Current fact:** private repository exists and currently contains the product website only. Its presence does not prove a running Cloud platform. |
| Product website | `vinzenzgeisler/racepilot-cloud/apps/website` | **Current fact:** private website app with its own build/deploy path; it is not a product runtime dependency. Website deployment does not establish Cloud subscriptions, product runtime, or tenant provisioning. |
| Cloud runtime and control plane | Private `vinzenzgeisler/racepilot-cloud` | **Current fact:** no verified production runtime, tenant provisioning, subscription, billing, or entitlement implementation. These remain future work. |
| MSC repositories | `MSC-Event-Backend`, `MSC-Event-Frontend`, and related references | **Historical reference only:** inspected snapshots documented below; they are read-only references and are not modified or consumed as product sources. |

### Repository naming note

This repository was renamed from `vinzenzgeisler/race-pilot` to
`vinzenzgeisler/racepilot` after the 2026-08-15 snapshot. At snapshot time the name
`racepilot` belonged to the separate Next.js marketing-site repository. Paths prefixed
with `racepilot/` in this map and in the [coupling inventory](current-couplings.md)
refer to that marketing snapshot, not to this repository. The marketing commit listed
under [evidence scope](#evidence-scope) is not reachable under the current
`vinzenzgeisler/racepilot` name.

The planning evidence is consistent with these observations:
`reports/racepilot-projektmasterplan-2026-08-13.md` lines 30–48 describe the
existing AWS backend, React/Vite frontend, marketing site, and the missing tenant and
SaaS foundations. `SAAS_CONCEPT.md` identifies multi-tenant deployment, Docker, and
billing as future work rather than implemented modules.

## Target repository and module ownership

These are **target decisions**, not claims that extraction or implementation has
happened. [ADR 0002](../adr/0002-product-repository-clean-start-and-package-boundaries.md)
replaced the earlier plan to rename or transfer the MSC repositories: RacePilot is a
clean rebuild in this repository, and the MSC repositories remain read-only references.

| Concern | Target repository/module assignment | Visibility | Obligation |
|---|---|---|---|
| Architecture, contracts, and decision index | `vinzenzgeisler/racepilot` (`docs`, `packages/contracts`) | Public | Keep ADRs, the tenant inventory, and versioned contracts next to the code they govern. |
| Backend domain core and HTTP application | `vinzenzgeisler/racepilot` (`packages/core`, `packages/api`) | Public | `core` holds domain, use cases, and ports without provider SDKs or MSC identity. `api` resolves server-side context and maps contracts to use cases. |
| Database schema and migrations | `vinzenzgeisler/racepilot` (PostgreSQL adapter package) | Public | Organization ownership and tenant-safe migrations from the first table. Community and Cloud consume the same schema contract. |
| Domain workers | `vinzenzgeisler/racepilot` (`packages/worker`) | Public | Require server-issued organization context and provider ports. Do not copy worker logic into the Cloud control plane. |
| Product frontend | `vinzenzgeisler/racepilot` (`packages/app`) | Public | Consume the server bootstrap and API contracts only. No client-owned authority, no MSC defaults, one build for all organizations. |
| Provider adapters | `vinzenzgeisler/racepilot` (`packages/adapter-*`) | Public | Community references (OIDC, SMTP, local/S3-compatible storage) and reusable, secret-free AWS adapters (Cognito, SES, S3). |
| Community distribution | `vinzenzgeisler/racepilot` (`deploy/community`) | Public | Container images and Compose first: web, API, workers, PostgreSQL, and reference adapters. Include upgrades, migrations, backup/restore, and health checks. |
| Cloud runtime assembly and AWS infrastructure | Private `vinzenzgeisler/racepilot-cloud` | Private | AWS CDK, environment configuration, deployment workflows, and runtime entry points. Depends only on released public artifacts, ports, and contracts. |
| Cloud control plane | Private `vinzenzgeisler/racepilot-cloud` | Private | Tenant and membership lifecycle, domain mapping, subscriptions/entitlements, billing integration, platform support, and audit. It calls public product contracts; it does not own copied domain logic. |
| Product website | Private `vinzenzgeisler/racepilot-cloud/apps/website` | Private; separately deployable | Keep independent of product uptime and authentication. Claims about Community/Cloud availability must track release evidence. This is the current website boundary, not a claim about a future public promotion. |

Current repository names above are verified on 2026-10-28. The MSC repository names
below refer only to historical, read-only source snapshots.

## Dependency direction

The allowed target dependency direction is:

```text
product frontend -> public API/bootstrap contracts
HTTP application + workers -> shared domain core -> public ports
community assembly -> public application/workers + community adapters
cloud runtime assembly -> public application/workers + cloud adapters
private control plane -> public contracts
marketing site -> no product runtime dependency
```

The domain core must not depend on a deployment assembly, private control plane, or
marketing site. Community must not depend on private modules. Cloud-only operational
code may depend on public contracts but may not redefine domain behavior.

## Evidence scope

The factual mapping was produced from the following repository snapshots. Repository
and commit links make the source snapshot reproducible without access to the local
inspection workspace.

| Repository | Inspected ref | Inspected full SHA | Stable source |
|---|---|---|---|
| [`vinzenzgeisler/MSC-Event-Backend`](https://github.com/vinzenzgeisler/MSC-Event-Backend) | `fix/editor-class-filter` | `4a96266f13f43b43fc76292193924d491bdf8673` | [Inspected commit](https://github.com/vinzenzgeisler/MSC-Event-Backend/commit/4a96266f13f43b43fc76292193924d491bdf8673) |
| [`vinzenzgeisler/MSC-Event-Frontend`](https://github.com/vinzenzgeisler/MSC-Event-Frontend) | `feat/marshal-planning-refinements` | `b42ab84f2123a4860f4dbc9ad1c5a24f4d1b14cb` | [Inspected commit](https://github.com/vinzenzgeisler/MSC-Event-Frontend/commit/b42ab84f2123a4860f4dbc9ad1c5a24f4d1b14cb) |
| `vinzenzgeisler/racepilot` (marketing site at snapshot time; name since reassigned, see the [naming note](#repository-naming-note)) | `main` | `33364c9d8dd0c5cfe6c53e987e876f55439dd39a` | Not reachable under the current repository name |

The sources were inspected at these local read-only evidence paths:

- `/home/node/.openclaw/workspace/MSC-Event-Backend`
- `/home/node/.openclaw/workspace/MSC-Event-Frontend`
- `/home/node/.openclaw/workspace/racepilot`
- `/home/node/.openclaw/workspace/reports/racepilot-projektmasterplan-2026-08-13.md`
- `/home/node/.openclaw/workspace/SAAS_CONCEPT.md`

The more granular evidence and search limitations are recorded in the
[current coupling inventory](current-couplings.md). The issue #38 source snapshots,
including the separately inspected MSC operations CLI and signing terminal, are in the
[tenant resource inventory evidence boundary](../security/tenant-resource-inventory.md#status-and-evidence-boundary).
