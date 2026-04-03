# Epic 26: Extend modules-inventory with Cost-Dependent Stock Operations

**Status:** 📋 Backlog  
**Date:** 2026-04-03  
**Stories:** 5 total  
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-26-sprint-plan.md`

---

## Executive Summary

Epic 26 moves `deductStockWithCost`, `restoreStock`, and `adjustStock` from `apps/api/src/lib/stock.ts` into `@jurnapod/modules-inventory`, completing the extraction of stock orchestration from the API layer. After this epic, `modules-inventory` is the canonical home for all stock operations including cost-aware mutations.

**Key Goals:**
- Move cost-dependent stock operations from API into `modules-inventory`
- Make `modules-inventory` the sole owner of stock row state and `inventory_transactions` log
- `modules-inventory-costing` remains the costing engine (FIFO/AVG/LIFO)
- `deductStockForSaleWithCogs` stays in API (crosses into accounting boundary)
- Remove `@/lib/cost-tracking.ts` dead adapter after migration

---

## Goals & Non-Goals

### Goals
- Extend `StockServiceImpl` with `deductStockWithCost`, `restoreStock`, `adjustStock`
- Keep `modules-inventory` as stock orchestration authority (stock rows + transaction log)
- `modules-inventory` calls `modules-inventory-costing` for cost math (`deductWithCost`, `createCostLayer`)
- Clean API delegation layer (`apps/api/src/lib/stock.ts` becomes thin facade)
- Full backward compatibility for existing consumers (sync push, routes, middleware)

### Non-Goals
- Move `deductStockForSaleWithCogs` — it stays in API (stock + COGS journal posting composition)
- Change `modules-inventory-costing` public API
- Change database schema
- Move POS offline stock service (`apps/pos/src/services/stock.ts`) — it uses offline-db/dexie, not this layer
- Change sync push protocol

---

## Architecture

### Current State

```
apps/api/src/lib/stock.ts
├── delegates to getStockService()    → modules-inventory (basic ops)
├── implements deductStockWithCost     ← HERE (should move to modules-inventory)
├── implements restoreStock            ← HERE (should move to modules-inventory)
├── implements adjustStock            ← HERE (should move to modules-inventory)
└── implements deductStockForSaleWithCogs ← STAYS IN API (stock + cogs-posting)

modules-inventory
├── StockServiceImpl
│   ├── checkAvailability, hasSufficientStock, getStockConflicts
│   ├── getStockLevels, getStockTransactions, getLowStockAlerts
│   ├── reserveStock, releaseStock, deductStock
│   └── inventory_transactions writes, inventory_stock updates
└── modules-inventory-costing
    ├── deductWithCost  (consumes cost layers)
    └── createCostLayer (creates inbound cost layers)

apps/api/src/lib/cost-tracking.ts
└── Thin adapter wrapping modules-inventory-costing (→ remove after migration)
```

### Target State

```
modules-inventory
├── StockServiceImpl
│   ├── checkAvailability, hasSufficientStock, getStockConflicts
│   ├── getStockLevels, getStockTransactions, getLowStockAlerts
│   ├── reserveStock, releaseStock, deductStock
│   ├── deductStockWithCost        ← MOVED HERE (uses deductWithCost)
│   ├── restoreStock                ← MOVED HERE (uses createCostLayer)
│   └── adjustStock                 ← MOVED HERE (uses createCostLayer)
└── modules-inventory-costing
    ├── deductWithCost
    └── createCostLayer

apps/api/src/lib/stock.ts
├── re-exports types from modules-inventory
└── delegates all cost-dependent ops to getStockService()

apps/api/src/lib/cost-tracking.ts → REMOVED (dead after migration)
```

### Dependency Direction (unchanged — already correct)

```
modules-inventory → modules-inventory-costing
modules-inventory → modules-accounting (NOT: inventory-costing → accounting)
apps/api → modules-inventory (for all stock operations)
apps/api → modules-accounting (for cogs-posting only)
```

---

## Boundary Rules

1. `modules-inventory` **may** import from `modules-inventory-costing` for cost math.
2. `modules-inventory` **must not** import from `modules-accounting`.
3. `modules-inventory` owns `inventory_stock` rows and `inventory_transactions` log — all mutation goes through `StockServiceImpl`.
4. `deductStockForSaleWithCogs` stays in API — it composes stock deduction + COGS journal posting (crosses accounting boundary).
5. `apps/pos/src/services/stock.ts` is POS-local and uses offline-db/dexie — not affected by this epic.

---

## Success Criteria

- [ ] `StockServiceImpl.deductStockWithCost` implemented in `modules-inventory`
- [ ] `StockServiceImpl.restoreStock` implemented in `modules-inventory`
- [ ] `StockServiceImpl.adjustStock` implemented in `modules-inventory`
- [ ] All three methods delegate cost math to `modules-inventory-costing` (`deductWithCost`, `createCostLayer`)
- [ ] `apps/api/src/lib/stock.ts` becomes thin delegation facade
- [ ] `@/lib/cost-tracking.ts` removed (or confirmed unused) after migration
- [ ] `sync/push/stock.ts` and `sync/push/transactions.ts` work unchanged
- [ ] All existing tests pass
- [ ] Full validation gate passes

---

## Stories

| # | Title |
|---|---|
| [story-26.1](./story-26.1.md) | Extend StockService interface with cost-dependent types and signatures |
| [story-26.2](./story-26.2.md) | Implement deductStockWithCost in StockServiceImpl |
| [story-26.3](./story-26.3.md) | Implement restoreStock and adjustStock in StockServiceImpl |
| [story-26.4](./story-26.4.md) | Update API stock.ts to delegate, remove cost-tracking adapter |
| [story-26.5](./story-26.5.md) | Full validation gate |
