# Story 69-2-d: AP Payments + Supplier Credits

Status: in-progress

## Story

As an **accounts payable user**,  
I want **AP payment and supplier credit workflows**,  
So that **open invoices can be paid, allocated, credited, and voided with financial review and auditability**.

## Context

Canonical endpoints are `/api/purchasing/payments` and `/api/purchasing/credits`. Backend services remain authoritative for open amounts, overpayment detection, allocation state, journal creation, and period-close validation.

Story 69-2-d implementation MUST NOT begin until Architecture readiness GO, QA kickoff GO, and Ahmad explicit 69-2-d backoffice unfreeze confirmation are recorded. Story 69-2-c is done and signed off.

## Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Payment list/detail renders allocations | Happy | Unit/component |
| Payment create allocates across multiple invoices | Happy | Component/contract |
| Payment post refreshes invoice open amounts | Happy | Component/contract |
| Payment void uses ReviewPanel confirmation and diff; no `void_reason` is submitted | Happy | Component |
| Credit create/apply reduces invoice balance | Happy | Component/contract |
| Credit/payment over-allocation blocked by backend response | Error | Contract/component |
| CASHIER cannot create/post/void payments or credits | Auth | Integration/contract |

**Sign-off:** Architecture readiness GO, QA kickoff GO, Ahmad explicit 69-2-d backoffice unfreeze confirmation, implementation review GO, and Ahmad owner sign-off recorded on 2026-05-19.

## Readiness Sign-Offs

- Architecture: Winston GO — re-check on 2026-05-19 found prior architecture blockers resolved; API void ACL correction and filter hardening remain scoped implementation requirements, not readiness blockers.
- QA kickoff: Quinn GO — re-check on 2026-05-19 found prior QA blockers resolved; API void ACL correction remains an implementation requirement, not a kickoff blocker.
- Backoffice unfreeze: Ahmad explicitly confirmed Story 69-2-d backoffice unfreeze on 2026-05-19.
- Implementation review: QA validation GO — final re-review on 2026-05-19 found prior P1 ACL separation blocker resolved; no P0/P1/P2/P3 findings remain in review scope.

## Cross-Module Error Boundary Verification

HTTP boundary errors MUST be mapped by status and response `code`; frontend MUST NOT rely on `instanceof` for backend domain errors.

## Cross-Module Decision Gate

| # | Decision | Winston Sign-Off |
|---|----------|-----------------|
| 1 | Use single-page ReviewPanel allocation flow rather than a wizard. | Winston GO — Allocation draft state MAY remain local until final confirmation; backend services remain authoritative for open amounts, overpayment detection, journal creation, and period-close validation. |
| 2 | Payment post/void and credit apply/void responses are partial; UI MUST refetch payment/credit detail and affected invoice/open-amount sources after success before displaying final balances. | Pending re-check |
| 3 | Current payment/credit void APIs do not support persisted `void_reason`; UI MUST NOT submit `void_reason`. UI MAY send `override_reason` only for period-close override flow. | Pending re-check |
| 4 | Payment/credit void endpoints currently use `UPDATE`; implementation MUST correct API void ACL to `DELETE` for `purchasing.payments` and `purchasing.credits` before exposing UI void actions, because void is financial soft-delete. | Pending re-check |

## API Contract Verification

Runtime base: `/api/purchasing`. Backoffice `apiRequest` calls MUST use relative paths under `/purchasing`.

### Payment endpoints

