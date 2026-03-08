# POS Offline DB Schema Extensions Specification

**Status:** Design  
**Date:** 2026-03-08  
**Context:** Service mode workflow implementation - schema alignment  
**Related Docs:** `pos-service-mode-workflow-implementation.md`

---

## Overview

This document specifies schema extensions needed to support the service mode workflow plan. The current offline DB schema (version 9) already includes all core tables required. This specification focuses on optional field additions for ADR-0006 alignment and the future item cancellations audit trail.

---

## Current Schema Status (Version 9)

### ✅ Already Implemented Tables

#### `outlet_tables` (version 5+)
```typescript
interface OutletTableRow {
  pk: string;                    // PK: {company_id}:{outlet_id}:{table_id}
  table_id: number;
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: OutletTableStatus;     // AVAILABLE | RESERVED | OCCUPIED | UNAVAILABLE
  updated_at: string;
}
```

**Indexes:**
- `&pk` (primary key)
- `[company_id+outlet_id+table_id]` (compound lookup)
- `[company_id+outlet_id+status]` (status filtering)
- `updated_at` (sync ordering)

**Status:** No changes needed ✅

---

#### `reservations` (version 6+)
```typescript
interface ReservationRow {
  pk: string;                    // PK: {company_id}:{outlet_id}:{reservation_id}
  reservation_id: number;
  company_id: number;
  outlet_id: number;
  table_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  guest_count: number;
  reservation_at: string;
  duration_minutes: number | null;
  status: ReservationStatus;     // BOOKED | CONFIRMED | ARRIVED | SEATED | COMPLETED | CANCELLED | NO_SHOW
  notes: string | null;
  linked_order_id: string | null;
  created_at: string;
  updated_at: string;
  arrived_at: string | null;
  seated_at: string | null;
  cancelled_at: string | null;
}
```

**Indexes:**
- `&pk` (primary key)
- `[company_id+outlet_id+reservation_at]` (chronological lookup)
- `[company_id+outlet_id+status]` (status filtering)
- `[company_id+outlet_id+table_id]` (table linkage)
- `updated_at` (sync ordering)

**Status:** No changes needed ✅

---

#### `active_orders` (version 8+, enhanced version 9)
```typescript
interface ActiveOrderRow {
  pk: string;                    // PK: active_order:{order_id}
  order_id: string;              // UUID
  company_id: number;
  outlet_id: number;
  service_type: OrderServiceType; // TAKEAWAY | DINE_IN
  table_id: number | null;       // Required for DINE_IN
  reservation_id: number | null; // Optional linkage
  guest_count: number | null;
  is_finalized: boolean;         // Snapshot committed flag
  order_status: OrderStatus;     // OPEN | READY_TO_PAY | COMPLETED | CANCELLED
  order_state: ActiveOrderState; // OPEN | CLOSED
  paid_amount: number;           // Integer minor units (cents)
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  updated_at: string;
}
```

**Indexes:**
- `&pk` (primary key)
- `&order_id` (unique constraint)
- `[company_id+outlet_id+order_state+updated_at]` (open orders by recency)
- `[company_id+outlet_id+order_state+is_finalized+updated_at]` (finalized orders filter)
- `[company_id+outlet_id+table_id+order_state]` (table association)
- `[company_id+outlet_id+reservation_id+order_state]` (reservation association)

**Status:** No changes needed for core workflow ✅  
**Optional Enhancement:** Add `source_flow` and `settlement_flow` fields (see below)

---

#### `active_order_lines` (version 8+)
```typescript
interface ActiveOrderLineRow {
  pk: string;                    // PK: active_order_line:{order_id}:{item_id}
  order_id: string;
  company_id: number;
  outlet_id: number;
  item_id: number;
  sku_snapshot: string | null;
  name_snapshot: string;
  item_type_snapshot: ProductItemType; // SERVICE | PRODUCT | INGREDIENT | RECIPE
  unit_price_snapshot: number;   // Integer minor units (cents)
  qty: number;
  discount_amount: number;       // Integer minor units (cents)
  updated_at: string;
}
```

**Indexes:**
- `&pk` (primary key)
- `[order_id+item_id]` (compound lookup)
- `[company_id+outlet_id+order_id]` (order association)

