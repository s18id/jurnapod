# Story 69-5: AP Exception Worklist from Epic 47

Status: DONE — owner sign-off recorded by Ahmad on 2026-05-21; reviewer GO received from task `ses_1b76d698fffeKzkZyPlLfZD22N`; completion report at `story-69-5.completion.md`

## Readiness Status

- 2026-05-21 unfreeze update: Ahmad wrote `continue and unfreeze` for Story 69-5. This authorizes Story 69-5 readiness and contract-correction documentation work in `apps/backoffice`.
- 2026-05-21 initial readiness review outcome: **NO-GO for code implementation as previously written**.
- 2026-05-21 documentation correction completed and readiness re-review returned **GO for documentation readiness and V1 code implementation readiness**.
- 2026-05-21 implementation GO: Ahmad wrote `implement`. This authorizes Story 69-5 V1 code implementation only.
- Runtime API verification MUST happen before first mutation implementation, especially assign/resolve flows with safe fixture data.
- 2026-05-21 implementation review: task `ses_1b76d698fffeKzkZyPlLfZD22N` returned **GO for Story 69-5 V1 implementation quality** with no P0/P1/P2 findings and two non-blocking P3 follow-ups.
- 2026-05-21 owner sign-off: Ahmad wrote `sign-off if no findings`. Review had no P0/P1/P2 blocking findings, so owner sign-off is recorded. Non-blocking P3 follow-ups remain documented.

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 69 --story 69-5 --status done --title ap-exception-worklist` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As an **AP clerk or accountant**,  
I want **an AP exception worklist UI that shows reconciliation variances, mismatches, and overdue/disputed exceptions supported by the current Epic 47 backend**,  
So that **I can review AP reconciliation exceptions, assign ownership, and resolve or dismiss supported exceptions without fabricating backend behavior**.

## V1 Scope Boundary

Story 69-5 V1 MUST use only the currently verified Epic 47 backend contract.

### In Scope for V1

- Worklist page at `/purchasing/ap-exceptions`.
- Worklist list/table using current backend data.
- Supported filters only:
  - `type`
  - `status`
  - `supplier_id`
  - `search`
  - `cursor`
  - `limit`
- Assign action through the current assign endpoint.
- Resolve or dismiss action through the current resolve endpoint.
- Empty state: `All AP accounts reconciled`.
- Route/deep-link handling to preserve `highlight={exceptionId}` or equivalent URL state when possible from available worklist data.

### Explicitly Deferred from V1

These items MUST NOT be implemented in Story 69-5 unless a separate backend contract is verified before implementation GO:

- Dedicated detail endpoint.
- Comment thread API or separate resolution comments API.
- Escalate route, `ESCALATED` status, or escalation reason payload.
- Date-range filter.
- Assigned-user filter.
- Assignment notification event producer.
- New audit fields beyond the existing backend response.
- New idempotency fields such as `client_tx_id` on assign/resolve payloads.
- Backend permission redesign, including a new `purchasing.exceptions` resource.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] Happy paths identified: worklist load, supported filter application, assign, resolve/dismiss.
- [x] Error paths identified: 400 validation, 401 auth, 403 permission, 404 not found, 409 invalid transition, 500 unexpected failure.
- [x] Edge cases identified: empty state, stale highlighted exception, concurrent resolution resulting in 409.
- [x] Test fixture needs identified: frontend unit tests MAY mock API responses; real DB/API tests require canonical fixtures.
- [x] Unit test scope defined: component rendering, API adapter path building, error-state rendering, route/deep-link parsing.
- [x] Integration test scope deferred unless backoffice test configuration support is verified and canonical fixtures are available.
- [x] Negative auth test role selected for backend/API integration tests: `CASHIER` or a custom low-privilege role, never `OWNER`/`SUPER_ADMIN`.

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Worklist loads with exceptions from current backend envelope | Happy | Unit with mocked API response |
| Worklist applies supported filters only | Happy | Unit with API adapter/path assertions |
| Assign action calls `PUT /accounting/ap-exceptions/:id/assign` | Happy | Unit with mocked API client |
| Resolve action calls `PUT /accounting/ap-exceptions/:id/resolve` using `RESOLVED` | Happy | Unit with mocked API client |
| Dismiss action calls `PUT /accounting/ap-exceptions/:id/resolve` using `DISMISSED` | Happy | Unit with mocked API client |
| Empty worklist shows `All AP accounts reconciled` | Edge | Unit |
| Highlight query parameter is preserved when present | Edge | Unit |
| 403 error renders permission-denied state | Error | Unit with mocked `ApiError` |
| 404 highlighted exception not present renders non-blocking stale-link state | Error | Unit |
| 409 invalid transition renders refresh/retry guidance | Error | Unit |

**Sign-off:** Scenario coverage requires readiness re-review GO before code implementation.

---

## UI HTTP/API Error Matrix

The backoffice UI receives errors through `ApiError.status`, `ApiError.code`, and `ApiError.message`. UI code MUST NOT rely on cross-package producer error classes such as `NotFoundError` or `ConflictError`.

| HTTP Status | Expected `ApiError` Handling | UI Behavior |
|-------------|------------------------------|-------------|
| 400 | Validation or malformed request | Show validation/error banner; do not retry automatically |
| 401 | Missing or expired session | Existing API client refresh path handles first retry; persistent 401 sends user to auth flow |
| 403 | Permission denied | Show permission-denied state; hide route/nav via route permission metadata |
| 404 | Exception not found or tenant-scoped miss | Show stale/not-found state; allow return to worklist |
| 409 | Invalid transition or concurrent update | Show conflict state; refetch worklist before another mutation |
| 500 | Unexpected backend failure | Show generic failure with retry action |

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Decisions Recorded for V1

| # | Decision | Modules Affected | Rationale | Alternatives | Readiness Status |
|---|----------|------------------|-----------|--------------|------------------|
| 1 | Use current Epic 47 backend only | `accounting`, `purchasing`, `backoffice` | Backend is implemented under accounting AP exception routes; UI MUST align to verified contract | Add purchasing alias routes | Accepted for V1; alias routes deferred |
| 2 | Do not implement comments or escalation in V1 | `purchasing`, `backoffice` | Current backend has no comments endpoint, no escalation route, and no `ESCALATED` status | Add backend contracts first | Deferred from V1 |
| 3 | Use HTTP/API error handling in UI | `backoffice`, `shared` | UI receives standardized envelopes through `ApiError`, not producer class instances | Cross-package `instanceof` checks | Accepted for V1 |
| 4 | Do not fabricate assignment notifications | `platform`, `backoffice` | Current notification source has no verified AP assignment event producer | Client-side synthetic notification | Deferred from V1 |
| 5 | Use actual backend permissions | `accounting`, `purchasing`, `auth`, `backoffice` | Backend enforces read OR policy and accounting update policy | New `purchasing.exceptions` resource | Accepted for V1; redesign deferred |

**Hard gate:** Implementation MUST NOT begin until this decision set receives readiness re-review GO.

---

## API Contract Verification (MANDATORY for UI Stories)

### Current Verified Backend Mount

- API route mount: `/api/accounting/ap-exceptions`
- Backoffice `apiRequest()` paths MUST be client-relative and MUST NOT include `/api`.
- Correct backoffice client-relative base path: `/accounting/ap-exceptions`

### Current Supported Endpoints

| Purpose | Backoffice Client-Relative Path | HTTP Method | Request | Response Envelope | Readiness Status |
|---------|---------------------------------|-------------|---------|-------------------|------------------|
| Worklist | `/accounting/ap-exceptions/worklist` | GET | Query: `type`, `status`, `supplier_id`, `search`, `cursor`, `limit` | `{ success: true, data: { exceptions, total, next_cursor, has_more } }` | Verified from code; direct runtime curl still pending |
| Assign | `/accounting/ap-exceptions/:id/assign` | PUT | `{ assigned_to_user_id: number }` | `{ success: true, data: APExceptionResponse }` | Verified from code; direct runtime curl still pending |
| Resolve or dismiss | `/accounting/ap-exceptions/:id/resolve` | PUT | `{ status: "RESOLVED" | "DISMISSED", resolution_note: string }` | `{ success: true, data: APExceptionResponse }` | Verified from code; direct runtime curl still pending |

### APExceptionResponse Fields Available to UI

The UI MAY render only fields available in the current response:

- `id`
- `company_id`
- `exception_key`
- `type`
- `source_type`
- `source_id`
- `supplier_id`
- `variance_amount`
- `currency_code`
- `detected_at`
- `due_date`
- `assigned_to_user_id`
- `assigned_at`
- `status`
- `resolved_at`
- `resolved_by_user_id`
- `resolution_note`
- `created_at`
- `updated_at`

### API Gaps Deferred from Story 69-5 V1

| Gap | Impact | Resolution |
|-----|--------|------------|
| No `GET /accounting/ap-exceptions/:id` detail endpoint | Detail drawer cannot fetch expanded data beyond selected worklist row | Use row-based detail panel only or defer detail drawer expansion |
| No `/purchasing/ap-exceptions` alias | Story cannot use purchasing route prefix | Use current accounting route in UI API adapter |
| No `POST` assign/resolve endpoints | Story cannot use POST mutations | Use current PUT endpoints |
| No escalate route/status | Escalation action unsupported | Defer escalation |
| No comments/thread API | Comment thread unsupported | Defer comments |
| No date-range filter | Date-range FilterBar unsupported by backend | Defer date-range filter |
| No assigned-user filter | Assignee filter unsupported by backend | Defer assigned-user filter |
| No verified AP assignment notification producer | AC cannot claim assigned user receives notification | Defer notification production; preserve deep-link compatibility only |
| No `client_tx_id` on assign/resolve payload | Frontend cannot send idempotency key | Defer idempotency field work to backend story |

---

## Acceptance Criteria

**AC1: Exception List**  
**Given** the AP exception worklist page,  
**When** the page loads,  
**Then** exceptions from `data.exceptions` are listed with columns available from the current backend: type, source, supplier ID, variance amount, currency, status, assigned user ID, detected date, due date.

**AC2: Supported Filtering**  
**Given** the worklist page,  
**When** the user applies filters,  
**Then** the UI sends only supported query parameters: `type`, `status`, `supplier_id`, `search`, `cursor`, and `limit`.

**AC3: Assignment**  
**Given** an exception can be assigned,  
**When** the assign action completes through `PUT /accounting/ap-exceptions/:id/assign`,  
**Then** the UI reflects `assigned_to_user_id`, `assigned_at`, and returned `status` from the response.

**AC4: Resolve or Dismiss**  
**Given** an exception can be resolved or dismissed,  
**When** the mutation completes through `PUT /accounting/ap-exceptions/:id/resolve`,  
**Then** the UI reflects returned `status`, `resolved_at`, `resolved_by_user_id`, and `resolution_note`.

**AC5: Empty State**  
**Given** no exceptions exist,  
**When** the worklist loads,  
**Then** it shows an empty state: `All AP accounts reconciled`.

**AC6: Row-Based Detail Panel**  
**Given** the user selects an exception row,  
**When** the panel opens,  
**Then** it shows fields available in the selected worklist row only.  
**And** it MUST NOT fetch or display unsupported comment-thread, linked-document expansion, or escalation data.

**AC7: Deep-Link Compatibility**  
**Given** a URL contains `highlight={exceptionId}`,  
**When** the worklist loads,  
**Then** the UI highlights or scrolls to the matching exception when present in loaded results.  
**And** stale or missing highlighted IDs render a non-blocking stale-link message.

**AC8: Permission Enforcement**  
**Given** a user lacks the current backend read permissions,  
**When** the user attempts to access the worklist,  
**Then** the page is hidden from navigation where permission metadata is available and backend 403 renders a permission-denied state.  
**And** read access follows the actual backend policy: `accounting.journals` ANALYZE OR `purchasing.suppliers` ANALYZE.  
**And** assign/resolve follows the actual backend policy: `accounting.journals` UPDATE.

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

Not applicable — this story creates a new V1 screen using current app architecture.

## Test Coverage Criteria

- [ ] Unit tests in `apps/backoffice/__test__/unit/features/purchasing-ap-exceptions.test.tsx` or another path matched by current `vitest.config.ts`.
- [ ] Unit tests cover API adapter path construction without `/api` prefix.
- [ ] Unit tests cover current response envelope mapping.
- [ ] Unit tests cover empty state, filter state, assign/resolve/dismiss mutations, stale highlight handling, and `ApiError` states.
- [ ] No backoffice integration test is listed as validation evidence until test runner support and fixture strategy are verified.

## Test Fixtures

### Fixture Strategy

- Frontend unit tests MAY mock API responses at the API adapter boundary.
- Frontend unit tests MUST use deterministic mock payloads matching `ApExceptionResponseSchema`.
- Real DB/API integration tests MUST use canonical owner-package fixtures or an existing approved fixture.
- Raw SQL setup MUST NOT be used for test data.
- If a new real AP exception fixture is required outside the existing approved API fixture, it MUST be created in the owner package first or covered by an approved transitional wrapper.

### Current Fixture Notes

- Existing API fixture: `apps/api/src/lib/test-fixtures.ts#createTestAPException`.
- Owner-package purchasing fixture export for AP exceptions is not currently verified in `@jurnapod/modules-purchasing`.
- Story 69-5 V1 unit tests do not require real DB fixtures when API responses are mocked.

