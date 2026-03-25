# Story 2.8: TD-003 Recipe Composition N+1 Fix

Status: backlog

## Story

As a **Jurnapod developer**,
I want **the N+1 query pattern in recipe composition fixed**,
So that **ingredient cost resolution no longer causes N separate queries for N ingredients**.

## Technical Debt Details

| ID | TD-003 |
|----|--------|
| Location | `apps/api/src/lib/recipe-composition.ts:532, 710` |
| Description | Ingredient cost resolution uses Promise.all with per-ingredient queries |
| Impact | A recipe with 30 ingredients makes 30 parallel (but still separate) queries |
| Priority | P2 |

## Acceptance Criteria

1. **AC1: Batch Ingredient Cost Resolution**
   - Given the recipe composition logic at recipe-composition.ts:532, 710
   - When the N+1 pattern is fixed
   - Then all ingredient costs are resolved in batch queries
   - And the existing recipe calculation behavior is preserved

2. **AC2: Test Validation**
   - Given the existing recipe composition test suite
   - When the N+1 fix is complete
   - Then all existing tests pass
   - And `npm run test:unit -w @jurnapod/api` passes

## Tasks / Subtasks

- [ ] **Task 1: Read current implementation**
  - [ ] 1.1 Read recipe-composition.ts lines 532 and 710 to understand current N+1 pattern
  - [ ] 1.2 Identify all ingredient item IDs that need cost lookup
  - [ ] 1.3 Check existing tests for recipe composition

- [ ] **Task 2: Implement batch cost resolution pattern**
  - [ ] 2.1 Collect all ingredient item IDs before the loop
  - [ ] 2.2 Execute single query for all unit costs
  - [ ] 2.3 Build Map for O(1) lookup during iteration

- [ ] **Task 3: Verify behavior preservation**
  - [ ] 3.1 Ensure same recipe cost calculation results as before
  - [ ] 3.2 Check edge cases (zero cost, missing ingredients)

- [ ] **Task 4: Test Validation (AC2)**
  - [ ] 4.1 Run recipe composition test suite
  - [ ] 4.2 Run full API test suite
  - [ ] 4.3 Verify no regressions

## Technical Notes

**Before (N+1): Promise.all with per-ingredient queries**

```typescript
const costs = await Promise.all(
  rows.map(row => db.query(`
    SELECT unit_cost FROM items WHERE id = ?
  `, [row.ingredient_item_id]))
);
```

**After (Batch): Single query**

```typescript
const ingredientIds = rows.map(r => r.ingredient_item_id);
const costs = await db.kysely
  .selectFrom('items')
  .where('id', 'in', ingredientIds)
  .select(['id', 'unit_cost'])
  .execute();

const costMap = new Map(costs.map(c => [c.id, c.unit_cost]));
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/recipe-composition.ts` | Modify | Fix N+1 at lines 532, 710 |

## Dependencies

- Story 0.1.2 (DbClient Integration)

## Estimated Effort

0.5 days

## Risk Level

Medium (recipe cost calculation correctness critical)
