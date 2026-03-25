# Story 2.10: TD-004 Master-Data Domain Extraction

Status: backlog

## Story

As a **Jurnapod developer**,
I want **the `master-data.ts` monolith split into domain-specific modules**,
So that **the codebase follows single-responsibility and，便于 future Kysely migrations per domain**.

## Technical Debt Details

| ID | TD-004 |
|----|--------|
| Location | `apps/api/src/lib/master-data.ts` (2829 lines) |
| Description | Monolithic file serving dual use cases: POS sync-pull (read-only assembly) and backoffice CRUD (item groups, items, prices, supplies, fixed assets). All 40+ exported functions live in one file. |
| Impact | High coupling — Story 2.4 had to extract sync helpers just to migrate `buildSyncPullPayload`. Full DDD extraction was deferred. This story completes that extraction. |
| Priority | P2 |

## Context

`master-data.ts` serves **two fundamentally different use cases**:

| Use Case | Functions | Consumers |
|----------|-----------|-----------|
| **POS sync-pull** (read-only) | `buildSyncPullPayload`, `getCompanyDataVersion`, `readSyncConfig`, `readOpenOrderSyncPayload`, `listOutletTables`, `listActiveReservations`, `listItems`, `listEffectiveItemPricesForOutlet`, `listItemGroups` | `routes/sync/pull.ts` |
| **Backoffice CRUD** | `create*`, `update*`, `delete*`, `list*`, `find*` for item-groups, items, item-prices, supplies, fixed-assets | `routes/inventory.ts`, `routes/supplies.ts`, `routes/accounts.ts` |

**Shared reads** (`listEffectiveItemPricesForOutlet`, `listItemPrices`) are used by BOTH sync-pull AND backoffice CRUD. These need careful handling.

## Approach

**Extraction by domain**, following the pattern established in `lib/sync/push/` and `lib/sync/pull/`:

```
lib/
  item-groups/
    index.ts              # listItemGroups, createItemGroup, createItemGroupsBulk, updateItemGroup, deleteItemGroup
    types.ts              # ItemGroup types
  items/
    index.ts              # listItems, findItem, createItem, updateItem, deleteItem
    types.ts              # Item types
  item-prices/
    index.ts              # listItemPrices, listEffectiveItemPricesForOutlet, findItemPrice, createItemPrice, updateItemPrice, deleteItemPrice
    types.ts              # ItemPrice types
  supplies/
    index.ts              # listSupplies, findSupply, createSupply, updateSupply, deleteSupply
    types.ts              # Supply types
  fixed-assets/
    index.ts              # listFixedAssets, findFixedAsset, createFixedAsset, updateFixedAsset, deleteFixedAsset
    types.ts              # FixedAsset types
  sync/
    master-data.ts        # buildSyncPullPayload, getCompanyDataVersion (sync-specific helpers)
    pull/                 # existing: orchestrateSyncPull, audit service
```

**Key decisions:**
- `listEffectiveItemPricesForOutlet` lives in `lib/item-prices/` (used by both sync AND backoffice CRUD)
- `lib/sync/master-data.ts` imports from domain modules for `buildSyncPullPayload`
- `lib/master-data.ts` is **deleted** after migration — no more dual-use monolith
- All existing callers updated: `routes/inventory.ts`, `routes/supplies.ts`, `routes/accounts.ts`, `routes/sync/pull.ts`

## Acceptance Criteria

1. **AC1: Domain Module Extraction**
   - Given the monolithic `master-data.ts`
   - When extracted into domain modules
   - Then each domain (item-groups, items, item-prices, supplies, fixed-assets) has its own `lib/` subdirectory
   - And `lib/sync/master-data.ts` contains only sync-specific helpers
   - And `lib/master-data.ts` is deleted

2. **AC2: All Callers Updated**
   - Given the domain modules are extracted
   - When existing routes import from them
   - Then all imports from `lib/master-data.ts` are updated to domain modules
   - And `routes/sync/pull.ts` imports from `lib/sync/master-data.ts`

3. **AC3: Shared Function Handling**
   - Given `listEffectiveItemPricesForOutlet` is used by both sync and backoffice
   - Then it lives in `lib/item-prices/` and is imported by both `lib/sync/master-data.ts` and `routes/inventory.ts`

