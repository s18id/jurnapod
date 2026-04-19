# Story 46.3: Purchase Orders CRUD

Status: done

## Story

As a **purchasing manager**,  
I want to create and manage purchase orders with line items,  
So that I can track what I've ordered from suppliers and plan goods receipts.

---

## Context

Story 46.3 adds the Purchase Order (PO) entity. POs are company-scoped, linked to a supplier. They have a lifecycle: DRAFT → SENT → PARTIAL_RECEIVED → RECEIVED → CLOSED. POs do NOT create journal entries (they're a planning/intent document, not a financial one). Financial impact happens at GR or PI stage.

**Dependencies:** Story 46.1 (supplier exists)

---

## Acceptance Criteria

**AC1: PO Creation**
**Given** a user with `purchasing.orders` CREATE permission,
**When** they create a PO with supplier_id, currency, line items (item_id, qty, unit_price, tax_rate),
**Then** a PO is created with status DRAFT, company_id set,
**And** total_amount is computed as sum(line.qty * line.unit_price * (1 + line.tax_rate)).

**AC2: PO Status Lifecycle**
**Given** a PO exists,
**When** status transitions are attempted,
**Then** only valid transitions are allowed:
- DRAFT → SENT (when sent to supplier)
- SENT → PARTIAL_RECEIVED (when any GR is created against it)
- SENT → RECEIVED (when all lines fully received via GR)
- PARTIAL_RECEIVED → RECEIVED
- RECEIVED → CLOSED (manual close when PO is fulfilled)
- DRAFT/SENT → CLOSED (cancel/close without receipt)
**And** invalid transitions return 400.

**AC3: PO Line Items**
**Given** a PO exists,
**When** line items are added/updated/removed,
**Then** total_amount is recomputed,
**And** received_qty starts at 0.

**AC4: PO List with Filters**
**Given** a purchasing manager,
**When** they list POs with filters (supplier_id, status, date_from, date_to),
**Then** results are scoped to company_id,
**And** include supplier name, total_amount, status, and open balance.

**AC5: GR Updates PO received_qty**
**Given** a PO exists with received_qty per line,
**When** a goods receipt is created against it (Story 46.4),
**Then** received_qty on each matched line is incremented by the GR line qty,
**And** PO status auto-transitions to PARTIAL_RECEIVED or RECEIVED.

**AC6: ACL Enforcement**
**Given** a user without `purchasing.orders` permission,
**When** they attempt to create/modify a PO,
**Then** they receive 403.

---

## Tasks / Subtasks

- [x] Create `purchase_orders` and `purchase_order_lines` table migrations
- [x] Add ACL resource `purchasing.orders`
- [x] Implement PO routes (CRUD + status transitions)
- [x] Implement `updateReceivedQtyFromGR()` called by GR creation
- [x] Implement PO list with filters
- [x] Write integration tests for PO lifecycle
- [x] Write integration tests for received_qty update from GR

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/routes/purchasing/purchase-orders.ts` | PO CRUD routes |
| `apps/api/src/lib/purchasing/purchase-order.ts` | PO status transition logic |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add purchase_orders, purchase_order_lines |
| `packages/shared/src/schemas/purchasing.ts` | Modify | Add PO schemas |
| `packages/auth/src/**/*` | Modify | Align order permissions with the approved ACL mapping |

---

## Validation Evidence

```bash
# Create PO
curl -X POST /api/purchasing/orders \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"supplier_id": 1, "currency": "USD", "lines": [{"item_id": 10, "qty": 100, "unit_price": "5.00", "tax_rate": "0.10"}]}'

# Send PO (status transition DRAFT -> SENT)
curl -X PATCH /api/purchasing/orders/1/status \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "SENT"}'

# List POs
curl "/api/purchasing/orders?supplier_id=1&status=SENT" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Dev Notes

- `purchase_orders.status`: enum('DRAFT','SENT','PARTIAL_RECEIVED','RECEIVED','CLOSED')
- `purchase_order_lines.received_qty`: starts at 0, incremented by GR creation
- `purchase_orders.currency`: stored for display; all financial conversion uses PI stage
- PO total_amount stored for reference, not used for GL
- No journal entry at PO stage

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `as any` casts added without justification
- [ ] No N+1 query patterns introduced

## Review Findings (Resolved / Deferred)

- [x] [Review][Fixed] Floating-point monetary math replaced with BigInt scaled decimal logic
- [x] [Review][Fixed] `received_qty >= qty` comparison moved to precise scaled decimal comparison
- [x] [Review][Fixed] `parseFloat` NaN-risk paths removed from core monetary calculations
- [x] [Review][Fixed] `PurchaseOrderLines.company_id` schema type corrected to `number`
- [x] [Review][Defer] FK constraints for some paths remain app-layer due to production DB type mismatch investigation
- [x] [Review][Defer] currency_code normalization against canonical currency registry deferred to follow-up
- [x] [Review][Defer] Audit logging improvements deferred (pre-existing pattern)
