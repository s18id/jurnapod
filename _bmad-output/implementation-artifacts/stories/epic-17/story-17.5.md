# Story 17.5: Move Push Logic to pos-sync

**Status:** Done
**Priority:** P0
**Epic:** Epic 17 - Resurrect Sync-Core (Sync Module Architecture)
**Story Number:** 17.5
**Completed:** 2026-03-31

---

## Summary

Move push sync business logic from `apps/api/src/lib/sync/push/` to `packages/pos-sync/src/push/`, implementing `handlePushSync()` that processes POS transactions, orders, order updates, item cancellations, variant sales, and variant stock adjustments with idempotency via `client_tx_id`.

**Phase 1 (pos-sync):** Persistence - transactions, orders, items, payments, taxes  
**Phase 2 (API - Story 17.6):** Business logic - COGS posting, stock deduction, table release, reservation update, posting hook

---

## Context

The original push sync logic was spread across multiple files in `lib/sync/push/`:
- `transactions.ts` - Transaction processing
- `orders.ts` - Order processing
- `variant-sales.ts` - Variant sale processing
- `variant-stock-adjustments.ts` - Stock adjustments
- `idempotency.ts` - Idempotency logic

This story consolidates that logic into `pos-sync/push/index.ts` using sync-core data queries.

### Two-Phase Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        POS Push Sync                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │   Phase 1    │────▶│   Phase 1    │────▶│   Phase 1    │     │
│  │   (pos-sync) │     │   (pos-sync) │     │   (pos-sync) │     │
│  │              │     │              │     │              │     │
│  │ Transactions │     │    Orders    │     │   Payments   │     │
│  │   Items      │     │   Taxes      │     │  Idempotency │     │
│  └──────────────┘     └──────────────┘     └──────────────┘     │
│         │                   │                    │              │
│         ▼                   ▼                    ▼              │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    Phase 1 Results                      │    │
│  │          (SyncPushResultItem[] for each item)          │    │
│  └────────────────────────────────────────────────────────┘    │
│                            │                                      │
│                            ▼                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Phase 2 (API Layer - Story 17.6)                          │  │
│  │                                                            │  │
│  │  for (result of phase1Results) {                           │  │
│  │    await postCOGS(db, result);        // COGS posting      │  │
│  │    await deductStock(db, result);     // Stock deduction  │  │
│  │    await releaseTable(db, result);    // Table release     │  │
│  │    await updateReservation(db, result); // Reservation    │  │
│  │    await invokePostingHook(result);   // Posting hook      │  │
│  │  }                                                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Story

As a developer maintaining POS sync,
I want the push sync logic in `pos-sync/push/`,
so that it handles Phase 1 (persistence) while API handles Phase 2 (business logic).

---

## Acceptance Criteria

1. **Push Sync Implementation** (AC-1)
   - `handlePushSync(params)` function in `pos-sync/push/index.ts`
   - Processes transactions, orders, order updates, cancellations, variant sales, stock adjustments
   - Returns `PushSyncResult` with `SyncPushResultItem[]`

2. **Idempotency** (AC-2)
   - Uses `syncIdempotencyService` from `@jurnapod/sync-core`
   - Checks `client_tx_id` before processing
   - Returns `DUPLICATE` for already-processed transactions

3. **Transaction Processing** (AC-3)
   - Insert transactions with items, payments, taxes
   - Validate `company_id` matches authenticated company
   - Validate `service_type: 'DINE_IN'` has `table_id`

4. **Order Processing** (AC-4)
   - Upsert order snapshots
   - Delete and re-insert order snapshot lines
   - Link orders to transactions

5. **Variant Sales Processing** (AC-5)
   - Insert variant sales with idempotency
   - Deduct variant stock

6. **Order Updates & Cancellations** (AC-6)
   - Insert order updates with idempotency
   - Insert item cancellations with idempotency

