# Story 67-2: Items List and Detail

Status: done

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 67 --story 67-2 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **company admin or inventory manager**,  
I want **to view and manage items in a data-dense list with quick detail inspection**,  
So that **I can efficiently browse, search, and edit the product catalog**.

## Context

This story implements the items management surface using the shared primitives configured in Story 67-1. It replaces the existing `items-page.tsx` inline table implementation with the canonical EntityTable/FilterBar/DetailDrawer pattern.

The items domain includes: SKU, name, type (PRODUCT/INGREDIENT/RECIPE/SERVICE), status (active/inactive), item group, tax category, and unit of measure. Pricing information is shown as read-only summary in the detail drawer; full pricing management is Story 67-3.

**Dependencies:** Story 67-1 (EntityTable, FilterBar, DetailDrawer configurations), Epic 65 (typed API client)

**Backend endpoints:**
- `GET /api/inventory/items` — List with pagination, search, filter
- `GET /api/inventory/items/:id` — Single item detail
- `POST /api/inventory/items` — Create item
- `PATCH /api/inventory/items/:id` — Update item
- `DELETE /api/inventory/items/:id` — Hard delete item (use with caution)
- Deactivation uses `PATCH /api/inventory/items/:id` with `{ is_active: false }` (see AC8)

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** List loads with pagination; search filters by SKU/name; create item refreshes list; detail drawer shows item info
- [ ] **Error paths identified:** API failure shows error; validation errors on create/edit; duplicate SKU rejected; permission denied (403)
- [ ] **Edge cases identified:** Empty catalog; very long SKU/name; special characters in search; concurrent edits; item with no SKU
- [ ] **Test fixture needs identified:** Test items with various types and statuses; test item groups; test accounts for COGS/inventory asset
- [ ] **Integration test scope defined:** API integration tests with real DB for CRUD; UI unit tests with mock API
- [ ] **Negative auth test role selected:** `CASHIER` for write operations (CASHIER has READ on inventory per canonical ACL)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Items list loads with server-side pagination | Happy | Integration (real DB) |
| Search by SKU prefix returns filtered results | Happy | Integration |
| Create item and list auto-refreshes | Happy | Integration |
| Detail drawer shows item type-specific info | Happy | Unit |
| PRODUCT item shows pricing summary | Happy | Unit |
| INGREDIENT item shows stock tracking status | Happy | Unit |
| Deactivate item shows "Inactive" status chip | Happy | Integration |
| Duplicate SKU rejected with validation error | Error | Integration |
| CASHIER cannot create items (403) | Error | Integration |
| Empty catalog shows Empty state | Edge | Unit |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes: `InventoryConflictError`, `InventoryReferenceError`, `DatabaseConflictError` from `@jurnapod/modules-inventory`
- [ ] Consumer catch paths: Form validation displays field-level errors; API errors show Alert
- [ ] Fallback handling: `error.message` for unknown errors
- [ ] Error response mapping: 409 → "SKU already exists"; 422 → validation errors; 403 → permission denied

### Verified Error Paths

| Producer Error | Consumer Handling | Fallback |
|----------------|-------------------|----------|
| `InventoryConflictError` (duplicate SKU) | Form shows SKU field error | Generic "Item already exists" |
| `InventoryReferenceError` (invalid group) | Form shows group field error | Generic "Invalid reference" |
| `DatabaseForbiddenError` (no permission) | Page shows 403 Alert | Generic "Access denied" |

---

## Acceptance Criteria

### AC1: Items list with server-side pagination
**Given** the items page  
**When** it loads  
**Then** EntityTable displays items from `GET /api/inventory/items`  
**And** server-side pagination controls are functional  
**And** default page size is 25 rows

### AC2: Search and filter
**Given** the FilterBar  
**When** searching by SKU prefix "PROD-"  
**Then** the API request includes `search=PROD-`  
**And** only matching items are displayed  

**Given** the FilterBar  
**When** filtering by type "PRODUCT"  
**Then** only PRODUCT items are displayed  

