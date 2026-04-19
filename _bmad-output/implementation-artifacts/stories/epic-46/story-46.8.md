# Story 46.8: AP Aging Report

Status: backlog

## Story

As an **accountant**,  
I want to view outstanding AP by supplier with due dates,  
So that I can manage cash flow and know what bills are coming due.

---

## Context

Story 46.8 adds the AP Aging report. This is a read-only report showing outstanding purchase invoices grouped by supplier, with due date buckets (current, 1-30, 31-60, 61-90, 90+). Requires `purchasing.reports` ANALYZE permission.

**Dependencies:** Story 46.5 (PI posted with balance), Story 46.6 (payments reducing balance)

---

## Acceptance Criteria

**AC1: AP Aging Query**
**Given** a user with `purchasing.reports` ANALYZE permission,
**When** they request the AP aging report,
**Then** the system returns a list of suppliers with outstanding AP,
**Each supplier row includes:**
- supplier_id, supplier_name, currency
- total_open_amount (sum of PI balances in supplier currency)
- base_open_amount (sum in company base currency)
- by-due-date bucket: current, due_1_30, due_31_60, due_61_90, due_over_90
**And** grand totals row at the bottom.

**AC2: Due Date Calculation**
**Given** a PI has pi_date and payment_terms_days,
**When** the aging report is computed,
**Then** due_date = pi_date + payment_terms_days (from supplier or company default),
**And** buckets are computed relative to report date.

**AC3: Currency Display**
**Given** a supplier with currency USD,
**When** AP aging is displayed,
**Then** amounts are shown in supplier currency with the exchange rate used for conversion noted,
**And** base currency equivalent shown alongside.

**AC4: PI Detail Drill-Down**
**Given** a supplier in the AP aging report,
**When** the user requests details for that supplier,
**Then** the system returns individual PIs: pi_number, pi_date, due_date, original_amount, balance, currency.

**AC5: ACL Enforcement**
**Given** a user without `purchasing.reports` ANALYZE permission,
**When** they request the AP aging report,
**Then** they receive 403.

---

## Tasks / Subtasks

- [ ] Add ACL resource `purchasing.reports`
- [ ] Implement `/api/purchasing/reports/ap-aging` route
- [ ] Implement `/api/purchasing/reports/ap-aging/:supplierId/detail` route
- [ ] Compute due date from payment_terms_days (default 30 from company_settings)
- [ ] Bucket computation logic
- [ ] Write integration tests for AP aging buckets
- [ ] Write integration tests for ACL (ANALYZE permission required)

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/routes/purchasing/reports/ap-aging.ts` | AP aging routes |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/auth/src/**/*` | Modify | Align reports permissions with the approved ACL mapping |

---

## Validation Evidence

```bash
# AP Aging summary
curl /api/purchasing/reports/ap-aging \
  -H "Authorization: Bearer $TOKEN"
# Expected response:
# {
#   "as_of_date": "2026-04-19",
#   "suppliers": [
#     {
#       "supplier_id": 1,
#       "supplier_name": "Acme Corp",
#       "currency": "USD",
#       "total_open_amount": "5000.00",
#       "base_open_amount": "4464.29",
#       "exchange_rate": "1.1200",
#       "buckets": {
#         "current": "2000.00",
#         "due_1_30": "3000.00",
#         "due_31_60": "0",
#         "due_61_90": "0",
#         "due_over_90": "0"
#       }
#     }
#   ],
#   "grand_totals": { ... }
# }

# ACL test: ACCOUNTANT without ANALYZE on purchasing
curl /api/purchasing/reports/ap-aging \
  -H "Authorization: Bearer $ACCOUNTANT_TOKEN"
# Expected: 403
```

---

## Dev Notes

- `payment_terms_days`: default from `company_settings.purchase_payment_terms_days` (default 30)
- Overridden per supplier if `supplier.payment_terms_days` is set
- Amounts in supplier currency converted to base for aggregation using the same rate as the PI
- Report is read-only — no modifications
- ANALYZE permission on `purchasing.reports` = can view the report
- Story 46.1 must add `supplier.payment_terms_days`; otherwise this report cannot compute supplier-specific due dates

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `as any` casts added without justification
- [ ] Query performance: ensure indexes on (company_id, status, balance) on purchase_invoices
