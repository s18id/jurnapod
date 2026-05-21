# Story 69-4: Financial Review UX — Before/After Diff, Final Confirmation, Audit Trace Evidence

Status: DONE — owner sign-off recorded by Ahmad on 2026-05-21; reviewer GO received from task `ses_1b79bdf9fffeB1v1iJZr1vV7H9`; completion report at `story-69-4.completion.md`

## Readiness Status

- 2026-05-21 unfreeze update: Ahmad wrote `unfreeze` for Story 69-4. This authorizes Story 69-4 readiness and contract-correction work in `apps/backoffice`.
- 2026-05-21 architecture readiness review: task `ses_1b809a97bffeFPSOBOJbbkj2vG` returned **NO-GO for implementation as written**.
- 2026-05-21 architecture correction follow-up: task `ses_1b809a97bffeFPSOBOJbbkj2vG` returned **GO for 69-4-a document correction** and **conditional GO for 69-4-b existing ReviewPanel hardening only after corrected story scope is applied and implementation GO is explicit**.
- 2026-05-21 contract correction status: 69-4-a corrections are applied in this document. Backoffice implementation MUST NOT start until architecture re-review confirms the corrected document is internally consistent and Ahmad gives explicit implementation GO.
- 2026-05-21 architecture re-review: task `ses_1b809a97bffeFPSOBOJbbkj2vG` returned **GO for 69-4-b documentation readiness only**.
- 2026-05-21 implementation GO: Ahmad wrote `implement`. This authorizes the limited 69-4-b existing ReviewPanel hardening batch only.
- Coordination record: `story-69-4.readiness-coordination.md`.

## Corrected Implementation Scope — 2026-05-21

This story is split into safe internal batches. Current status is **69-4-a readiness/contract correction complete**. Code implementation MUST use the corrected first implementation batch below.

### 69-4-a — Readiness / Contract Correction

- Correct API endpoint table and remove unverified response assumptions.
- Resolve cross-module decisions for undo, audit link routing, and complex journal diff grouping.
- Define implementation exclusions so the UI does not fabricate audit links or hidden undo/reversal behavior.

### 69-4-b — Existing ReviewPanel Hardening (First Code Batch)

After explicit implementation GO, implementation MAY harden existing ReviewPanel flows only:

- Journal post/void in `apps/backoffice/src/features/journals-page.tsx`.
- Fiscal close initiate/approve in `apps/backoffice/src/features/fiscal-years-page.tsx`.
- AP invoice post/void in `apps/backoffice/src/features/purchasing/invoices/index.tsx`.
- AP payment/credit flows in `apps/backoffice/src/features/purchasing/payments-credits/index.tsx`.

This batch MUST NOT create a broad new FinancialReview framework. It MUST harden current flows for correctness, traceability, reason validation, dismissal safety, and no fabricated audit links.

### Deferred Scope

- Generic undo/reversal UI, timers, env-configured undo windows, and automatic reversal calls are deferred to a separate architecture/API contract story.
- Direct `/audit?entry_id={id}` links are deferred unless mutation responses expose verified audit IDs.
- Backend audit schema/write changes such as `review_confirmed` are out of scope unless explicitly approved in a backend/API story.
- Generic period override wrappers are out of scope for the first code batch.

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
I want **a review step with before/after diff, confirmation checkbox, and immediate trace evidence access**,  
So that **I can verify the impact of post/void/close actions before committing them and trace every change**.

## Context

This story applies the ReviewPanel pattern from Story 69-1 to all high-risk financial mutations across purchasing and accounting domains. It is cross-cutting: it consumes the domain screens from Stories 69-2 and 69-3 and wraps their critical mutations with a final review step.

The before/after diff MUST be human-readable (NFR69-4), not raw JSON. Void and close operations require a reason. After the action, the user sees a deep-link to the modified entity and verified trace evidence. Direct audit-entry deep-links MUST NOT be shown unless mutation responses expose verified audit log IDs. The backoffice is under a temporary scope freeze; explicit unfreeze authorization is required.

