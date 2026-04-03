# story-24.6: Full validation gate

## Description

Run full test suite to validate the costing extraction and freeze the costing package public API.

## Acceptance Criteria

- [x] All existing tests pass
- [x] No circular dependencies between packages
- [x] Costing package public API documented
- [x] API boundary violations in lint pass

## Files to Review

- `packages/modules/inventory-costing/src/index.ts` (document public API) ✅ Enhanced with Public API Summary
- `apps/api/src/lib/stock.ts` (verify clean delegation)
- `apps/api/src/lib/cogs-posting.ts` (verify clean usage)

## Dependencies

- story-24.5 (sync handlers must be complete) ✅

## Implementation

1. Run full test suite:
   ```bash
   npm run test:unit:critical -w @jurnapod/api    # ✅ PASS - 96 tests, 0 failures
   npm run test:unit:sync -w @jurnapod/api        # ✅ PASS - 214 tests, 0 failures
   npm run test:unit:sales -w @jurnapod/api      # ✅ PASS - 202 tests, 0 failures
   ```

2. Verify no circular deps:
   ```bash
   npm run lint -w @jurnapod/modules-inventory-costing # ✅ PASS
   npm run lint -w @jurnapod/modules-inventory         # ✅ PASS
   npm run lint -w @jurnapod/modules-accounting        # ✅ PASS
   ```

3. Document the costing package public API in `packages/modules/inventory-costing/src/index.ts`
   ✅ Enhanced with Public API Summary and Dependency Direction sections

4. Create ADR documenting the inventory/costing/accounting boundary
   ✅ Created `docs/adr/ADR-0015-inventory-costing-accounting-boundary.md`

## Validation

```bash
npm run typecheck -w @jurnapod/api  # ✅ PASS
npm run build -w @jurnapod/api     # ✅ PASS
npm run test:unit -w @jurnapod/api  # ✅ PASS - 1619 tests, 0 failures
```

## Dev Agent Record

**Date:** 2026-04-03
**Agent:** bmad-dev
**Status:** DONE

### Validation Evidence

| Check | Result | Details |
|-------|--------|---------|
| test:unit:critical | ✅ PASS | 96 tests, 0 failures |
| test:unit:sync | ✅ PASS | 214 tests, 0 failures |
| test:unit:sales | ✅ PASS | 202 tests, 0 failures |
| lint modules-inventory-costing | ✅ PASS | No violations |
| lint modules-inventory | ✅ PASS | No violations |
| lint modules-accounting | ✅ PASS | No violations |
| typecheck | ✅ PASS | Fixed pre-existing TS error in password-reset-throttle.ts |
| build | ✅ PASS | 0 errors |
| test:unit (full API) | ✅ PASS | 1619 tests, 0 failures |

### Deliverables

1. **Enhanced API Documentation:** `packages/modules/inventory-costing/src/index.ts`
   - Added Public API Summary section with all exported functions
   - Added Dependency Direction section clarifying boundary relationships

2. **Boundary ADR:** `docs/adr/ADR-0015-inventory-costing-accounting-boundary.md`
   - Documents three-way boundary between inventory, costing, accounting
   - Defines package responsibilities and dependency direction
   - Specifies the `deductWithCost` contract
   - Lists cross-package table ownership

3. **Validation Report:** `_bmad-output/planning-artifacts/epic-24-validation-report.md`

### Pre-existing Issues Fixed During Validation

- **Typecheck blocker:** `apps/api/src/lib/password-reset-throttle.ts`
  - Error: `TS18047: 'row.request_count' is possibly 'null'`
  - Fix: Changed `if (row.request_count >= limit)` to `if ((row.request_count ?? 0) >= limit)`

- **Recipe service/schema blocker:** `packages/modules/inventory/src/services/recipe-service.ts`
  - Error: `Unknown column 'unit_cost'` in inventory transaction cost query
  - Fix: Replaced obsolete `inventory_transactions.unit_cost` usage with `inventory_item_costs.current_avg_cost` primary source + `item_prices` fallback

- **Test env/bootstrap + teardown blockers:**
  - Updated tests:
    - `apps/api/src/lib/recipe-composition.test.ts`
    - `apps/api/src/lib/master-data.supplies.test.ts`
    - `apps/api/src/lib/item-variants.test.ts`
    - `apps/api/src/routes/reports.test.ts`
  - Fixes:
    - Load env before importing DB-bound modules (dynamic import pattern)
    - Add timeout-wrapped teardown and active-handle cleanup to prevent stuck test process

## Notes

This is the epic completion gate. No story should be marked done until this passes.

**Status:** DONE - approved by bmad-review, acceptance criteria satisfied.
