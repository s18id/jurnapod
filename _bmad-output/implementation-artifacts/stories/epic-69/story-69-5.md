# Story 69-5: AP Exception Worklist from Epic 47

Status: backlog

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
I want **an AP exception worklist UI that shows reconciliation variances, mismatches, and disputes**,  
So that **I can resolve exceptions, track resolution progress, and receive notifications when assigned**.

## Context

Epic 47 implemented the AP exception worklist backend (`/api/purchasing/ap-exceptions` or equivalent). This story builds the backoffice UI on that endpoint. The worklist shows reconciliation exceptions: variances, mismatches, and disputes between PO, receipt, and invoice.

The worklist uses EntityTable and FilterBar from Epic 65/67. Detail drawers show full exception details and resolution actions (resolve, escalate, assign). Resolution tracking includes a comment thread and status changes. Deep-links from notifications (Epic 68) route to specific exceptions. The backoffice is under a temporary scope freeze; explicit unfreeze authorization is required.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** What are the 1-3 core success paths?
- [ ] **Error paths identified:** What failure modes must be handled (validation, auth, not-found, conflict)?
- [ ] **Edge cases identified:** Boundary conditions, empty states, race conditions, concurrent access
- [ ] **Test fixture needs identified:** What canonical fixtures or seeded data are required?
- [ ] **Integration test scope defined:** Which tests need real DB vs which are pure unit tests?
- [ ] **Negative auth test role selected:** For permission-gated routes, use `CASHIER` or a dedicated low-privilege test role (NOT `OWNER`/`SUPER_ADMIN`)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Worklist loads with all exceptions and status filters | Happy | Integration |
| Exception resolved, status changes, resolution logged | Happy | Integration |
| User assigned to exception receives notification | Happy | Integration |
| Detail drawer shows full exception and resolution actions | Happy | Integration |
| Empty worklist shows "All AP accounts reconciled" | Edge | Unit |
| Unauthorized user attempts to resolve exception | Error | Integration |
| Concurrent resolution attempts by two users | Edge | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes are enumerated for this story.
- [ ] Consumer catch paths validate `instanceof` checks for each producer error class.
- [ ] Consumer catch paths include `error.name` fallback handling for cross-package boundary mismatches.
- [ ] Error response mapping is deterministic across `instanceof` and `error.name` detection paths.
- [ ] Any missing fallback path is recorded and blocked before implementation starts.

### Error Boundary Test Matrix

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|-------------|----------------|------------------|------------------|---------------------|
| `NotFoundError` | `@jurnapod/modules-purchasing` | `apps/backoffice` | TBD | TBD |
| `ValidationError` | `@jurnapod/shared` | `apps/backoffice` | TBD | TBD |
| `PermissionError` | `@jurnapod/auth` | `apps/backoffice` | TBD | TBD |
| `ConflictError` | `@jurnapod/modules-purchasing` | `apps/backoffice` | TBD | TBD |

**Hard gate:** Domain errors MUST be handled deterministically across module boundaries. Consumer code MUST NOT rely on `instanceof` only when cross-package loading can break prototype identity.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [ ] **Modules touched:** List all modules this story reads/writes
- [ ] **Cross-module decisions identified:** List each decision that spans module boundaries
- [ ] **Winston sign-off obtained:** Each decision must have Winston's explicit written sign-off in the story file
- [ ] **Decisions recorded:** Each decision is written in the `Decisions` table below

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Resolution comment storage: inline vs separate thread API | `purchasing` | Inline comments on exception record; simpler, fewer endpoints | Separate thread API (rejected: over-engineered for v1) | TBD |
| 2 | Notification integration: push via SSE or polling | `platform` (notifications) | Reuse Epic 68 SSE notification system; push when exception assigned | Polling only (rejected: poorer UX) | TBD |
| 3 | Exception status state machine | `purchasing` | `OPEN` → `IN_PROGRESS` → `RESOLVED` / `ESCALATED`; simple 3-state | More granular states (rejected: unnecessary complexity) | TBD |

