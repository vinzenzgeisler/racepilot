# Admin entries UI implementation boundary

The current `packages/app` admin screen consumes only the authenticated admin API:
`GET /admin/events`, `GET /admin/events/:eventId/classes`, the paginated and filtered
`GET /admin/entries`, `GET /admin/entries/:entryId`, and the existing entry transition
endpoint. It never reads public-event endpoints or caches cross-event data.

## Authentication dependency

The API's OIDC integration verifies bearer tokens, but the app has no OIDC browser
client, callback, or server-managed session. `/auth/config` only publishes issuer,
client ID, and redirect URI; it does not perform login or create a session. Therefore
this UI does not invent an implicit-flow login, accept an arbitrary token, or persist
a token in browser storage. The API's 401 state is explicit. A separate secure OIDC
code-flow/session integration is required before an administrator can use the screen
in a browser.

## Remaining API dependencies for Issue #64

The entry detail API currently returns the core entry record, not joined driver,
vehicle, class, registration-group, invoice/payment, consent-evidence, or audit data.
There are no admin APIs for notes or status-mail/outbox actions. Entry transitions are
audited server-side, and payment recording exists, but the UI cannot safely discover
an invoice ID or display payment history from the current read API. The screen exposes
only supported transitions and states these unavailable areas instead of fabricating
data or calling public endpoints.

List-side payment-status filtering is also not currently supported by the admin list
query. These API capabilities and the secure browser session must land before Issue
#64's end-to-end acceptance path can be considered complete.
