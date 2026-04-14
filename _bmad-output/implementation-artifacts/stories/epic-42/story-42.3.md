# Story 42.3: Test Assertion Quality

**Status:** done

## Story

As a **CI reliability engineer**,
I want **integration test assertions to be precise**,
So that **real API errors are not masked by permissive 500 allowances**.

## Context

Across 22 integration test files, `500` appeared as an acceptable status in assertions like `expect([200, 500]).toContain(res.status)`. While `500` is valid for some routes, including it everywhere masked real bugs. A systematic audit tightened assertions to catch genuine errors.

---

## Acceptance Criteria

**AC1: No 500 allowances for success-path operations**
**Given** an integration test for a success-path operation (200, 201, 204)
**When** the assertion uses `toBe()` with a single status code
**Then** `500` is NOT in the acceptable set

**AC2: 500 preserved where legitimately applicable**
**Given** a route with genuinely non-deterministic failure modes
**When** the route can return 500
**Then** `500` may be included in the assertion after manual review

---

## Bulk Migration AC Rule

Every file that had `500` removed must be explicitly verified.

### Bulk Migration Targets

| # | Target File | Status |
|---|-------------|--------|
| 1 | `settings/pages-publish.test.ts` | Migrated |
| 2 | `settings/pages-unpublish.test.ts` | Migrated |
| 3 | `settings/pages-update.test.ts` | Migrated |
| 4 | `settings/pages-list.test.ts` | Migrated |
| 5 | `settings/public-pages.test.ts` | Migrated |
| 6 | `settings/pages-create.test.ts` | Migrated |
| 7 | `settings/module-roles.test.ts` | Migrated |
| 8 | `settings/modules-update.test.ts` | Migrated |
| 9 | `settings/modules-extended-update.test.ts` | Migrated |
| 10 | `tax-rates/create.test.ts` | Migrated |
| 11 | `tax-rates/update.test.ts` | Migrated |
| 12 | `tax-rates/delete.test.ts` | Migrated |
| 13 | `roles/delete.test.ts` | Migrated |
| 14 | `admin-dashboards/period-close.test.ts` | Migrated |
| 15 | `admin-dashboards/trial-balance.test.ts` | Migrated |
| 16 | `companies/create.test.ts` | Migrated |
| 17 | `outlets/update.test.ts` | Migrated |
| 18 | `outlets/create.test.ts` | Migrated |
| 19 | `inventory/items/create.test.ts` | Migrated |
| 20 | `inventory/items/update.test.ts` | Migrated |
| 21 | `inventory/item-prices/active.test.ts` | Migrated |
| 22 | `inventory/item-prices/update.test.ts` | Migrated |

**AC verification:** All 22 rows show "Migrated" — partial completion is not acceptance.

---

## Test Coverage Criteria

- [x] Happy paths:
  - [x] All 22 files pass with tightened assertions
  - [x] No false failures introduced by removing `500`
- [x] Error paths:
  - [x] 500 allowances preserved where legitimately applicable (manually reviewed)

---

## Test Fixtures

N/A

---

## Tasks / Subtasks

- [x] Run Python3 regex audit across all integration test files
- [x] Replace `expect([X, 500]).toContain(res.status)` patterns with precise `toBe(X)`
- [x] Replace `expect(res.status).toBeOneOf([X, 500])` with `expect(res.status).toBe(X)`
- [x] Manually review routes where `500` is legitimately applicable and preserve those allowances
- [x] Verify all 22 files pass after tightening

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| 22 integration test files listed above | Modify | Remove 500 from status assertions |

---

## Estimated Effort

1 hour

## Risk Level

Low

## Dev Notes

**Python3 instead of sed:**
Python3 regex was used because:
1. **Safety** — `sed -i` with complex patterns can silently corrupt files
2. **Precision** — Python supports negative lookahead and conditional matching
3. **Auditability** — scripts can be saved and reviewed

**StaticPageNotFoundError root cause:**
Many of the `500` allowances in settings pages tests were caused by `StaticPageNotFoundError` being caught as a generic 500. Once Story 42.2 fixed that to return 404, those `500` allowances could be safely removed.

---

## Validation Evidence

- `npm test -w @jurnapod/api` — all 132 files pass
- Grep audit confirms no `500` in assertions for success-path operations in migrated files

---

## Dependencies

Story 42.2 (StaticPageNotFoundError fix)

---

## Shared Contract Changes

N/A

---

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code
- [x] No `as any` casts added
- [x] No deprecated functions used
- [x] No N+1 query patterns introduced
- [x] All 22 files explicitly verified