7. **Sync-Core Data Queries** (AC-7)
   - Uses data queries from `@jurnapod/sync-core`
   - Transaction queries: `readPosTransactionByClientTxId`, `insertPosTransaction`, etc.
   - Order queries: `upsertOrderSnapshot`, `insertOrderSnapshotLine`, etc.
   - Variant queries: `insertVariantSale`, `deductVariantStock`, etc.

8. **Audit Integration** (AC-8)
   - Uses `syncAuditor` from `@jurnapod/sync-core`
   - Log start, complete, and fail events

---

## Tasks / Subtasks

- [x] Task 1: Implement `handlePushSync()` main function
- [x] Task 2: Implement transaction processing with idempotency
- [x] Task 3: Implement order snapshot upsert
- [x] Task 4: Implement order update processing
- [x] Task 5: Implement item cancellation processing
- [x] Task 6: Implement variant sale processing with stock deduction
- [x] Task 7: Implement variant stock adjustment processing
- [x] Task 8: Add audit tracking
- [x] Task 9: Add integration tests

---

## Implementation Details

### Main Function

```typescript
// packages/pos-sync/src/push/index.ts

export async function handlePushSync(
  params: PushSyncParams
): Promise<PushSyncResult> {
  const {
    db,
    companyId,
    outletId,
    transactions,
    activeOrders,
    orderUpdates,
    itemCancellations,
    variantSales,
    variantStockAdjustments,
    correlationId,
  } = params;

  // Validate company_id matches
  for (const tx of transactions) {
    if (tx.company_id !== companyId) {
      return {
        success: false,
        resultCode: 'COMPANY_MISMATCH',
        errorMessage: `Transaction company_id ${tx.company_id} does not match ${companyId}`,
        results: [],
      };
    }
  }

  // Start audit tracking
  const auditId = syncAuditor.startEvent(/* ... */);

  try {
    const results: SyncPushResultItem[] = [];

    // Phase 1: Process each transaction
    for (const transaction of transactions) {
      const result = await processTransaction(db, transaction, outletId);
      results.push(result);
    }

    // Phase 1: Process active orders
    for (const order of activeOrders) {
      await processActiveOrder(db, order, companyId, outletId);
    }

    // Phase 1: Process order updates
    for (const update of orderUpdates) {
      await processOrderUpdate(db, update);
    }

    // Phase 1: Process item cancellations
    for (const cancellation of itemCancellations) {
      await processItemCancellation(db, cancellation);
    }

    // Phase 1: Process variant sales
    for (const sale of variantSales) {
      await processVariantSale(db, sale, companyId, outletId);
    }

    // Phase 1: Process variant stock adjustments
    for (const adjustment of variantStockAdjustments) {
      await processStockAdjustment(db, adjustment, companyId, outletId);
    }

    syncAuditor.completeEvent(auditId, results.length, /* ... */);

    return {
      success: true,
      resultCode: 'SUCCESS',
      results,
    };
  } catch (error) {
    syncAuditor.failEvent(auditId, error);
    throw error;
  }
}
```

### Transaction Processing

```typescript
async function processTransaction(
  db: DbConn,
  transaction: TransactionPush,
  outletId: number
): Promise<SyncPushResultItem> {
  // Check idempotency
  const existing = await readPosTransactionByClientTxId(db, transaction.client_tx_id);
  if (existing) {
    return {
      client_tx_id: transaction.client_tx_id,
      result: 'DUPLICATE',
      transaction_id: existing.id,
    };
  }

  // Validate service_type
  if (transaction.service_type === 'DINE_IN' && !transaction.table_id) {
    throw new Error(`DINE_IN transaction requires table_id`);
  }

  // Insert transaction
  const txId = await insertPosTransaction(db, {
    client_tx_id: transaction.client_tx_id,
    company_id: transaction.company_id,
    outlet_id: outletId,
    user_id: transaction.user_id,
    service_type: transaction.service_type,
    table_id: transaction.table_id,
    total_amount: transaction.total_amount,
    tax_amount: transaction.tax_amount,
    discount_amount: transaction.discount_amount,
    net_amount: transaction.net_amount,
    payment_method: transaction.payment_method,
    tx_at: transaction.tx_at,
  });

  // Insert items
  for (const item of transaction.items) {
    await insertPosTransactionItem(db, {
      pos_transaction_id: txId,
      item_id: item.item_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_amount: item.tax_amount,
      discount_amount: item.discount_amount,
      total_amount: item.total_amount,
    });
  }

  // Insert payment
  await insertPosTransactionPayment(db, {
    pos_transaction_id: txId,
    payment_method: transaction.payment_method,
    amount: transaction.total_amount,
    tx_at: transaction.tx_at,
  });

  return {
    client_tx_id: transaction.client_tx_id,
    result: 'CREATED',
    transaction_id: txId,
  };
}
```

