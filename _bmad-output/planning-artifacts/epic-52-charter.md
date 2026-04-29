# Epic 52 — Date/Time Standardization

## Priority

P0 (architecture)

## Summary

This epic standardizes date/time handling across Jurnapod to eliminate correctness drift caused by mixed timezone resolution, inconsistent boundary semantics, native `Date` business logic usage, and mixed storage patterns without explicit conversion authority.

The epic establishes one policy authority and executes incremental domain migration under the program priority rule:

`Correctness > Safety > Speed`

## Scope

- Global timezone support for any valid IANA timezone.
- Cross-module consistency for storage semantics, timezone resolution, boundary computation, as-of/cut-off semantics, and conversion authority.
- Migration and validation coverage across accounting, purchasing, reporting, sales, and reservations flows.

## Stories

1. **Story 52-1: Policy Document + ADR**  
   Deliver `docs/policies/date-time-standardization.md` and `docs/adr/adr-020-date-time-policy.md`.

2. **Story 52-2: Canonical Helpers in `@jurnapod/shared`**  
   Add/align shared helpers (including `resolveBusinessTimezone(outletTz, companyTz)`) and update exports/contracts.

3. **Story 52-3: Fix Accounting Subledger Providers**  
   Standardize accounting/subledger date boundaries and timezone conversion paths.

4. **Story 52-4: Fix Purchasing & AP Aging**  
   Unify as-of/cut-off semantics and aging boundary logic in purchasing/AP flows.

5. **Story 52-5: Fix Reporting & Sales Routes**  
   Align report filters and sales date windows with canonical half-open boundary and timezone policy.

6. **Story 52-6: Fix Reservations & Residual Cross-Cutting Anti-Patterns**  
   Reservations-specific anti-pattern remediation: fix date/time violations in `packages/modules/reservations/` and `apps/api/src/routes/reservations/` that are out-of-scope for stories 52-3/4/5.  
   Additionally, enumerate and remediate residual cross-cutting legacy paths (shared utilities, route adapters, or module boundary files) not covered by stories 52-3/4/5, where the same anti-pattern appears in multiple domain consumers.  
   This story does NOT include accounting (52-3), purchasing/AP (52-4), or reporting/sales (52-5) specific remediation — those are owned by their respective stories.

7. **Story 52-7: Comprehensive Test Suite**  
   Add integration and unit coverage for timezone resolution, boundary math, overlap invariants, DST edges, and regression scenarios.

## Pre-Flight Required

Before starting implementation stories in this epic, run:

```bash
npm run lint -w @jurnapod/api && npm run typecheck -w @jurnapod/api
```

If either check fails, blockers MUST be triaged before story implementation proceeds.
