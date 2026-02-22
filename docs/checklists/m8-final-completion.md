# M8 Final Completion Checklist

**Status:** Completed  
**Date:** 2026-02-23  
**Milestone:** M8 (Sales v1: Invoice + Payment In)

## Scope Summary

Sales v1 delivers invoice and payment-in workflows with full GL posting, print/PDF output, and backoffice listing. All posted documents create journals in a single transaction.

## Deliverables

### ✅ Phase 1: Contracts + Schema
- Zod schemas: `packages/shared/src/schemas/sales.ts`
- Migration: `packages/db/migrations/0010_sales_invoice_payment_in_v1.sql`

### ✅ Phase 2: Invoice Service + Routes
- Service layer: `apps/api/src/lib/sales.ts`
- Routes:
  - `apps/api/app/api/sales/invoices/route.ts`
  - `apps/api/app/api/sales/invoices/[invoiceId]/route.ts`
  - `apps/api/app/api/sales/invoices/[invoiceId]/post/route.ts`

### ✅ Phase 3: Payment Service + Routes
- Service layer: `apps/api/src/lib/sales.ts`
- Routes:
  - `apps/api/app/api/sales/payments/route.ts`
  - `apps/api/app/api/sales/payments/[paymentId]/route.ts`
  - `apps/api/app/api/sales/payments/[paymentId]/post/route.ts`

### ✅ Phase 4: Posting Integration
- Posting mapper + repo: `apps/api/src/lib/sales-posting.ts`
- Journal uniqueness: `packages/db/migrations/0006_journal_batches_doc_unique.sql`

### ✅ Phase 5: Print/PDF + Backoffice UI
- Invoice template: `apps/api/src/lib/invoice-template.ts`
- Print/PDF routes:
  - `apps/api/app/api/sales/invoices/[invoiceId]/print/route.ts`
  - `apps/api/app/api/sales/invoices/[invoiceId]/pdf/route.ts`
- Backoffice list pages:
  - `apps/backoffice/src/features/sales-invoices-page.tsx`
  - `apps/backoffice/src/features/sales-payments-page.tsx`
- Routes wiring:
  - `apps/backoffice/src/app/routes.ts`
  - `apps/backoffice/src/app/router.tsx`

### ✅ Phase 6: Tests + Evidence
- Integration suite: `apps/api/tests/integration/sales.integration.test.mjs`
- Smoke test: `apps/api/tests/integration/sales-quick-test.mjs`

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Invoice CRUD + lines | ✅ Done | `apps/api/src/lib/sales.ts` + invoice routes |
| Invoice post creates journal | ✅ Done | `apps/api/src/lib/sales-posting.ts` |
| Payment post reduces AR + journal | ✅ Done | `apps/api/src/lib/sales-posting.ts` |
| Partial payment states | ✅ Done | `apps/api/src/lib/sales.ts` |
| Idempotent posting | ✅ Done | `apps/api/src/lib/sales.ts` + journal unique constraint |
| Print/PDF output | ✅ Done | print/PDF routes |
| Integration tests | ✅ Done | `apps/api/tests/integration/sales.integration.test.mjs` |

---

**Sign-off:** M8 implemented end-to-end with posting, print/PDF, UI lists, and tests.
