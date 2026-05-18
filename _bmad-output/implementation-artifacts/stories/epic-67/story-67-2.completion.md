# Story 67-2 Completion Report

**Story:** Items List and Detail
**Epic:** 67 - Backoffice Frontend Hardening: Catalog Operations
**Status:** DONE
**Completed:** 2026-05-18
**Owner Sign-off:** Ahmad — Approved 2026-05-18

---

## Summary

Story 67-2 implements the items management list/detail surface with the shared catalog `EntityTable`, `FilterBar`, and `DetailDrawer` primitives prepared in Story 67-1. The implementation preserves the existing item operations surface while replacing the inline table with a canonical list/detail flow, adding a detail route, TanStack Query data hooks, create/edit/deactivate mutations, and canonical `inventory.items` permission-gated UX actions.

The reviewer/QA recommendation is **GO with tracked P2 follow-ups**. Owner sign-off received — story marked DONE.

---

## Files Created/Modified

### Created

| File | Description |
|------|-------------|
| `apps/backoffice/src/features/items/item-list.tsx` | EntityTable/mobile-card based items list, filters, detail drawer trigger, action gating helpers. |
| `apps/backoffice/src/features/items/item-form.tsx` | Shared create/edit item form helpers and UI. |
| `apps/backoffice/src/features/items/item-detail-drawer.tsx` | Item detail drawer content and read/edit/deactivate actions. |
| `apps/backoffice/src/features/items/item-detail-page.tsx` | Full item detail route/page with general info, pricing summary, type-specific sections, and audit link. |
| `apps/backoffice/src/hooks/use-items-query.ts` | TanStack Query item list hook with current API compatibility fallback. |
| `apps/backoffice/src/hooks/use-item-detail.ts` | TanStack Query item detail hook. |
| `apps/backoffice/src/hooks/use-create-item.ts` | Create item mutation with list invalidation. |
| `apps/backoffice/src/hooks/use-update-item.ts` | Update/deactivate item mutation with list/detail invalidation. |
| `apps/backoffice/__test__/unit/features/inventory/items-query-hooks.test.ts` | Query param, fallback filtering, pagination, and response normalization tests. |
| `apps/backoffice/__test__/unit/features/inventory/item-form.test.ts` | Form validation and API error mapping tests. |
| `apps/backoffice/__test__/unit/features/inventory/item-list.test.ts` | Catalog row mapping and action availability tests. |

### Modified

| File | Changes |
|------|---------|
| `apps/backoffice/src/features/items-page.tsx` | Replaced inline items table section with `ItemList`; preserved ImportWizard, ExportDialog, ImageUpload, ItemBarcodeManager, ItemImageGallery, RecipeCompositionEditor, VariantManager, and modal flows. |
| `apps/backoffice/src/app/router.tsx` | Added `/items/:id` detail route rendering. |
| `apps/backoffice/src/app/routes.ts` | Mapped numeric item detail routes to `/items` permission metadata. |
| `apps/backoffice/src/features/pages.tsx` | Exported item detail page for lazy route loading. |
| `apps/backoffice/__test__/unit/app-router-guards-permissions.test.ts` | Added route guard coverage for `/items/:id` inheriting `inventory.items.READ`. |
| `apps/backoffice/src/components/data-grid/EntityTable.tsx` | Retained Story 67-1 column visibility behavior and fixed lint/compiler hook findings during Story 67-2 validation. |
| `apps/backoffice/vitest.config.ts` | Included Story 67 inventory unit test paths. |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Updated Story 67-2 to `done`. |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Items list with pagination and default page size 25 | ✅ Complete with frontend compatibility fallback; backend server-side enhancement tracked as TD-041. |
| AC2 | Search and filter by SKU/name, type, and status | ✅ Complete with request params and client fallback for current backend response shape. |
| AC3 | Sort integration | ✅ Complete with table sort state and client fallback sorting. |
| AC4 | Detail drawer with SKU, name, type, status, item group, and full detail link | ✅ Complete. |
| AC5 | Detail page with general info, pricing summary, type-specific sections, and audit trail link | ✅ Complete; full detail mutation affordance is tracked as TD-042 UX follow-up. |
| AC6 | Create item | ✅ Complete via `POST /api/inventory/items` and list invalidation. |
| AC7 | Edit item | ✅ Complete via `PATCH /api/inventory/items/:id` and list/detail invalidation. |
| AC8 | Deactivate item with `PATCH { is_active: false }` | ✅ Complete; implementation does not call `DELETE`. |
| AC9 | Type-specific detail display | ✅ Complete for PRODUCT, INGREDIENT, and RECIPE summary states. |
| AC10 | Permission gating | ✅ Complete with canonical `inventory.items` CREATE/UPDATE/DELETE gates as frontend UX aids. |
| AC11 | Mobile viewport cards and create FAB | ✅ Complete with mobile cards, detail drawer tap behavior, action menu propagation fix, and mobile create FAB. |

---

## Key Features Implemented

### Items List and Filters
- EntityTable-backed desktop table with pagination, sorting, status, type, group, and search state.
- Mobile card layout with essential item information and detail drawer tap behavior.
- URL-neutral FilterBar usage for the catalog list section.

