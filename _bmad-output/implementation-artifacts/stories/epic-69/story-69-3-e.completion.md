# Story 69-3-e Completion Report

**Story:** 69-3-e — Fiscal Period Close UX
**Epic:** 69 — Accounting Module (Epic 69)
**Status:** ✅ DONE — owner sign-off recorded
**Completed:** 2026-05-20 (implementation and review complete)

---

## Summary

Story 69-3-e implements the fiscal year close UX in the backoffice, including fiscal year list/status display, close workflow with reason capture, elevated MANAGE-permission gating, ReviewPanel evidence display, and Epic 32 close response rendering. The API contract was corrected (endpoint paths, MANAGE ACL enforcement, reason persistence via migration 0214) and the backoffice UI was updated to use the verified contract. All acceptance criteria are implemented, validated, reviewed, and owner-signed off.

---

## Files Created/Modified

### Created
| File | Description |
|------|-------------|
| `packages/db/migrations/0214_fiscal_year_close_request_reason.sql` | Adds `reason` column to `fiscal_year_close_requests` for accountable reason persistence. |

### Modified
| File | Changes |
|------|---------|
| `packages/db/src/kysely/schema.ts` | Schema updated for `reason` column on `fiscal_year_close_requests`. |
| `packages/modules/accounting/src/fiscal-year/types.ts` | Types updated for close-request reason fields. |
| `packages/modules/accounting/src/fiscal-year/service.ts` | Service flow stores and preserves close initiation reason through duplicate/replay and approve paths. |
| `apps/api/src/lib/fiscal-years.ts` | Fiscal-year API adapter preserves reason through approval replay/result paths. |
| `apps/api/src/routes/accounts.ts` | Fiscal-year close routes (initiate, approve) use `accounting.fiscal_years` **MANAGE**; reason body accepted and persisted. |
| `apps/api/__test__/integration/accounting/fiscal-year-close.test.ts` | 14 integration tests covering success path, permission denial (403), reason validation, conflict (409), blocked close (422), concurrent approve guard. |
| `apps/backoffice/src/features/fiscal-years-page.tsx` | Updated with ReviewPanel close evidence, required reason capture, permission-aware controls, and Epic 32 close result display. |
| `apps/backoffice/__test__/unit/features/fiscal-years-page.test.tsx` | 6 unit tests covering permission-gate view-logic, reason required state, and close-scope display. |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Fiscal periods list status — periods/fiscal years display status, date boundaries, close eligibility, close metadata from verified API fields. | ✅ Complete |
| AC2 | Elevated permission gate — controls hidden for users lacking `accounting.fiscal_years` MANAGE; direct API attempts return 403. | ✅ Complete |
| AC3 | Reason capture and ReviewPanel — non-empty reason required; ReviewPanel displays close scope, effects, generated-entry expectations. | ✅ Complete |
| AC4 | Epic 32 close result displayed — `postedBatchIds`, `netIncome`, `totalIncome`, `totalExpenses` visible using verified response shapes. | ✅ Complete |
| AC5 | Conflict and closed-period errors handled — 409/422 errors shown deterministically. | ✅ Complete |

---

## Key Features Implemented

### Fiscal Year List & Status Display
- `GET /api/accounts/fiscal-years` — list all fiscal years for tenant with status.
- `GET /api/accounts/fiscal-years/:id/status` — close eligibility, `closeRequestStatus`, `canClose`, `cannotCloseReason`, and fiscal-year-derived `periods` array.

### Close Workflow
- `GET /api/accounts/fiscal-years/:id/close-preview` — financial totals preview before initiate.
- `POST /api/accounts/fiscal-years/:id/close` — initiate close with required non-empty `reason`; `close_request_id` returned for approve step.
- `POST /api/accounts/fiscal-years/:id/close/approve` — approve with `close_request_id`; returns `postedBatchIds`, `netIncome`, `totalIncome`, `totalExpenses`.

### Permission Enforcement
- All close and approve routes require `accounting.fiscal_years` **MANAGE**.
- UI hides/disabled controls for users without MANAGE; API returns 403 for unauthorized attempts.

### Reason Accountability
- Migration `0214_fiscal_year_close_request_reason.sql` adds `reason` to `fiscal_year_close_requests`.
- API validation and service flow enforce non-empty reason on initiate.
- Integration tests verify persistence and validation.

### ReviewPanel Evidence
- Close scope and effects displayed in ReviewPanel during confirmation.
- Generated close-entry expectations shown (income/expense/retained earnings effects from close-preview).
- `postedBatchIds` and financial totals displayed after approve.

---

## Technical Implementation

### Data Flow
```
User → fiscal-years-page → GET /api/accounts/fiscal-years/:id/status
                        → GET /api/accounts/fiscal-years/:id/close-preview
                        → POST /api/accounts/fiscal-years/:id/close (reason required)
                        → POST /api/accounts/fiscal-years/:id/close/approve (close_request_id)
                        → Display postedBatchIds + financial totals
```

