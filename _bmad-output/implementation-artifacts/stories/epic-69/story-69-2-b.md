# Story 69-2-b: Purchase Orders + Goods Receipts

Status: done

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
| Non-positive quantity/price rejected before submit | Error | Unit |
| 403 for CASHIER on create/status change | Auth | Integration/contract |
| Stale PO update/refetch behavior | Edge | Component/contract — backend has no optimistic `409` stale-update contract; UI MUST refetch and display current backend state after `400 INVALID_REQUEST`, `404 NOT_FOUND`, or permission failures. |

**Sign-off:** Architecture readiness GO, QA kickoff GO, reviewer GO, and Ahmad owner sign-off recorded on 2026-05-19. Ahmad confirmed the Story 69-2-b implementation unfreeze for backoffice on 2026-05-19.

## Readiness Sign-Offs

- Architecture: Winston GO — Story corrections align with verified `/api/purchasing/orders` and `/api/purchasing/receipts` contracts; no remaining P0/P1/P2/P3 architecture findings.
- QA kickoff: Quinn GO — Receipt date-filter constraint, non-positive quantity/price rejection, CASHIER status-change denial, PID/log validation commands, and duplicate receipt replay handling are specified; no remaining P0/P1/P2/P3 QA findings.

## Cross-Module Error Boundary Verification

Consumer MUST map API status and `code` values. `instanceof` is N/A across HTTP boundaries.

| Error | Mapping |
|-------|---------|
| Validation | `400 INVALID_REQUEST` |
| Auth missing | `401 UNAUTHORIZED` |
| Permission | `403 FORBIDDEN` |
| Not found | `404 NOT_FOUND` |
| Duplicate PO | `409 CONFLICT` |
| Duplicate receipt reference | `201` idempotent replay when an existing record resolves; otherwise `409 DUPLICATE_REFERENCE` |
| Stale/non-DRAFT edit | `400 INVALID_REQUEST` followed by UI refetch |

## Cross-Module Decision Gate

| # | Decision | Winston Sign-Off |
|---|----------|-----------------|
| 1 | PO-to-receipt pre-fill MUST use `GET /api/purchasing/orders/:id` as source; frontend MAY map returned PO lines into receipt draft state and MUST NOT recompute supplier ownership, received quantities, inventory effects, or accounting effects. | Winston GO — Use GET `/api/purchasing/orders/:id` as the only source for receipt line pre-fill. Backend receipt creation remains authoritative. |
| 2 | PO status changes MUST use backend canonical `PATCH /api/purchasing/orders/:id/status` with backend status values. | Winston GO — Status changes MUST use `PATCH /api/purchasing/orders/:id/status` with `{ status }` and backend statuses `DRAFT`, `SENT`, `PARTIAL_RECEIVED`, `RECEIVED`, `CLOSED`. |

## API Contract Verification

Runtime base: `/api/purchasing`. Backoffice `apiRequest` calls MUST use relative paths under `/purchasing`.

| Endpoint | Method | Request | Response | Verified | Notes |
|----------|--------|---------|----------|----------|-------|
| `/api/purchasing/orders` | GET | Query: `supplier_id`, `status`, `date_from`, `date_to`, `limit`, `offset` | `{ success: true, data: { orders, total, limit, offset } }` | Yes | `status` MUST use backend labels. |
| `/api/purchasing/orders` | POST | PO create body below | `201 { success: true, data: orderWithLines }` | Yes | Creates `DRAFT` PO. |
| `/api/purchasing/orders/:id` | GET | Numeric `id` path param | `{ success: true, data: orderWithLines }` | Yes | Required source for receipt pre-fill. |
| `/api/purchasing/orders/:id` | PATCH | PO edit body below | `{ success: true, data: orderWithLines }` | Yes | Backend allows edit only while status is `DRAFT`; non-DRAFT returns `400 INVALID_REQUEST`. |
| `/api/purchasing/orders/:id/status` | PATCH | `{ status }` | `{ success: true, data: orderWithLines }` | Yes | Uses `purchasing.orders.UPDATE`. |
| `/api/purchasing/receipts` | GET | Query: `supplier_id`, `limit`, `offset` | `{ success: true, data: { receipts, total, limit, offset } }` | Yes | Collection key is `receipts`. Receipt `date_from`/`date_to` filters are contract-mismatched in the current route and MUST NOT be exposed or sent by this story unless API date-filter hardening is implemented first. |
| `/api/purchasing/receipts` | POST | Receipt create body below | `201 { success: true, data: receiptWithLines }` | Yes | Backend authoritative; response MAY include `warnings`. |
| `/api/purchasing/receipts/:id` | GET | Numeric `id` path param | `{ success: true, data: receiptWithLines }` | Yes | Detail drawer. |

