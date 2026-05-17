# Epic 69: Finance & Purchasing — High-Risk Forms, Review Steps, Evidence UX

**Status:** planned (queued — requires explicit backoffice unfreeze before execution)
**Sprint/Timebox:** Weeks 9–10 (of Backoffice Frontend Program)
**Theme:** Financial-grade form patterns for high-risk domains: purchasing (suppliers, POs, goods receipts, AP invoices, payments, credits) and accounting (journals, accounts, fiscal period controls, reports). Staged review steps with before/after diff, autosaved drafts, unsaved-changes guards, and audit trail links.
**Primary Modules:** `apps/backoffice`, `packages/modules/purchasing`, `packages/modules/accounting`
**Predecessor:** Epics 66 (Core Admin — permissions for financial access control), 67 (Catalog Operations — data-grid and filter primitives)
**Exit Gate:** Purchasing domain screens all functional with staged forms; accounting domain screens functional with fiscal period controls; ReviewPanel with before/after diff integrated into high-risk mutations; behind-feature-flag rollout mechanism verified; all tests pass.

---

## 1) Charter

### 1.1 Program Alignment

Epic 69 delivers the highest-risk domain surfaces: finance and purchasing. These workflows handle money movement, supplier obligations, journal entries, and fiscal period transitions. The UI MUST provide strong error prevention, clear review steps, and explicit audit trail linkage — per WCAG 2.2 error prevention guidance for legal/financial/data submissions.

### 1.2 What We Know

- The backend has comprehensive purchasing endpoints: `/api/purchasing/suppliers`, `/api/purchasing/purchase-orders`, `/api/purchasing/goods-receipts`, `/api/purchasing/invoices`, `/api/purchasing/payments`, `/api/purchasing/credits`
- Accounting endpoints include: `/api/accounts`, `/api/journals`, `/api/fiscal-years`, `/api/reports/*`
- Epic 46 implemented the purchasing/AP backend logic (suppliers, exchange rates, POs, receipts, invoices, payments, credits)
- Epic 47 added AP reconciliation, period-close guardrails, and audit trail
- The backend enforces: closed-period blocking, VOID/REFUND for corrections, immutable finalized records
- Fiscal year close from Epic 32 has a 3-step entry procedure with transaction atomicity

### 1.3 Non-Goals

- No new backend purchasing or accounting features (reuse existing API surface)
- No bulk invoice processing or automated three-way matching (deferred)
- No bank reconciliation or treasury management UI (future scope)
- No financial report builder or custom report designer (use existing report endpoints)
- No period-over-period report comparison UI — date-range filtering is in scope; side-by-side period comparison is deferred to future analytics scope
- No sales, dine-in, customer admin, or POS support domain screens — deferred to a future approved backoffice domain program

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Statement | Story |
|----|-----------|-------|
| FR69-1 | The backoffice MUST provide a reusable ReviewPanel component with: sectioned layout, persistent section summaries, autosaved drafts, inline validation, unsaved-changes guard, before/after diff, and final review step | 69-1 |
| FR69-2 | The backoffice MUST provide supplier management: list, create, edit, activate/deactivate | 69-2 |
| FR69-3 | The backoffice MUST provide purchase order management: create with line items, submit, receive, close | 69-2 |
| FR69-4 | The backoffice MUST provide goods receipt management: create from PO, line-level quantity/condition, link to AP invoice | 69-2 |
| FR69-5 | The backoffice MUST provide AP invoice management: create from PO/receipt, post, void with reason, audit trail | 69-2 |
| FR69-6 | The backoffice MUST provide AP payment management: create, allocate to invoices, post, void | 69-2 |
| FR69-7 | The backoffice MUST provide supplier credit note management: create, apply to invoices | 69-2 |
| FR69-8 | The backoffice MUST provide account management: chart of accounts, create/edit, activate/deactivate | 69-3 |
| FR69-9 | The backoffice MUST provide journal entry management: create with lines, post, view balanced/unbalanced status | 69-3 |
| FR69-10 | The backoffice MUST provide fiscal period controls: open/close period, view period status, override with audit trail | 69-3 |
| FR69-11 | The backoffice MUST provide financial reports: trial balance, general ledger, AP aging, AR aging | 69-3 |
| FR69-12 | High-risk financial mutations (post journal, void invoice, close period) MUST use ReviewPanel with before/after diff and final confirmation | 69-4 |
| FR69-13 | Financial changes MUST produce an audit entry link that the user can navigate to immediately after the mutation | 69-4 |
| FR69-14 | The backoffice MUST provide an AP exception worklist from Epic 47 backend: reconciliation variances, mismatches, resolution tracking | 69-5 |

