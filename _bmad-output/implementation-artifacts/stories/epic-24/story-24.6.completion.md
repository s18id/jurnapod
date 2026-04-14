# story-24.6.completion.md: Full validation gate

## Status

**DONE** (approved after bmad-agent-review)

## Files Modified/Created

- **Modified:** `packages/modules/inventory-costing/src/index.ts`
  - Added public API summary and dependency-direction documentation.

- **Created:** `docs/adr/ADR-0015-inventory-costing-accounting-boundary.md`
  - Documents inventory/costing/accounting boundary, dependency direction, and `deductWithCost` contract.

- **Created:** `_bmad-output/planning-artifacts/epic-24-validation-report.md`
  - Final validation evidence and AC verdict for Story 24.6.

- **Modified:** `_bmad-output/implementation-artifacts/stories/epic-24/story-24.6.md`
  - Updated Dev Agent Record and set final status.

### Additional validation-blocker fixes completed during gate

- **Modified:** `apps/api/src/lib/password-reset-throttle.ts`
  - Fixed nullable guard for `request_count` in throttle check.

- **Modified:** `packages/modules/inventory/src/services/recipe-service.ts`
  - Replaced obsolete `inventory_transactions.unit_cost` reference with `inventory_item_costs.current_avg_cost` primary source + `item_prices` fallback.

- **Modified:** `packages/modules/inventory/src/services/item-variant-service.ts`
  - Fixed stale-read risk in `updateVariant()` by reading updated row through the same transaction connection.

- **Modified test teardown/env bootstrap files:**
  - `apps/api/src/lib/item-variants.test.ts`
  - `apps/api/src/lib/recipe-composition.test.ts`
  - `apps/api/src/lib/master-data.supplies.test.ts`
  - `apps/api/src/routes/reports.test.ts`
  - Applied timeout-wrapped pool cleanup + active-handle safety cleanup; fixed module-import/env bootstrap ordering where needed.

## Test Execution Evidence

### Core Story 24.6 validation commands

```bash
npm run test:unit:critical -w @jurnapod/api   # PASS
npm run test:unit:sync -w @jurnapod/api       # PASS (96 tests, 0 fail)
npm run test:unit:sales -w @jurnapod/api      # PASS (98 tests, 0 fail)
npm run lint -w @jurnapod/modules-inventory-costing  # PASS
npm run lint -w @jurnapod/modules-inventory          # PASS
npm run lint -w @jurnapod/modules-accounting         # PASS
npm run typecheck -w @jurnapod/api           # PASS
npm run build -w @jurnapod/api               # PASS
npm run test:unit -w @jurnapod/api           # PASS (1619 tests, 0 fail)
```

### Focused regression checks during blocker resolution

```bash
npm run test:unit:single -w @jurnapod/api src/lib/item-variants.test.ts          # PASS (16/16)
npm run test:unit:single -w @jurnapod/api src/routes/reports.test.ts             # PASS (24/24)
npm run test:unit:single -w @jurnapod/api src/lib/recipe-composition.test.ts     # PASS (12/12)
npm run test:unit:single -w @jurnapod/api src/lib/master-data.supplies.test.ts   # PASS (6/6)
```

## Acceptance Criteria Mapping

1. **All existing tests pass** ✅
   - Full API unit suite passes (1619 pass, 0 fail).

2. **No circular dependencies between packages** ✅
   - Target package lints pass with boundary constraints.

3. **Costing package public API documented** ✅
   - `packages/modules/inventory-costing/src/index.ts` documentation updated.
   - Boundary ADR created (`ADR-0015`).

4. **API boundary violations in lint pass** ✅
   - Lint passes for relevant packages (`modules-inventory-costing`, `modules-inventory`, `modules-accounting`).

## Reviewer Outcome

- **bmad-agent-review verdict:** APPROVED
- **Severity summary:** no P0/P1 blockers; closure approved with minor non-blocking follow-up notes.
