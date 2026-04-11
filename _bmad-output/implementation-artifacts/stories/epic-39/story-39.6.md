# Story 39.6: Phase 2C — inventory Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** done
**Priority:** High

## Objective

Update inventory module routes to use resource-level permission checks (`inventory.items`, `inventory.stock`, `inventory.costing`) and update the permission matrix accordingly.

## Context

Building on the accounting module changes (Story 39.5), the inventory module is updated to use the new resource-level permission model. Note that `inventory_costing` is an internal package, not an ACL module - costing is a resource within the inventory module.

## Acceptance Criteria

- [x] All inventory routes updated to use resource-level permission checks
- [x] Permission matrix updated for inventory resources:
  - `inventory.items`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=CRUD, ADMIN=CRUDA, ACCOUNTANT=READ
  - `inventory.stock`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=CRUD, ADMIN=CRUDA, ACCOUNTANT=READ
  - `inventory.costing`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=MANAGE+READ, ADMIN/ACCOUNTANT=READ
- [x] npm run build -w @jurnapod/modules-inventory passes
- [x] npm run typecheck -w @jurnapod/modules-inventory passes
- [x] npm run build -w @jurnapod/api passes
- [x] npm run typecheck -w @jurnapod/api passes

## Technical Details

### Files Modified

1. **Permission Matrix:** `packages/modules/platform/src/companies/constants/permission-matrix.ts`
   - Added `inventory.costing` resource for all roles
   - Updated `inventory.items` for COMPANY_ADMIN: CRUDA → CRUD (15)
   - Updated `inventory.stock` for COMPANY_ADMIN: CRUDA → CRUD (15)
   - Updated `inventory.items` for ACCOUNTANT: 0 → READ (1)
   - Updated `inventory.stock` for ACCOUNTANT: 0 → READ (1)
   - Added `inventory.costing` for ACCOUNTANT: READ (1)

2. **API Routes:** `apps/api/src/routes/inventory.ts`
   - Updated `requireInventoryAccess()` helper to include `resource: 'items'`

3. **API Routes:** `apps/api/src/routes/stock.ts`
   - Updated `requireStockAccess()` to include `resource: 'stock'`

4. **API Routes:** `apps/api/src/routes/import.ts`
   - Updated all `requireAccess` calls for inventory module to include `resource: 'items'`
   - Updated both main route handlers and OpenAPI route handlers

5. **API Routes:** `apps/api/src/routes/export.ts`
   - Updated all `requireAccess` calls for inventory module to include `resource: 'items'`
   - Updated both main route handlers and OpenAPI route handlers

### Dependencies

- Story 39.5 (accounting Module must be complete first)

### Implementation Notes

1. **Resource-level permission checks format:**
   ```typescript
   // Example
   requireAccess({ module: 'inventory', permission: 'read', resource: 'items' });
   ```

2. **Inventory Resources:**
   | Resource | Category | Permission Pattern |
   |----------|----------|-------------------|
   | items | Operational | CRUD for COMPANY_ADMIN, CRUDA for ADMIN, READ for ACCOUNTANT |
   | stock | Operational | CRUD for COMPANY_ADMIN, CRUDA for ADMIN, READ for ACCOUNTANT |
   | costing | Structural | MANAGE+READ for COMPANY_ADMIN, READ for ADMIN/ACCOUNTANT |

3. **Note:** `inventory_costing` package is internal calculation logic, not an ACL module. Costing permissions are managed via `inventory.costing` resource.

## Dev Notes

**Implementation Date:** 2026-04-12

**Changes Made:**

1. **Permission Matrix Updates:**
   - `inventory.items`: COMPANY_ADMIN now has CRUD (15) instead of CRUDA (31); ACCOUNTANT now has READ (1) instead of 0
   - `inventory.stock`: COMPANY_ADMIN now has CRUD (15) instead of CRUDA (31); ACCOUNTANT now has READ (1) instead of 0
   - `inventory.costing`: New resource added with MANAGE+READ (33) for COMPANY_ADMIN and READ (1) for ADMIN/ACCOUNTANT

2. **Route Updates:**
   - `inventory.ts`: `requireInventoryAccess()` now uses `resource: 'items'`
   - `stock.ts`: `requireStockAccess()` now uses `resource: 'stock'`
   - `import.ts`: All inventory permission checks now use `resource: 'items'`
   - `export.ts`: All inventory permission checks now use `resource: 'items'`

**Verification:**
- `npm run build -w @jurnapod/modules-inventory` ✅ Passes
- `npm run typecheck -w @jurnapod/modules-inventory` ✅ Passes
- `npm run build -w @jurnapod/api` ✅ Passes
- `npm run typecheck -w @jurnapod/api` ✅ Passes
