# Story 54.4 Completion Report

**Story:** 54.4 — Multi-Currency AP Correctness
**Epic:** 54 — AP Lifecycle Correctness
**Status:** ✅ DONE
**Completed:** 2026-05-04

---

## Summary

Story 54.4 proved multi-currency AP transactions handle temporal exchange rate lookup, base amount precision, and FX gain/loss posting. AC4 required a production fix: adding an explicit `full_settlement` flag to payment lines so FX variance is posted only when intended.

---

## Files Created/Modified

### Created
| File | Description |
|------|-------------|
| `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` | Multi-currency correctness tests — 5 test cases (AC1–AC4, AC4b) |
| `packages/db/migrations/0200_ap_payment_lines_full_settlement.sql` | Adds `full_settlement TINYINT(1)` column to `ap_payment_lines` |

### Modified
| File | Changes |
|------|---------|
| `packages/modules/purchasing/src/services/ap-payment-service.ts` | AC4: Add FX gain/loss posting to `postAPPayment`; adjust overpayment check for foreign-currency invoices; hoist company currency query |
| `packages/shared/src/schemas/purchasing.ts` | Add `full_settlement: z.boolean().optional().default(false)` to `ApPaymentLineCreateSchema` |
| `packages/modules/purchasing/src/types/ap-payment.ts` | Add `fullSettlement?: boolean` to `APPaymentCreateInput` lines |
| `packages/db/src/kysely/schema.ts` | Add `full_settlement: Generated<number>` to `ApPaymentLines` interface |
| `apps/api/src/routes/purchasing/ap-payments.ts` | Map `full_settlement` from request body to service input |
| `apps/api/__test__/integration/purchasing/ap-payments.test.ts` | Update foreign-currency test to use `full_settlement: true` and verify FX journal lines |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Temporal exchange rate lookup — invoice rate ≠ current rate | ✅ Complete |
| AC2 | Base amount precision — $100.5555 × 15,000 = exact 1,508,332.5000 | ✅ Complete |
| AC3 | Multi-currency allocation — full payment closes invoice | ✅ Complete |
| AC4 | FX loss — invoice locked at 15,000; payment at 15,500 → 50,000 loss posted | ✅ Complete |
| AC4b | FX gain — invoice locked at 15,500; payment at 15,000 → 50,000 gain posted | ✅ Complete |
| AC5 | Integration tests 3× consecutive green | ✅ Complete |
| AC6 | Code review GO | ✅ Complete (2026-05-04) |

---

## Key Features Implemented

### AC1–AC3: Confirmation Tests (No Production Fix)
- Temporal rate lookup: `getRate()` uses `effective_date <= params.date` — deterministic, already correct
- Base amount precision: bigint arithmetic with symmetric half-up rounding — no float drift
- Multi-currency allocation: `computePurchaseInvoiceOpenAmount` converts using locked invoice rate

### AC4–AC4b: FX Gain/Loss Posting (Production Fix)
- Added `full_settlement` flag to `ap_payment_lines` (migration 0200)
- When `full_settlement = true` on a foreign-currency invoice line:
  - `postAPPayment` debits AP for `openAmount` (full liability)
  - Computes `fxDiff = allocationAmount - openAmount`
  - Posts FX loss line (if `fxDiff > 0`) or FX gain line (if `fxDiff < 0`)
  - Credits bank for `allocationAmount`
- When `full_settlement = false` (or absent): standard 2-line journal (DR AP / CR Bank)
- Overpayment guard: skipped for foreign-currency invoices ONLY when `openAmount > 0` AND `full_settlement = true`. If `openAmount <= 0`, rejects as overpayment (prevents double-payment).

---

## Technical Implementation

### FX Journal Line Structure
```
Loss scenario (allocation > open):
  DR  AP Account         openAmount
  DR  FX Loss Account    fxDiff
  CR  Bank Account       allocationAmount

Gain scenario (allocation < open):
  DR  AP Account         openAmount
  CR  Bank Account       allocationAmount
  CR  FX Gain Account    abs(fxDiff)
```

### Data Flow
```
Invoice create (currency_code='USD', exchange_rate='15000')
  ↓ postPI — locks rate on invoice row
Payment create (lines: [{piId, allocation_amount, full_settlement: true}])
  ↓ postAPPayment
    - Computes openAmount from invoice
    - If full_settlement: posts 3-line FX journal
    - If partial: posts 2-line standard journal
```

### API Changes
- `POST /purchasing/payments` now accepts `full_settlement: boolean` on each line item
- Default is `false` — backward compatible with existing clients

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes (`npm run typecheck -w @jurnapod/api`) |
| ESLint | ✅ Passes |
| Build | ✅ Successful (`npm run build -w @jurnapod/modules-purchasing`) |
| Migration | ✅ Applied (0200_ap_payment_lines_full_settlement.sql) |

---

## Known Limitations

### Architectural
1. **Partial payments on foreign-currency invoices do NOT post FX variance** — by design, FX only posted when `full_settlement = true`
2. **FX accounts auto-created on first use** — `ensurePaymentVarianceMappings()` creates `PAYMENT_VARIANCE_GAIN/LOSS` accounts if missing

### Functional
1. **No `full_settlement` UI exposure in API docs** — flag is available but not documented in OpenAPI spec (out of story scope)

---

## Testing Performed

- ✅ AC1: Temporal rate lookup — invoice on middle date uses older rate
- ✅ AC2: Base amount precision — exact 1,508,332.5000 with no float drift
- ✅ AC3: Full payment closes foreign-currency invoice (open amount = 0)
- ✅ AC4: FX loss — invoice at 15,000; payment at 15,500 → 50,000 loss journal line
- ✅ AC4b: FX gain — invoice at 15,500; payment at 15,000 → 50,000 gain journal line
- ✅ 5/5 tests pass, 3× consecutive green
- ✅ Existing AP tests: 60/60 pass, no regressions
- ✅ Core AP suite: ap-payment-correctness (8), ap-invoice-correctness (9), ap-payments (30), ap-state-machine (8), ap-multicurrency-correctness (5)

---

## Review Findings

### Batch-Applied Patches
| # | Finding | Fix |
|---|---------|-----|
| 1 | **P1 — Partial payment over-clears AP liability** | Added explicit `full_settlement` flag; FX journal only posted when flag is true |
| 2 | **P2 — Missing FX gain test** | Added AC4b test |
| 3 | **P3 — Float arithmetic** | New test uses `toScaledBigInt` |
| 4 | **P3 — AC1 confirmation test scope** | Documented as confirmation test; temporal lookup proven by existing test |
| 5 | **P3 — Unused constants** | Removed |
| 6 | **P3 — Redundant query in loop** | Hoisted outside loop |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-04 | 1.0 | Initial implementation — test suite + production fix for AC4 |
| 2026-05-04 | 1.1 | P1 fix: Added `full_settlement` flag (migration 0200) to prevent partial payment over-clearing AP |
| 2026-05-04 | 1.2 | P2 fix: Added AC4b FX gain test |
| 2026-05-04 | 1.3 | P3 fixes: Removed unused constants, hoisted company query, cleaned up test assertions |

---

**Story is COMPLETE.**
**Owner sign-off:** Ahmad — 2026-05-04