### Unfreeze Gate — 2026-05-21

- [x] Explicit unfreeze authorization recorded by story owner for Story 69-4 — Ahmad wrote `unfreeze` on 2026-05-21.
- [x] Authorization currently applies to readiness/contract-correction work only because architecture review returned NO-GO for implementation as written.
- [x] Implementation GO obtained after contract table, cross-module decisions, audit-link contract, and undo scope are corrected — Ahmad wrote `implement` on 2026-05-21.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** What are the 1-3 core success paths?
- [ ] **Error paths identified:** What failure modes MUST be handled (validation, auth, not-found, conflict)?
- [ ] **Edge cases identified:** Boundary conditions, empty states, race conditions, concurrent access
- [ ] **Test fixture needs identified:** What canonical fixtures or seeded data are required?
- [ ] **Integration test scope defined:** Which tests need real DB vs which are pure unit tests?
- [ ] **Negative auth test role selected:** For permission-gated routes, use `CASHIER` or a dedicated low-privilege test role (NOT `OWNER`/`SUPER_ADMIN`)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Post journal with balanced lines shows confirmation | Happy | Integration |
| Void AP invoice shows before/after diff with verified optional `override_reason` behavior | Happy | Integration |
| Close fiscal period shows elevated permission check + reason | Happy | Integration |
| Success notification contains entity link plus verified audit trace behavior or text trace IDs | Happy | Unit + Integration |
| Unbalanced journal post shows validation error, not confirmation | Error | Unit + Integration |
| Journal void and fiscal close without required reason are blocked; AP invoice/payment void follows optional `override_reason` contract | Error | Unit + Integration |
| User dismisses review panel, no mutation occurs | Error | Unit |
| Journal with 20+ lines shows grouped/changed-lines-only diff | Edge | Unit |
| No undo UI, timer, env-configured undo window, or automatic reversal call appears in the first implementation batch | Edge | Unit |

**Sign-off:** Scenario set is ready for owner implementation GO.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes or API error response codes are enumerated for this story.
- [ ] Consumer catch paths validate `instanceof` checks where producer errors cross package boundaries.
- [ ] Consumer catch paths include deterministic API error code/name/message fallback handling for UI HTTP boundaries.
- [ ] Error response mapping is deterministic across applicable `instanceof` and API error code/name/message detection paths.
- [ ] Any missing fallback path is recorded and blocked before implementation starts.

### Error Boundary Test Matrix

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|-------------|----------------|------------------|------------------|---------------------|
| `ClosedPeriodError` | API HTTP response from accounting routes | `apps/backoffice` | N/A for UI HTTP boundary | Handle deterministic HTTP error code/name/message; do not depend on package prototype identity. |
| `UnbalancedJournalError` | API HTTP response from journal routes | `apps/backoffice` | N/A for UI HTTP boundary | Handle deterministic HTTP error code/name/message; do not depend on package prototype identity. |
| `ValidationError` | API/shared validation response | `apps/backoffice` | N/A for UI HTTP boundary | Handle deterministic HTTP error code/name/message; do not depend on package prototype identity. |
| `PermissionError` | API/auth response | `apps/backoffice` | N/A for UI HTTP boundary | Handle deterministic HTTP error code/name/message; do not depend on package prototype identity. |

