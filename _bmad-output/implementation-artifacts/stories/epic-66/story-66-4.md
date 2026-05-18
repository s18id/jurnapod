# Story 66-4: Permission-Aware Navigation and Route Guards

Status: done (implementation validated; reviewer GO; owner sign-off recorded 2026-05-18)

## Story

As an **authenticated backoffice user**,  
I want **navigation and action affordances filtered by my effective permissions**,  
So that **the UI mirrors backend deny-by-default access without weakening backend enforcement**.

## Scope Boundary

- Ahmad approved Epic 66 implementation on 2026-05-17; `apps/backoffice` is unfrozen for Epic 66 scope only.
- Frontend permission checks are UX-only. Backend remains authoritative.
- Route guards and button visibility MUST use canonical `module.resource` requirements.
- This story MUST formalize Epic 65's transitional route permission metadata before closing.

## Context

Epic 65 introduced route guards and navigation filtering with a transitional permission metadata bridge. Story 66-4 integrates real effective permission data and removes the transitional cast once `AppRoute` formally includes permission metadata.

---

## Pre-Implementation Gates

| Gate | Required State |
|------|----------------|
| Story 66-1 | User/role data patterns available |
| Story 66-2 | Permission matrix/permission model available |
| Effective permissions source | API or session contract verified |
| Route metadata | Formal `AppRoute.permission` design approved |

## Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| User with only `inventory.items.READ` sees Inventory → Items | Happy | Unit |
| Same user does not see Inventory → Prices | Auth/Edge | Unit |
| User with no accounting access does not see Accounting section | Auth | Unit |
| Direct route access without READ redirects to `/403` or dashboard | Auth | Unit/component |
| User lacks UPDATE, Edit button hidden | Auth | Unit/component |
| User lacks DELETE, Void/Delete button hidden | Auth | Unit/component |

---

## API Contract Verification (MANDATORY before implementation)

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/users/me` | GET | Session user with roles and/or effective permissions | ❌ | Verify current contract |
| `/api/permissions/effective` or equivalent | GET | `{ data: PermissionEntry[] }` | ❌ | If absent, document source from roles/module_roles |
| `/api/roles/:id/permissions` | GET | Role permission entries | ❌ | Required if effective endpoint absent |

### API Gaps Found

| Gap | Impact | Resolution |
|-----|--------|------------|
| TBD after verification | TBD | Story MUST block or document approved workaround |

---

## Acceptance Criteria

**AC1: Formal Route Permission Metadata**  
Given route definitions are loaded,  
When the route model is typed,  
Then `AppRoute` MUST formally include optional permission metadata and the Epic 65 transitional cast MUST be removed.

**AC2: Navigation Section Filtering**  
Given a user has no permissions for a module,  
When sidebar navigation renders,  
Then that module section MUST be hidden.

**AC3: Resource Link Filtering**  
Given a user has `inventory.items.READ` but lacks `inventory.prices.READ`,  
When sidebar navigation renders,  
Then Inventory → Items MUST be visible and Inventory → Prices MUST be hidden or disabled according to the chosen UX rule.

**AC4: Direct Route Guard**  
Given a user navigates directly to a route requiring missing READ permission,  
When the guard evaluates access,  
Then the user MUST see `/403` or be redirected to a safe dashboard route.

**AC5: Mutation Button Visibility**  
Given a user lacks UPDATE or DELETE permission for a resource,  
When detail view actions render,  
Then Edit and Void/Delete actions MUST be hidden or disabled based on the required permission.

**AC6: Backend Authority Notice**  
Given frontend denies or hides an action,  
When implementation is reviewed,  
Then code comments and tests MUST preserve the invariant that backend deny-by-default remains authoritative.

---

## Tasks / Subtasks

- [ ] Verify effective permission source API contract.
- [ ] Formalize `AppRoute.permission` metadata type.
- [ ] Remove Epic 65 transitional route permission cast.
- [ ] Map all core admin routes to canonical `module.resource` requirements.
- [ ] Update shell navigation filtering to consume effective permission cache.
- [ ] Update route guards to enforce READ permission on direct navigation.
- [ ] Add reusable helper for action-level permission gates.
- [ ] Add unit tests for navigation, route guard, and button visibility cases.

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/lib/auth/permissions.ts` | Effective permission helpers if not already covered |
| `apps/backoffice/__test__/unit/app-router-guards-permissions.test.ts` | Permission route guard tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/app/routes.ts` | Modify | Add formal permission metadata to legacy route model |
| `apps/backoffice/src/app/router/routes.tsx` | Modify | Align v6 route metadata with canonical permissions |
| `apps/backoffice/src/app/router/guards.tsx` | Modify | Enforce resource READ requirements |
| `apps/backoffice/src/app/shell/use-nav-filtering.ts` | Modify | Remove transitional cast and consume formal permission metadata |

## Estimated Effort

2–3 days

## Risk Level

Low

## Dependencies

- Story 66-1 and 66-2 permission data patterns.
- Explicit Epic 66 backoffice unfreeze approval.
- Effective permission API contract verification.

## Validation Evidence Required

- `npm run lint -w @jurnapod/backoffice`
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-router-guards-permissions.test.ts`
- `npm run test:unit -w @jurnapod/backoffice`

## Technical Debt Review

- [ ] Epic 65 transitional route permission cast removed.
- [ ] No backend ACL enforcement changes.
- [ ] No route without explicit permission metadata unless documented public route.
- [ ] No permission string aliases outside canonical `module.resource` format.
