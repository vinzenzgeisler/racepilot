# ADR 0004: Event modules and capabilities

- Status: Accepted
- Date: 2026-10-28
- Scope: Module manifest contract, activation per organization and event,
  entitlement hook, server-side enforcement, data retention on deactivation
- Related: [ADR 0001](0001-editions-shared-core-and-deployment-modes.md),
  [ADR 0002](0002-product-repository-clean-start-and-package-boundaries.md),
  [ADR 0003](0003-http-jobs-and-database-tooling.md), issues #84, #85, #86,
  [runtime bootstrap](../architecture/runtime-bootstrap.md)

## Context

The registration (Nennung) is the shared core of RacePilot. Everything beyond it,
such as timing (#86) and later technical inspection or a marshal portal, is an
optional add-on that an organization turns on for itself and per event. An event
without timing must not need timing configuration, UI, or actions. Each rule is
configurable per organization or event with sensible defaults.

ADR 0001 already separates permission, entitlement, and capability and forbids
forks as an extension mechanism. This ADR adds the module model that makes the
capability concept concrete. Issue #93 provided the edition-neutral composition
points (`mountAdditionalRoutes`, `composeWorkerTasks`, the extension manifest); this
ADR builds on them.

## Decision

### Modules are statically registered, reviewed code

A module is code in the shared repository (or, for Cloud incubation, an immutable
private artifact per ADR 0001) that is registered at process assembly. There is no
runtime code loading, marketplace, or customer fork. `createModuleRegistry` validates
all definitions once at startup and throws on any defect, so a broken assembly never
serves traffic.

### Manifest

`ModuleManifest` (core type, `ModuleManifestSchema` in `@racepilot/contracts`) is
data; the Zod config schema and route handlers are code in the `ModuleDefinition`.

| Field | Meaning |
|---|---|
| `id` | Stable, dotted lowercase identifier, e.g. `timing`. Never reused. |
| `version` | Semver of the module. |
| `gallery` | de/en name and short/long description, category, icon reference, optional screenshots, source (`core`, `official`, `private`), supported editions (`community`, `cloud`) and an entitlement hint (`included` or `plan:<id>`). It contains no prices; entitlement remains server-authoritative. |
| `dependencies` | `{ id, range }` with exact or caret ranges. Unknown modules, unsatisfied ranges, and cycles fail registry creation. |
| `permissions` | Module permissions `<id>:<action>`, each *implied by* named core permissions (for example `event:write`). The server derives them from the context; clients never supply them. |
| `capabilities` | Extra capability keys exposed while active. `module.<id>` is always exposed. |
| `tables`, `migrations` | Tables and migration names owned by the module. Every module table carries `organization_id` and `event_id` with the composite event foreign key. |
| `routes` | Method, path (below `/admin/events/:eventId/modules/<id>`), optional module permission, optional `archivedRead` for safe reads after deactivation. |
| `ui` | Entry points and navigation labels; the web app renders them only when the capability is present (a presentation hint). |
| `jobs` | Worker task names, prefixed `<id>.`. |
| config | A Zod schema plus a default object. Configuration is always a JSON object. |

An assembly that serves a route a manifest does not declare, declares routes without
a handler, or registers a job handler no manifest declares fails at startup.

### Activation levels

Two tenant-bound tables hold state, plus an append-only audit table:

- `organization_module` (organization-level *availability* and *template*): the
  organization opts into a module and may keep a template configuration. It
  activates nothing by itself.
- `event_module`: the event-level activation and effective configuration. A new event
  activation is seeded from the organization template, then from the module default,
  and is validated against the config schema. After that the event owns its
  configuration; later template edits do not change running events.
- `module_activation_audit`: actor, action (`enable`, `disable`, `configure`),
  optional reason, resulting version, before/after state.

Rows carry a monotonic `version` (optimistic concurrency through `expectedVersion`)
and the manifest `module_version` the configuration was written against. Repeating
an identical request writes nothing (idempotent).

### Effective availability

The server computes availability, never the client. A module is **active for an
event** only if all of the following hold:

1. it is registered in this process;
2. the entitlement hook allows it (see below), failing closed on error;
3. the organization row is enabled and the event row is enabled;
4. both stored configurations still satisfy the current config schema;
5. every dependency is active in the same scope.

`/runtime/bootstrap.capabilities` contains `module.<id>` (and the manifest's extra
capabilities) for modules available at organization level. Bootstrap currently has
no authoritative active event (`activeEvent: null`), so event-level capabilities are
read through `GET /admin/events/:eventId/modules` and are placed into the context of
guarded module routes.

### Entitlement hook

`ModuleEntitlements.isEntitled(ctx, moduleId)` is the only place where commercial
plans touch modules. Community supplies none and therefore allows everything locally.
The private Cloud assembly supplies an implementation backed by its control plane.
An entitlement never grants permission (ADR 0001): the hook can only remove
availability. Enabling requires entitlement; losing entitlement deactivates the
module's capabilities and routes without deleting data, and the admin view reports
`entitled: false`.

### Enforcement

- Admin management (`organization:read|update`, `event:read|write`):
  `GET|PATCH /admin/organization/modules[/:moduleId]` and
  `GET|PATCH /admin/events/:eventId/modules[/:moduleId]`. Changes validate against the
  module config schema (400 with issue paths), dependencies (409 both when enabling
  without a dependency and when disabling a required module), event ownership
  (foreign IDs return 404), and entitlement (403).
- Module routes are mounted only through `installModules`. A guard resolves the
  member context, requires `event:read`, then re-evaluates module state from the
  database on every request. Inactive modules return **404**, indistinguishable from a
  missing module. After deactivation only routes marked `archivedRead` and using `GET`
  stay reachable. The module permission is checked after availability.
- Module jobs are created with `createModuleTasks`. Each run rebuilds the job
  context, verifies the organization, parses the event-scoped payload, and re-checks
  that the module is active for that organization and event. Otherwise the handler is
  not called and the job is dropped without retry (reported through `onRejected`).
  Dropped jobs are not replayed on reactivation; modules must make their jobs
  re-creatable from their own data.
- Client headers, query parameters, cookies, and bodies never influence any of this.

### Data isolation and deactivation

All module tables are tenant-bound with `organization_id` and, for event data,
the composite foreign key to `event(organization_id, id)`; foreign IDs return no data.
Deactivation only flips `enabled`: module tables, configuration, and audit history
remain, existing registrations and their snapshots are untouched, and reactivation
restores access. Data disappears only with its event (cascade) or through an explicit
retention process. Dropping a module from the registry leaves its rows dormant.

### Core versus module

Core: registration, participants and vehicles, pricing and payments, event lifecycle
(#60), mail/outbox, documents, identity and membership, tenant context, and the
module framework itself. A capability belongs to a module only if an event can
meaningfully run without it. Modules may depend on core ports and on other modules;
core never depends on a module, so core flows never need a module check. Features
such as timing (#86) attach through the manifest and their own tables and routes
without changes to the registration core.

### Relationship to #85 (configurable status and workflows)

#85 configures the registration workflow per event. It is a core capability, not a
module: the acceptance, payment, and verification axes stay in core. #85 uses the
same layering (organization template, event override, versioned, audited) and may
reuse the same version/audit pattern. Modules with their own status axes (inspection,
timing) keep them in module tables and never extend the core status. A module may
declare a dependency on a workflow capability once #85 exists, and #85 may expose
transition hooks to active modules through public contracts, not by branching on
module IDs.

### Migrations and versioning

Module migrations are part of the single ordered migration sequence of
`adapter-postgres`; a module's tables exist in every installation, active or not.
Activation does not run DDL. When a module version changes, stored configuration is
re-validated: configuration that no longer satisfies the schema makes the module
unavailable until an admin saves a valid configuration; disabling still works.

## Consequences

- Timing (#86) adds a module definition, tables, routes, and jobs; the registration
  core is unchanged.
- Cloud binds modules to plans by implementing one hook, without forking.
- Deactivated modules cost nothing at runtime beyond one indexed lookup per guarded
  request.
- Organization-level and event-level state add an administrative step; Community
  assemblies may later add a convenience that enables both in one action.
- The admin gallery consumes the organization/event module list APIs, filters registry-provided metadata and submits activation/configuration changes through the existing guarded endpoints. Disabling requires confirmation and never deletes module state. Module config forms are described by the module's JSON Schema; validation remains server-side.
