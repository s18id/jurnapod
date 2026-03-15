<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Sales Module Implementation Summary

## Overview

The Jurnapod sales module has been enhanced with three foundational phases that transform the basic M8 invoice/payment workflow into a comprehensive sales order management system.

---

## Completed Implementations

### ✅ Phase 1: Document Numbering Service

**Files Created:**
- `packages/db/migrations/0070_numbering_templates.sql`
- `apps/api/src/lib/numbering.ts`
- `apps/api/app/api/settings/numbering-templates/route.ts`
- `apps/api/app/api/settings/numbering-templates/[templateId]/route.ts`

**Files Modified:**
- `packages/shared/src/schemas/sales.ts` - Made `invoice_no` and `payment_no` optional
- `apps/api/src/lib/sales.ts` - Integrated numbering service
- `apps/api/src/lib/companies.ts` - Auto-initialize templates

**Key Features:**
- Pattern-based numbering: `INV/{{yy}}{{mm}}/{{seq4}}`
- Outlet/company scoping
- Auto-generation with manual override option
- Reset periods: yearly, monthly, never
- Atomic sequence generation

**API Examples:**
```bash
# Auto-generate number
POST /api/sales/invoices
{ "outlet_id": 1, "invoice_date": "2026-03-09", "lines": [...] }

# Manual override
POST /api/sales/invoices  
{ "outlet_id": 1, "invoice_no": "CUSTOM-001", ... }

# Manage templates
GET/POST/PATCH/DELETE /api/settings/numbering-templates
```

---

### ✅ Phase 2: Sales Orders Module

**Files Created:**
- `packages/db/migrations/0071_sales_orders.sql`
- `apps/api/app/api/sales/orders/route.ts`
- `apps/api/app/api/sales/orders/[orderId]/route.ts`
- `apps/api/app/api/sales/orders/[orderId]/confirm/route.ts`
- `apps/api/app/api/sales/orders/[orderId]/complete/route.ts`
- `apps/api/app/api/sales/orders/[orderId]/void/route.ts`
- `apps/api/app/api/sales/orders/[orderId]/convert-to-invoice/route.ts`

**Files Modified:**
- `packages/shared/src/schemas/sales.ts` - Added Sales Order schemas
- `apps/api/src/lib/sales.ts` - Order CRUD and conversion logic

**State Machine:**
```
DRAFT → CONFIRMED → COMPLETED
  ↓         ↓
 VOID      VOID
```

**Workflow:**
```
1. Create Order (DRAFT)
2. Confirm Order (CONFIRMED)
3. Convert to Invoice
4. Post Invoice
5. Record Payment
6. Complete Order (COMPLETED)
```

**API Examples:**
```bash
# Create order
POST /api/sales/orders
{
  "outlet_id": 1,
  "order_date": "2026-03-09",
  "expected_date": "2026-03-15",
  "lines": [
    { "description": "Consulting Service", "qty": 1, "unit_price": 5000000 }
  ]
}

# Confirm order
POST /api/sales/orders/1/confirm

# Convert to invoice
POST /api/sales/orders/1/convert-to-invoice
{
  "outlet_id": 1,
  "invoice_date": "2026-03-10",
  "tax_amount": 500000
}
```

---

### ✅ Phase 3: Enhanced Invoice State Machine

**Files Created:**
- `packages/db/migrations/0072_invoice_approved_status.sql`
- `apps/api/app/api/sales/invoices/[invoiceId]/approve/route.ts`
- `apps/api/app/api/sales/invoices/[invoiceId]/void/route.ts`

**Files Modified:**
- `packages/shared/src/schemas/sales.ts` - Added `SalesInvoiceStatusSchema`
- `apps/api/src/lib/sales.ts` - Added `approveInvoice()` and `voidInvoice()`

**Enhanced Workflow:**
```
DRAFT → APPROVED → POSTED → PAID
  ↓         ↓          ↓
 VOID      VOID       VOID (blocked if payments exist)
```

**Features:**
- Optional approval step before posting
- Audit trail: `approved_by_user_id`, `approved_at`
- Void protection: cannot void invoices with payments
- Posting allowed from DRAFT or APPROVED status

**API Examples:**
```bash
# Approve invoice
POST /api/sales/invoices/1/approve

# Post invoice (from DRAFT or APPROVED)
POST /api/sales/invoices/1/post

# Void invoice (only if no payments)
POST /api/sales/invoices/1/void
```

---

## Database Schema Additions

> **Note**: These CREATE TABLE statements are for historical reference.
> See the current schema at `docs/db/schema.md`.

### Numbering Templates
```sql
-- See current schema in docs/db/schema.md
CREATE TABLE numbering_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED DEFAULT NULL,
  scope_key BIGINT UNSIGNED NOT NULL DEFAULT 0,
  doc_type VARCHAR(32) NOT NULL,
  pattern VARCHAR(128) NOT NULL,
  reset_period VARCHAR(16) DEFAULT 'NEVER',
  current_value INT UNSIGNED DEFAULT 0,
  last_reset DATE DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id, outlet_id, doc_type)
);
```

