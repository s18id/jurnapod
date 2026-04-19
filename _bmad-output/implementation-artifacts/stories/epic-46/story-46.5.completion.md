# Story 46.5 — Purchase Invoices — Completion Report

## Story
- **ID:** 46.5
- **Title:** Purchase Invoices
- **Epic:** 46 — Purchasing / Accounts Payable Module
- **Status:** ✅ DONE

---

## Implementation Summary

### Scope A — Settings Foundation
- Migration `0177_purchasing_default_ap_account.sql` adds `purchasing_default_ap_account_id` and `purchasing_default_expense_account_id` to company modules settings
- `settings-modules.ts` read/write paths updated for both fields

### Scope B — Schema & Contracts
- Migrations:
  - `0178_purchase_invoices.sql` — `purchase_invoices` table (company_id, supplier_id, currency, exchange_rate, subtotal, tax_amount, grand_total, status, journal_batch_id, posted/voided timestamps)
  - `0179_purchase_invoice_lines.sql` — `purchase_invoice_lines` table (FK to invoice, line_no, item_id, description, qty, unit_price, line_total, tax_rate_id, tax_amount, po_line_id)
  - `0180_acl_purchasing_invoices.sql` — ACL seed for `purchasing.invoices` across all 6 roles
- Kysely interfaces added for `PurchaseInvoices` and `PurchaseInvoiceLines`
- Shared: `PURCHASE_INVOICE_STATUS` constants, `PurchaseInvoiceCreateSchema`, `PurchaseInvoiceResponseSchema`, `PurchaseInvoiceLineResponseSchema`, role defaults

### Scope C — Domain Service (`lib/purchasing/purchase-invoice.ts`)
| Operation | Description |
|-----------|-------------|
| `createDraftPI()` | Transactional create with line total + tax computation, supplier tenant validation |
| `listPIs()` | Paginated list with supplier/status/date filters, JOIN supplier name |
| `getPIById()` | Single PI with lines, supplier name |
| `postPI()` | DRAFT→POSTED: resolves exchange rate, validates AP/expense accounts by company_id, builds grouped journal lines (expense debit + tax debit → AP credit), credit limit check (>80% warning, >100% block), journal balanced before commit |
| `voidPI()` | POSTED→VOID: creates reversal batch (swap debit/credit on all lines) |

**Post-review fixes applied:**
- **P0:** Currency conversion formula corrected to multiply by exchange rate (was dividing)
- **P1:** AP and expense account ownership validated against `company_id` before posting
- **P1:** Route error mapping tightened — `InvalidStatusTransitionError` and PI domain errors now return proper 400/404 instead of falling through to 500
- **Bug:** Exchange rate parser now supports 8-decimal values (`1.00000000` format)

### Scope D — Routes & Tests
- Thin route adapter: `apps/api/src/routes/purchasing/purchase-invoices.ts`
  - `GET /purchasing/invoices` — list
  - `GET /purchasing/invoices/:id` — get
  - `POST /purchasing/invoices` — create draft
  - `POST /purchasing/invoices/:id/post` — post (creates journal)
  - `POST /purchasing/invoices/:id/void` — void (reverses journal)
- Registered under `/api/purchasing/invoices`
- ACL seeded in `test-fixtures.ts` via `createTestPurchasingAccounts()`
- Integration suite: `purchase-invoices.test.ts` — **15/15 pass**

---

## Test Results

| Suite | Tests | Passed |
|-------|-------|--------|
| `purchase-invoices.test.ts` | 15 | ✅ 15/15 |
| `purchase-orders.test.ts` (regression) | 27 | ✅ 27/27 |
| `goods-receipts.test.ts` (regression) | 21 | ✅ 21/21 |
| `exchange-rates.test.ts` (regression) | 26 | ✅ 26/26 |
| **Total** | **89** | **✅ 89/89** |

---

## Acceptance Criteria Evidence

| AC | Description | Status |
|----|-------------|--------|
| AC1 | PI Creation (DRAFT, company_id set) | ✅ |
| AC2 | PI Posting — `getExchangeRate()` → 400 if missing | ✅ |
| AC2 | PI Posting — journal batch created with lines (expense debit, tax debit, AP credit) | ✅ |
| AC3 | Currency conversion — `original_amount` (supplier) vs `converted_amount` (base) stored on PI | ✅ (exchange_rate stored, converted via multiplication) |
| AC4 | PI → PO/GR reference stored on PI line (po_line_id) | ✅ |
| AC5 | Credit limit enforcement at post (>80% warning, >100% block) | ✅ |
| AC6 | AP account from `purchasing_default_ap_account_id` setting → 400 if missing | ✅ |
| AC7 | Tax account resolved from tax_rate config → 400 if missing | ✅ |
| AC8 | Tenant isolation — only company PIs returned | ✅ (company_id enforced in all queries) |
| AC9 | ACL enforcement — 403 without `purchasing.invoices` CREATE | ✅ (CASHIER role tested) |

---

## Files Created

| File | Description |
|------|-------------|
| `packages/db/migrations/0177_purchasing_default_ap_account.sql` | Settings fields for AP and expense accounts |
| `packages/db/migrations/0178_purchase_invoices.sql` | `purchase_invoices` table |
| `packages/db/migrations/0179_purchase_invoice_lines.sql` | `purchase_invoice_lines` table |
| `packages/db/migrations/0180_acl_purchasing_invoices.sql` | ACL seed for `purchasing.invoices` |
| `packages/shared/src/constants/purchasing.ts` | `PURCHASE_INVOICE_STATUS` constants + labels |
| `packages/shared/src/schemas/purchasing.ts` | PI schemas (create, response, line response) |
| `packages/shared/src/constants/roles.defaults.json` | `purchasing.invoices` ACL for all roles |
| `packages/db/src/kysely/schema.ts` | `PurchaseInvoices`, `PurchaseInvoiceLines` interfaces |
| `apps/api/src/lib/purchasing/purchase-invoice.ts` | Domain service (create, list, get, post, void) |
| `apps/api/src/routes/purchasing/purchase-invoices.ts` | Route adapter |
| `apps/api/__test__/integration/purchasing/purchase-invoices.test.ts` | Integration suite |

---

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/purchasing/index.ts` | Modified | Registered invoice routes |
| `apps/api/src/lib/test-fixtures.ts` | Modified | Added `createTestPurchasingAccounts()` for AP/expense account seeding |
| `packages/shared/src/index.ts` | Modified | Re-exports `PURCHASE_INVOICE_STATUS` constants |

---

## Migrations Applied

```
applied 0177_purchasing_default_ap_account.sql ✅
applied 0178_purchase_invoices.sql ✅
applied 0179_purchase_invoice_lines.sql ✅
applied 0180_acl_purchasing_invoices.sql ✅
```

---

## Technical Debt

| Item | Priority | Note |
|------|----------|------|
| FK constraints not added to DB | P2 | App-layer enforcement only; cross-environment FK incompatibility during migration — revisit with dedicated compatibility migration |
| `currency_code` not validated against known list | P2 | Accept any 3-char code |

---

## Deferred from Epic 46 Retrospective

- Payment terms default inheritance not implemented — pre-existing, deferred from 46.1 review
- Duplicate key error handling uses MySQL-specific errno — pre-existing, deferred
- Missing audit logging for PO/PI operations — pre-existing, deferred
- Redundant migration 0174 (ENUM→TINYINT) when 0172 already creates TINYINT — pre-existing, deferred