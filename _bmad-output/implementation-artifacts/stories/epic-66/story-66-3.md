# Story 66-3: Company and Outlet Management with ScopeBadge

Status: done (targeted BMAD re-review GO recorded; owner sign-off recorded 2026-05-18)

## Story

As a **platform or company administrator**,  
I want **company and outlet management surfaces with visible scope context**,  
So that **tenant and outlet administration remains explicit and safe**.

## Scope Boundary

- Ahmad approved Epic 66 implementation on 2026-05-17; `apps/backoffice` is unfrozen for Epic 66 scope only.
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
| `/api/companies` | GET | `{ success: true, data: CompanyData[] }` | ✅ | Generated contract exposes all-company list for `SUPER_ADMIN`; others receive authenticated company scope. Query filters are not typed in generated client. |
| `/api/companies/:id` | GET | `{ success: true, data: CompanyData }` | ✅ | Generated contract exposes company detail only; no outlet relation is present. |
| `/api/companies` | POST | `{ success: true, data: CompanyData }` | ✅ | Generated contract describes super-admin-only company creation and typed `CreateCompanyRequest`; UI gates create affordance to `SUPER_ADMIN` plus `platform.companies.MANAGE`. |
| `/api/companies/:id` | PATCH | `{ success: true, data: CompanyData }` | ✅ | Generated contract supports company profile fields; status update is not typed on `UpdateCompanyRequest`. |
| `/api/outlets` | GET | `{ success: boolean, data: Outlet[] }` | ✅ | Generated contract lists outlets for authenticated company; no `company_id` query filter is typed. |
| `/api/outlets` | POST | `{ success: boolean, data: Outlet }` | ✅ | Generated contract supports typed create payload with optional `company_id`; UI sends current company only. |
| `/api/outlets/:id` | PATCH | `{ success: boolean, data: Outlet }` | ✅ | Generated contract supports typed update payload including `is_active`. |

### API Gaps Found

| Gap | Impact | Resolution |
|-----|--------|------------|
| Generated `/companies` and `/outlets` contracts do not expose runtime query filters (`is_active`, `company_id`). | P2: UI cannot safely rely on server-side filters through typed client. | Client-side filtering is used for list status/search; cross-company outlet list remains blocked. |
| Generated company schema lacks runtime `deleted_at`. | P2: inactive/deleted context may be underrepresented in generated types. | UI helper accepts optional `deleted_at` and treats it as inactive when present. |
| Company detail endpoint does not include outlet relation. | P2: company detail cannot hydrate associated outlets from company payload. | Outlet context is fetched separately under current company scope only. |
| Generated GET `/outlets` lacks safe `company_id` query typing. | P2: super-admin cross-company outlet list is not safe through typed client. | Cross-company outlet lists remain blocked in UI with an explicit unavailable-state alert. |

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

- [x] Verify company/outlet API contracts and ACL requirements.
- [x] Create company list/detail route components.
- [x] Create outlet list/create/edit components under company context.
- [x] Integrate `ScopeBadge`/`ScopeDisplay` into company and outlet pages.
- [x] Add TanStack Query hooks for company/outlet list/detail/mutations.
- [x] Add permission-gated action affordances.
- [x] Add unit tests for scope display, permission gating, cache invalidation, and inactive states.
- [x] Review follow-up: Align `/companies` route `allowedRoles` with canonical `platform.companies.READ` role metadata while preserving backend ACL authority.
- [x] Review follow-up: Make outlet timezone select deterministic and non-clearable, matching company timezone behavior.
- [x] Review follow-up: Add deterministic `UTC` default to `emptyOutletForm` and focused helper coverage.

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

- [x] No hidden cross-company action affordances.
- [x] No hardcoded company or outlet IDs.
- [x] No backend scope enforcement changes.
- [x] No duplicate scope badge implementation.

---

## Dev Agent Record

### Debug Log

| Date | Item | Evidence |
|------|------|----------|
| 2026-05-18 | Inspected Story 66-3 lint log | `logs/epic66-story66-3-lint-backoffice.log` — no ESLint failures emitted |
| 2026-05-18 | Ran Story 66-3 build gate | `logs/epic66-story66-3-build-backoffice.log` — Vite build completed |
| 2026-05-18 | Ran Story 66-3 unit regression gate | `logs/epic66-story66-3-unit-backoffice.log` — 16 files / 435 tests passed |
| 2026-05-18 | Applied consolidated review GO follow-ups | Route metadata, outlet timezone fallback, and helper tests updated after GO/no P0-P1 blockers |
| 2026-05-18 | Ran Story 66-3 focused r3 validation | `logs/epic66-story66-3-companies-outlets-focused-r3.log` — 1 file / 11 tests passed; `logs/epic66-story66-3-route-permissions-r3.log` — 1 file / 74 tests passed |
| 2026-05-18 | Ran Story 66-3 backoffice r3 gates | `logs/epic66-story66-3-lint-backoffice-r3.log`, `logs/epic66-story66-3-typecheck-backoffice-r3.log`, and `logs/epic66-story66-3-build-backoffice-r3.log` passed |

