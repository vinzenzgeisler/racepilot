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
runtime uses an in-memory per-IP/per-organization/per-event window implementation.
The port can be replaced by shared Postgres-backed storage for multi-process or
Cloud deployments. Public endpoint errors are intentionally generic for event and
person eligibility checks.

Consent configuration is managed through the permission-gated event consents API;
there is no consent text or event-specific legal content embedded in the product
source. The public app includes keyboard-operable steps, native validation, labels,
status/error announcements, and German/English copy.
