<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Sales Module Enhancement Roadmap

Status: In Progress

This document outlines the phased enhancements to the Jurnapod sales module, building on the completed M8 foundation.

## Completed Phases

### Phase 1: Document Numbering Service ✅
**Status:** Complete

**Implementation:**
- `packages/db/migrations/0070_numbering_templates.sql` - Numbering templates table
- `apps/api/src/lib/numbering.ts` - Numbering service with pattern-based generation
- `apps/api/app/api/settings/numbering-templates/` - Template management API
- Auto-initialization in `companies.ts` for new companies

**Features:**
- Configurable number patterns (e.g., `INV/{{yy}}{{mm}}/{{seq4}}`)
- Company/outlet-level scoping
- Reset periods (yearly, monthly, never)
- Optional manual override with uniqueness validation
- Atomic sequence generation

**Usage:**
```bash
POST /api/sales/invoices
{ "outlet_id": 1, "invoice_date": "2026-03-09", "lines": [...] }
# Auto-generates: { "invoice_no": "INV/2603/0001", ... }
```

---

### Phase 2: Sales Orders Module ✅
**Status:** Complete

**Implementation:**
- `packages/db/migrations/0071_sales_orders.sql` - Sales orders tables
- `apps/api/src/lib/sales.ts` - Order CRUD and state machine
- `apps/api/app/api/sales/orders/` - Order management API

**State Machine:**
```
DRAFT → CONFIRMED → COMPLETED
  ↓         ↓
 VOID      VOID
```

**Endpoints:**
- GET/POST `/api/sales/orders` - List/Create orders
- POST `/api/sales/orders/:id/confirm` - Confirm order
- POST `/api/sales/orders/:id/complete` - Mark completed
- POST `/api/sales/orders/:id/void` - Void order
- POST `/api/sales/orders/:id/convert-to-invoice` - Convert to invoice

**Features:**
- Basic PO → Invoice workflow
- Order confirmation before invoicing
- Auto-copy lines from order to invoice
- Linkage: `sales_invoices.order_id` references source order

---

### Phase 3: Enhanced Invoice State Machine ✅
**Status:** Complete

**Implementation:**
- `packages/db/migrations/0072_invoice_approved_status.sql` - APPROVED status
- `apps/api/app/api/sales/invoices/[invoiceId]/approve/` - Approve endpoint
- `apps/api/app/api/sales/invoices/[invoiceId]/void/` - Void endpoint

**Enhanced Workflow:**
```
DRAFT → APPROVED → POSTED → PAID
  ↓         ↓          ↓
 VOID      VOID       VOID (blocked if payments exist)
```

**Features:**
- Optional approval step before posting
- Audit trail: `approved_by_user_id`, `approved_at`
- Void protection: blocks if payments exist
- Posting works from DRAFT or APPROVED

---

### Phase 4: Credit Notes (Refunds) ✅
**Priority:** High  
**Effort:** Medium  
**Status:** Complete

**Implementation:**
- `packages/db/migrations/0075_sales_credit_notes.sql` - Credit notes tables with `client_ref` for idempotency
- `apps/api/src/lib/sales.ts` - Credit note CRUD, validations, and state machine
- `apps/api/app/api/sales/credit-notes/` - Credit note management API
- `apps/api/src/lib/sales-posting.ts` - Journal entry posting and void reversal

**Database:**
> **Note**: This is for reference. See current schema at `docs/db/schema.md`.

```sql
CREATE TABLE sales_credit_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  credit_note_no VARCHAR(64) NOT NULL,
  credit_note_date DATE NOT NULL,
  status VARCHAR(16) DEFAULT 'DRAFT',
  reason TEXT,
  notes TEXT,
  amount DECIMAL(18,2) NOT NULL,
  client_ref CHAR(36) DEFAULT NULL,
  created_by_user_id BIGINT UNSIGNED,
  updated_by_user_id BIGINT UNSIGNED,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ...
);
```

