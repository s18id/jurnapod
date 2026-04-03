# Epic 28 Sprint Plan

## Overview
**Epic:** Sales Payments Extraction
**Duration:** 2 sprints
**Goal:** Make `@jurnapod/modules-sales` the canonical owner of payment domain logic, reduce API to thin transport/adapter, preserve atomic journal posting via injectable hook.

## Dependency Direction

```
modules-sales → modules-accounting (PaymentPostingHook via port)
modules-sales → modules-platform (tenant/outlet scoping)
```

## Sprint Breakdown

### Sprint 1: Foundation + Parity (Stories 28.1–28.3)

#### Story 28.1: Contract & permission alignment
- **Estimate:** 2h
- **Priority:** P1
- **Dependencies:** None
- **Focus:** Export PaymentService from modules-sales, fix permission maps in API access-scope checker

#### Story 28.2: Payment service parity hardening in modules-sales
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 28.1
- **Focus:** Compare API payment-service.ts (763 LOC) with module PaymentService (686 LOC), fix behavioral gaps (idempotency, split payments, shortfall/overpayment, status transitions)

#### Story 28.3: Payment posting hook (transaction-safe)
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 28.2
- **Focus:** Define PaymentPostingHook interface, inject into PaymentService, implement API adapter using sales-posting.ts

### Sprint 2: Route Flip + Validation (Stories 28.4–28.5)

#### Story 28.4: API route flip + library cleanup
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 28.3
- **Focus:** Flip route to module service via adapter, delete API-local payment-service.ts (763 LOC) and payment-allocation.ts (208 LOC)

#### Story 28.5: Full validation gate
- **Estimate:** 2h
- **Priority:** P1
- **Dependencies:** 28.4
- **Focus:** Full workspace typecheck + build + test gate

## Story Dependencies

```
28.1 (contract + exports)
  └── 28.2 (parity hardening) ── sequential
        └── 28.3 (posting hook) ── sequential
              └── 28.4 (route flip) ── sequential
                    └── 28.5 (validation gate) ── sequential
```

Note: All stories are sequential within each sprint due to the progressive nature of the extraction (each story builds on the previous).

## Files Changed Summary

| Story | File | Change |
|-------|------|--------|
| 28.1 | `packages/modules/sales/src/index.ts` | +PaymentService exports |
| 28.1 | `packages/modules/sales/src/services/index.ts` | ensure payment service re-exported |
| 28.1 | `apps/api/src/lib/modules-sales/access-scope-checker.ts` | fix payment permission maps |
| 28.2 | `packages/modules/sales/src/services/payment-service.ts` | parity fixes |
| 28.2 | `packages/modules/sales/src/types/payments.ts` | types if needed |
| 28.3 | `packages/modules/sales/src/interfaces/` | +PaymentPostingHook interface |
| 28.3 | `packages/modules/sales/src/services/payment-service.ts` | inject + call posting hook |
| 28.3 | `apps/api/src/lib/modules-sales/` | implement PaymentPostingHook |
| 28.4 | `apps/api/src/routes/sales/payments.ts` | flip to module service |
| 28.4 | `apps/api/src/lib/payments/payment-service.ts` | DELETE |
| 28.4 | `apps/api/src/lib/payments/payment-allocation.ts` | DELETE |
| 28.4 | `apps/api/src/lib/payments/types.ts` | DELETE if orphaned |
| 28.4 | `apps/api/src/lib/payments/index.ts` | DELETE or thin facade |

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | Payment journal posting inside same tx as payment write — naive extraction breaks atomicity | Define PaymentPostingHook port, inject into PaymentService, call from within tx |
| 2 | Idempotency canonicalization differs between API and module | Lock to API semantics in 28.2, do not change behavior |
| 3 | Permission map incomplete for payments:* | Fix in 28.1 before any route flip |
| 4 | Unknown internal consumers import old API payment lib paths | Attempt deletion in 28.4, fix broken imports as they appear |
| 5 | Split/shortfall/overpayment behaviors differ | Verify in 28.2, fix module to match API |

## Validation Commands (per story)

### Story 28.1
```bash
npm run typecheck -w @jurnapod/modules-sales
npm run typecheck -w @jurnapod/api
npm test -- --testPathPattern="payments" -w @jurnapod/api
```

### Story 28.2
```bash
npm run typecheck -w @jurnapod/modules-sales
npm test -- --testPathPattern="payments" -w @jurnapod/api
```

### Story 28.3
```bash
npm run typecheck -w @jurnapod/modules-sales
npm run typecheck -w @jurnapod/api
npm test -- --testPathPattern="payments" -w @jurnapod/api
```

### Story 28.4
```bash
npm run typecheck -w @jurnapod/modules-sales
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm test -- --testPathPattern="payments" -w @jurnapod/api
```

### Story 28.5
```bash
npm run typecheck --workspaces --if-present
npm run build --workspaces --if-present
npm test -w @jurnapod/api
```