### API Endpoints Used
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/accounts/fiscal-years` | List fiscal years (tenant-isolated, 3/3 tests) |
| GET | `/api/accounts/fiscal-years/:id/status` | Close eligibility and close-request status |
| GET | `/api/accounts/fiscal-years/:id/close-preview` | Financial totals preview |
| POST | `/api/accounts/fiscal-years/:id/close` | Initiate close with reason |
| POST | `/api/accounts/fiscal-years/:id/close/approve` | Approve close with `close_request_id` |
| GET | `/api/journals/:id` | Not used by this slice; UI displays returned `postedBatchIds` as text only. |

### State Management
- Backoffice feature state managed via React component state and API response data.
- Permission-gate view logic derives from `SessionUser.permissions` via `resolveEffectivePermissions` and `actionGates`; backend `requireAccess` remains authoritative.

### Security
- All routes enforce `company_id` tenant scoping.
- `accounting.fiscal_years` MANAGE required for close/approve; 403 returned otherwise.
- Reason persisted with `close_request_id` for audit accountability.

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript — API | ✅ Passes (0 errors) |
| ESLint — API | ✅ Passes (0 errors, 163 warnings pre-existing) |
| Build — libs | ✅ Passes |
| TypeScript — backoffice | ✅ Passes |
| ESLint — backoffice | ✅ Passes |
| Build — backoffice | ✅ Passes |
| lint:migrations | ✅ Passes |
| lint:fixture-flow | ✅ Passes (236 files) |

---

## Testing Performed

- ✅ `fiscal-year-close.test.ts` — 14/14 API integration tests pass (success, 403, reason validation, 409 conflict, 422 blocked, concurrent approve guard)
- ✅ `fiscal-year-list-tenant-isolation.test.ts` — 3/3 tenant isolation tests pass
- ✅ `fiscal-years-page.test.tsx` — 6/6 backoffice unit tests pass (permission gate, reason required, close-scope display)
- ✅ API contract diff checks verified endpoints match actual routes
- ✅ Backoffice diff checks verified UI uses correct API paths and response fields

**Note on test scope**: No separate backoffice integration suite was added because the API integration suite (`fiscal-year-close.test.ts`) provides end-to-end coverage of the close contract including permission denial, reason validation, and conflict states. Unit tests cover the view-model and permission-gate rendering logic. This scope satisfies all five ACs.

---

## Dead Code Audit

*Not applicable — story adds new functionality without removing or extracting existing code.*

### Checklist

- [ ] **Orphaned exports**: N/A — no extraction performed.
- [ ] **Orphaned type definitions**: N/A.
- [ ] **Orphaned test files**: N/A.

### Findings

- [ ] **Clean** — No orphaned code found.

---

## API Gaps Encountered

| Gap | Discovered | Resolution |
|-----|-----------|------------|
| Fiscal period list — original story assumed a real fiscal-period API | Pre-implementation review | Rescoped: final scope uses fiscal-year-derived period/status fields only. Real fiscal-period list contract is a follow-up item tracked in `story-69-3-e.readiness-coordination.md`. |

---

## Dev Notes

### Pattern Consistency
- Fiscal year close flow follows the established Epic 32 backend contract.
- Reason persistence uses the existing idempotency table with `reason VARCHAR(500)` and epoch-millisecond lifecycle columns.
- Resource-level ACL uses `requireAccess({ module: 'accounting', resource: 'fiscal_years', permission: 'manage' })`.

### Type Safety
- Zod schemas at the API boundary validate close request payloads before business logic.
- TypeScript strict mode enabled across all modified workspaces.

### Error Handling
- 409 Conflict: returned when fiscal year is already closed or has a pending close request.
- 422 Unprocessable: returned when fiscal year cannot be closed (e.g., has unbalanced journals).
- 403 Forbidden: returned when user lacks `accounting.fiscal_years` MANAGE.

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-20 | 1.0 | Initial implementation — API contract fixes + backoffice UI |

---

## Review Sign-Off

| Reviewer | Task | Result | Date |
|----------|------|--------|------|
| Code reviewer | `ses_1b9e12f59ffeM24KH24R1RiFz1` | GO (P2/P3 fixes resolved) | 2026-05-20 |
| UI reviewer | `ses_1b9c42d77ffe2Q1xsHOTDDqXCS` | GO, no blockers | 2026-05-20 |
| Owner (Ahmad) | User message `sign off` | GO / signed off | 2026-05-21 |

---

## Known Follow-Ups

| Item | Owner | Notes |
|------|-------|-------|
| Real fiscal-period list API contract | Product/Architecture | This story scope was narrowed to fiscal-year-derived fields only. A separate story is needed to verify or define a real fiscal-period list contract. |

---

## Owner Sign-Off

**Status: SIGNED OFF**

Ahmad wrote `sign off` on 2026-05-21. Sprint-status.yaml MAY be updated to done using the canonical script.

---

**Story implementation is complete. Reviewer GO and owner sign-off are recorded.**