**Hard gate:** Domain errors MUST be handled deterministically across module boundaries. Consumer code MUST NOT rely on `instanceof` only when cross-package loading can break prototype identity.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [ ] **Modules touched:** List all modules this story reads/writes
- [ ] **Cross-module decisions identified:** List each decision that spans module boundaries
- [ ] **Winston sign-off obtained:** Each decision MUST have Winston's explicit written sign-off in the story file
- [ ] **Decisions recorded:** Each decision is written in the `Decisions` table below

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Undo is excluded from Story 69-4 first implementation batch. No 5-minute undo window will be implemented. Corrective flows remain explicit domain actions: journal void/reversal, invoice/payment void, and fiscal close approve flow. | `accounting`, `purchasing` | Current APIs do not expose a verified generic undo/reversal contract. Hidden reversal semantics can violate immutable financial record rules. Immutable financial records MUST use explicit VOID/REVERSAL workflows. | 5-minute undo via reversal API rejected for 69-4 because route semantics, idempotency, permissions, and audit behavior are not verified. | **Winston GO — Defer undo to separate architecture/API story. Story 69-4 MUST NOT implement undo UI, timers, env window config, or automatic reversal calls.** |
| 2 | Audit links MUST use verified audit query routes only. Mutation responses MUST NOT be assumed to expose `audit_entry_id`. First batch MAY render entity-scoped audit explorer links only when stable entity type + ID are known: `#/audit?objectType={entity_type}&objectId={entity_id}`. If no verified entity mapping exists, omit audit link and show backend trace IDs as text. | `platform`, `accounting`, `purchasing` | Current mutation responses do not expose `audit_entry_id`. Existing audit explorer supports entity-scoped query params and `/api/audit-logs`; fabricated direct entry links create traceability falsehood. | `/audit?entry_id={id}` rejected because mutation responses do not provide verified IDs and audit explorer does not use that contract. Inline audit detail rejected for first batch. | **Winston GO — No fabricated audit-entry links. Use verified entity-scoped audit route only; otherwise omit audit links and display journal/reversal/close request IDs as trace references.** |
| 3 | Complex journal diff is UI-only evidence formatting over backend-returned data. For 20+ journal lines, group by account code/id, show changed/material lines, summarize totals, and collapse unchanged lines behind `N unchanged lines`. | `accounting`, `apps/backoffice` | Keeps review human-readable without recomputing accounting effects client-side. Backend remains authoritative for journal lines, totals, status, and reversal IDs. | Flat list all lines rejected as unreadable. Client-side recomputation of posting/reversal effects rejected as parallel financial logic. | **Winston GO — Implement as pure presentation logic only. MUST NOT recompute or infer journal effects beyond formatting backend-returned fields.** |

### Architecture Readiness Findings — 2026-05-21

| Severity | Finding | Required Resolution |
|----------|---------|---------------------|
| P0 | Story 69-4 unfreeze was missing at readiness review time. | ✅ Resolved for readiness work — Ahmad wrote `unfreeze` on 2026-05-21. |
| P1 | Winston sign-offs were unresolved for undo, audit link routing, and diff grouping. | ✅ Resolved in Decision Record rows 1-3. |
| P1 | Mutation responses do not expose verified `audit_entry_id` fields. | ✅ Resolved by prohibiting fabricated direct audit-entry links. First batch MAY use verified entity-scoped audit explorer links only when stable entity mapping exists; otherwise it MUST show backend trace IDs as text. |
| P1 | Undo/reversal API semantics are not verified. | ✅ Resolved by deferring undo to a separate architecture/API contract story. |
| P1 | Fiscal close endpoint table was incorrect. | ✅ Resolved with actual `/api/accounts/fiscal-years/:id/close-preview`, `/close`, and `/close/approve` flow. |
| P1 | Purchasing void reason/response assumptions were incorrect. | ✅ Resolved with current AP invoice/payment void contracts: optional `override_reason`, partial `{ id, reversal_batch_id }` response, and required detail refetch. |
| P2 | Scope was too broad for one implementation slice. | ✅ Resolved by limiting first code batch to existing ReviewPanel hardening and deferring broad framework, audit-ID deep-links, and undo design. |

**Hard gate:** Implementation MUST NOT begin until architecture re-review confirms this corrected document is internally consistent and Ahmad gives explicit implementation GO.

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