## Tasks / Subtasks

- [x] Create AP exception feature folder under `apps/backoffice/src/features/purchasing/ap-exceptions/`.
- [x] Add API adapter using `/accounting/ap-exceptions` client-relative paths.
- [x] Add worklist page with EntityTable or current data-grid pattern.
- [x] Add supported FilterBar fields only: type, status, supplier ID, search, limit/cursor behavior.
- [x] Add row-based detail panel using loaded row fields only.
- [x] Add assign action.
- [x] Add resolve/dismiss action.
- [x] Add empty state component/message.
- [x] Add deep-link highlight handling for `highlight={exceptionId}`.
- [x] Add route metadata and navigation entry using actual permissions.
- [x] Add unit tests matched by current vitest include patterns.

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/features/purchasing/ap-exceptions/index.tsx` | Worklist page and feature export |
| `apps/backoffice/src/features/purchasing/ap-exceptions/api.ts` | API adapter and query/mutation hooks |
| `apps/backoffice/src/features/purchasing/ap-exceptions/types.ts` | UI types mapped to current backend response |
| `apps/backoffice/src/features/purchasing/ap-exceptions/filters.tsx` | Supported filter controls/config |
| `apps/backoffice/src/features/purchasing/ap-exceptions/detail-panel.tsx` | Row-based detail panel |
| `apps/backoffice/src/features/purchasing/ap-exceptions/actions.tsx` | Assign and resolve/dismiss UI actions |
| `apps/backoffice/__test__/unit/features/purchasing-ap-exceptions.test.tsx` | Unit tests matched by current vitest config |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/app/routes.ts` | Modify | Add route metadata for `/purchasing/ap-exceptions` with actual permissions |
| `apps/backoffice/src/app/router.tsx` | Modify | Lazy-load and render AP exception feature |
| `apps/backoffice/src/app/layout.tsx` | Modify | Add route to Purchasing nav group |

