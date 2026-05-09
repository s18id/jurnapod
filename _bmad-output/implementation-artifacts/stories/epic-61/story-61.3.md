# Story 61.3: Purchasing Document Chain Correctness

**Status:** ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 61 --story 61-3 --status done --title purchasing-document-chain-correctness`

---

## Story

As a **procurement auditor**,  
I want **the PO→goods receipt→AP invoice chain to be consistent and validated**,  
So that **received quantities match ordered quantities and AP invoices reference valid receipts**.

## Context

- Source: Epic 61 (FR3) — Purchasing Document Chain Correctness
- Depends on: Stories 61.1, 61.2 (lifecycle patterns established)
- Scope: `@jurnapod/modules-purchasing`, `apps/api/src/routes/purchasing/*`
- Risk: P0 — broken procurement chain allows AP invoices without valid receipts

### Document Chain

```
Purchase Order ──► Goods Receipt ──► AP Invoice ──► AP Payment
     │                  │                │              │
     │          qty ≤ ordered qty   refs receipt    refs invoice
     │          status updates      status guards   lifecycle
     └────────────── chain integrity ───────────────┘
```

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| PO→receipt: receipt qty ≤ ordered qty | Happy | Integration |
| PO→receipt→AP invoice: full chain | Happy | Integration |
| AP invoice without valid receipt rejected | Error | Integration |
| Receipt qty exceeds PO qty rejected | Error | Integration |
| Document status transitions atomic | Edge | Integration |
| CASHIER cannot access purchasing | Error | Integration |

---

## Acceptance Criteria

**AC1: PO→goods receipt quantity validation**
**Given** a purchase order with ordered quantity,
**When** a goods receipt is created,
**Then** the received quantity MUST NOT exceed the ordered quantity,
**And** the PO status updates to PARTIALLY_RECEIVED or FULLY_RECEIVED.

**AC2: Goods receipt→AP invoice reference integrity**
**Given** a goods receipt,
**When** an AP invoice is created referencing it,
**Then** the AP invoice MUST reference a valid (non-voided) receipt,
**And** the invoiced quantity MUST NOT exceed the received quantity.

**AC3: Document status transitions are atomic**
**Given** a PO→receipt→AP invoice chain,
**When** any document status transitions,
**Then** the transition and related status updates occur atomically,
**And** no partial updates leave the chain inconsistent.

**AC4: Void/correction flows use DELETE permission**
**Given** a purchase document (PO, receipt, AP invoice),
**When** void is attempted,
**Then** the operation requires DELETE permission,
**And** reversal journal entries are created where applicable.

**AC5: Tenant isolation on all purchasing queries**
**Given** a purchasing query (PO, receipt, AP invoice),
**When** the query is executed,
**Then** `company_id` MUST be in the WHERE clause for all rows.

---

## Tasks / Subtasks

- [ ] Task 1: Audit PO→receipt→AP invoice chain code (AC: all)
- [ ] Task 2: Implement quantity validation (AC: 1,2)
- [ ] Task 3: Verify atomic transitions (AC: 3)
- [ ] Task 4: Verify void/correction ACL (AC: 4)
- [ ] Task 5: Verify tenant scoping (AC: 5)
- [ ] Task 6: Integration tests for full procurement chain

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/purchasing/src/` | Audit | PO, receipt, AP invoice services |
| `apps/api/src/routes/purchasing/` | Modify | Quantity validation, lifecycle guards |
| `apps/api/__test__/integration/purchasing/` | Create | Document chain integration tests |

## Dev Notes

- Purchasing module has 8 resources: suppliers, exchange_rates, orders, receipts, invoices, payments, credits, reports
- Existing ACL migration 0169 seeded purchasing.suppliers for all companies
- Goods receipts table: `goods_receipts` with `purchase_order_id` FK
- AP invoices reference receipts via `purchase_invoice_lines.receipt_line_id`
- Use `withTransactionRetry` for atomic chain operations

## Dependencies

- Stories 61.1, 61.2 (lifecycle state-machine patterns)
- Epic 58 (inventory costing) — goods receipts affect inventory
- Epic 60 (ACL hardening) — DELETE permission for void operations

## Risk Level

P0 — Broken procurement chain allows AP invoices without valid receipts
