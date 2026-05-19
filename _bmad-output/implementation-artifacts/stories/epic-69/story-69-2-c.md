# Story 69-2-c: AP Invoices Post/Void + Audit Links

Status: done

## Story

As an **accounts payable user**,  
I want **AP invoice screens with post and void review flows**,  
So that **supplier obligations are reviewed before posting and corrections use auditable void semantics**.

## Context

Canonical invoice endpoints are under `/api/purchasing/invoices`. This story MUST use ReviewPanel for create/post/void flows and MUST refresh backend-returned totals/status/journal references after mutations.

Story 69-2-c implementation MUST NOT begin until Architecture readiness GO, QA kickoff GO, and Ahmad explicit 69-2-c backoffice unfreeze confirmation are recorded. Story 69-2-b is done and signed off.

## Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Invoice list filters by supplier/status/date | Happy | Unit/component |
| Invoice create from PO/receipt uses ReviewPanel | Happy | Component |
| Invoice post shows preview then backend-returned status/journal | Happy | Component/contract |
| Void uses ReviewPanel confirmation and shows before/after diff | Happy | Component |
| Closed period returns `409 PERIOD_CLOSED` and renders non-retryable error | Error | Contract/component |
| CASHIER cannot post/void invoice | Auth | Integration/contract |

**Sign-off:** Architecture readiness GO, QA kickoff GO, Ahmad explicit 69-2-c backoffice unfreeze confirmation, implementation review GO, and Ahmad owner sign-off recorded on 2026-05-19.

## Readiness Sign-Offs

- Architecture: Winston GO — Story corrections align with verified invoice contracts, partial post/void responses, `409 PERIOD_CLOSED`, filter hardening requirements, and audit-link constraints; no remaining P0/P1/P2/P3 architecture findings.
- QA kickoff: Quinn GO — Required API filter hardening, CASHIER post/void denial, partial response refetch, `409 PERIOD_CLOSED`, audit-link absence, permission gates, and PID/log validation requirements are specified; no remaining P0/P1 QA kickoff findings.
- Implementation review: GO — Consolidated post-implementation review found no remaining P0/P1/P2/P3 findings after P2/P3 corrections for allocation reference visibility, row action fetch error surfacing, and stale API permission documentation.
- Owner sign-off: Ahmad signed off on 2026-05-19.

## Cross-Module Error Boundary Verification

HTTP boundary errors MUST be mapped by status and response `code`; frontend MUST NOT rely on `instanceof` for backend domain errors.

## Cross-Module Decision Gate

| # | Decision | Winston Sign-Off |
|---|----------|-----------------|
| 1 | Frontend MAY preview tax/subtotal; backend purchasing/accounting services remain authoritative for taxes, totals, period-close outcomes, and journal effects. | Winston GO — UI MUST refresh and display backend-returned totals after create/post actions. |
| 2 | Void flow MUST use backend void endpoint and MUST NOT mutate posted invoice client-side. A distinct persisted `void_reason` is unsupported by current API and MUST NOT be submitted. | Winston GO — Void flow uses partial backend response, detail refetch, and accounting trace references only. |

## API Contract Verification

Runtime base: `/api/purchasing`. Backoffice `apiRequest` calls MUST use relative paths under `/purchasing`.

