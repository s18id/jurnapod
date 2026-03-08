# POS Sync Contracts Specification

**Status:** Design  
**Date:** 2026-03-08  
**Context:** Service mode workflow implementation - sync integration  
**Related Docs:** `pos-service-mode-workflow-implementation.md`, `pos-schema-extensions-spec.md`

---

## Overview

This document specifies sync contract extensions needed to support tables, reservations, and active orders in the POS offline-first architecture. The current sync implementation (apps/pos/src/offline/sync-pull.ts) handles products, prices, and config. This spec extends it to include operational data for dine-in workflows.

---

## Current Sync Architecture (Baseline)

### Sync Pull (apps/pos/src/offline/sync-pull.ts)

**Endpoint:** `GET /api/sync/pull`  
**Query Params:** `outlet_id`, `since_version`  
**Frequency:** Configurable interval (default: 5 minutes) or manual trigger

**Current Response Schema:**
```typescript
interface SyncPullResponse {
  data_version: number;
  items: Array<{
    id: number;
    sku: string | null;
    name: string;
    type: 'SERVICE' | 'PRODUCT' | 'INGREDIENT' | 'RECIPE';
    item_group_id: number | null;
    is_active: boolean;
    updated_at: string;
  }>;
  item_groups: Array<{
    id: number;
    code: string | null;
    name: string;
    is_active: boolean;
    updated_at: string;
  }>;
  prices: Array<{
    id: number;
    item_id: number;
    outlet_id: number;
    price: number;
    is_active: boolean;
    updated_at: string;
  }>;
  config: {
    tax: {
      rate: number;
      inclusive: boolean;
    };
    payment_methods: string[];
  };
}
```

**Idempotency:** Keyed by `data_version`. Client tracks `last_data_version` in `sync_metadata` table. Only pulls incremental changes since last successful sync.

### Sync Push (Outbox Pattern)

**Endpoint:** `POST /api/sync/push`  
**Trigger:** Background worker drains outbox periodically  
**Idempotency:** `client_tx_id` ensures at-most-once processing on server

**Current Payload Schema:**
```typescript
interface SyncPushPayload {
  sales: Array<{
    client_tx_id: string; // UUID for idempotency
    company_id: number;
    outlet_id: number;
    cashier_user_id: number;
    trx_at: string;
    status: 'COMPLETED' | 'VOID' | 'REFUND';
    items: Array<{
      item_id: number;
      qty: number;
      unit_price_snapshot: number;
      discount_amount: number;
      line_total: number;
      name_snapshot: string;
      sku_snapshot: string | null;
      item_type_snapshot: string;
    }>;
    payments: Array<{
      method: string;
      amount: number;
      reference_no: string | null;
      paid_at: string;
    }>;
    totals: {
      subtotal: number;
      discount_total: number;
      tax_total: number;
      grand_total: number;
      paid_total: number;
      change_total: number;
    };
    data_version: number;
  }>;
}
```

---

## Extended Sync Pull Contract

### Pull: Tables (Operational Data)

**Objective:** Sync table metadata and status for dine-in workflows.

**Frequency:** Same as products (configurable interval) or manual trigger

**Response Extension:**
```typescript
interface SyncPullResponseExtended extends SyncPullResponse {
  tables?: Array<{
    table_id: number;
    code: string;
    name: string;
    zone: string | null;
    capacity: number | null;
    status: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'UNAVAILABLE';
    updated_at: string;
  }>;
  reservations?: Array<{
    reservation_id: number;
    table_id: number | null;
    customer_name: string;
    customer_phone: string | null;
    guest_count: number;
    reservation_at: string;
    duration_minutes: number | null;
    status: 'BOOKED' | 'CONFIRMED' | 'ARRIVED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
    notes: string | null;
    linked_order_id: string | null;
    created_at: string;
    updated_at: string;
    arrived_at: string | null;
    seated_at: string | null;
    cancelled_at: string | null;
  }>;
}
```

