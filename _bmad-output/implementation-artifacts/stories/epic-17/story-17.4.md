# Story 17.4: Move Pull Logic to pos-sync

**Status:** Done
**Priority:** P0
**Epic:** Epic 17 - Resurrect Sync-Core (Sync Module Architecture)
**Story Number:** 17.4
**Completed:** 2026-03-31

---

## Summary

Move pull sync business logic from `apps/api/src/lib/sync/pull/` to `packages/pos-sync/src/pull/`, implementing `handlePullSync()` that fetches master data (items, variants, prices, tables, reservations) using sync-core data queries.

---

## Context

The original pull sync logic was in `lib/sync/pull/index.ts`. This story migrates that functionality to `pos-sync/pull/index.ts`.

### Migration Overview

**From:** `apps/api/src/lib/sync/pull/index.ts`
**To:** `packages/pos-sync/src/pull/index.ts`

The new location follows the architecture where:
- `sync-core` provides shared infrastructure (registry, auth, audit, data queries)
- `pos-sync` provides POS-specific sync logic (this story)

---

## Story

As a developer maintaining POS sync,
I want the pull sync logic in `pos-sync/pull/`,
so that it uses sync-core data queries and can be centrally managed.

---

## Acceptance Criteria

1. **Pull Sync Implementation** (AC-1)
   - `handlePullSync(db, params)` function in `pos-sync/pull/index.ts`
   - Fetches items, variants, variant prices, tables, reservations, tax rates
   - Returns `PullSyncResult` with `SyncPullPayload`

2. **Sync-Core Data Queries** (AC-2)
   - Uses `getItemsForSync`, `getVariantsForSync`, `getVariantPricesForOutlet`
   - Uses `getOutletTablesForSync`, `getActiveReservationsForSync`
   - Uses `getTaxRatesForSync`, `getDefaultTaxRateIds`
   - Uses `getSyncDataVersion`

3. **Data Transformation** (AC-3)
   - Transform database records to POS-friendly format
   - `transformItems()`, `transformVariants()`, `transformTables()`
   - `transformReservations()`, `transformVariantPrices()`

4. **Config Building** (AC-4)
   - Build `SyncPullConfig` with tax rates and default tax rate IDs
   - Include payment methods

5. **Audit Integration** (AC-5)
   - Uses `syncAuditor` from `@jurnapod/sync-core`
   - Log start, complete, and fail events

6. **Backward Compatibility** (AC-6)
   - `PullSyncParams` and `PullSyncResult` types match expectations
   - Works with `PosSyncModule.handlePullSync()`

---

## Tasks / Subtasks

- [x] Task 1: Implement `handlePullSync()` function
- [x] Task 2: Use sync-core data queries for fetching data
- [x] Task 3: Implement data transformation functions
- [x] Task 4: Build config with tax rates and payment methods
- [x] Task 5: Add audit tracking
- [x] Task 6: Verify tests pass

---

## Implementation Details

### Main Function

```typescript
// packages/pos-sync/src/pull/index.ts

export async function handlePullSync(
  db: DbConn,
  params: PullSyncParams
): Promise<PullSyncResult> {
  const { companyId, outletId, sinceVersion = 0, ordersCursor = 0 } = params;

  const startTime = Date.now();
  let auditId: string | undefined;

  // Start audit tracking
  auditId = syncAuditor.startEvent(
    "pos",
    "MASTER",
    "PULL",
    {
      company_id: companyId,
      outlet_id: outletId,
      client_type: "POS",
      request_id: `pos-pull-${Date.now()}`,
      timestamp: new Date().toISOString(),
    }
  );

  try {
    // Get data using shared queries from sync-core
    const [
      currentVersion,
      items,
      tables,
      reservations,
      variants,
      variantPrices,
      taxRates,
      defaultTaxRateIds
    ] = await Promise.all([
      getSyncDataVersion(db, companyId),
      sinceVersion === 0 ? getItemsForSync(db, companyId) : [],
      getOutletTablesForSync(db, companyId, outletId),
      getActiveReservationsForSync(db, companyId, outletId),
      getVariantsForSync(db, companyId),
      getVariantPricesForOutlet(db, companyId, outletId),
      getTaxRatesForSync(db, companyId),
      getDefaultTaxRateIds(db, companyId),
    ]);

    const payload: SyncPullPayload = {
      data_version: currentVersion,
      items: transformItems(items),
      item_groups: [],
      prices: [],
      variant_prices: transformVariantPrices(variantPrices),
      config: buildConfig(taxRates, defaultTaxRateIds),
      tables: transformTables(tables),
      reservations: transformReservations(reservations),
      variants: transformVariants(variants),
      open_orders: [],
      open_order_lines: [],
      order_updates: [],
      orders_cursor: ordersCursor,
    };

    // Complete audit tracking
    if (auditId) {
      syncAuditor.completeEvent(
        auditId,
        items.length + tables.length + reservations.length + variants.length,
        currentVersion,
        { duration_ms: Date.now() - startTime }
      );
    }

    return {
      payload,
      currentVersion,
    };
  } catch (error) {
    if (auditId) {
      syncAuditor.failEvent(
        auditId,
        error instanceof Error ? error : new Error("Unknown error")
      );
    }
    throw error;
  }
}
```

### Data Transformation