| Endpoint | Method | Actual Expected Shape | Verified | Notes |
|----------|--------|-----------------------|----------|-------|
| `/api/journals/:id` | GET | `{ success: true, data: JournalEntryResponse }` with `id`, `status`, `lines[]`, `total_debits`, `total_credits`, optional `void_reason`, `original_journal_id`, `reversal_journal_id` | Source-verified | No `audit_entry_id`. Source: `apps/api/src/routes/journals.ts`, `packages/shared/src/schemas/journals.ts`. |
| `/api/journals/:id/post` | POST | `{ success: true, data: JournalEntryResponse }` with posted journal data | Source-verified | No `audit_entry_id`; no undo contract. Source: `apps/api/src/routes/journals.ts`. |
| `/api/journals/:id/void` | POST | Request `{ reason }`; response `{ success: true, data: JournalEntryResponse }` with `status: VOIDED` and reversal metadata when available | Source-verified | No `audit_entry_id`; request field is `reason`; response reason field is `void_reason`. Source: `apps/api/src/routes/journals.ts`. |
| `/api/purchasing/invoices/:id` | GET | `{ success: true, data: PurchaseInvoice }` including `id`, `status`, `grand_total`, `journal_batch_id`, `voided_at`, and detail fields/lines where loaded | Source-verified | No `balance`; no `audit_entry_id`. Source: `apps/api/src/routes/purchasing/purchase-invoices.ts`. |
| `/api/purchasing/invoices/:id/void` | POST | Request MAY include `{ override_reason }`; response `{ success: true, data: { id, reversal_batch_id } }` | Source-verified | Partial response only; UI MUST refetch invoice detail. No `reason`; no `audit_entry_id`. Source: `apps/api/src/routes/purchasing/purchase-invoices.ts`. |
| `/api/purchasing/payments/:id` | GET | `{ success: true, data: ApPayment }` including `id`, `status`, `journal_batch_id`, `voided_at`, and lines where loaded | Source-verified | No `audit_entry_id`. Source: `apps/api/src/routes/purchasing/ap-payments.ts`. |
| `/api/purchasing/payments/:id/void` | POST | Request MAY include `{ override_reason }`; response `{ success: true, data: { id, reversal_batch_id } }` | Source-verified | Partial response only; UI MUST refetch payment detail. No `reason`; no `audit_entry_id`. Source: `apps/api/src/routes/purchasing/ap-payments.ts`. |
| `/api/accounts/fiscal-years/:id/close-preview` | GET | `{ success: true, data: ClosePreviewResult }` with totals and `closingEntries[]` | Source-verified | Preview only; no mutation. Source: `apps/api/src/routes/accounts.ts`. |
| `/api/accounts/fiscal-years/:id/close` | POST | Request `{ reason, close_request_id? }`; response initiates close request and returns fields such as `fiscalYearId`, `closeRequestId`, `status`, `reason`, `canApprove`, `netIncome`, `totalIncome`, `totalExpenses`, `closingEntriesCount` | Source-verified | This does not finalize close by itself. No `audit_entry_id`. Source: `apps/api/src/routes/accounts.ts`. |
| `/api/accounts/fiscal-years/:id/close/approve` | POST | Request `{ close_request_id }`; response returns final close result with `fiscalYearId`, `closeRequestId`, `status`, `previousStatus`, `newStatus`, `postedBatchIds`, `netIncome`, `totalIncome`, `totalExpenses`, `hasImbalance` | Source-verified | Finalizes close. No `audit_entry_id`. Source: `apps/api/src/routes/accounts.ts`. |
| `/api/audit-logs` | GET | `{ success: true, data: { total, logs, limit, offset } }` with filters including `entity_type`, `entity_id`, `action`, `success`, `from_ts`, `to_ts` | Source-verified | Correct audit list route. Not `/api/audit/logs`. Source: `apps/api/src/routes/audit-logs.ts`. |
| `/api/audit-logs/:id` | GET | `{ success: true, data: AuditLog }` | Source-verified | Detail route exists, but mutation responses do not return the ID. Source: `apps/api/src/routes/audit-logs.ts`. |

