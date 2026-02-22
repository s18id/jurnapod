# Milestone M8 Implementation Plan (Sales v1: Invoice + Payment In)

Status: completed

For final implementation evidence, see `docs/checklists/m8-final-completion.md`.

This plan defines a minimal, runnable implementation for M8 with Accounting/GL as source of truth.

## Goal and Scope

Goal:
- Support sales invoice jasa and payment in, with both documents posting to journals.

Scope:
- PR-15: Invoice CRUD + lines, post action (lock and post), simple print/PDF endpoint.
- PR-16: Payment in CRUD, allocation to invoice (partial allowed), payment posting to journal.
- Acceptance:
  - Invoice posted creates journal entries.
  - Payment posted reduces AR and creates journal entries.

## Current Baseline

- Generic posting engine exists: `packages/core/src/posting.ts`.
- Active posting integration currently exists for POS sync only: `apps/api/src/lib/sync-push-posting.ts`.
- Backoffice has routes/features for items/prices and reports, but not invoice/payment pages: `apps/backoffice/src/app/routes.ts`.
- DB migrations currently do not include sales invoice or payment-in tables: `packages/db/migrations`.

## Delivery Phases

## Phase 1 - Contracts and DB Schema

Tasks:
- Add shared Zod schemas and DTO contracts for invoices and payments.
- Add migration for invoice, invoice lines, and payment-in tables.

Suggested targets:
- `packages/shared/src/schemas/sales.ts` (new)
- `packages/shared/src/index.ts` (export updates)
- `packages/db/migrations/0010_sales_invoice_payment_in_v1.sql` (new)

DB tables (minimum):
- `sales_invoices`
  - Header totals (`subtotal`, `tax_amount`, `grand_total`), payment rollup (`paid_total`, `payment_status`), lifecycle (`DRAFT|POSTED|VOID`).
  - Unique number by company: `(company_id, invoice_no)`.
  - Non-negative money checks and `paid_total <= grand_total`.
- `sales_invoice_lines`
  - `description`, `qty`, `unit_price`, `line_total`, sequential `line_no`.
  - FK to invoice with cascade delete.
- `sales_payments`
  - `invoice_id`, `amount`, `method` (`CASH|QRIS|CARD`), lifecycle (`DRAFT|POSTED|VOID`).
  - Unique number by company: `(company_id, payment_no)`.
  - FK to invoice and outlet scope.

Definition of done:
- Migrations run successfully and schema supports all M8 lifecycle/state needs.

## Phase 2 - API Service and Routes (Invoice)

Tasks:
- Build invoice service layer for CRUD and post transition.
- Enforce draft-only edits and immutable posted documents.
- Add post endpoint to lock and post invoice in one DB transaction.

Suggested targets:
- `apps/api/src/lib/sales.ts` (new)
- `apps/api/app/api/sales/invoices/route.ts` (new)
- `apps/api/app/api/sales/invoices/[invoiceId]/route.ts` (new)
- `apps/api/app/api/sales/invoices/[invoiceId]/post/route.ts` (new)

Definition of done:
- Invoice can be created/updated as draft, then posted once with deterministic status handling.

## Phase 3 - API Service and Routes (Payment In + Allocation)

Tasks:
- Build payment-in CRUD and post transition.
- Validate invoice is posted and not void before accepting payment post.
- Allow partial allocation by capping payment amount to current invoice outstanding.

Suggested targets:
- `apps/api/src/lib/sales.ts` (extend)
- `apps/api/app/api/sales/payments/route.ts` (new)
- `apps/api/app/api/sales/payments/[paymentId]/route.ts` (new)
- `apps/api/app/api/sales/payments/[paymentId]/post/route.ts` (new)

Definition of done:
- Payment post updates invoice `paid_total` and `payment_status` (`UNPAID|PARTIAL|PAID`) safely.

## Phase 4 - GL Posting Integration

Tasks:
- Integrate invoice and payment posting via existing `PostingService` contract.
- Ensure post operations are atomic (doc transition + journal write + rollup update).