4. **AC4: Test Validation**
   - Given the extraction is complete
   - When tests run
   - Then `npm run test:unit -w @jurnapod/api` passes
   - And `npm run typecheck -w @jurnapod/api` passes
   - And `npm run lint -w @jurnapod/api` passes

## Tasks / Subtasks

- [ ] **Task 1: Extract `lib/item-groups/`**
  - [ ] 1.1 Create `lib/item-groups/types.ts`
  - [ ] 1.2 Create `lib/item-groups/index.ts` with all item-group functions
  - [ ] 1.3 Update `routes/inventory.ts` imports

- [ ] **Task 2: Extract `lib/items/`**
  - [ ] 2.1 Create `lib/items/types.ts`
  - [ ] 2.2 Create `lib/items/index.ts` with all item functions
  - [ ] 2.3 Update `routes/inventory.ts` and `lib/sales.ts` imports

- [ ] **Task 3: Extract `lib/item-prices/`**
  - [ ] 3.1 Create `lib/item-prices/types.ts`
  - [ ] 3.2 Create `lib/item-prices/index.ts` with all item-price functions
  - [ ] 3.3 Update `routes/inventory.ts` and `lib/sync/master-data.ts` imports

- [ ] **Task 4: Extract `lib/supplies/`**
  - [ ] 4.1 Create `lib/supplies/types.ts`
  - [ ] 4.2 Create `lib/supplies/index.ts` with all supply functions
  - [ ] 4.3 Update `routes/supplies.ts` imports

- [ ] **Task 5: Extract `lib/fixed-assets/`**
  - [ ] 5.1 Create `lib/fixed-assets/types.ts`
  - [ ] 5.2 Create `lib/fixed-assets/index.ts` with all fixed-asset functions
  - [ ] 5.3 Update `routes/accounts.ts` imports

- [ ] **Task 6: Create `lib/sync/master-data.ts`**
  - [ ] 6.1 Create `lib/sync/master-data.ts` with `buildSyncPullPayload` + sync helpers
  - [ ] 6.2 Import domain read functions from extracted modules
  - [ ] 6.3 Update `routes/sync/pull.ts` import

- [ ] **Task 7: Delete `lib/master-data.ts`**
  - [ ] 7.1 Verify no remaining imports
  - [ ] 7.2 Delete file

- [ ] **Task 8: Test Validation (AC4)**
  - [ ] 8.1 Run `npm run typecheck -w @jurnapod/api`
  - [ ] 8.2 Run `npm run lint -w @jurnapod/api`
  - [ ] 8.3 Run `npm run test:unit -w @jurnapod/api`

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/item-groups/types.ts` | ItemGroup type definitions |
| `apps/api/src/lib/item-groups/index.ts` | ItemGroup CRUD functions |
| `apps/api/src/lib/items/types.ts` | Item type definitions |
| `apps/api/src/lib/items/index.ts` | Item CRUD functions |
| `apps/api/src/lib/item-prices/types.ts` | ItemPrice type definitions |
| `apps/api/src/lib/item-prices/index.ts` | ItemPrice CRUD + sync functions |
| `apps/api/src/lib/supplies/types.ts` | Supply type definitions |
| `apps/api/src/lib/supplies/index.ts` | Supply CRUD functions |
| `apps/api/src/lib/fixed-assets/types.ts` | FixedAsset type definitions |
| `apps/api/src/lib/fixed-assets/index.ts` | FixedAsset CRUD functions |
| `apps/api/src/lib/sync/master-data.ts` | Sync-specific helpers (buildSyncPullPayload, getCompanyDataVersion) |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/inventory.ts` | Modify | Update imports to domain modules |
| `apps/api/src/routes/supplies.ts` | Modify | Update imports to domain modules |
| `apps/api/src/routes/accounts.ts` | Modify | Update imports to domain modules |
| `apps/api/src/routes/sync/pull.ts` | Modify | Update import to lib/sync/master-data.ts |

## Files to Delete

| File | Description |
|------|-------------|
| `apps/api/src/lib/master-data.ts` | Monolith deleted after extraction complete |

## Dependencies

- Story 2.4 (Sync Pull Kysely Migration) — must complete first (it creates `lib/sync/master-data.ts`)

## Estimated Effort

2-3 days

## Risk Level

Medium (many file moves, must update all callers atomically)