## Estimated Effort

3 days for V1 frontend-only implementation after readiness GO.

## Risk Level

Medium — API contract is beta and missing prior story expectations; V1 scope is narrowed to verified backend behavior.

## Dev Notes

- **Scope Freeze Warning:** `apps/backoffice` is under a temporary architecture-first freeze. Readiness re-review GO and explicit implementation GO are recorded for Story 69-5 V1 only.
- **API verification REQUIRED:** Before implementation, direct runtime calls MUST verify the three current endpoints and response envelopes.
- **API client rule:** Backoffice API adapter paths MUST be client-relative and MUST NOT include `/api`.
- **Notification integration:** V1 MUST NOT claim assigned-user notifications. V1 MAY preserve `highlight={exceptionId}` deep-link behavior for future notification producers.
- **Permission resource:** V1 MUST mirror actual backend permissions: read = `accounting.journals` ANALYZE OR `purchasing.suppliers` ANALYZE; assign/resolve = `accounting.journals` UPDATE.
- **EntityTable reuse:** Use current `EntityTable`/data-grid patterns when compatible with V1 requirements.
- **FilterBar:** Use only backend-supported filters.
- **Cleanup Policy (MANDATORY):** Any future code change in this story MUST include a cleanup pass for resolved TODO/FIXME comments, outdated comments, and dead code paths in the modified area.