#### Zod Schema Extension
```typescript
// Add to apps/pos/src/offline/sync-pull.ts

const SyncPullTableSchema = z.object({
  table_id: z.coerce.number().int().positive(),
  code: z.string().min(1),
  name: z.string().min(1),
  zone: z.string().nullable(),
  capacity: z.number().int().positive().nullable(),
  status: z.enum(['AVAILABLE', 'RESERVED', 'OCCUPIED', 'UNAVAILABLE']),
  updated_at: z.string().datetime()
});

const SyncPullReservationSchema = z.object({
  reservation_id: z.coerce.number().int().positive(),
  table_id: z.coerce.number().int().positive().nullable(),
  customer_name: z.string().min(1),
  customer_phone: z.string().nullable(),
  guest_count: z.number().int().positive(),
  reservation_at: z.string().datetime(),
  duration_minutes: z.number().int().positive().nullable(),
  status: z.enum(['BOOKED', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  notes: z.string().nullable(),
  linked_order_id: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  arrived_at: z.string().datetime().nullable(),
  seated_at: z.string().datetime().nullable(),
  cancelled_at: z.string().datetime().nullable()
});

const SyncPullResponseSchema = z.object({
  data_version: z.coerce.number().int().min(0),
  items: z.array(SyncPullItemSchema),
  item_groups: z.array(SyncPullItemGroupSchema),
  prices: z.array(SyncPullPriceSchema),
  config: SyncPullConfigSchema,
  tables: z.array(SyncPullTableSchema).optional(),
  reservations: z.array(SyncPullReservationSchema).optional()
});
```

#### Ingestion Logic Extension
```typescript
// Add to syncPullIngest function in apps/pos/src/offline/sync-pull.ts

async function syncPullIngest(input: SyncPullIngestInput): Promise<SyncPullIngestResult> {
  // ... existing product/price ingestion

  // Ingest tables
  if (response.data.tables && response.data.tables.length > 0) {
    const tableRows: OutletTableRow[] = response.data.tables.map(table => ({
      pk: `${input.company_id}:${input.outlet_id}:${table.table_id}`,
      table_id: table.table_id,
      company_id: input.company_id,
      outlet_id: input.outlet_id,
      code: table.code,
      name: table.name,
      zone: table.zone,
      capacity: table.capacity,
      status: table.status,
      updated_at: table.updated_at
    }));

    await db.outlet_tables.bulkPut(tableRows);
    console.log(`[sync-pull] Upserted ${tableRows.length} tables`);
  }

  // Ingest reservations
  if (response.data.reservations && response.data.reservations.length > 0) {
    const reservationRows: ReservationRow[] = response.data.reservations.map(res => ({
      pk: `${input.company_id}:${input.outlet_id}:${res.reservation_id}`,
      reservation_id: res.reservation_id,
      company_id: input.company_id,
      outlet_id: input.outlet_id,
      table_id: res.table_id,
      customer_name: res.customer_name,
      customer_phone: res.customer_phone,
      guest_count: res.guest_count,
      reservation_at: res.reservation_at,
      duration_minutes: res.duration_minutes,
      status: res.status,
      notes: res.notes,
      linked_order_id: res.linked_order_id,
      created_at: res.created_at,
      updated_at: res.updated_at,
      arrived_at: res.arrived_at,
      seated_at: res.seated_at,
      cancelled_at: res.cancelled_at
    }));

    await db.reservations.bulkPut(reservationRows);
    console.log(`[sync-pull] Upserted ${reservationRows.length} reservations`);
  }

  // ... rest of function
}
```

#### Conflict Resolution Strategy

**Table Status Conflicts:**
```typescript
// Server state always wins for table status
// If client has local changes (e.g., marked OCCUPIED), and server says AVAILABLE:
// 1. Check if active order exists locally for that table
// 2. If yes: keep OCCUPIED locally, log conflict for investigation
// 3. If no: accept server state (AVAILABLE)

const localActiveOrder = await db.active_orders
  .where('[company_id+outlet_id+table_id+order_state]')
  .equals([companyId, outletId, table.table_id, 'OPEN'])
  .first();

const finalStatus = localActiveOrder ? 'OCCUPIED' : table.status;

await db.outlet_tables.put({
  ...table,
  status: finalStatus
});

if (localActiveOrder && table.status !== 'OCCUPIED') {
  console.warn('[sync-pull] Table status conflict detected', {
    table_id: table.table_id,
    server_status: table.status,
    local_status: 'OCCUPIED',
    order_id: localActiveOrder.order_id
  });
}
```

