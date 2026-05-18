# Story 66-1: User Management — List, Create, Edit, Role Assignment, Outlet Scoping

Status: done (implementation validation passed; reviewer GO recorded; owner sign-off recorded 2026-05-18)

## Story

As a **company administrator**,  
I want **a user management surface with role assignment and outlet scoping**,  
So that **access can be administered safely with permission preview and review before write**.

## Scope Boundary

- Ahmad approved Epic 66 implementation on 2026-05-17; `apps/backoffice` is unfrozen for Epic 66 scope only.
- Implementation MUST stay within Story 66-1 user management scope.
- Backend ACL enforcement MUST NOT change.
- `apps/pos` MUST NOT be modified.
- Domain screens outside platform user administration MUST NOT be implemented.

## Context

Epic 65 delivered the typed API client, auth/session helpers, shell, route guard foundation, TanStack Query cache layer, and shared data-grid primitives. Story 66-1 consumes those foundations to create the first core admin surface.

Epic 66 depends on this story for reusable role assignment and permission preview patterns used by Story 66-2.

---

## Pre-Implementation Gates

### Approval Gate

| Gate | Required State |
|------|----------------|
| Backoffice unfreeze | Explicit user approval for Epic 66 execution |
| Epic 65 status | `epic-65: done` in `sprint-status.yaml` |
| Typed client | User, role, company, outlet endpoint contracts verified |
| Validation preflight | Backoffice lint, typecheck, build pass |

### Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Admin with `platform.users.READ` views paginated user list | Happy | Unit + integration/API-contract verification |
| Admin with `platform.users.CREATE` creates user with outlet + role | Happy | Unit + component/integration where available |
| Role change opens permission preview and review modal before mutation | Happy | Unit/component |
| User lacks `platform.users.CREATE` | Error/Auth | Unit with low-privilege role (`CASHIER`) |
| API returns duplicate email conflict | Error | Unit + typed client error path |
| Empty user list renders empty state | Edge | Unit/component |

**Sign-off required before implementation:** Test scenarios MUST be reviewed after API contract verification.

---

## API Contract Verification (MANDATORY before implementation)

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/users` | GET | `{ data: User[] }` envelope | ✅ | Runtime route verified in `apps/api/src/routes/users.ts`; pagination is client-side/legacy hook total fallback |
| `/api/users` | POST | `{ data: User }` envelope | ✅ | Runtime route verified; supports role codes and outlet role assignments |
| `/api/users/:id` | PATCH | `{ data: User }` envelope | ✅ | Runtime route verified for email updates; generated schema is stale |
| `/api/roles` | GET | `{ data: Role[] }` envelope | ✅ | Runtime/generated route available for role selector |
| `/api/outlets` | GET | `{ data: Outlet[] }` envelope | ✅ | Runtime/generated route available for outlet assignment |
| `/api/users/me` | GET | Effective user/session shape | ✅ | Runtime/generated route available; client falls back to role-derived effective permissions if `permissions` field is absent |

### API Gaps Found

| Gap | Impact | Resolution |
|-----|--------|------------|
| Generated schema omits some implemented user management routes (`PATCH /users/:id`, password/status endpoints) | Typed schema can drift from runtime API and user management hooks | Tracked as existing OpenAPI freshness P2; current hooks match runtime API routes in `apps/api/src/routes/users.ts` |

### Implementation Validation Snapshot (2026-05-18)

| Check | Result | Evidence |
|-------|--------|----------|
| Focused users tests | ✅ PASS — 45 tests | `logs/epic66-story66-1-validation-r5.log` |
| Full unit suite | ✅ PASS — 15 files, 417 tests | `logs/epic66-story66-1-validation-r5.log` |
| Lint | ✅ PASS | `logs/epic66-story66-1-validation-r5.log` |
| Typecheck | ✅ PASS | `logs/epic66-story66-1-validation-r5.log` |
| Build | ✅ PASS | `logs/epic66-story66-1-validation-r5.log` |

Reviewer GO is recorded with no P0/P1 blockers. Story 66-1 is done. Owner sign-off recorded on 2026-05-18.

---

## Acceptance Criteria

**AC1: User List Access**  
Given an admin with `platform.users.READ`,  
When they open the user management route,  
Then the page MUST render a paginated `EntityTable` with search and filters for role, outlet, and status.

**AC2: User Create**  
Given an admin with `platform.users.CREATE`,  
When they submit a valid email, name, outlet assignment, and role selection,  
Then the UI MUST send a typed create-user mutation and invalidate the user list cache after success.

**AC3: User Edit**  
Given an admin edits an existing user,  
When role, outlet scope, or status changes,  
Then a change summary review step MUST render before the mutation is sent.

**AC4: Permission Preview**  
Given an admin changes a role selection,  
When the role selection changes,  
Then the UI MUST show a permission preview using canonical `module.resource` permissions and masks.

**AC5: Deactivation UX**  
Given a user is deactivated,  
When the backend rejects that user's future login,  
Then the frontend MUST reflect inactive status and MUST NOT claim enforcement authority beyond backend validation.

**AC6: Authorization UX**  
Given a user lacks `platform.users.CREATE`, `platform.users.UPDATE`, or `platform.users.DELETE`,  
When the user management page renders,  
Then unavailable actions MUST be hidden or disabled according to the permission requirement.

**AC7: Tests**  
Given Story 66-1 is complete,  
When `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/users.test.ts` runs,  
Then form validation, permission preview, role assignment, and cache invalidation tests MUST pass.

---

## Tasks / Subtasks

- [ ] Verify user/role/outlet API contracts directly before UI implementation.
- [ ] Extend typed API client coverage for user CRUD if generated types are incomplete.
- [ ] Create user feature route and route definition with `platform.users.READ` guard.
- [ ] Create user list with `EntityTable` and server-side query parameters.
- [ ] Create user detail drawer using `DetailDrawer`.
- [ ] Create user create/edit form with identity, outlet assignment, and role selection sections.
- [ ] Create permission preview helper using canonical permission bits and masks.
- [ ] Create review modal summarizing before/after user changes.
- [ ] Add TanStack Query list/detail/mutation hooks and cache invalidation.
- [ ] Add unit tests for validation, permission preview, role assignment, denied actions, and cache invalidation.

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/routes/admin/users.tsx` | User management route component |
| `apps/backoffice/src/features/users/` | User management feature module |
| `apps/backoffice/__test__/unit/features/users.test.ts` | User management unit tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/app/router/routes.tsx` | Modify | Add user management route metadata if missing |
| `apps/backoffice/src/app/routes.ts` | Modify | Preserve legacy route compatibility if active router remains hash-based |
| `apps/backoffice/src/lib/api/client.ts` | Modify | Add typed wrappers only if generated paths are insufficient |

## Estimated Effort

3–4 days

## Risk Level

Medium

## Dependencies

- Epic 65 committed and validated.
- Explicit Epic 66 backoffice unfreeze approval.
- User/role/outlet API contract verification.

## Validation Evidence Required

- `npm run lint -w @jurnapod/backoffice`
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/users.test.ts`
- `npm run test:unit -w @jurnapod/backoffice`

## Technical Debt Review

- [ ] No `TODO`/`FIXME` comments left without linked TD item.
- [ ] No raw `fetch` bypasses typed client.
- [ ] No `as any` casts without documented justification.
- [ ] No duplicate table/filter/drawer primitives.
- [ ] No backend ACL behavior changes.