### Variant Sale Processing with Idempotency

```typescript
async function processVariantSale(
  db: DbConn,
  sale: VariantSalePush,
  companyId: number,
  outletId: number
): Promise<VariantSaleResult> {
  // Check idempotency
  const existing = await checkVariantSaleExists(db, sale.client_tx_id);
  if (existing) {
    return { client_tx_id: sale.client_tx_id, result: 'DUPLICATE' };
  }

  // Insert variant sale
  await insertVariantSale(db, {
    client_tx_id: sale.client_tx_id,
    company_id: companyId,
    outlet_id: outletId,
    variant_id: sale.variant_id,
    quantity: sale.quantity,
    unit_price: sale.unit_price,
    total_amount: sale.total_amount,
    tx_at: sale.tx_at,
  });

  // Deduct stock
  await deductVariantStock(db, sale.variant_id, sale.quantity);

  return { client_tx_id: sale.client_tx_id, result: 'CREATED' };
}
```

### Order Update Processing

```typescript
async function processOrderUpdate(
  db: DbConn,
  update: OrderUpdatePush
): Promise<OrderUpdateResult> {
  // Check idempotency
  const existing = await checkOrderUpdateExists(db, update.update_id);
  if (existing) {
    return { update_id: update.update_id, result: 'DUPLICATE' };
  }

  // Insert order update
  await insertOrderUpdate(db, {
    order_id: update.order_id,
    update_id: update.update_id,
    status: update.status,
    notes: update.notes,
    updated_at: update.updated_at,
  });

  return { update_id: update.update_id, result: 'CREATED' };
}
```

### Item Cancellation Processing

```typescript
async function processItemCancellation(
  db: DbConn,
  cancellation: ItemCancellationPush
): Promise<ItemCancellationResult> {
  // Check idempotency
  const existing = await checkItemCancellationExists(db, cancellation.cancellation_id);
  if (existing) {
    return { cancellation_id: cancellation.cancellation_id, result: 'DUPLICATE' };
  }

  // Insert cancellation
  await insertItemCancellation(db, {
    order_id: cancellation.order_id,
    cancellation_id: cancellation.cancellation_id,
    item_id: cancellation.item_id,
    variant_id: cancellation.variant_id,
    quantity: cancellation.quantity,
    reason: cancellation.reason,
    cancelled_at: cancellation.cancelled_at,
  });

  return { cancellation_id: cancellation.cancellation_id, result: 'CREATED' };
}
```

---

## Files Created/Modified

| File | Change | Lines |
|------|--------|-------|
| `packages/pos-sync/src/push/index.ts` | Full implementation | ~1238 |
| `packages/pos-sync/src/push/types.ts` | Type definitions | ~200 |
| `packages/pos-sync/src/push/persist-push-batch.test.ts` | Integration tests | ~200 |

---

## Sync-Centric Data Queries Used

From `@jurnapod/sync-core`:

| Query | Purpose |
|-------|---------|
| `readPosTransactionByClientTxId` | Check if transaction exists |
| `batchReadPosTransactionsByClientTxIds` | Batch check transactions |
| `insertPosTransaction` | Insert transaction |
| `insertPosTransactionItem` | Insert transaction item |
| `insertPosTransactionPayment` | Insert payment |
| `insertPosTransactionTax` | Insert tax |
| `upsertOrderSnapshot` | Upsert order snapshot |
| `deleteOrderSnapshotLines` | Delete existing lines |
| `insertOrderSnapshotLine` | Insert order line |
| `checkOrderUpdateExists` | Check order update idempotency |
| `batchCheckOrderUpdatesExist` | Batch check order updates |
| `insertOrderUpdate` | Insert order update |
| `checkItemCancellationExists` | Check cancellation idempotency |
| `batchCheckItemCancellationsExist` | Batch check cancellations |
| `insertItemCancellation` | Insert cancellation |
| `checkVariantSaleExists` | Check variant sale idempotency |
| `batchCheckVariantSalesExist` | Batch check variant sales |
| `insertVariantSale` | Insert variant sale |
| `deductVariantStock` | Deduct stock |
| `checkAdjustmentExists` | Check stock adjustment idempotency |
| `insertStockAdjustment` | Insert stock adjustment |
| `getVariantCurrentStock` | Get current stock level |
| `isCashierInCompany` | Verify cashier exists |

---

## Validation Rules

| Field | Validation |
|-------|------------|
| `company_id` | Must match authenticated company's ID |
| `service_type: 'DINE_IN'` | Requires `table_id` |
| `order_state` | Must be 'OPEN' or 'CLOSED' |
| `service_type` | Must be 'TAKEAWAY' or 'DINE_IN' |

---

## Idempotency Keys

| Entity | Idempotency Key |
|--------|-----------------|
| Transaction | `client_tx_id` |
| Order Update | `update_id` |
| Item Cancellation | `cancellation_id` |
| Variant Sale | `client_tx_id` on variant sale |
| Stock Adjustment | Generated UUID |

---

## Dev Notes

### Business Logic Stubs

The following Phase 2 concerns remain in the API layer (Story 17.6):
- **COGS posting** - Cost of goods sold calculation
- **Stock cost tracking** - Track cost per item
- **Table release** - Release table after payment
- **Reservation update** - Update reservation status
- **Posting hook** - Trigger accounting posting

### Audit Event Flow

```
Push Request → startEvent()
                     ↓
               Validate company_id
                     ↓
               Process Transactions (with idempotency)
                     ↓
               Process Orders
                     ↓
               Process Order Updates / Cancellations
                     ↓
               Process Variant Sales / Stock Adjustments
                     ↓
               completeEvent() or failEvent()
                     ↓
                 Response
```

### Timestamp Handling

Uses `toMysqlDateTime()` and `toUtcInstant()` from `@jurnapod/shared` for proper timezone handling.

### Payload Hash (Future)

The implementation includes stub for `PAYLOAD_HASH_VERSION_CANONICAL_TRX_AT = 2` for future payload hashing.

---

## Definition of Done

- [x] `handlePushSync()` implemented in `pos-sync/push/index.ts`
- [x] Transaction processing with idempotency
- [x] Order snapshot upsert
- [x] Order update processing
- [x] Item cancellation processing
- [x] Variant sale processing with stock deduction
- [x] Stock adjustment processing
- [x] Audit tracking implemented
- [x] Integration tests pass
- [x] TypeScript compiles

---

## References

- [Push implementation](./packages/pos-sync/src/push/index.ts)
- [Push types](./packages/pos-sync/src/push/types.ts)
- [SyncIdempotencyService](./packages/sync-core/src/idempotency/)
- [SyncAuditor](./packages/sync-core/src/audit/sync-audit.ts)

---

## Dev Agent Record

**Completed:** 2026-03-31
**Status:** Done
**Files Modified:** 3 files, ~1,638 lines

---

*Story 17.5 - Move push logic to pos-sync*
