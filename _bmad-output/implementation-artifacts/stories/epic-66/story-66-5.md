# Story 66-5: Audit Log Explorer

Status: done (consolidated reviewer GO and targeted P2 re-review GO recorded; owner sign-off recorded 2026-05-18)

## Story

As a **company administrator or auditor**,  
I want **an audit log explorer with filters and detail drawer**,  
So that **administrative and security-relevant changes can be inspected by actor, action, object, date range, and scope**.

## Scope Boundary

- Ahmad approved Epic 66 implementation on 2026-05-17; `apps/backoffice` is unfrozen for Epic 66 scope only.
- Audit log reads MUST be tenant-scoped by authenticated company/outlet context where applicable.
- Audit log filtering MUST use `success`, not `result`, if the backend exposes the canonical audit table shape.
- This story MUST NOT introduce audit write paths.

## Context

Epic 66 core admin needs audit visibility for user, role, company, and outlet changes. This story consumes Epic 65 `EntityTable`, `FilterBar`, `DetailDrawer`, typed API client, and TanStack Query. It depends on Story 66-4 permission-aware routing.

---

## Pre-Implementation Gates

| Gate | Required State |
|------|----------------|
| Story 66-4 | Permission-aware navigation and route guard pattern available |
| API contract | Audit list/detail filters verified |
| Date handling | Half-open interval conversion policy documented for audit date range |
| ACL | Required permission for audit explorer verified (`platform.settings.READ`, `platform.users.READ`, or explicit audit resource) |

## Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Actor/action/date/object filters produce query key and typed request | Happy | Unit |
| Date range uses half-open interval semantics | Edge | Unit |
| Detail drawer renders before/after payload diff | Happy | Unit/component |
| Empty audit list renders empty state | Edge | Unit/component |
| User lacks required audit READ permission | Auth | Unit with low-privilege role |
| Backend returns malformed payload | Error | Unit typed-client boundary |

---

## API Contract Verification (MANDATORY before implementation)

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/audit-logs` | GET | `{ success: true, data: { total, logs, limit, offset } }` | ✅ | Runtime route mounted in `apps/api/src/app.ts`, registered in `apps/api/src/routes/openapi-aggregator.ts`, and DB-backed integration-tested. |
| `/api/audit-logs/:id` | GET | `{ success: true, data: AuditLogResponse }` | ✅ | Runtime route mounted, OpenAPI registered, tenant-scoped by authenticated `company_id`, and DB-backed integration-tested. |
| `/api/audit/period-transitions` | GET | Period-transition audit list only | ✅ | Existing route is period-transition-specific; not safe for generic admin/security audit explorer |
| `/api/audit/period-transitions/:id` | GET | Period-transition audit detail only | ✅ | Existing route is period-transition-specific; not safe for generic admin/security audit explorer |
| `/api/users` | GET | User selector source | ✅ | Generated contract exists as an actor selector source. Story 66-5 uses actor user ID filtering directly. |

### API Gaps Found

| Gap | Impact | Resolution |
|-----|--------|------------|
| Generic `/api/audit-logs` list/detail read contracts were missing before this story batch | AC1/AC2/AC4 required a real read-only backend contract | Resolved by adding read-only list/detail routes, OpenAPI registration, shared/platform query support, and DB-backed integration tests. |
| Generic audit ACL resource needed an explicit decision | Route guard and UI metadata required a canonical permission | Resolved as `platform.settings.READ`, matching the verified Epic 66 audit-adjacent resource and avoiding a new `platform.audit` resource in this story. |

### Permission Decision

- Generic audit list/detail routes use `platform.settings.READ` through `requireAccess({ module: "platform", resource: "settings", permission: "read" })` in `apps/api/src/routes/audit-logs.ts`.
- Backoffice route metadata uses `platform.settings.READ`, matching the backend ACL decision.
- A dedicated `platform.audit` resource is not introduced in Story 66-5.

### Date-Range Policy

- Audit explorer helper conversion uses UTC day boundaries because audit timestamps are absolute system events, not tenant business-date cutoffs.
- Date range requests use half-open semantics: `from_ts` maps to `created_at >= from_ts`, and `to_ts` maps to `created_at < to_ts`.
- Backend query logic applies half-open filtering in `packages/modules/platform/src/audit/query.ts`.
- Implementation uses `dateOnlyToTimestampMs(date, "UTC")`; no manual ISO string slicing is used in audit helper logic.

### Canonical Success Field Rule

- Audit outcome filtering uses `success` only.
- `result` remains compatibility/display data in responses and MUST NOT be used for query filtering.

---

## Acceptance Criteria

**AC1: Audit List**  
Given an authorized user opens the audit explorer,  
When audit data loads,  
Then `EntityTable` MUST render timestamp, actor, action, object type, object ID, summary, and scope columns.

**AC2: Filter Support**  
Given filters for actor, action, date range, object type, and company/outlet scope,  
When the user applies filters,  
Then the typed query MUST request the filtered audit list and TanStack Query MUST refresh using a deterministic query key.

**AC3: Date Range Correctness**  
Given a date range filter,  
When request parameters are generated,  
Then filtering MUST use half-open interval semantics: `col >= startUTC AND col < nextDayUTC`.

**AC4: Detail Drawer**  
Given an audit entry has detail payload,  
When the row opens in a drawer,  
Then `DetailDrawer` MUST show actor details, object details, and before/after diff where available.

**AC5: Pagination**  
Given the audit list loads,  
When no page size is selected,  
Then default page size MUST be 25.

**AC6: Authorization UX**  
Given a user lacks the required audit READ permission,  
When they navigate to the audit explorer,  
Then route guard MUST deny access and action affordances MUST not render.

**AC7: Canonical Audit Field**  
Given audit log status filtering is implemented,  
When code references audit success/failure,  
Then it MUST filter by `success` and MUST NOT filter by `result`.

---

## Tasks / Subtasks

- [x] Verify audit log API contract and supported filters.
- [x] Identify canonical audit permission resource.
- [x] Create audit query key and typed query hook.
- [x] Create audit filter schema with actor, action, date range, object type, scope.
- [x] Implement half-open date range parameter conversion using canonical helpers.
- [x] Create audit list route with `EntityTable` and `FilterBar`.
- [x] Create audit detail drawer with before/after diff rendering.
- [x] Add unit tests for filters, query keys, date range conversion, empty/error states, and authorization denial.

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/routes/admin/audit.tsx` | Audit explorer route component |
| `apps/backoffice/src/features/audit/` | Audit explorer feature module |
| `apps/backoffice/__test__/unit/features/audit.test.ts` | Audit explorer unit tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/app/router/routes.tsx` | Modify | Add audit route metadata if missing |
| `apps/backoffice/src/lib/api/client.ts` | Modify | Add typed wrappers only if generated paths are insufficient |

## Estimated Effort

3–4 days

## Risk Level

Medium

## Dependencies

- Story 66-4 permission-aware route guard pattern.
- Explicit Epic 66 backoffice unfreeze approval.
- Audit API contract verification.

## Validation Evidence Required

- `npm run lint -w @jurnapod/backoffice`
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/audit.test.ts`
- `npm run test:unit -w @jurnapod/backoffice`

