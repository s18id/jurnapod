# Story 39.5: Phase 2B — accounting Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** High

## Objective

Update accounting module routes to use resource-level permission checks (`accounting.journals`, `accounting.accounts`, `accounting.fiscal_years`, `accounting.reports`) and update the permission matrix accordingly.

## Context

Building on the platform module changes (Story 39.4), the accounting module is updated to use the new resource-level permission model. The `reports` resource replaces the old `reports` module, accessed via `accounting.ANALYZE`.

## Acceptance Criteria

- [ ] All accounting routes updated to use resource-level permission checks
- [ ] Permission matrix updated for accounting resources:
  - `accounting.journals`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN/ADMIN/ACCOUNTANT=CRUDA
  - `accounting.accounts`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=MANAGE+READ, others=READ
  - `accounting.fiscal_years`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=MANAGE+READ, others=READ
  - `accounting.reports`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=CRUDA, ADMIN=READ, ACCOUNTANT=CRUDA
- [ ] Tests added/updated for all accounting resource permissions
- [ ] npm run build -w @jurnapod/modules-accounting passes
- [ ] npm run typecheck -w @jurnapod/modules-accounting passes

## Technical Details

### Files to Modify

- Accounting route files in `packages/modules/accounting/src/`
- `packages/modules/accounting/src/*/constants/permission-matrix.ts` (if exists)

### Dependencies

- Story 39.4 (platform Module must be complete first)

### Implementation Notes

1. **Resource-level permission checks format:**
   ```typescript
   // Before (using reports module)
   requireAccess({ module: 'reports', permission: 'report' });
   
   // After (using source module with ANALYZE)
   requireAccess({ module: 'accounting', permission: 'analyze', resource: 'reports' });
   ```

2. **Accounting Resources:**
   | Resource | Category | Permission Pattern |
   |----------|----------|-------------------|
   | journals | Operational | CRUDA for COMPANY_ADMIN, ADMIN, ACCOUNTANT |
   | accounts | Structural | MANAGE+READ for COMPANY_ADMIN, READ for others |
   | fiscal_years | Structural | MANAGE+READ for COMPANY_ADMIN, READ for others |
   | reports | Analytical | CRUDA for COMPANY_ADMIN, READ for ADMIN, CRUDA for ACCOUNTANT |

3. **Financial reports now use `accounting.ANALYZE`** instead of separate reports module

## Testing Strategy

- Unit tests for each resource permission check
- Integration tests for accounting routes with different role permissions
- Verify reports access uses accounting.ANALYZE permission
- Build verification

## Dev Notes

[To be filled during implementation]