### Non-Functional Requirements

| NFR | Statement | Validation |
|-----|-----------|------------|
| NFR69-1 | Journal entry form MUST show real-time debit/credit balance as lines are added | Manual verification |
| NFR69-2 | Void/refund operations MUST show a confirmation dialog with reason field (required) | Manual verification |
| NFR69-3 | Fiscal period close MUST require elevated permission check AND reason | Integration test |
| NFR69-4 | Before/after diff MUST be human-readable, not raw JSON | Manual review |
| NFR69-5 | Unsaved-changes guard MUST trigger when navigating away from a dirty form | Unit test |

---

## 3) Story Breakdown

### Story 69-1 — ReviewPanel and staged forms pattern

**Status:** planned
**Type:** foundation (reusable component)
**Risk:** High (foundation pattern for all financial forms)
**Dependencies:** Epic 65 (EntityTable/DetailDrawer primitives, TanStack Query)

Build the financial-grade form system:
- **ReviewPanel:** wraps form sections in collapsible cards; shows section completion status (incomplete/complete/review)
- **Staged form pattern:** left-to-right or top-to-bottom section progression; each section has save-draft capability
- **Autosave:** saves form state to localStorage as draft on interval (every 30s) and on section completion
- **Unsaved-changes guard:** Mantine `useBeforeUnload` + React Router `useBlocker` when form has dirty fields
- **Inline validation:** fields validated on blur; section-level validation on section complete; form-level validation on submit
- **Before/after diff:** for edit forms, shows old and new values side-by-side or in a structured diff list before final confirmation
- **Final review step:** summary of all changes, affected entity links, scope badges, and "Save and log change" button

**Acceptance Criteria:**
- Given a multi-section form (e.g., AP invoice), each section shows a completion badge (red/yellow/green)
- Given the user types in a field and navigates away, the unsaved-changes guard blocks navigation with a confirmation dialog
- Given autosave is enabled, the form state is restored on page reload after an accidental close
- Given an edit form, the final review step shows a before/after diff of all changed fields in human-readable format
- Given the form is submitted, the user sees a success state with links to the created entity and the audit entry
- Unit tests verify: dirty state detection, autosave serialization, diff calculation, blocker integration

---

### Story 69-2 — Purchasing domain: suppliers, POs, receipts, AP invoices, payments, credits

**Status:** planned
**Type:** feature
**Risk:** High (broad domain surface, many interlinked entities)
**Dependencies:** 69-1 (ReviewPanel), Epic 65 (EntityTable, typed API client, TanStack Query)

Implement purchasing domain screens:

**Suppliers:** list (EntityTable), create/edit form (name, code, contact, tax info, payment terms), activate/deactivate, detail view with purchase history summary
**Purchase Orders:** list with status filter (draft, submitted, received, closed), create with line items (item selector, quantity, unit price), submit, receive (converts to goods receipt), close
**Goods Receipts:** create from PO (pre-filled line items, editable received qty, condition notes), link to AP invoice
**AP Invoices:** create from PO or standalone, line items, tax calculation, post (creates journal entry), void (with required reason), detail with payment allocation status
**AP Payments:** create, select invoices to allocate, post, void with reason
**Supplier Credit Notes:** create, apply to open invoices, void with reason

