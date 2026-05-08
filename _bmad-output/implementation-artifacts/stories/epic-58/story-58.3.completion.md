# Story 58.3 Completion Report — Costing Method Correctness

## Story
- **Epic:** 58
- **Story:** 58.3
- **Title:** Costing Method Correctness (FIFO / AVG / LIFO + Standard Variance Overlay)

## Outcome
Story 58.3 implementation is complete at package/domain level for costing correctness.

The implementation now enforces:
- Cost flow methods remain canonical: `AVG | FIFO | LIFO`
- Standard-cost behavior is modeled as a separate variance policy overlay, not a fourth flow method
- Deterministic tests prove FIFO/LIFO ordering, AVG deduction behavior, and partial-layer carry-forward
- Standard variance calculation is deterministic with explicit favorable/unfavorable classification and strict account-setting validation

## Acceptance Criteria Evidence

### AC1 — FIFO uses oldest layers first
- Implemented through planner ordering and consumption logic.
- Evidence:
  - `packages/modules/inventory-costing/src/costing-planner.ts`
  - `packages/modules/inventory-costing/__test__/unit/costing-methods.test.ts` (`AC1: FIFO consumes oldest layers first`)

### AC2 — Average uses weighted average at deduction time
- Implemented via `planAverageDeduction()` with deterministic cost/qty updates.
- Evidence:
  - `packages/modules/inventory-costing/src/costing-planner.ts`
  - `packages/modules/inventory-costing/__test__/unit/costing-methods.test.ts` (`AC2: AVG uses weighted average at deduction time`)

### AC3 — LIFO uses newest layers first
- Implemented through reverse-chronological ordering.
- Evidence:
  - `packages/modules/inventory-costing/src/costing-planner.ts`
  - `packages/modules/inventory-costing/__test__/unit/costing-methods.test.ts` (`AC3+AC4`)

### AC4 — LIFO layer order is reverse chronological
- Verified in deterministic unit test.
- Evidence:
  - `packages/modules/inventory-costing/__test__/unit/costing-methods.test.ts` (`AC3+AC4`)

### AC5 — Partial layer carry-forward works correctly
- Remaining quantities preserved per-layer after partial consumption.
- Evidence:
  - `packages/modules/inventory-costing/src/costing-planner.ts`
  - `packages/modules/inventory-costing/__test__/unit/costing-methods.test.ts` (`AC5`)

### AC6 — Standard costing variance recorded separately from standard cost
- Implemented as dedicated variance utility with direction classification and explicit variance-account setting parsing.
- Evidence:
  - `packages/modules/inventory-costing/src/standard-costing.ts`
  - `packages/modules/inventory-costing/src/index.ts` (`resolveStandardVarianceAccountId`, `calculateStandardVarianceForItem`)
  - `packages/modules/inventory-costing/__test__/unit/standard-costing.test.ts`

## Files Added
- `packages/db/migrations/0206_inventory_standard_costing_support.sql`
- `packages/modules/inventory-costing/src/costing-planner.ts`
- `packages/modules/inventory-costing/src/standard-costing.ts`
- `packages/modules/inventory-costing/src/test-fixtures/cost-layer-fixtures.ts`
- `packages/modules/inventory-costing/src/test-fixtures/index.ts`
- `packages/modules/inventory-costing/__test__/unit/costing-methods.test.ts`
- `packages/modules/inventory-costing/__test__/unit/standard-costing.test.ts`

## Files Modified
- `packages/modules/inventory-costing/src/index.ts`
- `packages/modules/inventory-costing/src/types/costing.ts`
- `packages/modules/platform/src/companies/constants/settings-definitions.ts`
- `packages/shared/src/schemas/settings.ts`
- `apps/api/src/lib/companies.ts`
- `packages/db/src/kysely/schema.ts`

## Validation Evidence
- Build passes:
  - `npm run build -w @jurnapod/shared`
  - `npm run build -w @jurnapod/modules-platform`
  - `npm run build -w @jurnapod/modules-inventory-costing`
  - `npm run build -w @jurnapod/db`
  - `npm run build -w @jurnapod/api`
- Typecheck passes:
  - `npm run typecheck -w @jurnapod/modules-inventory-costing`
  - `npm run typecheck -w @jurnapod/api`
- Unit tests pass:
  - `npm run test:unit -w @jurnapod/modules-inventory-costing` → 37/37 tests passing
- API integration target test passes:
  - `npm run test:single -w @jurnapod/api -- "__test__/integration/settings/config-update.test.ts"` → 19/19 tests passing

## Review Gate
- Consolidated adversarial review completed (`bmad-review`): **GO**
- Blocking findings resolved (previous P1/P2 items closed)

## Story Boundary Note
- This story delivers costing-method correctness and standard-variance computation/account-resolution infrastructure.
- Journal posting of variance effects is tracked in subsequent accounting reconciliation story scope.

## Sign-off
- **Reviewer GO:** ✅ Completed (bmad-review consolidated adversarial review — GO with no P0/P1/P2 blockers)
- **Story Owner Sign-off:** ✅ Ahmad — 2026-05-08
