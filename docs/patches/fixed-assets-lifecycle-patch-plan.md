# Fixed Assets Lifecycle - Patch Plan

**Version:** 1.1  
**Date:** 2026-03-14  
**Status:** Ready for Implementation

---

## Overview

This document specifies the detailed patch plan to fix critical defects found in the fixed-assets lifecycle implementation. The patches are organized into 5 phases with sub-phases for granular implementation.

**Critical Defects Summary:**
1. Financial posting uses wrong account mappings (acquisition, impairment, disposal)
2. Disposal gain/loss formula is incorrect
3. Outlet access control gaps in mutations and reads
4. Void operations don't maintain book integrity
5. Idempotency lacks race-safe handling
6. API responses missing `duplicate` field

---

## Phase 1: Financial Posting Correctness (P1)

**Priority:** Critical  
**Risk:** Medium - modifies journal posting logic  
**Estimated Changes:** ~150 lines

### Phase 1.1: Acquisition Posting Fix

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts` (lines ~467-496)
- `packages/shared/src/schemas/fixed-assets.ts` (lines ~23-33)
- `apps/backoffice/src/features/fixed-assets-page.tsx` (lines ~113-125, ~400-421, ~1025-1060)

**Changes:**

1. **Schema Update** - Add required fields:
   ```typescript
   // packages/shared/src/schemas/fixed-assets.ts
   export const AcquisitionRequestSchema = z.object({
     // ... existing fields ...
     asset_account_id: NumericIdSchema,      // NEW
     offset_account_id: NumericIdSchema,    // NEW
   });
   ```

2. **Interface Update** - Add to `AcquisitionInput`:
   ```typescript
   // apps/api/src/lib/fixed-assets-lifecycle.ts
   export interface AcquisitionInput {
     // ... existing fields ...
     asset_account_id: number;
     offset_account_id: number;
   }
   ```

3. **Posting Fix** - Fix `postAcquisitionToJournal()`:
   ```typescript
   // BEFORE (broken - same account on both sides):
   const debitAccountId = expenseAccountId;
   const creditAccountId = expenseAccountId;

   // AFTER (fixed - separate accounts):
   const debitAccountId = input.asset_account_id;
   const creditAccountId = input.offset_account_id;
   ```

4. **UI Update** - Add account selectors in acquisition modal

**Acceptance Criteria:**
- [ ] Acquisition journal debits fixed asset account
- [ ] Acquisition journal credits offset (AP/Cash) account
- [ ] Both accounts validated against company

---

### Phase 1.2: Impairment Posting Fix

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts` (lines ~692-718)
- `packages/shared/src/schemas/fixed-assets.ts` (lines ~42-48)
- `apps/backoffice/src/features/fixed-assets-page.tsx` (lines ~129-135, ~479-482, ~1100-1120)

**Changes:**

1. **Schema Update**:
   ```typescript
   export const ImpairmentRequestSchema = z.object({
     // ... existing fields ...
     accum_impairment_account_id: NumericIdSchema,  // NEW
   });
   ```

2. **Interface Update**:
   ```typescript
   export interface ImpairmentInput {
     // ... existing fields ...
     accum_impairment_account_id: number;
   }
   ```

3. **Posting Fix** - Fix `postImpairmentToJournal()`:
   ```typescript
   // BEFORE (broken - same account):
   const creditAccountId = expenseAccountId;

   // AFTER (fixed):
   const creditAccountId = input.accum_impairment_account_id;
   ```

4. **UI Update** - Add accumulator account selector

**Acceptance Criteria:**
- [ ] Impairment journal debits impairment expense account
- [ ] Impairment journal credits accumulated impairment account

---

