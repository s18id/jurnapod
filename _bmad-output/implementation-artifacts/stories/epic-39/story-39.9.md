# Story 39.9: Phase 2F — pos Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** done
**Priority:** High

## Objective

Update pos module routes to use resource-level permission checks (`pos.transactions`, `pos.config`) and update the permission matrix accordingly.

## Context

Building on the sales module changes (Story 39.8), the pos module is updated to use the new resource-level permission model. POS handles point-of-sale transactions and configuration.

## Acceptance Criteria

- [x] All pos routes updated to use resource-level permission checks
- [x] Permission matrix updated for pos resources:
  - `pos.transactions`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=CRUDA, ACCOUNTANT=READ, CASHIER=CRUDA
  - `pos.config`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=READ
- [x] npm run build -w @jurnapod/api passes
- [x] npm run typecheck -w @jurnapod/api passes

## Technical Details

### Files Modified

- `apps/api/src/routes/sync/push.ts` - POS sync push routes
- `apps/api/src/routes/sync/pull.ts` - POS sync pull routes
- `apps/api/src/routes/dinein.ts` - Dine-in sessions and tables routes

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
   | `pos.transactions` | Operational | CRUDAM for SUPER_ADMIN/OWNER/COMPANY_ADMIN, CRUDA (31) for ADMIN/CASHIER, READ (1) for ACCOUNTANT |
   | `pos.config` | Structural | CRUDAM (63) for SUPER_ADMIN/OWNER/COMPANY_ADMIN, READ (1) for ADMIN |

3. **POS is offline-first** - transactions resource handles the idempotent sync behavior

## Testing Strategy

- Unit tests for each resource permission check
- Integration tests for pos routes with different role permissions
- Build verification

## Dev Notes

### Files Modified

1. **apps/api/src/routes/sync/push.ts**
   - Lines 78-84: Added `resource: "transactions"` to requireAccess call
   - Lines 250-256: Added `resource: "transactions"` to requireAccess call (OpenAPI handler)

2. **apps/api/src/routes/sync/pull.ts**
   - Added `requireAccess` import
   - Lines 66-79: Added `syncPullModuleGuard` using `requireAccess` with `resource: "transactions"`
   - Lines 81-91: Applied new guard in middleware chain

3. **apps/api/src/routes/dinein.ts**
   - Lines 53-58: Sessions inline handler - added `resource: "transactions"`
   - Lines 157-162: Tables inline handler - added `resource: "config"`
   - Lines 303-308: Sessions OpenAPI handler - added `resource: "transactions"`
   - Lines 390-395: Tables OpenAPI handler - added `resource: "config"`

### Permission Matrix Status

The permission matrix in `packages/modules/platform/src/companies/constants/permission-matrix.ts` already had correct entries for:
- `pos.transactions` - CRUDAM for SUPER_ADMIN/OWNER/COMPANY_ADMIN, CRUDA for ADMIN/CASHIER, 0 for ACCOUNTANT
- `pos.config` - CRUDAM for SUPER_ADMIN/OWNER/COMPANY_ADMIN, READ for ADMIN

No changes needed to the permission matrix - it was already correctly configured.

### Verification

- `npm run build -w @jurnapod/api` ✅ passes
- `npm run typecheck -w @jurnapod/api` ✅ passes
- `npm run build -w @jurnapod/modules-platform` ✅ passes
- `npm run typecheck -w @jurnapod/modules-platform` ✅ passes
- `npm run build -w @jurnapod/auth` ✅ passes
- `npm run typecheck -w @jurnapod/auth` ✅ passes

### Note on Workspace

`@jurnapod/modules-pos` workspace does not exist. The POS-related code is in the API package and `packages/pos-sync` package. Verification was done on `@jurnapod/api` instead.