### Sales Orders
```sql
-- See current schema in docs/db/schema.md
CREATE TABLE sales_orders (
  id BIGINT UNSIGNED AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  order_no VARCHAR(64) NOT NULL,
  client_ref CHAR(36) NULL,
  order_date DATE NOT NULL,
  expected_date DATE DEFAULT NULL,
  status VARCHAR(16) DEFAULT 'DRAFT',
  notes TEXT,
  subtotal DECIMAL(18,2) DEFAULT 0,
  tax_amount DECIMAL(18,2) DEFAULT 0,
  grand_total DECIMAL(18,2) DEFAULT 0,
  created_by_user_id BIGINT UNSIGNED,
  updated_by_user_id BIGINT UNSIGNED,
  confirmed_by_user_id BIGINT UNSIGNED,
  confirmed_at DATETIME,
  completed_by_user_id BIGINT UNSIGNED,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id, order_no)
);

CREATE TABLE sales_order_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  line_type VARCHAR(16) DEFAULT 'SERVICE',
  item_id BIGINT UNSIGNED,
  description VARCHAR(255) NOT NULL,
  qty DECIMAL(18,4) NOT NULL,
  unit_price DECIMAL(18,2) NOT NULL,
  line_total DECIMAL(18,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (order_id, line_no)
);
```

### Invoice Enhancements
```sql
ALTER TABLE sales_invoices
  ADD COLUMN order_id BIGINT UNSIGNED DEFAULT NULL,
  ADD COLUMN approved_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  ADD COLUMN approved_at DATETIME DEFAULT NULL,
  MODIFY status VARCHAR(16) CHECK (status IN ('DRAFT', 'APPROVED', 'POSTED', 'VOID'));
```

---

## Testing & Verification

### Type Safety
```bash
npm run typecheck
# All packages pass ✅
```

### Lint
```bash
npm run lint
# No errors ✅
```

### Manual Testing Scenarios

**Scenario 1: Auto-Generated Invoice Number**
```bash
POST /api/sales/invoices
{ "outlet_id": 1, "invoice_date": "2026-03-09", "lines": [...] }
# Expected: invoice_no = "INV/2603/0001"
```

**Scenario 2: Order to Invoice Workflow**
```bash
# 1. Create order
POST /api/sales/orders { ... }

# 2. Confirm
POST /api/sales/orders/1/confirm

# 3. Convert
POST /api/sales/orders/1/convert-to-invoice { ... }
# Expected: Invoice created with lines copied from order
```

**Scenario 3: Approval Workflow**
```bash
# 1. Create invoice (DRAFT)
POST /api/sales/invoices { ... }

# 2. Approve (DRAFT → APPROVED)
POST /api/sales/invoices/1/approve

# 3. Post (APPROVED → POSTED)
POST /api/sales/invoices/1/post
# Expected: Journal entries created
```

**Scenario 4: Void Protection**
```bash
# 1. Post invoice
POST /api/sales/invoices/1/post

# 2. Record payment
POST /api/sales/payments { invoice_id: 1, amount: 1000000 }
POST /api/sales/payments/1/post

# 3. Try to void invoice
POST /api/sales/invoices/1/void
# Expected: 409 Conflict - "Cannot void invoice with payments"
```

---

## Next Steps

See `docs/plans/sales-enhancement-roadmap.md` for planned enhancements:
- Phase 4: Credit Notes (refunds)
- Phase 5: Product/Item Linkage
- Phase 6: Enhanced Audit Trail
- Phase 7: Receivables Ageing Report
- Phase 8: Payment Enhancements

---

## Migration Notes

**Running Migrations:**
```bash
npm run db:migrate
```

**Order:**
1. `0070_numbering_templates.sql` - Numbering service
2. `0071_sales_orders.sql` - Sales orders
3. `0072_invoice_approved_status.sql` - APPROVED status

**Idempotency:**
All migrations use idempotent patterns (IF NOT EXISTS, dynamic ALTER TABLE) safe for reruns.

---

## Architecture Decisions

**Numbering Service:**
- Atomic sequence generation prevents duplicates
- Pattern-based approach supports future customization
- Optional manual override maintains flexibility

**Sales Orders:**
- Basic state machine sufficient for most B2B workflows
- Conversion to invoice copies data (no live linkage to prevent order changes affecting invoices)
- Future inventory reservation hooks documented but not implemented

**Invoice Approval:**
- Optional approval step (can post directly from DRAFT)
- Separation of duties: different users can approve vs. post
- Void protection ensures data integrity

---

## Performance Considerations

**Numbering Service:**
- Single row lock during number generation
- Minimal contention (per company/outlet/doc_type)
- Sub-millisecond performance for typical loads

**Sales Orders:**
- No additional indexes needed beyond existing patterns
- Conversion to invoice is single transaction
- Order listing uses standard pagination

**Invoice State Machine:**
- No performance impact (standard UPDATE queries)
- Approval optional (no forced workflow delay)
- Void check uses existing payment_status field

---

## Security & Authorization

**All endpoints require:**
- Valid authentication (JWT)
- Company/outlet scoping
- Role-based permissions (OWNER, ADMIN, ACCOUNTANT)

**Specific permissions:**
- Create: `sales:create`
- Approve: `sales:update`
- Post: `sales:update`
- Void: `sales:delete`

---

## Compliance & Audit

**Audit Trail:**
- All operations track `created_by_user_id`, `updated_by_user_id`
- State transitions recorded with timestamps
- Approval captures `approved_by_user_id`, `approved_at`
- Immutability enforced for POSTED/VOID documents

**Financial Integrity:**
- Numbering service ensures unique document numbers
- Journal posting remains atomic (all-or-nothing)
- Void protection prevents data corruption
- Outstanding calculations always sum to grand_total

---

## Support & Documentation

**API Documentation:**
- See `docs/api/` for endpoint contracts
- Postman collection available (request from team)

**Database Schema:**
- See `docs/db/schema.md` for full ERD

**Troubleshooting:**
- Check `logs/` for error details
- Use `npm run db:status` to verify migrations
- Contact platform team for escalation