### PO create body

```ts
{
  supplier_id: number;
  idempotency_key?: string;
  order_date: "YYYY-MM-DD";
  currency_code?: string; // default IDR
  expected_date?: "YYYY-MM-DD" | null;
  notes?: string | null;
  lines: Array<{
    item_id?: number | null;
    description?: string | null;
    qty: string;
    unit_price: string;
    tax_rate?: string;
  }>;
}
```

### PO edit body

```ts
{
  expected_date?: "YYYY-MM-DD" | null;
  notes?: string | null;
  lines?: Array<{
    item_id?: number | null;
    description?: string | null;
    qty: string;
    unit_price: string;
    tax_rate?: string;
  }>;
}
```

### PO status body and transitions

```ts
{ status: "DRAFT" | "SENT" | "PARTIAL_RECEIVED" | "RECEIVED" | "CLOSED" }
```

Valid transitions:

- `DRAFT -> SENT | CLOSED`
- `SENT -> PARTIAL_RECEIVED | RECEIVED | CLOSED`
- `PARTIAL_RECEIVED -> RECEIVED | CLOSED`
- `RECEIVED -> CLOSED`
- `CLOSED -> none`

`SENT -> RECEIVED` and `PARTIAL_RECEIVED -> RECEIVED` require all PO lines to have received quantity greater than or equal to ordered quantity.

### Receipt create body

```ts
{
  supplier_id: number;
  idempotency_key?: string;
  reference_number: string;
  receipt_date: "YYYY-MM-DD";
  notes?: string | null;
  lines: Array<{
    po_line_id?: number | null;
    item_id?: number | null;
    description?: string | null;
    qty: string;
    unit?: string | null;
  }>;
}
```

Receipt rules:

- Each receipt line MUST include `po_line_id` or `item_id`.
- PO-linked receipt lines MUST reference a PO in `SENT` or `PARTIAL_RECEIVED` status.
- PO-linked receipt supplier MUST match the PO supplier.
- Over-receipt is allowed by current backend behavior. UI MUST surface backend `warnings` and line-level `over_receipt_allowed=true`.
- Goods receipt status returns `RECEIVED`.

### Receipt list date-filter constraint

Current `GET /api/purchasing/receipts` route parses `date_from`/`date_to` with `UtcIsoSchema`, while the shared `GoodsReceiptListQuerySchema` documents `YYYY-MM-DD`. The 69-2-b UI MUST NOT expose or send receipt date filters unless this story first hardens the API route to accept the canonical `YYYY-MM-DD` date-only contract, returns `400 INVALID_REQUEST` for invalid date filters instead of `500`, and adds an API integration regression test for receipt date filtering.

## Acceptance Criteria

**AC1:** PO list supports supplier, status, and date filters using canonical backend statuses.  
**AC2:** PO create/edit form uses ReviewPanel and validates positive quantities/prices. PO quantity and unit price MUST reject blank, negative, and zero values at the UI boundary before submit. PO edit actions MUST be available only for `DRAFT` POs; backend `400 INVALID_REQUEST` for non-DRAFT edit MUST trigger refetch and current-state display.
**AC3:** PO status transitions call canonical PATCH status endpoint and display backend-returned status.  
**AC4:** Receipt form pre-fills lines from backend PO detail and allows received quantity, optional unit, optional line description, and receipt-level notes. `condition_notes` is unsupported and MUST NOT be submitted as an independent field.
**AC5:** Receipt creation uses backend response as source of truth and refreshes PO status after success. Receipt quantity MUST reject blank, negative, and zero values at the UI boundary before submit. Receipt against PO line MUST require backend PO status `SENT` or `PARTIAL_RECEIVED`; over-receipt warnings MUST be surfaced without blocking successful backend creation.
**AC6:** Permission gates enforce `purchasing.orders` and `purchasing.receipts` resources.