| Endpoint | Method | ACL | Request | Response | Verified | Notes |
|----------|--------|-----|---------|----------|----------|-------|
| `/api/purchasing/payments` | GET | `purchasing.payments.READ` | Query: `supplier_id`, `status`, `date_from`, `date_to`, `limit`, `offset` | `200 { success: true, data: { payments, total, limit, offset } }` | Yes with caveat | Implementation MUST harden invalid filter values to `400 INVALID_REQUEST` before UI exposes status/date filters. |
| `/api/purchasing/payments` | POST | `purchasing.payments.CREATE` | Payment create body below | `201 { success: true, data: paymentWithLines }` | Yes | Backend allocation and open amount validation are authoritative. |
| `/api/purchasing/payments/:id` | GET | `purchasing.payments.READ` | Numeric `id` path param | `200 { success: true, data: paymentWithLines }` | Yes | Required after post/void because mutation responses are partial. |
| `/api/purchasing/payments/:id/post` | POST | `purchasing.payments.UPDATE` | Optional `{ override_reason?: string | null }` | `200 { success: true, data: { id, journal_batch_id } }` | Yes | Response is partial; UI MUST fetch payment detail and affected invoice/open-amount sources after success. |
| `/api/purchasing/payments/:id/void` | POST | `purchasing.payments.DELETE` after API correction | Optional `{ override_reason?: string | null }`; no supported `void_reason` | `200 { success: true, data: { id, reversal_batch_id } }` | API correction required | Current route uses `UPDATE`; implementation MUST correct to `DELETE` and add focused auth coverage. |

### Credit endpoints

| Endpoint | Method | ACL | Request | Response | Verified | Notes |
|----------|--------|-----|---------|----------|----------|-------|
| `/api/purchasing/credits` | GET | `purchasing.credits.READ` | Query: `supplier_id`, `status`, `date_from`, `date_to`, `limit`, `offset` | `200 { success: true, data: { credits, total, limit, offset } }` | Yes with caveat | Implementation MUST harden invalid filter values to `400 INVALID_REQUEST` before UI exposes status/date filters. |
| `/api/purchasing/credits` | POST | `purchasing.credits.CREATE` | Credit create body below | `201 { success: true, data: creditWithLinesAndApplications }` | Yes | Backend credit amount and invoice applicability are authoritative. |
| `/api/purchasing/credits/:id` | GET | `purchasing.credits.READ` | Numeric `id` path param | `200 { success: true, data: creditWithLinesAndApplications }` | Yes | Required after apply/void because mutation responses are partial. |
| `/api/purchasing/credits/:id/apply` | POST | `purchasing.credits.UPDATE` | Optional `{ override_reason?: string | null }` | `200 { success: true, data: { id, journal_batch_id, applied_amount, remaining_amount, status } }` | Yes | Response is partial for affected invoice balances; UI MUST fetch credit detail and affected invoice/open-amount sources after success. |
| `/api/purchasing/credits/:id/void` | POST | `purchasing.credits.DELETE` after API correction | Optional `{ override_reason?: string | null }`; no supported `void_reason` | `200 { success: true, data: { id, reversal_batch_id } }`; `reversal_batch_id` MAY be null | API correction required | Current route uses `UPDATE`; implementation MUST correct to `DELETE` and add focused auth coverage. |

### Payment create body

```ts
{
  idempotency_key?: string;
  payment_date: "YYYY-MM-DD";
  bank_account_id: number;
  supplier_id: number;
  description?: string | null;
  lines: Array<{
    purchase_invoice_id: number;
    allocation_amount: string;
    description?: string | null;
    full_settlement?: boolean;
  }>;
  override_reason?: string | null;
}
```

### Credit create body

```ts
{
  supplier_id: number;
  idempotency_key?: string;
  credit_no: string;
  credit_date: "YYYY-MM-DD";
  description?: string | null;
  lines: Array<{
    purchase_invoice_id?: number | null;
    purchase_invoice_line_id?: number | null;
    item_id?: number | null;
    description?: string | null;
    qty: string;
    unit_price: string;
    reason?: string | null;
  }>;
  override_reason?: string | null;
}
```

### Status values

Payment statuses exposed to the UI are `DRAFT`, `POSTED`, and `VOID`.

Credit statuses exposed to the UI are `DRAFT`, `PARTIAL`, `APPLIED`, and `VOID`.

### Error contract