**Status:** No changes needed ✅

---

## Optional Schema Extensions

### Extension 1: ADR-0006 Flow Fields (Optional, Low Priority)

**Objective:** Add `source_flow` and `settlement_flow` fields to align with ADR-0006 unified order lifecycle model.

**Impact:** Low - These fields provide additional context for analytics and reporting but are not required for core workflow functionality.

#### Proposed Changes to `ActiveOrderRow`

```typescript
interface ActiveOrderRowExtended extends ActiveOrderRow {
  source_flow?: SourceFlow;      // WALK_IN | RESERVATION | PHONE | ONLINE | MANUAL
  settlement_flow?: SettlementFlow; // IMMEDIATE | DEFERRED | SPLIT
}

type SourceFlow = 'WALK_IN' | 'RESERVATION' | 'PHONE' | 'ONLINE' | 'MANUAL';
type SettlementFlow = 'IMMEDIATE' | 'DEFERRED' | 'SPLIT';
```

#### Migration Path (if implemented)

**Version 10 Schema:**
```typescript
this.version(10).stores({
  // ... all other tables unchanged
  active_orders:
    "&pk,&order_id,[company_id+outlet_id+order_state+updated_at],[company_id+outlet_id+order_state+is_finalized+updated_at],[company_id+outlet_id+table_id+order_state],[company_id+outlet_id+reservation_id+order_state],[company_id+outlet_id+source_flow],[company_id+outlet_id+settlement_flow]"
});
```

#### Type Extension
```typescript
// packages/offline-db/dexie/types.ts

export type SourceFlow = 'WALK_IN' | 'RESERVATION' | 'PHONE' | 'ONLINE' | 'MANUAL';
export type SettlementFlow = 'IMMEDIATE' | 'DEFERRED' | 'SPLIT';

export interface ActiveOrderRow {
  // ... existing fields
  source_flow?: SourceFlow;
  settlement_flow?: SettlementFlow;
}
```

#### Default Values
```typescript
// When creating new orders:
const sourceFlow: SourceFlow = 
  reservation_id ? 'RESERVATION' : 'WALK_IN';

const settlementFlow: SettlementFlow = 
  service_type === 'TAKEAWAY' ? 'IMMEDIATE' : 'DEFERRED';
```

**Decision:** Deferred to Phase 5 or later. Not required for MVP workflow.

---

### Extension 2: Item Cancellations Audit Trail (Deferred to Phase 5)

**Objective:** Track item quantity reductions with reason capture for audit and reporting.

**Impact:** Medium - Required for full "Cancel Items" workflow but can be implemented after core features.

#### Proposed New Table: `item_cancellations`

```typescript
export interface ItemCancellationRow {
  pk: string;                    // PK: item_cancellation:{cancellation_id}
  cancellation_id: string;       // UUID
  order_id: string;              // FK to active_orders.order_id
  company_id: number;
  outlet_id: number;
  item_id: number;
  cancelled_quantity: number;
  reason: string;                // Required user input
  cancelled_by_user_id: number;
  cancelled_at: string;          // ISO timestamp
}
```

#### Version 10+ Schema (when implemented)
```typescript
this.version(10).stores({
  // ... all other tables
  item_cancellations: 
    "&pk,&cancellation_id,[company_id+outlet_id+order_id],[order_id+item_id+cancelled_at],cancelled_at"
});
```

#### Indexes
- `&pk` (primary key)
- `&cancellation_id` (unique constraint)
- `[company_id+outlet_id+order_id]` (order association)
- `[order_id+item_id+cancelled_at]` (item history)
- `cancelled_at` (chronological ordering)

