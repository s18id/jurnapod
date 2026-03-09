<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Sales Phases 1–3 Fix Plan (P0/P1)

Status: Planned (Approved for implementation)

This document captures the required fixes for Phase 1–3 issues using the recommended options.

## Scope

Phases covered:
- Phase 1: Numbering service
- Phase 2: Sales orders
- Phase 3: Invoice approval workflow

Priority targets:
- P0: Fix immediately
- P1: Fix before any new features

---

## Phase 1 (Numbering Service) Fixes

### 1) Bounded retry + backoff for number generation (P0)

**Problem:** Recursive retries can overflow under contention.

**Fix:** Replace recursion with bounded loop and jitter.

**Target:** `apps/api/src/lib/numbering.ts`

**Steps:**
1. Add `maxRetries` param to `generateDocumentNumber`.
2. Retry with jitter (`Math.random() * 50ms`).
3. Throw after last attempt.

---

### 2) SQL injection hardening (P0)

**Problem:** Dynamic table/column interpolation.

**Fix:** Use a strict whitelist map for doc type → table/column.

**Target:** `apps/api/src/lib/numbering.ts`

**Steps:**
1. Define `TABLE_CONFIG` map.
2. Replace `switch` + template literal with `TABLE_CONFIG`.
3. Reject unknown doc types.

---

### 3) Transactional sequence generation (P1)

**Problem:** SELECT + UPDATE without row lock wastes sequences.

**Fix:** Use transaction + `SELECT ... FOR UPDATE`.

**Target:** `apps/api/src/lib/numbering.ts`

**Steps:**
1. `getConnection()` from pool.
2. `BEGIN` transaction.
3. Lock template row with `FOR UPDATE`.
4. Update `current_value`, `last_reset`.
5. Commit + release.

---

### 4) Pattern validation (P1)

**Problem:** Patterns without `{{seq}}` produce duplicates.

**Fix:** Enforce at schema level.

**Targets:**
- `apps/api/app/api/settings/numbering-templates/route.ts`
- `apps/api/app/api/settings/numbering-templates/[templateId]/route.ts`

**Steps:**
1. Add Zod `.refine()` check for `{{seq}}` or `{{seqN}}`.
2. Return 400 with clear message.

---

### 5) Manual override bumps sequence (P1)

**Problem:** Manual number can collide with future auto numbers.

**Fix:** Update `current_value` using `GREATEST` when manual override parsed.

**Target:** `apps/api/src/lib/numbering.ts`

**Steps:**
1. Parse trailing number from `requestedNumber`.
2. If found, update template `current_value` to `GREATEST(current_value, manualSeq)`.
3. Wrap in transaction with uniqueness check.

---

### 6) Outlet validation for template creation (P1)

**Problem:** Outlet templates can be created for invalid outlets.

**Fix:** Validate outlet ownership before insert.

**Target:** `apps/api/app/api/settings/numbering-templates/route.ts`

**Steps:**
1. When `outlet_id` present, query `outlets` for `(id, company_id)`.
2. Reject with 400 if missing.

---

### 7) Add lookup index (P1)

**Problem:** Current indexes do not match query shape.

**Fix:** Add composite index.

**Target:** `packages/db/migrations/0070_numbering_templates.sql`

**Steps:**
1. Add `idx_numbering_templates_lookup (company_id, doc_type, is_active, outlet_id)`.
2. Guarded index creation using `information_schema`.

---

### 8) Map numbering errors to 409 (P1)

**Problem:** `NumberingConflictError` can bubble as 500.

**Fix:** Translate errors into `DatabaseConflictError` and HTTP 409.

**Target:** `apps/api/src/lib/sales.ts`

**Steps:**
1. Wrap `getNextDocumentNumber` call.
2. Map errors to `DatabaseConflictError` / `DatabaseReferenceError`.

---

### 9) Unique company-level templates with nullable `outlet_id` (P1)

**Problem:** `NULL` allows duplicates in MySQL unique indexes.

**Fix (recommended):** Introduce `scope_key` column and enforce uniqueness.

**Targets:**
- `packages/db/migrations/0070_numbering_templates.sql`
- `apps/api/src/lib/numbering.ts`
- `apps/api/app/api/settings/numbering-templates/*.ts`

**Steps:**
1. Add `scope_key` column = `COALESCE(outlet_id, 0)` at insert time.
2. Create unique key `(company_id, doc_type, scope_key)`.
3. Backfill existing records (update `scope_key`).

---

## Phase 2 (Sales Orders) Fixes

### 1) Add `client_ref` column + uniqueness (P1)

**Problem:** API uses `client_ref` but schema doesn’t include it.

**Fix:** Add column + unique constraint for idempotency.

