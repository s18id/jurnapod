# Story 66-3 Completion Report

**Story:** Company and Outlet Management with ScopeBadge  
**Epic:** 66 - Backoffice Core Admin — Users, Roles, Companies, Permissions UX  
**Status:** done — targeted BMAD re-review GO recorded; owner sign-off recorded
**Completed:** 2026-05-18

---

## Summary

Story 66-3 adds company and outlet administration surfaces for approved Epic 66 backoffice scope. The UI renders explicit company/outlet context, gates management affordances by resource-level ACL, uses typed generated API calls, documents verified API contract gaps, and has consolidated review GO follow-up fixes applied. Targeted follow-up re-review returned GO with zero P0/P1/P2/P3 findings. Owner sign-off recorded on 2026-05-18.

---

## Files Created/Modified

### Created

| File | Description |
|------|-------------|
| `apps/backoffice/src/features/companies-outlets/admin-helpers.ts` | Company/outlet permission gates, inactive status helpers, and scope summary helpers |
| `apps/backoffice/src/features/companies-outlets/api.ts` | Typed company/outlet query and mutation wrappers with TanStack Query cache keys |
| `apps/backoffice/src/routes/admin/companies.tsx` | Company admin route export |
| `apps/backoffice/src/routes/admin/outlets.tsx` | Outlet admin route export |
| `apps/backoffice/__test__/unit/features/companies-outlets.test.ts` | Focused unit tests for permission gates, scope summaries, inactive labels, and query keys |
| `_bmad-output/implementation-artifacts/stories/epic-66/story-66-3.completion.md` | Review-state completion report |

### Modified

| File | Changes |
|------|---------|
| `apps/backoffice/src/features/companies-page.tsx` | Company management surface with list, detail drawer, create/edit modal, ScopeDisplay, and permission gates |
| `apps/backoffice/src/features/outlets-page.tsx` | Outlet management surface with list, detail drawer, create/edit modal, inactive context, cross-company gap alert, and deterministic timezone select behavior |
| `apps/backoffice/src/app/routes.ts` | `/companies` route metadata aligned with canonical `platform.companies.READ` role coverage while preserving resource permission filtering |
| `apps/backoffice/src/main.tsx` | Wrapped AppRouter with QueryProvider |
| `apps/backoffice/vitest.config.ts` | Added Story 66-3 focused unit test to unit include list |
| `apps/backoffice/__test__/unit/app-router-guards-permissions.test.ts` | Added `/companies` route role metadata coverage |
| `_bmad-output/implementation-artifacts/stories/epic-66/story-66-3.md` | Updated status, API verification, task checkboxes, validation evidence, file list, and change log |
| `_bmad-output/implementation-artifacts/stories/epic-66/epic-66-coordination.md` | Updated Story 66-3 coordination status, validation evidence, and gaps |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Company list renders name, code, status, and creation date | ✅ Complete |
| AC2 | Company manage affordances send typed mutations and invalidate cache | ✅ Complete |
| AC3 | Outlet list/details render code, name, address, and status | ✅ Complete |
| AC4 | Outlet create/edit uses typed mutation and invalidates outlet cache | ✅ Complete |
| AC5 | Inactive company context is displayed without implying backend cascade | ✅ Complete |
| AC6 | Company/outlet pages show scope context | ✅ Complete |
| AC7 | Scope display reflects shell outlet switcher state | ✅ Complete |

---

## API Endpoints Used

- `GET /companies` — company list
- `GET /companies/{id}` — company detail
- `POST /companies` — company create
- `PATCH /companies/{id}` — company update
- `GET /outlets` — authenticated-company outlet list
- `POST /outlets` — outlet create
- `PATCH /outlets/{id}` — outlet update/status

---

## Validation Evidence

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

---

## Consolidated Review Follow-up Fixes

| Severity | Follow-up | Resolution |
|----------|-----------|------------|
| P2 | `/companies` route `allowedRoles` did not include all canonical roles that can satisfy `platform.companies.READ`. | `allowedRoles` now includes `SUPER_ADMIN`, `OWNER`, `COMPANY_ADMIN`, `ADMIN`, and `ACCOUNTANT`; route permission metadata and backend ACL remain authoritative. |
| P2 | Outlet timezone select allowed clear/deselect behavior unlike company timezone. | Outlet timezone select now uses deterministic `UTC` fallback, `allowDeselect={false}`, and required visual affordance. |
| P3 | `emptyOutletForm` lacked explicit timezone default. | `emptyOutletForm.timezone` now defaults to `UTC` through the shared admin timezone fallback helper. |

---

## Known Limitations / Follow-ups

| Severity | Gap | Handling |
|----------|-----|----------|
| P2 | Generated `/companies` and `/outlets` contracts do not expose runtime query filters (`is_active`, `company_id`). | UI performs local status/search filters; cross-company outlet lists remain blocked. |
| P2 | Generated company schema lacks runtime `deleted_at`. | Helper accepts optional `deleted_at` and treats it as inactive when present. |
| P2 | Company detail endpoint does not include outlet relation. | Outlet context is fetched separately only for current company scope. |
| P2 | Generated GET `/outlets` lacks safe `company_id` query typing. | Super-admin cross-company outlet list remains an explicit unavailable state. |

---

## Security / Scope Notes

- Backend ACL remains authoritative; frontend permission checks are UX affordance gates only.
- Consolidated review verdict: GO with no P0/P1 blockers.
- Targeted follow-up re-review verdict: GO with zero P0/P1/P2/P3 findings.
- Company creation affordance requires `platform.companies.MANAGE` and `SUPER_ADMIN` semantics.
- Outlet create/edit affordances require `platform.outlets.MANAGE` and target company scope compatibility.
- `apps/pos` remained untouched; `git status --short -- apps/pos` returned no paths.

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-18 | 1.0 | Implemented company/outlet management surfaces, ScopeDisplay integration, typed query/mutation wrappers, permission gates, and focused unit tests. |
| 2026-05-18 | 1.1 | Completed validation/docs batch, documented P2 gaps, and prepared Story 66-3 for consolidated review. |
| 2026-05-18 | 1.2 | Applied consolidated review GO follow-ups and r3 focused/backoffice validation. |
| 2026-05-18 | 1.3 | Recorded targeted follow-up re-review GO; story remains pending owner sign-off. |
| 2026-05-18 | 1.4 | Owner sign-off recorded; story marked done |

---

**Story is DONE.**
