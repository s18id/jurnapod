# Epic 28: Sales Payments Extraction

**Status:** 📋 Backlog
**Date:** 2026-04-03
**Stories:** 5 total
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-28-sprint-plan.md`

---

## Executive Summary

Epic 28 completes the API Detachment work for the sales payments boundary. The `modules-sales` package already contains a partial `PaymentService` (686 LOC), but the API route still delegates to the heavy API-local `payment-service.ts` (763 LOC). This epic hardens the module-level payment service to full parity, flips the API route to thin-adapter, and wires up the transaction-safe journal posting hook.

**Key Goals:**
- API route = auth + Zod validation + response/error mapping only
- `@jurnapod/modules-sales` becomes canonical owner of payment domain logic
- Payment journal posting via a port/hook from within the module's transaction context
- Full parity on idempotency, permission semantics, tenant/outlet scoping
- Delete heavy API-local payment logic

---

## Goals & Non-Goals

### Goals
- Export `PaymentService` / `createPaymentService` from `modules-sales`
- Harden `modules-sales` payment service to API-level parity (idempotency, allocation, shortfall handling)
- Define payment posting port/hook callable from within module transaction
- API adapter wires to module + posting hook, preserving atomicity
- Flip route to thin adapter
- Delete `apps/api/src/lib/payments/payment-service.ts` and `payment-allocation.ts`

### Non-Goals
- No new package creation — `modules-sales` already exists
- No schema changes
- No POS app changes
- No rollback of existing idempotency or permission semantics
- Credit note and invoice flows are out of scope (already in modules-sales)

---

## Architecture

### Current State (problematic)

```
apps/api/src/routes/sales/payments.ts    # 380 LOC - route does too much
apps/api/src/lib/payments/payment-service.ts  # 763 LOC - heavy logic
apps/api/src/lib/payments/payment-allocation.ts  # 208 LOC - allocation logic
packages/modules/sales/src/services/payment-service.ts  # 686 LOC - partial impl (NOT EXPORTED)
apps/api/src/lib/sales-posting.ts        # contains postSalesPaymentToJournal
```

### Target State

```
apps/api/src/routes/sales/payments.ts    # thin adapter (auth + Zod + response map)
apps/api/src/lib/payments/               # DELETE all or keep thin compatibility facade
packages/modules/sales/src/services/payment-service.ts  # canonical PaymentService (EXPORTED)
apps/api/src/lib/modules-sales/           # thin API adapter (SalesDb + AccessScopeChecker)
apps/api/src/lib/sales-posting.ts        # payment posting hook (port/interface)
```

### Dependency Direction

```
modules-sales → modules-accounting (payment posting port via hook)
modules-sales → modules-platform (tenant/outlet scoping)
```

### Key Risk: Transaction Atomicity

The current API `payment-service.ts` posts journal **inside the same DB transaction** as payment status update. A naive extraction (module writes payment, then API posts journal separately) breaks atomicity.

**Solution:** Define `PaymentPostingHook` as a port/interface injected into `PaymentService`. The API adapter implements the hook using `sales-posting.ts`. The module calls `postPaymentToJournal` from within its own transaction, preserving atomicity.

---

## Success Criteria

- [ ] `modules-sales` exports `PaymentService` / `createPaymentService`
- [ ] `modules-sales` PaymentService achieves full behavioral parity with API payment-service.ts
- [ ] `PaymentPostingHook` port defined and injectable
- [ ] API adapter implements hook using `sales-posting.ts`
- [ ] API route is thin adapter only (auth + Zod + response mapping)
- [ ] `apps/api/src/lib/payments/payment-service.ts` deleted
- [ ] `apps/api/src/lib/payments/payment-allocation.ts` deleted
- [ ] Zero behavior regression on idempotency, permission checks, tenant/outlet scoping
- [ ] Full validation gate passes (typecheck + test)

---

## Stories

| # | Title |
|---|---|
| [story-28.1](./story-28.1.md) | Contract & permission alignment |
| [story-28.2](./story-28.2.md) | Payment service parity hardening in modules-sales |
| [story-28.3](./story-28.3.md) | Payment posting hook (transaction-safe) |
| [story-28.4](./story-28.4.md) | API route flip + library cleanup |
| [story-28.5](./story-28.5.md) | Full validation gate |