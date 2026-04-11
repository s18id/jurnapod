# Story 39.6: Phase 2C — inventory Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** High

## Objective

Update inventory module routes to use resource-level permission checks (`inventory.items`, `inventory.stock`, `inventory.costing`) and update the permission matrix accordingly.

## Context

Building on the accounting module changes (Story 39.5), the inventory module is updated to use the new resource-level permission model. Note that `inventory_costing` is an internal package, not an ACL module - costing is a resource within the inventory module.

## Acceptance Criteria

- [ ] All inventory routes updated to use resource-level permission checks
- [ ] Permission matrix updated for inventory resources:
  - `inventory.items`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=CRUD, ADMIN=CRUDA, ACCOUNTANT=READ
  - `inventory.stock`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=CRUD, ADMIN=CRUDA, ACCOUNTANT=READ
  - `inventory.costing`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=MANAGE+READ, ADMIN/ACCOUNTANT=READ
- [ ] Tests added/updated for all inventory resource permissions
- [ ] npm run build -w @jurnapod/modules-inventory passes
- [ ] npm run typecheck -w @jurnapod/modules-inventory passes

## Technical Details

### Files to Modify

- Inventory route files in `packages/modules/inventory/src/`
- `packages/modules/inventory/src/*/constants/permission-matrix.ts` (if exists)

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
   | items | Operational | CRUDA for COMPANY_ADMIN/ADMIN, READ for ACCOUNTANT |
   | stock | Operational | CRUDA for COMPANY_ADMIN/ADMIN, READ for ACCOUNTANT |
   | costing | Structural | MANAGE+READ for COMPANY_ADMIN, READ for others |

3. **Note:** `inventory_costing` package is internal calculation logic, not an ACL module. Costing permissions are managed via `inventory.costing` resource.

## Testing Strategy

- Unit tests for each resource permission check
- Integration tests for inventory routes with different role permissions
- Build verification

## Dev Notes

[To be filled during implementation]
