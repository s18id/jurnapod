# Story 43.1: Fix Intermittent Test Failures

**Status:** done
**Priority:** P2

## Story

As a **CI reliability engineer**,
I want **`import/apply.test.ts` and `inventory/items/update.test.ts` to pass consistently**,
So that **CI builds are not flaky due to test pollution or race conditions**.

## Context

Two test files fail intermittently under full-suite parallel execution but pass when run individually:

1. **`import/apply.test.ts`** — The "updates existing items" test fails with `updated=0`. Root cause was two-fold:
   - Test was using a non-unique SKU pattern that could collide under parallel execution.
   - Under 4-worker parallel load, the import batch's `withTransactionRetry` (5 attempts × 100ms backoff) was insufficient — MySQL deadlocks escaped all retries and propagated as `updated=0`.

2. **`inventory/items/update.test.ts`** — test pollution from shared state. Tests may interfere with each other when run in parallel.

Both were documented in Epic 42's retrospective as pre-existing issues requiring time-boxed investigation.

---

## Acceptance Criteria

**AC1: import/apply.test.ts passes consistently**
**Given** `import/apply.test.ts` runs in parallel with other tests
**When** the "updates existing items" test executes
**Then** the item exists in the database before the update operation is attempted
**And** the test uses a collision-resistant SKU that is unique across parallel runs

**AC2: inventory/items/update.test.ts passes consistently**
**Given** `inventory/items/update.test.ts` runs in parallel with other tests
**When** any test in the file executes
**Then** test state is isolated so tests do not interfere with each other

**AC3: Both files pass in full suite**
**Given** fixes are applied
**When** `npm test -w @jurnapod/api` runs in full parallel mode
**Then** both files pass consistently (run 3 times to confirm)

---

## Technical Details

### import/apply.test.ts Fix

**Root causes:**
1. Non-unique SKU pattern under parallel execution — item created but not findable by SKU in the import batch.
2. MySQL deadlock during parallel batch — `withTransactionRetry` exhausted 5 attempts × 100ms backoff = insufficient under 4-worker contention.

**Fix approach:**
1. Use `crypto.randomUUID()` for SKU to guarantee uniqueness across all parallel workers.
2. Add select-by-ID and select-by-SKU verification before running the import batch.
3. Increase deadlock retry defaults in `packages/db/src/kysely/transaction.ts`:
   - `DEFAULT_MAX_ATTEMPTS`: 5 → 10
   - `DEFAULT_INITIAL_DELAY_MS`: 100 → 200

### inventory/items/update.test.ts Fix

**Root cause:** Likely shared item created in `beforeAll` that gets modified by one test and interferes with another.

**Fix approach:**
1. Audit the file for shared mutable state
2. Ensure each `it()` block creates its own test item or resets state
3. Use `beforeEach` instead of `beforeAll` for item creation if state mutation is unavoidable

### Files to audit

```typescript
// Pattern to avoid — shared state in beforeAll
let sharedItemId: number;
beforeAll(async () => {
  const res = await createTestItem();  // shared across tests
  sharedItemId = res.id;
});

// Pattern to use — isolated per-test state
let itemId: number;
beforeEach(async () => {
  const res = await createTestItem();  // fresh per test
  itemId = res.id;
});
afterEach(async () => {
  await deleteTestItem(itemId);  // cleanup
});
```

---

## Test Coverage Criteria

- [x] Happy paths:
  - [x] `import/apply.test.ts` passes in isolation
  - [x] `import/apply.test.ts` passes in full parallel suite (3 consecutive runs)
  - [x] `inventory/items/update.test.ts` passes in isolation
  - [x] `inventory/items/update.test.ts` passes in full parallel suite (3 consecutive runs)

---

## Tasks / Subtasks

- [x] Audit `import/apply.test.ts` for SKU collision pattern
- [x] Add `randomInt(10000)` to SKU suffix or use dedicated test item
- [x] Audit `inventory/items/update.test.ts` for shared state pollution
- [x] Isolate test state in `inventory/items/update.test.ts`
- [x] Run each file individually — confirm pass
- [x] Run full suite 3 times — confirm no intermittent failures

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/import/apply.test.ts` | Modify | Stronger unique SKU + precondition guard |
| `apps/api/__test__/integration/inventory/items/update.test.ts` | Modify | Isolate test state |

---

## Estimated Effort

2 hours

## Risk Level

Low

## Dev Notes

**Time-box:** If investigation takes more than 1 hour, promote to a dedicated sub-story rather than expanding scope.

**Verification:** Run the full suite multiple times with `--parallel` to confirm intermittent failures are resolved.

---

## Validation Evidence

```bash
# Individual file tests — confirmed passing
npm run test:single -- apps/api/__test__/integration/import/apply.test.ts
npm run test:single -- apps/api/__test__/integration/inventory/items/update.test.ts

# Full suite (2026-04-15): 135 files, 940 passed, 3 skipped — all passing
npm test -w @jurnapod/api
```

---

## Dependencies

None

---

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code
- [x] No `as any` casts added
- [x] No deprecated functions used
- [x] No N+1 query patterns introduced
- [x] Integration tests included in this story's AC
