# Story 31.7a: Route Thinning - Inventory Routes

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.7a |
| Title | Route Thinning - Inventory Routes |
| Status | review |
| Type | Route Thinning |
| Priority | P1 |
| Estimate | 8h |

---

## Story

As an API Developer,
I want `routes/inventory.ts` to be a thin HTTP adapter,
So that all business logic lives in `@jurnapod/modules-inventory` and routes are consistently thin.

---

## Background

`routes/inventory.ts` (~1,079 lines, 20 endpoints) still contains:
- Legacy dynamic imports from API lib (`../lib/item-groups/index.js`)
- Route-level post-filtering (e.g., item-price filtering by `item_id`)
- Repeated auth/permission gates

Already delegated: itemService, itemGroupService, itemPriceService, itemVariantService via adapters.

---

## Acceptance Criteria

1. `routes/inventory.ts` uses only `@jurnapod/modules-inventory` adapters (no legacy API lib imports)
2. Route-level post-filtering moved to package-level filtered methods
3. Repeated access checks extracted to reusable API boundary helper
4. Routes contain only HTTP concerns (validation, auth, response)
5. Routes do not import `getDbPool`, `pool.execute`, or SQL helpers
6. `npm run typecheck -w @jurnapod/api` passes
7. `npm run build -w @jurnapod/api` passes

---

## Tasks

- [x] Audit `routes/inventory.ts` for legacy lib imports
- [x] Audit `routes/inventory.ts` for route-level post-filtering
- [x] Audit repeated auth/permission patterns
- [x] Refactor to use only module adapters
- [x] Move post-filtering to package-level methods
- [x] Extract access check helpers
- [x] Run typecheck + build

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

---

## Dependencies

- None (can run in parallel with 31.7b and 31.7c)

---

## Dev Agent Record

### Implementation Summary

**Files Modified:**
- `apps/api/src/routes/inventory.ts` - Refactored to thin HTTP adapter
- `packages/modules/inventory/src/interfaces/item-price-service.ts` - Added `itemId` filter to `listItemPrices`
- `packages/modules/inventory/src/services/item-price-service.ts` - Implemented `itemId` filtering

### Legacy Lib Imports Found and Fixed

| Original Import | Location | Resolution |
|-----------------|----------|------------|
| `const { getItemById } = await import("../lib/item-variants.js")` | Line 204 | Replaced with `itemsAdapter.findItemById()` |
| `const { listItemGroups } = await import("../lib/item-groups/index.js")` | Line 382 | Replaced with `itemGroupsAdapter.listItemGroups()` |
| `const { findItemGroupById } = await import("../lib/item-groups/index.js")` | Line 407 | Replaced with `itemGroupsAdapter.findItemGroupById()` |
| `import { ItemGroupBulkConflictError } from "../lib/item-groups/index.js"` | Line 36 | Changed to import from `@jurnapod/modules-inventory` |

### Business Logic Moved from Routes to Package Level

**Post-filtering removed from `GET /inventory/items/:id/prices`:**
- Original: `itemPrices = itemPrices.filter(p => p.item_id === itemId)` (lines 1060-1065)
- Now: Filter applied at package level via new `itemId` parameter in `listItemPrices(companyId, { itemId })`

### New Helpers Extracted

1. **`requireInventoryAccess(permission)`** - Reusable access check guard for inventory module permissions
   - Reduces repeated auth pattern: `requireAccess({ module: "inventory", permission })`
   - Used across all 20 inventory endpoints

2. **`canAccessCompanyDefaults(userId, companyId)`** - Helper for checking global role access
   - Consolidates: `checkUserAccess({ userId, companyId })` then `access?.hasGlobalRole || access?.isSuperAdmin`
   - Used in item-price routes for outlet vs company-default access control

### Validation Results

| Check | Result |
|-------|--------|
| `npm run typecheck -w @jurnapod/api` | ✅ PASS |
| `npm run build -w @jurnapod/api` | ✅ PASS |
| `npm run typecheck -w @jurnapod/modules-inventory` | ✅ PASS |
| `npm run build -w @jurnapod/modules-inventory` | ✅ PASS |
| Full monorepo build | ✅ PASS |
| No legacy lib imports in routes | ✅ VERIFIED |
| No `getDbPool`/`pool.execute`/SQL in routes | ✅ VERIFIED |

### Architecture After Refactor

```
routes/inventory.ts (HTTP layer)
    │
    ├── itemsAdapter (from ../lib/items/adapter.js)
    │       └── delegates to @jurnapod/modules-inventory ItemService
    │
    ├── itemGroupsAdapter (from ../lib/item-groups/adapter.js)
    │       └── delegates to @jurnapod/modules-inventory ItemGroupService
    │
    ├── itemPricesAdapter (from ../lib/item-prices/adapter.js)
    │       └── delegates to @jurnapod/modules-inventory ItemPriceService
    │
    └── requireInventoryAccess() - Auth boundary helper
```

### Key Design Decisions

1. **Adapter Pattern Preserved**: Routes use existing adapters which delegate to modules-inventory. No direct imports from modules-inventory in routes.

2. **`itemId` Filter Added to `listItemPrices`**: Rather than creating a new method, extended existing `listItemPrices` interface and implementation to support `itemId` filtering at the query level.

3. **Error Class Import**: `ItemGroupBulkConflictError` now imported from `@jurnapod/modules-inventory` (its canonical source) rather than the legacy lib index.

4. **Auth Helper Granularity**: Created `requireInventoryAccess()` for module-level checks and `canAccessCompanyDefaults()` for global role checks - appropriate separation for the inventory context.
