# Epic 59 — POS_SALE Journal Reversal for VOID/REFUND

> **Classification:** P0 Gap — Unbalanced financial state when VOID/REFUND corrections are posted with `SYNC_PUSH_POSTING_MODE=active`.
>
> **Date:** 2026-05-09
> **Author:** Architecture (Winston)
> **Status:** Draft — review before implementation

---

## Table of Contents

1. [Problem Summary](#1-problem-summary)
2. [Current Architecture](#2-current-architecture)
3. [Design Decision: Location](#3-design-decision-location)
4. [How to Obtain the Original Transaction ID](#4-how-to-obtain-the-original-transaction-id)
5. [Context Type Extensions](#5-context-type-extensions)
6. [Reversal Function: `createPosSaleReversalJournalsForCorrection`](#6-reversal-function)
7. [Modifications to `runActivePostingHook`](#7-modifications-to-runactivepostinghook)
8. [Activation Path: Connecting the Hook](#8-activation-path-connecting-the-hook)
9. [Linkage Tag Format](#9-linkage-tag-format)
10. [SyncPushPostingMode Behavior](#10-syncpushpostingmode-behavior)
11. [GL Imbalance Check for Reversals](#11-gl-imbalance-check-for-reversals)
12. [Error Handling](#12-error-handling)
13. [Test Strategy](#13-test-strategy)
14. [Risk Assessment](#14-risk-assessment)
15. [Implementation Order](#15-implementation-order)
16. [Files Modified](#16-files-modified)

---

## 1. Problem Summary

### 1.1 The Gap

When `SYNC_PUSH_POSTING_MODE=active`, the system creates POS_SALE journal batches (sales revenue, tax, payments, discount, AR) for COMPLETED POS transactions via `runSyncPushPostingHook()` → `runActivePostingHook()` in `packages/modules/accounting/src/posting/sync-push.ts`.

However, when a VOID or REFUND correction transaction is processed:

- ✅ **COGS is reversed** via `createCogsReversalJournalsForCorrection()` in `packages/pos-sync/src/push/index.ts` (Story 59.7)
- ❌ **POS_SALE is NOT reversed** — `runActivePostingHook()` returns early at line 433 with `reason: "STATUS_NOT_COMPLETED"`

### 1.2 Financial Impact

Without POS_SALE reversal, the following accounts retain stale balances from the original COMPLETED transaction after a VOID/REFUND:

| Account | Effect | Severity |
|---------|--------|----------|
| Sales Revenue | Overstated (credit not reversed) | P0 |
| Sales Tax Payable | Overstated (credit not reversed) | P0 |
| Sales Discounts | Overstated (credit not reversed) | P0 |
| AR / Cash / Bank | Overstated (debit not reversed) | P0 |
| COGS | Correctly reversed (already handled) | ✅ |

This means the GL is **permanently unbalanced** relative to business reality after any VOID/REFUND. The POS_SALE journal effect has no corresponding reversal.

### 1.3 Current Call Flow

```
POS Push → pos-sync processTransaction()
  ├── Phase 1: persist transaction (pos_transactions, items, payments, taxes)
  ├── Phase 2 (COMPLETED):
  │   ├── Stock deduction ✅
  │   ├── COGS posting ✅
  │   └── Posting hook STUB ❌ (line 782-784 — no POS_SALE journal)
  └── Phase 2 (VOID/REFUND):
      ├── COGS reversal ✅ (createCogsReversalJournalsForCorrection — line 787-797)
      └── Posting hook STUB ❌ (no POS_SALE reversal)
```

```
API processSyncPushTransactionPhase2()  [NOT CURRENTLY IN MAIN FLOW]
  ├── Stock deduction ✅
  ├── COGS posting ✅
  ├── runSyncPushPostingHook() → runActivePostingHook()
  │   ├── COMPLETED: POS_SALE journal ✅
  │   └── VOID/REFUND: returns early ❌ (STATUS_NOT_COMPLETED)
  └── GL imbalance check ✅ (for COMPLETED only)
```

---

## 2. Current Architecture

### 2.1 Push Sync Entry Points

There are **two parallel** Phase 2 implementations:

| Path | Used by | Posting Hook Status |
|------|---------|-------------------|
| `pos-sync/src/push/index.ts` `processTransaction()` | Main route → `PosSyncModule.handlePushSync()` | **STUB** (line 782-784) |
| `api/src/lib/sync/push/transactions.ts` `processSyncPushTransactionPhase2()` | NOT called from main route | Active but isolated |

The main production flow goes through path 1 (pos-sync). The posting hook is a stub there.

### 2.2 Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `packages/modules/accounting/src/posting/sync-push.ts` | 1–497 | Canonical POS_SALE journal builder + hook runner |
| `packages/pos-sync/src/push/index.ts` | 290–372, 398–505 | `findMatchingFinalizedTransactionByBusinessIdentity`, `createCogsReversalJournalsForCorrection` |
| `apps/api/src/lib/sync/push/transactions.ts` | 324–507 | API `processSyncPushTransactionPhase2` (calls posting hook, not in active flow) |
| `apps/api/src/lib/sync/push/posting-executor.ts` | 1–351 | `KyselyPosSyncPushPostingExecutor` — DB adapter for posting hook |
| `apps/api/src/lib/sync/push/types.ts` | 153–162 | `AcceptedSyncPushContext` type |
| `apps/api/src/routes/sync/push.ts` | 1–465 | Route handler — calls `module.handlePushSync()` |

### 2.3 COGS Reversal Pattern (Existing Reference)

The COGS reversal in `createCogsReversalJournalsForCorrection` follows this pattern:

1. Query `journal_batches` for `doc_type='COGS'` AND `doc_id = originalPosTransactionId`
2. For each batch found, query its `journal_lines`
3. Build reversal lines: swap debit ⇄ credit
4. Validate balance (total debit === total credit)
5. Create reversal batch with `doc_type='COGS_REVERSAL'` and `doc_id = originalPosTransactionId`
6. Insert reversal lines with linkage tag in `description`
7. The linkage tag encodes: status, original batch ID, original tx ID, correction tx ID, client_tx_id

This pattern MUST be replicated for POS_SALE.

---

## 3. Design Decision: Location

### 3.1 Decision: Accounting Package (`sync-push.ts`)

The POS_SALE reversal function MUST live in `packages/modules/accounting/src/posting/sync-push.ts`, alongside the original `buildPosSaleJournalLines` and `runActivePostingHook`.

**Rationale:**

| Consideration | Accounting Package | pos-sync Package | API Layer |
|---------------|-------------------|------------------|-----------|
| Domain ownership | ✅ POS_SALE is an accounting construct | ❌ pos-sync owns sync, not journals | ❌ API is orchestration |
| Proximity to journal builder | ✅ Lines 138, 221, 428 in same file | ❌ Must import journal constants | ❌ Would need full executor |
| Access to `PostingService` | ✅ Already imported | ❌ Not used there | ✅ Available |
| Consistency with COGS | ❌ COGS reversal is in pos-sync | ✅ Co-located with COGS | ❌ Different from COGS |
| Avoiding circular deps | ✅ No API imports needed | ❌ Needs `KyselyPosSyncPushPostingExecutor` | ✅ Can call accounting |
| Doc type constant proximity | ✅ `POS_SALE_DOC_TYPE` already defined here | ❌ Would duplicate or import | ❌ Would import |

**Decision:** Add the reversal function to `packages/modules/accounting/src/posting/sync-push.ts`. This is the canonical home for POS_SALE journal logic. The reversal IS a journal operation — it belongs in the accounting domain.

> **Note on consistency with COGS:** The COGS reversal lives in `pos-sync` because COGS posting also lives there (app-level orchestration). POS_SALE posting lives in the accounting package, so its reversal should too.

### 3.2 New Doc Type Constant

```typescript
// In sync-push.ts alongside POS_SALE_DOC_TYPE
const POS_SALE_DOC_TYPE = "POS_SALE";
const POS_SALE_REVERSAL_DOC_TYPE = "POS_SALE_REVERSAL";
```

### 3.3 New Types

```typescript
// In sync-push.ts
export interface PosSaleReversalParams {
  db: KyselySchema;
  companyId: number;
  outletId: number;
  status: "VOID" | "REFUND";
  originalPosTransactionId: number;
  correctionPosTransactionId: number;
  correctionPostedAt: string;
  clientTxId: string;
}
```

---

## 4. How to Obtain the Original Transaction ID

### 4.1 Current Availability

The original COMPLETED transaction ID is already computed in the push flow:

- **pos-sync layer** (`packages/pos-sync/src/push/index.ts` line 629):
  ```typescript
  const originalCompletedTransactionId = finalizedIdentityMatch?.status === "COMPLETED" ? finalizedIdentityMatch.id : null;
  ```
  This is computed in `processTransaction()` via `findMatchingFinalizedTransactionByBusinessIdentity()`.

- **API layer** (`processSyncPushTransactionPhase2`): The `AcceptedSyncPushContext` does NOT include `originalPosTransactionId`. Only the correction `posTransactionId` is available.

### 4.2 Design: Extend Context Types

The original transaction ID MUST be propagated through the context chain so the reversal function has access to it.

**Chain:**

```
pos-sync processTransaction()
  │  computes originalCompletedTransactionId (line 629)
  │
  ▼
SyncPushPostingContext { originalPosTransactionId }
  │  new field added
  │
  ▼
runActivePostingHook()
  │  reads context.originalPosTransactionId
  │
  ▼
createPosSaleReversalJournalsForCorrection()
  │  uses originalPosTransactionId to find POS_SALE batches
  │
  ▼
  reversal created
```

### 4.3 Two Activation Paths

Since the posting hook is a stub in pos-sync and the actual hook is only called from the API layer, we need two paths:

**Path A — Activate posting hook in pos-sync (main flow):**
The pos-sync `processTransaction()` needs to accept an optional posting hook callback and call it for both COMPLETED and VOID/REFUND. The route handler passes `KyselyPosSyncPushPostingExecutor` + `runSyncPushPostingHook`.

**Path B — API layer calls hook after pos-sync completes:**
The route handler calls `module.handlePushSync()`, then iterates results and calls `runSyncPushPostingHook()` for each OK result.

**Decision: Path A** — It's the cleaner integration. The pos-sync package accepts an optional posting hook. This keeps the Phase 2 orchestration self-contained within `processTransaction()`.

---

## 5. Context Type Extensions

### 5.1 `SyncPushPostingContext` (accounting package)

```typescript
// Current (sync-push.ts lines 71-80)
export interface SyncPushPostingContext {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  trxAt: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  posTransactionId: number;
}

// Extended
export interface SyncPushPostingContext {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  trxAt: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  posTransactionId: number;
  /** 
   * When status is VOID or REFUND, this MUST be set to the original
   * COMPLETED transaction's ID. Used to locate POS_SALE journals to reverse.
   */
  originalPosTransactionId?: number;
}
```

### 5.2 `AcceptedSyncPushContext` (API types)

```typescript
// Current (apps/api/src/lib/sync/push/types.ts lines 153-162)
export type AcceptedSyncPushContext = {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  trxAt: string;
  posTransactionId: number;
};

// Extended
export type AcceptedSyncPushContext = {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  trxAt: string;
  posTransactionId: number;
  originalPosTransactionId?: number;
};
```

### 5.3 Propagation Points

1. **pos-sync `processTransaction()`** — When `originalCompletedTransactionId !== null`, pass it through to the posting hook context.

2. **API route handler `sync/push.ts`** — When constructing the posting hook call, set `originalPosTransactionId` from the pos-sync transaction result.

3. **`processSyncPushTransactionPhase2()`** — Accept `originalPosTransactionId` in params and set it on `acceptedContext`.

---

## 6. Reversal Function

### 6.1 Function Signature

```typescript
/**
 * Create POS_SALE_REVERSAL journal entries for a VOID or REFUND correction.
 *
 * Pattern: Find all POS_SALE journal batches linked to the original COMPLETED
 * transaction, reverse each line (swap debit/credit), and create a new reversal
 * journal batch with POS_SALE_REVERSAL doc type.
 *
 * This is the inverse operation of buildPosSaleJournalLines().
 * Unlike buildPosSaleJournalLines which recomputes lines from source data,
 * this function reverses the ACTUAL posted lines from the original journal —
 * ensuring the reversal exactly matches what was posted, regardless of any
 * subsequent changes to account mappings or tax rates.
 * 
 * @param db - Database connection (must be inside a transaction if transactional
 *             integrity is required between reversal batch and lines)
 * @param params - Reversal parameters
 * @returns The reversal batch ID, or null if no POS_SALE journal exists for the
 *          original transaction
 */
export async function createPosSaleReversalJournalsForCorrection(
  db: KyselySchema,
  params: PosSaleReversalParams
): Promise<{ reversalBatchId: number } | null>;
```

### 6.2 Core Logic

```
1. Query journal_batches WHERE doc_type='POS_SALE' AND doc_id = originalPosTransactionId
   AND company_id = params.companyId AND outlet_id = params.outletId

2. IF no batches found → return null (no POS_SALE journal was ever created)
   This can happen when posting mode was "disabled" or "shadow" at original time.

3. FOR each POS_SALE batch (ordered by id ASC):
   a. Query journal_lines for this batch
   b. Build reversal lines: { account_id, debit: original.credit, credit: original.debit }
   c. Validate balance: SUM(debit) === SUM(credit) in reversal lines
   d. Generate linkage tag (see Section 9)
   e. Insert reversal batch with doc_type='POS_SALE_REVERSAL', doc_id = originalPosTransactionId
   f. Insert reversal lines with description = linkage tag

4. Return { reversalBatchId: last reversal batch ID }
```

### 6.3 Pseudocode

```typescript
async function createPosSaleReversalJournalsForCorrection(
  db: KyselySchema,
  params: PosSaleReversalParams
): Promise<{ reversalBatchId: number } | null> {
  // 1. Find existing POS_SALE batches
  const originalBatches = await sql<{ id: number }>`
    SELECT id
    FROM journal_batches
    WHERE company_id = ${params.companyId}
      AND outlet_id = ${params.outletId}
      AND doc_type = ${POS_SALE_DOC_TYPE}
      AND doc_id = ${params.originalPosTransactionId}
    ORDER BY id ASC
  `.execute(db);

  if (originalBatches.rows.length === 0) {
    return null;
  }

  const reversalLineDate = params.correctionPostedAt.slice(0, 10);
  let lastReversalBatchId: number | null = null;

  for (const batch of originalBatches.rows) {
    const originalBatchId = Number(batch.id);
    
    // 2. Query original lines
    const originalLines = await sql<ExistingJournalLineRow>`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${originalBatchId}
        AND company_id = ${params.companyId}
        AND outlet_id = ${params.outletId}
      ORDER BY id ASC
    `.execute(db);

    if (originalLines.rows.length === 0) {
      continue;
    }

    // 3. Build reversal lines (swap debit ⇄ credit)
    const linkageTag = buildReversalLinkageTag({
      status: params.status,
      originalBatchId,
      originalPosTransactionId: params.originalPosTransactionId,
      correctionPosTransactionId: params.correctionPosTransactionId,
      clientTxId: params.clientTxId,
    });

    const reversalLines = originalLines.rows.map((line) => ({
      account_id: Number(line.account_id),
      debit: Number(line.credit),
      credit: Number(line.debit),
      description: linkageTag,
    }));

    // 4. Validate balance
    const totalDebitMinor = reversalLines.reduce(
      (sum, line) => sum + toMinorUnits(line.debit), 0
    );
    const totalCreditMinor = reversalLines.reduce(
      (sum, line) => sum + toMinorUnits(line.credit), 0
    );
    if (totalDebitMinor !== totalCreditMinor) {
      throw new Error(`POS_SALE_REVERSAL_UNBALANCED:${originalBatchId}`);
    }

    // 5. Insert reversal batch
    const reversalBatchInsert = await sql`
      INSERT INTO journal_batches (
        company_id, outlet_id, doc_type, doc_id, posted_at
      ) VALUES (
        ${params.companyId},
        ${params.outletId},
        ${POS_SALE_REVERSAL_DOC_TYPE},
        ${params.originalPosTransactionId},
        ${params.correctionPostedAt}
      )
    `.execute(db);

    const reversalBatchId = Number(reversalBatchInsert.insertId);
    lastReversalBatchId = reversalBatchId;

    // 6. Insert reversal lines
    const values = reversalLines.map((line) => sql`
      (
        ${reversalBatchId},
        ${params.companyId},
        ${params.outletId},
        ${line.account_id},
        ${reversalLineDate},
        ${line.debit},
        ${line.credit},
        ${line.description}
      )
    `);

    await sql`
      INSERT INTO journal_lines (
        journal_batch_id, company_id, outlet_id,
        account_id, line_date, debit, credit, description
      ) VALUES ${sql.join(values, sql`, `)}
    `.execute(db);
  }

  return { reversalBatchId: lastReversalBatchId! };
}
```

### 6.4 Balance Guard

The reversal MUST always produce a balanced journal. The balance validation against original lines serves as a correctness invariant:

- `SUM(reversal_debits) = SUM(original_credits)` 
- `SUM(reversal_credits) = SUM(original_debits)`
- Since original was balanced: `SUM(original_debits) = SUM(original_credits)`
- Therefore: `SUM(reversal_debits) = SUM(reversal_credits)` — always balanced

If the original POS_SALE journal was unbalanced (a P0 bug), the reversal will be unbalanced too. The balance guard catches this.

### 6.5 Batch Reuse

The COGS reversal uses `doc_id = originalPosTransactionId` for the reversal batch (not the correction ID). The POS_SALE reversal MUST follow the same convention so that all reversal entries for the original transaction are grouped by its ID. This enables:
- Querying all reversal effects for an original transaction
- Audit traceability from original → reversal
- Consistent with COGS_REVERSAL pattern

### 6.6 Shared Utilities

To avoid code duplication, extract and share:

| Utility | Used By | Current Location |
|---------|---------|-----------------|
| `buildReversalLinkageTag()` | COGS + POS_SALE reversal | `pos-sync/src/push/index.ts` lines 388–396 |
| `toMinorUnits()` | COGS reversal | Duplicated in sync-push.ts (line 194) and pos-sync |

Both functions MUST be extracted to a shared location, or the POS_SALE reversal MUST define its own copies to avoid cross-package dependency.

**Decision:** Keep `buildReversalLinkageTag()` co-located in `sync-push.ts` with the same signature. The function is small (9 lines) and duplication is acceptable for package boundary cleanliness. The `toMinorUnits()` function already exists in `sync-push.ts` (line 194) — reuse it.

---

## 7. Modifications to `runActivePostingHook`

### 7.1 Current Behavior

```typescript
async function runActivePostingHook(
  db: KyselySchema,
  executor: SyncPushPostingExecutor,
  context: SyncPushPostingContext
): Promise<SyncPushPostingHookResult> {
  if (context.status !== "COMPLETED") {
    return {
      mode: "active",
      journalBatchId: null,
      balanceOk: null,
      reason: "STATUS_NOT_COMPLETED"
    };
  }
  // ... create POS_SALE journal ...
}
```

### 7.2 Modified Behavior

```typescript
async function runActivePostingHook(
  db: KyselySchema,
  executor: SyncPushPostingExecutor,
  context: SyncPushPostingContext
): Promise<SyncPushPostingHookResult> {
  if (context.status !== "COMPLETED") {
    // Handle reversal for VOID/REFUND corrections
    if (
      (context.status === "VOID" || context.status === "REFUND") &&
      context.originalPosTransactionId !== undefined
    ) {
      return await runActiveReversalHook(db, context);
    }
    
    // No original transaction ID — cannot reverse
    return {
      mode: "active",
      journalBatchId: null,
      balanceOk: null,
      reason: "STATUS_NOT_COMPLETED"
    };
  }

  // Existing COMPLETED logic unchanged...
  await executor.ensureDateWithinOpenFiscalYear(db, ...);
  const postingRequest = { ... };
  const postingService = new PostingService(...);
  const postingResult = await postingService.post(postingRequest, {
    transactionOwner: "external"
  });

  return {
    mode: "active",
    journalBatchId: Number(postingResult.journal_batch_id),
    balanceOk: true,
    reason: null
  };
}

async function runActiveReversalHook(
  db: KyselySchema,
  context: SyncPushPostingContext
): Promise<SyncPushPostingHookResult> {
  // Ensure fiscal year is open for the correction date
  await executor.ensureDateWithinOpenFiscalYear(
    db,
    context.companyId,
    fromUtcIso.dateOnly(context.trxAt)
  );

  const reversalResult = await createPosSaleReversalJournalsForCorrection(db, {
    companyId: context.companyId,
    outletId: context.outletId,
    status: context.status as "VOID" | "REFUND",
    originalPosTransactionId: context.originalPosTransactionId!,
    correctionPosTransactionId: context.posTransactionId,
    correctionPostedAt: fromUtcIso.mysql(context.trxAt),
    clientTxId: context.clientTxId,
  });

  if (reversalResult === null) {
    return {
      mode: "active",
      journalBatchId: null,
      balanceOk: null,
      reason: "NO_POS_SALE_JOURNAL_TO_REVERSE"
    };
  }

  return {
    mode: "active",
    journalBatchId: reversalResult.reversalBatchId,
    balanceOk: true,
    reason: null
  };
}
```

### 7.3 Status Matrix for `runActivePostingHook`

| Input Status | `originalPosTransactionId` | Result |
|-------------|---------------------------|--------|
| COMPLETED | — (ignored) | POS_SALE journal ✅ |
| COMPLETED (retry) | — | Idempotent via `client_tx_id` |
| VOID | undefined | `STATUS_NOT_COMPLETED` ❌ (unchanged from current) |
| VOID | set | POS_SALE_REVERSAL created ✅ |
| REFUND | undefined | `STATUS_NOT_COMPLETED` ❌ (unchanged from current) |
| REFUND | set | POS_SALE_REVERSAL created ✅ |

### 7.4 Shadow Mode for Reversal

For shadow mode, the reversal check follows the same pattern as COMPLETED — no write, just a no-op.

---

## 8. Activation Path: Connecting the Hook

### 8.1 Path A: pos-sync callback (Primary — Recommended)

Modify `processTransaction()` in pos-sync to accept an optional posting hook:

```typescript
// Add to processTransaction params or options
type PostingHook = (db: KyselySchema, context: PostingHookContext) => Promise<SyncPushPostingHookResult>;

interface PostingHookContext {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  trxAt: string;
  posTransactionId: number;
  originalPosTransactionId?: number;
}
```

**Flow change in `processTransaction()`:**

```typescript
// Current stub (lines 782-784)
// STUB: Posting hook
// await runSyncPushPostingHook(...);

// New — conditional call
if (postingHook) {
  const hookContext: PostingHookContext = {
    correlationId,
    companyId: tx.company_id,
    outletId: tx.outlet_id,
    userId: tx.cashier_user_id,
    clientTxId: tx.client_tx_id,
    status: tx.status,
    trxAt: tx.trx_at,
    posTransactionId,
    originalPosTransactionId: originalCompletedTransactionId ?? undefined,
  };
  await postingHook(db, hookContext);
}
```

**Route handler change:**

```typescript
// In apps/api/src/routes/sync/push.ts
const module = await getPosSyncModuleAsync();

// Create posting hook that uses the API's executor
const postingHook = async (db: KyselySchema, ctx: PostingHookContext) => {
  const executor = new KyselyPosSyncPushPostingExecutor(db, {
    ...ctx,
    userId: ctx.userId,  // alias for authUserId
  });
  return runSyncPushPostingHook(db, executor, {
    ...ctx,
    userId: ctx.userId,
  });
};

const phase1Results = await module.handlePushSync({
  ...params,
  postingHook,  // new optional param
});
```

### 8.2 pos-sync Interface Change

The `PushSyncParams` type needs an optional `postingHook` field:

```typescript
// In packages/pos-sync/src/push/types.ts
export interface PostingHookContext {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  trxAt: string;
  posTransactionId: number;
  originalPosTransactionId?: number;
}

export type PostingHookFn = (
  db: KyselySchema,
  context: PostingHookContext
) => Promise<SyncPushPostingHookResult>;

export interface PushSyncParams {
  // ... existing fields ...
  postingHook?: PostingHookFn;
}
```

### 8.3 Why Not Path B (API calls hook after pos-sync)?

Path B would require the route handler to:
1. Call `module.handlePushSync()`
2. Iterate individual results
3. Maintain a map of `client_tx_id → transaction payload` (needed for context)
4. Call `runSyncPushPostingHook()` per result

This is fragile — the route handler doesn't currently iterate individual results, and the transaction payload is consumed by `handlePushSync()`. Path A keeps the orchestration encapsulated.

### 8.4 Existing API `processSyncPushTransactionPhase2`

The existing `processSyncPushTransactionPhase2` in `transactions.ts` can remain as-is or be updated to support reversal. Since it's not in the active call path, it should be updated for correctness if ever activated, but its primary value is as a reference implementation.

---

## 9. Linkage Tag Format

### 9.1 Canonical Format

Modeled after the COGS reversal tag (`buildReversalLinkageTag` in pos-sync lines 388–396):

```
[REV:{STATUS}|OB:{originalBatchId}|OT:{originalTxId}|CT:{correctionTxId}|CTX:{clientTxId}]
```

| Component | Field | Description |
|-----------|-------|-------------|
| `REV:VOID` or `REV:REFUND` | `status` | Correction type |
| `OB:123` | `originalBatchId` | ID of the original POS_SALE journal batch being reversed |
| `OT:456` | `originalPosTransactionId` | ID of the original COMPLETED POS transaction |
| `CT:789` | `correctionPosTransactionId` | ID of the VOID/REFUND correction transaction |
| `CTX:abc-123` | `clientTxId` | Client transaction ID for idempotency trace |

### 9.2 Example

```
[REV:VOID|OB:42|OT:100|CT:101|CTX:txn-client-001]
```

This tag is placed in the `description` field of every reversal line, exactly as COGS_REVERSAL does.

### 9.3 Shared Implementation

The tag builder MUST be reimplemented in `sync-push.ts` (mirroring the one in pos-sync). The two implementations produce the same format. They cannot share code without a cross-package dependency on the reversal utility.

```typescript
// In sync-push.ts
function buildReversalLinkageTag(params: {
  status: "VOID" | "REFUND";
  originalBatchId: number;
  originalPosTransactionId: number;
  correctionPosTransactionId: number;
  clientTxId: string;
}): string {
  return `[REV:${params.status}|OB:${params.originalBatchId}|OT:${params.originalPosTransactionId}|CT:${params.correctionPosTransactionId}|CTX:${params.clientTxId}]`;
}
```

### 9.4 Audit Value

The linkage tag enables:
- **Forward trace:** Original POS_SALE batch → reversal → correction transaction
- **Backward trace:** Correction transaction → reversal → original batch
- **Idempotency check:** `CTX` links reversal to `client_tx_id`
- **Financial review:** All lines of a reversal share the same tag for easy identification

---

## 10. SyncPushPostingMode Behavior

### 10.1 Behavior Matrix

| Mode | COMPLETED Transaction | VOID/REFUND Transaction |
|------|----------------------|------------------------|
| `disabled` | No POS_SALE journal | No reversal (no POS_SALE to reverse) |
| `shadow` | Balance check only (no write) | No reversal (no POS_SALE was written) |
| `active` | POS_SALE journal created ✅ | POS_SALE_REVERSAL journal created ✅ |

### 10.2 Design Notes

- **`disabled`**: No financial journal is created for POS_SALE at all. No reversal needed because there's nothing to reverse. Returns `POSTING_DISABLED`.

- **`shadow`**: The POS_SALE journal was never written (shadow mode only computes and discards). For VOID/REFUND in shadow mode, there is no POS_SALE batch to find → the reversal function returns `null` → the hook returns `NO_POS_SALE_JOURNAL_TO_REVERSE`. This is correct: no write was done originally, so no reversal is needed.

- **`active`**: POS_SALE was written for the original COMPLETED transaction. The reversal MUST create POS_SALE_REVERSAL journals for every POS_SALE batch found.

### 10.3 Cross-Mode Concern

If the posting mode changed between original and correction:
- Original COMPLETED with `disabled` → Correction with `active`: No reversal needed (no POS_SALE to reverse). The reversal function returns `null`. This is correct.
- Original COMPLETED with `active` → Correction with `disabled`: POS_SALE was created but reversal is skipped. This is a **known limitation** — the GL is now overstating revenue. This scenario should be documented as a deployment concern: never switch from `active` to `disabled` without a compensating migration.

### 10.4 Mode Resolution

The mode is resolved at call time via `resolveSyncPushPostingMode()` (sync-push.ts line 397). The same mode applies to both the original posting and the reversal. No separate mode for reversals.

---

## 11. GL Imbalance Check for Reversals

### 11.1 Current Imbalance Check

In `processSyncPushTransactionPhase2` (API transactions.ts lines 421–445), the GL imbalance check runs only for COMPLETED status:

```typescript
if (
  (postingResult.mode === "active" || postingResult.mode === "shadow") &&
  acceptedContext.status === "COMPLETED" &&    // ← excludes reversal
  postingResult.journalBatchId !== null
) { ... }
```

### 11.2 Extension for Reversals

The imbalance check MUST also run for VOID/REFUND reversals:

```typescript
if (
  (postingResult.mode === "active" || postingResult.mode === "shadow") &&
  postingResult.journalBatchId !== null
) {
  // Run imbalance check for both COMPLETED and reversal batches
  const imbalanceResult = await checkGlImbalanceByBatchId(
    db,
    postingResult.journalBatchId,
    acceptedContext.companyId
  );
  // ... handle imbalance ...
}
```

### 11.3 Check Location

This check runs in the calling code (wherever `runSyncPushPostingHook` is called). For Path A (pos-sync callback), the route handler calls the hook and then checks imbalance. The pos-sync `processTransaction()` would NOT perform the imbalance check — that remains the API layer's responsibility.

---

## 12. Error Handling

### 12.1 Error Scenarios

| Scenario | Behavior | Severity |
|----------|----------|----------|
| No POS_SALE batch found for original | Return `null` — no reversal needed | Info |
| Original POS_SALE lines are empty | Skip batch (continue to next) | Warning |
| Reversal lines unbalanced | Throw `POS_SALE_REVERSAL_UNBALANCED` | P0 — Must fail |
| DB constraint violation (batch insert) | Propagate to caller | P1 |
| Fiscal year closed for correction date | Throw fiscal year error | P1 |
| `originalPosTransactionId` not set and status is VOID/REFUND | Return `STATUS_NOT_COMPLETED` (current behavior) | Info |

### 12.2 Error Propagation

Errors from `createPosSaleReversalJournalsForCorrection` propagate through `runActivePostingHook` → `runSyncPushPostingHook` → caller.

The existing `SyncPushPostingHookError` wrapping in `runSyncPushPostingHook` (line 491) already handles error wrapping for all modes. No new error type is needed.

### 12.3 Idempotency and Retries

If the posting hook is called multiple times for the same VOID/REFUND correction (e.g., retry), the reversal function will attempt to create duplicate reversal batches for the same original POS_SALE batch.

**Mitigation:** The `doc_type='POS_SALE_REVERSAL'` with `doc_id = originalPosTransactionId` can serve as a deduplication check:

```typescript
// Before creating reversal, check if reversal already exists
const existingReversal = await sql<{ id: number }>`
  SELECT id FROM journal_batches
  WHERE company_id = ${params.companyId}
    AND outlet_id = ${params.outletId}
    AND doc_type = ${POS_SALE_REVERSAL_DOC_TYPE}
    AND doc_id = ${params.originalPosTransactionId}
  LIMIT 1
`.execute(db);

if (existingReversal.rows.length > 0) {
  // Reversal already created — skip
  return { reversalBatchId: Number(existingReversal.rows[0].id) };
}
```

**Decision:** Add the deduplication check. This prevents double-reversal on retries, which would create unbalanced GL entries.

---

## 13. Test Strategy

### 13.1 Test Architecture

All tests MUST use **real database** (no mocking per mandatory policy). Tests belong in the accounting package's integration test suite.

### 13.2 Test Cases

#### Case 1: VOID with POS_SALE_REVERSAL

```
Setup:
  1. Create test company + outlet
  2. Configure account mappings (SALES_REVENUE, AR, payment methods)
  3. Create a COMPLETED POS transaction with items, payments, taxes
  4. Run runSyncPushPostingHook() — assert POS_SALE journal created

Action:
  5. Create a VOID correction transaction (linked via business identity)
  6. Run runSyncPushPostingHook() with status=VOID, originalPosTransactionId set

Assert:
  7. POS_SALE_REVERSAL journal batch exists
  8. Reversal lines exist with swapped debit/credit
  9. Reversal is balanced (total debit === total credit)
  10. Linkage tag contains REV:VOID|OB:...|OT:...|CT:...|CTX:...
  11. Each original POS_SALE line has a corresponding reversal line
  12. No duplicate reversal on re-run (idempotency)
```

#### Case 2: REFUND with POS_SALE_REVERSAL

Same as Case 1 but with `status="REFUND"`.

Assert: Tag contains `REV:REFUND` instead of `REV:VOID`.

#### Case 3: No original POS_SALE (mode was disabled)

```
Setup:
  1. Same as Case 1 but without creating POS_SALE journal

Action:
  2. Run createPosSaleReversalJournalsForCorrection()

Assert:
  3. Returns null
  4. No POS_SALE_REVERSAL batch created
```

#### Case 4: Idempotency — No double reversal

```
Setup:
  1. Create COMPLETED → POS_SALE journal
  2. Create VOID → POS_SALE_REVERSAL (first call)

Action:
  3. Run createPosSaleReversalJournalsForCorrection() again (retry)

Assert:
  4. Returns same reversal batch ID (not a new one)
  5. Only one POS_SALE_REVERSAL batch exists for original transaction
```

#### Case 5: Multiple POS_SALE batches per transaction

```
Setup:
  1. Create COMPLETED transaction with multiple POS_SALE batches
     (e.g., due to split posting or batch retries)

Action:
  2. Run reversal

Assert:
  3. Each POS_SALE batch has a corresponding POS_SALE_REVERSAL batch
  4. Total reversal debits === total original credits across all batches
```

#### Case 6: Unbalanced original journal (edge case)

```
Setup:
  1. Inject an unbalanced POS_SALE journal for a test transaction

Action:
  2. Run reversal

Assert:
  3. Throws POS_SALE_REVERSAL_UNBALANCED
```

#### Case 7: Shadow mode

```
Setup:
  1. SYNC_PUSH_POSTING_MODE=shadow
  2. Create VOID correction

Action:
  3. Run runSyncPushPostingHook()

Assert:
  4. Returns SHADOW_NOOP
  5. No POS_SALE_REVERSAL created
```

### 13.3 Fixture Requirements

New test fixtures needed:

| Fixture | Purpose |
|---------|---------|
| `createPosTransaction(companyId, outletId, status)` | Create POS transaction with items, payments, taxes |
| `createPosSaleJournalBatch(companyId, outletId, posTxId)` | Create a POS_SALE journal batch with balanced lines |

These fixtures MUST be created in the accounting package's test-fixtures directory following the canonical fixture ownership model:

```
packages/modules/accounting/src/test-fixtures/
├── index.ts
└── pos-sale-journal-fixtures.ts    ← new
```

### 13.4 Assertions

```typescript
// Assert reversal batch exists
const reversalBatches = await sql<{ id: number; doc_type: string }>`
  SELECT id, doc_type FROM journal_batches
  WHERE company_id = ${companyId}
    AND outlet_id = ${outletId}
    AND doc_type = 'POS_SALE_REVERSAL'
    AND doc_id = ${originalPosTransactionId}
`.execute(db);
expect(reversalBatches.rows.length).toBeGreaterThan(0);

// Assert lines are balanced
const lines = await sql<{ debit: number; credit: number }>`
  SELECT SUM(debit) as debit, SUM(credit) as credit
  FROM journal_lines
  WHERE journal_batch_id = ${reversalBatchId}
`.execute(db);
expect(Number(lines.rows[0].debit)).toBe(Number(lines.rows[0].credit));

// Assert linkage tag format
expect(reversalLines[0].description).toMatch(
  /^\[REV:(VOID|REFUND)\|OB:\d+\|OT:\d+\|CT:\d+\|CTX:.+\]$/
);
```

---

## 14. Risk Assessment

### 14.1 Concurrency Concerns

| Risk | Impact | Mitigation |
|------|--------|------------|
| Two concurrent corrections for same original transaction | Double reversal | Deduplication check (Section 12.3); `doc_type='POS_SALE_REVERSAL'` + `doc_id` serves as implicit dedup |
| Race between original POS and correction POS push | Reversal runs before original POS_SALE is created | Mitigated by sequential push sync — POS transactions are processed in order within a batch. The original COMPLETED will always be processed before a VOID referencing it. |
| Out-of-order push (reversal before original) | `findMatchingFinalizedTransactionByBusinessIdentity` returns nothing → `originalCompletedTransactionId` is null → reversal not created | The VOID/REFUND will be persisted but without reversal. A compensating mechanism may be needed (deferred). |

### 14.2 Out-of-Order Push: Design Decision

If a VOID transaction arrives before the original COMPLETED (possible with offline-first POS):

1. VOID is persisted (Phase 1 succeeds)
2. `findMatchingFinalizedTransactionByBusinessIdentity` returns null (original not yet synced)
3. `originalCompletedTransactionId = null`
4. COGS reversal is skipped
5. POS_SALE reversal is skipped (no `originalPosTransactionId`)
6. Later, the original COMPLETED arrives → POS_SALE journal created
7. The VOID journal entry exists but has no reversal

**Impact:** Permanent GL imbalance for this transaction.

**Mitigation Options:**
- A. **Deferred reconciliation job** — A scheduled job that finds orphaned VOID/REFUND transactions, matches them to their original COMPLETED, and creates the reversal retroactively. This is the most robust solution but requires a new component.
- B. **Re-match on COMPLETED arrival** — When processing a COMPLETED, check if a VOID/REFUND already exists for the same business identity, and create the reversal proactively. Complex and risks circular dependency.
- C. **Documented limitation** — Accept that out-of-order push requires manual reconciliation. This is acceptable for MVP/early deployment with the understanding that POS sync is typically sequential.

**Recommendation:** Option A (deferred reconciliation) as a separate follow-up story. For now, Option C (documented limitation), as out-of-order push is rare when the POS device is online. The original gap is the in-order case which this design addresses.

### 14.3 Audit Traceability

| Artifact | Traceable? | Method |
|----------|-----------|--------|
| Original POS_SALE → Reversal | ✅ | `doc_type='POS_SALE_REVERSAL'` with `doc_id = originalPosTransactionId` |
| Reversal → Original POS_SALE | ✅ | Linkage tag `OB:originalBatchId` |
| Reversal → Correction Transaction | ✅ | Linkage tag `CT:correctionPosTransactionId` |
| All effects of a correction | ✅ | Query `journal_lines WHERE description LIKE '%CT:correctionTxId%'` |
| All reversals for original POS transaction | ✅ | Query `journal_batches WHERE doc_type='POS_SALE_REVERSAL' AND doc_id = originalPosTxId` |

### 14.4 Backward Compatibility

| Concern | Impact | Handling |
|---------|--------|----------|
| Existing VOID/REFUND without reversal | Existing data has stale POS_SALE entries | Not addressed by this design. A data migration/backfill would be needed to fix historical gaps. |
| New reversal function | Purely additive — no existing consumers break | New export from accounting package, new branch in `runActivePostingHook` |
| Context type extension (`originalPosTransactionId?`) | Backward compatible — optional field | Existing callers omit it → existing behavior unchanged |
| `PushSyncParams.postingHook?` | Backward compatible — optional | Existing callers omit → hook not called (stub remains) |

### 14.5 Idempotency Safety

The deduplication check (Section 12.3) prevents double-reversal. Combined with the existing `client_tx_id` idempotency at the transaction level, the same VOID push will not create duplicate reversals.

However, **if the deduplication check fails** (e.g., due to a race condition where two concurrent checks both pass before either inserts), the system could create two reversal batches. The balance invariant at the GL level would be violated (double-reversed revenue).

**Mitigation:** The deduplication check is inside `createPosSaleReversalJournalsForCorrection`, which is called within the posting hook flow. Since POS push is sequential per transaction (not concurrent for the same `client_tx_id`), this race is not practically reachable. Adding a `UNIQUE` constraint on `(company_id, doc_type, doc_id)` for reversal doc types would provide database-level protection, but this conflicts with the "no new business DB triggers" policy. **Decision:** Accept the theoretical race — sequential processing per transaction makes it unreachable.

### 14.6 Test Risk

Integration tests with real database require:
- Fresh seed data (migrations + seeds)
- Proper cleanup between tests
- Deterministic test data (fixed timestamps, no `Date.now()`)

These are standard requirements per the existing test infrastructure. No new infrastructure needed.

---

## 15. Implementation Order

### Story 59.8a — Core Reversal Function

| Step | Description | Files |
|------|-------------|-------|
| 1 | Add `POS_SALE_REVERSAL_DOC_TYPE` constant | `sync-push.ts` |
| 2 | Add `PosSaleReversalParams` interface | `sync-push.ts` |
| 3 | Add `buildReversalLinkageTag()` function | `sync-push.ts` |
| 4 | Implement `createPosSaleReversalJournalsForCorrection()` | `sync-push.ts` |
| 5 | Add deduplication check (avoid double-reversal) | `sync-push.ts` |
| 6 | Export new function from accounting package index | `posting/index.ts` |
| 7 | Add test fixtures (pos-sale-journal-fixtures.ts) | `modules/accounting/src/test-fixtures/` |
| 8 | Write integration tests (Cases 1–7) | `modules/accounting/__test__/integration/` |
| 9 | Run `npm run build -w @jurnapod/modules-accounting` | — |
| 10 | Run `npm test -w @jurnapod/modules-accounting` | — |

### Story 59.8b — Hook Integration

| Step | Description | Files |
|------|-------------|-------|
| 1 | Extend `SyncPushPostingContext` with `originalPosTransactionId?` | `sync-push.ts` |
| 2 | Modify `runActivePostingHook` to call reversal for VOID/REFUND | `sync-push.ts` |
| 3 | Add `runActiveReversalHook` helper | `sync-push.ts` |
| 4 | Extend `AcceptedSyncPushContext` with `originalPosTransactionId?` | `api/.../types.ts` |
| 5 | Add `PostingHookContext` and `PostingHookFn` types | `pos-sync/src/push/types.ts` |
| 6 | Add optional `postingHook` param to `PushSyncParams` | `pos-sync/src/push/types.ts` |
| 7 | Modify pos-sync `processTransaction()` to call posting hook | `pos-sync/src/push/index.ts` |
| 8 | Modify route handler to pass posting hook callback | `api/src/routes/sync/push.ts` |
| 9 | Extend GL imbalance check for reversal batches | `api/.../transactions.ts` |
| 10 | Update integration tests for end-to-end flow | `api/__test__/integration/` |
| 11 | Run full test suite | — |

### Story 59.8c — Deferred Reconciliation (Follow-up)

| Step | Description | Priority |
|------|-------------|----------|
| 1 | Design orphan VOID/REFUND reconciliation job | P2 |
| 2 | Implement scheduled job to find unmatched corrections | P2 |
| 3 | Create reversal retroactively for matched orphans | P2 |
| 4 | Add alerting for unmatched corrections older than N days | P3 |

---

## 16. Files Modified

### Accounting Package

| File | Change |
|------|--------|
| `packages/modules/accounting/src/posting/sync-push.ts` | Add POS_SALE_REVERSAL doc type, reversal function, context extension, hook modification |
| `packages/modules/accounting/src/posting/index.ts` | Export new types and function |
| `packages/modules/accounting/src/test-fixtures/pos-sale-journal-fixtures.ts` | NEW — test fixtures |
| `packages/modules/accounting/__test__/integration/posting/pos-sale-reversal.test.ts` | NEW — integration tests |

### pos-sync Package

| File | Change |
|------|--------|
| `packages/pos-sync/src/push/types.ts` | Add `PostingHookContext` and `PostingHookFn` types, extend `PushSyncParams` |
| `packages/pos-sync/src/push/index.ts` | Modify `processTransaction()` to call optional posting hook |

### API Package

| File | Change |
|------|--------|
| `apps/api/src/lib/sync/push/types.ts` | Extend `AcceptedSyncPushContext` with `originalPosTransactionId?` |
| `apps/api/src/lib/sync/push/transactions.ts` | Extend GL imbalance check for reversal batches |
| `apps/api/src/routes/sync/push.ts` | Add posting hook callback to `handlePushSync` call |
| `apps/api/__test__/integration/sync/pos-sale-reversal.test.ts` | NEW — end-to-end integration tests |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| POS_SALE | Doc type for the sales revenue journal batch (sales, tax, discounts, payments, AR) |
| POS_SALE_REVERSAL | New doc type for reversal of a POS_SALE batch |
| COGS | Doc type for cost-of-goods-sold journal |
| COGS_REVERSAL | Existing doc type for reversal of a COGS batch |
| Linkage tag | Structured string in `journal_lines.description` for audit traceability |
| Business identity | Composite key matching technique using items/payments/taxes to match original↔correction |
| `originalPosTransactionId` | ID of the original COMPLETED POS transaction being corrected |
| `originalCompletedTransactionId` | Same as above — alias used in pos-sync's `processTransaction()` |

## Appendix B: Doc Type Convention

| Doc Type | Direction | Package |
|----------|-----------|---------|
| `POS_SALE` | Original | `modules-accounting` |
| `POS_SALE_REVERSAL` | Reversal (NEW) | `modules-accounting` |
| `COGS` | Original | `pos-sync` / `modules-accounting` |
| `COGS_REVERSAL` | Reversal | `pos-sync` |

All reversal doc types follow the naming convention: `{ORIGINAL}_{REVERSAL_SUFFIX}`.
