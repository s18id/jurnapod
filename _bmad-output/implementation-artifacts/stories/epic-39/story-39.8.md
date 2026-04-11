# Story 39.8: Phase 2E — sales Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** High

## Objective

Update sales module routes to use resource-level permission checks (`sales.invoices`, `sales.orders`, `sales.payments`) and update the permission matrix accordingly.

## Context

Building on the treasury module changes (Story 39.7), the sales module is updated to use the new resource-level permission model. Sales handles invoices, orders, and payments.

## Acceptance Criteria

- [ ] All sales routes updated to use resource-level permission checks
- [ ] Permission matrix updated for sales resources:
  - `sales.invoices`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=CRUDA, ACCOUNTANT=READ
  - `sales.orders`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=CRUDA, ACCOUNTANT=READ
  - `sales.payments`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=CRUDA, ACCOUNTANT=READ
- [ ] Tests added/updated for all sales resource permissions
- [ ] npm run build -w @jurnapod/modules-sales passes
- [ ] npm run typecheck -w @jurnapod/modules-sales passes

## Technical Details

### Files to Modify

- Sales route files in `packages/modules/sales/src/`
- `packages/modules/sales/src/*/constants/permission-matrix.ts` (if exists)

### Dependencies

- Story 39.7 (treasury Module must be complete first)

### Implementation Notes

1. **Resource-level permission checks format:**
   ```typescript
   // Example
   requireAccess({ module: 'sales', permission: 'read', resource: 'invoices' });
   ```

2. **Sales Resources:**
   | Resource | Category | Permission Pattern |
   |----------|----------|-------------------|
   | invoices | Operational | CRUDAM for SUPER_ADMIN/OWNER/COMPANY_ADMIN, CRUDA for ADMIN, READ for ACCOUNTANT |
   | orders | Operational | CRUDAM for SUPER_ADMIN/OWNER/COMPANY_ADMIN, CRUDA for ADMIN, READ for ACCOUNTANT |
   | payments | Operational | CRUDAM for SUPER_ADMIN/OWNER/COMPANY_ADMIN, CRUDA for ADMIN, READ for ACCOUNTANT |

## Testing Strategy

- Unit tests for each resource permission check
- Integration tests for sales routes with different role permissions
- Build verification

## Dev Notes

[To be filled during implementation]
