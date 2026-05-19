# Story 69-4: Financial Review UX — Before/After Diff, Final Confirmation, Audit Links

Status: backlog

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 69 --story 69-4 --status done --title financial-review-ux` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **financial user performing high-risk mutations**,  
I want **a review step with before/after diff, confirmation checkbox, and immediate audit trail access**,  
So that **I can verify the impact of post/void/close actions before committing them and trace every change**.

## Context

This story applies the ReviewPanel pattern from Story 69-1 to all high-risk financial mutations across purchasing and accounting domains. It is cross-cutting: it consumes the domain screens from Stories 69-2 and 69-3 and wraps their critical mutations with a final review step.

The before/after diff MUST be human-readable (NFR69-4), not raw JSON. Void and close operations require a reason. After the action, the user sees deep-links to both the modified entity and the audit entry. The backoffice is under a temporary scope freeze; explicit unfreeze authorization is required.

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
| Post journal with balanced lines shows confirmation | Happy | Integration |
| Void AP invoice shows before/after diff with reason | Happy | Integration |
| Close fiscal period shows elevated permission check + reason | Happy | Integration |
| Success notification contains entity link and audit link | Happy | Integration |
| Unbalanced journal post shows validation error, not confirmation | Error | Unit + Integration |
| Void without reason is blocked | Error | Unit + Integration |
| User dismisses review panel, no mutation occurs | Error | Unit |
| Journal with 20+ lines shows grouped/changed-lines-only diff | Edge | Unit |
| Undo button appears for configurable window after action | Edge | Integration |

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
| `ClosedPeriodError` | `@jurnapod/modules-accounting` | `apps/backoffice` | TBD | TBD |
| `UnbalancedJournalError` | `@jurnapod/modules-accounting` | `apps/backoffice` | TBD | TBD |
| `ValidationError` | `@jurnapod/shared` | `apps/backoffice` | TBD | TBD |
| `PermissionError` | `@jurnapod/auth` | `apps/backoffice` | TBD | TBD |

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
| 1 | Undo window duration and mechanism | `accounting`, `purchasing` | 5-minute undo window via reversal API; backend supports reversals for journals and some invoice voids | Instant irreversible (rejected: poor UX for honest mistakes) | TBD |
| 2 | Audit link format and routing | `platform` (audit) | Deep-link to `/audit?entry_id={id}` using existing audit timeline from Epic 68 | Inline audit detail (rejected: duplicates Epic 68 work) | TBD |
| 3 | Diff grouping strategy for complex journals | `accounting` | Group by account code; show only changed lines; collapse unchanged lines with "N more lines" toggle | Flat list all lines (rejected: unreadable at 20+ lines) | TBD |

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
| `/api/journals/:id` | GET | `{ id, lines: [{ account_id, debit, credit }], status }` | TBD | For before/after diff |
| `/api/journals/:id/post` | POST | `{ status: 'POSTED', journal_id, audit_entry_id }` | TBD | Audit link source |
| `/api/journals/:id/void` | POST | `{ status: 'VOIDED', reason, reversal_id, audit_entry_id }` | TBD | Audit link source |
| `/api/purchasing/invoices/:id` | GET | `{ id, lines, status, balance, total }` | TBD | For before/after diff |
| `/api/purchasing/invoices/:id/void` | POST | `{ status: 'VOIDED', reason, audit_entry_id }` | TBD | Audit link source |
| `/api/purchasing/payments/:id/void` | POST | `{ status: 'VOIDED', reason, audit_entry_id }` | TBD | Audit link source |
| `/api/fiscal-years/:id/close` | POST | `{ status: 'CLOSED', entries, audit_entry_id }` | TBD | Audit link source |
| `/api/audit/logs` | GET | `{ data: AuditLog[], pagination }` | TBD | Audit trail query |

### API Gaps Found (Document Here)

| Gap | Impact | Resolution |
|-----|--------|-----------|
| TBD | TBD | TBD |

---

## Acceptance Criteria

**AC1: Validation Before Review**
**Given** a user clicks "Post" on an unbalanced journal
**When** the review panel opens
**Then** it shows a validation error ("Journal is unbalanced") and the confirmation checkbox is disabled

**AC2: Void Review with Diff**
**Given** a user clicks "Void" on an AP invoice
**When** the review panel opens
**Then** it shows the before state (invoice balance, lines) and after state (voided, balance reduced to zero) in a human-readable diff

**AC3: Success Notification with Links**
**Given** the user confirms a high-risk action
**When** the action completes successfully
**Then** a success notification appears with deep-links to the entity and the audit entry

**AC4: Grouped Diff for Complex Journals**
**Given** a journal entry has many lines (20+)
**When** the before/after diff renders
**Then** only changed lines are shown; unchanged lines are collapsed under "N unchanged lines"; grouped by account code

**AC5: Undo Button**
**Given** an action supports undo (e.g., journal post within reversal window)
**When** the success notification appears
**Then** an "Undo" button is visible for the configured duration (default 5 minutes)

**AC6: Dismissal Safety**
**Given** the user opens the review panel
**When** the user dismisses the panel without confirming
**Then** no mutation occurs and the entity remains in its previous state

**AC7: Confirmation Checkbox**
**Given** the review panel shows a valid high-risk action
**When** the user attempts to confirm
**Then** a checkbox "I confirm this action is correct and authorized" MUST be checked before the confirm button is enabled

**AC8: Reason Field for Void/Close**
**Given** a void or close action
**When** the review panel renders
**Then** a reason/note field is visible and mandatory; the confirm button is disabled until a non-empty reason is entered

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

> Not applicable — this story adds review wrappers, not a migration.

## Test Coverage Criteria

- [ ] Coverage target: All review UX paths and guard conditions
- [ ] Happy paths to test:
  - [ ] Review panel opens for journal post with balanced lines
  - [ ] Review panel opens for invoice void with diff
  - [ ] Review panel opens for period close with permission check
  - [ ] Success notification shows entity + audit links
  - [ ] Undo button appears and functions
- [ ] Error paths to test:
  - [ ] Unbalanced journal blocks confirmation
  - [ ] Missing reason blocks void/close
  - [ ] Missing confirmation checkbox blocks submit
  - [ ] Dismissal prevents mutation
- [ ] Edge paths to test:
  - [ ] Complex journal diff grouping
  - [ ] Undo window expiration

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified that need canonical fixtures
- [ ] Existing canonical fixtures reviewed for reuse potential
- [ ] Fixture location determined by ownership model

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] `createTestReviewPanelContext()` — mock context for review panel unit tests
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation - MANDATORY)
- [ ] All new tests use canonical fixtures (not ad-hoc raw SQL INSERT/UPDATE)
- [ ] Existing tests audited against new canonical patterns
- [ ] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Implement `useFinancialReview` hook that wraps mutations with review panel flow
- [ ] Implement review panel variants for: journal post, journal void, invoice void, payment void, period close, period override
- [ ] Implement success notification component with entity link + audit link
- [ ] Implement undo action handler (reversal API call within window)
- [ ] Implement diff grouping logic for complex journals
- [ ] Wire review panel into Story 69-2 purchasing screens
- [ ] Wire review panel into Story 69-3 accounting screens
- [ ] Write unit tests for review hook and notification component
- [ ] Write integration tests for end-to-end review flows
- [ ] Document review UX pattern for future domain screens

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/hooks/useFinancialReview.ts` | Wrapper hook for review-enabled mutations |
| `apps/backoffice/src/components/FinancialReview/ReviewModal.tsx` | Review modal shell |
| `apps/backoffice/src/components/FinancialReview/JournalPostReview.tsx` | Journal post review content |
| `apps/backoffice/src/components/FinancialReview/JournalVoidReview.tsx` | Journal void review content |
| `apps/backoffice/src/components/FinancialReview/InvoiceVoidReview.tsx` | Invoice void review content |
| `apps/backoffice/src/components/FinancialReview/PaymentVoidReview.tsx` | Payment void review content |
| `apps/backoffice/src/components/FinancialReview/PeriodCloseReview.tsx` | Period close review content |
| `apps/backoffice/src/components/FinancialReview/SuccessNotification.tsx` | Success with links |
| `apps/backoffice/src/components/FinancialReview/UndoAction.tsx` | Undo button + handler |
| `apps/backoffice/src/lib/diff-formatter.ts` | Human-readable diff formatter |
| `apps/backoffice/__test__/unit/hooks/useFinancialReview.test.ts` | Hook tests |
| `apps/backoffice/__test__/unit/components/FinancialReview.test.ts` | Component tests |
| `apps/backoffice/__test__/unit/lib/diff-formatter.test.ts` | Diff formatter tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/pages/accounting/journals/JournalFormPage.tsx` | Modify | Wire review panel to post/void |
| `apps/backoffice/src/pages/accounting/periods/PeriodCloseForm.tsx` | Modify | Wire review panel to close |
| `apps/backoffice/src/pages/purchasing/invoices/InvoiceFormPage.tsx` | Modify | Wire review panel to void |
| `apps/backoffice/src/pages/purchasing/payments/PaymentFormPage.tsx` | Modify | Wire review panel to void |

## Estimated Effort

7 days

## Risk Level

Medium

## Dev Notes

- **Scope Freeze Warning:** `apps/backoffice` is under a temporary architecture-first freeze. This story MUST NOT begin implementation until explicit unfreeze authorization is obtained.
- **Blocked by Stories 69-2 and 69-3:** This story wires into domain screens; it MUST NOT start until 69-2 and 69-3 are substantially complete.
- **Diff formatter:** MUST produce human-readable output. Example format:
  - `Account 1000-Cash: Debit $500.00 → $750.00`
  - `Account 2000-AP: Credit $0.00 → $250.00 (new line)`
- **Undo window:** Configurable via environment variable (default 300000 ms = 5 minutes). After expiration, the undo button is hidden.
- **Audit links:** Use `/audit?entry_id={auditEntryId}` route from Epic 68. If the audit system is not available, the link is omitted gracefully.
- **Confirmation checkbox:** This is a WCAG 2.2 requirement for legal/financial submissions. It MUST be a real checkbox, not a hidden field.
- **Cleanup Policy (MANDATORY):** Any code change in this story MUST include a cleanup pass for resolved TODO/FIXME comments, outdated comments, and dead code paths in the modified area.

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events required? Yes
- [ ] Audit fields to capture: `company_id`, `user_id`, `module`, `resource`, `operation`, `entity_id`, `reason`, `review_confirmed`
- [ ] Audit tier: `OPERATIONAL`

### Idempotency
- [ ] Idempotency key field: `client_tx_id` (inherited from wrapped mutations)
- [ ] Duplicate handling: `return DUPLICATE`

### Feature Flags
- [ ] Feature flag required? Yes
- [ ] Flag name: `financial_review_ux_v1`
- [ ] Rollout modes: `shadow` → `10` → `50` → `100`

### Validation Rules
- [ ] `company_id` must match authenticated company
- [ ] Reason field MUST be non-empty for void/close
- [ ] Confirmation checkbox MUST be checked
- [ ] Journal MUST be balanced before post review proceeds

### Error Handling
- [ ] Retryable errors: Network timeout on mutation (max 3 retries via API client)
- [ ] Non-retryable errors: 400 validation, 403 permission, 409 conflict, 422 closed period
- [ ] Error response format: `{ success: false, error_message: string, code: string }`

### Health Check
- [ ] Health check required? No

## File List

- `story-69-4.md` (this file)
- Multiple component/hook files (see Files to Create)

## Validation Evidence

- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/hooks/useFinancialReview.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/FinancialReview.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib/diff-formatter.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/financial-review.test.ts` passes
- `npm run qa:e2e -w @jurnapod/backoffice -- --grep "financial-review|journal|void"` passes
- `npm run typecheck -w @jurnapod/backoffice` passes
- `npm run lint -w @jurnapod/backoffice` passes

## Dependencies

- Story 69-1 (ReviewPanel and staged forms pattern) — MUST be complete
- Story 69-2 (Purchasing domain screens) — MUST be substantially complete
- Story 69-3 (Accounting domain screens) — MUST be substantially complete
- Epic 68 (Audit timeline, notifications) — MUST be complete for audit links
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
| `apps/backoffice/src/pages/accounting/journals/JournalFormPage.tsx` | TBD | TBD |
| `apps/backoffice/src/pages/purchasing/invoices/InvoiceFormPage.tsx` | TBD | TBD |

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
  - Story completion report created (`story-69-4.completion.md`) with all AC evidence and second-pass reviewer sign-off
- **Backoffice Freeze:** This epic is queued pending explicit unfreeze. All preflight gates (lint, typecheck, build) MUST pass before kickoff.