**API Endpoints:**
- GET `/api/sales/credit-notes` - List credit notes
- POST `/api/sales/credit-notes` - Create credit note (supports `client_ref` for idempotency)
- GET `/api/sales/credit-notes/:id` - Get credit note detail
- PATCH `/api/sales/credit-notes/:id` - Update DRAFT credit note
- POST `/api/sales/credit-notes/:id/post` - Post to journal
- POST `/api/sales/credit-notes/:id/void` - Void credit note (with reversing journal)

**Journal Entries (on POST):**
```
Dr: Sales Returns (contra revenue)  amount
Cr: Accounts Receivable              amount
```

**Journal Entries (on VOID of POSTED):**
```
Dr: Accounts Receivable              amount
Cr: Sales Returns (contra revenue)  amount
```

**Features:**
- Link to source invoice (must be POSTED)
- Auto-generate credit note number from numbering service (CN/{{yy}}{{mm}}/{{seq4}})
- **Idempotency (optional)**: When `client_ref` is provided, prevents duplicate credit notes on retries; creates distinct notes when omitted
- **Data validation**: Line totals must exactly match credit note amount (cent-exact equality)
- **Amount validation**: Credit note amount cannot exceed cumulative credit capacity (`invoice_total - posted_non_void_credits`), allowing credits even on paid invoices
- DRAFT → POSTED → VOID lifecycle
- Update invoice paid status on post/void
- Void protection: allows voiding from DRAFT or POSTED
- Reversing journal entries when voiding POSTED credit notes
- Transaction-safe locking with FOR UPDATE to prevent race over-crediting

---

## Planned Phases

### Phase 5: Product/Item Linkage ✅
**Priority:** Medium  
**Effort:** Medium  
**Status:** Complete

**Implementation:**
- `packages/db/migrations/0077_sales_lines_item_linkage.sql` - Added line_type and item_id columns
- `packages/shared/src/schemas/sales.ts` - Updated line input/output schemas
- `apps/api/src/lib/sales.ts` - Added item validation and auto-population logic

**Database Changes:**
- Added `line_type VARCHAR(16) NOT NULL DEFAULT 'SERVICE'` to `sales_invoice_lines` and `sales_order_lines`
- Added `item_id BIGINT UNSIGNED DEFAULT NULL` to both line tables
- Added CHECK constraints for valid line_type values
- Added scoped FK constraints to `items(company_id, id)` with RESTRICT
- Added indexes on `item_id` for query performance

**Schema Updates:**
- `SalesInvoiceLineInputSchema` now includes `line_type` and `item_id`
- `SalesOrderLineInputSchema` now includes `line_type` and `item_id`
- Refinement: PRODUCT lines require valid `item_id`
- Output schemas include new fields

**Features:**
- Optional item selection for invoice/order lines
- When `line_type = PRODUCT`, `item_id` is required (enforced by schema validation and DB CHECK constraints)
- Auto-populate `description` from item name when empty
- Auto-populate `unit_price` from item price when zero
- Explicit user overrides are preserved
- Cross-tenant item validation enforced (DB scoped FK + service-layer validation)
- Inactive items rejected

**Security & Integrity:**
- DB-level tenant isolation via scoped FK `(company_id, item_id) -> items(company_id, id)`
- DB-level constraint: PRODUCT lines must have `item_id IS NOT NULL`
- Service-layer validation: All PRODUCT lines validated regardless of item_id presence

**Inventory Integration Hooks:**
- `line_type` and `item_id` fields are now available for future inventory deduction
- Stock movement logic should be added in a future phase
- Consider adding `inventory_deducted_at` timestamp in future migration

**Backward Compatibility:**
- Existing lines default to `line_type = 'SERVICE'`
- Existing lines default to `item_id = NULL`
- No breaking changes to API contracts

**Tests:**
- Schema validation tests added (`apps/api/src/lib/sales.test.ts`)
- Integration tests for full flow coverage pending

---

