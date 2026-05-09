# Story 59.1-Followup: Narrow Finalized-Immutability Guard for Legitimate Different `client_tx_id`

**Status:** ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 59 --story 59-1-followup --status done --title guard-narrowing`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **POS cashier and system integrity auditor**,
I want **POS sync push to accept new transactions that share business identity with a completed transaction but have a genuinely different `client_tx_id`**,
so that **legitimate offline resends with different idempotency keys are not incorrectly blocked as mutation attempts**.

---

## Background

During Epic 59 / Story 59.1 ("POS Transaction Lifecycle Correctness"), a finalized-immutability guard was added at `packages/pos-sync/src/push/index.ts:615-618` that detects when a new transaction shares business identity (same items, prices, payments, timestamp) with an existing COMPLETED transaction. This guard returns:

```
result: "ERROR"
message: "FINALIZED_TRANSACTION_MUTATION_REQUIRES_VOID_OR_REFUND"
```

**The problem:** This guard fires on business identity alone, without considering `client_tx_id`. A legitimate different transaction with a genuinely different `client_tx_id` but identical business data will be blocked as a "mutation attempt." The true idempotency system in `filterNewTransactions` (lines 869–943) already handles `client_tx_id`-based duplicate detection correctly.

**Root cause location:** `packages/pos-sync/src/push/index.ts:615-631`

```typescript
// CURRENT (buggy) — fires for COMPLETED→COMPLETED with different client_tx_id
const finalizedIdentityMatch = await findMatchingFinalizedTransactionByBusinessIdentity(db, tx);
if (finalizedIdentityMatch && finalizedIdentityMatch.status === "COMPLETED") {
  if (tx.status === "COMPLETED") {
    return {
      client_tx_id: tx.client_tx_id,
      result: "ERROR",
      message: "FINALIZED_TRANSACTION_MUTATION_REQUIRES_VOID_OR_REFUND",
    };
  }
  // ...
}
```

**The idempotency path** (`filterNewTransactions` at lines 869–943) correctly handles `client_tx_id`-based duplicate detection — it will return `DUPLICATE` for true duplicates (same `client_tx_id`) and allow new transactions through (different `client_tx_id`). The finalized identity guard is a second, incorrect gate that fires regardless of `client_tx_id`.

---

## Context

- **Epic:** 59 (POS Core Correctness Consolidation)
- **Follow-up to:** Story 59.1 (POS Transaction Lifecycle Correctness)
- **Story owner:** The guard was introduced in Story 59.1; this follow-up resolves the false-positive blocking of legitimate transactions
- **Predecessor:** Epic 59 Story 59.1 must be marked DONE before this story starts (guard is already in place, needs narrowing)
- **Scope:** Narrow the guard logic only — no other POS sync changes
- **Scope refinement (2026-05-10):** This is a correctness fix for an unintended side-effect of the Story 59.1 guard

---

## Acceptance Criteria

### AC1: Guard does not fire for COMPLETED→COMPLETED with different `client_tx_id`

**Given** a COMPLETED transaction already exists in `pos_transactions` with status `COMPLETED`,  
**And** a new incoming transaction has identical business identity (same items, prices, payments, `trx_at`) but a **different** `client_tx_id`,  
**When** the new transaction is processed,  
**Then** the finalized-immutability guard at line 615 **MUST NOT** fire and the transaction **MUST** be processed normally (inserted as a new row, returning `OK`).

**Rationale:** Different `client_tx_id` means this is a genuinely different offline submission, not a mutation attempt. The `filterNewTransactions` idempotency path handles true duplicates (same `client_tx_id`) correctly via `DUPLICATE`.

---

### AC2: Guard fires for COMPLETED→VOID with different `client_tx_id`

**Given** a COMPLETED transaction already exists in `pos_transactions` with status `COMPLETED`,  
**And** a new incoming transaction has identical business identity but **different** `client_tx_id` and status `VOID`,  
**When** the new transaction is processed,  
**Then** the finalized-immutability guard **MUST** fire with `result: "ERROR"` and message `"FINALIZED_TRANSACTION_MUTATION_REQUIRES_VOID_OR_REFUND"`.

**Rationale:** Status change from COMPLETED to VOID is a genuine mutation — the guard must block it. The correct correction path for a finalized transaction is to VOID the original via the same `client_tx_id` (idempotency path), not to submit a new `client_tx_id` with different status.

---

### AC3: Guard fires for COMPLETED→COMPLETED with same `client_tx_id`

**Given** a COMPLETED transaction already exists in `pos_transactions`,  
**And** a replay submission arrives with the **same** `client_tx_id` and status `COMPLETED`,  
**When** the replay is processed,  
**Then** `filterNewTransactions` returns `result: "DUPLICATE"` (not the finalized guard) — this behavior is unchanged and verified by existing tests.

**Rationale:** Same `client_tx_id` is a true duplicate — handled by idempotency layer, not the business-identity guard.

---

### AC4: `filterNewTransactions` idempotency path unchanged

**Given** the guard is narrowed per AC1,  
**When** `filterNewTransactions` continues to function correctly,  
**Then** no regression occurs for:
- True duplicate detection (same `client_tx_id` → `DUPLICATE`)
- Within-batch duplicate detection (same `client_tx_id` in batch → `DUPLICATE`)
- Idempotency conflict detection (payload mismatch for same `client_tx_id` → `ERROR: IDEMPOTENCY_CONFLICT`)

---

### AC5: Integration test workaround restored

**Given** `apps/api/__test__/integration/sync/idempotency.test.ts` currently uses `FIXTURE_TRX_AT_2 = '2024-01-15T03:30:01Z'` (+1s offset) to avoid the guard firing,  
**When** this story's fix is implemented,  
**Then** the test **MUST** be updated to use the same `trx_at` for both transactions (removing the `+1s` workaround) and still pass, confirming that the guard no longer falsely blocks legitimate different `client_tx_id` submissions with identical business data.

---

## Tasks / Subtasks

### Task 1: Narrow the finalized-immutability guard (AC1, AC2)

- [ ] Modify `packages/pos-sync/src/push/index.ts` lines 615–631
- [ ] The guard must compare `client_tx_id` between the incoming transaction and the matched finalized transaction
- [ ] If `client_tx_id` differs and incoming status is `COMPLETED`, skip the guard and allow the transaction through
- [ ] If `client_tx_id` differs and incoming status is `VOID` or `REFUND`, keep the guard firing (mutation)
- [ ] If `client_tx_id` matches, the `filterNewTransactions` idempotency path handles it — guard behavior for this case is irrelevant (will be `DUPLICATE` before reaching the guard)

**Implementation hint:** The guard currently uses `findMatchingFinalizedTransactionByBusinessIdentity` which does not return `client_tx_id`. You may need to fetch `client_tx_id` of the matched transaction to compare against the incoming `tx.client_tx_id`. Alternatively, restructure the guard to only fire when `status === "COMPLETED"` AND the incoming `status !== "COMPLETED"` (genuine mutation), removing the COMPLETED→COMPLETED blocking entirely.

**Minimal change approach:**
```typescript
// OLD (buggy):
if (finalizedIdentityMatch && finalizedIdentityMatch.status === "COMPLETED") {
  if (tx.status === "COMPLETED") { /* block */ }
  if (tx.status !== "VOID" && tx.status !== "REFUND") { /* block */ }
}