#### Usage Flow
```typescript
// When cashier cancels items from finalized order:
async function cancelOrderItems(
  scope: RuntimeOutletScope,
  orderId: string,
  cancellations: Array<{
    item_id: number;
    cancelled_quantity: number;
    reason: string;
  }>,
  userId: number
): Promise<void> {
  const snapshot = await runtime.getActiveOrderSnapshot(scope, orderId);
  if (!snapshot) throw new Error('Order not found');

  // Validate cancellations
  for (const cancel of cancellations) {
    const line = snapshot.lines.find(l => l.item_id === cancel.item_id);
    if (!line) throw new Error(`Item ${cancel.item_id} not in order`);
    if (cancel.cancelled_quantity > line.qty) {
      throw new Error(`Cannot cancel more than ordered quantity`);
    }
    if (!cancel.reason.trim()) {
      throw new Error('Cancellation reason is required');
    }
  }

  const now = new Date().toISOString();

  // Create cancellation records
  const cancellationRows: ItemCancellationRow[] = cancellations.map(cancel => ({
    pk: `item_cancellation:${crypto.randomUUID()}`,
    cancellation_id: crypto.randomUUID(),
    order_id: orderId,
    company_id: scope.company_id,
    outlet_id: scope.outlet_id,
    item_id: cancel.item_id,
    cancelled_quantity: cancel.cancelled_quantity,
    reason: cancel.reason,
    cancelled_by_user_id: userId,
    cancelled_at: now
  }));

  // Update order lines
  const updatedLines = snapshot.lines.map(line => {
    const cancel = cancellations.find(c => c.item_id === line.item_id);
    if (!cancel) return line;
    return {
      ...line,
      qty: line.qty - cancel.cancelled_quantity
    };
  }).filter(line => line.qty > 0); // Remove fully cancelled items

  // Persist changes atomically
  await storage.transaction('readwrite', ['item_cancellations', 'active_order_lines'], async () => {
    await storage.upsertItemCancellations(cancellationRows);
    await storage.replaceActiveOrderLines(orderId, updatedLines);
  });
}
```

#### Reporting Queries
```typescript
// Get all cancellations for an order
const cancellations = await storage.getItemCancellationsByOrder(orderId);

// Get cancellation history for analysis
const history = await storage.getItemCancellationsByDateRange(
  scope,
  startDate,
  endDate
);

// Aggregate cancellations by reason
const byReason = cancellations.reduce((acc, c) => {
  acc[c.reason] = (acc[c.reason] || 0) + c.cancelled_quantity;
  return acc;
}, {} as Record<string, number>);
```

**Decision:** Deferred to Phase 5. Cancellation UI can be built without audit trail initially (just direct quantity reduction with in-memory reason capture and logging).

---

## Migration Strategy

### Current State: Version 9
All required tables for service mode workflow exist:
- ✅ `outlet_tables`
- ✅ `reservations`
- ✅ `active_orders`
- ✅ `active_order_lines`
- ✅ `sales` (with service_type, table_id, reservation_id fields added in version 7)

### No Breaking Changes Required
The current schema fully supports the planned workflow without modifications. Optional extensions can be added later without breaking existing functionality.

### Future Migration Path (Optional Extensions)

#### Version 10 (Optional, if ADR-0006 fields needed)
```typescript
this.version(10).stores({
  products_cache:
    "&pk,[company_id+outlet_id+item_id],[company_id+outlet_id+data_version],[company_id+outlet_id+is_active]",
  outlet_tables: 
    "&pk,[company_id+outlet_id+table_id],[company_id+outlet_id+status],updated_at",
  reservations:
    "&pk,[company_id+outlet_id+reservation_at],[company_id+outlet_id+status],[company_id+outlet_id+table_id],updated_at",
  active_orders:
    "&pk,&order_id,[company_id+outlet_id+order_state+updated_at],[company_id+outlet_id+order_state+is_finalized+updated_at],[company_id+outlet_id+table_id+order_state],[company_id+outlet_id+reservation_id+order_state],[company_id+outlet_id+source_flow]",
  active_order_lines: 
    "&pk,[order_id+item_id],[company_id+outlet_id+order_id]",
  sales:
    "&sale_id,&client_tx_id,[company_id+outlet_id+status],[company_id+outlet_id+created_at],sync_status,[company_id+outlet_id+reservation_id],[company_id+outlet_id+table_id]",
  sale_items: 
    "&line_id,sale_id,[company_id+outlet_id+sale_id]",
  payments: 
    "&payment_id,sale_id,[company_id+outlet_id+sale_id]",
  outbox_jobs:
    "&job_id,&dedupe_key,sale_id,[status+next_attempt_at],[status+lease_expires_at],lease_expires_at,updated_at",
  sync_metadata: 
    "&pk,[company_id+outlet_id],last_data_version,updated_at",
  sync_scope_config: 
    "&pk,[company_id+outlet_id],data_version,updated_at"
});
```

