# Story 46.7: Supplier Credit Notes

Status: backlog

## Story

As an **accountant**,  
I want to record credit notes from suppliers,  
So that AP balances are correctly reduced when suppliers issue credits (e.g., returns, discounts).

---

## Context

Story 46.7 adds purchase credit notes (AP credits). These are supplier-issued credits that reduce the AP balance. Credit notes follow the same immutability rule as other finalized financial documents: DRAFT → POSTED/APPLIED → VOID.

**Dependencies:** Story 46.5 (PI exists with AP balance), Story 46.6 (AP payment pattern)

---

## Acceptance Criteria

**AC1: Credit Note Creation**
**Given** a user with `purchasing.credits` CREATE permission,
**When** they create a purchase credit with supplier_id, credit_number, credit_date, lines (item_id, qty, unit_price, reason),
**Then** a purchase_credit is created with status DRAFT,
**And** `total_credit_amount` is computed from lines.

**AC2: Credit Note Posting / Application (AP Reduction)**
**Given** a purchase credit in DRAFT status,
**When** it is posted and applied,
**Then** for each line: the PI's balance is reduced by the line amount (credited to AP),
**And** a journal batch is created: `D: AP Trade` `C: Inventory/COGS reversal` (in base currency).

**AC3: Credit Note vs PI Matching**
**Given** a credit note references a specific PI or PI line,
**When** the credit is applied,
**Then** the balance reduction is applied to that PI,
**Or** if no reference, applied to oldest open PI from that supplier (FIFO).

**AC4: Credit Note Partial Application**
**Given** a credit note with total_credit_amount = 500.00,
**When** it is applied against a PI with balance = 200.00,
**Then** the PI balance becomes 0,
**And** the credit note balance becomes 300.00 (remaining unused),
**And** the credit note status remains PARTIAL if balance > 0, or APPLIED if fully applied.

**AC5: ACL Enforcement**
**Given** a user without `purchasing.credits` permission,
**When** they attempt to create/apply a credit note,
**Then** they receive 403.

**AC6: Credit Note Void**
**Given** a posted/applied purchase credit,
**When** it is voided,
**Then** a reversal journal batch is created,
**And** any previously reduced PI balances are restored,
**And** the credit note status becomes VOID.

---

## Tasks / Subtasks

- [ ] Create `purchase_credits` and `purchase_credit_lines` table migrations
- [ ] Add ACL resource `purchasing.credits`
- [ ] Implement credit note routes (create, post/apply, void, list)
- [ ] Create journal batch on credit application
- [ ] Create reversal journal batch on credit void
- [ ] Implement FIFO PI matching when no specific PI referenced
- [ ] Write integration tests for credit note → journal creation
- [ ] Write integration tests for partial application

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/routes/purchasing/purchase-credits.ts` | Credit note routes |
| `apps/api/src/lib/purchasing/purchase-credit.ts` | Credit application logic |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add purchase_credits, purchase_credit_lines |
| `packages/shared/src/schemas/purchasing.ts` | Modify | Add credit schemas |
| `packages/auth/src/**/*` | Modify | Align credits permissions with the approved ACL mapping |

---

## Validation Evidence

```bash
# Create credit note
curl -X POST /api/purchasing/credits \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"supplier_id": 1, "credit_number": "CN-001", "credit_date": "2026-04-19", "lines": [{"item_id": 10, "qty": 5, "unit_price": "10.00", "reason": "return"}]}'

# Post/apply credit note
curl -X POST /api/purchasing/credits/1/apply \
  -H "Authorization: Bearer $TOKEN"
# Expected: PI balance reduced, journal created

# Verify journal
curl /api/journals/batches/125 -H "Authorization: Bearer $TOKEN"
# Expected: D: AP Trade 50, C: Inventory/COGS reversal 50
```

---

## Dev Notes

- `purchase_credits.status`: DRAFT → APPLIED/PARTIAL → FULLY_APPLIED → VOID
- Journal on apply: `D: AP Trade (reduces what we owe)` `C: Inventory/COGS reversal`
- Credit note can reference specific PI line or be unallocated (FIFO by credit_date)
- `total_credit_amount` and `applied_amount` tracked on header; balance = remaining
- VOID restores PI balances and creates a reversing journal batch

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] Journal batch balanced
- [ ] No `as any` casts added without justification
