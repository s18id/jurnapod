# Story 2.8: TD-003 Recipe Composition N+1 Fix

Status: done

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

- [x] **Task 1: Read current implementation**
  - [x] 1.1 Read recipe-composition.ts lines 532 and 710 to understand current N+1 pattern
  - [x] 1.2 Identify all ingredient item IDs that need cost lookup
  - [x] 1.3 Check existing tests for recipe composition

- [x] **Task 2: Implement batch cost resolution pattern**
  - [x] 2.1 Collect all ingredient item IDs before the loop
  - [x] 2.2 Execute single query for all unit costs
  - [x] 2.3 Build Map for O(1) lookup during iteration

- [x] **Task 3: Verify behavior preservation**
  - [x] 3.1 Ensure same recipe cost calculation results as before
  - [x] 3.2 Check edge cases (zero cost, missing ingredients)

- [x] **Task 4: Test Validation (AC2)**
  - [x] 4.1 Run recipe composition test suite
  - [x] 4.2 Run full API test suite
  - [x] 4.3 Verify no regressions

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

## Dev Agent Record

### Debug Log

1. The actual N+1 hot paths were in both `getRecipeIngredients()` and `calculateRecipeCost()`, each calling `resolveIngredientUnitCost()` once per ingredient via `Promise.all`.
2. Implemented shared `resolveIngredientUnitCosts()` to batch:
   - inbound inventory average-cost resolution from `inventory_transactions`
   - fallback price resolution from `item_prices`
3. Kept `resolveIngredientUnitCost()` as a compatibility wrapper over the new batch helper.
4. Preserved existing cost semantics:
   - prefer inbound inventory average cost when available
   - otherwise fallback to latest active item price/base_cost
   - otherwise return `0`

### Completion Notes

- `getRecipeIngredients()` now resolves all ingredient unit costs in one batched pass before building response rows.
- `calculateRecipeCost()` now resolves all ingredient unit costs in one batched pass before computing line and total costs.
- Added regression coverage for mixed inventory-backed and fallback-priced ingredients in a single recipe cost calculation.

### File List

- apps/api/src/lib/recipe-composition.ts
- apps/api/src/lib/recipe-composition.test.ts
- _bmad-output/implementation-artifacts/stories/epic-2/story-2.8-td-003-recipe-composition-n1-fix.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-03-26: Replaced per-ingredient unit cost queries with batched inventory and price resolution in recipe composition flows.
- 2026-03-26: Added regression coverage and validated typecheck, build, lint, targeted tests, and full API unit suite.

### AI Review

- Review date: 2026-03-26
- Reviewer: BMAD Code Review workflow
- Result: **Clean review**
- Findings: **0 P0/P1, 0 P2, 0 P3**
- Notes: Verified the runtime per-ingredient query pattern was removed from both recipe hot paths, batched cost resolution preserves company scoping and fallback behavior, and validations passed.