## Technical Debt Review

- [x] No audit write paths introduced.
- [x] No filtering by `result` instead of `success`.
- [x] No manual ISO string slicing for business date extraction.
- [x] No tenant-scope ambiguity in displayed audit rows.

---

## Dev Agent Record

### Debug Log

- Verified generated contracts in `apps/backoffice/src/lib/api/schema.d.ts`: `/audit/period-transitions`, `/audit/period-transitions/{id}`, and `/users` exist; `/audit-logs` and `/audit-logs/{id}` do not exist.
- Verified runtime API mounting in `apps/api/src/app.ts`: `/api/audit` is mounted; `/api/audit-logs` is not mounted.
- Verified existing audit route ACL in `apps/api/src/routes/audit.ts`: `platform.settings.READ`.
- Verified generic query library exists in `apps/api/src/lib/audit-logs.ts`, but it is not exposed as a route contract.
- Added and validated generic read-only `/api/audit-logs` and `/api/audit-logs/:id` runtime routes using `platform.settings.READ`.
- Removed new explicit `any` lint warnings from `apps/api/src/routes/audit-logs.ts`; remaining API lint warnings are pre-existing and outside Story 66-5 scope.
- Cleaned outdated audit helper comments after generic audit endpoints became available.
- Consolidated Story 66-5 review returned GO with no P0/P1 blockers; P2 cleanup batch applied while keeping story status `review`.
- Removed redundant Backoffice `company_id` audit list query parameter because backend tenant scoping uses authenticated `auth.companyId` and ignores query `company_id`.
- Added DB-backed invalid half-open date range coverage for `from_ts >= to_ts` returning 400.
- Targeted P2 re-review returned GO with zero P0/P1/P2/P3 findings; story remains pending owner sign-off.

### Completion Notes

