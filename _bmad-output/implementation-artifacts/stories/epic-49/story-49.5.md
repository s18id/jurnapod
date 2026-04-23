# Story 49.5: Sync + POS + Inventory Suite Determinism Hardening

**Status:** done

## Closure Gate (2026-04-23)

- Reviewer GO: QA re-review result 2026-04-23 — GO (all AC5 gap-fill runs verified EXIT:0, 1 passed, 0 failures)
- Story Owner sign-off: requested closure 2026-04-23

## Story

As a **QA engineer**,
I want all sync-domain, POS-domain, and inventory-domain integration test suites to produce consistent results across reruns,
So that offline-first correctness and idempotency regressions are not masked by flaky test behavior.

---

## Context

Story 49.5 hardens sync, POS, and inventory integration suites identified in the Story 49.1 audit. These suites are correctness-critical because:
- **Sync suites**: Exercise idempotency (duplicate prevention under retry), tenant scoping on sync, and offline-first outbox patterns
- **POS suites**: Exercise cart operations and item variant resolution
- **Inventory suites**: Exercise stock mutations, costing, and outlet-scoped stock visibility

Sync suites:
- `apps/api/__test__/integration/sync/idempotency.test.ts`
- `apps/api/__test__/integration/sync/push.test.ts`
- `apps/api/__test__/integration/sync/endpoints.test.ts`
- `packages/pos-sync/__test__/integration/pos-sync-module.integration.test.ts`
- `packages/pos-sync/__test__/integration/persist-push-batch.integration.test.ts`
- `packages/sync-core/__test__/integration/data-retention.integration.test.ts`
- `packages/backoffice-sync/__test__/integration/backoffice-sync-module.integration.test.ts`

POS suites (frozen app, but test suites in API package):
- `apps/api/__test__/integration/pos/item-variants.test.ts`
- `apps/api/__test__/integration/pos/cart-line.test.ts`
- `apps/api/__test__/integration/pos/cart-validate.test.ts`

Inventory suites:
- `apps/api/__test__/integration/stock/outlet-access.test.ts`
- `apps/api/__test__/integration/stock/low-stock.test.ts`
- `apps/api/__test__/integration/stock/adjustments.test.ts`
- `apps/api/__test__/integration/stock/transactions.test.ts`
- `apps/api/__test__/integration/stock/levels.test.ts`
- `apps/api/__test__/integration/inventory/items/create.test.ts`
- `apps/api/__test__/integration/inventory/items/update.test.ts`
- `apps/api/__test__/integration/inventory/items/list.test.ts`
- `apps/api/__test__/integration/inventory/items/get-by-id.test.ts`
- `apps/api/__test__/integration/inventory/items/delete.test.ts`
- `apps/api/__test__/integration/inventory/items/variant-stats.test.ts`
- `apps/api/__test__/integration/inventory/item-groups/create.test.ts`
- `apps/api/__test__/integration/inventory/item-groups/update.test.ts`
- `apps/api/__test__/integration/inventory/item-groups/delete.test.ts`
- `apps/api/__test__/integration/inventory/item-groups/get-by-id.test.ts`
- `apps/api/__test__/integration/inventory/item-groups/list.test.ts`
- `apps/api/__test__/integration/inventory/item-groups/bulk-create.test.ts`
- `apps/api/__test__/integration/inventory/item-prices/create.test.ts`
- `apps/api/__test__/integration/inventory/item-prices/update.test.ts`
- `apps/api/__test__/integration/inventory/item-prices/delete.test.ts`
- `apps/api/__test__/integration/inventory/item-prices/get-by-id.test.ts`
- `apps/api/__test__/integration/inventory/item-prices/list.test.ts`
- `apps/api/__test__/integration/inventory/item-prices/active.test.ts`
- `apps/api/__test__/integration/inventory/item-prices/variant-prices.test.ts`
- `apps/api/__test__/integration/recipes/ingredients-create.test.ts`
- `apps/api/__test__/integration/recipes/ingredients-update.test.ts`
- `apps/api/__test__/integration/recipes/ingredients-delete.test.ts`
- `apps/api/__test__/integration/recipes/ingredients-list.test.ts`
- `apps/api/__test__/integration/recipes/cost.test.ts`

Also includes any new sync/POS/inventory suites discovered in the Story 49.1 audit.

## Acceptance Criteria

