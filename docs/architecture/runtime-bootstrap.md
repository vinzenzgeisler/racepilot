# Runtime bootstrap (Issue #37)

`GET /runtime/bootstrap` is the versioned, presentation-only contract consumed
before the product shell renders organization or event content. It returns mode,
the resolved organization, validated branding, locale, nullable active event,
capabilities, and legal links. The browser treats every value as display data;
permissions and feature enforcement remain server-side.

## Community and host trust

Community has exactly one server-configured organization. The endpoint resolves
only that organization and ignores `Host`, query parameters, and organization
headers as tenant selectors. This prevents a caller-controlled host/org value
from becoming tenant context. Missing, disabled, and malformed configuration
uses the same `404 { "error": "Runtime unavailable" }` response. The frontend
shows a neutral error and never displays stale or guessed organization content.

## Branding and cache behavior

Branding accepts only HTTP(S) image URLs, email contact, and six-digit hex colors;
it cannot carry CSS, scripts, or tracking snippets. Primary text color must meet
4.5:1 contrast against white and accent color 3:1. Status colors are fixed design
tokens and are not tenant-configurable. Legal destinations are HTTP(S) URLs.

The response includes `configurationVersion`, sets private revalidation headers,
and the frontend bypasses stale browser cache. This initial implementation has no
server-side response cache, so changes become visible on the next bootstrap
request; deployments should bump the version when configuration changes. A
future cache may key by canonical verified host plus configuration version and
must expose targeted invalidation before being enabled.

## Cloud integration intentionally open

This public API currently assembles Community only. It does not claim to resolve
Cloud hosts and does not trust a request host as a Cloud tenant mapping. Cloud
must provide a server-side verified-host/domain resolver in the private Cloud
assembly, bind its result to the same contract, return the same neutral response
for unknown/deactivated domains, and implement versioned host-scoped cache
invalidation there. The current event lifecycle has no authoritative active-event
selection, so this bootstrap returns `activeEvent: null`; there is no Cloud control
plane or event-selection authority in this repository yet.

One app build supports either contract mode. No tenant-specific assets, CSS, or
frontend build variants are produced.

## Module capabilities (Issue #84)

`capabilities` includes `module.<id>` and a module's extra capability keys for every
optional module that is available to the organization: registered, entitled (Cloud
only, through the private entitlement hook), enabled for the organization, with a
valid configuration and satisfied dependencies. Because `activeEvent` is still
`null`, event-level availability is not part of bootstrap; it is returned by
`GET /admin/events/:eventId/modules` and enforced again on every module route and
job. See [ADR 0004](../adr/0004-event-modules-and-capabilities.md). Query
parameters, headers, and cookies never add capabilities.