### Phase 6: Enhanced Audit Trail
**Priority:** Low  
**Effort:** Low  
**Status:** Not yet implemented

> **Note**: This table has NOT been created yet.

**Database:**
```sql
-- NOT YET IMPLEMENTED
CREATE TABLE sales_invoice_history (
  id BIGINT UNSIGNED AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  changed_by_user_id BIGINT UNSIGNED,
  field_name VARCHAR(64) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_invoice_history (invoice_id, changed_at)
);
```

**Features:**
- Track all field-level changes
- Record state transitions (draft → approved → posted → void)
- Capture user ID and timestamp
- Query history by invoice

**API:**
- GET `/api/sales/invoices/:id/history` - View change log

---

### Phase 7: Receivables Ageing Report
**Priority:** High  
**Effort:** Low  
**Status:** Planned

**Detailed Plan:**
- See `docs/plans/sales-phase7-receivables-ageing-plan.md`

**API Endpoint:**
- GET `/api/reports/receivables-ageing?outlet_id=1`

**Response:**
```json
{
  "filters": {
    "outlet_ids": [1],
    "as_of_date": "2026-03-09"
  },
  "buckets": {
    "current": 5000000,
    "1_30_days": 2000000,
    "31_60_days": 1000000,
    "61_90_days": 500000,
    "over_90_days": 0
  },
  "total_outstanding": 8500000,
  "invoices": [
    {
      "invoice_id": 1001,
      "invoice_no": "INV/2603/0001",
      "outlet_id": 1,
      "outlet_name": "Main Outlet",
      "invoice_date": "2026-03-01",
      "due_date": "2026-03-08",
      "days_overdue": 1,
      "outstanding_amount": 5000000,
      "age_bucket": "1_30_days"
    }
  ]
}
```

**Features:**
- Add `due_date` to invoices (nullable, backward compatible)
- Auto-calculate default due date as Net 30 (`invoice_date + 30 days`) when not provided
- Add common selectable net options: Net 0, 7, 14, 15, 20, 30, 45, 60, 90
- Group outstanding invoices by age (current, 1-30, 31-60, 61-90, 90+)
- Ageing basis: `COALESCE(due_date, invoice_date)`
- Filter by outlet or company-wide
- Include invoice detail with days overdue and outstanding amount
- Export to CSV

**Implementation:**
```sql
SELECT 
  i.id AS invoice_id,
  i.invoice_no,
  i.outlet_id,
  i.invoice_date,
  i.due_date,
  i.grand_total - i.paid_total AS outstanding,
  DATEDIFF(?, COALESCE(i.due_date, i.invoice_date)) AS days_overdue,
  CASE 
    WHEN DATEDIFF(?, COALESCE(i.due_date, i.invoice_date)) <= 0 THEN 'current'
    WHEN DATEDIFF(?, COALESCE(i.due_date, i.invoice_date)) <= 30 THEN '1_30_days'
    WHEN DATEDIFF(?, COALESCE(i.due_date, i.invoice_date)) <= 60 THEN '31_60_days'
    WHEN DATEDIFF(?, COALESCE(i.due_date, i.invoice_date)) <= 90 THEN '61_90_days'
    ELSE 'over_90_days'
  END AS age_bucket
FROM sales_invoices i
WHERE i.status = 'POSTED'
  AND i.grand_total - i.paid_total > 0
  AND i.company_id = ?
```

---

### Phase 8: Payment Enhancements ✅
**Priority:** Low  
**Effort:** Medium  
**Status:** Complete

**Implementation:**
- `packages/db/migrations/0078_sales_payment_splits.sql` - Splits table with tenant-safe FKs
- `packages/db/migrations/0079_sales_payment_splits_backfill.sql` - Rerunnable backfill for legacy payments
- `packages/shared/src/schemas/sales.ts` - Cent-exact split validation in schemas
- `apps/api/src/lib/sales.ts` - Payment service with split CRUD + idempotency enforcement
- `apps/api/src/lib/sales-posting.ts` - Multi-account GL posting with balance guard

