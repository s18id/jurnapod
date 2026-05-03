# Story 53-6: Cleanup — Remove Deprecated Wrappers

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 53-6 |
| Epic | Epic 53: Datetime API Consolidation Execution |
| Title | Cleanup — Remove Deprecated Wrappers |
| Status | backlog |
| Risk | P2 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 53-5 (Test Updates + Z$ Assertions) |

## Story

As a **developer**,  
I want all deprecated function wrappers removed from `datetime.ts` and `date-helpers.ts`,  
So that the codebase has a single canonical datetime API with no dead code or migration scaffolding.

## Context

Story 53-1 added all old function exports as deprecated wrappers (e.g., `toRfc3339` is now a thin wrapper calling `toUtcIso.dateLike`). These wrappers served as backward compatibility during the incremental per-package migration. Since stories 53-2 through 53-5 have migrated all consumers and updated all tests, the wrappers can now be safely removed.

This is Phase 4 of the consolidation plan.

## Acceptance Criteria

- [ ] **AC1: All deprecated wrappers removed** from `packages/shared/src/schemas/datetime.ts`:
  - `toRfc3339`, `toRfc3339Required`, `toUtcInstant`, `toMysqlDateTime`, `toMysqlDateTimeFromDateLike`
  - `toEpochMs`, `fromEpochMs`, `toBusinessDate`, `normalizeDate`
  - `fromUtcInstant`, `formatForDisplay`, `toDateOnly`
  - `asOfDateToUtcRange`, `toDateTimeRangeWithTimezone`
  - `resolveEventTimeDetails`, `addDays`, `compareDates`, `isInFiscalYear`
  - `RfcDateTimeSchema` (deprecated alias)
  - Private helpers: `isValidDateTime`, `isValidDate` (make truly private or remove)
- [ ] **AC2: `date-helpers.ts` cleaned** — re-exports only new API names, not old deprecated names
- [ ] **AC3: No remaining imports of old function names** — grep for each old name returns only documentation/history
- [ ] **AC4: Build passes** — `npm run build -w @jurnapod/shared && npm run build -w @jurnapod/api`
- [ ] **AC5: Full test suite passes** — `npm test -w @jurnapod/shared && npm test -w @jurnapod/api`

## Bulk Migration Targets

### Removals from `packages/shared/src/schemas/datetime.ts`

| # | Export | Reason | Status |
|---|--------|--------|--------|
| 1 | `toRfc3339` | Replaced by `toUtcIso.dateLike(x, { nullable: true })` | Remove wrapper |
| 2 | `toRfc3339Required` | Replaced by `toUtcIso.dateLike(x)` | Remove wrapper |
| 3 | `toUtcInstant` | Merged into `toUtcIso.dateLike(x)` | Remove wrapper |
| 4 | `toMysqlDateTime` | Replaced by `fromUtcIso.mysql(iso)` | Remove wrapper |
| 5 | `toMysqlDateTimeFromDateLike` | Replaced by `fromUtcIso.mysql(toUtcIso.dateLike(x))` | Remove wrapper |
| 6 | `toEpochMs` | Replaced by `fromUtcIso.epochMs(iso)` | Remove wrapper |
| 7 | `fromEpochMs` | Replaced by `toUtcIso.epochMs(ms)` | Remove wrapper |
| 8 | `toBusinessDate` | Replaced by `fromUtcIso.businessDate(s, tz)` | Remove wrapper |
| 9 | `normalizeDate` | Replaced by `toUtcIso.businessDate(d, tz, b)` | Remove wrapper |
| 10 | `fromUtcInstant` | Replaced by `fromUtcIso.localDisplay(s, tz)` | Remove wrapper |
| 11 | `formatForDisplay` | Replaced by `fromUtcIso.localDisplay(s, tz, opts)` | Remove wrapper |
| 12 | `toDateOnly` | Replaced by `fromUtcIso.dateOnly(s)` | Remove wrapper |
| 13 | `asOfDateToUtcRange` | Replaced by `toUtcIso.asOfDateRange(d, tz)` | Remove wrapper |
| 14 | `toDateTimeRangeWithTimezone` | Replaced by `toUtcIso.dateRange(f, t, tz)` | Remove wrapper |
| 15 | `resolveEventTimeDetails` | 0 real consumers; compose `resolveEventTime` + `toUtcIso.businessDate` | Remove |
| 16 | `addDays` | 0 real consumers | Remove |
| 17 | `compareDates` | 0 real consumers | Remove |
| 18 | `isInFiscalYear` | 0 real consumers; compose epoch ms | Remove |
| 19 | `RfcDateTimeSchema` | Replaced by `UtcIsoSchema` | Remove alias |
| 20 | `isValidDateTime` | Internal only | Make private (prefix `_`) |
| 21 | `isValidDate` | Internal only | Make private (prefix `_`) |
| 22 | `businessDateFromEpochMs` | Compose: `fromUtcIso.businessDate(toUtcIso.epochMs(ms), tz)` | Remove |
| 23 | `epochMsToPeriodBoundaries` | Moved to `@jurnapod/modules-accounting` | Remove from shared |