### Phase 1.3: Disposal Posting Fix - Accounts

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts` (lines ~875-935)
- `packages/shared/src/schemas/fixed-assets.ts` (lines ~50-61)
- `apps/backoffice/src/features/fixed-assets-page.tsx` (lines ~137-155, ~519-557, ~1129-1180)

**Changes:**

1. **Schema Update**:
   ```typescript
   export const DisposalRequestSchema = z.object({
     // ... existing fields ...
     asset_account_id: NumericIdSchema,                    // NEW
     accum_depr_account_id: NumericIdSchema,              // NEW
     accum_impairment_account_id: NumericIdSchema.optional(), // NEW
     gain_account_id: NumericIdSchema.optional(),        // NEW
     loss_account_id: NumericIdSchema.optional(),         // NEW
     disposal_expense_account_id: NumericIdSchema.optional(), // NEW
   });
   ```

2. **Interface Update**:
   ```typescript
   export interface DisposalInput {
     // ... existing fields ...
     asset_account_id: number;
     accum_depr_account_id: number;
     accum_impairment_account_id?: number;
     gain_account_id?: number;
     loss_account_id?: number;
     disposal_expense_account_id?: number;
   }
   ```

3. **Posting Fix** - Fix `postDisposalToJournal()`:
   ```typescript
   // Proceeds -> cash_account_id (only line using cash)
   if (proceeds > 0) {
     lines.push([journalBatchId, companyId, outletId, cashAccountId, eventDate, proceeds, 0, "Disposal Proceeds"]);
   }
   
   // Accum Depr -> accum_depr_account_id
   if (accumDepreciation > 0) {
     lines.push([..., accumDeprAccountId, ..., accumDepreciation, 0, "Accum Depr Removed"]);
   }
   
   // Accum Impairment -> accum_impairment_account_id
   if (accumImpairment > 0) {
     lines.push([..., accumImpairmentAccountId, ..., accumImpairment, 0, "Accum Impairment Removed"]);
   }
   
   // Asset Cost -> asset_account_id
   if (costBasis > 0) {
     lines.push([..., assetAccountId, ..., 0, costBasis, "Asset Cost Removed"]);
   }
   
   // Gain/Loss -> gain/loss accounts
   if (gainLoss !== 0) {
     if (gainLoss > 0) {
       lines.push([..., gainAccountId, ..., 0, gainLoss, "Gain on Disposal"]);
     } else {
       lines.push([..., lossAccountId, ..., Math.abs(gainLoss), 0, "Loss on Disposal"]);
     }
   }
   
   // Disposal Costs -> disposal_expense_account_id
   if (disposalCost > 0) {
     lines.push([..., disposalExpenseAccountId, ..., disposalCost, 0, "Disposal Costs"]);
   }
   ```

4. **UI Update** - Add all required account selectors

**Acceptance Criteria:**
- [ ] Disposal journal uses separate accounts per line type
- [ ] Cash account only used for proceeds

---

### Phase 1.4: Disposal Gain/Loss Formula Fix

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts` (lines ~793-798)

**Changes:**

```typescript
// BEFORE (broken):
if (input.disposal_type === "SALE") {
  gainLoss = normalizeMoney(proceeds + disposalCost - carryingAmount);
} else {
  gainLoss = normalizeMoney(-carryingAmount - disposalCost);
}

// AFTER (fixed):
if (input.disposal_type === "SALE") {
  // Gain = Proceeds - (Carrying Amount + Disposal Costs)
  gainLoss = normalizeMoney(proceeds - carryingAmount - disposalCost);
} else {
  // Scrap: Loss = Carrying Amount + Disposal Costs (no proceeds)
  gainLoss = normalizeMoney(-(carryingAmount + disposalCost));
}
```

**Acceptance Criteria:**
- [ ] Gain/loss sign matches accounting standards
- [ ] Disposal costs reduce gain (or increase loss)

---

### Phase 1.5: Journal Balance Validation

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts` (new function)

**Changes:**

Add helper and call before each posting:

```typescript
function assertJournalBalanced(lines: Array<{ debit: number; credit: number }>): void {
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new FixedAssetLifecycleError(
      `Journal not balanced: debit=${totalDebit}, credit=${totalCredit}`,
      "JOURNAL_UNBALANCED"
    );
  }
}
```

Call in each posting function after building lines array.

**Acceptance Criteria:**
- [ ] All posting functions validate balance before DB insert

---

## Phase 2: Access Control Hardening (P1)

**Priority:** Critical  
**Risk:** Low - adds authorization checks  
**Estimated Changes:** ~100 lines

### Phase 2.1: Service Layer - Add Outlet Access Helper

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts`

**Changes:**

Add helper function:
```typescript
async function ensureUserCanAccessAssetOutlet(
  executor: QueryExecutor,
  userId: number,
  companyId: number,
  assetId: number
): Promise<void> {
  const asset = await findFixedAssetWithExecutor(executor, companyId, assetId);
  if (!asset) throw new FixedAssetNotFoundError();
  
  if (asset.outlet_id) {
    await ensureUserHasOutletAccess(executor, userId, companyId, asset.outlet_id);
  }
}
```

