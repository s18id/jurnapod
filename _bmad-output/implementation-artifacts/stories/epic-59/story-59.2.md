# Story 59.2: Sync Idempotency Contract Correctness

**Status:** ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 59 --story 59-2 --status done --title sync-idempotency-contract-correctness`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **POS operator on unstable networks**,
I want **duplicate retries to be safely deduplicated by `client_tx_id`**,
So that **retries never create duplicate financial effects**.

---

## Context

- **Source:** Epic 59
- **Depends on:** Story 59.1 (lifecycle + correction flow foundation)
- **Scope:** Idempotent push contract behavior for sync/push endpoint
- **Non-Goal:** No changes to `SYNC_PUSH_POSTING_MODE` behavior; focus is on transaction-level deduplication

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist
- [x] Happy paths identified
- [x] Error paths identified
- [x] Edge cases identified
- [x] Fixture needs identified
- [x] Integration-test coverage planned

### Review Outcome

| Scenario | Type | Coverage Plan |
|---|---|---|
| First submit with unique `client_tx_id` returns OK | Happy | Integration |
| Duplicate submit with same `client_tx_id` in same company returns DUPLICATE | Happy | Integration |
| Duplicate does not create duplicate financial effects (no double-posting) | Integrity | Integration |
| Missing `client_tx_id` rejected with machine-readable error | Error | Integration |
| Invalid format `client_tx_id` rejected | Error | Integration |
| Duplicate in different company scope (隔离) | Edge | Integration |
| Retry after DUPLICATE returns same response | Edge | Integration |

**Sign-off:** Scenario set approved before implementation.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Error Boundary Test Matrix

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|---|---|---|---|---|
| `SyncValidationError` | `@jurnapod/pos-sync` | `apps/api` | ✅ | ✅ |
| `SyncStockConflictError` | `@jurnapod/pos-sync` | `apps/api` | ✅ | ✅ |
| `SyncStockOverflowError` | `@jurnapod/pos-sync` | `apps/api` | ✅ | ✅ |
| `DatabaseConflictError` | `apps/api/lib/shared` | `apps/api` | ✅ | ✅ |

---

## Acceptance Criteria

**AC1: Unique idempotency key path**
**Given** a push payload with a new `client_tx_id` (never seen in this company scope),
**When** it is submitted to `/sync/push`,
**Then** processing MUST complete once and return `{ success: true, result: "OK" }`.

**AC2: Duplicate key no-op path**
**Given** a push payload with a `client_tx_id` that was already successfully processed in the same company scope,
**When** it is submitted again,
**Then** response MUST be `{ success: true, result: "DUPLICATE" }` and no new journal/posting effects MUST be created.

**AC3: Duplicate does not double-post financial effects**
**Given** a transaction with `client_tx_id=X` was successfully posted (COMPLETED with journal),
**When** a duplicate push with `client_tx_id=X` is submitted,
**Then** no additional journal batch MUST be created for that transaction.

**AC4: Validation gate for missing client_tx_id**
**Given** a push payload with missing or null `client_tx_id`,
**When** request validation runs,
**Then** the request MUST be rejected with HTTP 400 and machine-readable `{ code: "VALIDATION_ERROR", message: "client_tx_id is required" }`.

**AC5: Validation gate for invalid client_tx_id format**
**Given** a push payload with an invalid `client_tx_id` format (empty string, wrong type),
**When** request validation runs,
**Then** the request MUST be rejected with HTTP 400 and machine-readable error.

**AC6: Cross-tenant isolation**
**Given** a push payload with `client_tx_id=X` in company A,
**When** the same `client_tx_id=X` is submitted in company B,
**Then** company B's submission MUST be processed as a new unique transaction (not deduplicated against company A).

---

## Tasks / Subtasks

- [ ] Verify `client_tx_id` unique index semantics (company-scoped lookup)
- [ ] Add integration tests for AC1 (first submit → OK)
- [ ] Add integration tests for AC2/AC3 (duplicate → DUPLICATE, no double-post)
- [ ] Add integration tests for AC4/AC5 (validation errors)
- [ ] Add integration tests for AC6 (cross-tenant isolation)
- [ ] Ensure DUPLICATE response is deterministic on retry
- [ ] Document idempotency behavior in Dev Notes

---

## Files to Modify

| File | Action | Description |
|---|---|---|
| `apps/api/src/routes/sync/push.ts` | Modify | Ensure `client_tx_id` validation and duplicate handling |
| `packages/pos-sync/src/push/index.ts` | Modify | Verify idempotency behavior in `processTransaction` |
| `apps/api/__test__/integration/sync/push-idempotency.test.ts` | Create | Integration tests for AC1–AC6 |

---

## Test Coverage Criteria

- Coverage target: all AC paths (100%)
- Happy paths to test:
  - [ ] Unique `client_tx_id` → OK
  - [ ] Duplicate `client_tx_id` → DUPLICATE (no second effect)
  - [ ] Retry after DUPLICATE → same DUPLICATE response
- Error paths to test:
  - [ ] Missing `client_tx_id` → 400 VALIDATION_ERROR
  - [ ] Empty string `client_tx_id` → 400 VALIDATION_ERROR
  - [ ] Non-string `client_tx_id` → 400 VALIDATION_ERROR
- Edge cases to test:
  - [ ] Same `client_tx_id` in different company → both processed (no cross-tenant dedup)
  - [ ] `client_tx_id` with whitespace → handled correctly

---

## Validation Evidence

```bash
# Run idempotency integration tests
npm test -w @jurnapod/api -- --run __test__/integration/sync/push-idempotency.test.ts

# Expected: all tests pass (AC1–AC6 coverage)
```

---

## Dev Notes

### Current Implementation Behavior (to verify)
- `pos-sync` uses `findMatchingFinalizedTransactionByBusinessIdentity` which matches by business identity, not `client_tx_id` alone
- The `client_tx_id` is stored on `pos_transactions.client_tx_id` and is unique per company
- Deduplication check happens at Phase 1 persist (before duplicate insert)

### Key Invariants
1. `client_tx_id` is unique per company — confirmed by DB unique index
2. DUPLICATE response means the transaction was already processed — no additional effects
3. Cross-company dedup is NOT performed — same `client_tx_id` in different companies is distinct

### Canonical Response Format
```typescript
// Success (first submit)
{ success: true, result: "OK", data: { posTransactionId: number } }

// Duplicate (already processed)
{ success: true, result: "DUPLICATE", data: { posTransactionId: number } }

// Validation error
{ success: false, code: "VALIDATION_ERROR", message: string }
```

---

## Risk Level

P1 — idempotency failure risks duplicate financial posting which is a P0 event. However, the core idempotency infrastructure exists; this story validates and hardens it.

---

_Last Updated: 2026-05-09_