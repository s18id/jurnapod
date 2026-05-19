# Story 69-3: Accounting Domain Screens

Status: backlog

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 69 --story 69-3 --status done --title accounting-domain-screens` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As an **accountant or financial controller**,  
I want **backoffice screens for chart of accounts, journal entries, fiscal periods, and financial reports**,  
So that **I can manage the general ledger, post journal entries, control fiscal periods, and view reports with financial-grade accuracy**.

## Context

The accounting backend endpoints (`/api/accounts`, `/api/journals`, `/api/fiscal-years`, `/api/reports/*`) are stable from prior epics. Epic 32 implemented fiscal year close with a 3-step entry procedure. Epic 46-47 established AP reconciliation and period-close guardrails. This story builds the backoffice UI on that surface.

All forms in this story MUST use the ReviewPanel pattern from Story 69-1. Journal post and void operations are high-risk and require before/after diff. Fiscal period close requires elevated permission and a reason. The backoffice is under a temporary scope freeze; explicit unfreeze authorization is required.

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
| Chart of accounts tree view loads with balances | Happy | Integration |
| Journal entry created with 2 lines, balance indicator shows balanced | Happy | Integration |
| Journal entry posted, becomes read-only | Happy | Integration |
| Journal entry voided with reason, reversal created | Happy | Integration |
| Fiscal period closed with reason, 3-step entries created | Happy | Integration |
| Trial balance report loads with date range | Happy | Integration |
| Report exported to CSV | Happy | Integration |
| Unbalanced journal post blocked | Error | Unit + Integration |
| Period close without permission blocked | Error | Integration |
| Period close without reason rejected | Error | Unit + Integration |
| Empty chart of accounts shows empty state | Edge | Unit |
| Concurrent journal post race condition handled | Edge | Integration |

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
| 1 | Journal balance indicator: client-side preview vs server validation | `accounting` | Client shows running total for UX; server validates before post. Both MUST agree. | Server-only (rejected: poor UX) | TBD |
| 2 | Chart of accounts: tree view vs flat list default | `accounting` | Tree view shows hierarchy; flat list for search. Default to tree with flat toggle. | Flat list default (rejected: hierarchy is primary need) | TBD |
| 3 | Report data: server-side pagination vs full load | `accounting`, `reporting` | Server-side pagination for large GL; full load for small trial balance (configurable) | Always full load (rejected: performance risk) | TBD |

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
| `/api/accounts` | GET | `{ data: Account[], pagination: {} }` | TBD | Chart of accounts |
| `/api/accounts` | POST | `{ id: number, code: string, name: string, type: string }` | TBD | Create account |
| `/api/accounts/:id` | PATCH | `{ id: number, ... }` | TBD | Edit account |
| `/api/journals` | GET | `{ data: Journal[], pagination: {} }` | TBD | Journal list |
| `/api/journals` | POST | `{ id: number, lines: JournalLine[], status: 'DRAFT' }` | TBD | Create journal |
| `/api/journals/:id/post` | POST | `{ status: 'POSTED', journal_id: number }` | TBD | Post journal |
| `/api/journals/:id/void` | POST | `{ status: 'VOIDED', reason: string }` | TBD | Void journal |
| `/api/fiscal-years` | GET | `{ data: FiscalYear[], pagination: {} }` | TBD | Fiscal year list |
| `/api/fiscal-years/:id/close` | POST | `{ status: 'CLOSED', entries: number[] }` | TBD | Close fiscal year |
| `/api/reports/trial-balance` | GET | `{ data: TrialBalanceRow[], date_range: {} }` | TBD | Trial balance |
| `/api/reports/general-ledger` | GET | `{ data: GLRow[], pagination: {} }` | TBD | General ledger |
| `/api/reports/ap-aging` | GET | `{ data: APAgingRow[] }` | TBD | AP aging |
| `/api/reports/ar-aging` | GET | `{ data: ARAgingRow[] }` | TBD | AR aging |

### API Gaps Found (Document Here)

| Gap | Impact | Resolution |
|-----|--------|-----------|
| TBD | TBD | TBD |

---

## Acceptance Criteria

**AC1: Chart of Accounts**
**Given** the chart of accounts page
**When** the page loads
**Then** a tree view shows account hierarchy with type badges and current balances; a flat list toggle is available

**AC2: Journal Entry Creation — Real-Time Balance**
**Given** a journal entry is being created
**When** lines are added or edited
**Then** the debit/credit balance indicator updates in real-time and shows red if unbalanced

**AC3: Journal Entry Post**
**Given** a journal entry is posted
**When** the post action completes
**Then** the entry becomes read-only, shows a "Posted" badge with timestamp, and is no longer editable

**AC4: Journal Entry Void**
**Given** a journal entry is voided
**When** the void action is confirmed
**Then** a reason is required, the void creates a reversal entry with cross-link, and both entries show linked badges

**AC5: Fiscal Period Close**
**Given** a fiscal period close is initiated
**When** the close action is confirmed
**Then** a permission check is enforced, a reason is required, and the close creates the 3-step entries from Epic 32

**AC6: Financial Reports**
**Given** a report (e.g., trial balance)
**When** the report loads with a selected date range
**Then** the data loads correctly with filters applied

**AC7: Report Export**
**Given** the export button on a report
**When** the user clicks export
**Then** the data downloads as a CSV file with proper headers and formatting

**AC8: Permission Enforcement**
**Given** a user without `accounting.journals` CREATE permission
**When** the user attempts to create a journal entry
**Then** the create button is hidden and the API returns 403 if accessed directly

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

> Not applicable — this story creates new screens, not a migration.

## Test Coverage Criteria

- [ ] Coverage target: All happy paths and primary error paths
- [ ] Happy paths to test:
  - [ ] Account list (tree + flat), create, edit, activate/deactivate
  - [ ] Journal entry create with lines, real-time balance, post
  - [ ] Journal entry void with reason, reversal cross-link
  - [ ] Fiscal period list, open, close with reason
  - [ ] Trial balance, general ledger, AP aging, AR aging reports
  - [ ] Report export to CSV
- [ ] Error paths to test:
  - [ ] 400: Unbalanced journal submission
  - [ ] 403: Unauthorized period close attempt
  - [ ] 404: Journal not found
  - [ ] 409: Journal already posted
  - [ ] 422: Closed period blocks journal post

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified that need canonical fixtures
- [ ] Existing canonical fixtures reviewed for reuse potential
- [ ] Fixture location determined by ownership model

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] `createTestAccount()` — canonical account fixture in `@jurnapod/modules-accounting`
  - [ ] `createTestJournalEntry()` — canonical journal with balanced lines
  - [ ] `createTestFiscalYear()` — canonical fiscal year fixture
- [ ] **Existing fixtures to update:**
  - [ ] Review existing accounting fixtures from Epic 63/64 for reuse

### Test File Audit (Post-Implementation - MANDATORY)
- [ ] All new tests use canonical fixtures (not ad-hoc raw SQL INSERT/UPDATE)
- [ ] Existing tests audited against new canonical patterns
- [ ] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Chart of accounts page (`/accounting/accounts`) with tree/flat toggle
- [ ] Account create/edit form with ReviewPanel
- [ ] Account detail drawer with journal line history
- [ ] Journal entry list page with date range filter
- [ ] Journal entry create/edit form with line items and real-time balance
- [ ] Journal entry post action with ReviewPanel
- [ ] Journal entry void action with reason and diff
- [ ] Fiscal period list page with status indicators
- [ ] Fiscal period close form with permission check and reason
- [ ] Trial balance report page with date range and export
- [ ] General ledger report page with account drill-down and export
- [ ] AP aging report page with export
- [ ] AR aging report page with export
- [ ] Write integration tests for all accounting flows
- [ ] Write unit tests for form components

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/pages/accounting/accounts/AccountListPage.tsx` | Account list |
| `apps/backoffice/src/pages/accounting/accounts/AccountFormPage.tsx` | Account form |
| `apps/backoffice/src/pages/accounting/accounts/AccountDetailDrawer.tsx` | Account detail |
| `apps/backoffice/src/pages/accounting/journals/JournalListPage.tsx` | Journal list |
| `apps/backoffice/src/pages/accounting/journals/JournalFormPage.tsx` | Journal form |
| `apps/backoffice/src/pages/accounting/periods/PeriodListPage.tsx` | Period list |
| `apps/backoffice/src/pages/accounting/periods/PeriodCloseForm.tsx` | Period close |
| `apps/backoffice/src/pages/accounting/reports/TrialBalancePage.tsx` | Trial balance |
| `apps/backoffice/src/pages/accounting/reports/GeneralLedgerPage.tsx` | General ledger |
| `apps/backoffice/src/pages/accounting/reports/APAgingPage.tsx` | AP aging |
| `apps/backoffice/src/pages/accounting/reports/ARAgingPage.tsx` | AR aging |
| `apps/backoffice/src/hooks/useAccountingMutations.ts` | TanStack Query mutations |
| `apps/backoffice/__test__/integration/accounting/journal-flow.test.ts` | Integration tests |
| `apps/backoffice/__test__/integration/accounting/period-close.test.ts` | Integration tests |
| `apps/backoffice/__test__/integration/accounting/report-export.test.ts` | Integration tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/App.tsx` | Modify | Add accounting routes |
| `apps/backoffice/src/components/Shell/Navigation.tsx` | Modify | Add accounting nav items (permission-aware) |

## Estimated Effort

10 days

## Risk Level

High

## Dev Notes

- **Scope Freeze Warning:** `apps/backoffice` is under a temporary architecture-first freeze. This story MUST NOT begin implementation until explicit unfreeze authorization is obtained.
- **All forms MUST use ReviewPanel from Story 69-1.** If 69-1 is not complete, this story is blocked.
- **Journal balance indicator:** MUST calculate sum of debits and credits client-side for real-time UX. The calculation MUST match the backend validation exactly. Use `Math.round((a + b) * 100) / 100` for money arithmetic.
- **Fiscal period close:** This is a P0-risk operation. The frontend MUST mirror the backend permission check (`accounting.fiscal_years` MANAGE or elevated role). The reason field is mandatory.
- **Permission resources:** Use `module.resource` format per Epic 39:
  - `accounting.accounts` (CRUD)
  - `accounting.journals` (CRUD)
  - `accounting.fiscal_years` (MANAGE for close)
  - `accounting.reports` (ANALYZE + READ)
- **Report exports:** Use `apiStreamingRequest()` for CSV downloads per backoffice API client rules.
- **Date handling:** Use `@js-temporal/polyfill` for date range calculations. Never use native `Date` for business logic.
- **Cleanup Policy (MANDATORY):** Any code change in this story MUST include a cleanup pass for resolved TODO/FIXME comments, outdated comments, and dead code paths in the modified area.

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events required? Yes
- [ ] Audit fields to capture: `company_id`, `user_id`, `module`, `resource`, `operation`, `entity_id`, `reason`, `period_id`
- [ ] Audit tier: `OPERATIONAL` for journals; `ADMIN` for period close

### Idempotency
- [ ] Idempotency key field: `client_tx_id` (for journal post/void)
- [ ] Duplicate handling: `return DUPLICATE`

### Feature Flags
- [ ] Feature flag required? Yes
- [ ] Flag name: `accounting_screens_v1`
- [ ] Rollout modes: `shadow` → `10` → `50` → `100`

### Validation Rules
- [ ] `company_id` must match authenticated company
- [ ] Journal lines MUST have at least 2 lines (double-entry)
- [ ] Total debits MUST equal total credits before post
- [ ] Period close reason MUST be non-empty
- [ ] Period close requires `accounting.fiscal_years` MANAGE permission

### Error Handling
- [ ] Retryable errors: Network timeout on read operations (max 3 retries)
- [ ] Non-retryable errors: 400 validation, 403 permission, 409 conflict, 422 closed period/unbalanced journal
- [ ] Error response format: `{ success: false, error_message: string, code: string }`

### Health Check
- [ ] Health check required? No

## File List

- `story-69-3.md` (this file)
- Multiple page/component files (see Files to Create)

## Validation Evidence

- `npm run test:single -w @jurnapod/backoffice -- __test__/integration/accounting/journal-flow.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/integration/accounting/period-close.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/integration/accounting/report-export.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/accounting.test.ts` passes
- `npm run qa:e2e -w @jurnapod/backoffice -- --grep "accounting|journal|fiscal"` passes
- `npm run typecheck -w @jurnapod/backoffice` passes
- `npm run lint -w @jurnapod/backoffice` passes

## Dependencies

- Story 69-1 (ReviewPanel and staged forms pattern) — MUST be complete
- Epic 65 (EntityTable, typed API client, TanStack Query) — MUST be complete
- Epic 66 (permission model for financial access control) — MUST be complete
- Epic 32 (fiscal year close backend) — MUST be complete
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
| `apps/backoffice/src/components/Shell/Navigation.tsx` | TBD | TBD |

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
  - Story completion report created (`story-69-3.completion.md`) with all AC evidence and second-pass reviewer sign-off
- **Backoffice Freeze:** This epic is queued pending explicit unfreeze. All preflight gates (lint, typecheck, build) MUST pass before kickoff.
