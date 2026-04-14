# Story 42.2: DB Transaction Safety & Error Handling

**Status:** done

## Story

As a **CI reliability engineer**,
I want **transaction retry logic to cover all transient DB errors**,
So that **CI builds are not flaky due to lock contention or stale reads**.

## Context

Three distinct issues were causing CI-only failures and incorrect HTTP status codes:

1. **`ER_CHECKREAD` not retried** — `withTransactionRetry()` retried deadlock and `lock-wait-timeout` but not `ER_CHECKREAD` (errno 1020, "Record has changed since last read"). This manifested in CI where concurrent workers caused optimistic locking conflicts.

2. **`StaticPageNotFoundError` → 500** — settings pages publish/unpublish routes returned 500 for a missing page instead of 404.

3. **POS bugs** — `discount_total: NaN` in `reconcileSaleTotals()` and `PrematureCommitError` in `getTransactionState()`.

---

## Acceptance Criteria

**AC1: ER_CHECKREAD is retried**
**Given** a transaction that hits `ER_CHECKREAD` (errno 1020)
**When** `withTransactionRetry()` encounters the error
**Then** the transaction is retried (not propagated as fatal)

**AC2: StaticPageNotFoundError returns 404**
**Given** a request to publish or unpublish a static page that does not exist
**When** the route catches the error
**Then** HTTP 404 is returned, not 500

**AC3: discount_total is numeric**
**Given** a sale transaction with `discount_percent = null`
**When** `reconcileSaleTotals()` is called
**Then** `discount_total` is a number, not `NaN`

**AC4: getTransactionState handles null sort dates**
**Given** a transaction with a null `sort_date`
**When** `getTransactionState()` sorts the result set
**Then** it uses `(Date.parse(date) || 0)` as the sort key, not raw `Date.parse()`

**AC5: No PrematureCommitError**
**Given** `getTransactionState()` is called after a Dexie transaction
**When** the function is invoked
**Then** it is called outside the transaction callback, not inside it

---

## Test Coverage Criteria

- [x] Happy paths:
  - [x] `withTransactionRetry()` retries on deadlock
  - [x] `withTransactionRetry()` retries on `lock_wait_timeout`
  - [x] `withTransactionRetry()` retries on `ER_CHECKREAD`
- [x] Error paths:
  - [x] Non-retryable errors propagate immediately
  - [x] Max retry limit enforced

---

## Test Fixtures

N/A — no new patterns introduced.

---

## Tasks / Subtasks

- [x] Add `ER_CHECKREAD` (errno 1020) to `isDeadlockError()` in `packages/db/src/kysely/transaction.ts`
- [x] Add unit tests for `ER_CHECKREAD` classification in `packages/db/__test__/unit/transaction.test.ts`
- [x] Add `StaticPageNotFoundError` → 404 in `apps/api/src/routes/settings-pages.ts` publish/unpublish catch blocks
- [x] Add `?? 0` guards on `discount_percent` and `discount_fixed` in `apps/pos/src/offline/sales.ts`
- [x] Add null-safe sort `(Date.parse(date) || 0)` in `apps/pos/src/services/recovery-service.ts`
- [x] Move `getTransactionState()` verification call outside Dexie transaction callback

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/transaction.ts` | Modify | Add ER_CHECKREAD to isDeadlockError() |
| `packages/db/__test__/unit/transaction.test.ts` | Modify | Unit tests for ER_CHECKREAD |
| `apps/api/src/routes/settings-pages.ts` | Modify | StaticPageNotFoundError → 404 |
| `apps/pos/src/offline/sales.ts` | Modify | NaN guard on discount_total |
| `apps/pos/src/services/recovery-service.ts` | Modify | Null-safe sort, transaction scope |

---

## Estimated Effort

1 hour

## Risk Level

Low

## Dev Notes

**Why ER_CHECKREAD manifests only in CI:**
CI has more concurrent test workers competing for the same rows. The `sync_versions` optimistic locking is more likely to fire under contention. Local test runs are mostly single-threaded.

**Why move getTransactionState() outside Dexie transaction:**
Dexie auto-commits after pending operations settle. Calling `getTransactionState()` inside the transaction callback means the transaction has already auto-committed when the query runs, causing `PrematureCommitError`. The fix is to verify the state after the transaction block closes.

---

## Validation Evidence

- `npm run test -w @jurnapod/db` — unit tests pass
- `npm test -w @jurnapod/api` — settings pages tests pass
- POS offline tests — `discount_total` is numeric, no PrematureCommitError

---

## Dependencies

None

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
- [x] Integration tests included in this story
