# Story 69-2-c: AP Invoices Post/Void + Audit Links

Status: backlog

## Story

As an **accounts payable user**,  
I want **AP invoice screens with post and void review flows**,  
So that **supplier obligations are reviewed before posting and corrections use auditable void semantics**.

## Context

Canonical invoice endpoints are under `/api/purchasing/invoices`. This story MUST use ReviewPanel for create/post/void flows and MUST refresh backend-returned totals/status/journal references after mutations.

## Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Invoice list filters by supplier/status/date | Happy | Unit/component |
| Invoice create from PO/receipt uses ReviewPanel | Happy | Component |
| Invoice post shows preview then backend-returned status/journal | Happy | Component/contract |
| Void requires reason and shows before/after diff | Happy | Component |
| Closed period returns 422 and renders non-retryable error | Error | Contract/component |
| CASHIER cannot post/void invoice | Auth | Integration/contract |

**Sign-off:** QA kickoff sign-off required before implementation begins.

## Cross-Module Error Boundary Verification

HTTP boundary errors MUST be mapped by status and response `code`; frontend MUST NOT rely on `instanceof` for backend domain errors.

## Cross-Module Decision Gate

| # | Decision | Winston Sign-Off |
|---|----------|-----------------|
| 1 | Frontend MAY preview tax/subtotal; backend purchasing/accounting services remain authoritative for taxes, totals, period-close outcomes, and journal effects. | Winston GO — UI MUST refresh and display backend-returned totals after create/post actions. |
| 2 | Void flow MUST use backend void endpoint and MUST NOT mutate posted invoice client-side. | Pending contract verification |

## API Contract Verification

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/purchasing/invoices` | GET | `{ success: true, data: { invoices, total, limit, offset } }` | TBD | Exact collection key MUST be verified |
| `/api/purchasing/invoices` | POST | Created draft invoice envelope | TBD | Body shape MUST be verified |
| `/api/purchasing/invoices/:id` | GET | Invoice detail envelope | TBD | Includes lines/allocation status if available |
| `/api/purchasing/invoices/:id/post` | POST | Posted invoice envelope with journal reference if available | TBD | Verify exact `journal_id`/link field |
| `/api/purchasing/invoices/:id/void` | POST | Voided invoice envelope | TBD | Verify reason body field and audit link availability |

## Acceptance Criteria

**AC1:** Invoice list/detail screens render status, supplier, totals, and allocation state where backend provides it.  
**AC2:** Invoice create uses ReviewPanel and backend-returned totals after save.  
**AC3:** Post action requires final review and displays backend-returned posted status and journal reference.  
**AC4:** Void action requires reason, shows before/after diff, and displays backend-returned voided state.  
**AC5:** Audit deep-link is displayed if backend response exposes an audit identifier; otherwise API gap is documented.  
**AC6:** Permission gates enforce `purchasing.invoices` with correct CREATE/UPDATE/DELETE semantics.

## Dependencies

- 69-2-b SHOULD be done for PO/receipt selectors.
- 69-2-e MUST be done.

## Validation Commands

```bash
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing-invoices.test.tsx
npm run typecheck -w @jurnapod/backoffice
npm run lint -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
```

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO and Ahmad owner sign-off.