**Migration Logic:**
```typescript
// Dexie handles schema upgrades automatically
// New optional fields default to undefined for existing records
// No data transformation needed
```

#### Version 11 (Optional, if item cancellations needed)
```typescript
this.version(11).stores({
  // ... all version 10 tables
  item_cancellations: 
    "&pk,&cancellation_id,[company_id+outlet_id+order_id],[order_id+item_id+cancelled_at],cancelled_at"
});
```

---

## Data Integrity Constraints

### Table Status Consistency
```typescript
// Enforce via application logic (not DB constraints):
// 1. Only one OPEN order per table
const existingOrders = await storage.getActiveOrdersByOutlet(scope);
const tableHasOrder = existingOrders.some(
  order => order.table_id === tableId && order.order_state === 'OPEN'
);
if (tableHasOrder) {
  throw new Error('Table already has an active order');
}

// 2. Table status must match order state
// - OCCUPIED if has OPEN order
// - AVAILABLE if no OPEN order
// - RESERVED if has reservation with non-final status
```

### Reservation Linkage Consistency
```typescript
// Enforce via application logic:
// 1. Only one OPEN order per reservation
const reservationHasOrder = existingOrders.some(
  order => order.reservation_id === reservationId && order.order_state === 'OPEN'
);

// 2. Reservation status transitions
const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  BOOKED: ['CONFIRMED', 'ARRIVED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};
```

### Order Quantity Consistency
```typescript
// Enforce via useCart.ts committed_qty clamp:
const minQty = cartLine.committed_qty; // From finalized snapshot
const nextQty = Math.max(minQty, requestedQty);

// Exception: Cancel Items flow explicitly reduces below committed_qty
// with reason capture
```

---

## Testing Requirements

### Schema Migration Tests

```typescript
import { createPosOfflineDb } from '@jurnapod/offline-db/dexie';

describe('Schema version 9 (current)', () => {
  it('creates all required tables', async () => {
    const db = createPosOfflineDb(`test-v9-${crypto.randomUUID()}`);
    
    expect(db.tables.map(t => t.name)).toEqual([
      'products_cache',
      'outlet_tables',
      'reservations',
      'active_orders',
      'active_order_lines',
      'sales',
      'sale_items',
      'payments',
      'outbox_jobs',
      'sync_metadata',
      'sync_scope_config'
    ]);
    
    await db.close();
    await db.delete();
  });

  it('supports active order with all required fields', async () => {
    const db = createPosOfflineDb(`test-v9-fields-${crypto.randomUUID()}`);
    
    const order: ActiveOrderRow = {
      pk: 'active_order:test-1',
      order_id: 'test-1',
      company_id: 1,
      outlet_id: 10,
      service_type: 'DINE_IN',
      table_id: 5,
      reservation_id: 100,
      guest_count: 4,
      is_finalized: true,
      order_status: 'OPEN',
      order_state: 'OPEN',
      paid_amount: 0,
      opened_at: new Date().toISOString(),
      closed_at: null,
      notes: 'Test order',
      updated_at: new Date().toISOString()
    };
    
    await db.active_orders.add(order);
    const retrieved = await db.active_orders.get('active_order:test-1');
    
    expect(retrieved).toMatchObject(order);
    
    await db.close();
    await db.delete();
  });
});

describe('Schema version 10 (optional extensions)', () => {
  it('supports source_flow and settlement_flow fields', async () => {
    // Skip if not implemented yet
    if (db.verno < 10) {
      return;
    }
    
    const order: ActiveOrderRowExtended = {
      // ... standard fields
      source_flow: 'WALK_IN',
      settlement_flow: 'IMMEDIATE'
    };
    
    await db.active_orders.add(order);
    const retrieved = await db.active_orders.get(order.pk);
    
    expect(retrieved?.source_flow).toBe('WALK_IN');
    expect(retrieved?.settlement_flow).toBe('IMMEDIATE');
  });
});
```

