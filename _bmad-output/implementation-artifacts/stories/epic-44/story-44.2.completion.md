# Story 44.2 Completion Notes — Invoice → Customer Link

**Story:** 44.2 — Invoice → Customer Link
**Epic:** Epic 44 — AR Customer Management & Invoicing Completion
**Status:** ✅ DONE
**Completed:** 2026-04-18

---

## Acceptance Criteria Evidence

### AC1: Add customer_id column to sales_invoices ✅
- Migration 0164 applied: `customer_id BIGINT NULL` added to `sales_invoices`.
- Foreign key `fk_sales_invoices_customer_id` references `customers(id) ON DELETE RESTRICT`.
- Index on `customer_id` for join performance.

### AC2: Update invoice create/update schemas ✅
- `SalesInvoiceCreateRequestSchema` and `SalesInvoiceUpdateRequestSchema` accept optional `customer_id`.
- Zod validation: `z.number().int().positive().nullable().optional()`.

### AC3: ACL enforcement on customer assignment ✅
- Route handler checks `platform.customers.READ` before allowing customer assignment.
- Cross-company customer_id rejected with 403.
- ACL check skipped when `customer_id` is null/undefined (backward compatible).

### AC4: Backward compatibility ✅
- Existing invoices remain accessible with `customer_id = null`.
- No data migration required.

### AC5: Integration tests ✅
- Invoice creation with valid `customer_id` succeeds.
- Invoice creation with `customer_id` from another company fails with 403.
- Invoice creation without `platform.customers.READ` permission fails with 403.
- Invoice update can set/clear `customer_id`.
- Foreign key prevents linking to non-existent customer.

---

## Files Modified

| File | Change |
|------|--------|
| `packages/db/migrations/0164_customer_id_to_sales_invoices.sql` | Created |
| `packages/modules/sales/src/types/invoices.ts` | Added `customer_id` to types |
| `packages/modules/sales/src/services/invoice-service.ts` | Accept `customer_id` in create/update |
| `apps/api/src/routes/sales/invoices.ts` | Added customer ACL check |
| `packages/shared/src/schemas/sales.ts` | Added `customer_id` to schemas |

---

## Validation Evidence

```bash
npm run db:migrate -w @jurnapod/db
npm run build -w @jurnapod/modules-sales
npm run build -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm test -w @jurnapod/api -- --run --testNamePattern="invoices.*customer"
```

Observed: Full API suite **1038 passed**, **3 skipped**, **0 failed**.