**Given** the FilterBar  
**When** filtering by status "Active"  
**Then** only active items are displayed

### AC3: Sort integration
**Given** the items table  
**When** clicking the "Name" column header  
**Then** items are sorted by name ascending  
**When** clicking again  
**Then** items are sorted by name descending

### AC4: Detail drawer
**Given** a row is clicked  
**When** the click occurs  
**Then** DetailDrawer opens showing: SKU, Name, Type, Status, Item Group  
**And** a "View Full Detail" link navigates to the detail page

> **Note:** Tax Category and Unit of Measure are shown on the detail page only if present in the backend item schema (P2-11 Fix). Verify `GET /api/inventory/items/:id` response includes these fields before displaying.

### AC5: Detail page
**Given** navigation to an item detail page  
**When** the page loads  
**Then** it shows: General Info card, Pricing section (read-only summary), Recipe Ingredients (read-only if RECIPE type), Audit Trail link

### AC6: Create item
**Given** the "Create Item" button is clicked  
**When** the form is submitted with valid data  
**Then** `POST /api/inventory/items` is called  
**And** the list automatically refreshes  
**And** the new item appears in the table

### AC7: Edit item
**Given** the edit action is triggered (from drawer or detail page)  
**When** the form is submitted with valid changes  
**Then** `PATCH /api/inventory/items/:id` is called  
**And** the list/detail refreshes with updated data

### AC8: Deactivate item
**Given** an active item  
**When** the deactivate action is confirmed  
**Then** `PATCH /api/inventory/items/:id` is called with `{ is_active: false }`  
**And** the item status changes to "Inactive"  
**And** the status chip shows "Inactive" in the table  
**And** the item is excluded from POS/catalog by default  
**And** the item record is preserved in the database (soft deactivate, not hard delete)

### AC9: Type-specific display
**Given** a PRODUCT item  
**When** viewing detail  
**Then** pricing info and default price are shown  

**Given** an INGREDIENT item  
**When** viewing detail  
**Then** stock tracking status is shown  

**Given** a RECIPE item  
**When** viewing detail  
**Then** recipe ingredients are shown (read-only)

### AC10: Permission gating
**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'CREATE' })` returning true  
**Then** the "Create Item" button is visible  

**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'CREATE' })` returning false  
**Then** the "Create Item" button is hidden  

**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'UPDATE' })` returning true  
**Then** edit actions are visible  

**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'UPDATE' })` returning false  
**Then** edit actions are hidden  

**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'DELETE' })` returning true  
**Then** deactivate actions are visible  

**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'DELETE' })` returning false  
**Then** deactivate actions are hidden

### AC11: Mobile viewport (P2-10 Fix)
**Given** a mobile viewport (width <= 48em)  
**When** the items page loads  
**Then** items render as cards with: name, SKU, type badge, status chip  
**And** tapping a card opens the detail drawer  
**And** the create button is a floating action button (FAB)  
**And** filters collapse to a single search field with filter toggle

---

## Technical Notes

### Files to Modify
- `apps/backoffice/src/features/items-page.tsx` — Extract table section into new `ItemList` component; preserve all other features (import wizard, export dialog, image upload, barcode manager, variant manager, recipe editor)
- `apps/backoffice/src/hooks/use-items.ts` — Keep existing CacheService hook for other consumers; create new `useItemsQuery.ts` for TanStack Query

### Migration Strategy (P1-3 Fix)
**Approach:** Extract-and-replace, not complete rewrite.
1. Create new `ItemList` component using EntityTable
2. Replace only the table section in `items-page.tsx`
3. Preserve: ImportWizard, ExportDialog, ImageUpload, ItemBarcodeManager, ItemImageGallery, RecipeCompositionEditor, VariantManager, and all modals
4. Stories 67-4 and 67-5 will replace ImportWizard and ExportDialog respectively