Each form uses the ReviewPanel pattern from 69-1. Each mutation action shows audit trail links. Void operations require a reason field and show a before/after state diff.

**Acceptance Criteria:**
- Given the suppliers page, EntityTable loads suppliers with search and pagination
- Given a new PO is created with 3 line items, on submit the PO status changes to "submitted" and the stock is reserved (per backend logic)
- Given a goods receipt is created from a PO, the PO line items are pre-filled and editable
- Given an AP invoice is voided, a reason is required and the voided status is reflected in the list
- Given an AP payment is posted, the paid invoice amounts are updated and the journal entry is created (verified in audit log)
- Given a supplier credit note is applied, the invoice balance is reduced
- All void/refund operations show an audit trail link after completion

---

### Story 69-3 — Accounting domain: journals, accounts, fiscal periods, reports

**Status:** planned
**Type:** feature
**Risk:** High (financial correctness critical)
**Dependencies:** 69-1 (ReviewPanel), Epic 65 (EntityTable, typed API client, TanStack Query)

Implement accounting domain screens:

**Accounts (Chart of Accounts):** tree or list view with EntityTable, create/edit (code, name, type, active status), activate/deactivate, detail with journal line history
**Journal Entries:** list with date range filter, create with line items (real-time debit/credit balance indicator), post (validates balance before posting), view posted entries (read-only), void entry (with reason, creates reversal)
**Fiscal Periods:** period list with status (open/closed), open period, close period (with elevated permission check and required reason), override closed period (high-privilege audited path)
**Financial Reports:** trial balance (with date range), general ledger (account drill-down), AP aging, AR aging. All reports use read-only EntityTable with export-to-CSV.

**Acceptance Criteria:**
- Given the chart of accounts, the tree view shows account hierarchy with type badges and current balance
- Given a journal entry is being created, the debit/credit balance indicator updates in real-time and shows red if unbalanced
- Given a journal entry is posted, it becomes read-only and shows a "Posted" badge with timestamp
- Given a journal entry is voided, a reason is required and the void creates a reversal entry with cross-link
- Given a period close, a permission check is made and a reason is required; the close creates the 3-step entries from Epic 32
- Given a report (e.g., trial balance), the data loads with the selected date range and filters
- Given the export button on a report, the data downloads as CSV

---

### Story 69-4 — Financial review UX: before/after diff, final confirmation, audit links

**Status:** planned
**Type:** feature (cross-cutting)
**Risk:** Medium
**Dependencies:** 69-1 (ReviewPanel), 69-2, 69-3 (domain forms)

Implement the financial review UX pattern that applies across all high-risk mutations:
- Before posting/voiding/closing, show a review panel with:
  - Summary of the action ("You are about to POST journal entry #JE-0042")
  - Before/after diff of affected accounts and balances
  - Scope badges (company, outlet, period)
  - Confirmation checkbox: "I confirm this action is correct and authorized"
  - Reason/note field (required for void/close, optional for post)
- After the action:
  - Success message with deep-link to the created/modified entity
  - Deep-link to the audit entry that was created
  - "Undo" button (only available for actions that support reversal within a configurable window)
- This pattern is applied to: journal post, journal void, invoice void, payment void, period close, period override

**Acceptance Criteria:**
- Given a user clicks "Post" on an unbalanced journal, the review panel shows a validation error, not the confirmation
- Given a user clicks "Void" on an AP invoice, the review panel shows the before state (invoices balance) and after state (voided, balance reduced)
- Given the user confirms the action, a success notification appears with links to the entity and audit entry
- Given a journal entry has many lines, the before/after diff groups multi-line journal entries by changed lines only
- Given the action supports undo, the "Undo" button appears for the configured duration
- Given the user dismisses the review panel, no mutation occurs

---

### Story 69-5 — AP exception worklist from Epic 47

**Status:** planned
**Type:** feature
**Risk:** Medium
**Dependencies:** 69-2 (AP invoices, payments), Epic 47 backend (AP exception worklist endpoint)

