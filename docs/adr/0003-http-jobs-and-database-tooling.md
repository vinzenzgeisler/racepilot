# ADR 0003: HTTP framework, background jobs, and database tooling

- Status: Accepted
- Date: 2026-10-27
- Scope: Runtime libraries for `packages/api`, `packages/worker`, and the PostgreSQL
  adapter; resolves the first three open decisions of
  [ADR 0002](0002-product-repository-clean-start-and-package-boundaries.md)
- Related: issues #54, #58, #63, #67

## Context

ADR 0002 requires `api` and `worker` to run as ordinary Node.js processes for
Community and to be wrapped by a Cloud assembly in the private `racepilot-cloud`
repository. RacePilot Cloud is expected to run on AWS, possibly serverless
(API Gateway and Lambda, scheduled invocations) like the MSC reference system.

**Current fact:** The MSC backend has no HTTP framework. API Gateway handles routing,
authorization, CORS, and throttling. A single `handler.ts` (about 5,100 lines)
dispatches requests through roughly 200 hand-written method/path conditions. Background
work is spread over AWS services: an `email_outbox` table polled every minute by an
EventBridge-triggered Lambda with `FOR UPDATE SKIP LOCKED`, further EventBridge
schedules for retention and maintenance, SQS for image processing, and SNS for SES
feedback. None of this is available to a Community installation, and the hand-written
router is not something to repeat. The MSC system is a functional reference, not a
technical template.

## Decision

### HTTP framework: Hono

`packages/api` uses [Hono](https://hono.dev) with the Node.js server adapter for
Community and local development. The Cloud assembly wraps the same application with
Hono's AWS Lambda adapter or runs it as a container; this choice stays in
`racepilot-cloud`.

- Routes are defined with zod schemas from `packages/contracts`; OpenAPI is generated
  from the same definitions.
- Request context (#58) is resolved in middleware and passed explicitly to use cases.
- Large uploads do not go through multipart form parsing. Cloud uses direct uploads to
  object storage with server-issued, ownership-checked upload URLs; Community uses a
  dedicated streaming upload endpoint behind the storage port.
- Rate limiting is implemented behind a small port backed by PostgreSQL, so it works
  without additional infrastructure and across Lambda instances.

**Considered:** Fastify (most mature plugin ecosystem, built-in multipart streaming and
rate limiting; heavier and less natural on Lambda) and Express (no schema validation,
weak typing). Hono was chosen because it runs unchanged on Node.js and Lambda, has the
smallest cold-start footprint, and integrates zod and OpenAPI directly.

### Background jobs: Graphile Worker

`packages/worker` uses [Graphile Worker](https://worker.graphile.org) on the same
PostgreSQL database.

- Jobs that belong to a business change are enqueued in the same database transaction
  through `graphile_worker.add_job(...)`, so a rolled-back change never leaves a job
  behind (transactional outbox).
- Community runs the worker as a long-lived process. Cloud may instead invoke
  `runOnce` from a scheduled Lambda, which processes all due jobs and exits.
- Every job payload contains `organizationId` and `schemaVersion` (ADR 0001, #58);
  the worker rebuilds and validates the job context before running a handler.
- Recurring work (retention, reminders, deadlines) uses Graphile Worker's cron
  support and enumerates organizations server-side.

**Considered:** pg-boss (richer operational features such as dead-letter queues;
transactional enqueue with an external transaction needs extra wiring), BullMQ
(requires Redis), and SQS (AWS-only). Graphile Worker was chosen for trivial
transactional enqueue and a run-once mode that matches scheduled serverless
execution. Failed jobs remain visible with their last error; dead-letter handling
beyond that is built when needed. The queue sits behind a job port in `core`, so a
later SQS adapter for Cloud only affects an adapter package.

### Database access and migrations: Drizzle

The PostgreSQL adapter uses [Drizzle ORM](https://orm.drizzle.team) with
`drizzle-kit`.

- The schema is defined in TypeScript inside the PostgreSQL adapter package, never in
  `core`.
- Migrations are generated as SQL, reviewed, and committed; generated SQL is edited by
  hand where needed. Migrations follow expand/migrate/contract where possible (#42).
- Tenant context is applied per transaction with
  `set_config('app.organization_id', …, true)`; row-level security policies (#2) are
  declared alongside the schema.
- Drizzle versions are pinned exactly, because the library is still before 1.0.

**Considered:** Kysely (minimal and stable, but no schema-as-code and manual
migrations) and Prisma (heavy engine, awkward per-transaction tenant context).
Drizzle was chosen for typed schema-as-code, reviewable SQL migrations, RLS support,
and existing team experience.

## Consequences

- No Redis, message broker, or AWS service is required for Community: API, worker, and
  web application need only PostgreSQL, SMTP, and object storage.
- Community can be self-hosted on any container platform, including AWS. AWS-managed
  services work through the generic adapters: RDS for PostgreSQL, S3 through the
  S3-compatible storage adapter, SES through its SMTP interface, and Cognito as a
  standard OIDC provider. The managed RacePilot Cloud setup (serverless assembly,
  production IaC, control plane) remains private, as ADR 0002 decides.
- `api` and `worker` gain their first runtime dependencies. Boundary rules stay
  unchanged: `core` and `contracts` import none of these libraries.
- Graphile Worker and Drizzle are pre-1.0 libraries. Versions are pinned, and
  upgrades are reviewed changes.
- The license decision from ADR 0002 remains open and is tracked in #68.
