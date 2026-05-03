# Story 53-2: Accounting + Inventory Package Migration

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 53-2 |
| Epic | Epic 53: Datetime API Consolidation Execution |
| Title | Accounting + Inventory Package Migration |
| Status | backlog |
| Risk | P1 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 53-1 (Core API Surface) |

## Story

As a **developer**,  
I want all `@jurnapod/modules-accounting`, `@jurnapod/modules-inventory`, and `@jurnapod/modules-inventory-costing` source files to use the new `toUtcIso`/`fromUtcIso` namespaced API,  
So that all datetime conversions in these packages follow the canonical trunk and old function names are eliminated.

## Context

Story 53-1 established the new namespaced API while keeping deprecated wrappers for backward compatibility. This story migrates the accounting and inventory module packages to use the new API directly, covering:

- Function call renames (e.g., `toRfc3339Required(x)` → `toUtcIso.dateLike(x)`)
- Import fixups
- Raw `.toISOString()` Pattern A/B/C cleanups within these packages
- Local datetime helper replacements

## Acceptance Criteria

- [ ] **AC1: All `modules-accounting` files use new API** — no old function calls remain
- [ ] **AC2: All `modules-inventory` files use new API** — no old function calls remain
- [ ] **AC3: All `modules-inventory-costing` files use new API** — no old function calls remain
- [ ] **AC4: All raw `.toISOString()` patterns in these packages** replaced with canonical equivalents
- [ ] **AC5: Local datetime helpers replaced** — `cogs.ts` local `toBusinessDate`, `sync-push.ts` local `toDateOnly`, `sales.ts` local `toDateOnly` all migrated
- [ ] **AC6: Build passes** — `npm run build -w @jurnapod/modules-accounting && npm run build -w @jurnapod/modules-inventory && npm run build -w @jurnapod/modules-inventory-costing`
- [ ] **AC7: Unit tests pass** — `npm run test:unit -w @jurnapod/modules-accounting && npm run test:unit -w @jurnapod/modules-inventory`

## Bulk Migration Targets

### `@jurnapod/modules-accounting` — Function renames

| # | File | Current | New |
|---|------|---------|-----|
| 1 | `src/posting/sync-push.ts` | `toMysqlDateTimeFromDateLike(x)` | `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| 2 | `src/posting/depreciation.ts` | `toMysqlDateTimeFromDateLike(x)` | `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| 3 | `src/posting/sales.ts` | `toMysqlDateTimeFromDateLike(x)` (×4) | `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| 4 | `src/fixed-assets/services/lifecycle-service.ts` | `toDateOnly(nowUTC())` (×4) | `fromUtcIso.dateOnly(nowUTC())` |
| 5 | `src/fiscal-year/service.ts` | `toRfc3339Required(x)`, `toDateOnly(nowUTC())` | `toUtcIso.dateLike(x)`, `fromUtcIso.dateOnly(nowUTC())` |
| 6 | `src/reconciliation/index.ts` | `nowUTC()` | Keep (standalone) |
| 7 | `src/reconciliation/dashboard-service.ts` | `resolveBusinessTimezone()`, `epochMsToPeriodBoundaries()` | Keep `resolveBusinessTimezone`. Move `epochMsToPeriodBoundaries()` to this package (accounting domain concern). |
| 8 | `src/reconciliation/subledger/cash-provider.ts` | `resolveBusinessTimezone()`, `epochMsToPeriodBoundaries()` | Keep `resolveBusinessTimezone`. Move `epochMsToPeriodBoundaries()`. |
| 9 | `src/reconciliation/subledger/receivables-provider.ts` | `resolveBusinessTimezone()`, `businessDateFromEpochMs()`, `asOfDateToUtcRange()` | Keep `resolveBusinessTimezone`. Compose `businessDateFromEpochMs()`. Use `toUtcIso.asOfDateRange()`. |
| 10 | `src/reconciliation/subledger/ar-reconciliation-service.ts` | `normalizeDate()`, `isValidTimeZone()` | `toUtcIso.businessDate()`, keep `isValidTimeZone` |
| 11 | `src/trial-balance/service.ts` | `resolveBusinessTimezone()`, `epochMsToPeriodBoundaries()` | Keep `resolveBusinessTimezone`. Move `epochMsToPeriodBoundaries()`. |
| 12 | `src/journals-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 13 | `src/account-types-service.ts` | Pattern B: `value.toISOString()` | `toUtcIso.dateLike(value)` |
| 14 | `src/accounts-service.ts` | Pattern B: `value.toISOString()` | `toUtcIso.dateLike(value)` |
| 15 | `src/fixed-assets/services/depreciation-service.ts` | Pattern B + C | `toUtcIso.dateLike()` + `fromUtcIso.dateOnly(toUtcIso.dateLike())` |

### `@jurnapod/modules-accounting` — Local helpers to replace

| # | File | Local function | Replace with |
|---|------|---------------|-------------|
| 16 | `src/posting/cogs.ts` (line 721) | Local `toBusinessDate(Date\|number)` | `fromUtcIso.dateOnly(toUtcIso.dateLike(x))` |
| 17 | `src/posting/sync-push.ts` (line 496) | Local `toDateOnly(string)` | `fromUtcIso.dateOnly(value)` |
| 18 | `src/posting/sales.ts` (line 386) | Local `toDateOnly(string)` | `fromUtcIso.dateOnly(value)` |
| 19 | `src/fiscal-year/service.ts` (line 130) | Local `formatDateOnlyFromUnknown(value)` | `fromUtcIso.dateOnly(toUtcIso.dateLike(value))` |

