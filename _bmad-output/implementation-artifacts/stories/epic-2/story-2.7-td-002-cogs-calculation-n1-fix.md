# Story 2.7: TD-002 COGS Calculation N+1 Fix

Status: done

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

- [x] **Task 1: Read current implementation**
  - [x] 1.1 Read cogs-posting.ts lines 171-235 to understand current N+1 pattern
  - [x] 1.2 Identify all product IDs that need inventory lookup
  - [x] 1.3 Check existing tests for COGS calculation

- [x] **Task 2: Implement batch inventory pattern**
  - [x] 2.1 Collect all product IDs before the loop
  - [x] 2.2 Execute single grouped query for all inventory data
  - [x] 2.3 Build Map for O(1) lookup during iteration

- [x] **Task 3: Verify behavior preservation**
  - [x] 3.1 Ensure same COGS calculation results as before
  - [x] 3.2 Check edge cases (zero inventory, missing products)

- [x] **Task 4: Test Validation (AC2)**
  - [x] 4.1 Run COGS calculation test suite
  - [x] 4.2 Run full API test suite
  - [x] 4.3 Verify no regressions

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

## Dev Agent Record

### Debug Log

1. The actual N+1 pattern was twofold inside `calculateSaleCogs()`:
   - one inventory aggregate query per item
   - one fallback `item_prices` lookup per item when stock cost resolved to zero
2. Batched both retrieval paths:
   - grouped inventory query over `inventory_transactions` by `product_id`
   - single ordered price query over `item_prices` and first-row-per-item resolution in memory
3. Preserved original calculation semantics:
   - average cost from positive inventory movements when available
   - fallback to `base_cost`, then `price`
   - throw `CogsCalculationError` when no valid cost source exists

### Completion Notes

- `calculateSaleCogs()` now preloads inventory aggregates and fallback prices for all unique item IDs before iterating.
- Per-item calculation now uses O(1) map lookups instead of up to two SQL queries per item.
- Added regression coverage for mixed batched inventory and fallback price resolution in a single calculation call.

### File List

- apps/api/src/lib/cogs-posting.ts
- apps/api/src/lib/cogs-posting.test.ts
- _bmad-output/implementation-artifacts/stories/epic-2/story-2.7-td-002-cogs-calculation-n1-fix.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-03-26: Replaced per-item inventory and fallback price lookups with batched retrieval for COGS calculation.
- 2026-03-26: Added regression coverage and validated typecheck, build, lint, targeted tests, and full API unit suite.

### AI Review

- Review date: 2026-03-26
- Reviewer: BMAD Code Review workflow
- Result: **Clean review**
- Findings: **0 P0/P1, 0 P2, 0 P3**
- Notes: Verified the runtime 2N query path was removed from `calculateSaleCogs()`, batched inventory and price lookups preserve company scoping and cost fallback behavior, and validations passed.
