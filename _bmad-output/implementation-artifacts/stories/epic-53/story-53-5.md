# Story 53-5: Test Updates + Z$ Assertions

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 53-5 |
| Epic | Epic 53: Datetime API Consolidation Execution |
| Title | Test Updates + Z$ Assertions |
| Status | backlog |
| Risk | P2 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Stories 53-1, 53-2, 53-3, 53-4 |

## Story

As a **QA engineer**,  
I want all unit tests updated to use the new `toUtcIso`/`fromUtcIso` API and integration tests to assert Z$ format on datetime response fields,  
So that tests validate the canonical format and the consolidation is verified end-to-end.

## Context

Previous stories migrated all production code to the new namespaced API. Test files still use old function names and don't assert Z$ format on API responses. This story updates:

1. **Unit tests** — rename function calls in datetime.test.ts and normalize.test.ts
2. **Integration tests** — add Z$ format assertions for datetime response fields
3. **Test fixture files** — clean up any remaining `.toISOString()` patterns

## Acceptance Criteria

- [ ] **AC1: `datetime.test.ts` updated** — all tests use new `toUtcIso`/`fromUtcIso` API
- [ ] **AC2: `normalize.test.ts` updated** — `toRfc3339` → `toUtcIso.dateLike` assertions
- [ ] **AC3: Integration tests gain Z$ assertions** — datetime response fields assert `Z$` format
- [ ] **AC4: Test fixture files cleaned** — raw `.toISOString()` patterns replaced in fixture code
- [ ] **AC5: Full test suite passes** — `npm test -w @jurnapod/shared && npm test -w @jurnapod/api`

## Bulk Migration Targets

### Unit test updates

| # | File | Action |
|---|------|--------|
| 1 | `packages/shared/__test__/unit/datetime.test.ts` | Rename function calls to new namespaced API |
| 2 | `apps/api/__test__/unit/date-helpers/normalize.test.ts` | Update `toRfc3339` → `toUtcIso.dateLike` (assertions unchanged — still expects Z$) |

### `datetime.test.ts` specific changes

| Test area | Current | New |
|-----------|---------|-----|
| `asOfDateToUtcRange` tests (8 tests) | `asOfDateToUtcRange(d, tz)` | `toUtcIso.asOfDateRange(d, tz)` |
| `businessDateFromEpochMs` tests (8 tests) | `businessDateFromEpochMs(ms, tz)` | `fromUtcIso.businessDate(toUtcIso.epochMs(ms), tz)` |
| `epochMsToPeriodBoundaries` tests (7 tests) | `epochMsToPeriodBoundaries(ms, tz)` | Move to `@jurnapod/modules-accounting` tests |
| `normalizeDate` tests (not directly tested) | Add tests for `toUtcIso.businessDate` | New tests |
| `fromEpochMs` tests (not directly tested) | Add tests for `toUtcIso.epochMs` | New tests |
| `resolveBusinessTimezone` tests (11 tests) | Keep as-is (no rename) | No change |
| `isValidTimeZone` tests (1 test) | Keep as-is | No change |

### New test coverage to add

| # | Function | Test area |
|---|----------|-----------|
| 3 | `toUtcIso.dateLike()` | Basic conversion, nullable option, error on invalid |
| 4 | `fromUtcIso.epochMs()` | Z string → number conversion |
| 5 | `fromUtcIso.mysql()` | Z string → MySQL DATETIME format |
| 6 | `fromUtcIso.dateOnly()` | Z string → YYYY-MM-DD |
| 7 | `fromUtcIso.businessDate()` | Z string + tz → business date |
| 8 | `toUtcIso.businessDate()` | Business date + tz → Z |
| 9 | `fromUtcIso.localDisplay()` | Z string + tz → local display |

### Integration test Z$ assertions

| # | Test file | Fields to assert Z$ |
|---|-----------|---------------------|
| 10 | `__test__/integration/audit/list.test.ts` | `created_at`, timestamps |
| 11 | `__test__/integration/reports/journals.test.ts` | `as_of` response |
| 12 | `__test__/integration/cash-bank/post.test.ts` | `posted_at` |
| 13 | `__test__/integration/purchasing/ap-payments.test.ts` | `posted_at`, `voided_at` |
| 14 | `__test__/integration/sales/payment-fx-ack.test.ts` | Timestamp fields |
| 15 | `__test__/integration/reservations/canonical-ts-cutover.test.ts` | Timestamp fields |

### Test fixture files

| # | File | Pattern | Action |
|---|------|---------|--------|
| 16 | `apps/api/src/lib/test-fixtures.ts` (lines 1647-1906) | Pattern C: Date→YYYY-MM-DD | `fromUtcIso.dateOnly(toUtcIso.dateLike(value))` |
| 17 | `packages/modules/accounting/src/test-fixtures/fiscal-year-fixtures.ts` | Pattern C | `fromUtcIso.dateOnly(toUtcIso.dateLike(value))` |
| 18 | `packages/modules/accounting/src/test-fixtures/fiscal-period-fixtures.ts` | Pattern C | `fromUtcIso.dateOnly(toUtcIso.dateLike(value))` |

## Tasks/Subtasks

- [ ] 5.1 Update `datetime.test.ts` — rename function calls, add new tests for `dateLike`, `fromUtcIso.epochMs`, `fromUtcIso.mysql`, etc.
- [ ] 5.2 Update `normalize.test.ts` — `toRfc3339` → `toUtcIso.dateLike`
- [ ] 5.3 Update test fixture files — replace `.toISOString()` patterns
- [ ] 5.4 Add Z$ assertions to integration tests (files 10-15)
- [ ] 5.5 Run full test suite: `npm test -w @jurnapod/shared && npm test -w @jurnapod/api`

## Dev Notes

- **Z$ assertion pattern:**
  ```typescript
  expect(response.body.data.posted_at).toMatch(/Z$/);
  ```
- **`epochMsToPeriodBoundaries`** tests move to `@jurnapod/modules-accounting` since the function moves there
- **`businessDateFromEpochMs`** decomposition: the old function did `normalizeDate(fromEpochMs(ms), tz)`. The new equivalent is `fromUtcIso.businessDate(toUtcIso.epochMs(ms), tz)` — compose the functions in tests
- **No integration test behavior changes** — input values are already Z strings (`.toISOString()`); only assertions change
- **Test fixture files** appear in the consolidation plan's Phase 5. Include them in this story to close the loop.

## Validation Evidence

```bash
# Shared package tests
npm run test:unit -w @jurnapod/shared

# API tests (unit + integration)
npm test -w @jurnapod/api

# All should pass with 0 failures
```

## Dependencies

Stories 53-1, 53-2, 53-3, 53-4 — all production code must be migrated before tests are updated.
