# Epic 3: Master Data Domain Extraction

**Status:** Done  
**Theme:** Decompose master-data monolith into focused domain modules  
**Dependencies:** Epic 2 (sync master-data.ts extraction)  
**Completed:** 2026-03-26  
**Stories:** 6/6 (100%)

---

## Summary

Epic 3 successfully decomposed the 2,829-line `apps/api/src/lib/master-data.ts` monolith into five focused domain modules: item-groups, items, item-prices, supplies, and fixed-assets. Each module now has a clear public interface, enabling independent development, review, and testing. The monolith was safely deleted after all callers migrated, with zero functional changes and 714/714 tests passing.

---

## Goals

1. **Domain Extraction**: Split master-data monolith into focused domain modules
2. **Caller Migration**: Update all routes and services to use new domain modules
3. **Monolith Deletion**: Remove `lib/master-data.ts` after migration complete
4. **Sync Protocol Preservation**: Maintain POS offline-first guarantees throughout

---

## Stories

| Story | Description | Status | Key Achievement |
|-------|-------------|--------|-----------------|
| 3.1 | Item Groups Domain Extraction | Done | `lib/item-groups/index.ts` created |
| 3.2 | Items Domain Extraction | Done | `lib/items/index.ts` created |
| 3.3 | Item Prices Domain Extraction | Done | `lib/item-prices/index.ts` created |
| 3.4 | Supplies Domain Extraction | Done | `lib/supplies/index.ts` created |
| 3.5 | Fixed Assets Domain Extraction | Done | `lib/fixed-assets/index.ts` created |
| 3.6 | Sync Master Data Finalization | Done | `lib/master-data.ts` deleted |

---

### Story 3.1: Item Groups Domain Extraction

**Status:** Done  
**Description:** Extract item-group CRUD/read logic from master-data monolith into focused domain module.

**Acceptance Criteria:**
- `listItemGroups`, `findItemGroupById`, `createItemGroup`, `createItemGroupsBulk`, `updateItemGroup`, `deleteItemGroup` live in `lib/item-groups/index.ts`
- `routes/inventory.ts` repointed to new module
- Behavior unchanged; all tests pass

**Files Created:**
- `apps/api/src/lib/item-groups/index.ts`

**Files Modified:**
- `apps/api/src/routes/inventory.ts`
- `apps/api/src/lib/master-data.ts`

---

### Story 3.2: Items Domain Extraction

**Status:** Done  
**Description:** Extract item CRUD/read logic from master-data monolith.

**Acceptance Criteria:**
- `listItems`, `findItemById`, `createItem`, `updateItem`, `deleteItem`, `getItemVariantStats` live in `lib/items/index.ts`
- `routes/inventory.ts` repointed to new module
- Tenant scoping and validation preserved

**Files Created:**
- `apps/api/src/lib/items/index.ts`

**Files Modified:**
- `apps/api/src/routes/inventory.ts`
- `apps/api/src/lib/master-data.ts`

---

### Story 3.3: Item Prices Domain Extraction

**Status:** Done  
**Description:** Extract item-price logic from master-data monolith.

**Acceptance Criteria:**
- `listItemPrices`, `listEffectiveItemPricesForOutlet`, `findItemPriceById`, `createItemPrice`, `updateItemPrice`, `deleteItemPrice` live in `lib/item-prices/index.ts`
- Both `routes/inventory.ts` and `lib/sync/master-data.ts` import from domain module
- Outlet override pricing behavior preserved

**Files Created:**
- `apps/api/src/lib/item-prices/index.ts`

**Files Modified:**
- `apps/api/src/routes/inventory.ts`
- `apps/api/src/lib/sync/master-data.ts`
- `apps/api/src/lib/master-data.ts`
- `apps/api/src/lib/master-data.item-prices.test.ts`

---

### Story 3.4: Supplies Domain Extraction

**Status:** Done  
**Description:** Extract supplies CRUD/read logic from master-data monolith.

