# Story 47.2: Reconciliation Drilldown & Variance Attribution

Status: backlog

## Story

As a **finance controller**,  
I want to drill down into AP↔GL reconciliation variances,  
So that I can identify which transactions cause the difference and take corrective action.

---

## Context

Story 47.1 provides a high‑level summary; Story 47.2 delivers the detailed drill‑down that explains *why* AP and GL balances differ. The drill‑down breaks the variance into attributable categories: timing differences (AP posted, GL not yet posted), posting errors (wrong account, amount mismatch), and missing transactions (AP missing or GL missing).

**Dependencies:** Story 47.1 (summary endpoint) must be implemented first, as the drill‑down builds on the same cutoff date and account‑set configuration.

---

## Acceptance Criteria

**AC1: Variance Attribution Categories**
**Given** a reconciliation summary shows a non‑zero variance,
**When** the drill‑down is requested,
**Then** the response categorizes the variance into:
- **Timing differences:** AP transactions posted but GL entries not yet posted (or vice‑versa)
- **Posting errors:** GL entries posted to wrong account, or with incorrect amount
- **Missing transactions:** AP invoice/payment exists with no corresponding GL entry (or GL entry with no AP source)
- **Currency rounding differences:** small variances due to exchange‑rate rounding

**AC2: Drill‑Down Line Items**
**Given** a variance category,
**When** the user expands that category,
**Then** they see a list of individual transactions contributing to the variance, each with:
- Transaction ID and date
- AP amount (if present)
- GL amount (if present)
- Difference
- Suggested action (e.g., “Post missing journal”, “Correct account mapping”)

**AC3: GL‑Side Drill‑Down**
**Given** a GL control account balance,
**When** the user requests GL detail,
**Then** they see all journal lines posted to the AP control account set within the cutoff period,
**And** each line shows the journal number, effective date, description, and amount.

**AC4: AP‑Side Drill‑Down**
**Given** the AP subledger balance,
**When** the user requests AP detail,
**Then** they see all open purchase invoices, credit notes, and prepayments as of the cutoff date,
**And** each item shows invoice number, supplier, due date, currency, and converted base‑currency amount.

**AC5: Cross‑Highlighting**
**Given** a GL journal line that references an AP transaction via `source_id`/`source_type`,
**When** viewing the drill‑down,
**Then** the corresponding AP transaction is visually linked (or flagged as matched),
**And** unmatched AP/GL items are highlighted.

**AC6: Export for Audit**
**Given** a drill‑down result,
**When** the user requests export,
**Then** they can download a CSV containing all variance line items with full attribution data.

**AC7: API Endpoints**
**Given** a user with `purchasing.reports` ANALYZE permission,
**When** they call:
- `GET /api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=YYYY-MM-DD`
- `GET /api/purchasing/reports/ap-reconciliation/gl-detail?as_of_date=YYYY-MM-DD`
- `GET /api/purchasing/reports/ap-reconciliation/ap-detail?as_of_date=YYYY-MM-DD`
**Then** each endpoint returns the appropriate structured detail.

**Canonical ACL mapping for this story:** `purchasing.reports` + `ANALYZE` for drilldown, GL detail, AP detail, and export.

---

## Tasks / Subtasks

- [ ] Design variance attribution algorithm (compare AP transactions vs GL journal lines)
- [ ] Implement GL‑detail query (journal lines for account set, filtered by effective_date)
- [ ] Implement AP‑detail query (open invoices, credit notes, prepayments as of cutoff)
- [ ] Build matching logic to link AP transactions to GL entries via `source_id`/`source_type`
- [ ] Categorize unmatched items into timing differences, posting errors, missing
- [ ] Create drill‑down endpoint that returns categorized variance breakdown
- [ ] Create GL‑detail and AP‑detail endpoints
- [ ] Add CSV export endpoint (or reuse existing export infrastructure)
- [ ] Write integration tests for attribution accuracy
- [ ] Write integration tests for cross‑highlighting matching
- [ ] Update OpenAPI spec

---

### Review Findings

- [ ] *Review placeholder – findings will be populated during implementation review*

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/accounting/src/services/ap-reconciliation-drilldown-service.ts` | Drill‑down attribution logic |
| `packages/modules/accounting/src/types/ap-reconciliation.ts` | Type definitions for drill‑down categories |
| `apps/api/src/routes/purchasing/reports/ap-reconciliation.ts` | Drill‑down API routes |
| `apps/api/__test__/integration/accounting/ap-reconciliation-drilldown.test.ts` | Integration tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/accounting/src/services/ap-reconciliation-service.ts` | Modify | Extend to call drill‑down service |
| `apps/api/src/routes/purchasing/reports/ap-reconciliation.ts` | Modify | Add drill‑down, GL‑detail, AP‑detail endpoints |
| `packages/shared/src/schemas/ap-reconciliation.ts` | Modify | Add drill‑down response schemas |

---

## Validation Evidence

```bash
# Get full drill‑down
curl "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2025-04-19" \
  -H "Authorization: Bearer $TOKEN"

# Get GL detail only
curl "/api/purchasing/reports/ap-reconciliation/gl-detail?as_of_date=2025-04-19" \
  -H "Authorization: Bearer $TOKEN"

# Get AP detail only
curl "/api/purchasing/reports/ap-reconciliation/ap-detail?as_of_date=2025-04-19" \
  -H "Authorization: Bearer $TOKEN"

# Export CSV
curl "/api/purchasing/reports/ap-reconciliation/export?as_of_date=2025-04-19&format=csv" \
  -H "Authorization: Bearer $TOKEN" -o variance.csv
```

---

## Dev Notes

- Matching AP transactions to GL entries relies on the `source_id`/`source_type` recorded when the journal line was posted (e.g., `source_type='purchase_invoice'`, `source_id=invoice_id`). If those fields are missing, the item appears as “unmatched”.
- Timing differences are defined as AP transactions with `invoice_date` ≤ cutoff but no GL entry with `effective_date` ≤ cutoff (or vice‑versa). This may be normal during the posting lag; the drill‑down should flag them but not treat them as errors.
- Posting errors are detected when a GL line references an AP transaction but the amount differs by more than a rounding tolerance (e.g., > 0.01).
- Currency rounding differences should be grouped separately and shown as a single line with the total rounding variance.
- Consider pagination for large drill‑downs (AP/GL detail may have hundreds of lines).

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow‑up
- [ ] No `as any` casts added without justification
- [ ] Matching logic is deterministic and idempotent
- [ ] Queries are optimized (avoid N+1, use appropriate indexes)
- [ ] CSV export uses the generic export service pattern (if available)
- [ ] Rounding tolerance is configurable (e.g., 0.01 in base currency)
