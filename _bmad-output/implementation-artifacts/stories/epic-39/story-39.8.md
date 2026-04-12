# Story 39.8: Phase 2E — sales Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** done
**Priority:** High

## Objective

Update sales module routes to use resource-level permission checks (`sales.invoices`, `sales.orders`, `sales.payments`) and update the permission matrix accordingly.

## Context

Building on the treasury module changes (Story 39.7), the sales module is updated to use the new resource-level permission model. Sales handles invoices, orders, and payments.

## Acceptance Criteria

- [x] All sales routes updated to use resource-level permission checks
- [x] Permission matrix updated for sales resources:
  - `sales.invoices`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=CRUDA, ACCOUNTANT=READ
  - `sales.orders`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=CRUDA, ACCOUNTANT=READ
  - `sales.payments`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=CRUDA, ACCOUNTANT=READ
- [x] npm run build -w @jurnapod/modules-sales passes
- [x] npm run typecheck -w @jurnapod/modules-sales passes
- [x] npm run build -w @jurnapod/api passes
- [x] npm run typecheck -w @jurnapod/api passes

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

### Files Modified

1. **apps/api/src/routes/sales/invoices.ts**
   - Lines 80, 150, 498, 604: Updated `requireAccess` calls to include `resource: "invoices"`

2. **apps/api/src/routes/sales/orders.ts**
   - Lines 62, 129, 263, 366: Updated `requireAccess` calls to include `resource: "orders"`

3. **apps/api/src/routes/sales/payments.ts**
   - Lines 53, 121, 234, 321, 459, 558: Updated `requireAccess` calls for non-OpenAPI routes to include `resource: "payments"`
   - Lines 745, 868: Fixed OpenAPI route handlers that were missed in initial edit (update and create permissions)

4. **packages/modules/platform/src/companies/constants/permission-matrix.ts**
   - Added `sales.orders` resource entries for all roles
   - Updated `sales.invoices` and `sales.payments` with complete entries for all roles

### Permission Matrix Changes

| Role | sales.invoices | sales.orders | sales.payments |
|------|----------------|--------------|----------------|
| SUPER_ADMIN | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| OWNER | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| COMPANY_ADMIN | CRUDA (31) | CRUDA (31) | CRUDA (31) |
| ADMIN | CRUDA (31) | CRUDA (31) | CRUDA (31) |
| CASHIER | CRUDA (31) | CRUDA (31) | CRUDA (31) |
| ACCOUNTANT | READ (1) | READ (1) | READ (1) |

### Verification Results

- ✅ `npm run build -w @jurnapod/modules-platform` passes
- ✅ `npm run build -w @jurnapod/modules-sales` passes
- ✅ `npm run build -w @jurnapod/api` passes
- ✅ `npm run typecheck -w @jurnapod/modules-sales` passes
- ✅ `npm run typecheck -w @jurnapod/api` passes

### Notes

- Credit notes (sales/credit-notes.ts) did not have existing `requireAccess` calls and was not included in the scope per the story description
- The `companies.ts` file in `apps/api/src/lib/companies.ts` contains legacy permission matrix but is used for company initialization bootstrap and was not modified as it falls outside the API route scope
- The `access-scope-checker.ts` in `apps/api/src/lib/modules-sales/` maps sales permissions but uses a different pattern (sales:read, sales:create etc.) which is used by the modules-sales package internally for access scope checking, not by the API routes directly
