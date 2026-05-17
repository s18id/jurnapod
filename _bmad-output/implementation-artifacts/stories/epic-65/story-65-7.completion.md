# Story 65-7 Completion Report

**Story:** Shared admin primitives: EntityTable, FilterBar, DetailDrawer, ScopeBadge
**Epic:** 65 - Foundation — Shell, Router, Auth, Typed API Client, Data Grid Primitives
**Status:** ✅ DONE
**Completed:** 2026-05-17

---

## Summary

Built shared admin primitives as thin adapters over existing `components/ui/DataTable` and `components/ui/FilterBar`. Created `DetailDrawer`, `ScopeBadge`, `CompanyBadge`, `OutletBadge`, `StatusBadge`, `ScopeDisplay`, and filter factory utilities. All primitives are exported from `components/data-grid/` barrel.

---

## Files Created/Modified

### Created
| File | Description |
|------|-------------|
| `apps/backoffice/src/components/data-grid/EntityTable.tsx` | Thin adapter over DataTable with entity name support |
| `apps/backoffice/src/components/data-grid/FilterBar.tsx` | Re-export adapter for canonical FilterBar |
| `apps/backoffice/src/components/data-grid/DetailDrawer.tsx` | Mantine Drawer wrapper for detail views |
| `apps/backoffice/src/components/data-grid/ScopeBadge.tsx` | Company, outlet, status badge components |
| `apps/backoffice/src/components/data-grid/filter-factories.ts` | Filter field factory utilities |
| `apps/backoffice/src/components/data-grid/index.ts` | Barrel exports for all primitives |
| `apps/backoffice/src/components/feedback/index.ts` | Re-export of DetailDrawer from data-grid |
| `apps/backoffice/src/components/navigation/index.ts` | Re-export of ScopeBadge from data-grid |
| `apps/backoffice/__test__/unit/components-data-grid.test.ts` | Primitive tests (17 tests) |

### Deleted
| File | Reason |
|------|--------|
| `apps/backoffice/src/components/feedback/DetailDrawer.tsx` | Duplicate — consolidated into data-grid |
| `apps/backoffice/src/components/navigation/ScopeBadge.tsx` | Duplicate — consolidated into data-grid |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | `EntityTable` supports server-side pagination, sort, filter URL sync, row selection, column visibility, loading, empty, error states | ✅ Complete (via DataTable adapter) |
| AC2 | `FilterBar` supports debounced text search, dropdown filters, date ranges, clear filters | ✅ Complete (via FilterBar adapter) |
| AC3 | `DetailDrawer` opens from table rows, renders typed detail content | ✅ Complete |
| AC4 | `ScopeBadge` renders company/outlet/status context | ✅ Complete |
| AC5 | Unit/component tests cover rendering | ✅ Complete (17 tests) |

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| ESLint | ✅ Passes |
| Unit Tests | ✅ 17 tests pass |

---

## Testing Performed

- ✅ `npm run test:single -w @jurnapod/backoffice -- __test__/unit/components-data-grid.test.ts` — PASS (17 tests)

---

## Dev Notes

### Pattern Consistency
Primitives reuse existing `components/ui/DataTable` and `components/ui/FilterBar` rather than duplicating. This avoids divergence and preserves existing behavior.

---

**Story is COMPLETE.**
