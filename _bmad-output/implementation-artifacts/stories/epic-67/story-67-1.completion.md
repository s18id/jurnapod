# Story 67-1 Completion Report: Catalog Table Configurations and Primitive Integration

**Status:** DONE ✅  
**Story:** 67-1-catalog-table-configurations  
**Epic:** 67 — Backoffice Catalog Operations  
**Review Date:** 2026-05-18  
**Reviewer Sign-off:** GO (zero P0/P1/P2 blockers)  
**Owner Sign-off:** Approved  

---

## Acceptance Criteria Evidence

### AC1: EntityTable renders catalog columns
✅ Implemented in `catalog-table-config.ts`:
- `catalogItemColumns` with: SKU, Name, Type, Status, Updated At, Group, Stock
- `catalogPriceColumns` with: Item, SKU, Scope, Price, Status, Updated At, Group
- All columns have `id`, `header`, and `cell` definitions
- Sortable columns marked with `sortable: true`

### AC2: FilterBar debounces search
✅ Implemented in `catalog-filter-config.ts`:
- `CATALOG_FILTER_DEBOUNCE_MS = 300` (imported from shared `FilterBar` constant)
- `createCatalogItemFilterSchema()` and `createCatalogPriceFilterSchema()` define search fields
- `toCatalogQueryParams()` normalizes filter values to API query params

### AC3: Sort integration
✅ Column definitions include `sortable: true` on sortable columns (SKU, Name, Type, Status, Updated At, Price)
- Verified in config tests that sortable metadata is present

### AC4: Column chooser persistence
✅ Implemented in `EntityTable.tsx`:
- `EntityTableColumnVisibilityConfig` with `storageKey`, `version`, `defaultVisibleColumnIds`
- Storage key format: `jurnapod.catalog.{entityType}.columns.v{version}`
- Version mismatch resets to defaults
- `readEntityTableColumnVisibility()` and `writeEntityTableColumnVisibility()` helpers
- Safe `setItem` with try/catch (quota/private mode failures don't crash)

### AC5: DetailDrawer integration
✅ Implemented in `catalog-detail-content.tsx`:
- `CatalogItemDetailContent` component for item detail drawer
- `CatalogPriceDetailContent` component for price detail drawer
- `getCatalogItemDetailFields()` and `getCatalogPriceDetailFields()` mappers
- `CatalogDetailFields` shared layout component

### AC6: Empty and error states
✅ Not modified — existing `DataTable` empty/error states preserved
- `DataTable` already renders Mantine Empty state and Alert for errors
- No regression introduced

### AC7: Row selection and bulk actions
✅ Implemented in `catalog-table-config.ts`:
- Selection column (`isSelection: true`) in item and price column definitions
- `catalogItemBulkActions`: export, activate, deactivate
- `catalogPriceBulkActions`: export, deactivate

### AC8: No duplicate implementations
✅ Verified:
- Existing `items-page.tsx` and `prices-page.tsx` NOT rewritten
- New config files created in `features/inventory/` directory
- Extract-and-replace approach used per review guidance

### AC9: ScopeBadge integration
✅ Implemented in `catalog-table-config.ts` and `catalog-detail-content.tsx`:
- Price scope label: `outlet_id === null ? "Default" : "Outlet: {name}"`
- `ScopeBadge` rendered with green for Default, blue for Outlet
- `renderPriceScopeSummary()` helper exported

### AC10: Mobile viewport adaptation
✅ Implemented in `EntityTable.tsx`:
- `isMobileViewport` prop filters to `essentialColumnIds` only
- Column chooser hidden on mobile (`hideChooserOnMobile: true`)
- Mobile essential columns defined in config metadata
- Component-level test verifies mobile behavior

---

## Test Evidence

### Unit Tests: 23/23 passed

| Test File | Tests | Status |
|-----------|-------|--------|
| `catalog-table-config.test.ts` | 8 | ✅ PASS |
| `catalog-filter-config.test.ts` | 6 | ✅ PASS |
| `catalog-detail-content.test.tsx` | 5 | ✅ PASS |
| `entity-table-column-visibility.test.tsx` | 4 | ✅ PASS |

### Build Verification
- `npm run typecheck -w @jurnapod/backoffice` ✅ PASS
- `npm run build -w @jurnapod/backoffice` ✅ PASS (11.72s)

---

## Review History

### Initial Review (2026-05-18)
**Decision:** NO-GO — 4 P1, 8 P2, 3 P3 findings

**Key P1 findings resolved:**
1. AC8 referenced DELETE for deactivate → Changed to PATCH with `is_active: false`
2. Session retry claimed "no re-upload" but session in React state only → Changed to sessionStorage
3. "Complete rewrite" of items-page.tsx → Changed to extract-and-replace
4. Assumed EntityTable stability → Added explicit preconditions

### Re-review (2026-05-18)
**Decision:** GO with P2/P3 follow-ups

**P2 fixed:** Added component-level EntityTable tests for column chooser, persistence, mobile behavior
**P3 fixed:** Hardened EntityTable config stability with schema signatures
**P3 documented:** Raw `updated_at` formatting deferred to Story 67-2/67-3

### Final Review (2026-05-18)
**Decision:** GO — zero P0/P1/P2 blockers

---

## Files Changed

### Created
- `apps/backoffice/src/features/inventory/catalog-table-config.ts`
- `apps/backoffice/src/features/inventory/catalog-filter-config.ts`
- `apps/backoffice/src/features/inventory/catalog-detail-content.tsx`
- `apps/backoffice/__test__/unit/features/inventory/catalog-table-config.test.ts`
- `apps/backoffice/__test__/unit/features/inventory/catalog-filter-config.test.ts`
- `apps/backoffice/__test__/unit/features/inventory/catalog-detail-content.test.tsx`
- `apps/backoffice/__test__/unit/components/data-grid/entity-table-column-visibility.test.tsx`

### Modified
- `apps/backoffice/src/components/data-grid/EntityTable.tsx`
- `apps/backoffice/src/components/data-grid/index.ts`
- `apps/backoffice/vitest.config.ts`
- `_bmad-output/implementation-artifacts/stories/epic-67/story-67-1.md`

---

## Risk Register (Post-Completion)

| Risk | Severity | Status |
|------|----------|--------|
| Existing pages have deep integration with old table components | P2 | Mitigated — extract-and-replace approach preserved existing pages |
| Column chooser localStorage schema conflicts | P2 | Mitigated — versioned keys with reset on mismatch |
| Mobile viewport feature set | P2 | Mitigated — essential columns + chooser hidden on mobile |

---

## Follow-Up Items

1. **Story 67-2/67-3:** Canonical date formatting for `updated_at` fields
2. **Story 67-2:** Integrate `CatalogItemDetailContent` into items page detail drawer
3. **Story 67-3:** Integrate `CatalogPriceDetailContent` into prices page detail drawer

---

_Signed off by reviewer and story owner on 2026-05-18_