**Features:**
1. **Multi-Payment Support:**
   - Split single invoice payment across up to 10 accounts
   - Example: ₹10,000 invoice → ₹7,000 CASH + ₹3,000 QRIS
   - Exact cent-match validation (no rounding tolerance)
   - Duplicate account rejection

2. **Idempotency Contract:**
   - Same `client_ref` + identical payload → return existing payment
   - Same `client_ref` + different payload → 409 Conflict

3. **API Schema:**
   ```json
   POST /api/sales/payments
   {
     "outlet_id": 1,
     "invoice_id": 1,
     "payment_at": "2026-03-10T10:00:00Z",
     "amount": 100000,
     "splits": [
       { "account_id": 1, "amount": 70000 },
       { "account_id": 2, "amount": 30000 }
     ]
   }
   ```

4. **Backward Compatibility:**
   - Legacy payments without splits continue to work
   - Single-split auto-created for non-split payments
   - Header `account_id` derived from first split when omitted

5. **GL Posting:**
   - Multiple debit lines (one per split account)
   - Single credit line to AR for total amount
   - Split metadata in journal descriptions
   - Posting balance guard: throws if debit != credit

**Validation:**
- Split sum must exactly equal payment amount (cent-exact, no tolerance)
- Amounts must have at most 2 decimal places
- Maximum 10 splits per payment
- No duplicate account_ids in splits
- Header account_id must match splits[0] if provided
- All split accounts must be payable and belong to tenant
- List API returns splits consistently with detail API

**Database:**
> **Note**: This is for reference. See current schema at `docs/db/schema.md`.

```sql
-- See docs/db/schema.md for current schema
CREATE TABLE sales_payment_splits (
  id BIGINT UNSIGNED AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  split_index INT UNSIGNED NOT NULL DEFAULT 0,
  account_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_payment_splits_payment_index (payment_id, split_index)
);
```

---

## Implementation Priority

| Phase | Effort | Impact | Priority | Status |
|-------|--------|--------|----------|--------|
| 1. Numbering Service | Medium | High | ✅ | Complete |
| 2. Sales Orders | Medium | High | ✅ | Complete |
| 3. Enhanced Invoice State | Low | Medium | ✅ | Complete |
| 4. Credit Notes | Medium | High | ✅ | Complete |
| 5. Product Linkage | Medium | Medium | ✅ | Complete |
| 6. Audit Trail | Low | Medium | 🟢 Optional | Planned |
| 7. Ageing Report | Low | High | 🔴 Next | Planned |
| 8. Payment Enhancements | Medium | Medium | ✅ | Complete |

---

## Recommended Sequence

1. **Phase 7 (Ageing Report)** - Low effort, high value for cash flow management
2. **Phase 6 (Audit Trail)** - Nice-to-have for compliance

---

## Dependencies

- **Phase 4 (Credit Notes)** requires Phase 1 (Numbering) ✅ Complete
- **Phase 5 (Product Linkage)** requires existing items table ✅ Complete
- **Phase 7 (Ageing Report)** requires Phase 3 (invoice status) ✅ Complete
- **Phase 8 (Payment Enhancements)** integrates with Phase 4 (credit notes) ✅ Complete

---

## Success Metrics

After completing all phases:
- ✅ Full PO → Invoice → Payment workflow
- ✅ Automatic document numbering
- ✅ Approval workflow for invoices
- ✅ Credit note support for refunds
- ✅ Product-based invoicing (foundation for inventory)
- ✅ Comprehensive receivables visibility
- ✅ Full audit trail for compliance
- ✅ Split payment support (multi-method payments)

---

## Notes

- All enhancements maintain accounting/GL as source of truth
- Backward compatibility maintained for existing invoices/payments
- All changes are additive (no breaking changes to API contracts)
- Migration scripts handle schema evolution safely (idempotent)