| Error | Mapping |
|-------|---------|
| Invalid input | `400 INVALID_REQUEST` |
| Invalid status transition | `400 INVALID_STATUS_TRANSITION` |
| Payment overpayment | `400 OVERPAYMENT` |
| Invoice not posted | `400 INVOICE_NOT_POSTED` |
| Invoice supplier mismatch | `400 INVOICE_SUPPLIER_MISMATCH` |
| Supplier inactive | `400 SUPPLIER_INACTIVE` |
| Missing AP account | `400 AP_ACCOUNT_NOT_CONFIGURED` |
| Invalid AP account type | `400 AP_ACCOUNT_INVALID_TYPE` |
| Missing expense account | `400 EXPENSE_ACCOUNT_NOT_CONFIGURED` |
| Invalid expense account type | `400 EXPENSE_ACCOUNT_INVALID_TYPE` |
| No applicable invoice for credit | `400 NO_APPLICABLE_INVOICE` |
| Journal imbalance | `400 JOURNAL_NOT_BALANCED` |
| Missing bank account | `400 BANK_ACCOUNT_NOT_FOUND` |
| Auth missing | `401 UNAUTHORIZED` |
| Permission | `403 FORBIDDEN` |
| Not found | `404 NOT_FOUND` |
| Closed period | `409 PERIOD_CLOSED` |

### API hardening required before UI filter exposure

Current payment and credit list routes require implementation hardening before exposing status/date filters in the UI:

1. `GET /api/purchasing/payments` MUST accept `status=DRAFT|POSTED|VOID` and `date_from/date_to=YYYY-MM-DD`.
2. `GET /api/purchasing/credits` MUST accept `status=DRAFT|PARTIAL|APPLIED|VOID` and `date_from/date_to=YYYY-MM-DD`.
3. Invalid `supplier_id`, `status`, `date_from`, `date_to`, `limit`, and `offset` values MUST return `400 INVALID_REQUEST`.
4. Focused API integration coverage MUST verify valid and invalid filter behavior for both list routes.

### Audit and traceability constraint

Current AP payment and purchase credit APIs expose journal/reversal batch identifiers, not verified audit identifiers. UI MUST NOT fabricate audit deep-links. UI MAY display `journal_batch_id` and `reversal_batch_id` as accounting trace references.

## Acceptance Criteria

**AC1:** Payment screens list/create/detail payment and allocation state.
**AC2:** Payment post uses ReviewPanel, calls `POST /purchasing/payments/:id/post`, displays `journal_batch_id`, and refetches payment detail plus affected invoice/open-amount sources before showing final balances.
**AC3:** Payment void uses ReviewPanel confirmation, calls `POST /purchasing/payments/:id/void`, displays `reversal_batch_id`, refetches payment detail plus affected invoice/open-amount sources, and MUST NOT submit `void_reason`.
**AC4:** Credit screens create/apply credits to open invoices, display `journal_batch_id`, and refetch credit detail plus affected invoice/open-amount sources after apply.
**AC5:** Credit void uses ReviewPanel confirmation, calls `POST /purchasing/credits/:id/void`, displays backend `reversal_batch_id` when present, refetches credit detail plus affected invoice/open-amount sources, and MUST NOT submit `void_reason`.
**AC6:** Permission gates enforce `purchasing.payments` and `purchasing.credits`: READ for list/detail, CREATE for create, UPDATE for payment post and credit apply, DELETE for payment void and credit void after API ACL correction.

## Dependencies

- 69-2-c MUST be done for invoice list/detail/open amount flows.
- 69-2-e MUST be done.

## Frontend Architecture Constraints

- API calls MUST use `/purchasing/payments` and `/purchasing/credits` through `apiRequest`; frontend code MUST NOT hardcode `/api/...` in `apiRequest` calls.
- Payment and credit create/post/apply/void flows MUST use `ReviewPanel`.
- Backend allocation state, open amounts, statuses, `journal_batch_id`, `reversal_batch_id`, `posted_at`, `voided_at`, and user IDs are authoritative.
- Post/apply/void mutation responses are partial. UI MUST refetch relevant detail and affected invoice/open-amount sources after success before displaying final balances.
- UI MUST NOT client-mutate payment, credit, or invoice balances as final truth.
- UI MUST NOT submit `void_reason` unless backend support is explicitly added with persistence, validation, and tests.
- UI MAY send `override_reason` only for period-close override flow.
- UI MAY display `journal_batch_id` and `reversal_batch_id` as accounting trace references.
- UI MUST NOT display audit deep-links without a verified audit identifier or audit-log query contract.