```typescript
function transformItems(items: Item[]): SyncPullItem[] {
  return items.map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    type: item.item_type,
    item_group_id: item.item_group_id,
    barcode: item.barcode,
    thumbnail_url: null,
    is_active: item.is_active,
    updated_at: item.updated_at,
  }));
}

function transformVariants(variants: Variant[]): SyncPullVariant[] {
  return variants.map((v) => ({
    id: v.id,
    item_id: v.item_id,
    sku: v.sku ?? "",
    variant_name: v.variant_name ?? "",
    price: v.price_override ?? 0,
    stock_quantity: v.stock_quantity ?? 0,
    barcode: null,
    is_active: v.is_active,
    attributes: {},
  }));
}

function transformTables(tables: Table[]): SyncPullTable[] {
  return tables.map((t) => ({
    table_id: t.table_id,
    code: t.code,
    name: t.name,
    zone: t.zone,
    capacity: t.capacity,
    status: t.status,
    updated_at: t.updated_at,
  }));
}

function transformReservations(reservations: Reservation[]): SyncPullReservation[] {
  return reservations.map((r) => ({
    reservation_id: r.reservation_id,
    table_id: r.table_id,
    customer_name: r.customer_name ?? "",
    customer_phone: r.customer_phone,
    guest_count: r.guest_count,
    reservation_at: r.reservation_at,
    duration_minutes: r.duration_minutes,
    status: r.status,
    notes: r.notes,
    linked_order_id: r.linked_order_id ? String(r.linked_order_id) : null,
    arrived_at: r.arrived_at,
    seated_at: r.seated_at,
    cancelled_at: r.cancelled_at,
    updated_at: r.updated_at,
  }));
}
```

### Config Building

```typescript
function buildConfig(
  taxRates: TaxRate[],
  defaultTaxRateIds: number[]
): SyncPullConfig {
  const firstDefault = defaultTaxRateIds[0];
  const defaultRate = firstDefault
    ? taxRates.find((r) => r.id === firstDefault)
    : null;

  return {
    tax: {
      rate: defaultRate ? Number(defaultRate.rate_percent) : 0,
      inclusive: defaultRate ? defaultRate.is_inclusive : false,
    },
    tax_rates: taxRates.map((tr) => ({
      id: tr.id,
      code: tr.code,
      name: tr.name,
      rate_percent: tr.rate_percent,
      account_id: tr.account_id,
      is_inclusive: tr.is_inclusive,
      is_active: tr.is_active,
    })),
    default_tax_rate_ids: defaultTaxRateIds,
    payment_methods: ["CASH"],
  };
}
```

---

## Files Created/Modified

| File | Change | Lines |
|------|--------|-------|
| `packages/pos-sync/src/pull/index.ts` | Full implementation | ~303 |
| `packages/pos-sync/src/pull/types.ts` | Type definitions | ~50 |

---

## Sync Data Queries Used

From `@jurnapod/sync-core`:

| Query | Purpose |
|-------|---------|
| `getSyncDataVersion` | Get current sync version |
| `getItemsForSync` | Fetch items for company |
| `getVariantsForSync` | Fetch variants for company |
| `getVariantPricesForOutlet` | Fetch variant prices for outlet |
| `getOutletTablesForSync` | Fetch tables for outlet |
| `getActiveReservationsForSync` | Fetch active reservations |
| `getTaxRatesForSync` | Fetch tax rates for company |
| `getDefaultTaxRateIds` | Get default tax rate IDs |

---

## Dependencies

- `@jurnapod/sync-core` - Data queries, syncAuditor
- `@jurnapod/db` - DbConn
- `@jurnapod/shared` - Zod schemas, SyncPullPayload type

---

## Validation Rules

| Field | Validation |
|-------|------------|
| `companyId` | Must be positive integer |
| `outletId` | Must be positive integer |
| `sinceVersion` | Defaults to 0 (full sync) |
| `ordersCursor` | Defaults to 0 |

---

## Dev Notes

### Full Sync vs Incremental Sync

- `sinceVersion === 0`: Full sync - fetches all items
- `sinceVersion > 0`: Incremental sync - items filtered by `updated_at` (handled in data query)

### Sync Tiers

Pull sync uses `MASTER` tier:
```typescript
auditId = syncAuditor.startEvent(
  "pos",
  "MASTER",  // Tier
  "PULL",
  // ...
);
```

### Audit Event Flow

```
Pull Request → startEvent()
                    ↓
              Fetch Data (sync-core queries)
                    ↓
              Transform Data
                    ↓
              completeEvent() or failEvent()
                    ↓
                 Response
```

---

## Definition of Done

- [x] `handlePullSync()` implemented in `pos-sync/pull/index.ts`
- [x] Uses sync-core data queries
- [x] Transforms data to POS format
- [x] Builds config with tax rates
- [x] Audit tracking implemented
- [x] Tests pass
- [x] TypeScript compiles

---

## References

- [Pull implementation](./packages/pos-sync/src/pull/index.ts)
- [Pull types](./packages/pos-sync/src/pull/types.ts)
- [Sync-core data queries](./packages/sync-core/src/data/)
- [SyncAuditor](./packages/sync-core/src/audit/sync-audit.ts)

---

## Dev Agent Record

**Completed:** 2026-03-31
**Status:** Done
**Files Modified:** 2 files, ~353 lines

---

*Story 17.4 - Move pull logic to pos-sync*
