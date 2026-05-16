# Datetime Phase 2 Implementation Plan (Epoch-ms Migration)

## Status

In Progress

## Objective

Migrate runtime datetime handling to the simplified epoch-milliseconds-first model while preserving compatibility during transition.

## Target Outcomes

1. Business logic MUST use epoch milliseconds (`TimestampMs`) as canonical internal time type.
2. API boundaries MAY accept/return ISO strings during migration, but handlers MUST normalize to epoch milliseconds at boundary.
3. Manual business-date slicing patterns MUST be removed from implementation paths.
4. Shared schema files MUST use centralized `DateOnlySchema` from `packages/shared/src/schemas/datetime.ts`.

## Batch Plan

### Batch 1 — Shared Core + Hotspots

**Scope (completed):**
- `packages/shared/src/schemas/datetime.ts`
- `packages/shared/src/schemas/{cash-bank,depreciation,fiscal-years,fixed-assets}.ts`
- `apps/api/src/lib/shared/common-utils.ts`
- `apps/api/src/lib/date-helpers.ts`
- `apps/backoffice/src/features/items-prices-export-utils.ts`
- `packages/shared/__test__/unit/datetime.test.ts`
- `apps/api/__test__/unit/common-utils/format.test.ts`

**Delivered:**
- Added epoch-ms helpers: `parseIsoToTimestampMs`, `timestampMsToIso`, `timestampMsToDateOnly`, `dateOnlyToTimestampMs`.
- Added `TimestampMs` type alias.
- Centralized duplicate `DateOnlySchema` definitions.
- Replaced manual export filename date slicing in backoffice.
- Replaced manual fallback slicing in API common date utilities.
- Added/updated focused unit coverage.

### Batch 2 — Additional API Slice Cleanup

**Scope (completed):**
- `apps/api/src/lib/treasury-adapter.ts`
- `apps/api/src/lib/modules-sales/sales-db.ts`
- `apps/api/src/lib/fiscal-years.ts`

**Delivered:**
- Removed `.slice(0, 10)` business-date extraction in scoped files.
- Replaced with canonical helper chain (`toUtcIso.dateLike` + `fromUtcIso.dateOnly`).
- Preserved existing valid-input behavior.

### Batch 3 — Residual Runtime Manual-Date Patterns

**Scope (completed):**
- Residual runtime/business implementation paths using manual date slicing or local ad-hoc conversion across:
  - `apps/backoffice`
  - `packages/modules/accounting`
  - `packages/modules/reporting`
- Excludes test-only assertions unless they encode business behavior.

**Delivered:**
- Removed runtime `.slice(0, 10)`/`toISOString().slice(0, 10)` patterns from scoped files.
- Replaced with canonical helper usage (`fromUtcIso.dateOnly`, `toUtcIso.dateLike`, `nowUTC`).
- Validated with package builds and review gate.

**Execution rule:**
- Migrate by service/domain clusters to keep review blast radius small.
- Each cluster MUST include focused tests or type/build validation evidence.

### Batch 4 — Compatibility Surface Tightening

**Scope (completed):**
- Audit new epoch-ms helpers usage across packages.
- Identify candidates to move from compatibility APIs to direct epoch-ms flow.

**Delivered:**
- Replaced runtime compatibility compositions in API/modules with standalone epoch-ms helpers:
  - `fromUtcIso.businessDate(toUtcIso.epochMs(x), tz)` → `timestampMsToDateOnly(x, tz)`
  - `toUtcIso.epochMs(x)` → `timestampMsToIso(x)`
  - `fromUtcIso.epochMs(iso)` → `parseIsoToTimestampMs(iso)` in reservations timestamp wrapper
- Updated the following runtime files:
  - `apps/api/src/lib/reservations/utils.ts`
  - `packages/pos-sync/src/core/pos-data-service.ts`
  - `packages/modules/reservations/src/time/timestamp.ts`
  - `packages/modules/accounting/src/trial-balance/service.ts`
  - `packages/modules/accounting/src/reconciliation/dashboard-service.ts`
  - `packages/modules/accounting/src/reconciliation/subledger/{inventory-provider,cash-provider,receivables-provider}.ts`
  - `packages/pos-sync/src/push/index.ts`

**Execution rule:**
- No breaking contract changes without explicit consumer alignment.

## Validation Gates

For each batch:

1. `npm run build -w @jurnapod/shared` MUST pass when shared package is touched.
2. `npm run build -w @jurnapod/api` MUST pass when API package is touched.
3. Focused tests for changed files MUST pass.
4. Review gate MUST include severity table (P0/P1/P2/P3) and GO/NO-GO decision.

## Risks and Controls

| Risk | Severity | Control |
|------|----------|---------|
| Silent behavior drift on malformed date strings | P2 | Add explicit tests around changed conversion behavior |
| Frozen-scope backoffice file touched for cleanup | P3 | Record explicit user approval in implementation notes |
| Hidden caller dependency on legacy manual slicing | P2 | Run grep-driven audits + targeted regression tests |

## Carry-Over Findings (Post Batch 4 Review)

| Severity | Finding | Scope Decision | Next Action |
|----------|---------|----------------|-------------|
| P1 | Reservation entity mapping still materializes native `Date` in `mapDbRowToReservation` (`packages/modules/reservations/src/reservations/utils.ts`) | Out of Phase 2 cleanup scope (requires domain contract migration) | Create dedicated migration batch to shift reservation domain entities to `TimestampMs` end-to-end |
| P1 | POS push has duplicate orchestration logic between `handlePushSync` and `persistPushBatch` (`packages/pos-sync/src/push/index.ts`) | Out of Phase 2 cleanup scope (requires behavior-unification refactor) | Create focused refactor story to consolidate into one canonical execution path |

## Current Completion Snapshot

- Batch 1: ✅ Done
- Batch 2: ✅ Done
- Batch 3: ✅ Done
- Batch 4: ✅ Done
