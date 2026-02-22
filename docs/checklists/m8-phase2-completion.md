# M8 Phase 2 Implementation Summary (Updated)

**Status:** Completed  
**Date:** 2026-02-23  
**Phase:** Invoice API Service + Routes

## Completed Tasks

### ✅ 1. Sales Service Layer (`apps/api/src/lib/sales.ts`)
**Status:** Pre-existing, already implemented

Functions available:
- `listInvoices(companyId, filters)` - List invoices with pagination and filters
- `getInvoice(companyId, invoiceId)` - Get invoice detail with lines
- `createInvoice(companyId, input, actor)` - Create DRAFT invoice with lines
- `updateInvoice(companyId, invoiceId, input, actor)` - Update DRAFT invoice only
- `postInvoice(companyId, invoiceId, actor)` - Transition DRAFT → POSTED (idempotent)

Key features:
- Company/outlet scoping enforced
- User outlet access validation
- DRAFT-only editing (posted invoices immutable)
- Server-side total computation (subtotal, tax, grand_total)
- Transaction-safe operations
- Idempotent post action
- Money normalization with MONEY_SCALE

### ✅ 2. Invoice List/Create Route (`apps/api/app/api/sales/invoices/route.ts`)
**Status:** Pre-existing, already implemented

Endpoints:
- `GET /api/sales/invoices` - List invoices with filters
  - Query params: outlet_id, status, payment_status, date_from, date_to, limit, offset
  - Scoped to user's accessible outlets
  - Returns total count + invoice array
- `POST /api/sales/invoices` - Create new invoice
  - Body: outlet_id, invoice_no, invoice_date, tax_amount, lines[]
  - Creates DRAFT status
  - Returns created invoice with computed totals

Auth: OWNER, ADMIN, ACCOUNTANT roles required

### ✅ 3. Invoice Detail/Update Route (`apps/api/app/api/sales/invoices/[invoiceId]/route.ts`)
**Status:** Created

Endpoints:
- `GET /api/sales/invoices/:invoiceId` - Get invoice detail with lines
- `PATCH /api/sales/invoices/:invoiceId` - Update DRAFT invoice
  - Only DRAFT invoices editable
  - Returns 409 INVALID_TRANSITION if not DRAFT
  - Validates outlet access

Auth: OWNER, ADMIN, ACCOUNTANT roles required

### ✅ 4. Invoice Post Action Route (`apps/api/app/api/sales/invoices/[invoiceId]/post/route.ts`)
**Status:** Created

Endpoint:
- `POST /api/sales/invoices/:invoiceId/post` - Post invoice (DRAFT → POSTED)
  - Idempotent (returns current state if already POSTED)
  - Returns 409 INVALID_TRANSITION if not DRAFT
  - TODO marker for Phase 4 journal posting integration

Auth: OWNER, ADMIN, ACCOUNTANT roles required

## File Structure

```
apps/api/
├── src/lib/
│   └── sales.ts (pre-existing)
└── app/api/sales/invoices/
    ├── route.ts (pre-existing: GET list, POST create)
    ├── [invoiceId]/
    │   ├── route.ts (new: GET detail, PATCH update)
    │   └── post/
    │       └── route.ts (new: POST action)
```

## Error Handling

Standard error codes implemented:
- `400 INVALID_REQUEST` - Zod validation failure
- `403 FORBIDDEN` - User lacks outlet access
- `404 NOT_FOUND` - Invoice or resource not found
- `409 CONFLICT` - Duplicate invoice_no
- `409 INVALID_TRANSITION` - Attempted to edit/post non-DRAFT invoice
- `500 INTERNAL_SERVER_ERROR` - Unhandled errors

## Validation Results

✅ Typecheck passed for `@jurnapod/shared`  
✅ Typecheck passed for `@jurnapod/api`

## Integration Points

### Auth & Authorization
- Uses existing `withAuth` and `requireRole` guards
- Validates user outlet access via `ensureUserHasOutletAccess`
- Scopes all queries by `company_id`

### Database
- Uses existing transaction wrapper pattern
- Row-level locking with `FOR UPDATE` in update/post flows
- Scoped FKs enforce company/outlet integrity

### Shared Schemas
- Validates requests via Zod schemas from `@jurnapod/shared`
- `SalesInvoiceCreateRequestSchema`
- `SalesInvoiceUpdateRequestSchema`
- `SalesInvoiceListQuerySchema`

## Known Limitations (by design for Phase 2)

- None specific to Phase 2 scope.

## Update (M8 completion status)

As of 2026-02-23, Phases 3–6 have been completed in the repository. This summary remains valid for Phase 2, but the overall milestone status is now complete.

Completed later phases include:
- Payment In API + allocation to invoice
- GL posting integration via `PostingService`
- Print/PDF endpoints + backoffice list UI
- Integration tests for acceptance criteria

## Acceptance Criteria Progress

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Invoice CRUD + lines | ✅ Done | `sales.ts` functions + routes implemented |
| POST action: lock & post | ✅ Done | Idempotent post route + status transition |
| PDF/print endpoint | ✅ Done | Print/PDF routes in `apps/api/app/api/sales/invoices/[invoiceId]/print/route.ts` and `apps/api/app/api/sales/invoices/[invoiceId]/pdf/route.ts` |
| Invoice posted → journal | ✅ Done | Posting integration in `apps/api/src/lib/sales-posting.ts` |
| Payment posted → AR reduced + journal | ✅ Done | Payment posting integration in `apps/api/src/lib/sales-posting.ts` |

---

**Sign-off:** Phase 2 implementation complete and type-safe. Ready for Phase 3.

For the consolidated milestone view, see `docs/checklists/m8-final-completion.md`.
