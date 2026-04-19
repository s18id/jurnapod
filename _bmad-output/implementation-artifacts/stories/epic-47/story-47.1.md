# Story 47.1: AP↔GL Reconciliation Summary

Status: backlog

## Story

As a **finance controller**,  
I want to see a summary of AP vs GL reconciliation status,  
So that I can identify discrepancies between accounts payable subledger and general ledger control accounts.

---

## Context

Epic 47 establishes AP reconciliation and period close controls. Story 47.1 delivers the reconciliation summary dashboard, showing AP subledger balance vs GL control account balance as of a company-local business date cutoff. Reconciliation uses a configurable AP control account set (not a hardcoded single account) to support multi-currency and multi-bank setups.

**Cutoff semantics:** `as_of_date` represents company-local business date (midnight in company timezone). All AP transactions posted on or before this date are included; GL journal entries with `effective_date` ≤ `as_of_date` are included.

**Dependencies:** Epic 46 (Purchasing/AP) must be complete, as AP subledger data comes from purchase invoices (46.5), AP payments (46.6), and supplier credit notes (46.7).

---

## Acceptance Criteria

**AC1: AP Control Account Set Configuration**
**Given** a company admin with `accounting.accounts` MANAGE permission,
**When** they configure AP reconciliation settings,
**Then** they can specify one or more GL account IDs as the AP control account set,
**And** the configuration is stored per company.

**AC2: Reconciliation Summary Calculation**
**Given** a configured AP control account set and a cutoff date (`as_of_date`),
**When** the reconciliation summary is requested,
**Then** the system calculates:
- AP subledger balance (sum of open purchase invoices + open credit notes - prepayments)
- GL control account balance (sum of journal lines for the account set)
- Variance (difference between the two)
- **And** all calculations are scoped to the authenticated company.

**AC3: Cutoff Date Handling**
**Given** a cutoff date in company-local timezone,
**When** calculating reconciliation balances,
**Then** AP transactions are included if `invoice_date` ≤ `as_of_date` (local midnight),
**And** GL journal entries are included if `effective_date` ≤ `as_of_date` (local midnight).

**AC4: Multi‑Currency Support**
**Given** the company has AP in multiple currencies,
**When** reconciliation is requested,
**Then** AP subledger amounts are converted to company base currency using the exchange rate effective on the transaction date,
**And** GL amounts (already in base currency) are compared accordingly.

**AC5: API Endpoint & Response Format**
**Given** a user with `accounting.journals` ANALYZE permission,
**When** they call `GET /api/accounting/ap-reconciliation/summary?as_of_date=YYYY-MM-DD`,
**Then** they receive a JSON response containing:
- `ap_balance` (decimal)
- `gl_balance` (decimal)
- `variance` (decimal)
- `as_of_date` (date)
- `account_set` (array of account IDs used)
- `calculation_timestamp` (ISO 8601)

**AC6: Tenant Isolation**
**Given** Company A and Company B both have AP data,
**When** Company A requests reconciliation summary,
**Then** only Company A's AP transactions and GL accounts are considered.

---

## Tasks / Subtasks

- [ ] Design `ap_reconciliation_settings` table (company_id, account_ids JSON)
- [ ] Create migration for AP reconciliation settings table
- [ ] Implement AP subledger balance query (open invoices + credit notes - prepayments)
- [ ] Implement GL control account balance query (journal lines for account set)
- [ ] Build reconciliation summary service with cutoff date logic
- [ ] Create `/api/accounting/ap-reconciliation/summary` endpoint
- [ ] Write integration tests for summary calculation
- [ ] Write integration tests for multi‑currency conversion
- [ ] Write integration tests for tenant isolation
- [ ] Update OpenAPI spec

---

### Review Findings

- [ ] *Review placeholder – findings will be populated during implementation review*

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/db/migrations/0XXX_ap_reconciliation_settings.sql` | AP reconciliation settings table |
| `packages/shared/src/schemas/ap-reconciliation.ts` | Zod schemas for reconciliation types |
| `packages/modules/accounting/src/services/ap-reconciliation-service.ts` | Reconciliation calculation logic |
| `apps/api/src/routes/accounting/ap-reconciliation.ts` | Reconciliation API routes |
| `apps/api/__test__/integration/accounting/ap-reconciliation-summary.test.ts` | Integration tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add ApReconciliationSettings type |
| `packages/shared/src/index.ts` | Modify | Export AP reconciliation schemas |
| `packages/shared/src/constants/modules.ts` | Modify | Add `accounting.ap_reconciliation` permission entry |
| `apps/api/src/app.ts` | Modify | Register `/api/accounting/ap-reconciliation` routes |

---

## Validation Evidence

```bash
# Configure AP control account set
curl -X PUT /api/accounting/ap-reconciliation/settings \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"account_ids": [101, 102]}'

# Get reconciliation summary
curl "/api/accounting/ap-reconciliation/summary?as_of_date=2025-04-19" \
  -H "Authorization: Bearer $TOKEN"

# Expected response shape:
# {
#   "ap_balance": "12500.00",
#   "gl_balance": "12480.50",
#   "variance": "19.50",
#   "as_of_date": "2025-04-19",
#   "account_set": [101, 102],
#   "calculation_timestamp": "2025-04-19T10:30:00Z"
# }
```

---

## Dev Notes

- AP control account set is stored as a JSON array of account IDs; consider if we need a separate join table for many‑to‑many.
- Cutoff date must be passed as YYYY‑MM‑DD in company timezone; conversion to UTC for database queries should use `company.timezone`.
- AP subledger balance calculation must exclude voided/refunded transactions (use `status_id` checks).
- GL balance query must sum `debit`‑`credit` for the given account set, filtered by `effective_date` ≤ cutoff.
- Multi‑currency conversion uses the exchange rate effective on each invoice/payment date; need to join with `exchange_rates` table.

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow‑up
- [ ] No `as any` casts added without justification
- [ ] New status/state columns use `TINYINT` (per Epic 47 constraint)
- [ ] All new tables have proper indexes on `company_id`
- [ ] Queries are optimized (no N+1, appropriate joins)
- [ ] Exchange‑rate conversion uses canonical rate‑lookup helper