### `@jurnapod/modules-inventory` — Function renames

| # | File | Current | New |
|---|------|---------|-----|
| 1 | `src/services/item-group-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 2 | `src/services/item-price-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 3 | `src/services/supplies-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 4 | `src/services/item-variant-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 5 | `src/services/recipe-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 6 | `src/services/item-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 7 | `src/services/stock-service.ts` | Pattern B: `value.toISOString()` | `toUtcIso.dateLike(value)` |
| 8 | `src/services/item-price-service.ts` (line 637) | Pattern B: `.toISOString()` | `toUtcIso.dateLike(x)` |

### `@jurnapod/modules-inventory-costing`

| # | File | Current | New |
|---|------|---------|-----|
| 1 | `src/index.ts` | Pattern A: `new Date().toISOString()` | `nowUTC()` |
| 2 | `src/index.ts` (line 591) | Pattern B: `.toISOString()` | `toUtcIso.dateLike(x)` |

## Tasks/Subtasks

- [ ] 2.1 Rename function calls in `modules-accounting` (files 1-12) + fix imports
- [ ] 2.2 Replace local datetime helpers in `modules-accounting` (files 16-19)
- [ ] 2.3 Fix raw `.toISOString()` patterns in `modules-accounting` (files 13-15)
- [ ] 2.4 Build + test: `npm run build -w @jurnapod/modules-accounting && npm run test:unit -w @jurnapod/modules-accounting`
- [ ] 2.5 Rename function calls in `modules-inventory` (files 1-6) + fix imports
- [ ] 2.6 Fix raw `.toISOString()` patterns in `modules-inventory` (files 7-8)
- [ ] 2.7 Build + test: `npm run build -w @jurnapod/modules-inventory && npm run test:unit -w @jurnapod/modules-inventory`
- [ ] 2.8 Fix raw `.toISOString()` in `modules-inventory-costing`
- [ ] 2.9 Build: `npm run build -w @jurnapod/modules-inventory-costing`

## Files to Modify

| File | Action |
|------|--------|
| `packages/modules/accounting/src/posting/sync-push.ts` | Modify |
| `packages/modules/accounting/src/posting/depreciation.ts` | Modify |
| `packages/modules/accounting/src/posting/sales.ts` | Modify |
| `packages/modules/accounting/src/posting/cogs.ts` | Modify |
| `packages/modules/accounting/src/fixed-assets/services/lifecycle-service.ts` | Modify |
| `packages/modules/accounting/src/fiscal-year/service.ts` | Modify |
| `packages/modules/accounting/src/reconciliation/index.ts` | Keep (no change) |
| `packages/modules/accounting/src/reconciliation/dashboard-service.ts` | Modify |
| `packages/modules/accounting/src/reconciliation/subledger/cash-provider.ts` | Modify |
| `packages/modules/accounting/src/reconciliation/subledger/receivables-provider.ts` | Modify |
| `packages/modules/accounting/src/reconciliation/subledger/ar-reconciliation-service.ts` | Modify |
| `packages/modules/accounting/src/trial-balance/service.ts` | Modify |
| `packages/modules/accounting/src/journals-service.ts` | Modify |
| `packages/modules/accounting/src/account-types-service.ts` | Modify |
| `packages/modules/accounting/src/accounts-service.ts` | Modify |
| `packages/modules/accounting/src/fixed-assets/services/depreciation-service.ts` | Modify |
| `packages/modules/inventory/src/services/item-group-service.ts` | Modify |
| `packages/modules/inventory/src/services/item-price-service.ts` | Modify |
| `packages/modules/inventory/src/services/supplies-service.ts` | Modify |
| `packages/modules/inventory/src/services/item-variant-service.ts` | Modify |
| `packages/modules/inventory/src/services/recipe-service.ts` | Modify |
| `packages/modules/inventory/src/services/item-service.ts` | Modify |
| `packages/modules/inventory/src/services/stock-service.ts` | Modify |
| `packages/modules/inventory-costing/src/index.ts` | Modify |

## Estimated Effort

1-2 days

## Risk Level

P1 — Non-trivial rename surface but mechanical; build catches missing imports. `epochMsToPeriodBoundaries` moves to accounting package (logic unchanged).

## Dev Notes

- **Import pattern:** After renaming calls, run import fixup to add `toUtcIso`/`fromUtcIso` to imports from `@jurnapod/shared`
- **Posting layer:** `toMysqlDateTimeFromDateLike(x)` → `fromUtcIso.mysql(toUtcIso.dateLike(x))` — always a 2-hop conversion (dateLike then mysql)
- **cogs.ts local `toBusinessDate`:** `fromUtcIso.dateOnly(toUtcIso.dateLike(x))` — drops time component after converting to Z string
- **`epochMsToPeriodBoundaries`:** This is an accounting-domain function. Move it from `packages/shared` to `modules-accounting` (or keep a re-export in shared). The plan indicates it should move to accounting. Create a re-export or direct export.
- **`ar-reconciliation-service.ts normalizeDate`:** The method definition `private normalizeDate(...)` must NOT be renamed — only the imported function call inside the method body changes to `toUtcIso.businessDate(...)`.

## Validation Evidence

```bash
npm run build -w @jurnapod/modules-accounting
npm run test:unit -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-inventory
npm run test:unit -w @jurnapod/modules-inventory
npm run build -w @jurnapod/modules-inventory-costing
npm run build -w @jurnapod/api  # verify no broken imports from modules
```

## Dependencies

Story 53-1 (Core API Surface + Route Validation)