**Reservation Status Conflicts:**
```typescript
// Server state wins for reservation status
// Exception: If local status is SEATED and server is earlier (e.g., ARRIVED),
// preserve local state and log for investigation

const localReservation = await db.reservations.get(
  `${companyId}:${outletId}:${res.reservation_id}`
);

const statusPriority = {
  BOOKED: 0,
  CONFIRMED: 1,
  ARRIVED: 2,
  SEATED: 3,
  COMPLETED: 4,
  CANCELLED: 5,
  NO_SHOW: 5
};

const localPriority = localReservation ? statusPriority[localReservation.status] : -1;
const serverPriority = statusPriority[res.status];

const finalStatus = localPriority > serverPriority ? localReservation!.status : res.status;

await db.reservations.put({
  ...res,
  status: finalStatus
});

if (finalStatus !== res.status) {
  console.warn('[sync-pull] Reservation status conflict detected', {
    reservation_id: res.reservation_id,
    server_status: res.status,
    local_status: localReservation?.status
  });
}
```

---

## Extended Sync Push Contract

### Push: Completed Sales with Service Context

**Objective:** Include service type, table, and reservation metadata in completed sale payloads.

**Current Implementation:** apps/pos/src/offline/outbox.ts already handles sale push

**Payload Extension:**
```typescript
interface SyncPushSaleExtended {
  // ... existing fields
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  cashier_user_id: number;
  trx_at: string;
  status: 'COMPLETED' | 'VOID' | 'REFUND';
  items: Array<{...}>;
  payments: Array<{...}>;
  totals: {...};
  data_version: number;

  // Extensions (already in schema, just documenting usage)
  service_type?: 'TAKEAWAY' | 'DINE_IN';
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  order_status?: 'OPEN' | 'READY_TO_PAY' | 'COMPLETED' | 'CANCELLED';
  opened_at?: string;
  closed_at?: string | null;
  notes?: string | null;
}
```

**Implementation Status:**  
✅ Schema already supports these fields (added in offline-db version 7)  
✅ Runtime already populates these fields in `completeSale` (apps/pos/src/offline/sales.ts)  
✅ Outbox already includes these in push payload

**No changes required** - existing implementation is sufficient.

---

### Push: Active Order Snapshots (Future, Deferred)

**Objective:** Optionally sync active (unfinalised) dine-in orders for multi-device handoff or reporting.

**Status:** Deferred to Phase 5+ - not required for MVP workflow

**Rationale:**
- Active orders are operational state, not transactional records
- Offline-first principle: persist locally, push only completed sales
- Multi-device handoff can be built later if business needs justify it

**If Implemented (Future):**
```typescript
interface SyncPushActiveOrder {
  order_id: string;
  company_id: number;
  outlet_id: number;
  service_type: 'TAKEAWAY' | 'DINE_IN';
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  is_finalized: boolean;
  order_status: 'OPEN' | 'READY_TO_PAY';
  opened_at: string;
  notes: string | null;
  items: Array<{
    item_id: number;
    qty: number;
    unit_price_snapshot: number;
    discount_amount: number;
    name_snapshot: string;
    sku_snapshot: string | null;
  }>;
  updated_at: string;
}

// Endpoint: POST /api/sync/push (extend payload)
interface SyncPushPayloadExtended {
  sales: SyncPushSale[];
  active_orders?: SyncPushActiveOrder[]; // Optional
}
```

**Idempotency:** Use `order_id` + `updated_at` for deduplication on server

**Decision:** Not implementing in initial phases. Active orders remain local-only.

---

### Push: Item Cancellations (Future, Deferred)

**Objective:** Sync item cancellation audit trail to server for reporting and analysis.

**Status:** Deferred to Phase 5+ - requires `item_cancellations` table (see schema spec)

**If Implemented (Future):**
```typescript
interface SyncPushItemCancellation {
  cancellation_id: string;
  order_id: string;
  company_id: number;
  outlet_id: number;
  item_id: number;
  cancelled_quantity: number;
  reason: string;
  cancelled_by_user_id: number;
  cancelled_at: string;
}

// Endpoint: POST /api/sync/push (extend payload)
interface SyncPushPayloadExtended {
  sales: SyncPushSale[];
  item_cancellations?: SyncPushItemCancellation[]; // Optional
}
```

**Decision:** Not implementing in initial phases. Cancellations remain local-only or logged in sale notes field.