**Acceptance Criteria:**
- [ ] Helper function exists and validates correctly

---

### Phase 2.2: Service Layer - Add Access Checks to Mutations

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts`

**Changes:**

Add outlet access check to:
- `recordAcquisition` - Check asset's outlet
- `recordImpairment` - Check asset's outlet
- `recordDisposal` - Check asset's outlet

```typescript
// Add at start of each function (after asset exists):
await ensureUserCanAccessAssetOutlet(connection, actor.userId, companyId, assetId);
```

**Acceptance Criteria:**
- [ ] Users cannot mutate assets outside their outlet

---

### Phase 2.3: Service Layer - Fix Transfer Source Outlet Check

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts` (lines ~541-546)

**Changes:**

Add source outlet access check:
```typescript
// Add after asset fetch:
if (fromOutletId) {
  await ensureUserHasOutletAccess(connection, actor.userId, companyId, fromOutletId);
}
// Destination check already exists
await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.to_outlet_id);
```

**Acceptance Criteria:**
- [ ] Transfer requires access to BOTH source and destination outlets

---

### Phase 2.4: Service Layer - Add Access to Void

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts`

**Changes:**

In `voidEvent`, add outlet access check:
```typescript
if (event.outlet_id) {
  await ensureUserHasOutletAccess(connection, actor.userId, companyId, event.outlet_id);
}
```

**Acceptance Criteria:**
- [ ] Users cannot void events outside their outlet

---

### Phase 2.5: Read Endpoints - Add Outlet Access

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts` (lines ~1093-1117, ~1129-1159)

**Changes:**

Modify `getAssetBook()` and `getAssetLedger()`:
1. Add `actor: { userId: number }` parameter
2. Add outlet access check after asset fetch

```typescript
export async function getAssetBook(
  companyId: number,
  assetId: number,
  actor: { userId: number }  // NEW
): Promise<BookResult> {
  // ... fetch asset ...
  
  // Add access check
  if (asset.outlet_id) {
    await ensureUserHasOutletAccess(pool, actor.userId, companyId, asset.outlet_id);
  }
  
  // ... rest ...
}
```

**Acceptance Criteria:**
- [ ] Users cannot read book/ledger for assets outside their outlet

---

### Phase 2.6: Route Layer - Pass Actor Context

**Target Files:**
- `apps/api/app/api/accounts/fixed-assets/[assetId]/acquisition/route.ts`
- `apps/api/app/api/accounts/fixed-assets/[assetId]/transfer/route.ts`
- `apps/api/app/api/accounts/fixed-assets/[assetId]/impairment/route.ts`
- `apps/api/app/api/accounts/fixed-assets/[assetId]/disposal/route.ts`
- `apps/api/app/api/accounts/fixed-assets/[assetId]/book/route.ts`
- `apps/api/app/api/accounts/fixed-assets/[assetId]/ledger/route.ts`
- `apps/api/app/api/accounts/fixed-assets/events/[eventId]/void/route.ts`

**Changes:**

Pass user to service layer calls:
```typescript
const result = await recordAcquisition(auth.companyId, assetId, input, {
  userId: auth.userId
});
// Already passing userId, but service needs to use it for access checks
```

**Acceptance Criteria:**
- [ ] All routes pass actor context to service layer

---

## Phase 3: Void/Book Integrity + Idempotency (P1)

**Priority:** Critical  
**Risk:** Medium - modifies state management  
**Estimated Changes:** ~120 lines