## Testing and Fixture Requirements

- Integration and contract tests MUST use Full Fixture Mode / API production flow for payment, credit, invoice, supplier, bank account, and account setup.
- Tests MAY reuse `apps/api/__test__/helpers/purchasing-flows.ts:createPostedPurchaseInvoice` where applicable.
- Tests MUST NOT use raw SQL `INSERT`/`UPDATE` for setup. Raw SQL remains allowed only for teardown, read-only verification, and schema introspection.
- Negative authorization tests MUST use `CASHIER` or a custom low-privilege role; OWNER/SUPER_ADMIN MUST NOT be used for expected 403 paths.
- Required API coverage MUST include CASHIER denial for:
  - `POST /api/purchasing/payments`
  - `POST /api/purchasing/payments/:id/post`
  - `POST /api/purchasing/payments/:id/void`
  - `POST /api/purchasing/credits`
  - `POST /api/purchasing/credits/:id/apply`
  - `POST /api/purchasing/credits/:id/void`
- Required API coverage MUST include payment list filter hardening for valid and invalid `supplier_id`, `status`, `date_from`, `date_to`, `limit`, and `offset` values.
- Required API coverage MUST include credit list filter hardening for valid and invalid `supplier_id`, `status`, `date_from`, `date_to`, `limit`, and `offset` values.
- Required API coverage MUST include payment `400 OVERPAYMENT` and credit `400 NO_APPLICABLE_INVOICE` or partial-apply behavior, aligned to backend behavior.
- Required backoffice coverage MUST include API helper contracts, form validation, ReviewPanel rendering, partial response refetch behavior, permission gates, duplicate submit locks, list filters, `409 PERIOD_CLOSED` rendering by status/code, and audit-link absence when no audit identifier exists.
- Long-running validations MUST use background PID/log tracking under `logs/`.

## Validation Commands

```bash
nohup npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing-payments-credits.test.tsx > logs/story-69-2-d-backoffice-test.log 2>&1 & echo $! > logs/story-69-2-d-backoffice-test.pid
while kill -0 $(cat logs/story-69-2-d-backoffice-test.pid) 2>/dev/null; do sleep 5; done
nohup npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/ap-payments.test.ts > logs/story-69-2-d-api-payments-test.log 2>&1 & echo $! > logs/story-69-2-d-api-payments-test.pid
while kill -0 $(cat logs/story-69-2-d-api-payments-test.pid) 2>/dev/null; do sleep 5; done
nohup npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/purchase-credits.test.ts > logs/story-69-2-d-api-credits-test.log 2>&1 & echo $! > logs/story-69-2-d-api-credits-test.pid
while kill -0 $(cat logs/story-69-2-d-api-credits-test.pid) 2>/dev/null; do sleep 5; done
nohup npm run typecheck -w @jurnapod/backoffice > logs/story-69-2-d-typecheck-backoffice.log 2>&1 & echo $! > logs/story-69-2-d-typecheck-backoffice.pid
while kill -0 $(cat logs/story-69-2-d-typecheck-backoffice.pid) 2>/dev/null; do sleep 5; done
nohup npm run lint -w @jurnapod/backoffice > logs/story-69-2-d-lint-backoffice.log 2>&1 & echo $! > logs/story-69-2-d-lint-backoffice.pid
while kill -0 $(cat logs/story-69-2-d-lint-backoffice.pid) 2>/dev/null; do sleep 5; done
nohup npm run build -w @jurnapod/backoffice > logs/story-69-2-d-build-backoffice.log 2>&1 & echo $! > logs/story-69-2-d-build-backoffice.pid
while kill -0 $(cat logs/story-69-2-d-build-backoffice.pid) 2>/dev/null; do sleep 5; done
```

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO and Ahmad owner sign-off.