## Frontend Architecture Constraints

- Route/nav paths MUST be `/purchasing/orders` and `/purchasing/receipts` under the existing Purchasing nav group.
- API calls MUST use `/purchasing/orders` and `/purchasing/receipts` through `apiRequest`; frontend code MUST NOT hardcode `/api/...` in `apiRequest` calls.
- Permission gates MUST use:
  - `purchasing.orders.READ` for order list/detail.
  - `purchasing.orders.CREATE` for PO create.
  - `purchasing.orders.UPDATE` for PO edit and status transition.
  - `purchasing.receipts.READ` for receipt list/detail.
  - `purchasing.receipts.CREATE` for receipt create.
- PO create/edit and receipt create MUST use `ReviewPanel`.
- Receipt prefill MUST use `GET /purchasing/orders/:id`; frontend MUST NOT recompute backend-authoritative supplier ownership, received quantities, PO status, inventory effects, accounting effects, or final totals as source of truth.
- Query invalidation MUST refresh PO list/detail after PO create/edit/status and after receipt create. Receipt list/detail MUST refresh after receipt create. Affected PO detail MUST refetch after receipt create because backend auto-updates PO status and `received_qty`.
- Backend has no version, ETag, revision token, stale write detection, or `409` optimistic concurrency response. UI MUST model stale behavior as refetch/current-state display after `400 INVALID_REQUEST`, `404 NOT_FOUND`, or permission failures.
- Duplicate receipt reference handling MUST treat a backend `201` replay as backend-authoritative returned state, not as proof that a fresh receipt was created by the latest submit.

## Dependencies

- 69-2-a MUST be done for supplier selector reuse.
- 69-2-e MUST be done.
- Story 69-1 MUST be done.

## Testing and Fixture Requirements

- Integration and contract tests MUST use Full Fixture Mode / API production flow for PO and receipt setup.
- Tests SHOULD reuse `apps/api/__test__/helpers/purchasing-flows.ts:createSentPurchaseOrder` for sent PO setup.
- Tests MUST NOT use raw SQL `INSERT`/`UPDATE` for setup. Raw SQL remains allowed only for teardown, read-only verification, and schema introspection.
- Negative authorization tests MUST use `CASHIER` or a custom low-privilege role; OWNER/SUPER_ADMIN MUST NOT be used for expected 403 paths.
- Required coverage MUST include CASHIER denial for PO create, PO status change, and receipt create.
- Required coverage MUST include PO quantity/unit-price validation for blank, negative, zero, and valid decimal values.
- Required coverage MUST include receipt quantity validation for blank, negative, zero, and valid decimal values.
- Required coverage MUST include DRAFT-only edit behavior, receipt prefill from backend PO detail, receipt POST validation for missing `po_line_id`/`item_id`, over-receipt warning display, and duplicate receipt reference/idempotent replay mapping.
- Required API coverage MUST include CASHIER denial for `PATCH /api/purchasing/orders/:id/status`.
- Receipt date-filter coverage MUST be added only if implementation hardens `GET /api/purchasing/receipts` date filtering to the canonical `YYYY-MM-DD` contract in this story.
- Long-running validations MUST use background PID/log tracking under `logs/`.

## Validation Commands

```bash
nohup npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing-orders-receipts.test.tsx > logs/story-69-2-b-backoffice-test.log 2>&1 & echo $! > logs/story-69-2-b-backoffice-test.pid
while kill -0 $(cat logs/story-69-2-b-backoffice-test.pid) 2>/dev/null; do sleep 5; done
nohup npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/purchase-orders.test.ts > logs/story-69-2-b-api-orders-test.log 2>&1 & echo $! > logs/story-69-2-b-api-orders-test.pid
while kill -0 $(cat logs/story-69-2-b-api-orders-test.pid) 2>/dev/null; do sleep 5; done
nohup npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/goods-receipts.test.ts > logs/story-69-2-b-api-receipts-test.log 2>&1 & echo $! > logs/story-69-2-b-api-receipts-test.pid
while kill -0 $(cat logs/story-69-2-b-api-receipts-test.pid) 2>/dev/null; do sleep 5; done
npm run typecheck -w @jurnapod/backoffice
npm run lint -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
```

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO and Ahmad owner sign-off.
