# Story 43.5: Validation & Final Verification

**Status:** done
**Priority:** P1

## Story

As a **CI reliability engineer**,
I want **the full test suite and lint to pass cleanly**,
So that **Epic 43 changes are confirmed solid before closing the epic**.

---

## Acceptance Criteria

**AC1: Full test suite passes**
**Given** all Epic 43 changes are applied
**When** `npm test -w @jurnapod/api` runs
**Then** 132 files pass, 930 tests green, 3 skipped

**AC2: API lint passes**
**Given** all changes are applied
**When** `npm run lint -w @jurnapod/api` runs
**Then** 0 errors

**AC3: Telemetry lint passes**
**Given** Story 43.3 is complete
**When** `npm run lint -w @jurnapod/telemetry` runs
**Then** 0 errors (duplicate exports fixed)

**AC4: Typecheck passes**
**Given** all changes are applied
**When** `npm run typecheck -w @jurnapod/api` runs
**Then** clean output

**AC5: Sprint-status updated**
**Given** AC1–AC4 are met
**When** this story is marked done
**Then** `epic-43` and all stories are set to `done` in `sprint-status.yaml`

**AC6: Focused auth tests added**
**Given** Story 43.2 is complete
**When** tests are run
**Then** focused tests exist for stock 403 and invoice PATCH outlet access

---

## Validation Evidence

```bash
# Test suite (2026-04-15) — PASSED
npm test -w @jurnapod/api
# Result: 135 test files, 940 passed, 3 skipped

# API lint (2026-04-15) — PASSED ✅
npm run lint -w @jurnapod/api
# 0 errors — fixed `catch (_)` → `catch` at sync-modules.ts lines 126, 129

# Telemetry lint (2026-04-15) — PASSED
npm run lint -w @jurnapod/telemetry  # 0 errors

# Typecheck (2026-04-15) — PASSED
npm run typecheck -w @jurnapod/api  # clean output
```

---

## Tasks / Subtasks

- [x] Run `npm test -w @jurnapod/api` — ✅ 135 files, 940 passed, 3 skipped (2026-04-15)
- [x] Run `npm run lint -w @jurnapod/telemetry` — ✅ 0 errors (2026-04-15)
- [x] Run `npm run typecheck -w @jurnapod/api` — ✅ clean output (2026-04-15)
- [x] Add focused tests for stock outlet access denial — ✅ `stock/outlet-access.test.ts` (2 tests)
- [x] Add focused tests for invoice PATCH with current mutable fields — ✅ `sales/invoices-update.test.ts` (6 tests)
- [x] Run `npm run lint -w @jurnapod/api` — ✅ 0 errors (fixed `catch (_)` → `catch`; 2026-04-15)
- [x] Update `sprint-status.yaml` — ✅ Epic 43 and story 43.5 marked done

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Modify | Set Epic 43 to done |

---

## Estimated Effort

30 minutes

## Risk Level

None

## Dependencies

Stories 43.1, 43.2, 43.3, 43.4

---

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code
- [x] No `as any` casts added
- [x] No deprecated functions used
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced
- [x] All new debt items added to registry before story closes
