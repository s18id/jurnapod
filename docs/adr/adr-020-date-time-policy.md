# ADR-020: Date/Time Standardization Policy

## Status

Accepted

## Date

2026-04-28

## Context

Jurnapod has accumulated inconsistent date/time handling across modules and query paths. The inconsistency has produced recurring correctness bugs in reporting windows, cut-off rules, and timezone-sensitive business flows.

Observed issues include:

1. Native `Date` usage in business logic despite existing policy and Temporal availability.
2. Multiple end-of-day boundary patterns (`23:59:59`, `23:59:59.999`, and string-concatenated `T23:59:59.999Z`).
3. No single timezone resolution authority across modules.
4. Divergent semantics for `asOfDate` and `cutOffDate`.
5. Inconsistent UTC fallback behavior where business timezone resolution is required.
6. Mixed storage patterns (`BIGINT` epoch ms, `DATETIME`, and ISO string variants) without explicit conversion authority.

Jurnapod already has strong foundations:

- `packages/shared/src/schemas/datetime.ts` provides validation and conversion helpers.
- `packages/modules/reservations/src/time/timezone.ts` implements outlet→company timezone resolution with no UTC fallback.

The missing piece is a cross-domain policy that defines canonical semantics and enforcement for all date/time decisions.

## Decision

Jurnapod adopts a single date/time standardization policy in:

- `docs/policies/date-time-standardization.md`

The policy is authoritative and applies to all domains. Key decisions:

1. **Storage semantics are standardized by suffix** (`*_ts`, `*_at`, `*_date`, `created_at`).
2. **Business timezone resolution uses dual-mode order**:
   - With outlet context (outlet-scoped operation): `outlet.timezone → company.timezone → error`
   - Without outlet context (company-level operation): `company.timezone → error`  
   Callers MUST use the mode matching available scope and MUST NOT synthesize outlet context.
3. **UTC fallback is forbidden** for business date operations.
4. **Boundary rules are standardized**:
   - DATE columns: inclusive `BETWEEN`
   - DATETIME/BIGINT timestamp columns: half-open intervals (`>= startUTC`, `< nextDayUTC`) — the single canonical query model
   - `23:59:59.999` is a representational compatibility boundary for display/export; it is not the preferred query boundary for datetime column filtering
5. **Overlap rule is standardized** to `a_start < b_end && b_start < a_end`.
6. **As-of and cut-off semantics are standardized** with canonical half-open query ranges (`asOfRangeUTC`, `cutOffRangeUTC`) and compatibility aliases (`asOfDateUtcEnd`, `cutOffUtcEnd`).
7. **Conversion authority is centralized** through `@jurnapod/shared` helpers and `@js-temporal/polyfill`.
8. **Explicit prohibited patterns are codified** (native Date operations, UTC fallback masking, timezone-unsafe string concatenation, server-timezone SQL timestamp generation).

## Decision Makers

- **Epic Owner** (Story 52 acceptance authority)
- **Architecture Program Lead** (policy correctness and cross-domain consistency)
- **Module Owners** (accounting, purchasing, sales, reservations, reporting — domain migration scope)

## Consequences

### Positive

1. Date/time behavior becomes deterministic across modules.
2. Tenant business-day calculations become consistent for all IANA timezones.
3. Query boundary bugs and off-by-one-day regressions are reduced.
4. New work has a single reference for schema and conversion decisions.

### Negative / Migration Cost

1. Existing code paths using native `Date` in business logic require migration.
2. Some queries using function-wrapped indexed columns require refactor to constant-side conversion.
3. Legacy `<= endOfDay` query paths and `*_at`-canonical paths require staged migration toward `*_ts` authority and half-open intervals.
4. Story-level and module-level cleanup work is required across accounting, purchasing, reporting, sales, and reservations.

### Testing Impact

1. Integration tests for date boundaries MUST validate timezone-specific start/end conversion.
2. Tests MUST include DST transition cases for applicable IANA zones.
3. Tests MUST verify overlap logic invariants (`end == next start` is non-overlap).
4. API boundary tests MUST validate strict `YYYY-MM-DD` and RFC3339 input rules.

## Compliance

Compliance is enforced through architecture governance, code review, and static checks, per the enforcement provisions in `docs/policies/date-time-standardization.md` §Compliance and Enforcement.

1. **Code review checklist** MUST include:
   - timezone resolution order check,
   - boundary rule check,
   - prohibition check for native `Date` and UTC fallback in business paths,
   - conversion helper authority check.

2. **Lint/static policy** MUST evolve to flag prohibited patterns in business modules, including:
   - direct `new Date()` and `Date.now()` usage in business logic,
   - date-string concatenation boundaries,
   - timezone fallback patterns (`?? 'UTC'`) in business flows.

3. **Architecture stories in Epic 52** MUST implement incremental migration and validation against this ADR and policy.

4. **Exceptions** MUST be documented via ADR with explicit scope, owner, rationale, and migration plan.
