# Story 66-2: Role Management — Presets, Permission Matrix Editor, Change Review

Status: planned (queued — execution requires explicit `apps/backoffice` unfreeze for Epic 66)

## Story

As a **company administrator**,  
I want **a role management surface with a permission matrix and change review**,  
So that **role changes are understandable, auditable, and aligned with canonical permission bits**.

## Scope Boundary

- This story is PLANNING-ONLY until Ahmad explicitly lifts the `apps/backoffice` freeze for Epic 66.
- Backend ACL enforcement MUST NOT change.
- Permission bits, masks, modules, and resource names MUST match the canonical ACL model.
- System role mutation MUST NOT be enabled unless backend contract explicitly allows it.

## Context

Story 66-2 builds on Story 66-1 role assignment patterns. It introduces the `PermissionMatrix` pattern used by role editing and by later permission-aware navigation work.

---

## Pre-Implementation Gates

| Gate | Required State |
|------|----------------|
| Story 66-1 | Done or role assignment model formally approved |
| API contract | Role detail, role permission, role update, audit/change history endpoints verified |
| Canonical ACL | READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32 confirmed in code |

## Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Permission matrix renders all 8 canonical modules | Happy | Unit/component |
| CRUD(15) changed to READ(1) produces exact diff label | Happy | Unit |
| CRUDA(31) decomposes into READ + CREATE + UPDATE + DELETE + ANALYZE | Happy | Unit |
| System role renders read-only cells | Auth/Safety | Unit/component |
| Custom role allows editable cells and before/after review | Happy | Unit/component |
| User lacks `platform.roles.MANAGE` | Error/Auth | Unit with low-privilege role |

---

## API Contract Verification (MANDATORY before implementation)

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/roles` | GET | `{ data: Role[], pagination?: Pagination }` | ❌ | Verify role list shape |
| `/api/roles/:id` | GET | `{ data: RoleDetail }` | ❌ | Must include permissions or linked endpoint |
| `/api/roles/:id/permissions` | GET | `{ data: PermissionEntry[] }` | ❌ | Verify module/resource/mask fields |
| `/api/roles/:id/permissions` | PUT/PATCH | `{ data: RoleDetail }` | ❌ | Verify custom-role write contract |
| `/api/audit-logs` | GET | Role change history shape | ❌ | Used by Change History tab if available |

### API Gaps Found

| Gap | Impact | Resolution |
|-----|--------|------------|
| TBD after verification | TBD | Story MUST block or document approved workaround |

---

## Acceptance Criteria

**AC1: Role Detail Tabs**  
Given an admin with `platform.roles.READ`,  
When they open a role detail page,  
Then tabs for Overview, Permission Matrix, Outlet Scoping, and Change History MUST render.

**AC2: Canonical Matrix Coverage**  
Given the Permission Matrix tab,  
When the matrix loads,  
Then it MUST show all 8 canonical modules and configured resources using `module.resource` labels.

**AC3: Bit and Mask Correctness**  
Given permission bits are displayed,  
When a user selects READ, WRITE, CRUD, CRUDA, or CRUDAM,  
Then the displayed mask MUST match canonical values READ=1, WRITE=6, CRUD=15, CRUDA=31, CRUDAM=63.

**AC4: Diff Review**  
Given a cell changes from CRUD to READ,  
When the user attempts to save,  
Then the review step MUST show `module.resource: CRUD(15) → READ(1)` before sending mutation.

**AC5: System Role Safety**  
Given a system role such as `CASHIER`,  
When the matrix renders,  
Then cells MUST be read-only and a System Role badge MUST render.

**AC6: Custom Role Editing**  
Given a custom role and an admin with `platform.roles.MANAGE`,  
When the admin changes permission masks,  
Then the UI MUST allow edits, show before/after diff, and send typed mutation only after confirmation.

**AC7: Tests**  
Given Story 66-2 is complete,  
When permission matrix unit tests run,  
Then bit-to-mask, mask-to-bits, diff calculation, and readonly enforcement tests MUST pass.

---

## Tasks / Subtasks

- [ ] Verify role and permission API contracts.
- [ ] Define frontend role and permission view models from typed API types.
- [ ] Create PermissionMatrix component in `components/permissions/`.
- [ ] Create permission bit/mask helpers with unit tests.
- [ ] Create role detail route with tabs.
- [ ] Create role change review modal with grouped diffs by module.
- [ ] Add system role readonly enforcement.
- [ ] Add TanStack Query role list/detail/mutation hooks.
- [ ] Add unit tests for permission math, matrix rendering, diff output, and authorization affordances.

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/routes/admin/roles.tsx` | Role management route component |
| `apps/backoffice/src/features/roles/` | Role management feature module |
| `apps/backoffice/src/components/permissions/PermissionMatrix.tsx` | Permission matrix component |
| `apps/backoffice/__test__/unit/permission-matrix.test.ts` | Permission matrix unit tests |
| `apps/backoffice/__test__/unit/permission-bits.test.ts` | Permission bit/mask unit tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/app/router/routes.tsx` | Modify | Add role route metadata if missing |
| `apps/backoffice/src/lib/api/client.ts` | Modify | Add typed wrappers only if generated paths are insufficient |

## Estimated Effort

4–5 days

## Risk Level

High

## Dependencies

- Story 66-1 role assignment pattern.
- Explicit Epic 66 backoffice unfreeze approval.
- Role permission API contract verification.

## Validation Evidence Required

- `npm run lint -w @jurnapod/backoffice`
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/permission-bits.test.ts`
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/permission-matrix.test.ts`
- `npm run test:unit -w @jurnapod/backoffice`

## Technical Debt Review

- [ ] No hardcoded permission values outside canonical helper constants.
- [ ] No system-role mutation affordance without backend contract.
- [ ] No duplicate permission matrix implementations.
- [ ] No backend ACL behavior changes.