**Target:** New migration (e.g. `0073_sales_orders_client_ref.sql`)

**Steps:**
1. Add `client_ref CHAR(36) NULL`.
2. Add unique key `(company_id, client_ref)` (nullable-safe pattern).

---

### 2) Fix order→invoice tax insert (P1)

**Problem:** Wrong column name and missing outlet scope.

**Fix:** Insert into `sales_invoice_taxes(sales_invoice_id, company_id, outlet_id, tax_rate_id, amount)`.

**Target:** `apps/api/src/lib/sales.ts` (convert order to invoice)

---

### 3) Outlet scoping when user has zero outlets (P1)

**Problem:** Empty outlet list returns company-wide results.

**Fix:** Return empty list when `outletIds` is empty.

**Target:** `apps/api/src/lib/sales.ts` (listOrders)

---

### 4) Implement order detail/update endpoints (P1)

**Problem:** `GET` and `PATCH` return 501.

**Fix:** Implement full handlers.

**Targets:**
- `apps/api/app/api/sales/orders/[orderId]/route.ts`

**Steps:**
1. `GET`: fetch order + lines + outlet access validation.
2. `PATCH`: allow updates only in `DRAFT`.
3. Rebuild lines, recalc totals, update audit fields.

---

### 5) Enforce stated state machine (P1)

**Problem:** `COMPLETED → VOID` currently allowed.

**Fix (recommended):** Block `COMPLETED` from voiding.

**Target:** `apps/api/src/lib/sales.ts` (voidOrder)

---

### 6) Authorization error mapping (P1)

**Problem:** Action routes don’t map `DatabaseForbiddenError`.

**Fix:** Catch and return 403.

**Targets:**
- `apps/api/app/api/sales/orders/[orderId]/confirm/route.ts`
- `apps/api/app/api/sales/orders/[orderId]/complete/route.ts`
- `apps/api/app/api/sales/orders/[orderId]/void/route.ts`
- `apps/api/app/api/sales/orders/[orderId]/convert-to-invoice/route.ts`

---

## Phase 3 (Invoice Approval) Fixes

### 1) Include approval fields in selects (P1)

**Problem:** Approval metadata never returned in responses.

**Fix:** Add `approved_by_user_id`, `approved_at` to invoice SELECTs.

**Targets:**
- `apps/api/src/lib/sales.ts` (`findInvoiceByIdWithExecutor`, `listInvoices`, any invoice SELECT)

---

### 2) Prevent approve on POSTED invoices (P1)

**Problem:** `POSTED` invoices return success on approve.

**Fix:** Reject with `InvoiceStatusError`.

**Target:** `apps/api/src/lib/sales.ts` (`approveInvoice`)

---

### 3) Make approval migration rerunnable (P1)

**Problem:** `DROP CONSTRAINT` is not guarded.

**Fix:** Use `information_schema` + dynamic SQL.

**Target:** `packages/db/migrations/0072_invoice_approved_status.sql`

---

### 4) Add index on `approved_by_user_id` (P1)

**Problem:** Missing index impacts FK performance.

**Fix:** Add guarded index creation.

**Target:** `packages/db/migrations/0072_invoice_approved_status.sql`

---

## Optionality and Policy Notes (Recommended Defaults)

The following recommended options should be enforced as part of the fixes:

1) **Approval optional (default):** allow `DRAFT → POSTED` and `APPROVED → POSTED`.
2) **Completed orders cannot be voided** (block `COMPLETED → VOID`).
3) **Template uniqueness via `scope_key`** to handle nullable outlet scope.

---

## Tests to Add (P1)

### Numbering
- Concurrency test: 10 parallel generation calls yield unique numbers.
- Reset boundary tests for monthly/yearly.
- Pattern validation for missing `{{seq}}`.

### Sales Orders
- `client_ref` idempotency for duplicate creates.
- Outlet scoping when user has zero outlets.
- Confirm → Convert → Invoice creation flow.

### Invoice Approval
- Approve DRAFT and idempotent APPROVED.
- Reject approval on POSTED.
- Void blocked when payment_status is PARTIAL/PAID.

---

## Migration Order

Recommended ordering (after existing 0070–0072):
1. `0073_sales_orders_client_ref.sql`
2. `0074_numbering_scope_key.sql` (if scope_key approach added)
3. Update 0070/0072 for indexes + guard checks

---

## Acceptance Checklist

- All migrations are rerunnable on MySQL 8.0+ and MariaDB.
- Concurrency safe numbering with bounded retries.
- No outlet scoping leaks for orders.
- Approval metadata returned by API.
- Order detail/update endpoints fully functional.
- All P0/P1 issues resolved and tests added.
