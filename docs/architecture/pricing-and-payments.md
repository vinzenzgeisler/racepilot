# Pricing, invoices and bank transfers

Pricing rules are organization-owned and scoped to an event class. The core calculation is pure and accepts an explicit ISO-8601 submission time; early-bird eligibility includes the exact deadline instant. Amounts are integer minor units and the organization currency is persisted separately from the rule. The entry stores a versioned JSON price snapshot so later rule edits do not rewrite submitted prices.

An invoice belongs to one registration group. Payments are append-only signed ledger records; correcting a receipt writes a linked negative reversal and an audit row. Invoice status is derived from the net ledger total, except cancellation, which is explicit.

Payment references use ISO 11649 RF Creditor References. The modulo-97 check digits detect typing errors and references are uniquely constrained within each organization, not globally. This choice aligns with the structured creditor-reference field in EPC069-12 transfer payloads. The bank recipient is never defaulted: the organization must configure a validated account name and checksum-valid IBAN (BIC optional) before an EPC transfer payload can be produced. QR image rendering is deliberately out of scope; only its newline-delimited EPC payload is generated in core.
