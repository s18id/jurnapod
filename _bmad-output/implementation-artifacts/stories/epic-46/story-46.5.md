# Story 46.5: Purchase Invoices

Status: backlog

## Story

As an **accountant**,  
I want to create purchase invoices matched to PO and GR,  
So that AP is recognized and GL journal entries are created in base currency.

---

## Context

Story 46.5 adds the Purchase Invoice (PI) entity. This is the financial document — when a PI is posted, it creates journal entries. The PI amount is in the supplier's currency, converted to company base currency at the PI date's exchange rate for journal posting.

**Dependencies:** Story 46.1 (supplier), Story 46.2 (exchange rates), Story 46.3 (PO), Story 46.4 (GR)

---

## Acceptance Criteria

**AC1: PI Creation**
**Given** a user with `purchasing.invoices` CREATE permission,
**When** they create a PI with supplier_id, pi_number, pi_date, lines (item_id, qty, unit_price, tax_rate, po_line_id, gr_line_id optional),
**Then** a PI is created with status DRAFT, company_id set.

**AC2: PI Posting (Journal Creation)**
**Given** a PI in DRAFT status,
**When** it is posted,
**Then** the system:
- Looks up exchange rate: `getExchangeRate(companyId, supplier.currency, pi_date)`
- If no rate found → 400 error with message about missing exchange rate
- Creates journal batch with lines:
  - Per line: `D: Inventory/COGS (base_amount)` `C: AP Trade (base_amount)`
- `base_amount = line.qty * line.unit_price * exchange_rate`
- PI status → POSTED
- Returns the journal batch ID in the response

**AC3: Currency Conversion**
**Given** a PI with supplier.currency = USD, company.base_currency = EUR, rate = 1.1200 (1 USD = 1.12 EUR),
**When** the PI is posted,
**Then** each journal line amount is in EUR (base currency),
**And** the PI record stores `original_amount` (supplier currency) and `converted_amount` (base currency) and `exchange_rate`.

**AC4: PI Matching to PO/GR**
**Given** a PI references a PO line or GR line,
**When** the PI is posted,
**Then** the PO/GR reference is stored on the PI line record for audit trail (matching is informational, not enforced).

**AC5: Credit Limit Enforcement at PI Post**
**Given** a supplier near credit limit,
**When** a PI is posted that would push utilization over 100%,
**Then** the post is blocked with 400 error (credit limit exceeded — must reduce amount or wait for payment),
**And** 80-100% utilization → warning logged but not blocked.

**AC6: AP Trade Account**
**Given** a company has a default AP trade account configured in `company_settings`,
**When** a PI is posted,
**Then** the AP Trade credit entry uses the company's configured AP trade account_id.
**If** no AP trade account is configured → 400 error at first PI post (blocks until configured).

**AC7: Tenant Isolation**
**Given** PI records exist for multiple companies,
**When** any company queries its PIs,
**Then** only that company's PIs are returned (company_id enforcement).

**AC8: ACL Enforcement**
**Given** a user without `purchasing.invoices` CREATE permission,
**When** they attempt to create/post a PI,
**Then** they receive 403.

---

## Tasks / Subtasks

- [ ] Create `purchase_invoices` and `purchase_invoice_lines` table migrations
- [ ] Add ACL resource `purchasing.invoices`
- [ ] Implement PI routes (create, post, void, list)
- [ ] Call `getExchangeRate()` in PI posting
- [ ] Call `createJournalBatch()` for GL posting
- [ ] Check company_settings for AP trade account_id
- [ ] Implement credit limit enforcement at post time
- [ ] Write integration tests for PI → journal creation
- [ ] Write integration tests for currency conversion (with different rates)
- [ ] Write integration tests for journal balancing (debits = credits)

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/routes/purchasing/purchase-invoices.ts` | PI routes |
| `apps/api/src/lib/purchasing/purchase-invoice.ts` | PI posting logic + journal creation |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add purchase_invoices, purchase_invoice_lines |
| `packages/shared/src/schemas/purchasing.ts` | Modify | Add PI schemas |
| `packages/auth/src/acls.ts` | Modify | Add invoices resource |
| `apps/api/src/lib/sales-posting.ts` | Modify | (if shared journal posting pattern can be reused) |

---

## Validation Evidence

```bash
# Create PI (DRAFT)
curl -X POST /api/purchasing/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"supplier_id": 1, "pi_number": "PI-001", "pi_date": "2026-04-15", "lines": [{"po_line_id": 10, "item_id": 10, "qty": 50, "unit_price": "5.00", "tax_rate": "0.10"}]}'

# Post PI (creates journal)
curl -X POST /api/purchasing/invoices/1/post \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 with {"journal_batch_id": 123, "status": "POSTED"}

# Verify journal lines (D: Inventory/COGS, C: AP Trade, both in base EUR)
curl /api/journals/batches/123 -H "Authorization: Bearer $TOKEN"

# Missing exchange rate test
# Create PI with USD supplier but no USD rate for pi_date -> expect 400
```

---

## Dev Notes

- PI line `unit_price` is in supplier currency
- `base_amount = qty * unit_price * exchange_rate` — all in BigInt (cents) for journal
- Journal: one batch per PI post, multiple lines per batch (one D/C pair per PI line)
- `company_settings.ap_trade_account_id` must exist before first PI post
- PI status: DRAFT → POSTED → VOID
- VOID on PI creates reversal journal batch (same accounts, opposite signs)

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `as any` casts added without justification
- [ ] Journal batch balanced (total debits = total credits) — verify in tests
- [ ] All PI line amounts summed = journal batch total