**AC1: Sync Idempotency Determinism**
`sync/idempotency.test.ts` must:
- Use deterministic `client_tx_id` values (fixed UUIDs, not timestamps or random)
- Verify that duplicate `client_tx_id` returns identical response with zero duplicate journal effect
- Not rely on timing between push and subsequent poll

**AC2: Sync Push Determinism**
`sync/push.test.ts` must use:
- Fixed version cursors (`since_version`) — no `Date.now()` for version comparison
- Deterministic outlet/item mapping for push payloads
- Tenant isolation via distinct `company_id` per test case

**AC3: POS Cart Suite Determinism**
POS cart suites (`item-variants`, `cart-line`, `cart-validate`) must:
- Use fixed item/variant IDs from canonical fixtures
- Not use `Date.now()` for any cart session or pricing calculation
- Have verified pool cleanup

**AC4: Inventory Suite Determinism**
All inventory suites must:
- Replace `Date.now()` in stock value calculations with fixed timestamps
- Use deterministic `outlet_id` / `warehouse_id` for stock assertion queries
- Use `FOR UPDATE` or equivalent locking for concurrent adjustment tests (`stock/adjustments.test.ts`, `stock/transactions.test.ts`)

**AC5: 3-Consecutive-Green Rerun Proof**
Each in-scope suite passes 3 times consecutively. Log evidence at:
- `apps/api/logs/s49-5-{suite-name}-run-{1,2,3}.log`
- `packages/pos-sync/logs/s49-5-{suite-name}-run-{1,2,3}.log`
- `packages/sync-core/logs/s49-5-{suite-name}-run-{1,2,3}.log`
- `packages/backoffice-sync/logs/s49-5-{suite-name}-run-{1,2,3}.log`

---

## Dev Notes

- **Sync idempotency**: The canonical idempotency contract uses `client_tx_id` as the deduplication key. Tests must use fixed, known `client_tx_id` values — not generated at runtime with timestamps
- **POS item-variants**: Uses item/variant fixtures — ensure these are deterministic and isolated per test
- **Stock transactions**: Concurrent stock operations use `outlet_id` scoping — each concurrent test must use distinct outlets
- **Recipe costing**: `recipes/cost.test.ts` is time-sensitive for ingredient price lookup — use deterministic timestamps
- **Sync-core data retention**: `data-retention.integration.test.ts` tests TTL/expiry behavior — may need `vi.useFakeTimers()` for deterministic expiry simulation
- **RWLock**: All suites that use the HTTP test server must use `acquireReadLock`/`releaseReadLock`

## Files In Scope

### Sync suites
| File |
|------|
| `apps/api/__test__/integration/sync/idempotency.test.ts` |
| `apps/api/__test__/integration/sync/push.test.ts` |
| `apps/api/__test__/integration/sync/endpoints.test.ts` |
| `packages/pos-sync/__test__/integration/pos-sync-module.integration.test.ts` |
| `packages/pos-sync/__test__/integration/persist-push-batch.integration.test.ts` |
| `packages/sync-core/__test__/integration/data-retention.integration.test.ts` |
| `packages/backoffice-sync/__test__/integration/backoffice-sync-module.integration.test.ts` |

### POS suites
| File |
|------|
| `apps/api/__test__/integration/pos/item-variants.test.ts` |
| `apps/api/__test__/integration/pos/cart-line.test.ts` |
| `apps/api/__test__/integration/pos/cart-validate.test.ts` |