| Endpoint | Method | ACL | Request | Response | Verified | Notes |
|----------|--------|-----|---------|----------|----------|-------|
| `/api/purchasing/invoices` | GET | `purchasing.invoices.READ` | Query: `supplier_id`, `status`, `date_from`, `date_to`, `limit`, `offset` | `200 { success: true, data: { invoices, total, limit, offset } }` | Yes with caveat | Current route parses `status` as numeric and dates as UTC ISO. Implementation MUST harden this route to accept status labels `DRAFT`/`POSTED`/`VOID` and `YYYY-MM-DD` dates before exposing status/date filters. |
| `/api/purchasing/invoices` | POST | `purchasing.invoices.CREATE` | Create body below | `201 { success: true, data: invoiceWithLines }` | Yes | Backend totals are authoritative. |
| `/api/purchasing/invoices/:id` | GET | `purchasing.invoices.READ` | Numeric `id` path param | `200 { success: true, data: invoiceWithLines }` | Yes | Required after post/void because mutation responses are partial. |
| `/api/purchasing/invoices/:id/post` | POST | `purchasing.invoices.UPDATE` | Optional `{ override_reason?: string | null }` | `200 { success: true, data: { id, journal_batch_id, warnings } }` | Yes | Response is partial; UI MUST fetch invoice detail after success before displaying final status/totals. |
| `/api/purchasing/invoices/:id/void` | POST | `purchasing.invoices.DELETE` | Optional `{ override_reason?: string | null }`; no supported `void_reason` | `200 { success: true, data: { id, reversal_batch_id } }` | Yes | Response is partial; UI MUST fetch invoice detail after success before displaying final voided state. |

### Invoice create body

```ts
{
  supplier_id: number;
  idempotency_key?: string;
  invoice_no: string;
  invoice_date: "YYYY-MM-DD";
  due_date?: "YYYY-MM-DD" | null;
  reference_number?: string | null;
  currency_code?: string;
  exchange_rate?: string;
  notes?: string | null;
  lines: Array<{
    item_id?: number | null;
    po_line_id?: number | null;
    description: string;
    qty: string;
    unit_price: string;
    tax_rate_id?: number | null;
    line_type?: "ITEM" | "SERVICE" | "FREIGHT" | "TAX" | "DISCOUNT";
  }>;
  override_reason?: string | null;
}
```

### Status values

Invoice statuses exposed to the UI are `DRAFT`, `POSTED`, and `VOID`.

### Error contract

| Error | Mapping |
|-------|---------|
| Invalid input | `400 INVALID_REQUEST` |
| Invalid status transition | `400 INVALID_STATUS_TRANSITION` |
| Missing account setup | `400 ACCOUNT_MISSING` |
| Missing exchange rate | `400 EXCHANGE_RATE_MISSING` |
| Missing tax account | `400 TAX_ACCOUNT_MISSING` |
| Credit limit exceeded | `400 CREDIT_LIMIT_EXCEEDED` |
| Journal imbalance | `400 JOURNAL_NOT_BALANCED` |
| Auth missing | `401 UNAUTHORIZED` |
| Permission | `403 FORBIDDEN` |
| Not found | `404 NOT_FOUND` |
| Closed period | `409 PERIOD_CLOSED` |
| Already posted | `409 ALREADY_POSTED` |
| Already voided | `409 ALREADY_VOIDED` |

### API hardening required before UI filter exposure

Current `GET /api/purchasing/invoices` route does not match shared canonical query schema for status/date filters. Story 69-2-c MUST either:

1. Harden the API route to accept `status=DRAFT|POSTED|VOID` and `date_from/date_to=YYYY-MM-DD`, return `400 INVALID_REQUEST` for invalid filter values, and add API integration coverage; or
2. Remove status/date filters from UI scope and document the API gap.

Because AC1 requires supplier/status/date filters, option 1 is the required path for Story 69-2-c.

### Audit and traceability constraint

Current AP invoice create/detail/post/void responses do not expose an audit identifier. UI MUST NOT fabricate audit deep-links. UI MAY display accounting trace references (`journal_batch_id` and `reversal_batch_id`). A future audit deep-link requires a verified audit-log query contract and `platform.audit.READ` gating using `audit_logs.success`, not `result`.

## Acceptance Criteria