**Acceptance Criteria:**
- `listSupplies`, `findSupplyById`, `createSupply`, `updateSupply`, `deleteSupply` live in `lib/supplies/index.ts`
- `routes/supplies.ts` repointed to new module
- Conflict/reference error behavior unchanged

**Files Created:**
- `apps/api/src/lib/supplies/index.ts`

**Files Modified:**
- `apps/api/src/routes/supplies.ts`
- `apps/api/src/lib/master-data.ts`
- `apps/api/src/lib/master-data.supplies.test.ts`

---

### Story 3.5: Fixed Assets Domain Extraction

**Status:** Done  
**Description:** Extract fixed-asset and fixed-asset-category logic from master-data monolith.

**Acceptance Criteria:**
- Fixed-asset and fixed-asset-category CRUD/read functions live in `lib/fixed-assets/index.ts`
- `routes/accounts.ts` repointed to new module
- Company/outlet scoping and reference validation preserved
- Coverage gap accepted (addressed in Epic 4)

**Files Created:**
- `apps/api/src/lib/fixed-assets/index.ts`

**Files Modified:**
- `apps/api/src/routes/accounts.ts`
- `apps/api/src/lib/master-data.ts`

---

### Story 3.6: Sync Master Data Finalization

**Status:** Done  
**Description:** Finalize sync master-data assembly against extracted domain modules and delete monolith.

**Acceptance Criteria:**
- `lib/sync/master-data.ts` imports from domain modules (not monolith)
- No remaining imports of `lib/master-data.ts` in API workspace
- `apps/api/src/lib/master-data.ts` deleted
- `lib/master-data-errors.ts` created for shared error classes
- Full API validation passes

**Files Created:**
- `apps/api/src/lib/master-data-errors.ts`

**Files Modified:**
- `apps/api/src/lib/sync/master-data.ts`
- `apps/api/src/lib/item-groups/index.ts`
- `apps/api/src/lib/items/index.ts`
- `apps/api/src/lib/item-prices/index.ts`
- `apps/api/src/lib/supplies/index.ts`
- `apps/api/src/lib/fixed-assets/index.ts`
- `apps/api/src/routes/inventory.ts`
- `apps/api/src/routes/supplies.ts`
- `apps/api/src/routes/accounts.ts`
- `apps/api/src/lib/master-data.thumbnail-sync.test.ts`
- `apps/api/src/lib/master-data.supplies.test.ts`

**Files Deleted:**
- `apps/api/src/lib/master-data.ts`

---

## Acceptance Criteria

### AC1: Domain Extraction
- [x] Item-groups module extracted with clear public interface
- [x] Items module extracted with clear public interface
- [x] Item-prices module extracted with clear public interface
- [x] Supplies module extracted with clear public interface
- [x] Fixed-assets module extracted with clear public interface

### AC2: Caller Migration
- [x] `routes/inventory.ts` migrated to domain modules
- [x] `routes/supplies.ts` migrated to domain modules
- [x] `routes/accounts.ts` migrated to domain modules
- [x] `lib/sync/master-data.ts` migrated to domain modules

### AC3: Monolith Deletion
- [x] `lib/master-data.ts` deleted
- [x] `lib/master-data-errors.ts` created for shared error classes
- [x] Zero remaining imports of deleted monolith

### AC4: Quality Preservation
- [x] 714/714 tests passing
- [x] Type check passes
- [x] Lint passes
- [x] Sync protocol integrity maintained
- [x] POS offline-first guarantees preserved

---

## Outcomes

### Completed Deliverables

| Deliverable | Description | Status |
|-------------|-------------|--------|
| Item Groups Module | Focused domain module | Done |
| Items Module | Focused domain module | Done |
| Item Prices Module | Focused domain module | Done |
| Supplies Module | Focused domain module | Done |
| Fixed Assets Module | Focused domain module | Done |
| Master Data Monolith | Deleted after migration | Done |

### Quality Metrics

| Metric | Value |
|--------|-------|
| Stories Completed | 6/6 (100%) |
| Tests Passing | 714/714 (100%) |
| Type Check | Pass |
| Build | Pass |
| Lint | Pass |
| Monolith Lines Eliminated | ~2,829 |
| Domain Modules Created | 5 |