### Corrected Architecture Contract Notes — 2026-05-21

The endpoint table above is the corrected source-verified contract for the first implementation batch:

- Fiscal close MUST use actual routes under `/api/accounts/fiscal-years/:id/close-preview`, `/api/accounts/fiscal-years/:id/close`, and `/api/accounts/fiscal-years/:id/close/approve`.
- Audit logs MUST use `/api/audit-logs` and `/api/audit-logs/:id` unless another verified audit route is explicitly selected.
- Mutation responses MUST NOT be assumed to include `audit_entry_id` until verified in API code/tests.
- AP invoice/payment void request and response fields MUST follow the actual purchasing routes and services documented above.

### API Gaps Found (Document Here)

| Gap | Impact | Resolution |
|-----|--------|-----------|
| Mutation responses do not expose `audit_entry_id`. | Direct audit-entry links from mutation success states would be fabricated. | Use verified entity-scoped audit links only when entity mapping is stable; otherwise omit audit link and display backend IDs as text trace references. |
| Generic undo/reversal endpoint is not verified. | Undo UI would risk hidden or duplicate financial reversals. | Defer undo to separate architecture/API contract story. |
| Fiscal close path in original story was wrong. | UI would call wrong route and collapse initiate/approve semantics. | Use actual `/api/accounts/fiscal-years/:id/close-preview`, `/close`, and `/close/approve` flow. |
| AP invoice/payment void responses are partial. | UI cannot assume final status/reason/audit fields from void response alone. | Refetch detail after void and display backend-returned reversal batch IDs as trace evidence. |

---

## Acceptance Criteria

**AC1: Validation Before Review**
**Given** a user clicks "Post" on an unbalanced journal
**When** the review panel opens
**Then** it shows a validation error ("Journal is unbalanced") and the confirmation checkbox is disabled

**AC2: Void Review with Diff**
**Given** a user clicks "Void" on an AP invoice
**When** the review panel opens
**Then** it shows the backend-returned before state and the intended after state (`VOIDED` plus available reversal batch trace after mutation/refetch) in a human-readable diff. The UI MUST NOT infer final balances that the API does not return.

**AC3: Success Notification with Links**
**Given** the user confirms a high-risk action
**When** the action completes successfully
**Then** a success notification appears with a deep-link to the entity and either a verified entity-scoped audit explorer link or backend trace IDs as text evidence. The UI MUST NOT fabricate direct audit-entry links.

**AC4: Grouped Diff for Complex Journals**
**Given** a journal entry has many lines (20+)
**When** the before/after diff renders
**Then** only changed lines are shown; unchanged lines are collapsed under "N unchanged lines"; grouped by account code

**AC5: Undo Deferred**
Generic undo is explicitly out of scope for Story 69-4 first implementation batch. Financial corrections MUST use explicit VOID/REVERSAL domain flows. Undo UI, timers, env window config, and automatic reversal calls MUST NOT be implemented until a separate architecture/API contract story defines and verifies the semantics.

**AC6: Dismissal Safety**
**Given** the user opens the review panel
**When** the user dismisses the panel without confirming
**Then** no mutation occurs and the entity remains in its previous state

**AC7: Confirmation Checkbox**
**Given** the review panel shows a valid high-risk action
**When** the user attempts to confirm
**Then** a checkbox "I confirm this action is correct and authorized" MUST be checked before the confirm button is enabled

**AC8: Reason / Override Field Contract**
**Given** a journal void or fiscal close action whose verified backend contract requires `reason`
**When** the review panel renders
**Then** a reason field is visible and mandatory; the confirm button is disabled until a non-empty reason is entered

**Given** an AP invoice/payment void action whose verified backend contract accepts optional `override_reason`
**When** the review panel renders
**Then** the UI MUST follow the current optional `override_reason` contract and MUST NOT imply a persisted void reason unless the backend exposes that behavior

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

> Not applicable — this story adds review wrappers, not a migration.

## Test Coverage Criteria

