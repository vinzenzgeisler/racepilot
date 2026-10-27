# ADR 0002: Product repository, clean start, and package boundaries

- Status: Accepted when merged; the repository owner decided the Cloud placement
  (private repository) on 2026-10-27
- Date: 2026-10-27
- Scope: Repository and package structure; amends the target ownership rows of the
  [repository and module map](../architecture/repository-module-map.md)
- Related: [ADR 0001](0001-editions-shared-core-and-deployment-modes.md), issues #52
  and #53

## Context

**Current fact:** [ADR 0001](0001-editions-shared-core-and-deployment-modes.md) fixes
the editions, the shared core, server-authoritative tenant context, and the
permission/entitlement/capability split. Its
[module map](../architecture/repository-module-map.md) assumed that the MSC backend
and frontend would later be renamed or transferred into public RacePilot product
repositories, and that this repository would stay documentation-first.

**Current fact:** The repository owner has since decided that
`vinzenzgeisler/racepilot` is the single future product repository and that RacePilot
is a clean rebuild. `MSC-Event-Backend`, `MSC-Event-Frontend`, and
`MSC-Event-Signing-Terminal` remain read-only functional and technical references.
`MSC-Event-CLI` is out of scope. Issue #52 proposes an npm-workspaces monorepo.

This ADR records the structural consequences of that decision. It does not change
any decision of ADR 0001.

## Decision

### Repository

`vinzenzgeisler/racepilot` is the single public product repository. It contains the
shared domain core, the HTTP application, the workers, the product web application,
public provider adapters, and the Community distribution.

MSC code is not migrated or copied wholesale. A behavior adopted from an MSC
repository is re-implemented against RacePilot contracts, and the issue names the
reference it was derived from. Importing MSC *data* into a RacePilot organization is a
separate migration concern (issue #2) and is not excluded by this decision.

### Cloud on AWS in a private repository

RacePilot Cloud runs on AWS. As ADR 0001 requires, Cloud production infrastructure
and the Cloud control plane stay private. They live in a private repository with the
allocation label `vinzenzgeisler/racepilot-cloud`:

- AWS CDK stacks, environment configuration, and deployment workflows;
- the Cloud runtime assembly (for example Lambda or container entry points that wire
  public packages to AWS adapters);
- the control plane (organizations, domains, memberships, subscriptions, billing,
  platform operations).

The private repository consumes released artifacts and public package versions of
this repository (container images, built packages, contract versions). It does not
copy or fork domain behavior. Reusable, secret-free AWS adapters, such as Cognito, SES,
and S3 implementations of core ports, may stay public in this repository as
`packages/adapter-*`. The private repository is created only once Cloud deployment
work starts.

### Packages

Packages follow the dependency direction of the module map:

| Package | Contents | May depend on |
|---|---|---|
| `packages/core` | Domain model, use cases, ports, request/job context type, capability evaluation | No product package; no I/O or provider SDKs |
| `packages/contracts` | Versioned HTTP, bootstrap, and job-message schemas and their types | No product package |
| `packages/api` | HTTP application: server-side context resolution, routing, mapping between contracts and use cases | `core`, `contracts` |
| `packages/worker` | Job runtime and domain job handlers | `core`, `contracts` |
| `packages/app` | Product web application | `contracts` only |
| `packages/adapter-*` | Provider implementations of core ports (for example PostgreSQL, OIDC, SMTP, S3-compatible storage, Cognito, SES) | `core` |

There is no catch-all `shared` package. A shared type is either domain (`core`) or
wire format (`contracts`). The web application never imports `core`, so domain rules
are enforced on the server and not bundled as client-side authority.

Adapter packages are introduced by the issues that add the corresponding ports
(#36, #54, and #55), not as empty stubs. Process assembly (selecting adapters
from validated deployment configuration) lives in the `api` and `worker` entry
points for Community, and in `racepilot-cloud` for Cloud.

Package boundaries are enforced by an automated dependency check in CI from the first
commit. Documentation alone is not enforcement.

### Tooling

- Node.js 24 LTS and npm workspaces with `"workspaces": ["packages/*"]`. Internal
  dependencies use the version range `"*"`; npm does not support the `workspace:`
  protocol.
- TypeScript in strict mode with project references, so that `npm run typecheck`
  and `npm run build` respect package boundaries.
- Vitest as the test runner, and React with Vite for `packages/app`. Both are proven in
  the MSC references.
- Root scripts `lint`, `typecheck`, `test`, and `build` run across all workspaces.

### Runtime neutrality

`api` and `worker` run as ordinary Node.js processes. Serverless entry points are
Cloud assembly concerns and must not shape the core or HTTP application.

### Community distribution

The Community edition follows common open-source self-hosting practice:

- versioned OCI container images published from this repository;
- a reference Docker Compose setup under `deploy/community/`, delivered by #35 once
  API, worker, and web application have runnable behavior; placeholder services
  without behavior are not added;
- configuration through documented environment variables and secret files, validated
  at startup;
- interchangeable adapters for any standards-compliant OIDC provider, SMTP, local or
  S3-compatible object storage, and PostgreSQL.

A development Compose file (PostgreSQL, mail capture, S3-compatible storage) is
introduced together with the first persistence or adapter work that needs it.

### CI

A single `ci.yml` workflow exposes named required checks: lint, typecheck, test,
build, the package-boundary check, and the existing documentation validators. The
`core (community)` and `core (cloud)` matrix jobs from the
[required CI coverage](../architecture/ci-coverage.md) are added as soon as the
request-context seam exists. They are not simulated before then.

### Repository identity guard

The repository identity check from #53 accepts both HTTPS and SSH forms of
`vinzenzgeisler/racepilot` locally. In GitHub Actions it compares `GITHUB_REPOSITORY`
instead of the Git remote. It is an agent and contributor safety net, not a security
boundary.

## Open decisions

These choices are needed before the work that depends on them. Each one needs its own
ADR or an explicit decision on its issue. The HTTP framework, job mechanism, and
database tooling are decided in
[ADR 0003](0003-http-jobs-and-database-tooling.md); the license is tracked in #68.

- HTTP framework for `api` (before the first endpoint, #54)
- job and outbox mechanism for `worker`; a PostgreSQL-backed queue avoids additional
  Community infrastructure (before the first job)
- database access and migration tooling (before #54)
- the open-source license of this public repository (before the first Community
  release)

## Consequences

- The target ownership table in the
  [repository and module map](../architecture/repository-module-map.md) reflects this
  decision.
- ADR 0001's statement that enforced module boundaries and contracts come first
  remains satisfied, because boundaries are enforced from the first product commit.
- Issue #52 must drop the root CDK directory, placeholder Compose services, the
  `shared` package, and `workspace:*` references before implementation.
- Issue #53 must target `vinzenzgeisler/racepilot` and use `GITHUB_REPOSITORY` in CI.
- Cloud issues that need AWS infrastructure are implemented in `racepilot-cloud`.
  Their shared domain parts, such as organization scoping, still land here.
