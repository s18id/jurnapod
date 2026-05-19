# Story 69-2-b: Purchase Orders + Goods Receipts

Status: backlog

## Story

As a **purchasing officer**,  
I want **purchase order and goods receipt screens**,  
So that **ordered goods can be tracked from draft/order state through receipt with correct quantities and backend-authoritative status**.

## Context

This slice implements purchase orders and receipts only. Canonical endpoints are `/api/purchasing/orders` and `/api/purchasing/receipts`. The old monolith's `/purchase-orders`, `/goods-receipts`, `POST /:id/submit`, and `SUBMITTED` status assumptions are invalid.

## Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| PO list filters by supplier/status/date | Happy | Unit/component |
| PO create with 3 lines uses ReviewPanel | Happy | Component |
| PO status update uses `PATCH /orders/:id/status` | Happy | Contract/component |
| Receipt from PO pre-fills backend-returned lines | Happy | Component |
| Negative quantity rejected before submit | Error | Unit |
| 403 for CASHIER on create/status change | Auth | Integration/contract |
| Concurrent stale PO update shows conflict | Edge | Component/contract |

**Sign-off:** QA kickoff sign-off required before implementation begins.

## Cross-Module Error Boundary Verification

Consumer MUST map API status and `code` values. `instanceof` is N/A across HTTP boundaries.

| Error | Mapping |
|-------|---------|
| Validation | 400/422 response `code` |
| Permission | 403 response `code` |
| Not found | 404 response `code` |
| Conflict | 409 response `code` |

## Cross-Module Decision Gate

| # | Decision | Winston Sign-Off |
|---|----------|-----------------|
| 1 | PO-to-receipt pre-fill MUST use `GET /api/purchasing/orders/:id` as source; frontend MAY map returned PO lines into receipt draft state and MUST NOT recompute supplier ownership, received quantities, inventory effects, or accounting effects. | Winston GO — Use GET `/api/purchasing/orders/:id` as the only source for receipt line pre-fill. Backend receipt creation remains authoritative. |
| 2 | PO status changes MUST use backend canonical `PATCH /api/purchasing/orders/:id/status` with backend status values. | Pending contract verification |

## API Contract Verification

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/purchasing/orders` | GET | `{ success: true, data: { orders, total, limit, offset } }` | TBD | Query fields MUST be verified |
| `/api/purchasing/orders` | POST | Created order envelope with lines | TBD | Exact body/response MUST be verified |
| `/api/purchasing/orders/:id` | GET | Order detail with lines | TBD | Required for receipt pre-fill |
| `/api/purchasing/orders/:id/status` | PATCH | Updated order/status envelope | TBD | Status values: `DRAFT`, `SENT`, `PARTIAL_RECEIVED`, `RECEIVED`, `CLOSED` |
| `/api/purchasing/receipts` | GET | `{ success: true, data: { receipts, total, limit, offset } }` | TBD | Exact collection key MUST be verified |
| `/api/purchasing/receipts` | POST | Created receipt envelope with lines | TBD | Backend authoritative |
| `/api/purchasing/receipts/:id` | GET | Receipt detail envelope | TBD | Detail drawer |

## Acceptance Criteria

**AC1:** PO list supports supplier, status, and date filters using canonical backend statuses.  
**AC2:** PO create/edit form uses ReviewPanel and validates positive quantities/prices.  
**AC3:** PO status transitions call canonical PATCH status endpoint and display backend-returned status.  
**AC4:** Receipt form pre-fills lines from backend PO detail and allows received quantity/condition notes.  
**AC5:** Receipt creation uses backend response as source of truth and refreshes PO status after success.  
**AC6:** Permission gates enforce `purchasing.orders` and `purchasing.receipts` resources.

## Dependencies

- 69-2-a SHOULD be done for supplier selector reuse.
- 69-2-e MUST be done.
- Story 69-1 MUST be done.

## Validation Commands

```bash
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing-orders-receipts.test.tsx
npm run typecheck -w @jurnapod/backoffice
npm run lint -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
```

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO and Ahmad owner sign-off.