### Completion Notes

- Company and outlet admin surfaces consume typed generated API paths through Story 66-3 query/mutation wrappers.
- Page-level `ScopeDisplay` uses current shell outlet state, so outlet switcher changes are reflected in company and outlet context display.
- Create/edit affordances are gated by `platform.companies.MANAGE` or `platform.outlets.MANAGE` plus frontend mirrors of verified backend scope semantics; backend ACL remains authoritative.
- Cross-company outlet listing remains intentionally blocked because generated GET `/outlets` has no typed `company_id` query contract.
- `apps/pos` remained untouched; `git status --short -- apps/pos` returned no paths.
- Consolidated review verdict was GO with no P0/P1 blockers; review follow-up fixes were applied while keeping story status in `review`.
- Targeted follow-up re-review verdict was GO with zero P0/P1/P2/P3 findings; story remains pending owner sign-off.
- `/companies` coarse route metadata now includes canonical `platform.companies.READ`-capable roles (`SUPER_ADMIN`, `OWNER`, `COMPANY_ADMIN`, `ADMIN`, `ACCOUNTANT`); resource permission metadata still performs deny-by-default UX filtering and backend ACL remains authoritative.
- Outlet timezone form behavior now matches company timezone behavior: deterministic `UTC` fallback, no clear/deselect path, and required visual affordance.

### Validation Evidence

| Command | Result | Log |
|---------|--------|-----|
| `npm run lint -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-3-lint-backoffice.log` |
| `npm run typecheck -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-3-typecheck-backoffice.log` |
| `npm run build -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-3-build-backoffice.log` |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/companies-outlets.test.ts` | ✅ PASS — 1 file / 10 tests | `logs/epic66-story66-3-companies-outlets-focused-r2.log` |
| `npm run test:unit -w @jurnapod/backoffice` | ✅ PASS — 16 files / 435 tests | `logs/epic66-story66-3-unit-backoffice.log` |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/companies-outlets.test.ts` | ✅ PASS — 1 file / 11 tests | `logs/epic66-story66-3-companies-outlets-focused-r3.log` |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-router-guards-permissions.test.ts` | ✅ PASS — 1 file / 74 tests | `logs/epic66-story66-3-route-permissions-r3.log` |
| `npm run lint -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-3-lint-backoffice-r3.log` |
| `npm run typecheck -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-3-typecheck-backoffice-r3.log` |
| `npm run build -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-3-build-backoffice-r3.log` |

## File List

| File | Action |
|------|--------|
| `apps/backoffice/src/features/companies-outlets/admin-helpers.ts` | Created Story 66-3 permission/scope/status helpers |
| `apps/backoffice/src/features/companies-outlets/api.ts` | Created typed company/outlet query and mutation wrappers |
| `apps/backoffice/src/features/companies-page.tsx` | Reworked company management surface with scope display and permission-gated actions |
| `apps/backoffice/src/features/outlets-page.tsx` | Reworked outlet management surface with scope display, inactive context, and blocked cross-company outlet gap state |
| `apps/backoffice/src/app/routes.ts` | Aligned `/companies` coarse route roles with canonical `platform.companies.READ` role metadata |
| `apps/backoffice/src/routes/admin/companies.tsx` | Created admin company route export |
| `apps/backoffice/src/routes/admin/outlets.tsx` | Created admin outlet route export |
| `apps/backoffice/src/main.tsx` | Wrapped `AppRouter` with `QueryProvider` |
| `apps/backoffice/vitest.config.ts` | Added Story 66-3 focused unit test to Vitest include list |
| `apps/backoffice/__test__/unit/features/companies-outlets.test.ts` | Added unit coverage for gates, scope summaries, inactive labels, and query keys |
| `apps/backoffice/__test__/unit/app-router-guards-permissions.test.ts` | Added `/companies` route role metadata coverage |
| `_bmad-output/implementation-artifacts/stories/epic-66/story-66-3.md` | Updated Story 66-3 status, API verification, evidence, and records |
| `_bmad-output/implementation-artifacts/stories/epic-66/story-66-3.completion.md` | Created review-state completion report |
| `_bmad-output/implementation-artifacts/stories/epic-66/epic-66-coordination.md` | Updated Story 66-3 coordination status and evidence |

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-18 | 1.0 | Implemented company/outlet management surfaces with ScopeDisplay, typed query/mutation wrappers, permission gating, and focused unit coverage. |
| 2026-05-18 | 1.1 | Completed validation/docs batch, documented P2 API contract gaps, and moved story to review-ready state. |
| 2026-05-18 | 1.2 | Applied consolidated review GO follow-up fixes for route metadata alignment, outlet timezone determinism, and focused r3 validation. |
| 2026-05-18 | 1.3 | Recorded targeted follow-up re-review GO with zero P0/P1/P2/P3 findings; story remains pending owner sign-off. |
