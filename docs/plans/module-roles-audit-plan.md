# Module Roles: Audit Fix Plan

## Goal
Address audit findings for module_roles so permissions are enforced, deterministic, and safe across tenants.

## Scope
- Enforce module permissions in API routes
- Fix SUPER_ADMIN access when company_id is 0
- Resolve cross-tenant permission mutation risk
- Add validation for module-roles endpoints
- Standardize response envelopes for auth guard where applicable

## Decisions (Recommended)
- **Keep module_roles global** (roles are global, so module_roles should match)
  - Restrict all module_roles writes to **SUPER_ADMIN** only
  - OWNER/ADMIN can read module_roles, but cannot mutate them
- **SUPER_ADMIN access**
  - Add a **bypass** in `userHasAnyRole` and `userHasModulePermission` so SUPER_ADMIN works even with `company_id=0`
  - Keep `company_id=0` for SUPER_ADMIN to avoid binding to a tenant

## Plan (Todo)
1) Permission enforcement
   - Add `requireModulePermission` to routes that need module gating
   - Define a module-permission map for key endpoints (users, roles, companies, outlets, accounting, sales, reports)

2) SUPER_ADMIN access
   - Ensure SUPER_ADMIN checks bypass company_id join or use a valid platform company
   - Update `userHasAnyRole` and `userHasModulePermission` accordingly

3) Deterministic multi-role checks
   - Replace `LIMIT 1` with aggregation across roles
   - Ensure `can_*` is true if any role grants it

4) Module-roles API validation
   - Validate `role_id` and `module` via schemas
   - Validate body via `ModuleRoleUpdateRequestSchema`
   - Return 404 when role or module role is missing

5) Cross-tenant safety
   - Module_roles is global; restrict updates to SUPER_ADMIN only
   - Leave reads available to OWNER/ADMIN for transparency

6) Envelope consistency
   - Align auth-guard responses with `{ success: false, error }` or document mixed envelopes

## Files in Scope
- `apps/api/src/lib/auth.ts`
- `apps/api/src/lib/auth-guard.ts`
- `apps/api/src/lib/users.ts`
- `apps/api/app/api/settings/module-roles/route.ts`
- `apps/api/app/api/settings/module-roles/[roleId]/[module]/route.ts`
- `packages/db/migrations/0035_module_roles.sql` (if tenant-scoped)
- `packages/shared/src/schemas/module-roles.ts`
- `docs/plans/module-roles-audit-plan.md`
