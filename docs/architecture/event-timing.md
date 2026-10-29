# Event timing module

`timing` is an optional, statically registered module. An event without organization
and event activation has no timing actions or required configuration. Entry and
registration rows remain core-owned and are not modified by timing.

## Configuration and scoring

The strict Zod configuration defines run count/label and a versioned scoring rule.
Core scoring is a pure function with `fastest-run`, `sum`, and `target-deviation`
methods. Run penalties are added before scoring. DNF, DNS, and DSQ are unclassified;
exact score ties share a rank and are ordered deterministically by start number then
entry ID. The module deliberately does not define a motorsport-specific points system.

## Measurement lifecycle

Manual writes use an entry ID or unique event start number. CSV uses the columns
`startNumber` or `entryId`, `run`, `timeMs`, `source`, and `recordedAt`; optional
columns are `penaltyMs` and `exclusion`. CSV dry-run resolves every row, reports row
errors and duplicates, and writes nothing. A non-dry-run import is all-or-nothing.
Corrections deactivate the prior active measurement, append a superseding version,
and create an audit record.

Result drafts snapshot the selected rule and computed ranking. Publishing is an
explicit transition and does not overwrite any earlier published version. A later
rule/config change requires a new draft and publication. Public reads expose only the
latest published version; after module deactivation, only manifest-marked safe GET
reads remain reachable.

## Tenant resources and permissions

Migration `0015_timing.sql` owns `timing_measurement`, `timing_result_version`, and
`timing_audit`. Every timing row carries organization and event IDs; event references
use the composite `(organization_id, event_id)` foreign key. Measurements also bind
to an entry in that same organization/event. The product resource inventory records
the isolation boundaries and negative tests.

The server derives `timing:record`, `timing:correct`, `timing:publish`, and
`timing:read` from role permissions. Client capabilities never authorize access.
All module endpoints pass through the module guard; the anonymous published-results
read uses the same event-availability guard and never returns drafts.
