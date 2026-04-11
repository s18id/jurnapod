# Story 39.5: Phase 2B — accounting Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** done
**Priority:** High

## Objective

Update accounting module routes to use resource-level permission checks (`accounting.journals`, `accounting.accounts`, `accounting.fiscal_years`, `accounting.reports`) and update the permission matrix accordingly.

## Context

Building on the platform module changes (Story 39.4), the accounting module is updated to use the new resource-level permission model. The `reports` resource replaces the old `reports` module, accessed via `accounting.ANALYZE`.

## Acceptance Criteria

- [x] All accounting routes updated to use resource-level permission checks
- [x] Permission matrix updated for accounting resources:
  - `accounting.journals`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN/ADMIN/ACCOUNTANT=CRUDA
  - `accounting.accounts`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=MANAGE+READ, others=READ
  - `accounting.fiscal_years`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=MANAGE+READ, others=READ
  - `accounting.reports`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=CRUDA, ADMIN=READ, ACCOUNTANT=CRUDA
- [x] Financial reports now use `accounting.ANALYZE` permission
- [x] npm run build -w @jurnapod/modules-accounting passes
- [x] npm run typecheck -w @jurnapod/modules-accounting passes

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

### Implementation Summary (2026-04-12)

**Files Modified:**

1. **Permission Matrix** (`packages/modules/platform/src/companies/constants/permission-matrix.ts`)
   - Added `accounting.fiscal_years` resource (Structural: MANAGE+READ for COMPANY_ADMIN, READ for others)
   - Added `accounting.reports` resource (Analytical: CRUDA for COMPANY_ADMIN/ACCOUNTANT, READ for ADMIN)
   - Updated `accounting.accounts` for COMPANY_ADMIN: CRUDA → MANAGE+READ (33)
   - Updated `accounting.accounts` for ADMIN/ACCOUNTANT: CRUDA → READ (1)

2. **API Route Files** (3 files):
   - `apps/api/src/routes/journals.ts` - 5 `requireAccess` calls → `module: "accounting", resource: "journals"`
   - `apps/api/src/routes/accounts.ts` - 32 `requireAccess` calls:
     - 26 account routes → `module: "accounting", resource: "accounts"`
     - 6 fiscal year routes → `module: "accounting", resource: "fiscal_years"`
   - `apps/api/src/routes/reports.ts` - 1 `requireAccess` call → `module: "accounting", permission: "analyze", resource: "reports"`

**Key Change:** Financial reports now use `accounting.ANALYZE` permission instead of old `reports` module.

**Verification:**
- ✅ `npm run build -w @jurnapod/modules-accounting` passes
- ✅ `npm run typecheck -w @jurnapod/modules-accounting` passes
- ✅ `npm run build -w @jurnapod/api` passes
- ✅ `npm run typecheck -w @jurnapod/api` passes
