# Public registration (Issue #61)

The shared public API serves the versioned `StandardRegistrationFormSchema` from
`@racepilot/contracts`. The app renders its steps declaratively, uses the event's
configured consent text, and submits a strict `PublicRegistrationRequestSchema`.
The contract rejects unknown fields and unsupported versions; the server repeats
validation and never treats browser-provided organization, event, class, consent
text, status, or price data as authoritative.

`createPublicRegistrationService` scopes event, class, person, policy, pricing,
submission, and token queries by the server's `RequestContext.organizationId`. The
submission key is unique by organization/event. A single Drizzle transaction
reserves the key and creates/reuses the person, contact group, vehicles, pending
unverified entries, immutable price snapshots, an invoice when pricing exists,
consent evidence, hashed verification token, and the verification outbox job. The
entry and invoice/outbox repositories receive the same transaction executor.

Organization `registration_settings` is typed at the adapter boundary and validated
by the contracts schema at HTTP boundaries. Defaults allow shared contact emails,
leave minimum age unset, require guardian details below age 18, and cap a group at
eight distinct classes. Names are NFKC-normalized for duplicate checks; disallowed
shared email policy rejects an email owned by a different person. Policy changes
require organization permissions and append actor/before/after audit records.

Events store versioned consent text records with language and SHA-256 text hashes.
Only a hash-verified, event-authorized admin update can change them; updates append
an audit record. Submission evidence snapshots the selected text key, version,
language, hash, and acceptance time.

Verification tokens are 256 random bits; only their SHA-256 digest is persisted in
the group-scoped verification table. The verification URL uses the configured
`CANONICAL_BASE_URL`. Verification locks and consumes an unexpired token once,
then validates and records each entry's `unverified -> verified` transition with
an audit event in the same transaction. Unknown, expired, consumed, manipulated,
and foreign-organization tokens all return the same negative result.

The public API accepts an injectable `RegistrationRateLimiter`; the Community
runtime uses the Postgres-backed implementation so limits are shared by multiple
API processes. Atomic token buckets are keyed by a hash of the client identity and
server-derived organization/event scopes. Organization and event budgets are
checked and consumed together; a rejected event bucket does not spend the
organization budget. Storage errors fail closed. Defaults are 60 requests per
minute per client/organization and 8 per minute per client/organization/event;
`PUBLIC_REGISTRATION_ORG_LIMIT`, `PUBLIC_REGISTRATION_EVENT_LIMIT`, and
`PUBLIC_REGISTRATION_WINDOW_SECONDS` configure the global defaults.
Application startup rejects public registration without a limiter, and Cloud mode
also rejects any limiter not explicitly marked as shared persistence.

## Rate-limit overrides

Effective limits are resolved from trusted server-side context and persisted
tenant configuration, never from request body, query, or headers:

| Budget | Limit precedence | Window precedence |
| --- | --- | --- |
| Per organization | organization `organizationLimit` → global `PUBLIC_REGISTRATION_ORG_LIMIT` | organization `windowSeconds` → global `PUBLIC_REGISTRATION_WINDOW_SECONDS` |
| Per event | event `eventLimit` → organization `eventLimit` → global `PUBLIC_REGISTRATION_EVENT_LIMIT` | event `windowSeconds` → organization `windowSeconds` → global `PUBLIC_REGISTRATION_WINDOW_SECONDS` |

Organization overrides are managed with `GET` and `PUT` at
`/admin/organization/public-registration-rate-limits` and require
`organization:read` / `organization:update`. The accepted optional fields are
`organizationLimit`, `eventLimit`, and `windowSeconds`. Event overrides use
`GET` and `PUT` at `/admin/events/{eventId}/public-registration-rate-limits`,
require `event:read` / `event:write`, and accept `eventLimit` and `windowSeconds`
only.
Limits must be integers from 1 to 100,000; windows must be integers from 1 to
86,400 seconds. Omit a field to inherit its next value in the precedence chain;
send `{}` to clear overrides at that scope. Changes are tenant-scoped, validated
at both the API and database boundary, and actor-audited. Event IDs are resolved
and checked beneath the authenticated organization. For public requests the event
is resolved by route slug beneath the server-resolved organization before building
the limiter scope; client-supplied payload values cannot change either override
selection or bucket keys.

The client identity is the TCP peer address supplied by the Node server adapter.
`X-Forwarded-For` is ignored unless `TRUSTED_PROXIES` explicitly lists trusted
proxy IPs/CIDRs. When enabled, the forwarded chain is walked from the actual peer
inward and stops at the first untrusted address. The trusted proxy must append the
address of its actual upstream peer; never trust a forwarding header merely
because it is present. `X-Real-IP` and provider-specific headers are not used.
Without trusted proxy configuration, clients are identified only by the direct
connection address.

Rate-limit state stores SHA-256 hashes of client and scope keys, not raw IPs or
event slugs. Public registration returns 429 with `Retry-After` when over budget;
limiter/database failures return the generic unavailable response rather than
silently disabling protection. Public endpoint errors are intentionally generic
for event and person eligibility checks.

Consent configuration is managed through the permission-gated event consents API;
there is no consent text or event-specific legal content embedded in the product
source. The public app includes keyboard-operable steps, native validation, labels,
status/error announcements, and German/English copy.

## NENNBOX form configuration and drafts

Organizations manage the registration-form configuration with `GET`/`PUT
/admin/organization/registration-form-config` (`organization:read` /
`organization:update`). Events can store partial overrides using `GET`/`PUT
/admin/events/{eventId}/registration-form-config` (`event:read` / `event:write`).
Public form resolution merges event overrides over organization settings over
fixed product defaults. The public client cannot select a tenant, event, brand,
field policy, price, status, or bucket. Every update stores actor, previous
value, and new value in `registration_form_config_audit` transactionally.

Source brand colors are accepted and passed through WCAG luminance derivation:
button text picks the higher-contrast black/white foreground and links are
darkened until they achieve 4.5:1 against the fixed light surface. The app
displays a neutral notice when a configured color needs adjustment. The fixed
three-step structure, IBM Plex body font, and system status colors remain
product invariants. The public `@racepilot/ui` package and Brandbook M4 specify
Archivo for headings; F1 mentions six heading fonts but identifies no approved
families or corresponding license/source set. This implementation exposes the
specified Brandbook font (Archivo) only rather than inventing choices or loading
external fonts.

Logos and header images are uploaded to tenant-scoped object storage. Public asset reads are event-scoped and expose only object IDs present in that event's effective merged organization/event branding configuration; knowing another image object's ID within the same organization does not make it public. PNG/JPEG/
WebP signatures are checked rather than trusting multipart MIME type. SVG logos
are parsed and reconstructed from a strict geometry-only allowlist; scripts,
style, references, DTDs, external resources, and event handlers are rejected.
Public reads resolve only inside the server-selected organization and return
`nosniff` plus a restrictive CSP. Header images are darkened in the presentation
layer. No external asset or font requests are generated.

The visible save action stores a structured event draft and enqueues a
`registration-resume` mail. Resume credentials contain 256 random bits; only a
SHA-256 digest is stored, the credential expires after seven days, a subsequent
save rotates it, and resume consumes it transactionally once. The raw token is
put in a URL fragment (not sent as an HTTP request target) and the UI removes it
from browser history before calling the resume API. Save and resume derive
organization/event scope server-side and use generic outcomes to avoid
email/event enumeration. The current registration record requires date of birth
for age/guardian policy checks; F1 marks it configurable. Until the existing
person/age domain invariant is redesigned, the UI keeps this core field
required, rather than creating registrations with unverified age eligibility.