- Implemented read-only generic audit list/detail API routes with authenticated tenant scoping, `platform.settings.READ`, `success` filtering, half-open `from_ts`/`to_ts`, and no audit write paths.
- Registered generic audit routes in OpenAPI and mounted them at `/api/audit-logs`.
- Extended shared/platform audit query support and kept filtering on `success`, not `result`.
- Wired Backoffice audit explorer to real read-only audit API hooks using deterministic TanStack Query keys.
- Implemented `EntityTable` list, `FilterBar` filters, default page size 25, and detail drawer before/after diff rendering.
- Added DB-backed API integration coverage and Backoffice unit coverage for filters, query keys, date ranges, route permission denial, success semantics, and detail diff helpers.
- Story 66-5 is review-ready; it MUST NOT be marked done until consolidated review GO and story owner sign-off.
- Consolidated review GO received; Story 66-5 remains `review` pending story owner sign-off.
- Targeted P2 re-review GO received after cleanup validation; Story 66-5 remains `review` pending story owner sign-off.
- Remaining architectural P2 follow-ups are documented in this Dev Agent Record and Epic 66 coordination: OpenAPI query parameter type fidelity MUST be aligned with runtime Zod types in a future cleanup; a dedicated `platform.audit` resource MUST be introduced in a future ACL migration/story. Story 66-5 intentionally uses verified `platform.settings.READ`.

### Validation Evidence

| Command | Result | Evidence |
|---------|--------|----------|
| `npm run build -w @jurnapod/shared` | PASS | `logs/epic66-story66-5-build-shared.log` |
| `npm run build -w @jurnapod/modules-platform` | PASS | `logs/epic66-story66-5-build-platform-r2.log` |
| `npm run typecheck -w @jurnapod/api` | PASS | `logs/epic66-story66-5-typecheck-api-r2.log` |
| `npm run lint -w @jurnapod/api` | PASS | `logs/epic66-story66-5-lint-api-r3.log` — 0 errors; 157 pre-existing warnings |
| `npm run build -w @jurnapod/api` | PASS | `logs/epic66-story66-5-build-api-r3.log` |
| `npm run test:single -w @jurnapod/api -- __test__/integration/audit/audit-logs.test.ts` | PASS | `logs/epic66-story66-5-api-audit-logs-r5.log` — 1 file / 10 tests |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/audit.test.ts` | PASS | `logs/epic66-story66-5-audit-focused-r4.log` — 1 file / 65 tests |
| `npm run lint -w @jurnapod/backoffice` | PASS | `logs/epic66-story66-5-lint-backoffice-r4.log` |
| `npm run typecheck -w @jurnapod/backoffice` | PASS | `logs/epic66-story66-5-typecheck-backoffice-r4.log` |
| `npm run build -w @jurnapod/backoffice` | PASS | `logs/epic66-story66-5-build-backoffice-r3.log` |
| `npm run test:unit -w @jurnapod/backoffice` | PASS | `logs/epic66-story66-5-unit-backoffice-r3.log` — 16 files / 448 tests |
| `npm run test:single -w @jurnapod/api -- __test__/integration/audit/audit-logs.test.ts` | PASS | `logs/epic66-story66-5-api-audit-logs-r6.log` — 1 file / 11 tests |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/audit.test.ts` | PASS | `logs/epic66-story66-5-audit-focused-r5.log` — 1 file / 65 tests |
| `npm run typecheck -w @jurnapod/backoffice` | PASS | `logs/epic66-story66-5-typecheck-backoffice-r5.log` |
| `npm run lint -w @jurnapod/backoffice` | PASS | `logs/epic66-story66-5-lint-backoffice-r5.log` |

### File List

- `apps/api/__test__/integration/audit/audit-logs.test.ts`
- `apps/api/src/app.ts`
- `apps/api/src/lib/audit-logs.ts`
- `apps/api/src/routes/audit-logs.ts`
- `apps/api/src/routes/openapi-aggregator.ts`
- `apps/backoffice/__test__/unit/features/audit.test.ts`
- `apps/backoffice/src/app/routes.ts`
- `apps/backoffice/src/features/audit/api.ts`
- `apps/backoffice/src/features/audit/audit-helpers.ts`
- `apps/backoffice/src/features/audit-logs-page.tsx`
- `apps/backoffice/src/routes/admin/audit.tsx`
- `packages/modules/platform/src/audit/query.ts`
- `packages/shared/src/schemas/audit-logs.ts`
- `_bmad-output/implementation-artifacts/stories/epic-66/story-66-5.md`
- `_bmad-output/implementation-artifacts/stories/epic-66/story-66-5.completion.md`
- `_bmad-output/implementation-artifacts/stories/epic-66/epic-66-coordination.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-18 — Verified audit read contract gap and implemented safe unavailable UI with pure audit helper/test coverage.
- 2026-05-18 — Added generic read-only audit list/detail endpoints, Backoffice real audit explorer wiring, DB-backed API tests, validation evidence, and review-ready documentation.
- 2026-05-18 — Applied consolidated review P2 fixes: removed redundant Backoffice `company_id` query parameter, added invalid date range API coverage, and documented remaining architectural P2 follow-ups.
- 2026-05-18 — Recorded targeted P2 re-review GO with zero P0/P1/P2/P3 findings; story remains pending owner sign-off.