---

## Architecture After Extraction

```
apps/api/src/lib/
├── item-groups/
│   └── index.ts      # Item group CRUD/read
├── items/
│   └── index.ts      # Item CRUD/read + variant stats
├── item-prices/
│   └── index.ts      # Price CRUD/read + effective pricing
├── supplies/
│   └── index.ts      # Supply CRUD/read
├── fixed-assets/
│   └── index.ts      # Fixed asset CRUD/read
├── sync/
│   └── master-data.ts # Sync assembly (imports from domains)
└── master-data-errors.ts # Shared error classes
```

---

## Key Patterns Established

### 1. Domain Module Structure

Each domain module exports:
- CRUD operations: `list*`, `find*ById`, `create*`, `update*`, `delete*`
- Domain-specific helpers (e.g., `getItemVariantStats`)
- Module-specific validators (e.g., `ensureCompanyItemExists`)

### 2. Shared Utilities Deferred

~80% helper duplication accepted temporarily:
- `withTransaction` in each module
- `isMysqlError` in each module
- Error code constants in each module

**Resolution:** Addressed in Epic 4 (Story 4.1)

### 3. Sync Protocol Preservation

Throughout extraction:
- `client_tx_id` idempotency unchanged
- Offline-first guarantees maintained
- Conflict resolution behavior preserved

---

## Dependencies

| Dependency | Epic | Status | Notes |
|------------|------|--------|-------|
| Sync master-data extraction | Epic 2 | Done | `lib/sync/master-data.ts` already extracted |
| Kysely migration patterns | Epic 1-2 | Done | Proven for domain modules |

---

## Lessons Learned

### Technical Lessons

1. **Extraction-first, abstraction-second is valid**: Domain isolation prioritized over shared-helper abstraction
2. **Module-specific validators stay in modules**: `ensureCompanyItemExists` only needed in items + item-prices
3. **Shared error classes need shared location**: `master-data-errors.ts` created after extraction

### Process Lessons

1. **Domain extraction needs route-level test expectations**: Fixed-assets coverage gap accepted; future extractions should require minimum coverage
2. **Sync protocol changes need explicit validation criteria**: Any sync-touching story needs idempotency/conflict resolution AC
3. **Database compatibility is non-negotiable overhead**: MySQL/MariaDB dual-support adds ~20% effort
4. **Architectural epics need product narrative**: Stakeholder communication improved in Epic 4.3

---

## Risks Encountered

| Risk | Severity | Status | Mitigation |
|------|----------|--------|------------|
| Helper duplication across modules | Medium | Deferred to Epic 4 | P1 action item created |
| Fixed-assets coverage gap | Medium | Deferred to Epic 4 | P1 action item created |
| Story 3.6 scope growth | Medium | Managed | Extended timeline accepted |

---

## Next Epic Preparation

**Epic 4:** Technical Debt Cleanup & Process Improvement

**Epic 3 Action Items (addressed in Epic 4):**
- P1: Extract shared master-data utilities → Story 4.1
- P1: Backfill fixed-assets route tests → Story 4.2
- P1: Document Epic 3 product enablement → Story 4.3
- P2: Add test-coverage gates to story template → Story 4.4
- P2: Create sync protocol validation checklist → Story 4.4

---

## Retrospective Reference

Full retrospective available at: `epic-3-retro-2026-03-26.md`

Product enablement document: `docs/product/epic-3-product-enablement.md`

---

## Definition of Done Verification

- [x] All Acceptance Criteria implemented with evidence
- [x] No remaining imports of deleted monolith
- [x] Code follows repo-wide operating principles
- [x] No breaking changes without cross-package alignment
- [x] Unit tests written and passing (714 tests)
- [x] Error path/happy path testing completed
- [x] Code review completed
- [x] AI review conducted
- [x] Schema changes documented (N/A - no schema changes)
- [x] API contracts preserved
- [x] Feature is deployable
- [x] Completion evidence documented

---

*Epic 3 completed successfully. Ready for Epic 4 cleanup.*