---

## Sync Timing and Frequency

### Pull Sync
**Current:** Configurable interval (default: 5 minutes) + manual trigger  
**Recommendation:** Keep existing frequency for tables/reservations

**Rationale:**
- Tables and reservations change infrequently compared to products
- 5-minute delay is acceptable for operational data
- Manual trigger available for urgent updates (e.g., new table added)

### Push Sync
**Current:** Outbox drains every 30 seconds + on-demand retry  
**Recommendation:** No changes needed

**Rationale:**
- Completed sales already include service context
- Active orders not pushed (local-only)
- Existing outbox guarantees at-most-once delivery via `client_tx_id`

---

## Idempotency Guarantees

### Pull Idempotency
**Mechanism:** `data_version` tracking in `sync_metadata` table

```typescript
interface SyncMetadataRow {
  pk: string; // {company_id}:{outlet_id}
  company_id: number;
  outlet_id: number;
  last_data_version: number; // Last successfully applied version
  last_pulled_at: string;
  updated_at: string;
}
```

**Flow:**
1. Client reads `last_data_version` from local DB
2. Requests pull with `since_version = last_data_version`
3. Server returns incremental changes since that version
4. Client applies changes atomically
5. Client updates `last_data_version` on success

**Safety:** Replay-safe - applying same version multiple times is idempotent (upsert semantics)

### Push Idempotency
**Mechanism:** `client_tx_id` (UUID) per sale

```typescript
interface SaleRow {
  sale_id: string; // Local UUID
  client_tx_id: string; // Different UUID for idempotency
  // ... other fields
}
```

**Flow:**
1. Client generates `client_tx_id` when completing sale
2. Outbox job includes `client_tx_id` in payload
3. Server checks if `client_tx_id` already processed
4. If yes: return success (already applied)
5. If no: process sale and record `client_tx_id`

**Safety:** At-most-once delivery - retries are safe

---

## Error Handling and Retry Logic

### Pull Errors

#### Network Failure
```typescript
try {
  const result = await syncPullIngest({ company_id, outlet_id });
} catch (error) {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    // Network error - retry with exponential backoff
    console.warn('[sync-pull] Network error, will retry', error);
    return { applied: false, reason: 'NETWORK_ERROR' };
  }
  throw error;
}
```

#### Server Error (5xx)
```typescript
if (response.status >= 500) {
  console.error('[sync-pull] Server error', response.status);
  // Retry with backoff
  return { applied: false, reason: 'SERVER_ERROR' };
}
```

#### Client Error (4xx)
```typescript
if (response.status === 400) {
  const error = await response.json();
  console.error('[sync-pull] Client error', error);
  // Don't retry - log for investigation
  return { applied: false, reason: 'CLIENT_ERROR', error };
}

if (response.status === 404) {
  console.warn('[sync-pull] Outlet not found or inactive');
  // Don't retry - outlet may be deleted/inactive
  return { applied: false, reason: 'OUTLET_NOT_FOUND' };
}
```

#### Schema Validation Error
```typescript
try {
  const validated = SyncPullResponseSchema.parse(data);
} catch (error) {
  console.error('[sync-pull] Schema validation failed', error);
  // Don't retry - server contract broken, needs fix
  return { applied: false, reason: 'SCHEMA_VALIDATION_ERROR', error };
}
```

### Push Errors

**Handled by existing outbox pattern** (apps/pos/src/offline/outbox-drainer.ts)

- Network errors: Retry with exponential backoff
- Server 5xx: Retry with backoff
- Client 4xx: Mark as FAILED, log for investigation
- 409 Conflict (idempotency): Treat as success (already applied)

**No changes needed** - existing error handling covers service context extensions.

---

## Testing Requirements

### Pull Sync Tests

