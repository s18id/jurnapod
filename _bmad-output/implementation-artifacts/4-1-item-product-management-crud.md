# Story 4.1: Item/Product Management (CRUD)

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **store manager**,
I want to **create and manage items in the catalog**,
So that **products are available for sale at POS**.

## Acceptance Criteria

1. **Given** store manager  
   **When** they create a new item with name, SKU, and type, then assign at least one active price record  
   **Then** item is saved and available for POS

2. **Given** existing items  
   **When** manager searches/browses the catalog  
   **Then** items are displayed with name, SKU, price, status

3. **Given** item details  
   **When** manager updates item information  
   **Then** changes are saved and reflected at POS

4. **Given** item no longer sold  
   **When** manager deactivates the item  
   **Then** item is hidden from POS but preserved in historical transactions

## Tasks / Subtasks

- [x] Task 1: Verify existing item CRUD implementation (AC: #1, #2, #3, #4)
  - [x] Subtask 1.1: Review API endpoints for completeness
  - [x] Subtask 1.2: Verify backoffice UI implements all CRUD operations
  - [x] Subtask 1.3: Test deactivation behavior (soft delete)
- [x] Task 2: Verify POS can access items (AC: #1, #2)
  - [x] Subtask 2.1: Confirm sync includes item data
  - [x] Subtask 2.2: Test POS can display items in cart
- [ ] Task 3: Add executable integration tests for deactivation/RBAC/tenant isolation (AC: #1, #2, #4)
  - [ ] Add test for PATCH `is_active=false` and assert hidden from synced POS catalog while historical sales remain intact
  - [ ] Add test proving CASHIER cannot create/update/delete inventory items
  - [ ] Add test proving company A cannot read/update/delete company B items
- [ ] Task 4: Resolve AC/contract alignment for create + pricing (AC: #1)
  - [ ] Keep current two-step design (`/inventory/items` + `/inventory/item-prices`) and ensure flow always creates an active price
  - [ ] If product requirements demand single-step creation with base price, update shared contracts and API/UI consistently
- [ ] Task 5: Align catalog browse UI fields with AC #2 (AC: #2)
  - [ ] Ensure one browse/list surface exposes `name`, `sku`, effective `price`, and `status`
- [ ] Task 6: Sync documentation/status with implementation reality (AC: #1, #2, #3, #4)
  - [ ] Update `Dev Agent Record -> File List` with all touched files
  - [ ] Keep story status and completion notes consistent with unresolved high-priority work

## Dev Notes

### Hard Constraints (Must Follow)

- Enforce `company_id` scoping on every item read/write path (no cross-tenant leakage)
- Keep item deactivation as soft-state behavior via `is_active`; AC #4 is deactivation, not hard delete
- Keep item pricing as explicit price-entity behavior unless requirements formally change
- Preserve item type taxonomy from ADR-0002: `SERVICE`, `PRODUCT`, `INGREDIENT`, `RECIPE`
- Keep POS offline-first and sync-safe: item visibility must remain correct after pull/sync

### Implementation Boundaries

- Change only where needed for 4.1:
  - `apps/api/app/api/inventory/items/route.ts`
  - `apps/api/app/api/inventory/items/[itemId]/route.ts`
  - `apps/api/src/lib/master-data.ts`
  - `packages/shared/src/schemas/master-data.ts`
  - `apps/backoffice/src/features/items-prices-page.tsx`
  - `apps/api/tests/integration/master-data.integration.test.mjs`
- Do not expand scope into 4.2/4.3 implementation:
  - No outlet-specific pricing matrix redesign in this story
  - No new item-type lifecycle logic beyond existing taxonomy and validation
- Do not change posting/ledger flow for this story

### Cross-Story Guardrails

- Story 4.2 owns outlet-specific pricing depth; 4.1 should only ensure at least one active price exists for POS availability
- Story 4.3 owns deeper behavior by item type; 4.1 must preserve current ADR-0002-aligned taxonomy and validations

### Architecture Patterns

- **API Framework**: Next.js API routes at `/api/inventory/items`
- **Validation**: Zod schemas in `packages/shared/src/schemas/master-data.ts`
- **Item Types**: SERVICE, PRODUCT, INGREDIENT, RECIPE (per ADR-0002)
- **Auth**: JWT with RBAC - roles: OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT
- **Module**: inventory module with CRUD permissions
- **Tenant Scoping**: company_id enforced on all item operations

### Source Tree Components

- **API Routes**: 
  - `apps/api/app/api/inventory/items/route.ts` - LIST, CREATE
  - `apps/api/app/api/inventory/items/[itemId]/route.ts` - GET, PATCH, DELETE
- **Business Logic**: Check `apps/api/src/lib/master-data.ts` for item functions
- **Shared Schemas**: `packages/shared/src/schemas/master-data.ts`
- **Backoffice UI**: `apps/backoffice/src/features/items-prices-page.tsx`
- **POS Sync**: Items synced via `/api/sync/push` and `/api/sync/pull`

### Testing Standards

- Test CRUD operations via API: POST, GET, PATCH, DELETE
- Test tenant isolation: company A cannot access company B's items
- Test RBAC: CASHIER role should not have inventory write access
- Test deactivation: deactivated items hidden from POS but preserved in transactions

### Definition of Done

- AC #1: Item create flow includes active price assignment and item becomes POS-available
- AC #2: Catalog browse/list shows name, SKU, effective price, and status together
- AC #3: Item update flow reflects in API and POS-facing data
- AC #4: Deactivation hides item from active POS catalog, with historical transaction integrity preserved
- Required verification commands executed and passing:
  - `pnpm --filter @jurnapod/api test -- tests/integration/master-data.integration.test.mjs`
  - `pnpm --filter @jurnapod/api test`

### Project Structure Notes

- This is a brownfield project - item CRUD already exists in the codebase
- Existing API endpoints implement all CRUD operations
- Backoffice has comprehensive items-prices page with import/export
- Story implementation is primarily verification and any missing pieces

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Module-System]
- [Source: docs/adr/ADR-0002-item-types-taxonomy.md]
- [Source: AGENTS.md#Repo-wide-operating-principles]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Validation pass completed for baseline scope; story remains in-progress until unresolved high-priority follow-ups are closed.
- Verified item create/update/list/read paths for inventory item management:
  - POST /api/inventory/items - Create item core fields
  - GET /api/inventory/items - List items
  - GET /api/inventory/items/:id - Get item by ID
  - PATCH /api/inventory/items/:id - Update item (including is_active for deactivation)
- Verified deactivation behavior target is PATCH `is_active=false`; hard delete is not part of AC #4.
- Verified sync pull includes items and prices:
  - buildSyncPullPayload includes active items only (isActive: true)
  - Items synced with: id, sku, name, type, item_group_id, is_active, updated_at
  - Prices synced with effective prices per outlet
- Verified POS can access items:
  - POS has products_cache in IndexedDB via Dexie
  - Sync-orchestrator handles syncing items with prices
  - Cart can add items from product cache

### File List
