# Story 47.3: Supplier Statement Matching (Manual Entry MVP)

Status: backlog

## Story

As a **accounts payable clerk**,  
I want to manually enter supplier statement balances and match them to our AP subledger,  
So that I can identify discrepancies between our records and the supplier’s statement.

---

## Context

Supplier statement reconciliation is a key control for AP. This story delivers a manual‑entry MVP: users can input statement balances per supplier per statement date, and the system will compare them to the AP subledger balance for that supplier as of the same date. File import (PDF/CSV) is out of scope for MVP.

**Dependencies:** Story 47.2 (drill‑down) provides the AP subledger detail needed for per‑supplier balance calculation.

---

## Acceptance Criteria

**AC1: Manual Statement Entry**
**Given** a user with `purchasing.suppliers` ANALYZE permission,
**When** they submit a supplier statement entry (supplier_id, statement_date, closing_balance, currency),
**Then** the entry is stored in a `supplier_statements` table,
**And** the currency is stored alongside the amount (statement amounts are in the supplier’s currency).

**AC2: Per‑Supplier AP Subledger Balance**
**Given** a supplier and a statement date,
**When** the system calculates the AP subledger balance for that supplier,
**Then** it sums all open purchase invoices, credit notes, and prepayments for that supplier as of the statement date (local midnight),
**And** the result is converted to the supplier’s currency using the exchange rate effective on each transaction date.

**AC3: Statement vs Subledger Comparison**
**Given** a stored supplier statement entry,
**When** the user requests reconciliation,
**Then** the system compares the statement closing balance to the AP subledger balance for that supplier,
**And** shows the difference (variance) with a flag if the variance exceeds a configurable tolerance (e.g., > 1.00 in statement currency).

**AC4: Statement List & Filtering**
**Given** multiple statement entries exist,
**When** the user views the statement list,
**Then** they can filter by supplier, date range, and reconciliation status (matched, unmatched, variance exceeded),
**And** each entry shows supplier name, statement date, closing balance, subledger balance, variance, and status.

**AC5: Statement Status Management**
**Given** a statement entry with a variance within tolerance,
**When** the user marks it as “reconciled”,
**Then** the statement record is updated with `reconciled_at` timestamp and `reconciled_by` user ID,
**And** the status changes to “matched”.

**AC6: Variance Investigation Drill‑Down**
**Given** a statement with a variance outside tolerance,
**When** the user drills down,
**Then** they see the same per‑supplier AP detail as Story 47.2’s AP‑detail endpoint,
**And** they can flag individual transactions as “disputed” with a note.

**AC7: API Endpoints**
**Given** appropriate permissions,
**When** the user calls:
- `POST /api/purchasing/supplier-statements` (create)
- `GET /api/purchasing/supplier-statements` (list with filters)
- `GET /api/purchasing/supplier-statements/{id}/reconcile` (compare with subledger)
- `PUT /api/purchasing/supplier-statements/{id}/reconcile` (mark as reconciled)
**Then** each endpoint returns the expected data.

**AC8: Tenant Isolation**
**Given** statements exist for multiple companies,
**When** a user queries statements,
**Then** only statements for their company are returned.

---

## Tasks / Subtasks

- [ ] Design `supplier_statements` table (company_id, supplier_id, statement_date, closing_balance, currency, reconciled_at, reconciled_by, status TINYINT)
- [ ] Create migration for supplier_statements table
- [ ] Implement per‑supplier AP subledger balance query (reuse logic from Story 47.2)
- [ ] Build statement‑entry CRUD endpoints
- [ ] Build reconciliation comparison endpoint
- [ ] Implement filtering and list endpoint
- [ ] Add “mark as reconciled” endpoint
- [ ] Write integration tests for statement entry and reconciliation
- [ ] Write integration tests for tenant isolation
- [ ] Update OpenAPI spec

---

### Review Findings

- [ ] *Review placeholder – findings will be populated during implementation review*

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/db/migrations/0XXX_supplier_statements.sql` | supplier_statements table migration |
| `packages/shared/src/schemas/supplier-statements.ts` | Zod schemas for statement types |
| `packages/modules/purchasing/src/services/supplier-statement-service.ts` | Statement reconciliation logic |
| `apps/api/src/routes/purchasing/supplier-statements.ts` | Statement API routes |
| `apps/api/__test__/integration/purchasing/supplier-statements.test.ts` | Integration tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add SupplierStatements type |
| `packages/shared/src/index.ts` | Modify | Export supplier‑statement schemas |
| `packages/shared/src/constants/modules.ts` | Modify | Add `purchasing.supplier_statements` permission entry |
| `apps/api/src/routes/purchasing/index.ts` | Modify | Register supplier‑statements routes |

---

## Validation Evidence

```bash
# Create a statement entry
curl -X POST /api/purchasing/supplier-statements \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "supplier_id": 123,
    "statement_date": "2025-04-19",
    "closing_balance": "5500.00",
    "currency": "USD"
  }'

# List statements with filter
curl "/api/purchasing/supplier-statements?supplier_id=123&status=unmatched" \
  -H "Authorization: Bearer $TOKEN"

# Reconcile a statement
curl -X GET "/api/purchasing/supplier-statements/456/reconcile" \
  -H "Authorization: Bearer $TOKEN"

# Mark as reconciled
curl -X PUT "/api/purchasing/supplier-statements/456/reconcile" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"notes": "Manually verified with supplier"}'
```

---

## Dev Notes

- `supplier_statements.status` uses TINYINT with defined constants: 1=unmatched, 2=matched, 3=disputed.
- `closing_balance` is stored as DECIMAL(19,4) in the statement currency.
- Reconciliation tolerance is configurable per company (maybe later); for MVP use a fixed tolerance of 1.00 in statement currency.
- Per‑supplier AP subledger balance must exclude voided/refunded transactions (use `status_id` checks).
- Exchange‑rate conversion for each invoice/payment uses the rate effective on the transaction date; need to join with `exchange_rates` table.
- The “disputed” flag on individual AP transactions could be stored in a separate `supplier_statement_disputes` table (story 47.4 will handle exception worklist).

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow‑up
- [ ] No `as any` casts added without justification
- [ ] New status column uses `TINYINT` (per Epic 47 constraint)
- [ ] All new tables have proper indexes on `company_id`, `supplier_id`, `statement_date`
- [ ] Queries are optimized (avoid N+1, use appropriate joins)
- [ ] Exchange‑rate conversion uses canonical rate‑lookup helper
- [ ] Tolerance logic is consistent (absolute difference > tolerance)