```typescript
describe('syncPullIngest - Tables and Reservations', () => {
  it('upserts tables from pull response', async () => {
    const response = {
      data_version: 100,
      items: [],
      item_groups: [],
      prices: [],
      config: { tax: { rate: 0.1, inclusive: false }, payment_methods: ['CASH'] },
      tables: [
        {
          table_id: 1,
          code: 'T01',
          name: 'Table 1',
          zone: 'Main',
          capacity: 4,
          status: 'AVAILABLE',
          updated_at: '2026-03-08T10:00:00Z'
        }
      ]
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: response })
    });

    const result = await syncPullIngest({
      company_id: 1,
      outlet_id: 10,
      fetch_impl: mockFetch
    });

    expect(result.applied).toBe(true);

    const tables = await db.outlet_tables
      .where('[company_id+outlet_id+table_id]')
      .equals([1, 10, 1])
      .toArray();

    expect(tables).toHaveLength(1);
    expect(tables[0].code).toBe('T01');
    expect(tables[0].status).toBe('AVAILABLE');
  });

  it('resolves table status conflict with local active order', async () => {
    // Create local active order on table 1
    await db.active_orders.add({
      pk: 'active_order:ord-123',
      order_id: 'ord-123',
      company_id: 1,
      outlet_id: 10,
      service_type: 'DINE_IN',
      table_id: 1,
      reservation_id: null,
      guest_count: 2,
      is_finalized: true,
      order_status: 'OPEN',
      order_state: 'OPEN',
      paid_amount: 0,
      opened_at: new Date().toISOString(),
      closed_at: null,
      notes: null,
      updated_at: new Date().toISOString()
    });

    // Server says table is AVAILABLE (conflict)
    const response = {
      data_version: 101,
      items: [],
      item_groups: [],
      prices: [],
      config: { tax: { rate: 0.1, inclusive: false }, payment_methods: ['CASH'] },
      tables: [
        {
          table_id: 1,
          code: 'T01',
          name: 'Table 1',
          zone: 'Main',
          capacity: 4,
          status: 'AVAILABLE',
          updated_at: '2026-03-08T11:00:00Z'
        }
      ]
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: response })
    });

    await syncPullIngest({
      company_id: 1,
      outlet_id: 10,
      fetch_impl: mockFetch
    });

    const table = await db.outlet_tables.get('1:10:1');

    // Should preserve OCCUPIED status due to local order
    expect(table?.status).toBe('OCCUPIED');
  });

  it('upserts reservations from pull response', async () => {
    const response = {
      data_version: 102,
      items: [],
      item_groups: [],
      prices: [],
      config: { tax: { rate: 0.1, inclusive: false }, payment_methods: ['CASH'] },
      tables: [],
      reservations: [
        {
          reservation_id: 100,
          table_id: 1,
          customer_name: 'John Doe',
          customer_phone: '+1234567890',
          guest_count: 4,
          reservation_at: '2026-03-08T18:00:00Z',
          duration_minutes: 90,
          status: 'CONFIRMED',
          notes: 'Birthday celebration',
          linked_order_id: null,
          created_at: '2026-03-08T10:00:00Z',
          updated_at: '2026-03-08T10:30:00Z',
          arrived_at: null,
          seated_at: null,
          cancelled_at: null
        }
      ]
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: response })
    });

    await syncPullIngest({
      company_id: 1,
      outlet_id: 10,
      fetch_impl: mockFetch
    });

    const reservation = await db.reservations.get('1:10:100');

    expect(reservation).toBeDefined();
    expect(reservation?.customer_name).toBe('John Doe');
    expect(reservation?.status).toBe('CONFIRMED');
  });
});
```

### Push Sync Tests

```typescript
describe('Outbox - Sales with Service Context', () => {
  it('includes service_type and table_id in push payload', async () => {
    const sale = await completeSale({
      sale_id: 'sale-123',
      company_id: 1,
      outlet_id: 10,
      cashier_user_id: 5,
      service_type: 'DINE_IN',
      table_id: 3,
      reservation_id: 200,
      guest_count: 2,
      items: [{
        item_id: 10,
        qty: 2,
        discount_amount: 0
      }],
      payments: [{
        method: 'CASH',
        amount: 10000
      }],
      totals: {
        subtotal: 10000,
        discount_total: 0,
        tax_total: 1000,
        grand_total: 11000,
        paid_total: 11000,
        change_total: 0
      }
    });

    const job = await db.outbox_jobs.get({ sale_id: 'sale-123' });
    const payload = JSON.parse(job!.payload_json);

    expect(payload.sales[0].service_type).toBe('DINE_IN');
    expect(payload.sales[0].table_id).toBe(3);
    expect(payload.sales[0].reservation_id).toBe(200);
    expect(payload.sales[0].guest_count).toBe(2);
  });
});
```

---