## Cross-Cutting Concerns

### Audit Integration

- [ ] New audit behavior required for V1? No.
- V1 MUST NOT fabricate audit events in the frontend.
- Existing backend audit behavior, if any, is outside Story 69-5 V1 unless verified before implementation GO.

### Idempotency

- [ ] New idempotency key required for V1? No.
- Assign/resolve payloads do not currently accept `client_tx_id`.
- V1 MUST NOT send unsupported idempotency fields.

### Feature Flags

- [ ] Feature flag required? No verified existing feature flag contract for this V1 story.
- Route visibility MUST rely on existing route/module/permission patterns unless a verified flag contract exists before implementation GO.

### Validation Rules

- [ ] `assigned_to_user_id` MUST be a number for assign.
- [ ] `resolution_note` MUST be non-empty for resolve/dismiss.
- [ ] `status` MUST be `RESOLVED` or `DISMISSED` for resolve endpoint.
- [ ] UI MUST render backend validation failures from `ApiError`.

### Error Handling

- [ ] Retryable errors: user-triggered retry for worklist read failures.
- [ ] Non-retryable errors: 400 validation, 403 permission, 404 not found, 409 invalid transition.
- [ ] Error response format: standardized envelope `{ success: false, error: { code, message } }`.

### Health Check

- [ ] Health check required? No.