### Updates to `apps/api/src/lib/date-helpers.ts`

| # | Current | New |
|---|---------|-----|
| 24 | Exports all old function names | Export only: `toUtcIso`, `fromUtcIso`, `UtcIsoSchema`, `nowUTC`, `isValidTimeZone`, `resolveBusinessTimezone`, `resolveEventTime` |

### Blast radius check: grep for each removed export

| # | Export | Expected matches after cleanup |
|---|--------|-------------------------------|
| 25 | `toRfc3339` | Only in `datetime.ts` archival comments + `date-helpers.ts` if kept |
| 26 | `normalizeDate` | Only in `ar-reconciliation-service.ts` method signature (not a call) |
| 27 | All others | Zero matches in `.ts` files |

## Tasks/Subtasks

- [ ] 6.1 Remove all deprecated wrappers from `datetime.ts`
- [ ] 6.2 Remove old exports from `date-helpers.ts` re-export list
- [ ] 6.3 Add archival comment in `datetime.ts` listing removed functions with migration notes
- [ ] 6.4 Run blast radius grep for each removed export — verify zero production usage
- [ ] 6.5 Build all packages: `npm run build -w @jurnapod/shared && npm run build -w @jurnapod/api`
- [ ] 6.6 Run full test suite: `npm test -w @jurnapod/shared && npm test -w @jurnapod/api`
- [ ] 6.7 Update `sprint-status.yaml` for Epic 53

## Dev Notes

- **Archival comment pattern:** Add a commented-out section at the top of `datetime.ts` listing removed functions and their replacements, so developers finding old code references know the migration path.
- **`isValidDateTime` and `isValidDate`:** These are internal helpers. The `toUtcIso.dateLike()` implementation needs their validation logic. Either keep them as `_isValidDateTime` (private convention) or inline the logic. Prefer keeping as `_`-prefixed internal functions.
- **`epochMsToPeriodBoundaries`:** Already moved to `@jurnapod/modules-accounting` in story 53-2. Verify the move is complete before removing from shared.
- **Final state of `datetime.ts` exports:**
  - Schemas: `UtcIsoSchema`, `DateOnlySchema`, `TimezoneSchema`, `DateRangeQuerySchema`, `DateRangeWithTimezoneSchema`
  - Standalone: `nowUTC`, `isValidTimeZone`, `resolveBusinessTimezone`, `resolveEventTime`
  - Namespaces: `toUtcIso`, `fromUtcIso`
  - Type exports: `RfcDateTime` (keep, it's a type alias), `DateOnly`, `Timezone`, `DateRangeQuery`, `DateRangeWithTimezone`

## Validation Evidence

```bash
# Build
npm run build -w @jurnapod/shared
npm run build -w @jurnapod/api

# Type check
npm run typecheck -w @jurnapod/shared
npm run typecheck -w @jurnapod/api

# Full test suite
npm test -w @jurnapod/shared
npm test -w @jurnapod/api

# Blast radius grep
rg "toRfc3339|toEpochMs|fromEpochMs|normalizeDate|toDateOnly|toMysqlDateTime" --type ts --files | grep -v node_modules | grep -v dist
# Expected: only datetime.ts (archival comment) and possibly test archival comments
```

## Dependencies

Story 53-5 (Test Updates + Z$ Assertions) — all consumers must be fully migrated before removing deprecated wrappers.

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [x] No deprecated functions used without a migration plan
- [ ] Integration tests included in this story's AC (not deferred)