Implement the AP exception worklist UI (data from Epic 47 backend):
- List of reconciliation exceptions: variances, mismatches, disputes
- EntityTable with columns: exception type, supplier, invoice ref, amount, variance, status, assigned to, created at
- FilterBar: type, status, supplier, date range, assigned user
- Detail drawer: full exception details, resolution actions (resolve, escalate, assign)
- Resolution tracking: comment thread, status changes, resolution evidence
- Deep-link from notification (Epic 68) to specific exception

**Acceptance Criteria:**
- Given the AP exception worklist, all reconciliation exceptions are listed with current status
- Given an exception is resolved, the status changes and the resolution is logged
- Given a user is assigned to an exception, they receive a notification (via notification system from Epic 68)
- Given no exceptions exist, the worklist shows an empty state: "All AP accounts reconciled"

---

## 4) Epic Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R69-001 | P0 | Financial mutation UI may submit incorrect data (wrong account, wrong amount) | ReviewPanel shows before/after diff for every financial mutation; backend remains authoritative |
| R69-002 | P1 | Fiscal period close UI requires elevated permission — must verify backend enforcement | Frontend mirrors permission check; backend MUST reject unauthorized close attempts |
| R69-003 | P1 | Before/after diff for complex journal entries with 20+ lines may be hard to read | Group diffs by line; show only changed lines in the diff view |
| R69-004 | P2 | AP exception worklist endpoint from Epic 47 may not be ready | Verify endpoint existence before starting the story; defer if not available |
| R69-005 | P2 | Unsaved-changes guard may conflict with autosave if both trigger simultaneously | Autosave marks the form as clean; blocker checks dirty state after autosave |

---

## 5) Preconditions

| # | Precondition | Enforcement | Status |
|---|--------------|-------------|--------|
| 1 | Epic 66 (Core Admin) complete — permission model for financial access control | sprint-status.yaml | ❌ (HOLDING) |
| 2 | Epic 65 complete — EntityTable and FilterBar primitives available | sprint-status.yaml | ❌ (HOLDING) |
| 3 | Backoffice unfreeze authorized | Written authorization | ❌ (HOLDING) |
| 4 | Typed API client covers all purchasing and accounting endpoints | 65-2 completion | ❌ (HOLDING) |
| 5 | Epic 47 AP exception worklist endpoint exists and is stable | Technical spike | ❌ (must verify) |

---

## 6) Exit Gate

1. **Build Gate:** `npm run build` and `npm run typecheck` pass
2. **ReviewPanel Gate:** Staged form pattern with autosave, unsaved-changes guard, before/after diff, and final confirmation all functional
3. **Purchasing Gate:** Suppliers, POs, receipts, AP invoices, payments, credits all functional with staged forms and audit links
4. **Accounting Gate:** Chart of accounts, journal entries (with balance indicator), fiscal periods, reports all functional
5. **Financial Review UX Gate:** Before/after diff on all high-risk mutations; confirmation with reason; audit trail deep-links
6. **AP Exception Gate:** Worklist renders with filters and resolution actions
7. **Test Gate:** Unit tests for ReviewPanel, purchasing flows, accounting flows, financial review UX all pass
8. **SOLID/DRY/KISS Gate:** Full rescore passes at pre-close

---

## 7) Validation Commands

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# ReviewPanel tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/review-panel.test.ts

# Purchasing tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing.test.ts

# Accounting tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/accounting.test.ts

# Financial review UX tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/financial-review.test.ts

# AP exception worklist tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/ap-exceptions.test.ts

# Playwright CT tests for ReviewPanel
npm run qa:ct -w @jurnapod/backoffice -- --grep "ReviewPanel|StagedForm|Diff"

# E2E smoke test for critical financial flows
npm run qa:e2e -w @jurnapod/backoffice -- --grep "purchasing|accounting|journal|fiscal"

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 69
```

---

_Last Updated: 2026-05-17_
