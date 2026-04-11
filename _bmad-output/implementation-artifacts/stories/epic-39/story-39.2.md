# Story 39.2: Phase 1B — Auth Package Updates

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** done
**Priority:** High

## Objective

Update the auth package to support resource-level permission checks by renaming report to analyze, updating permission types, and adding resource parameter support to permission checking functions.

## Context

Building on the shared package foundation (Story 39.1), the auth package needs to be updated to use the new ANALYZE permission and support the resource-level permission model where access is scoped to `module.resource`.

## Acceptance Criteria

### Auth Package Updates
- [x] ModulePermission type updated: `report` → `analyze`
- [x] Permission type updated: `canReport` → `canAnalyze`
- [x] buildPermissionMask updated to accept optional `resource` parameter
- [x] Permission checking functions support `module.resource` format
- [x] Backward compatibility maintained for module-level checks (resource = null)
- [x] npm run build -w @jurnapod/auth passes
- [x] npm run typecheck -w @jurnapod/auth passes

### API Auth-Guard Updates
- [x] `resource?: string` parameter added to `AccessGuardOptions` in apps/api/src/lib/auth-guard.ts
- [x] `checkUserAccess` function updated to accept and pass `resource` parameter
- [x] `requireAccess` helper updated to include resource in access check call
- [x] MANAGE permission bit (32) added to MODULE_PERMISSION_BITS

## Technical Details

### Files to Modify

**Auth Package:**
- `packages/auth/src/types.ts` — Change `report` to `analyze` in permission types
- `packages/auth/src/rbac/permissions.ts` — Change `canReport` to `canAnalyze`, add resource parameter support

**API Auth-Guard:**
- `apps/api/src/lib/auth-guard.ts` — Add resource to AccessGuardOptions type
- `apps/api/src/lib/auth.ts` — Update checkUserAccess to pass resource parameter

### Dependencies

- Story 39.1 (Shared Package Foundation must be complete first)

### Implementation Notes

1. **Type updates in types.ts:**
   ```typescript
   // Before
   type ModulePermission = 'read' | 'create' | 'update' | 'delete' | 'report' | 'manage';
   
   // After
   type ModulePermission = 'read' | 'create' | 'update' | 'delete' | 'analyze' | 'manage';
   ```

2. **Permission function signature update:**
   ```typescript
   // Before
   function canReport(mask: number): boolean;
   
   // After
   function canAnalyze(mask: number): boolean;
   ```

3. **buildPermissionMask update to support resource:**
   ```typescript
   function buildPermissionMask(
     module: string,
     permission: ModulePermission,
     resource?: string
   ): number;
   ```

4. **Maintain backward compatibility** for existing code that uses module-level permissions with `resource = undefined/null`

### API Auth-Guard Implementation

5. **AccessGuardOptions type update:**
   ```typescript
   // apps/api/src/lib/auth-guard.ts - Updated type
   type AccessGuardOptions = {
     roles?: readonly RoleCode[];
     module?: string;
     resource?: string;  // NEW - optional resource for resource-level ACL
     permission?: ModulePermission;
     outletId?: number | OutletIdResolver;
   };

   // Usage in routes:
   requireAccess({ 
     module: 'platform', 
     resource: 'users',  // NEW
     permission: 'read' 
   });
   ```

6. **checkUserAccess function signature update:**
   ```typescript
   // apps/api/src/lib/auth.ts - Updated function signature
   export async function checkUserAccess(options: AccessCheckOptions): Promise<AccessCheckResult | null> {
     return authClient.rbac.checkAccess(options);
   }

   // AccessCheckOptions needs resource field
   export type AccessCheckOptions = {
     userId: number;
     companyId: number;
     allowedRoles?: readonly RoleCode[];
     module?: string;
     resource?: string;  // NEW
     permission?: ModulePermission;
     outletId?: number;
   };
   ```

7. **MANAGE permission bit addition:**
   ```typescript
   // packages/auth/src/types.ts - Add MANAGE
   export const MODULE_PERMISSION_BITS: Record<ModulePermission, number> = {
     read: 1,
     create: 2,
     update: 4,
     delete: 8,
     analyze: 16,  // was report
     manage: 32    // NEW
   };
   ```

## Testing Strategy

### Auth Package Tests
- Unit tests: Verify canAnalyze function works correctly with ANALYZE bit (16)
- Unit tests: Verify buildPermissionMask accepts resource parameter
- Unit tests: Verify backward compatibility with module-level permissions
- Typecheck verification
- Build verification

### API Auth-Guard Tests
- Test that requireAccess accepts resource parameter
- Test that checkUserAccess passes resource to auth package
- Test that MANAGE bit = 32

## Dev Notes

### Implementation Summary (2026-04-12)

**Files Modified:**

1. **`packages/auth/src/types.ts`**
   - `ModulePermission`: Changed `"report"` → `"analyze"`
   - `MODULE_PERMISSION_BITS`: Added `analyze: 16` (was report), `manage: 32` (new)

2. **`packages/auth/src/rbac/permissions.ts`**
   - Updated `buildPermissionMask` to use `canAnalyze` (was `canReport`)
   - Updated JSDoc comments to reflect naming change

3. **`apps/api/src/lib/auth-guard.ts`**
   - `AccessGuardOptions`: Added `resource?: string` field
   - `requireAccess()`: Now passes `resource` to `checkUserAccess` via `needsResourceCheck`

4. **`apps/api/src/lib/auth.ts`**
   - `AccessCheckOptions`: Added `resource?: string` field
   - `checkUserAccess()`: Passes `resource` parameter to auth client

**Verification:**
- ✅ `npm run build -w @jurnapod/auth` passes
- ✅ `npm run typecheck -w @jurnapod/auth` passes
- ✅ `npm run build -w @jurnapod/api` passes
- ✅ `npm run typecheck -w @jurnapod/api` passes

**Notes:**
- Backward compatibility maintained - resource parameter is optional
- When resource is undefined/null, behavior is module-level (existing code works unchanged)
