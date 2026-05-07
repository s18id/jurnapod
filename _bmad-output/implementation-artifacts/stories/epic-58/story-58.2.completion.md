# Story 58.2 Completion Report

## Story: 58.2 — Stock Movement & Outlet Scoping Correctness

**Epic:** Epic 58 — Inventory/Costing Correctness  
**Status:** REVIEW ✅  
**Date:** 2026-05-07

---

## Goal

Prove stock movement correctness under outlet scoping: all stock writes/reads are scoped by `company_id` and `outlet_id`, transfers are atomic, outlet pricing fallback is correct, and negative-stock attempts are rejected without partial side effects.

---

## Acceptance Criteria Evidence

| AC | Description | Evidence | Status |
|----|-------------|----------|--------|
| **AC1** | Stock movements scoped by `company_id` + `outlet_id` | `stock-service.ts` updated query/write paths to strict outlet scoping; removed legacy `OR outlet_id IS NULL` usage in active movement paths | ✅ PASS |
| **AC2** | Stock queries filter by `outlet_id` and return outlet-specific quantities | `stock-movement-outlet-scoping.test.ts` AC1+AC2 test validates outlet A/B isolation (`getStockLevels`) | ✅ PASS |
| **AC3** | Transfer A→B is atomic | `transferStock()` added in inventory service + API wrapper; AC3 test validates A decreases/B increases; reserved-edge transfer test validates rejection on insufficient available stock | ✅ PASS |
| **AC4** | Outlet-specific pricing fallback | AC4 test validates outlet override first, then company-level (`outlet_id IS NULL`) fallback via `itemPriceService.listEffectiveItemPricesForOutlet()` | ✅ PASS |
| **AC5** | Negative stock rejected with `INSUFFICIENT_STOCK` + shortfall | Added `InsufficientStockError`; route maps to `INSUFFICIENT_STOCK`; AC5 tests verify rejection and shortfall message (including reserved-stock edge) | ✅ PASS |
| **AC6** | Multi-item negative line rejects whole transaction atomically | AC6 test verifies no partial stock changes and no transaction rows for failed reference ID | ✅ PASS |

---

## Secondary Evidence

| Check | Evidence | Status |
|-------|----------|--------|
| **Transfer idempotency** | `transferStock()` checks existing `TRANSFER_OUT` by `reference_id` and returns no-op for duplicates | ✅ |
| **Conflict/reference error mapping** | `routes/stock.ts` now centrally maps `InventoryConflictError` (409), `InventoryReferenceError` (404), `InventoryForbiddenError` (400), `InsufficientStockError` (400) | ✅ |
| **Migration compatibility** | `0204` drops conflicting `uq_inventory_stock_company_wide`; `0205` backfills legacy `NULL outlet_id` rows into outlet-scoped rows (merge + move + cleanup) | ✅ |
| **Invariant safety** | Deduction and transfer paths guard on `available_quantity` (not just `quantity`) | ✅ |

---

## Changed Files

### New Files
- `apps/api/__test__/integration/inventory/stock-movement-outlet-scoping.test.ts` — Story 58.2 integration suite (7 tests)
- `packages/db/migrations/0204_inventory_stock_drop_company_wide_unique.sql` — remove conflicting company-wide uniqueness
- `packages/db/migrations/0205_inventory_stock_backfill_null_outlet.sql` — backfill/merge legacy null-outlet stock rows

### Modified Files
- `packages/modules/inventory/src/errors.ts` — add named `InsufficientStockError`
- `packages/modules/inventory/src/interfaces/stock-service.ts` — add `transferStock(...)` contract
- `packages/modules/inventory/src/services/stock-service.ts` — strict outlet scoping, atomic transfer, available-quantity guards, multi-item atomic behavior hardening
- `packages/modules/inventory/src/services/index.ts` — export stock insufficient alias
- `apps/api/src/lib/stock.ts` — export `InsufficientStockError`; add `transferStock(...)` wrapper
- `apps/api/src/routes/stock.ts` — centralized stock error mapping + schema guard (`adjustment_quantity != 0`)
- `_bmad-output/implementation-artifacts/stories/epic-58/story-58.2.md` — status updated to `review`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 58.2 moved to `review`

---

## Validation Commands & Results

- `npm run db:migrate -w @jurnapod/db` → ✅ applied `0204` and `0205`
- `npm run build -w @jurnapod/modules-inventory` → ✅ pass
- `npm run typecheck -w @jurnapod/api` → ✅ pass
- `npm run build -w @jurnapod/api` → ✅ pass
- `npm run test:single -w @jurnapod/api -- "__test__/integration/inventory/stock-movement-outlet-scoping.test.ts"` → ✅ **7/7 pass**

---

## Review Outcome

- Second-pass adversarial review reached **GO** with no remaining P0/P1 blockers.
- Story is technically ready for owner sign-off.

---

## Reviewer Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| **Implementing Developer** | (bmad-dev via orchestration) | 2026-05-07 | Implemented + validated |
| **Second-Pass Reviewer** | (bmad-review) | 2026-05-07 | GO — no P0/P1 blockers |
| **Story Owner** | Ahmad | 2026-05-07 | ✅ Signed off

---

## Next Story

- **Story 58.3:** Costing Method Correctness