### Phase 3.1: Implement Book Recompute from Events

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts`

**Changes:**

Add recompute function:
```typescript
async function recomputeAssetBookFromEvents(
  executor: QueryExecutor,
  companyId: number,
  assetId: number
): Promise<{
  cost_basis: number;
  accum_depreciation: number;
  accum_impairment: number;
  carrying_amount: number;
  disposed_at: Date | null;
}> {
  const [events] = await executor.execute<FixedAssetEventRow[]>(
    `SELECT * FROM fixed_asset_events 
     WHERE asset_id = ? AND status = 'POSTED' 
     ORDER BY event_date ASC, id ASC`,
    [assetId]
  );
  
  let cost_basis = 0;
  let accum_depreciation = 0;
  let accum_impairment = 0;
  let disposed_at: Date | null = null;
  
  for (const event of events) {
    const data = typeof event.event_data === 'string' 
      ? JSON.parse(event.event_data) 
      : event.event_data;
    
    switch (event.event_type) {
      case 'ACQUISITION':
        cost_basis = Number(data.cost);
        accum_depreciation = 0;
        accum_impairment = 0;
        break;
      case 'DEPRECIATION':
        accum_depreciation += Number(data.amount || 0);
        break;
      case 'IMPAIRMENT':
        accum_impairment += Number(data.impairment_amount);
        break;
      case 'DISPOSAL':
        cost_basis = 0;
        accum_depreciation = 0;
        accum_impairment = 0;
        disposed_at = event.event_date;
        break;
    }
  }
  
  const carrying_amount = Math.max(0, cost_basis - accum_depreciation - accum_impairment);
  
  return { cost_basis, accum_depreciation, accum_impairment, carrying_amount, disposed_at };
}
```

**Acceptance Criteria:**
- [ ] Book can be recomputed from event log deterministically

---

### Phase 3.2: Fix Void Acquisition Logic

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts` (lines ~1005-1010)

**Changes:**

After marking acquisition voided, call recompute:
```typescript
// In voidEvent, after updating original event status:
const recomputed = await recomputeAssetBookFromEvents(
  connection,
  companyId,
  event.asset_id
);

await updateAssetBook(
  connection,
  companyId,
  event.asset_id,
  recomputed.cost_basis,
  recomputed.accum_depreciation,
  recomputed.accum_impairment,
  recomputed.carrying_amount,
  formatDateOnly(new Date()),
  voidEventId
);
```

**Acceptance Criteria:**
- [ ] Void acquisition resets book to zero

---

### Phase 3.3: Fix Void Disposal Logic

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts` (lines ~1010-1033)

**Changes:**

After marking disposal voided, recompute restores pre-disposal state:
```typescript
// Existing code marks disposed_at = NULL
// Need to also recompute book from remaining events

const recomputed = await recomputeAssetBookFromEvents(
  connection,
  companyId,
  event.asset_id
);

await updateAssetBook(
  connection,
  companyId,
  event.asset_id,
  recomputed.cost_basis,
  recomputed.accum_depreciation,
  recomputed.accum_impairment,
  recomputed.carrying_amount,
  formatDateOnly(new Date()),
  voidEventId
);

// disposed_at already set to null by existing code
```

**Acceptance Criteria:**
- [ ] Void disposal restores book to pre-disposal state

---

### Phase 3.4: Add Idempotency Race Handling

**Target Files:**
- `apps/api/src/lib/fixed-assets-lifecycle.ts`

**Changes:**

1. Add helper for race-safe insert:
```typescript
async function insertEventWithIdempotency(
  executor: QueryExecutor,
  // ... existing params ...
): Promise<{ eventId: number; isDuplicate: boolean }> {
  try {
    const eventId = await insertEvent(executor, /* ... */);
    return { eventId, isDuplicate: false };
  } catch (error) {
    if (isMysqlError(error) && error.errno === 1062) {
      const existing = await findExistingEventByIdempotencyKey(
        executor,
        companyId,
        idempotencyKey
      );
      if (existing) {
        return { eventId: existing.id, isDuplicate: true };
      }
    }
    throw error;
  }
}
```

2. Update all `record*` functions to use this pattern

**Acceptance Criteria:**
- [ ] Concurrent duplicate requests return same event
- [ ] No 500 errors from race conditions

---

## Phase 4: Contract Alignment (P0)

**Priority:** Critical  
**Risk:** Low - adds response fields  
**Estimated Changes:** ~50 lines

### Phase 4.1: Update Shared Schemas with duplicate Field

**Target Files:**
- `packages/shared/src/schemas/fixed-assets.ts`

**Changes:**

Add `duplicate` to response schemas:
```typescript
export const AcquisitionResponseSchema = z.object({
  event_id: NumericIdSchema,
  journal_batch_id: NumericIdSchema,
  duplicate: z.boolean(),  // NEW
  book: z.object({
    cost_basis: MoneySchema.nonnegative(),
    carrying_amount: MoneySchema.nonnegative()
  })
});

