# Story 2.7: TD-002 COGS Calculation N+1 Fix

Status: backlog

## Story

As a **Jurnapod developer**,
I want **the N+1 query pattern in COGS calculation fixed**,
So that **per-item inventory lookups no longer cause up to 2N queries for N items**.

## Technical Debt Details

| ID | TD-002 |
|----|--------|
| Location | `apps/api/src/lib/cogs-posting.ts:171-235` |
| Description | Per-item inventory lookup loop causes up to 2N queries for N items |
| Impact | A 100-item sale could make up to 200 queries |
| Priority | P2 |

## Acceptance Criteria

1. **AC1: Batch Inventory Lookup**
   - Given the COGS calculation logic at cogs-posting.ts:171-235
   - When the N+1 pattern is fixed
   - Then all inventory data is fetched in batch queries
   - And the existing COGS calculation behavior is preserved

2. **AC2: Test Validation**
   - Given the existing COGS calculation test suite
   - When the N+1 fix is complete
   - Then all existing tests pass
   - And `npm run test:unit -w @jurnapod/api` passes

## Tasks / Subtasks

- [ ] **Task 1: Read current implementation**
  - [ ] 1.1 Read cogs-posting.ts lines 171-235 to understand current N+1 pattern
  - [ ] 1.2 Identify all product IDs that need inventory lookup
  - [ ] 1.3 Check existing tests for COGS calculation

- [ ] **Task 2: Implement batch inventory pattern**
  - [ ] 2.1 Collect all product IDs before the loop
  - [ ] 2.2 Execute single grouped query for all inventory data
  - [ ] 2.3 Build Map for O(1) lookup during iteration

- [ ] **Task 3: Verify behavior preservation**
  - [ ] 3.1 Ensure same COGS calculation results as before
  - [ ] 3.2 Check edge cases (zero inventory, missing products)

- [ ] **Task 4: Test Validation (AC2)**
  - [ ] 4.1 Run COGS calculation test suite
  - [ ] 4.2 Run full API test suite
  - [ ] 4.3 Verify no regressions

## Technical Notes

**Before (N+1): Per-item inventory lookup**

```typescript
for (const item of items) {
  const inventory = await db.query(`
    SELECT SUM(quantity_delta), SUM(quantity_delta * unit_cost)
    FROM inventory_transactions
    WHERE company_id = ? AND product_id = ?
  `, [companyId, item.productId]);
}
```

**After (Batch): Single grouped query**

```typescript
const productIds = items.map(i => i.productId);
const inventoryData = await db.kysely
  .selectFrom('inventory_transactions')
  .where('company_id', '=', companyId)
  .where('product_id', 'in', productIds)
  .groupBy('product_id')
  .select([
    'product_id',
    sql`SUM(quantity_delta)`.as('total_quantity'),
    sql`SUM(quantity_delta * unit_cost)`.as('total_cost')
  ])
  .execute();
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/cogs-posting.ts` | Modify | Fix N+1 at lines 171-235 |

## Dependencies

- Story 0.1.2 (DbClient Integration)

## Estimated Effort

0.5 days

## Risk Level

Medium (COGS calculation correctness critical)
