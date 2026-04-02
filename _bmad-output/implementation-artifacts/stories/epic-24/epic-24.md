# Epic 24: Inventory Costing Boundary

## Description

Extract cost-tracking logic from API to establish a clean inventory/accounting boundary. This enables proper modularization of COGS posting without creating circular dependencies between inventory and accounting packages.

## Motivation

Epic 23 extracted domain logic from API to packages, but cost-aware stock operations remained in `apps/api/src/lib/stock.ts` because they depend on `@/lib/cost-tracking` (API-internal). This epic extracts costing into its own package with a clean contract.

## Problem Statement

Currently:
- `lib/stock.ts` contains cost-aware operations (`deductStockWithCost`, `deductStockForSaleWithCogs`, `restoreStock`, `adjustStock`)
- These call `@/lib/cost-tracking` which mixes inventory and accounting concerns
- COGS posting (`cogs-posting.ts`) depends on these stock operations
- Full extraction to modules-inventory would create a cycle: inventory → costing → accounting

## Solution

Create `@jurnapod/modules-inventory-costing` package with:
- Clean `deductWithCost(companyId, items[]) => { stockTxIds, itemCosts }` contract
- Cost layer management (average, sum costing methods)
- No direct dependency on accounting package

## Architecture

```
modules-inventory          modules-inventory-costing       modules-accounting
       |                           |                            |
       | (quantity ops)             | (cost calculation)         |
       |                           |                            |
       v                           v                            v
  BasicStockService          CostingService            PostingService
       ^                           ^                            ^
       |                           |                            |
       |                           |                            |
  lib/stock.ts  <--------  cogs-posting.ts  -------->  JournalBatches
```

**Dependency Direction:** inventory → costing → accounting (one-way, no cycles)

## Scope

### In Scope
- Extract `cost-tracking.ts` logic to new package
- Define clean contract between stock and costing
- Update `lib/stock.ts` to use costing package
- Update COGS posting to use costing contract
- Update sync-push handlers

### Out of Scope
- Modifying accounting posting logic
- Changing inventory quantity operations
- New feature development

## Success Criteria

1. `@jurnapod/modules-inventory-costing` package created and stable
2. `lib/stock.ts` delegates cost operations to costing package
3. `cogs-posting.ts` uses costing package contract
4. No circular dependencies between inventory, costing, accounting
5. All existing tests pass (COGS, stock, sync)

## Stories

### Sprint 1
- [24-1] Create `@jurnapod/modules-inventory-costing` package scaffold
- [24-2] Extract `cost-tracking.ts` to costing package

### Sprint 2
- [24-3] Update `lib/stock.ts` to use costing package
- [24-4] Update COGS posting to use costing contract

### Sprint 3
- [24-5] Update sync-push stock handlers
- [24-6] Full validation gate

## Dependencies

- Epic 23 (modules-accounting extraction) should be stable first
- No new dependencies created

## Status

**Status:** 🟡 Backlog
**Date:** 2026-04-02