// Repeat for:
// - TransferResponseSchema
// - ImpairmentResponseSchema
// - DisposalResponseSchema
// - VoidResponseSchema
```

**Acceptance Criteria:**
- [ ] All command response schemas include `duplicate: boolean`

---

### Phase 4.2: Update Route Handlers to Return duplicate

**Target Files:**
- All fixed-asset route handlers

**Changes:**

Add `duplicate` to success responses:
```typescript
return successResponse({
  event_id: result.event_id,
  journal_batch_id: result.journal_batch_id,
  duplicate: result.duplicate,  // NEW
  book: result.book
});
```

**Acceptance Criteria:**
- [ ] API responses include duplicate flag

---

## Phase 5: Tests + Final Polish

**Priority:** High  
**Risk:** Low - test updates  
**Estimated Changes:** ~80 lines

### Phase 5.1: Fix Existing Integration Tests

**Target Files:**
- `apps/api/tests/integration/fixed-assets-lifecycle.integration.test.mjs`

**Changes:**

1. Fix idempotency test (lines ~249-263):
```typescript
// Use SAME key on both requests
const idempotencyKey = `idem-${runId}`;

// First request
await fetch(..., { idempotency_key: idempotencyKey, ... });

// Second request (retry with SAME key)
await fetch(..., { idempotency_key: idempotencyKey, ... });

// Assert duplicate
assert.equal(duplicateResponse.data.duplicate, true);
```

2. Fix disposal gain/loss expected value based on corrected formula

**Acceptance Criteria:**
- [ ] Idempotency test uses same key
- [ ] Disposal test expects correct gain/loss

---

### Phase 5.2: Add New Test Coverage

**Target Files:**
- `apps/api/tests/integration/fixed-assets-lifecycle.integration.test.mjs`

**Changes:**

Add new test cases:
1. Journal account mapping verification
2. Unauthorized outlet access (read + mutate)
3. Void book integrity
4. Race condition idempotency

**Acceptance Criteria:**
- [ ] New tests pass with corrected implementation

---

## Sequencing Summary

| Phase | Sub-Phase | Description | Dependencies |
|-------|-----------|-------------|--------------|
| 1 | 1.1 | Acquisition posting | None |
| 1 | 1.2 | Impairment posting | None |
| 1 | 1.3 | Disposal accounts | None |
| 1 | 1.4 | Disposal formula | 1.3 |
| 1 | 1.5 | Balance validation | 1.1-1.4 |
| 2 | 2.1 | Access helper | None |
| 2 | 2.2 | Mutation access | 2.1 |
| 2 | 2.3 | Transfer source | 2.1 |
| 2 | 2.4 | Void access | 2.1 |
| 2 | 2.5 | Read endpoints | 2.1 |
| 2 | 2.6 | Route layer | 2.2-2.5 |
| 3 | 3.1 | Book recompute | Phase 1 |
| 3 | 3.2 | Void acquisition | 3.1 |
| 3 | 3.3 | Void disposal | 3.1 |
| 3 | 3.4 | Idempotency race | None |
| 4 | 4.1 | Schema updates | Phase 3 |
| 4 | 4.2 | Route responses | 4.1 |
| 5 | 5.1 | Fix existing tests | Phase 1-4 |
| 5 | 5.2 | Add new tests | 5.1 |

**Total:** 19 sub-phases

---

## Rollback Plan

If issues arise:
1. Database migrations are additive - no rollback needed
2. Code changes can be reverted via git
3. Existing data in `fixed_assets` unaffected

---

## Sign-off Checklist

- [ ] Phase 1.1: Acquisition Posting
- [ ] Phase 1.2: Impairment Posting
- [ ] Phase 1.3: Disposal Accounts
- [ ] Phase 1.4: Disposal Formula
- [ ] Phase 1.5: Balance Validation
- [ ] Phase 2.1: Access Helper
- [ ] Phase 2.2: Mutation Access
- [ ] Phase 2.3: Transfer Source
- [ ] Phase 2.4: Void Access
- [ ] Phase 2.5: Read Endpoints
- [ ] Phase 2.6: Route Layer
- [ ] Phase 3.1: Book Recompute
- [ ] Phase 3.2: Void Acquisition
- [ ] Phase 3.3: Void Disposal
- [ ] Phase 3.4: Idempotency Race
- [ ] Phase 4.1: Schema Updates
- [ ] Phase 4.2: Route Responses
- [ ] Phase 5.1: Fix Tests
- [ ] Phase 5.2: New Tests