### Files to Create
- `apps/backoffice/src/features/items/item-list.tsx` — EntityTable-based item list
- `apps/backoffice/src/features/items/item-detail-page.tsx` — Full item detail page
- `apps/backoffice/src/features/items/item-form.tsx` — Create/edit form
- `apps/backoffice/src/features/items/item-detail-drawer.tsx` — DetailDrawer content
- `apps/backoffice/src/hooks/use-item-detail.ts` — TanStack Query hook for single item
- `apps/backoffice/src/hooks/use-create-item.ts` — TanStack Query mutation for create
- `apps/backoffice/src/hooks/use-update-item.ts` — TanStack Query mutation for update
- `apps/backoffice/src/hooks/use-items-query.ts` — NEW TanStack Query hook for item list (leaves existing `useItems` untouched)
- `apps/backoffice/src/__test__/integration/items/item-crud.test.tsx` — CRUD integration tests
- `apps/backoffice/src/__test__/unit/items/item-form.test.tsx` — Form unit tests

### CacheService Migration Plan (P2-12 Fix)
- **Phase 1 (this story):** Create `useItemsQuery.ts` with TanStack Query; use only in Epic 67 scope pages
- **Phase 2 (future):** Audit all `useItems` consumers; migrate incrementally per epic
- **Phase 3 (future):** Deprecate and remove `useItems` (CacheService) when all consumers migrated
- **Risk mitigation:** Both hooks coexist; no breaking changes to existing consumers

### API Contracts
- `GET /api/inventory/items?page=1&limit=25&search=SKU-123&sort_by=name&sort_order=asc&type=PRODUCT&status=true`
- Response: `{ items: Item[], total: number, page: number, limit: number }`
- `POST /api/inventory/items` — Body: `ItemCreateRequest`
- `PATCH /api/inventory/items/:id` — Body: partial `ItemCreateRequest` (including `{ is_active: false }` for deactivation)
- Deactivation uses `PATCH`, never `DELETE` (backend DELETE performs hard delete)

### Permission Requirements
All permission checks use canonical `requireAccess({ module, resource, permission })` format per Epic 39:
- `requireAccess({ module: 'inventory', resource: 'items', permission: 'READ' })` — View list and detail
- `requireAccess({ module: 'inventory', resource: 'items', permission: 'CREATE' })` — Create new items
- `requireAccess({ module: 'inventory', resource: 'items', permission: 'UPDATE' })` — Edit existing items
- `requireAccess({ module: 'inventory', resource: 'items', permission: 'DELETE' })` — Deactivate items

### State Management
- TanStack Query `useQuery` for list and detail fetching
- TanStack Query `useMutation` for create/update with automatic cache invalidation
- URL query params synced with filter/sort/pagination state

---

## Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R67-2-001 | P1 | Existing `useItems` hook uses CacheService (IndexedDB) not TanStack Query | Create NEW `useItemsQuery.ts` with TanStack Query; leave existing hook untouched for other consumers (P2-12 Fix) |
| R67-2-002 | P2 | Recipe ingredients display requires recipe data that may not be in item API | Fetch recipe data separately or show "Recipe details available on detail page" |
| R67-2-003 | P2 | Item images and barcodes are managed in separate features | Keep image/barcode management in existing modals; extract-and-replace table only (P1-3 Fix) |
| R67-2-004 | P1 | Backend DELETE is hard delete, not deactivate | Use PATCH with `is_active: false` for deactivation (P1-1 Fix) |

---

## Story Points
**8 points** (medium-high complexity — CRUD surface with type-specific display)

---

## Definition of Done

- [ ] All acceptance criteria implemented with evidence
- [ ] Integration tests for API CRUD operations (real DB)
- [ ] Unit tests for form validation and UI states
- [ ] Permission gating verified with CASHIER negative tests
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run build -w @jurnapod/backoffice` passes
- [ ] Code review completed with no blockers
- [ ] Story completion report created (`story-67.2.completion.md`) with reviewer GO and owner sign-off

---

_Last Updated: 2026-05-18_
