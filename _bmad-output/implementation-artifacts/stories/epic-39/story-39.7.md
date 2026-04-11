# Story 39.7: Phase 2D — treasury Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** High

## Objective

Update treasury module routes to use resource-level permission checks (`treasury.transactions`, `treasury.accounts`) and update the permission matrix accordingly.

## Context

Building on the inventory module changes (Story 39.6), the treasury module is updated to use the new resource-level permission model. Treasury handles cash/bank transactions and bank account setup.

## Acceptance Criteria

- [ ] All treasury routes updated to use resource-level permission checks
- [ ] Permission matrix updated for treasury resources:
  - `treasury.transactions`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN/ADMIN=CRUDA, ACCOUNTANT=READ
  - `treasury.accounts`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=MANAGE+READ, others=READ
- [ ] Tests added/updated for all treasury resource permissions
- [ ] npm run build -w @jurnapod/modules-treasury passes
- [ ] npm run typecheck -w @jurnapod/modules-treasury passes

## Technical Details

### Files to Modify

- Treasury route files in `packages/modules/treasury/src/`
- `packages/modules/treasury/src/*/constants/permission-matrix.ts` (if exists)

### Dependencies

- Story 39.6 (inventory Module must be complete first)

### Implementation Notes

1. **Resource-level permission checks format:**
   ```typescript
   // Example
   requireAccess({ module: 'treasury', permission: 'read', resource: 'transactions' });
   ```

2. **Treasury Resources:**
   | Resource | Category | Permission Pattern |
   |----------|----------|-------------------|
   | transactions | Operational | CRUDA for COMPANY_ADMIN/ADMIN, READ for ACCOUNTANT |
   | accounts | Structural | MANAGE+READ for COMPANY_ADMIN, READ for others |

## Testing Strategy

- Unit tests for each resource permission check
- Integration tests for treasury routes with different role permissions
- Build verification

## Dev Notes

[To be filled during implementation]
