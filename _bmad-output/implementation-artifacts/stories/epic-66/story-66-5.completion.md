# Story 66-5 Completion Report

**Story:** Audit Log Explorer  
**Epic:** 66 - Backoffice Core Admin — Users, Roles, Companies, Permissions UX  
**Status:** done — consolidated reviewer GO and targeted P2 re-review GO recorded; owner sign-off recorded  
**Completed for review:** 2026-05-18

---

## Summary

Story 66-5 now provides read-only generic audit log list/detail access, Backoffice audit explorer wiring, canonical `success` filtering, tenant-scoped API reads, and half-open date range filtering. Consolidated review returned GO with no P0/P1 blockers, and targeted P2 re-review returned GO with zero findings. No audit write paths were introduced.

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Audit list renders timestamp, actor, action, object type, object ID, summary, and scope columns | ✅ Complete |
| AC2 | Filters request typed audit list and refresh via deterministic query key | ✅ Complete |
| AC3 | Date range filtering uses half-open interval semantics | ✅ Complete |
| AC4 | Detail drawer shows actor/object details and before/after diff where available | ✅ Complete |
| AC5 | Default page size is 25 | ✅ Complete |
| AC6 | Missing audit READ permission denies access and hides action affordances | ✅ Complete |
| AC7 | Audit outcome filtering uses `success`, not `result` | ✅ Complete |

---

## Files Created/Modified

### Created

| File | Description |
|------|-------------|
| `apps/api/__test__/integration/audit/audit-logs.test.ts` | DB-backed integration tests for generic read-only audit endpoints. |
| `apps/api/src/routes/audit-logs.ts` | Generic read-only audit list/detail route and OpenAPI registration helper. |
| `apps/backoffice/src/features/audit/api.ts` | Backoffice audit API hooks and query keys. |
| `apps/backoffice/src/features/audit/audit-helpers.ts` | Audit filter serialization, date conversion, query key, and diff helpers. |
| `apps/backoffice/src/routes/admin/audit.tsx` | Admin route wrapper for audit explorer. |
| `_bmad-output/implementation-artifacts/stories/epic-66/story-66-5.completion.md` | Review-ready completion evidence. |

### Modified

| File | Changes |
|------|---------|
| `apps/api/src/app.ts` | Mounted `/api/audit-logs`. |
| `apps/api/src/lib/audit-logs.ts` | Delegated audit reads to platform query support. |
| `apps/api/src/routes/openapi-aggregator.ts` | Registered generic audit OpenAPI paths. |
| `apps/backoffice/__test__/unit/features/audit.test.ts` | Added audit helper/API/permission unit coverage. |
| `apps/backoffice/src/app/routes.ts` | Added audit route permission metadata. |
| `apps/backoffice/src/features/audit/api.ts` | Removed redundant `company_id` query parameter forwarding while preserving company-scoped query keys. |
| `apps/backoffice/src/features/audit/audit-helpers.ts` | Removed redundant `company_id` search param serialization from request params. |
| `apps/backoffice/src/features/audit-logs-page.tsx` | Wired real audit list/detail hooks, filters, table, and detail drawer. |
| `packages/modules/platform/src/audit/query.ts` | Added actor/action/entity/outlet/success/from_ts/to_ts query support. |
| `packages/shared/src/schemas/audit-logs.ts` | Added shared audit query fields for generic filters. |
| `_bmad-output/implementation-artifacts/stories/epic-66/story-66-5.md` | Updated status, API verification, ACL decision, validation evidence, and Dev Agent Record. |
| `_bmad-output/implementation-artifacts/stories/epic-66/epic-66-coordination.md` | Updated Story 66-5 review-ready coordination state. |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Story status moved to `review` by canonical utility. |

---

## Technical Implementation

- API endpoints: `GET /api/audit-logs`, `GET /api/audit-logs/:id`.
- ACL: `platform.settings.READ` verified and used by API route and Backoffice route metadata.
- Tenant scope: authenticated `auth.companyId` is authoritative; query `company_id` cannot override tenant scope.
- Backoffice request params: redundant `company_id` query parameter removed from audit list requests; tenant scoping remains represented in TanStack Query keys and enforced by backend auth context.
- Filters: `actor_user_id`, `action`, `entity_type`, `entity_id`, `outlet_id`, `success`, `from_ts`, `to_ts`, `limit`, `offset`.
- Date filtering: `created_at >= from_ts` and `created_at < to_ts`.
- Invalid date ranges: `from_ts >= to_ts` returns 400 and is DB-backed integration-tested.
- Canonical audit outcome: filtering uses `success`; `result` is response compatibility/display only.

---

## Validation Evidence

| Command | Result | Evidence |
|---------|--------|----------|
| `npm run build -w @jurnapod/shared` | ✅ PASS | `logs/epic66-story66-5-build-shared.log` |
| `npm run build -w @jurnapod/modules-platform` | ✅ PASS | `logs/epic66-story66-5-build-platform-r2.log` |
| `npm run typecheck -w @jurnapod/api` | ✅ PASS | `logs/epic66-story66-5-typecheck-api-r2.log` |
| `npm run lint -w @jurnapod/api` | ✅ PASS | `logs/epic66-story66-5-lint-api-r3.log` — 0 errors; 157 pre-existing warnings |
| `npm run build -w @jurnapod/api` | ✅ PASS | `logs/epic66-story66-5-build-api-r3.log` |
| `npm run test:single -w @jurnapod/api -- __test__/integration/audit/audit-logs.test.ts` | ✅ PASS | `logs/epic66-story66-5-api-audit-logs-r5.log` — 1 file / 10 tests |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/audit.test.ts` | ✅ PASS | `logs/epic66-story66-5-audit-focused-r4.log` — 1 file / 65 tests |
| `npm run lint -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-5-lint-backoffice-r4.log` |
| `npm run typecheck -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-5-typecheck-backoffice-r4.log` |
| `npm run build -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-5-build-backoffice-r3.log` |
| `npm run test:unit -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-5-unit-backoffice-r3.log` — 16 files / 448 tests |
| `npm run test:single -w @jurnapod/api -- __test__/integration/audit/audit-logs.test.ts` | ✅ PASS | `logs/epic66-story66-5-api-audit-logs-r6.log` — 1 file / 11 tests |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/audit.test.ts` | ✅ PASS | `logs/epic66-story66-5-audit-focused-r5.log` — 1 file / 65 tests |
| `npm run typecheck -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-5-typecheck-backoffice-r5.log` |
| `npm run lint -w @jurnapod/backoffice` | ✅ PASS | `logs/epic66-story66-5-lint-backoffice-r5.log` |

---

## Review State

- Consolidated review verdict: GO, no P0/P1 blockers.
- P2 fixes applied: redundant Backoffice `company_id` query parameter removed; DB-backed `from_ts >= to_ts` 400 coverage added; remaining architectural follow-ups documented.
- Targeted P2 re-review verdict: GO, zero P0/P1/P2/P3 findings.
- Remaining P2 follow-ups: OpenAPI query parameter type fidelity MUST be aligned with runtime Zod types in a future cleanup; a dedicated `platform.audit` resource MUST be introduced in a future ACL migration/story. Story 66-5 uses verified `platform.settings.READ` intentionally.
- Done authority: implementing developer MUST NOT mark done. Story 66-5 remains `review` until story owner sign-off.

---

**Story is DONE.**
