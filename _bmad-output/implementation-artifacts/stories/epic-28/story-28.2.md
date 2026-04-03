# story-28.2: Payment service parity hardening in modules-sales

## Description

Harden `modules-sales` PaymentService to full behavioral parity with the existing API payment service at `apps/api/src/lib/payments/payment-service.ts`. The goal is feature-equivalence — idempotency canonicalization, split-payment handling, shortfall settlement, status transitions, and allocation semantics must all match exactly before the API route flips.

## Context

The existing `modules-sales` PaymentService (686 LOC) is a partial implementation. The API payment service (763 LOC) has accumulated behavioral details over time. Known gaps to verify and fix:

1. **Idempotency canonicalization**: API `payment-allocation.ts` does datetime-sensitive canonicalization. Module may use date-only normalization — behavior must match.
2. **Split payments**: API handles multiple payment splits per invoice (split across CASH, CARD, etc.). Module may lack full split support.
3. **Shortfall settlement**: When payment < invoice total, API records underpayment and tracks shortage. Module behavior needs verification.
4. **Overpayment handling**: When payment > invoice total, API records overpayment and may create credit note. Module behavior needs verification.
5. **Status transitions**: API enforces valid payment status transitions (DRAFT → COMPLETED → VOID). Module may differ.
6. **Invoice paid_total tracking**: API updates `invoices.paid_total` and `payment_status` after each payment. Module may differ.

## Approach

**Do NOT rewrite the API payment service.** Instead, compare behaviors systematically:

1. Read both implementations side-by-side
2. List every behavioral difference found
3. Fix module service to match API semantics
4. Add test coverage for any gap found

## Acceptance Criteria

- [ ] All idempotency canonicalization paths in module match API behavior
- [ ] Split payment handling in module matches API behavior
- [ ] Shortfall settlement behavior matches API
- [ ] Overpayment handling matches API
- [ ] Status transition rules match API
- [ ] Invoice `paid_total` / `payment_status` updates match API
- [ ] `npm run typecheck -w @jurnapod/modules-sales`
- [ ] Existing payment tests pass (do not delete or skip any)

## Files to Modify

```
packages/modules/sales/src/services/payment-service.ts   # parity fixes
packages/modules/sales/src/types/payments.ts              # types if needed
apps/api/src/lib/payments/payment-service.ts              # READ ONLY (reference)
apps/api/src/lib/payments/payment-allocation.ts           # READ ONLY (reference)
apps/api/src/routes/sales/payments.ts                      # READ ONLY (reference)
```

## Dependency

- story-28.1 (must complete before 28.2 — needs exports and permission maps in place)

## Implementation Notes

### Idempotency canonicalization
The API uses `client_ref` + `company_id` as the idempotency key. The datetime normalization in `payment-allocation.ts` canonicalizes payment reference strings to a standard format. Check:
- Does module use same `client_ref` extraction logic?
- Does datetime normalization match exactly?

### Split payment allocation
API `payment-allocation.ts` distributes payment amount across invoice lines proportionally. Verify module does the same. If not, implement proportionally.

### Testing approach
Run existing payment tests before and after changes. If any test behavior changes, that indicates a parity gap — fix the module, not the test.

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-sales
npm run test -- --testPathPattern="payments" -w @jurnapod/api
```