**Hard gate:** Implementation MUST NOT begin until all rows in the table above have Winston's sign-off. Stories without this section completed will be returned to planning.

---

## API Contract Verification (MANDATORY for UI Stories)

> **Purpose:** Verify all API endpoints return expected contract shapes BEFORE starting UI implementation.
> *"Endpoint exists" ≠ "Endpoint is complete"*

### Pre-Implementation Checklist

- [ ] Call each API endpoint directly (e.g., via curl, Postman, or API client)
- [ ] Verify response shape matches API contract in story or shared package
- [ ] Verify required fields are present and not null/placeholder
- [ ] Verify authentication/authorization works as expected
- [ ] Verify error responses (400, 401, 403, 404, 500) are properly shaped
- [ ] Document any API gaps discovered in the table below

### API Endpoint Verification Results

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|---------|-------|
| `/api/purchasing/ap-exceptions` | GET | `{ data: APException[], pagination: {} }` | TBD | Epic 47 |
| `/api/purchasing/ap-exceptions/:id` | GET | `{ id, type, supplier, invoice_ref, amount, variance, status, assigned_to, comments }` | TBD | Epic 47 |
| `/api/purchasing/ap-exceptions/:id/resolve` | POST | `{ status: 'RESOLVED', resolution_note }` | TBD | Epic 47 |
| `/api/purchasing/ap-exceptions/:id/escalate` | POST | `{ status: 'ESCALATED', escalation_reason }` | TBD | Epic 47 |
| `/api/purchasing/ap-exceptions/:id/assign` | POST | `{ assigned_to: userId }` | TBD | Epic 47 |

### API Gaps Found (Document Here)

| Gap | Impact | Resolution |
|-----|--------|-----------|
| TBD | TBD | TBD |

**Risk R69-004:** The AP exception worklist endpoint from Epic 47 may not be ready. Verify endpoint existence before starting this story. Defer if not available.

---

## Acceptance Criteria

**AC1: Exception List**
**Given** the AP exception worklist page
**When** the page loads
**Then** all reconciliation exceptions are listed with columns: exception type, supplier, invoice ref, amount, variance, status, assigned to, created at

**AC2: Filtering**
**Given** the worklist page
**When** the user applies filters
**Then** FilterBar supports: type, status, supplier, date range, assigned user

**AC3: Resolution**
**Given** an exception is resolved
**When** the resolve action completes
**Then** the status changes to "RESOLVED" and the resolution is logged with timestamp and user

**AC4: Assignment Notification**
**Given** a user is assigned to an exception
**When** the assignment is saved
**Then** the assigned user receives a notification via the notification system from Epic 68

**AC5: Empty State**
**Given** no exceptions exist
**When** the worklist loads
**Then** it shows an empty state: "All AP accounts reconciled"

**AC6: Detail Drawer**
**Given** the user clicks on an exception row
**When** the detail drawer opens
**Then** it shows: full exception details, linked PO/receipt/invoice references, resolution actions (resolve, escalate, assign), and a comment thread

**AC7: Deep-Link from Notification**
**Given** a notification about an exception assignment
**When** the user clicks the notification
**Then** the backoffice navigates to the AP exception worklist with the specific exception highlighted or filtered

**AC8: Permission Enforcement**
**Given** a user without `purchasing.reports` ANALYZE permission (or appropriate exception permission)
**When** the user attempts to access the worklist
**Then** the page is hidden from navigation and the API returns 403

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

> Not applicable — this story creates new screens, not a migration.

## Test Coverage Criteria

- [ ] Coverage target: All happy paths and primary error paths
- [ ] Happy paths to test:
  - [ ] Worklist loads with exceptions
  - [ ] Filter by status/type/supplier/date/assignee
  - [ ] Resolve exception with note
  - [ ] Escalate exception with reason
  - [ ] Assign exception, notification sent
  - [ ] Detail drawer opens with correct data
