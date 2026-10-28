# Provider ports (Issue #36)

`@racepilot/core` defines provider-neutral `IdentityProvider`, `MailProvider`, and
`ObjectStorageProvider` contracts. Identity verification returns only the verified
issuer/subject and optional profile attributes; it must never carry roles or
permissions. Authorization remains server-side membership policy (#55).

Provider errors use `ProviderError.code`: `not_configured`, `invalid_input`,
`unauthorized`, `forbidden`, `not_found`, `unavailable`, `conflict`, and `internal`.
Messages are safe summaries and must not include credentials, tokens, object contents,
or foreign organization identifiers. Causes may be retained for internal diagnostics
but must not be returned to clients. Retryable transport errors use `unavailable`;
callers should not infer retryability from message text.

The SMTP adapter accepts a tenant-bound message. Delivery idempotency is deliberately
not claimed by SMTP; durable deduplication belongs to #63's outbox. Local storage
issues server-generated UUID object IDs and places bytes under
`organization/{organizationId}/{objectId}`. Reads and deletes require the tenant ID;
callers cannot pass filesystem paths or provider object keys. SHA-256 is recorded with
content type and size. S3-compatible storage, signing/PDF/export, and Cloud identity,
SES, Cognito adapters are outside #36's Community demo scope.

`loadConfig` in `packages/api` is the Community composition root. `MAIL_PROVIDER`
and `STORAGE_PROVIDER` explicitly select `disabled` (the default) or the available
Community adapter. Selecting SMTP requires host, port, and from address; credentials
must be supplied as a complete pair. Selecting local storage requires
`STORAGE_LOCAL_ROOT`. Invalid enabled configuration fails startup with variable names
only, never values. Disabled adapters expose corresponding `mailEnabled` and
`storageEnabled` capability flags as false.

## Documents and exports (#65)

The API composes the object-storage port with a tenant-filtered confirmation read model
and document metadata repository. The PDF is synchronously rendered on the authenticated
request path and stored with a server-issued object ID; downloads re-check `entry:read`,
organization ownership, and the stored SHA-256 before streaming. `pdf-lib` was selected
for maintained, pure-TypeScript PDF composition with explicit metadata timestamps; the
small `qrcode` package renders the EPC transfer payload as a QR only when the
server-computed `payment.bank_transfer` capability is active. The PDF metadata dates
come from the immutable price snapshot, not wall-clock time. CSV fields are allow-listed
and formula/control-character prefixes are neutralized before quoting.

`STORAGE_PROVIDER` accepts `disabled`, `local`, or `s3`. Local storage requires
`STORAGE_LOCAL_ROOT`; the S3-compatible adapter accepts `STORAGE_S3_BUCKET`, optional
`STORAGE_S3_REGION`/`STORAGE_S3_ENDPOINT`, and an optional complete pair of
`STORAGE_S3_ACCESS_KEY_ID` and `STORAGE_S3_SECRET_ACCESS_KEY`. Supplying an endpoint
enables path-style addressing by default for MinIO.