## File List

- `story-69-5.md` (this file)
- `_bmad-output/implementation-artifacts/stories/epic-69/story-69-5.readiness-coordination.md`
- `apps/backoffice/src/features/purchasing/ap-exceptions/index.tsx`
- `apps/backoffice/src/features/purchasing/ap-exceptions/api.ts`
- `apps/backoffice/src/features/purchasing/ap-exceptions/types.ts`
- `apps/backoffice/src/features/purchasing/ap-exceptions/filters.tsx`
- `apps/backoffice/src/features/purchasing/ap-exceptions/detail-panel.tsx`
- `apps/backoffice/src/features/purchasing/ap-exceptions/actions.tsx`
- `apps/backoffice/__test__/unit/features/purchasing-ap-exceptions.test.tsx`
- `apps/backoffice/src/app/routes.ts`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/src/app/layout.tsx`
- `apps/backoffice/src/app/shell/use-nav-filtering.ts`
- `apps/backoffice/src/lib/auth/permissions.ts`

## Validation Evidence

Implementation validation has been run for Story 69-5 V1. Reviewer GO and story owner sign-off are complete.

Required after implementation GO and code changes:

- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing-ap-exceptions.test.tsx`
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run lint -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`

### 2026-05-21 Implementation Evidence

Runtime API verification outcome:

- Source verification confirmed backend mount and contracts in `apps/api/src/app.ts` and `apps/api/src/routes/accounting/ap-exceptions.ts`:
  - `GET /api/accounting/ap-exceptions/worklist`
  - `PUT /api/accounting/ap-exceptions/:id/assign`
  - `PUT /api/accounting/ap-exceptions/:id/resolve`
- Direct local runtime probe was attempted before mutation implementation and logged to `logs/story-69-5-runtime-api-probe-r1.log`.
- Direct runtime verification was blocked because no local API server was accepting connections at `127.0.0.1:3000` (`curl` exit 7 / connection refused).
- Runtime probe was retried after Ahmad reported the API server running on port `3001`: `logs/story-69-5-runtime-api-probe-r2.log`, exit `0`.
- The retry reached `GET /api/accounting/ap-exceptions/worklist?limit=1` and returned HTTP `401` with standardized envelope `{ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } }`, confirming server reachability, route/auth-guard wiring, and envelope shape for unauthenticated access.
- Mutation runtime verification was not attempted because no safe running API/auth/fixture context was available. No raw SQL fixture setup was used.

Validation commands:

| Command | Log | Exit |
|---------|-----|------|
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing-ap-exceptions.test.tsx` | `logs/story-69-5-backoffice-unit-r2.log` | 0 |
| `npm run typecheck -w @jurnapod/backoffice` | `logs/story-69-5-backoffice-typecheck-r2.log` | 0 |
| `npm run lint -w @jurnapod/backoffice` | `logs/story-69-5-backoffice-lint-r2.log` | 0 |
| `npm run build -w @jurnapod/backoffice` | `logs/story-69-5-backoffice-build-r1.log` | 0 |
| `npx tsx scripts/validate-sprint-status.ts` | `logs/story-69-5-sprint-status-validate-implementation-r2.log` | 0 |

Implementation review:

- Review task `ses_1b76d698fffeKzkZyPlLfZD22N` returned **GO for Story 69-5 V1 implementation quality**.
- P0/P1/P2 findings: none.
- P3 follow-up: authenticated runtime API verification remains blocked until a running API/auth/fixture environment exists.
- P3 follow-up update: unauthenticated runtime route probe now passes against port `3001`; authenticated GET/PUT smoke verification still requires a valid token and safe AP exception fixture.
- P3 follow-up: add explicit `DISMISSED` payload unit assertion in a later pass if touching the test again.

Implementation summary:

- V1 worklist uses `EntityTable`, current response envelope, and `/accounting/ap-exceptions` client-relative adapter paths only.
- Supported filters are limited to `type`, `status`, `supplier_id`, `search`, `cursor`, and `limit`.
- Assign uses `PUT /accounting/ap-exceptions/:id/assign` with `{ assigned_to_user_id }` only.
- Resolve/dismiss uses `PUT /accounting/ap-exceptions/:id/resolve` with `{ status, resolution_note }` only.
- Row-based detail panel uses loaded worklist row fields only and does not fetch unsupported detail/comment/escalation data.
- Route/nav permission metadata mirrors backend OR read policy and accounting update mutation policy.
- Router hash preservation was updated so `highlight={exceptionId}` query state is not stripped before the page can parse it.

Direct API verification command for a running authenticated environment:

```bash
curl -H "Authorization: Bearer $TOKEN" "$API_BASE/api/accounting/ap-exceptions/worklist"
```

Assign and resolve runtime verification require a valid exception ID and safe fixture data before use.

## Dependencies

- Story 69-2 (Purchasing domain screens) — complete in sprint status.
- Epic 47 backend — exists under `/api/accounting/ap-exceptions`; source contract verified, direct authenticated runtime verification remains blocked by unavailable local API server.
- Epic 65/67 UI primitives — current EntityTable/FilterBar patterns available.
- Epic 68 notification UI — deep-link UI handling exists, but AP assignment notification producer is not verified.
- Explicit backoffice unfreeze authorization — recorded from Ahmad on 2026-05-21.
- Readiness re-review GO — recorded.
- Explicit implementation GO — recorded from Ahmad on 2026-05-21 via `implement`.

## Shared Contract Changes (MANDATORY for Constants/Types)

No shared contract changes are planned for V1. If implementation discovers a required shared contract change, the story MUST return to readiness review before code implementation continues.

### Consumer Audit Results

| Consumer File | Expected Change | Status |
|---------------|-----------------|--------|
| `apps/backoffice/src/app/routes.ts` | Add route metadata | Implemented |
| `apps/backoffice/src/app/router.tsx` | Add lazy route render | Implemented |
| `apps/backoffice/src/app/layout.tsx` | Add nav group path | Implemented |

## Technical Debt Review

Complete before marking story done. If any box is checked, add a TD item to `docs/adr/TECHNICAL-DEBT.md` before closing.

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [ ] No `as any` casts added without justification and TD item
- [ ] No deprecated functions used without a migration plan
- [ ] No N+1 query patterns introduced
- [ ] No in-memory state introduced that will fail under reload or multi-tab usage
- [ ] All tests included in this story's AC are implemented before story close
- [ ] All new debt items added to registry before story closes

## Notes

- **Story Done Authority (MANDATORY):** The implementing developer MUST NOT mark their own story done. Done requires:
  - Reviewer GO (code review approval with no blockers)
  - Story owner explicit sign-off
- **Definition of Done (MANDATORY):**
  - All V1 acceptance criteria implemented with evidence
  - Unit tests written and passing in `__test__/unit/`
  - Any real DB/API integration tests, if added, use canonical fixtures and no raw SQL setup
  - `npm run typecheck -w @jurnapod/backoffice` passes
  - `npm run build -w @jurnapod/backoffice` passes
  - `npm run lint -w @jurnapod/backoffice` passes
- Code review completed with no blockers
- AI review conducted via implementation review task `ses_1b76d698fffeKzkZyPlLfZD22N`
- Story completion report created (`story-69-5.completion.md`) with all AC evidence and reviewer sign-off
- **Backoffice Freeze:** Story 69-5 V1 implementation is authorized by readiness re-review GO and Ahmad's explicit `implement` instruction.
- **API Verification Gate:** Direct runtime API verification remains blocked by unavailable local API server. Source contract was verified and runtime verification MUST be completed when a running authenticated API fixture environment exists.