**AC1:** Invoice list/detail screens render status, supplier, totals, and allocation state where backend provides it. List filters MUST support supplier, status, and date only after API filter hardening described above is implemented.
**AC2:** Invoice create uses ReviewPanel and backend-returned totals after save.
**AC3:** Post action requires final review, uses `POST /purchasing/invoices/:id/post`, displays backend-returned `journal_batch_id`/warnings, and fetches invoice detail before showing final `POSTED` status/totals.
**AC4:** Void action requires ReviewPanel confirmation, shows before/after diff, uses `POST /purchasing/invoices/:id/void`, displays backend-returned `reversal_batch_id`, and fetches invoice detail before showing final `VOID` status. A distinct persisted `void_reason` is unsupported and MUST NOT be submitted.
**AC5:** Audit deep-link is displayed only if backend exposes a verified audit identifier or query contract. Current invoice APIs do not expose an audit identifier; implementation MUST document this API gap and MUST NOT fabricate links.
**AC6:** Permission gates enforce `purchasing.invoices` with correct CREATE/UPDATE/DELETE semantics.

## Frontend Architecture Constraints

- API calls MUST use `/purchasing/invoices` through `apiRequest`; frontend code MUST NOT hardcode `/api/...` in `apiRequest` calls.
- Permission gates MUST use:
  - `purchasing.invoices.READ` for list/detail.
  - `purchasing.invoices.CREATE` for invoice create.
  - `purchasing.invoices.UPDATE` for invoice post.
  - `purchasing.invoices.DELETE` for invoice void.
- Create, post, and void flows MUST use `ReviewPanel`.
- Backend totals, status, `journal_batch_id`, `posted_at`, `voided_at`, and user IDs are authoritative.
- Post and void mutation responses are partial. UI MUST call `GET /purchasing/invoices/:id` after post/void success before displaying final status/totals.
- UI MUST NOT client-mutate a posted invoice into posted/voided state as final truth.
- UI MUST NOT submit `void_reason` unless backend support is explicitly added in this story with persistence, validation, and tests.
- UI MAY display `journal_batch_id` and `reversal_batch_id` as accounting trace references.
- UI MUST NOT display audit deep-links without a verified audit identifier or audit-log query contract.

## Dependencies

- 69-2-b MUST be done for PO/receipt selectors — verified done and signed off.
- 69-2-e MUST be done — verified done and signed off.

## Testing and Fixture Requirements

- Integration and contract tests MUST use Full Fixture Mode / API production flow for invoice setup.
- Tests MAY reuse `apps/api/__test__/helpers/purchasing-flows.ts:createPostedPurchaseInvoice` where applicable.
- Tests MUST NOT use raw SQL `INSERT`/`UPDATE` for setup. Raw SQL remains allowed only for teardown, read-only verification, and schema introspection.
- Negative authorization tests MUST use `CASHIER` or a custom low-privilege role; OWNER/SUPER_ADMIN MUST NOT be used for expected 403 paths.
- Required API coverage MUST include CASHIER denial for:
  - `POST /api/purchasing/invoices/:id/post`
  - `POST /api/purchasing/invoices/:id/void`
- Required API coverage MUST include invoice list filter hardening for `status=DRAFT|POSTED|VOID` and `date_from/date_to=YYYY-MM-DD` if AC1 status/date filters remain exposed.
- Required backoffice coverage MUST include ReviewPanel create/post/void flows, partial post/void response followed by detail refetch, `409 PERIOD_CLOSED` rendering, permission gates for CREATE/UPDATE/DELETE, no client-side final mutation of posted/voided status, and audit-link absence when no audit identifier exists.
- Long-running validations MUST use background PID/log tracking under `logs/`.

## Validation Commands

```bash
nohup npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing-invoices.test.tsx > logs/story-69-2-c-backoffice-test.log 2>&1 & echo $! > logs/story-69-2-c-backoffice-test.pid
while kill -0 $(cat logs/story-69-2-c-backoffice-test.pid) 2>/dev/null; do sleep 5; done
nohup npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/purchase-invoices.test.ts > logs/story-69-2-c-api-invoices-test.log 2>&1 & echo $! > logs/story-69-2-c-api-invoices-test.pid
while kill -0 $(cat logs/story-69-2-c-api-invoices-test.pid) 2>/dev/null; do sleep 5; done
npm run typecheck -w @jurnapod/backoffice
npm run lint -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
```

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO and Ahmad owner sign-off.
