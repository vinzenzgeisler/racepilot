# ADR 0005: Shared product composition for Community and Cloud

- Status: Accepted
- Date: 2026-11-13
- Scope: API and worker assembly, edition ports, tenant context, canonical origins
- Related: [ADR 0001](0001-editions-shared-core-and-deployment-modes.md),
  [ADR 0004](0004-event-modules-and-capabilities.md), issues #160 and #164

## Context

The Community API and worker previously wired repositories inside their server
entrypoints. The private Cloud assembly could only mount a subset of the product.
Copying that wiring would create separate route and job behavior for the two
editions, including different tenant isolation and mail-link semantics.

## Decision

`createProductApi` and `createProductWorker` in the public packages assemble the
complete product from the shared database adapters. The entrypoints only load
deployment configuration, create external providers, and pass edition ports.
Community supplies one fixed organization and its OIDC bootstrap; Cloud supplies
request context resolvers and handles many organizations. No client-supplied host,
header, or organization ID is itself trusted as tenant authority.

The Cloud host lookup, domain verification, entitlements, and infrastructure stay
in the private assembly. The public composition receives only verified context,
object storage, authentication/OIDC, rate-limit, mail, and module-entitlement
ports. Its core repositories are always present. Routes for optional facilities
are installed only when their required providers exist; missing configuration
does not produce an advertised action that fails later with a dependency 404.

Outbound links use the `canonicalOrigin(tenant)` port. Mail identity and the
`mail.delivery` capability are resolved per organization, not from a single
startup organization. The worker reconstructs tenant context from the job
envelope and checks organization status before processing; a foreign organization
ID cannot claim another tenant's outbox or export artifact.

The public two-organization PostgreSQL suites exercise the composed API and
worker, including foreign-ID denial, empty lists/counters, tenant-scoped links,
and positive owner controls. Community's browser smoke and existing tests remain
behavioral compatibility gates.

## Consequences

Both editions now use one route and job assembly. New product repositories must
be added there once, not in each entrypoint. A Cloud assembly must provide a
verified host resolver and per-tenant origin/mail configuration before enabling
registration mail and must prove the same behavior in a two-tenant browser smoke.
