# Story 39.9: Phase 2F — pos Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** High

## Objective

Update pos module routes to use resource-level permission checks (`pos.transactions`, `pos.config`) and update the permission matrix accordingly.

## Context

Building on the sales module changes (Story 39.8), the pos module is updated to use the new resource-level permission model. POS handles point-of-sale transactions and configuration.

## Acceptance Criteria

- [ ] All pos routes updated to use resource-level permission checks
- [ ] Permission matrix updated for pos resources:
  - `pos.transactions`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=CRUDA, ACCOUNTANT=READ, CASHIER=CRUDA
  - `pos.config`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=READ
- [ ] Tests added/updated for all pos resource permissions
- [ ] npm run build -w @jurnapod/modules-pos passes
- [ ] npm run typecheck -w @jurnapod/modules-pos passes

## Technical Details

### Files to Modify

- POS route files in `packages/modules/pos/src/`
- `packages/modules/pos/src/*/constants/permission-matrix.ts` (if exists)

### Dependencies

- Story 39.8 (sales Module must be complete first)

### Implementation Notes

1. **Resource-level permission checks format:**
   ```typescript
   // Example
   requireAccess({ module: 'pos', permission: 'read', resource: 'transactions' });
   ```

2. **POS Resources:**
   | Resource | Category | Permission Pattern |
   |----------|----------|-------------------|
   | transactions | Operational | CRUDAM for SUPER_ADMIN/OWNER/COMPANY_ADMIN, CRUDA for ADMIN/CASHIER, READ for ACCOUNTANT |
   | config | Structural | CRUDAM for SUPER_ADMIN/OWNER/COMPANY_ADMIN, READ for ADMIN |

3. **POS is offline-first** - transactions resource handles the idempotent sync behavior

## Testing Strategy

- Unit tests for each resource permission check
- Integration tests for pos routes with different role permissions
- Build verification

## Dev Notes

[To be filled during implementation]