### Detail and Mutation Flow
- Detail drawer fetches detail data when opened and links to `/items/:id`.
- Full detail route inherits `/items` route permission metadata.
- Create/edit forms share validation, account selector options, and API error mapping.
- Deactivation uses `PATCH /inventory/items/:id` with `{ is_active: false }`.

### Preserved Capabilities
- Import wizard remains available behind CREATE gate.
- Export dialog remains available with current filter and estimated row count state.
- Barcode, image upload/gallery, recipe composition, and variant management flows remain wired through item row actions.

---

## Technical Implementation

### Data Flow

```text
Filter/sort/page change → useItemsQuery params → API request → response normalization → EntityTable/mobile cards
Create/edit/deactivate → TanStack mutation → query invalidation → ItemList refetch
Row/name/card click → detail drawer → optional detail fetch → full detail link
```

### API Endpoints Used
- `GET /api/inventory/items` — List items; current backend supports `is_active`, frontend sends future-compatible query params and applies client fallback.
- `GET /api/inventory/items/:id` — Item detail.
- `POST /api/inventory/items` — Create item.
- `PATCH /api/inventory/items/:id` — Update item and deactivate via `{ is_active: false }`.

### State Management
- TanStack Query owns list/detail data and create/update mutations for Story 67 scope.
- Existing CacheService `useItems` hook remains untouched for non-Epic-67 consumers.
- Local component state owns list filters, pagination, sort, selected detail item, and modal state.

### Security
- Backend ACL remains authoritative.
- Frontend UX gates use canonical `inventory.items` actions from resolved effective permissions.
- `/items/:numericId` route resolves to `/items` route permission metadata for READ access.

---

## Code Quality

| Check | Result | Evidence |
|-------|--------|----------|
| ESLint | ✅ Passes | `logs/story-67-2-lint-r5.log` |
| Focused Unit Tests | ✅ Passes | `logs/story-67-2-focused-tests-r4.log` — 5 files, 92 tests |
| TypeScript | ✅ Passes | `logs/story-67-2-typecheck-r5.log` |
| Build | ✅ Successful | `logs/story-67-2-build-r4.log` |
| Sprint Status Validation | ✅ Passes | `npx tsx scripts/validate-sprint-status.ts` |
| Diff Whitespace | ✅ Passes | `git diff --check` |

---

## Known Limitations and Follow-ups

| ID | Severity | Limitation | Tracking |
|----|----------|------------|----------|
| TD-041 | P2 | Backend `GET /api/inventory/items` does not yet provide true server-side pagination/search/type/group/sort semantics. The frontend fallback is acceptable for Story 67-2 but may degrade on large catalogs. | `docs/adr/TECHNICAL-DEBT.md` |
| TD-042 | P2 | Full item detail page is read-oriented and does not expose edit/deactivate affordances; product/UX MUST confirm whether detail-page actions are required. | `docs/adr/TECHNICAL-DEBT.md` |

---

## Testing Performed

- ✅ Query helpers build Story 67-2 list params and normalize server-paginated and legacy array responses.
- ✅ Client fallback filters by search/type/status/group and paginates current array responses.
- ✅ Item form validates name/type and maps duplicate SKU/permission errors.
- ✅ Item list row mapping preserves group and variant metadata.
- ✅ Item action availability hides write/deactivate actions for READ-only users.
- ✅ Route guard tests confirm `/items/:id` inherits `inventory.items.READ` metadata.
- ✅ EntityTable column visibility/mobile behavior remains covered after lint cleanup.

---

## Review / QA Outcome

### QA Review Result

**Decision:** GO with tracked P2 follow-ups. Owner approved.

| Severity | Finding | Resolution |
|----------|---------|------------|
| P0 | None | No action required. |
| P1 | None | No action required. |
| P2 | Backend server-side list semantics incomplete for large catalogs. | Tracked as TD-041. |
| P2 | Full detail page mutation affordances require product confirmation. | Tracked as TD-042. |
| P2 | Component-level drawer/detail-page rendering tests can be expanded. | Accepted as non-blocking for current frontend unit scope. |
| P3 | Query builder sends both `status` and `is_active`. | Accepted compatibility bridge until backend contract is finalized. |

### Owner Sign-off

- ✅ Ahmad approved 2026-05-18.
- Story marked DONE via canonical utility.

---

## API Gaps Encountered

| Gap | Discovered | Resolution |
|-----|------------|------------|
| Item list API only honors `is_active` in current backend route. | Story 67-2 implementation review | Frontend sends future-compatible params and applies client fallback; server-side API support tracked as TD-041. |

---

## Dev Notes

### Pattern Consistency
- Uses Story 67-1 catalog primitives: `EntityTable`, `FilterBar`, `DetailDrawer`, catalog table/filter configs.
- Adds TanStack Query hooks alongside existing CacheService hook instead of replacing `useItems` globally.
- Keeps backend/API unchanged under Epic 67 frontend scope constraints.

### Cleanup Pass
- Fixed lint/compiler hook findings in touched `EntityTable.tsx` area.
- Fixed mobile menu event propagation in touched `ItemList` area.
- Preserved existing item capabilities during extract-and-replace migration.

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-18 | 1.0 | Initial Story 67-2 implementation and validation. |
| 2026-05-18 | 1.1 | Added permission action helper tests, mobile menu propagation fix, lint cleanup, and tracked P2 follow-ups. |

---

**Story has reviewer/QA GO. Story is NOT marked DONE until owner sign-off is explicit.**