- [ ] Error paths to test:
  - [ ] 403: Unauthorized access
  - [ ] 404: Exception not found
  - [ ] 409: Exception already resolved

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified that need canonical fixtures
- [ ] Existing canonical fixtures reviewed for reuse potential
- [ ] Fixture location determined by ownership model

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] `createTestAPException()` — canonical AP exception fixture in `@jurnapod/modules-purchasing`
- [ ] **Existing fixtures to update:**
  - [ ] Review existing purchasing fixtures from Epic 63/64/47 for reuse

### Test File Audit (Post-Implementation - MANDATORY)
- [ ] All new tests use canonical fixtures (not ad-hoc raw SQL INSERT/UPDATE)
- [ ] Existing tests audited against new canonical patterns
- [ ] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] AP exception worklist page (`/purchasing/ap-exceptions`) with EntityTable
- [ ] FilterBar integration (type, status, supplier, date range, assigned user)
- [ ] Exception detail drawer with linked references
- [ ] Resolution actions: resolve, escalate, assign
- [ ] Comment thread for resolution tracking
- [ ] Notification deep-link handling
- [ ] Empty state component
- [ ] Write integration tests for worklist flows
- [ ] Write unit tests for components

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/pages/purchasing/exceptions/ExceptionListPage.tsx` | Worklist page |
| `apps/backoffice/src/pages/purchasing/exceptions/ExceptionDetailDrawer.tsx` | Detail drawer |
| `apps/backoffice/src/pages/purchasing/exceptions/ExceptionFilters.tsx` | Filter bar config |
| `apps/backoffice/src/pages/purchasing/exceptions/ResolutionForm.tsx` | Resolve/escalate form |
| `apps/backoffice/src/pages/purchasing/exceptions/CommentThread.tsx` | Comment thread |
| `apps/backoffice/src/hooks/useAPExceptions.ts` | TanStack Query hooks |
| `apps/backoffice/__test__/integration/purchasing/ap-exception-worklist.test.ts` | Integration tests |
| `apps/backoffice/__test__/unit/features/ap-exceptions.test.ts` | Unit tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/App.tsx` | Modify | Add AP exception route |
| `apps/backoffice/src/components/Shell/Navigation.tsx` | Modify | Add AP exception nav item |
| `apps/backoffice/src/hooks/useNotifications.ts` | Modify | Handle exception deep-links |

## Estimated Effort

5 days

## Risk Level

Medium

## Dev Notes

- **Scope Freeze Warning:** `apps/backoffice` is under a temporary architecture-first freeze. This story MUST NOT begin implementation until explicit unfreeze authorization is obtained.
- **Blocked by Story 69-2:** This story depends on the purchasing domain screens being in place for reference links.
- **API verification REQUIRED (R69-004):** Before starting, verify the Epic 47 AP exception endpoint exists and is stable. If the endpoint is missing or unstable, this story MUST be deferred.
- **Notification integration:** Use the notification system from Epic 68. The deep-link format MUST be `/purchasing/ap-exceptions?highlight={exceptionId}`.
- **Permission resource:** `purchasing.reports` ANALYZE (or a dedicated `purchasing.exceptions` resource if added in Epic 47).
- **EntityTable reuse:** Use the same EntityTable configuration patterns as Epic 67 (catalog operations).
- **FilterBar:** Reuse the FilterBar component from Epic 65/67.
- **Cleanup Policy (MANDATORY):** Any code change in this story MUST include a cleanup pass for resolved TODO/FIXME comments, outdated comments, and dead code paths in the modified area.

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events required? Yes
- [ ] Audit fields to capture: `company_id`, `user_id`, `module`, `resource`, `operation`, `exception_id`, `resolution_note`
- [ ] Audit tier: `OPERATIONAL`

### Idempotency
- [ ] Idempotency key field: `client_tx_id` (for resolution mutations)
- [ ] Duplicate handling: `return DUPLICATE`