- [ ] Coverage target: All review UX paths and guard conditions
- [ ] Happy paths to test:
  - [ ] Review panel opens for journal post with balanced lines
  - [ ] Review panel opens for invoice void with diff
  - [ ] Review panel opens for period close with permission check
  - [ ] Success notification shows entity link plus verified audit trace behavior or text trace IDs
- [ ] Error paths to test:
  - [ ] Unbalanced journal blocks confirmation
  - [ ] Missing reason blocks journal void and fiscal close only; AP invoice/payment void follows optional `override_reason` behavior
  - [ ] Missing confirmation checkbox blocks submit
  - [ ] Dismissal prevents mutation
- [ ] Edge paths to test:
  - [ ] Complex journal diff grouping

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

- [x] Complete 69-4-a readiness/contract correction before implementation.
- [x] Obtain explicit implementation GO for 69-4-b existing ReviewPanel hardening — Ahmad wrote `implement` on 2026-05-21.
- [x] Harden journal post ReviewPanel in the existing journals page.
- [x] Harden journal void ReviewPanel in the existing journals page.
- [x] Harden AP invoice post/void ReviewPanel behavior in the existing purchasing invoices page via focused regression coverage of optional `override_reason` and no fabricated audit-link behavior.
- [x] Harden AP payment/credit ReviewPanel behavior in the existing purchasing payments/credits page via focused regression coverage of optional `override_reason` and no fabricated audit-link behavior.
- [x] Harden fiscal close initiate/approve ReviewPanel behavior in the existing fiscal years page via existing reason and `close_request_id` contract coverage reviewed in 69-4-b.
- [x] Implement complex journal diff grouping as pure UI formatting over backend-returned lines/totals only.
- [x] Implement success notification trace behavior without fabricated audit-entry links.
- [x] Write focused unit tests for existing page flows, confirmation checkbox, reason/override contract handling, dismissal safety, and no-fabricated-audit-link behavior.
- [x] Document review UX hardening pattern for future domain screens in this story and completion report.

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/lib/financial-review-formatters.ts` | Pure UI formatting helpers for complex journal diffs and trace evidence, if existing helpers are insufficient. |
| `apps/backoffice/__test__/unit/lib/financial-review-formatters.test.ts` | Unit tests for pure formatting helpers, if created. |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/features/journals-page.tsx` | Modify | Harden existing ReviewPanel behavior for journal post/void. |
| `apps/backoffice/src/features/fiscal-years-page.tsx` | Modify | Harden existing ReviewPanel behavior for fiscal close initiate/approve. |
| `apps/backoffice/src/features/purchasing/invoices/index.tsx` | Modify | Harden existing ReviewPanel behavior for AP invoice post/void. |
| `apps/backoffice/src/features/purchasing/payments-credits/index.tsx` | Modify | Harden existing ReviewPanel behavior for AP payment/credit flows. |

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
- **Undo window:** Deferred. Story 69-4 MUST NOT implement generic undo UI, timers, env window config, or automatic reversal calls until a separate architecture/API contract story verifies immutable financial reversal semantics.
- **Audit links:** Direct `/audit?entry_id={auditEntryId}` links are prohibited unless mutation responses expose verified audit IDs. First implementation batch MAY use verified entity-scoped audit explorer links or omit audit links and show backend trace IDs as text evidence.
- **Confirmation checkbox:** This is a WCAG 2.2 requirement for legal/financial submissions. It MUST be a real checkbox, not a hidden field.
- **Cleanup Policy (MANDATORY):** Any code change in this story MUST include a cleanup pass for resolved TODO/FIXME comments, outdated comments, and dead code paths in the modified area.

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events required? Existing backend audit behavior only; Story 69-4 first batch MUST NOT add backend audit writes or schema fields.
- [ ] UI trace evidence: entity link plus verified entity-scoped audit explorer link when stable entity mapping exists; otherwise backend trace IDs as text (`journal_batch_id`, `reversal_batch_id`, `closeRequestId`, posted batch IDs).
- [ ] Prohibited: fabricated direct `/audit?entry_id=...` links and new `review_confirmed` audit fields.

