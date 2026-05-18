# Story 66-2 Completion Report

**Story:** Role Management — Presets, Permission Matrix Editor, Change Review  
**Epic:** 66 - Backoffice Core Admin — Users, Roles, Companies, Permissions UX  
**Status:** done — targeted BMAD re-review GO recorded; owner sign-off recorded  
**Review Date:** 2026-05-18

---

## Summary

Story 66-2 delivers role management permission editing with canonical ACL masks, role-permission API contracts, system-role immutability, and grouped review-before-write behavior for custom company roles.

Backend ACL enforcement remains authoritative. Role permission writes are guarded by `platform.roles.MANAGE`, reads are guarded by `platform.roles.READ`, system/global roles remain immutable, and batch permission replacement is transaction-backed.

BMAD Review NO-GO P1/P2 findings are resolved in this revision. Targeted BMAD re-review returned GO with no blockers. Story status remains `review` until owner sign-off is recorded.

`apps/pos` was not modified.

Owner sign-off recorded on 2026-05-18.

---

## Files Created/Modified

### Created

| File | Description |
|------|-------------|
| `apps/backoffice/src/features/roles/role-detail-shell.tsx` | Role detail shell with Overview, Permission Matrix, Outlet Scoping, and Change History tabs |
| `apps/api/__test__/integration/users/role-permissions.test.ts` | DB-backed integration coverage for role permission read/write contracts |

### Modified

| File | Changes |
|------|---------|
| `packages/shared/src/schemas/module-roles.ts` | Added canonical `purchasing` module alignment and role-permission schemas |
| `apps/api/src/lib/users.ts` | Added transaction-backed role permission listing/replacement support; r6 fix preserves unknown/non-canonical legacy rows while deleting/replacing canonical rows only |
| `apps/api/src/routes/roles.ts` | Added `GET` and `PUT /api/roles/:id/permissions` with resource-level ACL guards |
| `apps/backoffice/src/lib/auth/permissions.ts` | Added grouped permission diff helper and reused canonical permission constants |
| `apps/backoffice/src/components/permissions/PermissionMatrix.tsx` | Supported editable custom-role matrix behavior and readonly system-role behavior |
| `apps/backoffice/src/components/permissions/index.ts` | Export alignment for permission components/helpers |
| `apps/backoffice/src/features/roles-page.tsx` | Added View action and role detail shell integration; r6 fix uses canonical `SYSTEM_ROLE_CODES` import |
| `apps/backoffice/src/hooks/use-users.ts` | Added role detail and role-permission fetch/mutation hooks |
| `apps/backoffice/src/features/module-roles-page.tsx` | Added `purchasing` display label after shared schema alignment |
| `apps/backoffice/src/app/routes.ts` | Added `/roles/:id` route lookup support |
| `apps/backoffice/src/app/router.tsx` | Added role detail rendering support |
| `apps/backoffice/__test__/unit/permission-bits.test.ts` | Added grouped diff tests |
| `apps/backoffice/__test__/unit/permission-matrix.test.ts` | Added role detail shell, editable flow, and readonly enforcement tests |
| `_bmad-output/implementation-artifacts/stories/epic-66/story-66-2.md` | Updated status, API verification, dev record, validation evidence, and file list |
| `_bmad-output/implementation-artifacts/stories/epic-66/epic-66-coordination.md` | Updated Story 66-2 review readiness, resolved PermissionMatrix integration follow-up, and recorded r6 NO-GO fix evidence |

---

## Acceptance Criteria Status

| AC | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Role detail tabs render | ✅ Complete | Role detail shell renders Overview, Permission Matrix, Outlet Scoping, and Change History tabs |
| AC2 | Canonical matrix coverage | ✅ Complete | `PermissionMatrix` uses canonical module/resource definitions including all 8 canonical modules |
| AC3 | Bit and mask correctness | ✅ Complete | `PERMISSION_BITS` and `PERMISSION_MASKS` tests pass; READ=1, WRITE=6, CRUD=15, CRUDA=31, CRUDAM=63 |
| AC4 | Diff review | ✅ Complete | Custom-role changes show grouped before/after diffs before mutation |
| AC5 | System role safety | ✅ Complete | System/global roles are readonly in UI and immutable in backend write contract |
| AC6 | Custom role editing | ✅ Complete | Custom company roles can edit permissions only with `platform.roles.MANAGE`; mutation uses typed `PUT /api/roles/:id/permissions` after confirmation |
| AC7 | Tests | ✅ Complete | Focused API/backoffice tests and unit suite passed |

---

## Validation Evidence

| Check | Result | Evidence |
|-------|--------|----------|
| Shared/libs build | ✅ PASS | `logs/epic66-story66-2-build-libs-r6.log` |
| API role-permission integration | ✅ PASS — 1 file / 11 tests | `logs/epic66-story66-2-api-role-permissions-r6.log` |
| Backoffice focused permission tests | ✅ PASS — 2 files / 99 tests | `logs/epic66-story66-2-backoffice-focused-r6.log` |
| API typecheck | ✅ PASS | `logs/epic66-story66-2-typecheck-api-r6.log` |
| API build | ✅ PASS | `logs/epic66-story66-2-build-api-r6.log` |
| API lint | ✅ PASS with existing warning baseline | `logs/epic66-story66-2-lint-api-r6.log` |
| Backoffice typecheck | ✅ PASS | `logs/epic66-story66-2-typecheck-backoffice-r6.log` |
| Backoffice build | ✅ PASS | `logs/epic66-story66-2-build-backoffice-r6.log` |
| Backoffice lint | ✅ PASS | `logs/epic66-story66-2-lint-backoffice-r6.log` |

---

## Review Status

Initial BMAD Review returned NO-GO with three P1 findings and required P2 fixes. The r6 implementation resolved the requested P1/P2 items.

Targeted BMAD re-review verdict: **GO**. Reviewer GO: no P0/P1 blockers and all required P2 fixes resolved.

Story 66-2 owner sign-off recorded on 2026-05-18.

---

## Known Limitations and Follow-Ups

| Severity | Finding | Status |
|----------|---------|--------|
| P2 | Role change-history read contract is not consumed by Story 66-2 | Deferred; Change History tab renders an explicit unavailable state. Role permission writes emit audit updates, but history display MUST wait for audit/change-history contract work. |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-18 | 0.1 | Created review-state completion report with API/backoffice validation evidence |
| 2026-05-18 | 0.2 | Applied BMAD Review NO-GO fixes and refreshed r6 validation evidence; story remains in review pending re-review |
| 2026-05-18 | 0.3 | Recorded targeted BMAD re-review GO; story remains in review pending owner sign-off |
| 2026-05-18 | 0.4 | Owner sign-off recorded; story marked done |

---

**Story is DONE.**
