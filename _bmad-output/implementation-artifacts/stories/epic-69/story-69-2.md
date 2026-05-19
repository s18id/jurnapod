# Story 69-2: Purchasing Domain Screens

Status: backlog

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 69 --story 69-2 --status done --title purchasing-domain-screens` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **purchasing officer**,  
I want **backoffice screens for suppliers, purchase orders, goods receipts, AP invoices, payments, and credit notes**,  
So that **I can manage the full purchasing lifecycle with staged forms, audit trails, and financial-grade error prevention**.

## Context

Epic 46 implemented the purchasing/AP backend logic (suppliers, exchange rates, POs, receipts, invoices, payments, credits). Epic 47 added AP reconciliation, period-close guardrails, and audit trail. This story builds the backoffice UI on top of that backend surface.

All forms in this story MUST use the ReviewPanel pattern from Story 69-1. Void/refund operations require a reason field and show a before/after state diff. The backoffice is under a temporary scope freeze; explicit unfreeze authorization is required.

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
| Supplier CRUD via EntityTable and form | Happy | Integration |
| PO create with 3 line items, submit, status changes | Happy | Integration |
| Goods receipt created from PO with pre-filled lines | Happy | Integration |
| AP invoice posted and journal entry created | Happy | Integration |
| AP invoice voided with reason, audit link shown | Happy | Integration |
| AP payment allocated to multiple invoices | Happy | Integration |
| Supplier credit note applied to open invoice | Happy | Integration |
| PO submit with closed period blocked by backend | Error | Integration |
| Void operation without reason rejected | Error | Unit + Integration |
| User without `purchasing.invoices` CREATE gets 403 | Error | Integration |
| Empty supplier list shows empty state | Edge | Unit |
| Concurrent PO edit race condition handled | Edge | Integration |

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
| `ValidationError` | `@jurnapod/shared` | `apps/backoffice` | TBD | TBD |
| `NotFoundError` | `@jurnapod/modules-purchasing` | `apps/backoffice` | TBD | TBD |
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
| 1 | PO-to-receipt line item pre-fill strategy | `purchasing`, `inventory` | Backend PO endpoint returns full line items; frontend maps to receipt form state | Manual re-entry (rejected: violates DRY, error-prone) | TBD |
| 2 | Tax calculation: frontend preview vs backend authoritative | `purchasing`, `accounting` | Frontend shows preview; backend is authoritative on post. Prevents drift. | Frontend authoritative (rejected: risk of mismatch) | TBD |
| 3 | Invoice allocation UI: single-page vs wizard | `purchasing` | Single-page with ReviewPanel fits Epic 69 pattern; wizard fragments context | Wizard (rejected: inconsistent with 69-1) | TBD |

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
| `/api/purchasing/suppliers` | GET | `{ data: Supplier[], pagination: {} }` | TBD | Epic 46 |
| `/api/purchasing/suppliers` | POST | `{ id: number, code: string, ... }` | TBD | Epic 46 |
| `/api/purchasing/purchase-orders` | GET | `{ data: PO[], pagination: {} }` | TBD | Epic 46 |
| `/api/purchasing/purchase-orders` | POST | `{ id: number, status: string, lines: POLine[] }` | TBD | Epic 46 |
| `/api/purchasing/purchase-orders/:id/submit` | POST | `{ status: 'SUBMITTED' }` | TBD | Epic 46 |
| `/api/purchasing/goods-receipts` | GET | `{ data: GR[], pagination: {} }` | TBD | Epic 46 |
| `/api/purchasing/goods-receipts` | POST | `{ id: number, po_id: number, lines: GRLine[] }` | TBD | Epic 46 |
| `/api/purchasing/invoices` | GET | `{ data: APInvoice[], pagination: {} }` | TBD | Epic 46 |
| `/api/purchasing/invoices` | POST | `{ id: number, status: 'DRAFT', ... }` | TBD | Epic 46 |
| `/api/purchasing/invoices/:id/post` | POST | `{ status: 'POSTED', journal_id: number }` | TBD | Epic 46 |
| `/api/purchasing/invoices/:id/void` | POST | `{ status: 'VOIDED', reason: string }` | TBD | Epic 46 |
| `/api/purchasing/payments` | GET | `{ data: Payment[], pagination: {} }` | TBD | Epic 46 |
| `/api/purchasing/payments` | POST | `{ id: number, allocated: Allocation[] }` | TBD | Epic 46 |
| `/api/purchasing/credits` | GET | `{ data: CreditNote[], pagination: {} }` | TBD | Epic 46 |
| `/api/purchasing/credits` | POST | `{ id: number, applied_to: number[] }` | TBD | Epic 46 |

### API Gaps Found (Document Here)

| Gap | Impact | Resolution |
|-----|--------|-----------|
| TBD | TBD | TBD |

---

## Acceptance Criteria

**AC1: Supplier Management**
**Given** the suppliers page
**When** the page loads
**Then** EntityTable displays suppliers with search, pagination, and status filters; create/edit forms use ReviewPanel

**AC2: Purchase Order Creation**
**Given** a new PO is created with 3 line items
**When** the user submits the PO
**Then** the PO status changes to "submitted" and stock is reserved per backend logic

**AC3: Goods Receipt from PO**
**Given** a goods receipt is created from a PO
**When** the receipt form opens
**Then** PO line items are pre-filled with editable received quantity and condition notes

**AC4: AP Invoice Void**
**Given** an AP invoice is voided
**When** the void action is confirmed
**Then** a reason is required, the voided status is reflected in the list, and an audit trail link is shown

**AC5: AP Payment Post**
**Given** an AP payment is posted
**When** the post action completes
**Then** paid invoice amounts are updated and a journal entry is created (verified in audit log)

**AC6: Supplier Credit Note Application**
**Given** a supplier credit note is applied
**When** the apply action completes
**Then** the invoice balance is reduced and the application is shown in the invoice detail

**AC7: Audit Trail Links**
**Given** any void/refund/post operation
**When** the operation completes
**Then** an audit trail deep-link is displayed in the success notification

**AC8: Permission Enforcement**
**Given** a user without `purchasing.invoices` CREATE permission
**When** the user attempts to create an invoice
**Then** the create button is hidden and the API returns 403 if accessed directly

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

> Not applicable — this story creates new screens, not a migration.

## Test Coverage Criteria

- [ ] Coverage target: All happy paths and primary error paths
- [ ] Happy paths to test:
  - [ ] Supplier list, create, edit, activate/deactivate
  - [ ] PO create with lines, submit, receive, close
  - [ ] Goods receipt create from PO
  - [ ] AP invoice create from PO, post, void
  - [ ] AP payment create, allocate, post, void
  - [ ] Supplier credit create, apply to invoice
- [ ] Error paths to test:
  - [ ] 400: Invalid PO line item (negative quantity)
  - [ ] 403: Unauthorized void attempt
  - [ ] 404: PO not found for receipt creation
  - [ ] 409: Invoice already posted
  - [ ] 422: Closed period blocks posting

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified that need canonical fixtures
- [ ] Existing canonical fixtures reviewed for reuse potential
- [ ] Fixture location determined by ownership model

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] `createTestSupplier()` — canonical supplier fixture in `@jurnapod/modules-purchasing`
  - [ ] `createTestPurchaseOrder()` — canonical PO with lines
  - [ ] `createTestAPInvoice()` — canonical AP invoice with lines
  - [ ] `createTestAPPayment()` — canonical payment with allocation
- [ ] **Existing fixtures to update:**
  - [ ] Review existing purchasing fixtures from Epic 63/64 for reuse

### Test File Audit (Post-Implementation - MANDATORY)
- [ ] All new tests use canonical fixtures (not ad-hoc raw SQL INSERT/UPDATE)
- [ ] Existing tests audited against new canonical patterns
- [ ] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Supplier list page (`/purchasing/suppliers`) with EntityTable
- [ ] Supplier create/edit form with ReviewPanel
- [ ] Supplier detail drawer with purchase history
- [ ] Purchase order list page with status filter
- [ ] Purchase order create/edit form with line items
- [ ] Purchase order submit/receive/close actions
- [ ] Goods receipt list page
- [ ] Goods receipt create form (from PO) with editable lines
- [ ] AP invoice list page
- [ ] AP invoice create form (from PO or standalone)
- [ ] AP invoice post action with ReviewPanel
- [ ] AP invoice void action with reason and diff
- [ ] AP payment list page
- [ ] AP payment create/allocate form
- [ ] AP payment post/void actions
- [ ] Supplier credit note list page
- [ ] Supplier credit note create/apply form
- [ ] Write integration tests for all purchasing flows
- [ ] Write unit tests for form components

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/pages/purchasing/suppliers/SupplierListPage.tsx` | Supplier list |
| `apps/backoffice/src/pages/purchasing/suppliers/SupplierFormPage.tsx` | Supplier form |
| `apps/backoffice/src/pages/purchasing/suppliers/SupplierDetailDrawer.tsx` | Supplier detail |
| `apps/backoffice/src/pages/purchasing/orders/OrderListPage.tsx` | PO list |
| `apps/backoffice/src/pages/purchasing/orders/OrderFormPage.tsx` | PO form |
| `apps/backoffice/src/pages/purchasing/receipts/ReceiptListPage.tsx` | GR list |
| `apps/backoffice/src/pages/purchasing/receipts/ReceiptFormPage.tsx` | GR form |
| `apps/backoffice/src/pages/purchasing/invoices/InvoiceListPage.tsx` | AP invoice list |
| `apps/backoffice/src/pages/purchasing/invoices/InvoiceFormPage.tsx` | AP invoice form |
| `apps/backoffice/src/pages/purchasing/payments/PaymentListPage.tsx` | Payment list |
| `apps/backoffice/src/pages/purchasing/payments/PaymentFormPage.tsx` | Payment form |
| `apps/backoffice/src/pages/purchasing/credits/CreditListPage.tsx` | Credit note list |
| `apps/backoffice/src/pages/purchasing/credits/CreditFormPage.tsx` | Credit note form |
| `apps/backoffice/src/hooks/usePurchasingMutations.ts` | TanStack Query mutations |
| `apps/backoffice/__test__/integration/purchasing/supplier-flow.test.ts` | Integration tests |
| `apps/backoffice/__test__/integration/purchasing/po-flow.test.ts` | Integration tests |
| `apps/backoffice/__test__/integration/purchasing/invoice-flow.test.ts` | Integration tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/App.tsx` | Modify | Add purchasing routes |
| `apps/backoffice/src/components/Shell/Navigation.tsx` | Modify | Add purchasing nav items (permission-aware) |

## Estimated Effort

10 days

## Risk Level

High

## Dev Notes

- **Scope Freeze Warning:** `apps/backoffice` is under a temporary architecture-first freeze. This story MUST NOT begin implementation until explicit unfreeze authorization is obtained.
- **All forms MUST use ReviewPanel from Story 69-1.** If 69-1 is not complete, this story is blocked.
- **Void operations:** All voids require a reason field. The reason MUST be sent to the backend and stored in the audit trail.
- **Permission resources:** Use `module.resource` format per Epic 39:
  - `purchasing.suppliers` (CRUD)
  - `purchasing.orders` (CRUD)
  - `purchasing.receipts` (CRUD)
  - `purchasing.invoices` (CRUD)
  - `purchasing.payments` (CRUD)
  - `purchasing.credits` (CRUD)
- **Money display:** Use `DECIMAL(19,4)` formatting; never show raw floats. Format with `toLocaleString` and currency symbol.
- **EntityTable config:** Reuse patterns from Epic 67 (catalog operations).
- **API client:** Use canonical `getStoredAccessToken()` path; never pass `accessToken` explicitly.
- **Cleanup Policy (MANDATORY):** Any code change in this story MUST include a cleanup pass for resolved TODO/FIXME comments, outdated comments, and dead code paths in the modified area.

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events required? Yes
- [ ] Audit fields to capture: `company_id`, `user_id`, `module`, `resource`, `operation`, `entity_id`, `reason`
- [ ] Audit tier: `OPERATIONAL`

### Idempotency
- [ ] Idempotency key field: `client_tx_id` (for mutations that may retry)
- [ ] Duplicate handling: `return DUPLICATE`

### Feature Flags
- [ ] Feature flag required? Yes
- [ ] Flag name: `purchasing_screens_v1`
- [ ] Rollout modes: `shadow` → `10` → `50` → `100`

### Validation Rules
- [ ] `company_id` must match authenticated company
- [ ] `outlet_id` must be valid for the authenticated company
- [ ] PO line item quantity MUST be > 0
- [ ] Invoice post MUST have balanced lines (backend enforces; frontend shows preview)

### Error Handling
- [ ] Retryable errors: Network timeout on read operations (max 3 retries)
- [ ] Non-retryable errors: 400 validation, 403 permission, 409 conflict, 422 closed period
- [ ] Error response format: `{ success: false, error_message: string, code: string }`

### Health Check
- [ ] Health check required? No

## File List

- `story-69-2.md` (this file)
- Multiple page/component files (see Files to Create)

## Validation Evidence

- `npm run test:single -w @jurnapod/backoffice -- __test__/integration/purchasing/supplier-flow.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/integration/purchasing/po-flow.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/integration/purchasing/invoice-flow.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing.test.ts` passes
- `npm run qa:e2e -w @jurnapod/backoffice -- --grep "purchasing"` passes
- `npm run typecheck -w @jurnapod/backoffice` passes
- `npm run lint -w @jurnapod/backoffice` passes

## Dependencies

- Story 69-1 (ReviewPanel and staged forms pattern) — MUST be complete
- Epic 65 (EntityTable, typed API client, TanStack Query) — MUST be complete
- Epic 66 (permission model for financial access control) — MUST be complete
- Epic 46 (purchasing/AP backend) — MUST be complete
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
  - Story completion report created (`story-69-2.completion.md`) with all AC evidence and second-pass reviewer sign-off
- **Backoffice Freeze:** This epic is queued pending explicit unfreeze. All preflight gates (lint, typecheck, build) MUST pass before kickoff.