// NEW (fixed):
// Guard ONLY blocks genuine mutations (COMPLETED→VOID, COMPLETED→REFUND, COMPLETED→some-other-status)
// Do NOT block COMPLETED→COMPLETED — that's not a mutation, that's a new transaction with different client_tx_id
if (finalizedIdentityMatch && finalizedIdentityMatch.status === "COMPLETED") {
  if (tx.status !== "COMPLETED") {
    return { client_tx_id: tx.client_tx_id, result: "ERROR", message: "FINALIZED_TRANSACTION_MUTATION_REQUIRES_VOID_OR_REFUND" };
  }
  // COMPLETED→COMPLETED: allow through (filterNewTransactions handles client_tx_id duplicate detection)
}
```

### Task 2: Add/update tests in `packages/pos-sync` (AC1, AC2, AC3, AC4)

- [ ] Locate existing integration tests for the finalized-immutability guard in `packages/pos-sync/__test__/integration/`
- [ ] Add a test case: COMPLETED→COMPLETED with **different** `client_tx_id` → passes through (AC1)
- [ ] Add a test case: COMPLETED→VOID with **different** `client_tx_id` → blocked (AC2)
- [ ] Add a test case: COMPLETED→COMPLETED with **same** `client_tx_id` → `DUPLICATE` (AC3 — verify unchanged)
- [ ] Verify `filterNewTransactions` path still works for idempotency cases (AC4)
- [ ] Ensure all new tests are deterministic and use fixture-created entities (no hardcoded IDs)

**Test file:** `packages/pos-sync/__test__/integration/persist-push-batch.integration.test.ts` (already has finalized guard tests per Story 59.1 completion report)

### Task 3: Restore idempotency test workaround (AC5)

- [ ] Update `apps/api/__test__/integration/sync/idempotency.test.ts`
- [ ] Remove the `+1s` offset workaround (`FIXTURE_TRX_AT_2` no longer needed)
- [ ] Use the same `trx_at` (`FIXTURE_TRX_AT`) for both transactions in the duplicate detection test
- [ ] Verify the test still passes after the guard narrowing fix

---

## Dev Notes

### Project Structure Notes

- **Source file:** `packages/pos-sync/src/push/index.ts` — the only file to modify for the guard fix
- **Test file (pos-sync):** `packages/pos-sync/__test__/integration/persist-push-batch.integration.test.ts`
- **Test file (api):** `apps/api/__test__/integration/sync/idempotency.test.ts`
- **No new packages** required — this is a targeted correctness fix within existing code

### References

- [Source: `packages/pos-sync/src/push/index.ts:615-631`] — Finalized-immutability guard (the bug)
- [Source: `packages/pos-sync/src/push/index.ts:292-374`] — `findMatchingFinalizedTransactionByBusinessIdentity`
- [Source: `packages/pos-sync/src/push/index.ts:869-943`] — `filterNewTransactions` (idempotency path)
- [Source: `apps/api/__test__/integration/sync/idempotency.test.ts:68-69`] — Workaround comment and `FIXTURE_TRX_AT_2`
- [Source: `_bmad-output/implementation-artifacts/stories/epic-59/story-59.1.completion.md`] — Story 59.1 completion evidence

### Architecture Patterns

- **Idempotency via `client_tx_id`:** The canonical pattern — `filterNewTransactions` checks `client_tx_id` existence in DB; true duplicates return `DUPLICATE`
- **Business identity collision detection:** Secondary check — `findMatchingFinalizedTransactionByBusinessIdentity` detects same business data (items, prices, payments, timestamp)
- **Guard purpose:** Detect mutation attempts (COMPLETED→VOID, COMPLETED→REFUND) when business identity matches
- **Guard bug:** Was also blocking COMPLETED→COMPLETED with different `client_tx_id`, which is not a mutation

### Testing Standards

- Tests in `packages/pos-sync` use **real DB** (Kysely, not mocked)
- Tests in `packages/pos-sync` must clean up Kysely instance in `afterAll()`
- Use fixture-created entities (no hardcoded `company_id=1` or similar)
- Test log rule: run tests in background with PID tracking

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

_(to be filled during implementation)_

### Completion Notes List

_(to be filled during implementation)_

### File List

| File | Change |
|------|--------|
| `packages/pos-sync/src/push/index.ts` | Narrow guard logic at lines 615–631 |
| `packages/pos-sync/__test__/integration/persist-push-batch.integration.test.ts` | Add test cases for AC1, AC2, AC3 |
| `apps/api/__test__/integration/sync/idempotency.test.ts` | Remove `+1s` workaround, restore same `trx_at` for duplicate test |