### Data Integrity Tests

```typescript
describe('Active Order Constraints', () => {
  it('prevents multiple open orders on same table', async () => {
    const scope = { company_id: 1, outlet_id: 10 };
    
    // Create first order on table 1
    await runtime.upsertActiveOrderSnapshot(scope, {
      service_type: 'DINE_IN',
      table_id: 1,
      is_finalized: true,
      order_status: 'OPEN',
      lines: [{ item_id: 1, qty: 2, /* ... */ }]
    });
    
    // Attempt second order on same table
    await expect(
      runtime.upsertActiveOrderSnapshot(scope, {
        service_type: 'DINE_IN',
        table_id: 1,
        is_finalized: true,
        order_status: 'OPEN',
        lines: [{ item_id: 2, qty: 1, /* ... */ }]
      })
    ).rejects.toThrow('Table already has an active order');
  });

  it('allows new order after previous closed', async () => {
    const scope = { company_id: 1, outlet_id: 10 };
    
    // Create and close first order
    const order1 = await runtime.upsertActiveOrderSnapshot(scope, {
      service_type: 'DINE_IN',
      table_id: 1,
      is_finalized: true,
      order_status: 'OPEN',
      lines: [{ item_id: 1, qty: 2, /* ... */ }]
    });
    
    await runtime.closeActiveOrder(scope, order1.order.order_id, 'COMPLETED');
    
    // Create new order on same table - should succeed
    const order2 = await runtime.upsertActiveOrderSnapshot(scope, {
      service_type: 'DINE_IN',
      table_id: 1,
      is_finalized: true,
      order_status: 'OPEN',
      lines: [{ item_id: 2, qty: 1, /* ... */ }]
    });
    
    expect(order2.order.table_id).toBe(1);
    expect(order2.order.order_state).toBe('OPEN');
  });
});
```

---

## Performance Considerations

### Index Optimization
Current indexes are well-optimized for common queries:
- Finding open orders: `[company_id+outlet_id+order_state+updated_at]`
- Finding finalized orders: `[company_id+outlet_id+order_state+is_finalized+updated_at]`
- Table association: `[company_id+outlet_id+table_id+order_state]`
- Reservation association: `[company_id+outlet_id+reservation_id+order_state]`

### Query Patterns
```typescript
// Efficient: Uses compound index
const openOrders = await db.active_orders
  .where('[company_id+outlet_id+order_state+updated_at]')
  .between(
    [companyId, outletId, 'OPEN', Dexie.minKey],
    [companyId, outletId, 'OPEN', Dexie.maxKey]
  )
  .reverse()
  .toArray();

// Efficient: Uses table_id index
const tableOrder = await db.active_orders
  .where('[company_id+outlet_id+table_id+order_state]')
  .equals([companyId, outletId, tableId, 'OPEN'])
  .first();

// Avoid: Full table scan
const orders = await db.active_orders
  .filter(order => order.is_finalized === true)
  .toArray();
// Better: Use compound index
const orders = await db.active_orders
  .where('[company_id+outlet_id+order_state+is_finalized+updated_at]')
  .between(
    [companyId, outletId, 'OPEN', 1, Dexie.minKey],
    [companyId, outletId, 'OPEN', 1, Dexie.maxKey]
  )
  .toArray();
```

---

## Summary

### Current Status
✅ **All required tables exist** - No schema changes needed for core workflow  
✅ **Version 9 is sufficient** - Can proceed with implementation immediately  
✅ **Backward compatible** - Existing data remains valid

### Optional Extensions (Deferred)
⏸️ **source_flow/settlement_flow** - Nice-to-have for ADR-0006 alignment (Phase 5+)  
⏸️ **item_cancellations** - Audit trail for cancel items feature (Phase 5+)

### Implementation Path
1. **Phase 1-4:** Use existing schema version 9 (no changes)
2. **Phase 5+:** Consider optional extensions if business needs justify them
3. **Migration:** Dexie handles schema upgrades automatically; no data migration scripts needed

**Decision:** Proceed with implementation using current schema. No blocking schema work required.

---

**End of Specification**