### Feature Flags
- [ ] Feature flag required? Yes
- [ ] Flag name: `ap_exception_worklist_v1`
- [ ] Rollout modes: `shadow` → `10` → `50` → `100`

### Validation Rules
- [ ] `company_id` must match authenticated company
- [ ] Resolution note MUST be non-empty for resolve/escalate
- [ ] Assigned user MUST belong to the same company

### Error Handling
- [ ] Retryable errors: Network timeout on read (max 3 retries)
- [ ] Non-retryable errors: 400 validation, 403 permission, 404 not found, 409 already resolved
- [ ] Error response format: `{ success: false, error_message: string, code: string }`

### Health Check
- [ ] Health check required? No

## File List

- `story-69-5.md` (this file)
- Multiple page/component files (see Files to Create)

## Validation Evidence

- `npm run test:single -w @jurnapod/backoffice -- __test__/integration/purchasing/ap-exception-worklist.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/ap-exceptions.test.ts` passes
- `npm run qa:e2e -w @jurnapod/backoffice -- --grep "ap-exception|worklist"` passes
- `npm run typecheck -w @jurnapod/backoffice` passes
- `npm run lint -w @jurnapod/backoffice` passes

## Dependencies

- Story 69-2 (Purchasing domain screens) — MUST be substantially complete
- Epic 47 (AP exception worklist backend endpoint) — MUST be verified stable
- Epic 65 (EntityTable, FilterBar, typed API client) — MUST be complete
- Epic 68 (Notification system) — MUST be complete for assignment notifications
- Explicit backoffice unfreeze authorization — MUST be obtained

## Shared Contract Changes (MANDATORY for Constants/Types)

### Blast Radius Check (E33-A1)
- [ ] Grep for all usages of changed constant/type in other packages
- [ ] Grep for all usages in test files
- [ ] Run consuming package tests — all must pass
- [ ] Document any consumer files that needed updates

### Consumer Audit Results

| Consumer File | Tested | Result |
|--------------|---------|--------|
| `apps/backoffice/src/App.tsx` | TBD | TBD |
| `apps/backoffice/src/hooks/useNotifications.ts` | TBD | TBD |

## Technical Debt Review

Complete before marking story done. If any box is checked, add a TD item to [TECHNICAL-DEBT.md](../adr/TECHNICAL-DEBT.md) before closing.

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [ ] No `as any` casts added without justification and TD item
- [ ] No deprecated functions used without a migration plan
- [ ] No N+1 query patterns introduced
- [ ] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [ ] Integration tests included in this story's AC (not deferred)
- [ ] All new debt items added to registry before story closes

## Notes

- **Story Done Authority (MANDATORY):** The implementing developer MUST NOT mark their own story done. Done requires:
  - Reviewer GO (code review approval with no blockers)
  - Story owner explicit sign-off
- **Definition of Done (MANDATORY):**
  - All acceptance criteria implemented with evidence
  - Unit tests written and passing in `__test__/unit/`
  - Integration tests for API boundaries in `__test__/integration/`
  - `npm run typecheck -w @jurnapod/backoffice` passes
  - `npm run build -w @jurnapod/backoffice` passes
  - Code review completed with no blockers
  - AI review conducted (`bmad-review` agent)
  - Story completion report created (`story-69-5.completion.md`) with all AC evidence and second-pass reviewer sign-off
- **Backoffice Freeze:** This epic is queued pending explicit unfreeze. All preflight gates (lint, typecheck, build) MUST pass before kickoff.
- **API Verification Gate:** This story has a hard dependency on the Epic 47 backend endpoint. BEFORE implementation begins, run:
  ```bash
  curl -H "Authorization: Bearer $TOKEN" "$API_BASE/api/purchasing/ap-exceptions"
  ```
  If the endpoint returns 404 or malformed data, defer this story and file a blocker ticket.