### Idempotency
- [ ] New idempotency behavior required? No for first UI hardening batch.
- [ ] Wrapped mutations MUST use their existing backend contracts only. The UI MUST NOT invent `client_tx_id` fields for endpoints that do not expose that contract.

### Feature Flags
- [ ] Feature flag required? No for hardening existing ReviewPanel flows.
- [ ] Deferred: A new broad FinancialReview framework MAY require a separate feature-flag decision in a future story.

### Validation Rules
- [ ] `company_id` MUST match authenticated company
- [ ] Reason field MUST be non-empty for journal void and fiscal close actions whose backend contract requires `reason`
- [ ] AP invoice/payment void MUST follow the current optional `override_reason` contract and MUST NOT imply persisted void reason behavior
- [ ] Confirmation checkbox MUST be checked
- [ ] Journal MUST be balanced before post review proceeds

### Error Handling
- [ ] Retryable errors: Network timeout on mutation (max 3 retries via API client)
- [ ] Non-retryable errors: 400 validation, 403 permission, 409 conflict, 422 closed period
- [ ] Error response handling: UI MUST consume deterministic API client error `code` and `message` values derived from the standardized envelope `{ success: false, error: { code, message } }`

### Health Check
- [ ] Health check required? No

## File List

- `story-69-4.md` (this file)
- `apps/backoffice/src/components/ReviewPanel/ReviewPanel.tsx`
- `apps/backoffice/src/features/journals-page.tsx`
- `apps/backoffice/src/lib/financial-review-formatters.ts`
- `apps/backoffice/__test__/unit/components/ReviewPanel.test.ts`
- `apps/backoffice/__test__/unit/lib/financial-review-formatters.test.ts`
- `apps/backoffice/__test__/unit/features/journals-page.test.tsx`
- `apps/backoffice/__test__/unit/features/purchasing-invoices.test.tsx`
- `apps/backoffice/__test__/unit/features/purchasing-payments-credits.test.tsx`
- `_bmad-output/implementation-artifacts/stories/epic-69/story-69-4.completion.md`

## Validation Evidence

- `logs/story-69-4-b-focused-r3.log` — focused unit tests passed: 6 files, 43 tests; exit `0`.
- `logs/story-69-4-b-typecheck-r2.log` — `npm run typecheck -w @jurnapod/backoffice`; exit `0`.
- `logs/story-69-4-b-lint-r2.log` — `npm run lint -w @jurnapod/backoffice`; exit `0`.
- `logs/story-69-4-b-build-r1.log` — `npm run build -w @jurnapod/backoffice`; exit `0` with existing Vite chunk warnings.
- `logs/story-69-4-b-sprint-status-validate-r1.log` — sprint status validation passed; exit `0`.
- Implementation review task `ses_1b79bdf9fffeB1v1iJZr1vV7H9` returned GO for implementation quality with no P0/P1/P2/P3 findings.
- Story completion report draft created at `_bmad-output/implementation-artifacts/stories/epic-69/story-69-4.completion.md`; owner sign-off remains pending before DONE.

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
- [ ] Run consuming package tests — all MUST pass
- [ ] Document any consumer files that needed updates

### Consumer Audit Results

| Consumer File | Tested | Result |
|--------------|---------|--------|
| `apps/backoffice/src/features/journals-page.tsx` | Pending | Targeted for 69-4-b implementation validation. |
| `apps/backoffice/src/features/fiscal-years-page.tsx` | Pending | Targeted for 69-4-b implementation validation. |
| `apps/backoffice/src/features/purchasing/invoices/index.tsx` | Pending | Targeted for 69-4-b implementation validation. |
| `apps/backoffice/src/features/purchasing/payments-credits/index.tsx` | Pending | Targeted for 69-4-b implementation validation. |

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