## Migration and Rollout

### Server-Side Changes

#### Pull Endpoint Extension
```sql
-- Ensure tables and reservations are included in sync pull query
SELECT
  t.table_id,
  t.code,
  t.name,
  t.zone,
  t.capacity,
  t.status,
  t.updated_at
FROM outlet_tables t
WHERE t.company_id = ? AND t.outlet_id = ?
  AND t.updated_at > ?; -- Incremental sync

SELECT
  r.reservation_id,
  r.table_id,
  r.customer_name,
  r.customer_phone,
  r.guest_count,
  r.reservation_at,
  r.duration_minutes,
  r.status,
  r.notes,
  r.linked_order_id,
  r.created_at,
  r.updated_at,
  r.arrived_at,
  r.seated_at,
  r.cancelled_at
FROM reservations r
WHERE r.company_id = ? AND r.outlet_id = ?
  AND r.reservation_at >= ? -- Only future/recent (e.g., -1 day to +7 days)
  AND r.status NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW'); -- Active only
```

#### Push Endpoint Extension
**No changes required** - existing sale endpoint already accepts and stores service context fields.

### Client-Side Changes

#### sync-pull.ts Extension
1. Add `SyncPullTableSchema` and `SyncPullReservationSchema` validation
2. Extend `SyncPullResponseSchema` with optional `tables` and `reservations` arrays
3. Add ingestion logic for tables and reservations in `syncPullIngest` function
4. Add conflict resolution for table status (preserve OCCUPIED if local order exists)

#### Backward Compatibility
- Server may omit `tables` and `reservations` fields initially (optional)
- Client handles missing fields gracefully (empty arrays)
- Older POS clients without table support ignore new fields

### Feature Flag Strategy
```typescript
// In runtime-service.ts or config
const ENABLE_DINE_IN_SYNC = process.env.ENABLE_DINE_IN_SYNC === 'true';

async function syncPullIngest(input: SyncPullIngestInput): Promise<SyncPullIngestResult> {
  // ... existing logic

  if (ENABLE_DINE_IN_SYNC && response.data.tables) {
    await ingestTables(response.data.tables);
  }

  if (ENABLE_DINE_IN_SYNC && response.data.reservations) {
    await ingestReservations(response.data.reservations);
  }

  // ... rest
}
```

---

## Performance and Scalability

### Pull Payload Size

**Current (Products Only):**
- ~100-500 items per outlet
- ~1-5 KB per item
- Total: ~100-2500 KB per pull

**With Tables/Reservations:**
- ~10-50 tables per outlet
- ~0.2 KB per table
- ~10-100 active reservations (7-day window)
- ~0.3 KB per reservation
- Additional: ~2-35 KB per pull

**Total Overhead:** <5% increase - acceptable

**Optimization:** Server can filter reservations by date range (e.g., -1 day to +7 days) to limit payload size.

### Pull Frequency Impact

**Recommendation:** Keep 5-minute interval - no change needed

**Rationale:**
- Tables and reservations change infrequently
- Most sync pulls will have zero table/reservation updates
- Incremental sync minimizes bandwidth (only changed records)

### Push Payload Size

**No change** - service context fields add <100 bytes per sale

---

## Summary

### Status: Mostly Ready ✅

#### Required Changes (Minimal)
1. **Server:** Extend `/api/sync/pull` to include `tables` and `reservations` arrays
2. **Client:** Extend `sync-pull.ts` validation schemas and ingestion logic
3. **Testing:** Add pull sync tests for tables/reservations

#### No Changes Needed ✅
- Push sync already supports service context (schema v7)
- Outbox already includes `service_type`, `table_id`, `reservation_id` in payloads
- Idempotency mechanisms remain unchanged (`data_version` pull, `client_tx_id` push)
- Error handling and retry logic remain unchanged

#### Deferred Features
- Active order snapshots push (not required for MVP)
- Item cancellations push (deferred to Phase 5)

### Implementation Priority
1. **Phase 1:** Extend pull endpoint response (server-side)
2. **Phase 2:** Extend pull ingestion logic (client-side)
3. **Phase 3:** Add conflict resolution for table status
4. **Phase 4:** Add comprehensive sync tests

**Decision:** Proceed with implementation. Sync contracts are well-defined and backward-compatible.

---

**End of Specification**
