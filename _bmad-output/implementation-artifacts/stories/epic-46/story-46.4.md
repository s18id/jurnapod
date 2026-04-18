# Story 46.4: Goods Receipt Against PO

Status: backlog

## Story

As a **warehouse staff**,  
I want to record goods received against a purchase order,  
So that the system tracks what has arrived and updates PO received quantities.

---

## Context

Story 46.4 adds the Goods Receipt (GR) entity. GRs record physical receipt of goods. GR lines optionally reference PO lines (matching by item_id). GRs do NOT create journal entries — they update received_qty on the PO and are used as a matching reference when creating PIs.

**Dependencies:** Story 46.3 (PO exists)

---

## Acceptance Criteria

**AC1: GR Creation**
**Given** a user with `purchasing.receipts` CREATE permission,
**When** they create a GR with reference_number, supplier_id, lines (item_id, qty, po_line_id optional),
**Then** a GR is created with status RECEIVED, company_id set,
**And** if `po_line_id` is provided, the PO line's `received_qty` is incremented by the GR line qty.

**AC2: PO Line Matching (Optional)**
**Given** a GR line references a PO line,
**When** the GR is created,
**Then** the system verifies the item_id matches between GR line and PO line,
**And** if qty exceeds remaining PO open qty (po_line.qty - po_line.received_qty), a warning is issued but not blocked (allow over-receipt with confirmation flag).

**AC3: PO Status Auto-Update**
**Given** a PO with status SENT,
**When** any GR is created against it,
**Then** PO status becomes PARTIAL_RECEIVED if any line has received_qty < qty,
**Or** RECEIVED if all lines have received_qty >= qty.

**AC4: Credit Limit Check**
**Given** a supplier with existing open PIs,
**When** a GR is created that would increase the expected AP (i.e., PI will follow),
**Then** the system checks supplier credit utilization,
**And** if utilization would exceed 80%, a warning is returned in the response,
**And** if utilization would exceed 100%, a confirmation is required (allow override with reason).

**AC5: GR List**
**Given** a user,
**When** they list GRs with filters (supplier_id, date_from, date_to),
**Then** results include PO reference if matched, and supplier name.

**AC6: ACL Enforcement**
**Given** a user without `purchasing.receipts` permission,
**When** they attempt to create a GR,
**Then** they receive 403.

---

## Tasks / Subtasks

- [ ] Create `goods_receipts` and `goods_receipt_lines` table migrations
- [ ] Add ACL resource `purchasing.receipts`
- [ ] Implement GR routes
- [ ] Call `updateReceivedQtyFromGR()` in PO service
- [ ] Implement credit limit check before GR creation
- [ ] Write integration tests for GR + PO received_qty update
- [ ] Write integration tests for credit limit warning/block

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/routes/purchasing/goods-receipts.ts` | GR routes |
| `apps/api/src/lib/purchasing/goods-receipt.ts` | GR logic + credit check |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add goods_receipts, goods_receipt_lines |
| `packages/shared/src/schemas/purchasing.ts` | Modify | Add GR schemas |
| `packages/auth/src/acls.ts` | Modify | Add receipts resource |

---

## Validation Evidence

```bash
# Create GR against PO line
curl -X POST /api/purchasing/receipts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"supplier_id": 1, "reference_number": "GR-001", "lines": [{"po_line_id": 10, "item_id": 10, "qty": 50}]}'

# Verify PO received_qty updated
curl /api/purchasing/orders/1 -H "Authorization: Bearer $TOKEN"
# Expected: received_qty: 50 on line 10

# Credit limit warning (at 85% utilization)
curl -X POST /api/purchasing/receipts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"supplier_id": 1, ...}'
# Expected: 200 with warning: {"credit_warning": "85% utilized"}
```

---

## Dev Notes

- GR does NOT create journal entries (goods received but not yet invoiced = off-balance-sheet暂记)
- GR lines: at least one of `po_line_id` OR `item_id` must be provided
- `goods_receipts.status`: only RECEIVED (GR is a point-in-time record, not a lifecycle)
- No status transitions on GR — it's an immutable receipt record
- `over_receipt_allowed`: boolean flag when qty > remaining PO qty

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `as any` casts added without justification
