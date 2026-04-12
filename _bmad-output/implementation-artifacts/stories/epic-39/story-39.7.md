# Story 39.7: Phase 2D — treasury Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** done
**Priority:** High

## Objective

Update treasury module routes to use resource-level permission checks (`treasury.transactions`, `treasury.accounts`) and update the permission matrix accordingly.

## Context

Building on the inventory module changes (Story 39.6), the treasury module is updated to use the new resource-level permission model. Treasury handles cash/bank transactions and bank account setup.

## Acceptance Criteria

- [x] All treasury routes updated to use resource-level permission checks
- [x] Permission matrix updated for treasury resources:
  - `treasury.transactions`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN/ADMIN=CRUDA, ACCOUNTANT=READ
  - `treasury.accounts`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=MANAGE+READ, others=READ
- [x] npm run build -w @jurnapod/modules-treasury passes
- [x] npm run typecheck -w @jurnapod/modules-treasury passes
- [x] npm run build -w @jurnapod/api passes
- [x] npm run typecheck -w @jurnapod/api passes

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

### Implementation Summary (2026-04-12)

**Files Modified:**

1. **cash-bank-transactions.ts** (`apps/api/src/routes/cash-bank-transactions.ts`)
   - 4 `requireAccess` calls changed from `module: "cash_bank"` to `module: "treasury"` with `resource: "transactions"`
   - GET / → `module: "treasury", resource: "transactions", permission: "read"`
   - POST / → `module: "treasury", resource: "transactions", permission: "create"`
   - POST /:id/post → `module: "treasury", resource: "transactions", permission: "create"`
   - POST /:id/void → `module: "treasury", resource: "transactions", permission: "create"`

2. **permission-matrix.ts** (`packages/modules/platform/src/companies/constants/permission-matrix.ts`)
   - Added `treasury.accounts` resource with proper permissions:
     - SUPER_ADMIN/OWNER: CRUDAM (63)
     - COMPANY_ADMIN: READ+MANAGE (33)
     - ADMIN/CASHIER/ACCOUNTANT: READ (1)

**Notes:**
- No `treasury.accounts` routes found in API - accounts are managed via `accounting.accounts` resource
- The `treasury.accounts` resource in permission matrix follows spec for bank account setup (Structural category)

**Verification:**
- ✅ `npm run build -w @jurnapod/modules-treasury` passes
- ✅ `npm run typecheck -w @jurnapod/modules-treasury` passes
- ✅ `npm run build -w @jurnapod/api` passes
- ✅ `npm run typecheck -w @jurnapod/api` passes
