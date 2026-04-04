# Story 31.1: Extract Users/RBAC to `modules-platform`

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.1 |
| Title | Extract Users/RBAC to `modules-platform` |
| Status | pending |
| Type | Extraction |
| Sprint | 1 of 2 |
| Priority | P1 |
| Estimate | 8h |

---

## Story

As a Platform Engineer,
I want the Users/RBAC domain logic to live in `@jurnapod/modules-platform`,
So that the API remains a thin HTTP adapter and the domain is reusable across apps.

---

## Background

`apps/api/src/lib/users.ts` (1,520 lines) contains the complete user/role/RBAC domain:
- User CRUD with role assignments
- Role management (create/update/delete)
- Module permission management (bitmask-based)
- SuperAdmin protection logic
- Cross-company access controls
- Outlet role assignments

This should move to `@jurnapod/modules-platform` as a first-class package domain.

---

## Acceptance Criteria

1. `apps/api/src/lib/users.ts` refactored into `packages/modules/platform/src/users/`
2. All exports from `@jurnapod/modules-platform` include UserService, RoleService, PermissionService
3. API routes (`routes/users.ts`) delegate to package services — routes are thin adapters
4. No `packages/modules/platform` importing from `apps/api/**`
5. All tenant-scoped operations enforce `company_id`
6. `npm run typecheck -w @jurnapod/modules-platform` passes
7. `npm run typecheck -w @jurnapod/api` passes

---

## Technical Notes

### Target Structure

```
packages/modules/platform/src/users/
  index.ts              # Public exports
  interfaces/           # AccessScopeChecker, UserRepository
  services/
    user-service.ts    # User CRUD
    role-service.ts    # Role management
    permission-service.ts  # Module permission management
  types/               # User, Role, ModulePermission types
  contracts/           # Zod schemas for inputs/outputs
```

### Key Interfaces

```typescript
export interface AccessScopeChecker {
  assertCompanyAccess(input: { actorUserId: number; companyId: number; permission: string }): Promise<void>;
  assertOutletAccess(input: { actorUserId: number; companyId: number; outletId: number; permission: string }): Promise<void>;
}

export interface UserRepository {
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserInput): Promise<User>;
  // ...
}
```

### Architecture Rules

- No package imports from `apps/api/**`
- All tenant-scoped operations enforce `company_id`
- NO MOCK DB for DB-backed business logic tests
- Use Zod for input validation at package boundary

---

## Tasks

- [ ] Read `apps/api/src/lib/users.ts` fully
- [ ] Create `packages/modules/platform/src/users/` directory structure
- [ ] Define interfaces (AccessScopeChecker, UserRepository, RoleRepository)
- [ ] Implement UserService, RoleService, PermissionService
- [ ] Move MODULE_PERMISSIONS bitmask constants to package
- [ ] Update API routes to delegate to package
- [ ] Add integration tests with real DB
- [ ] Run typecheck and fix errors
- [ ] Verify no `apps/api` imports from package

---

## Dev Notes

- SuperAdmin protection logic must be preserved exactly
- The bitmask-based permission system (`MODULE_READ | MODULE_WRITE | MODULE_ADMIN`) must remain functionally identical
- Password hashing integration (`password-hash.ts`) stays in API or moves to `@jurnapod/auth`

---

## Validation

```bash
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api
npm run test -w @jurnapod/modules-platform  # if tests exist
```
