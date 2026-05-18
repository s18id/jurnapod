# Story 66-1 Completion Report

**Story:** User Management — List, Create, Edit, Role Assignment, Outlet Scoping  
**Epic:** 66 - Backoffice Core Admin — Users, Roles, Companies, Permissions UX  
**Status:** done — implementation validation passed; reviewer GO recorded; owner sign-off recorded  
**Review Date:** 2026-05-18

---

## Summary

Story 66-1 implementation extends the existing backoffice user management screen with permission-gated actions, role/outlet assignment during user creation, access-change review before role/outlet writes, and canonical permission previews derived from Epic 39 `module.resource` role grants.

Backend ACL enforcement remains authoritative. No backend route behavior was changed. `apps/pos` was not modified.

Owner sign-off recorded on 2026-05-18.

---

## Files Created/Modified

### Created
| File | Description |
|------|-------------|
| `apps/backoffice/src/features/users/access-review.ts` | Pure access review helpers for global role changes, outlet role changes, and permission diffs |

### Modified
| File | Changes |
|------|---------|
| `apps/backoffice/src/features/users-page.tsx` | Added permission-gated user actions, role/outlet assignment in create flow, permission preview, and review-before-write modal for access changes |
| `apps/backoffice/src/features/users/admin-helpers.ts` | Aligned deactivate/reactivate action gate with backend `platform.users.DELETE` requirement |
| `apps/backoffice/__test__/unit/features/users.test.ts` | Added access review and DELETE-gated deactivate tests |
| `_bmad-output/implementation-artifacts/stories/epic-66/story-66-1.md` | Updated status, contract verification notes, and validation evidence |

---

## Acceptance Criteria Status

| AC | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | User list with search/filter/status/role/outlet controls | ✅ Complete | Existing UsersPage table/filter surface preserved; `EntityTable` wrapper now used |
| AC2 | User create with email, role selection, outlet assignment, cache refresh | ✅ Complete | Create dialog includes global role and outlet role assignment; existing create mutation and refetch remain in place |
| AC3 | Existing user role/outlet/status changes require review before mutation | ✅ Complete for access changes | Access edits open `Review Access Changes` before role/outlet writes; status changes remain confirmation-modal gated |
| AC4 | Permission preview from canonical permissions | ✅ Complete | `previewAccessPermissions()` derives role permission preview from canonical `ROLE_PERMISSION_MATRIX` via `permissionsFromRoleCodes()` |
| AC5 | Deactivation UX does not claim enforcement authority beyond backend | ✅ Complete | UI reflects active/inactive status and uses backend routes for deactivation/reactivation |
| AC6 | Authorization UX hides/disables unavailable actions by permission | ✅ Complete | Add/edit/access/password/status actions are gated by `platform.users` permissions |
| AC7 | Tests | ✅ Complete | Focused users tests pass: 45 tests |

---

## Validation Evidence

| Check | Result | Evidence |
|-------|--------|----------|
| Focused users tests | ✅ PASS — 45 tests | `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/users.test.ts` |
| ESLint | ✅ PASS | `npm run lint -w @jurnapod/backoffice` |
| Typecheck | ✅ PASS | `npm run typecheck -w @jurnapod/backoffice` |
| Build | ✅ PASS | `npm run build -w @jurnapod/backoffice` |
| Full unit suite | ✅ PASS — 15 files, 417 tests | `npm run test:unit -w @jurnapod/backoffice` |

Evidence log: `logs/epic66-story66-1-validation-r5.log`

---

## Review Status

Independent reviewer GO was recorded after `bmad-review` delegation.

Reviewer verdict: **GO**. Reviewer GO: no P0/P1 blockers.

Review P2 findings were addressed before final validation:

| Severity | Finding | Resolution |
|----------|---------|------------|
| P2 | Reactivate menu missed SUPER_ADMIN safeguard | Fixed: reactivate is disabled for SUPER_ADMIN targets |
| P2 | SUPER_ADMIN actor role-level calculation produced empty role dropdowns | Fixed: SUPER_ADMIN uses unbounded role level for non-SUPER_ADMIN assignable roles |
| P2 | `isSuperAdmin` checked only `user.roles` | Fixed: check now includes `user.global_roles` |
| P2 | Menu telemetry used `success` before mutation completion | Fixed: pre-mutation menu action success tracking removed |
| P2 | Access confirmation did not re-check self-modification | Fixed: confirmation handler now re-verifies self-protection before writes |

Story 66-1 owner sign-off recorded on 2026-05-18.

---

## Known Limitations and Follow-Ups

| Severity | Finding | Status |
|----------|---------|--------|
| P2 | Generated OpenAPI schema omits some runtime user routes such as `PATCH /users/:id`, password, and status endpoints | Existing OpenAPI freshness debt; runtime routes verified in `apps/api/src/routes/users.ts` |
| P2 | User display-name/full-name field is not present in current shared/runtime user contract, while Story 66-1 AC text mentions name | Backend/shared contract alignment required before a name field can be added to UI writes |
| P3 | Access review is covered by pure helper tests, not component-level modal interaction tests | Component test coverage MAY be added when a stable component test harness exists |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-18 | 0.1 | Created review-state completion report with validation evidence |
| 2026-05-18 | 0.2 | Recorded reviewer GO, P2 fixes, and final validation evidence |
| 2026-05-18 | 0.3 | Owner sign-off recorded; story marked done |

---

**Story is DONE.**