Suggested targets:
- `apps/api/src/lib/sales-posting.ts` (new)
- `apps/api/src/lib/sales.ts` (transaction orchestration)

Posting mapping (v1):
- Invoice post (`SALES_INVOICE`):
  - Dr Accounts Receivable = `grand_total`
  - Cr Sales Revenue = `subtotal`
  - Cr Tax Payable = `tax_amount` (when `tax_amount > 0`)
- Payment post (`SALES_PAYMENT_IN`):
  - Dr Cash/Bank (by payment method)
  - Cr Accounts Receivable = `amount`

Definition of done:
- Posting creates balanced journal lines and respects outlet/company account mapping.

## Phase 5 - Print/PDF and Backoffice UI

Tasks:
- Add simple invoice print view and PDF endpoint.
- Add backoffice pages for invoice list/form and payment list/form.

Suggested targets:
- `apps/api/app/api/sales/invoices/[invoiceId]/print/route.ts` (new)
- `apps/api/app/api/sales/invoices/[invoiceId]/pdf/route.ts` (new)
- `apps/backoffice/src/features/sales-invoices-page.tsx` (new)
- `apps/backoffice/src/features/sales-payments-page.tsx` (new)
- `apps/backoffice/src/app/routes.ts` (route registration)
- `apps/backoffice/src/app/router.tsx` (route wiring)

Definition of done:
- Operator can post invoice/payment from backoffice and access print/PDF for invoice.

## Phase 6 - Tests and Acceptance Evidence

Tasks:
- Add integration tests for full M8 flows and edge cases.
- Add minimal unit tests for mapper/accounting rules.

Suggested targets:
- `apps/api/tests/integration/sales.integration.test.mjs` (new)
- `apps/api/tests/integration/reports.integration.test.mjs` (optional assertions for journal visibility)

Required scenarios:
- Invoice draft create/update + post creates exactly one journal batch for invoice.
- Payment draft create + post creates exactly one journal batch for payment.
- Payment post decreases invoice outstanding and updates payment status correctly.
- Partial payment then full payment transitions `UNPAID -> PARTIAL -> PAID`.
- Overpayment rejected with conflict and no journal side effects.
- Duplicate post calls are idempotent (no duplicate journal batches).

Definition of done:
- Both acceptance criteria pass via automated integration tests.

## Sequencing Recommendation

- Build in this order to keep system runnable:
  1) DB migration + shared schemas
  2) Invoice API + posting
  3) Payment API + posting
  4) Tests (backend acceptance)
  5) Backoffice UI + print/PDF

Notes:
- Keep changes additive (new routes/tables) to avoid regression risk.
- Reuse existing auth and outlet access checks from current API patterns.

## Risks and Mitigations

High:
- Accounting mis-posting due to wrong account mapping.
  - Mitigation: strict mapper tests and integration assertions for debit=credit.
- Concurrent post race creating inconsistent state.
  - Mitigation: row-level lock + unique journal `(company_id, doc_type, doc_id)` guard + idempotent response handling.

Medium:
- Overpayment and outstanding math drift.
  - Mitigation: transaction-safe rollup updates and deterministic validation checks before posting.
- Missing outlet/company scope filters in list endpoints.
  - Mitigation: enforce scope predicates in service layer and add RBAC integration tests.

## Definition of Done (Milestone M8)

- PR-15 and PR-16 scope items are implemented in API and backoffice.
- Invoice post reliably creates journal entries.
- Payment post reliably reduces AR and creates journal entries.
- Idempotency and RBAC/outlet scoping are covered by tests.
- API contract and implementation notes are documented under `docs/`.

## Verification Checklist

API and DB:
- `npm run db:migrate`
- `npm run typecheck -w @jurnapod/api`
- `npm run test:integration -w @jurnapod/api`

Backoffice:
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`

Manual smoke:
- Create and post invoice, confirm journal rows.
- Create and post payment, confirm AR reduction and payment journal rows.
- Open invoice print view/PDF endpoint successfully.
