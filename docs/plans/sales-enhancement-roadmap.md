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

## Planned Phases

### Phase 4: Credit Notes (Refunds)
**Priority:** High  
**Effort:** Medium  
**Status:** Planned

**Database:**
```sql
CREATE TABLE sales_credit_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL, -- source invoice
  credit_note_no VARCHAR(64) NOT NULL,
  credit_note_date DATE NOT NULL,
  status VARCHAR(16) DEFAULT 'DRAFT', -- DRAFT|POSTED|VOID
  reason TEXT,
  notes TEXT,
  amount DECIMAL(18,2) NOT NULL,
  ...
);
```

**API Endpoints:**
- POST `/api/sales/credit-notes` - Create credit note
- POST `/api/sales/credit-notes/:id/post` - Post to journal
- POST `/api/sales/credit-notes/:id/void` - Void credit note

**Journal Entries (on POST):**
```
Dr: Sales Returns (contra revenue)  amount
Cr: Accounts Receivable              amount
```

**Features:**
- Link to source invoice
- Auto-generate credit note number from numbering service
- DRAFT → POSTED → VOID lifecycle
- Reverse journal entries on post
- Update invoice paid status

---

### Phase 5: Product/Item Linkage
**Priority:** Medium  
**Effort:** Medium  
**Status:** Planned

**Database Changes:**
```sql
-- Add to sales_invoice_lines and sales_order_lines
ALTER TABLE sales_invoice_lines 
  ADD COLUMN item_id BIGINT UNSIGNED DEFAULT NULL,
  ADD COLUMN line_type VARCHAR(16) DEFAULT 'SERVICE'; -- SERVICE|PRODUCT

-- FK to items table
ALTER TABLE sales_invoice_lines
  ADD CONSTRAINT fk_invoice_lines_item 
  FOREIGN KEY (item_id) REFERENCES items(id);
```

**Schema Updates:**
```typescript
SalesInvoiceLineInputSchema = z.object({
  line_type: z.enum(["SERVICE", "PRODUCT"]).default("SERVICE"),
  item_id: NumericIdSchema.optional(),
  description: z.string().trim().min(1).max(255),
  qty: z.coerce.number().finite().positive(),
  unit_price: MoneyInputNonNegativeSchema
}).refine((data) => {
  if (data.line_type === "PRODUCT") return !!data.item_id;
  return true;
}, "Product lines require item_id");
```

**Features:**
- Optional item selection for invoice lines
- When line_type = PRODUCT, require item_id
- Auto-populate description and price from item
- Future-ready for inventory deduction (not in this phase)

**Documentation:**
- Add hooks/comments for automatic inventory sync
- Note: Full inventory integration deferred to later phase

---

### Phase 6: Enhanced Audit Trail
**Priority:** Low  
**Effort:** Low  
**Status:** Planned

**Database:**
```sql
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

**API Endpoint:**
- GET `/api/reports/receivables-ageing?outlet_id=1`

**Response:**
```json
{
  "outlet_id": 1,
  "as_of_date": "2026-03-09",
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
      "invoice_no": "INV/2603/0001",
      "invoice_date": "2026-03-01",
      "days_outstanding": 8,
      "outstanding_amount": 5000000,
      "age_bucket": "current"
    }
  ]
}
```

**Features:**
- Group outstanding invoices by age (current, 1-30, 31-60, 61-90, 90+)
- Filter by outlet or company-wide
- Include invoice detail with days outstanding
- Export to Excel/CSV

**Implementation:**
```sql
SELECT 
  i.invoice_no,
  i.invoice_date,
  i.grand_total - i.paid_total AS outstanding,
  DATEDIFF(CURRENT_DATE, i.invoice_date) AS days_outstanding,
  CASE 
    WHEN DATEDIFF(CURRENT_DATE, i.invoice_date) <= 30 THEN 'current'
    WHEN DATEDIFF(CURRENT_DATE, i.invoice_date) <= 60 THEN '1_30_days'
    WHEN DATEDIFF(CURRENT_DATE, i.invoice_date) <= 90 THEN '31_60_days'
    WHEN DATEDIFF(CURRENT_DATE, i.invoice_date) <= 120 THEN '61_90_days'
    ELSE 'over_90_days'
  END AS age_bucket
FROM sales_invoices i
WHERE i.status = 'POSTED'
  AND i.payment_status IN ('UNPAID', 'PARTIAL')
  AND i.company_id = ?
```

---

### Phase 8: Payment Enhancements
**Priority:** Low  
**Effort:** Medium  
**Status:** Planned

**Features:**
1. **Multi-Payment Support:**
   - Allow splitting single invoice payment across multiple methods
   - Example: ₹10,000 invoice → ₹7,000 CASH + ₹3,000 QRIS

2. **Payment Refunds:**
   - Integrate with credit note system
   - Track refund method (reverse to original payment method)

3. **Payment Method Improvements:**
   - Deprecate old `method` field fully
   - Ensure all payments use `account_id` for GL mapping
   - Migration script to backfill legacy data

**Database:**
```sql
CREATE TABLE sales_payment_splits (
  id BIGINT UNSIGNED AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  PRIMARY KEY (id)
);
```

---

## Implementation Priority

| Phase | Effort | Impact | Priority | Status |
|-------|--------|--------|----------|--------|
| 1. Numbering Service | Medium | High | ✅ | Complete |
| 2. Sales Orders | Medium | High | ✅ | Complete |
| 3. Enhanced Invoice State | Low | Medium | ✅ | Complete |
| 4. Credit Notes | Medium | High | 🔴 Next | Planned |
| 5. Product Linkage | Medium | Medium | 🟡 | Planned |
| 6. Audit Trail | Low | Medium | 🟢 Optional | Planned |
| 7. Ageing Report | Low | High | 🔴 Next | Planned |
| 8. Payment Enhancements | Medium | Medium | 🟢 Low | Planned |

---

## Recommended Sequence

1. **Phase 4 (Credit Notes)** - High business value for handling returns/refunds
2. **Phase 7 (Ageing Report)** - Low effort, high value for cash flow management
3. **Phase 5 (Product Linkage)** - Foundation for inventory integration
4. **Phase 6 (Audit Trail)** - Nice-to-have for compliance
5. **Phase 8 (Payment Enhancements)** - Lower priority refinements

---

## Dependencies

- **Phase 4 (Credit Notes)** requires Phase 1 (Numbering) ✅
- **Phase 5 (Product Linkage)** requires existing items table ✅
- **Phase 7 (Ageing Report)** requires Phase 3 (invoice status) ✅
- **Phase 8 (Payment Enhancements)** may integrate with Phase 4 (credit notes)

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

---

## Notes

- All enhancements maintain accounting/GL as source of truth
- Backward compatibility maintained for existing invoices/payments
- All changes are additive (no breaking changes to API contracts)
- Migration scripts handle schema evolution safely (idempotent)
