# Story 50.5 Completion Notes

**Story:** Sales AR FX Acknowledgment — Implementation  
**Epic:** 50  
**Status:** done  
**Completion Date:** 2026-04-25

---

## Summary

Sales payment posting now enforces FX acknowledgment for non-zero `payment_delta_idr`, supports explicit acknowledgment route/update flow, and posts variance journal lines for delta via accounting posting mapper. Second-pass review is complete with GO.

---

## Acceptance Criteria Verification

### AC1 ✅
Non-zero `payment_delta_idr` without acknowledgment is rejected with 422 (`FX_DELTA_REQUIRES_ACKNOWLEDGMENT`).

### AC2 ✅
Posting with valid acknowledgment and ACCOUNTANT+ permission succeeds; posting is transactionally safe.

### AC3 ✅
Zero-delta path posts without requiring acknowledgment.

### AC4 ✅
`PATCH /sales/payments/:id/acknowledge-fx` endpoint implemented and updates acknowledgment fields.

### AC5 ✅
Future-dated acknowledgment rejected with 422 (`fx_ack_cannot_be_future_dated`).

### AC6 ✅
CASHIER attempting FX acknowledgment is rejected with 403.

### AC7 ✅
Migration `0194_add_sales_payments_fx_ack.sql` is idempotent using `information_schema` guards.

### AC8 ✅
`payment_delta_idr` is posted through accounting payment variance flow in `packages/modules/accounting/src/posting/sales.ts`:
- delta > 0 → variance gain account credit
- delta < 0 → variance loss account debit
- posting balance guard enforced.

---

## Validation Evidence

```bash
npm run build -w @jurnapod/modules-sales
npm run typecheck -w @jurnapod/api
```

Result: PASS

### 3× Green Evidence

Executed 3 consecutive runs each for:

```bash
npm run test:single -w @jurnapod/api -- __test__/unit/sales/payment-fx-ack.test.ts
npm run test:single -w @jurnapod/api -- __test__/integration/sales/payment-fx-ack.test.ts
```

Result: PASS all runs.

---

## Second-Pass Reviewer Sign-Off (E49-A1)

> Second-pass review (E49-A1) COMPLETE for Story 50.5. All ACs are satisfied, including AC8 verification in accounting posting mapper variance journal logic. No P0/P1 blockers remain. Build/typecheck and repeated unit/integration runs pass.

**Reviewer:** bmad-review  
**Date:** 2026-04-25  
**Verdict:** GO

---

## Story Owner Sign-Off

Story owner sign-off granted. Story 50.5 is approved to move to `done`.
