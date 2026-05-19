# Story 69-2-d: AP Payments + Supplier Credits

Status: backlog

## Story

As an **accounts payable user**,  
I want **AP payment and supplier credit workflows**,  
So that **open invoices can be paid, allocated, credited, and voided with financial review and auditability**.

## Context

Canonical endpoints are `/api/purchasing/payments` and `/api/purchasing/credits`. Backend services remain authoritative for open amounts, overpayment detection, allocation state, journal creation, and period-close validation.

## Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Payment list/detail renders allocations | Happy | Unit/component |
| Payment create allocates across multiple invoices | Happy | Component/contract |
| Payment post refreshes invoice open amounts | Happy | Component/contract |
| Payment void requires reason and diff | Happy | Component |
| Credit create/apply reduces invoice balance | Happy | Component/contract |
| Credit/payment over-allocation blocked by backend response | Error | Contract/component |
| CASHIER cannot create/post/void payments or credits | Auth | Integration/contract |

**Sign-off:** QA kickoff sign-off required before implementation begins.

## Cross-Module Error Boundary Verification

HTTP boundary errors MUST be mapped by status and response `code`; frontend MUST NOT rely on `instanceof` for backend domain errors.

## Cross-Module Decision Gate

| # | Decision | Winston Sign-Off |
|---|----------|-----------------|
| 1 | Use single-page ReviewPanel allocation flow rather than a wizard. | Winston GO — Allocation draft state MAY remain local until final confirmation; backend services remain authoritative for open amounts, overpayment detection, journal creation, and period-close validation. |
| 2 | Credit apply/void MUST use backend authoritative response and MUST refresh affected invoice balances. | Pending contract verification |

## API Contract Verification

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/purchasing/payments` | GET | `{ success: true, data: { payments, total, limit, offset } }` | TBD | Exact collection key MUST be verified |
| `/api/purchasing/payments` | POST | Created payment envelope with allocations | TBD | Body shape MUST be verified |
| `/api/purchasing/payments/:id` | GET | Payment detail envelope | TBD | Allocation details |
| `/api/purchasing/payments/:id/post` | POST | Posted payment envelope | TBD | Journal/audit refs MUST be verified |
| `/api/purchasing/payments/:id/void` | POST | Voided payment envelope | TBD | Reason body field MUST be verified |
| `/api/purchasing/credits` | GET | `{ success: true, data: { credits, total, limit, offset } }` | TBD | Exact collection key MUST be verified |
| `/api/purchasing/credits` | POST | Created credit envelope | TBD | Body shape MUST be verified |
| `/api/purchasing/credits/:id` | GET | Credit detail envelope | TBD | Details/applications |
| `/api/purchasing/credits/:id/apply` | POST | Applied credit envelope | TBD | Invoice balance refresh required |
| `/api/purchasing/credits/:id/void` | POST | Voided credit envelope | TBD | Reason body field MUST be verified |

## Acceptance Criteria

**AC1:** Payment screens list/create/detail payment and allocation state.  
**AC2:** Payment post uses ReviewPanel and refreshes backend-returned invoice balances/open amounts.  
**AC3:** Payment void requires reason and uses backend void endpoint.  
**AC4:** Credit screens create/apply credits to open invoices and refresh affected balances.  
**AC5:** Credit void requires reason and displays backend-returned state.  
**AC6:** Permission gates enforce `purchasing.payments` and `purchasing.credits`.

## Dependencies

- 69-2-c SHOULD be done for invoice list/detail/open amount flows.
- 69-2-e MUST be done.

## Validation Commands

```bash
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing-payments-credits.test.tsx
npm run typecheck -w @jurnapod/backoffice
npm run lint -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
```

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO and Ahmad owner sign-off.
