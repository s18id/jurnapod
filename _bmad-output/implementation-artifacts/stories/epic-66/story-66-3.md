# Story 66-3: Company and Outlet Management with ScopeBadge

Status: planned (queued — execution requires explicit `apps/backoffice` unfreeze for Epic 66)

## Story

As a **platform or company administrator**,  
I want **company and outlet management surfaces with visible scope context**,  
So that **tenant and outlet administration remains explicit and safe**.

## Scope Boundary

- This story is PLANNING-ONLY until Ahmad explicitly lifts the `apps/backoffice` freeze for Epic 66.
- Backend company/outlet enforcement MUST remain authoritative.
- Company creation authority MUST remain aligned with backend ACL; frontend MUST NOT imply `COMPANY_ADMIN` can create companies unless backend contract allows it.
- `apps/pos` MUST NOT be modified.

## Context

Epic 65 delivered `ScopeBadge` and the outlet switcher. Story 66-3 applies those primitives to company and outlet administration and establishes page-level scope visibility for later domain screens.

---

## Pre-Implementation Gates

| Gate | Required State |
|------|----------------|
| API contract | Company and outlet list/detail/create/update/status endpoints verified |
| ACL model | `platform.companies` and `platform.outlets` permissions verified |
| Scope primitive | Epic 65 `ScopeBadge` available |

## Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Admin with `platform.companies.READ` views company list | Happy | Unit/component |
| Admin with `platform.outlets.READ` views outlet list for company | Happy | Unit/component |
| ScopeBadge updates after outlet switcher changes current outlet | Happy/Edge | Unit/component |
| User lacks `platform.companies.MANAGE` | Error/Auth | Unit with low-privilege role |
| Inactive company displays inactive outlet context | Edge | Unit/component |

---

## API Contract Verification (MANDATORY before implementation)

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/companies` | GET | `{ data: Company[], pagination?: Pagination }` | ❌ | Verify scope and SUPER_ADMIN behavior |
| `/api/companies/:id` | GET | `{ data: CompanyDetail }` | ❌ | Verify outlet relation availability |
| `/api/companies` | POST | `{ data: Company }` | ❌ | Verify required role and payload |
| `/api/companies/:id` | PATCH | `{ data: Company }` | ❌ | Verify status update shape |
| `/api/outlets` | GET | `{ data: Outlet[] }` | ❌ | Verify company filter contract |
| `/api/outlets` | POST | `{ data: Outlet }` | ❌ | Verify create contract |
| `/api/outlets/:id` | PATCH | `{ data: Outlet }` | ❌ | Verify update/status contract |

### API Gaps Found

| Gap | Impact | Resolution |
|-----|--------|------------|
| TBD after verification | TBD | Story MUST block or document approved workaround |

---

## Acceptance Criteria

**AC1: Company List**  
Given an admin with `platform.companies.READ`,  
When they open company management,  
Then the page MUST render a paginated company list with name, code, status, and creation date.

**AC2: Company Manage Permission**  
Given an admin with `platform.companies.MANAGE`,  
When they create or edit a company,  
Then the UI MUST send typed mutations and invalidate company cache on success.

**AC3: Outlet Management**  
Given an admin with `platform.outlets.READ`,  
When they open a company detail view,  
Then outlet list and outlet details MUST render with code, name, address, and status.

**AC4: Outlet Create/Edit**  
Given an admin with `platform.outlets.MANAGE`,  
When they submit outlet create/edit form,  
Then the UI MUST use typed mutation and invalidate outlet cache on success.

**AC5: Inactive Company Display**  
Given a company is inactive,  
When its detail page renders,  
Then associated outlets MUST display inactive context without implying backend deactivation cascade beyond verified contract.

**AC6: ScopeBadge Visibility**  
Given any company- or outlet-scoped page in this story,  
When the page renders,  
Then `ScopeBadge` or `ScopeDisplay` MUST show current company and outlet context.

**AC7: Outlet Switcher Integration**  
Given the shell outlet switcher changes selected outlet,  
When the page remains open,  
Then scope display MUST update to the selected outlet context.

---

## Tasks / Subtasks

- [ ] Verify company/outlet API contracts and ACL requirements.
- [ ] Create company list/detail route components.
- [ ] Create outlet list/create/edit components under company context.
- [ ] Integrate `ScopeBadge`/`ScopeDisplay` into company and outlet pages.
- [ ] Add TanStack Query hooks for company/outlet list/detail/mutations.
- [ ] Add permission-gated action affordances.
- [ ] Add unit tests for scope display, permission gating, cache invalidation, and inactive states.

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/routes/admin/companies.tsx` | Company management route component |
| `apps/backoffice/src/routes/admin/outlets.tsx` | Outlet management route component |
| `apps/backoffice/src/features/companies/` | Company feature module |
| `apps/backoffice/src/features/outlets/` | Outlet feature module |
| `apps/backoffice/__test__/unit/features/companies-outlets.test.ts` | Company/outlet unit tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/app/router/routes.tsx` | Modify | Add company/outlet route metadata if missing |
| `apps/backoffice/src/lib/api/client.ts` | Modify | Add typed wrappers only if generated paths are insufficient |

## Estimated Effort

3 days

## Risk Level

Low

## Dependencies

- Epic 65 shell and ScopeBadge primitives.
- Explicit Epic 66 backoffice unfreeze approval.
- Company/outlet API contract verification.

## Validation Evidence Required

- `npm run lint -w @jurnapod/backoffice`
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/companies-outlets.test.ts`
- `npm run test:unit -w @jurnapod/backoffice`

## Technical Debt Review

- [ ] No hidden cross-company action affordances.
- [ ] No hardcoded company or outlet IDs.
- [ ] No backend scope enforcement changes.
- [ ] No duplicate scope badge implementation.