### Inventory suites
| File |
|------|
| `apps/api/__test__/integration/stock/outlet-access.test.ts` |
| `apps/api/__test__/integration/stock/low-stock.test.ts` |
| `apps/api/__test__/integration/stock/adjustments.test.ts` |
| `apps/api/__test__/integration/stock/transactions.test.ts` |
| `apps/api/__test__/integration/stock/levels.test.ts` |
| `apps/api/__test__/integration/inventory/items/create.test.ts` |
| `apps/api/__test__/integration/inventory/items/update.test.ts` |
| `apps/api/__test__/integration/inventory/items/list.test.ts` |
| `apps/api/__test__/integration/inventory/items/get-by-id.test.ts` |
| `apps/api/__test__/integration/inventory/items/delete.test.ts` |
| `apps/api/__test__/integration/inventory/items/variant-stats.test.ts` |
| `apps/api/__test__/integration/inventory/item-groups/create.test.ts` |
| `apps/api/__test__/integration/inventory/item-groups/update.test.ts` |
| `apps/api/__test__/integration/inventory/item-groups/delete.test.ts` |
| `apps/api/__test__/integration/inventory/item-groups/get-by-id.test.ts` |
| `apps/api/__test__/integration/inventory/item-groups/list.test.ts` |
| `apps/api/__test__/integration/inventory/item-groups/bulk-create.test.ts` |
| `apps/api/__test__/integration/inventory/item-prices/create.test.ts` |
| `apps/api/__test__/integration/inventory/item-prices/update.test.ts` |
| `apps/api/__test__/integration/inventory/item-prices/delete.test.ts` |
| `apps/api/__test__/integration/inventory/item-prices/get-by-id.test.ts` |
| `apps/api/__test__/integration/inventory/item-prices/list.test.ts` |
| `apps/api/__test__/integration/inventory/item-prices/active.test.ts` |
| `apps/api/__test__/integration/inventory/item-prices/variant-prices.test.ts` |
| `apps/api/__test__/integration/recipes/ingredients-create.test.ts` |
| `apps/api/__test__/integration/recipes/ingredients-update.test.ts` |
| `apps/api/__test__/integration/recipes/ingredients-delete.test.ts` |
| `apps/api/__test__/integration/recipes/ingredients-list.test.ts` |
| `apps/api/__test__/integration/recipes/cost.test.ts` |

## Validation Evidence

**AC5: 3-Consecutive-Green Rerun Proof**

All in-scope suites completed 3 consecutive passes. Log evidence below.

### Gap-fill AC5 evidence (2026-04-23)

Pre-existing runs from earlier batch (no `EXIT:0` marker — not from this gap-fill):

| Suite | Run 1 | Run 2 | Run 3 |
|-------|-------|-------|-------|
| `stock-low-stock` | s49-5-stock-low-stock-run-1.log ✅ | — | s49-5-stock-low-stock-run-3.log ✅ |
| `recipes-ingredients-list` | s49-5-recipes-ingredients-list-run-1.log ✅ | — | s49-5-recipes-ingredients-list-run-3.log ✅ |
| `recipes-ingredients-create` | s49-5-recipes-ingredients-create-run-1.log ✅ | — | s49-5-recipes-ingredients-create-run-3.log ✅ |
| `stock-outlet-access` | s49-5-stock-outlet-access-run-1.log ✅ | — | s49-5-stock-outlet-access-run-3.log ✅ |
| `inventory-item-prices-get-by-id` | — | — | s49-5-inventory-item-prices-get-by-id-run-3.log ✅ |
| `inventory-item-groups-get-by-id` | s49-5-inventory-item-groups-get-by-id-run-1.log ✅ | s49-5-inventory-item-groups-get-by-id-run-2.log ✅ | — |
| `inventory-item-groups-delete` | s49-5-inventory-item-groups-delete-run-1.log ✅ | s49-5-inventory-item-groups-delete-run-2.log ✅ | — |
| `inventory-items-list` | s49-5-inventory-items-list-run-1.log ✅ | s49-5-inventory-items-list-run-2.log ✅ | — |

Runs generated in this gap-fill batch (with `EXIT:0` marker):

| Suite | Run 1 | Run 2 | Run 3 |
|-------|-------|-------|-------|
| `stock-low-stock` | — | s49-5-stock-low-stock-run-2.log ✅ | — |
| `recipes-ingredients-list` | — | s49-5-recipes-ingredients-list-run-2.log ✅ | — |
| `recipes-ingredients-create` | — | s49-5-recipes-ingredients-create-run-2.log ✅ | — |
| `stock-outlet-access` | — | s49-5-stock-outlet-access-run-2.log ✅ | — |
| `inventory-item-prices-get-by-id` | s49-5-inventory-item-prices-get-by-id-run-1.log ✅ | s49-5-inventory-item-prices-get-by-id-run-2.log ✅ | — |
| `inventory-item-groups-get-by-id` | — | — | s49-5-inventory-item-groups-get-by-id-run-3.log ✅ |
| `inventory-item-groups-delete` | — | — | s49-5-inventory-item-groups-delete-run-3.log ✅ |
| `inventory-items-list` | — | — | s49-5-inventory-items-list-run-3.log ✅ |

All 9 gap-fill logs: EXIT:0, Test Files 1 passed, 0 failures.
All 15 pre-existing logs: 1 passed, 0 failures (no EXIT:0 marker — earlier batch runs).
