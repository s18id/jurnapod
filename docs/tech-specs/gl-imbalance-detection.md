# GL Imbalance Detection

**Status:** Implemented  
**Epic:** E30 — Journal Integrity  
**Story:** 30.7  
**Owner:** Charlie

---

## 1. Overview

A **GL imbalance** occurs when a journal batch has `SUM(debit) != SUM(credit)` in `journal_lines`. This is a financial integrity violation — every unbalanced journal is a **P1** defect because it means the ledger cannot balance and financial reports will be incorrect.

---

## 2. Design Decision: Posting-Boundary Approach

### Options Considered

| Option | Description |
|--------|-------------|
| **Posting-boundary check** (chosen) | Call `checkGlImbalanceByBatchId()` immediately after `runSyncPushPostingHook()` completes |
| **Periodic background job** | Scan recent batches on a schedule (e.g., every N minutes) |

### Why Posting-Boundary Was Chosen

- **Immediate feedback** — Financial integrity violations are detected at the moment they occur, not minutes later
- **Deterministic** — Only checks batches that were just created; no scanning overhead for old batches
- **Simpler operational model** — No separate cron job or scheduled task to deploy, monitor, and maintain
- **Shadow mode coverage** — Catches errors in validation runs before they reach production

---

## 3. Implementation

### 3.1 Core Functions

**`packages/modules/accounting/src/journals-service.ts`**

- **`findAllGlImbalances(companyId)`** (line ~466) — Scans all journal lines for a company and returns every batch where `SUM(debit) != SUM(credit)`. Intended for ad-hoc diagnostic queries.

- **`checkGlImbalanceByBatchId(db, batchId)`** (line ~507) — Checks a single batch by its globally unique `journal_batches.id`. Returns `GlImbalanceResult | null`. Used at posting boundaries.

### 3.2 Wiring Location

**`apps/api/src/lib/sync/push/transactions.ts`** (lines 421–441)

Runs immediately after `runSyncPushPostingHook()` completes:

```typescript
// GL Imbalance Check (Story 30.7)
// Verify the created journal batch is balanced after posting
if (
  (postingResult.mode === "active" || postingResult.mode === "shadow") &&
  acceptedContext.status === "COMPLETED" &&
  postingResult.journalBatchId !== null
) {
  const imbalanceResult = await checkGlImbalanceByBatchId(db, postingResult.journalBatchId);
  if (imbalanceResult !== null) {
    // GL imbalance detected - record metric with tenant isolation
    journalMetrics.recordGlImbalance(acceptedContext.companyId);
    console.error("GL imbalance detected after posting", {
      correlation_id: correlationId,
      client_tx_id: acceptedContext.clientTxId,
      journal_batch_id: postingResult.journalBatchId,
      total_debit: imbalanceResult.totalDebit,
      total_credit: imbalanceResult.totalCredit,
      imbalance: imbalanceResult.imbalance
    });
  }
}
```

### 3.3 Why Check Shadow Mode Too

Shadow mode produces a journal batch for validation purposes only — it is never committed to the permanent journal record. However, imbalance detection is **most valuable in shadow mode** because it catches mapping or calculation errors before they hit production. Both `active` and `shadow` modes are therefore checked.

---

## 4. Tenant Safety

| Function | Isolation Mechanism |
|----------|---------------------|
| `findAllGlImbalances(companyId)` | Requires `companyId` parameter; SQL filters by `company_id` — cross-tenant scans are prevented |
| `checkGlImbalanceByBatchId(db, batchId)` | Uses globally unique `journal_batches.id` (AUTO_INCREMENT); batch ID alone uniquely identifies a single company's batch — no `companyId` parameter needed |

---

## 5. Race Condition Consideration

The imbalance check runs **after** the posting transaction commits. Between commit and check, concurrent operations could theoretically modify `journal_lines` via direct SQL or bugs in related transactions.

This is a **known limitation**:
- The check is **best-effort**, not a substitute for proper transaction isolation
- It does not prevent unbalanced writes — it detects them after the fact
- The primary prevention mechanism is the transactional integrity of the posting hook itself

---

## 6. Metric

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `gl_imbalance_detected_total` | Counter | `company_id` | Incremented when an imbalance is found after posting |

**`apps/api/src/lib/metrics/journal-metrics.ts`** — `recordGlImbalance(companyId)` (line ~111)

The `company_id` label is converted to a string for Prometheus compatibility.

---

## 7. Related Files

| File | Purpose |
|------|---------|
| `packages/modules/accounting/src/journals-service.ts` | `findAllGlImbalances()`, `checkGlImbalanceByBatchId()` |
| `apps/api/src/lib/sync/push/transactions.ts` | Wiring — runs check after `runSyncPushPostingHook()` |
| `apps/api/src/lib/metrics/journal-metrics.ts` | `recordGlImbalance()` counter |
