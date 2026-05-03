# Story 54.4: Multi-Currency AP Correctness

> **HARD GATE (E54-A2):** Implementation of this story MUST NOT begin until the E54-A2 second-pass review checklist is included below.

**Status:** done — ✅ code review GO 2026-05-04

---

## Review Findings

### Batch-Applied Patches (Review Phase)
| # | Finding | Fix |
|---|---------|-----|
| 1 | **P1 — Partial payment over-clears AP liability**: `postAPPayment` debited full `openAmount` for foreign-currency invoices even when `allocationAmount < openAmount` | Added explicit `full_settlement` flag to `ap_payment_lines`; FX journal only posted when flag is true |
| 2 | **P2 — Missing FX gain test**: Only FX loss scenario tested | Added AC4b test covering FX gain (rate decrease → pay less than liability) |
| 3 | **P3 — Float arithmetic in test assertion**: `BigInt(Math.round(Number(row.debit) * 10000))` | New test uses `toScaledBigInt` (string parsing); existing test left as low-risk |
| 4 | **P3 — AC1 test doesn't validate temporal lookup**: Test verifies stored `exchange_rate`, not lookup behavior | AC1 is confirmation test per spec; temporal lookup proven by existing `exchange-rates.test.ts:489-523` |
| 5 | **P3 — Unused constants**: `PURCHASE_INVOICE_STATUS_POSTED`, `expenseAccountId` | Removed from test file |
| 6 | **P3 — Redundant company currency query**: Queried inside `for` loop in `createDraftAPPayment` | Hoisted outside loop |

### Dismissed
| Item | Rationale |
|------|-----------|
| `full_settlement` flag requires schema migration | Necessary for explicit FX variance control; migration 0200 created |
| FX gain/loss tolerance heuristic | Replaced with explicit flag per user directive |

---

## Story Context

**Epic:** Epic 54 — AP Lifecycle Correctness
**Owner:** @bmad-dev
**Type:** Correctness risk resolution
**Module:** `modules-purchasing`, `modules-accounting`
**Sprint:** 54

---

## Problem Statement

Multi-currency AP transactions (invoice in USD, payment in IDR) require:
1. Temporal exchange rate lookup (rate at transaction date, not current)
2. Precise base amount computation (DECIMAL(19,4))
3. FX gain/loss posting when rates change between invoice and payment

Epic 46 implemented multi-currency support but did not prove correctness under all edge cases.

---

## Pre-Condition Survey Findings

### AC1 — Temporal Exchange Rate Lookup: ✅ ALREADY CORRECT
`ExchangeRateService.getRate()` at `exchange-rate-service.ts:192–212` uses:
```sql
WHERE effective_date <= params.date ORDER BY effective_date DESC, created_at DESC LIMIT 1
```
- Uses invoice date (not `NOW()`) — deterministic
- Existing test at `exchange-rates.test.ts:489-523` proves temporal lookup
- **No production fix needed** — write targeted test to confirm

### AC2 — Base Amount Precision: ✅ ALREADY CORRECT
`computeBaseAmount()` at `supplier-statement-service.ts:72–81` uses bigint arithmetic:
```typescript
const product = originalScaled * rateScaled;
return (product + half) / scaleFactor;  // symmetric half-up rounding
```
- `DECIMAL(19,4)` precision with `DECIMAL(19,8)` rate = symmetric rounding
- **No production fix needed** — write targeted test to confirm

### AC3 — Multi-Currency Payment Allocation: ⚠️ LIKELY CORRECT, UNTESTED
- `allocationAmount` on payment lines stored in base currency
- `computePurchaseInvoiceOpenAmount` at `purchase-invoice-open-amount.ts:13–53` uses `grand_total × exchange_rate` (invoice's locked rate)
- The `allocationAmount > openAmount` overpayment check operates in base currency
- **No production fix needed** — write targeted test to confirm

### AC4 — FX Gain/Loss Posting: ❌ DISCOVERY — PRODUCTION FIX REQUIRED
`postAPPayment` at `ap-payment-service.ts:755–780` posts a simple 2-line journal:
```
DR  AP Account    allocation_amount
CR  Bank Account  allocation_amount
```
- **No FX gain/loss line** when `payment_date_rate ≠ invoice_rate`
- Treasury FOREX pattern exists at `journal-builder.ts:37–106` but NOT adapted to AP
- FX gain/loss accounts accessible via `account_mappings` for `PAYMENT_VARIANCE_GAIN` / `PAYMENT_VARIANCE_LOSS`
- **AC4 is a discovery + production-fix story**, same pattern as Story 54.3 AC3

---

## E54-A2: Second-Pass Determinism Review (MANDATORY)

**When required:** Currency precision errors are P1 (financial impact). Second-pass review is **MANDATORY**.

**Second-pass checklist:**
- [ ] Exchange rate temporal lookup is deterministic
- [ ] Base amount precision is correct (DECIMAL(19,4))
- [ ] Multi-currency payment allocation uses correct rate
- [ ] FX gain/loss is computed and posted correctly
- [ ] No `Date.now()` or `Math.random()` introduced during fix
- [ ] 3× consecutive green evidence
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** Exchange rate temporal lookup is deterministic
- **Given** exchange rate USD→IDR = 15,000 on 2026-01-15 and 15,500 on 2026-02-01
- **When** an invoice dated 2026-01-20 is posted
- **Then** the rate used is 15,000 (rate at invoice date, nearest previous)
- **And** NOT 15,500 (current rate at post time)
- **Test type:** Confirmation test — no production fix expected
- **Expected result:** ✅ **PASS** — `getRate()` already uses `effective_date <= params.date`

**AC2:** Base amount precision is correct
- **Given** an invoice in USD for $100.5555 at rate 15,000
- **When** base amount is computed
- **Then** `base_amount = 1,508,332.5000` (4 decimals, half-up rounding)
- **And** no floating-point drift (e.g., 1,508,332.4999 or 1,508,332.5001)
- **Test type:** Confirmation test — no production fix expected
- **Expected result:** ✅ **PASS** — bigint arithmetic with symmetric rounding

**AC3:** Multi-currency payment allocation uses correct rate
- **Given** an invoice in USD ($100 at rate 15,000 = 1,500,000 IDR base)
- **When** a payment in IDR of 1,500,000 is allocated
- **Then** the invoice is fully paid (open amount = 0)
- **Test type:** Confirmation test — no production fix expected
- **Expected result:** ⚠️ **Likely PASS** — open amount calculation works, untested

**AC4 (DISCOVERY):** FX gain/loss is computed and posted correctly
- **Write first** (same pattern as 54.3 AC3 — discovery test)
- **Expected result:** ❌ **FAIL** — `postAPPayment` does not post FX gain/loss
- **If fails:** expand scope to fix production code:
  1. In `postAPPayment`, after allocating payment lines, look up each invoice's locked `exchange_rate`
  2. Look up the current exchange rate for `payment_date` via `ExchangeRateService.getRate()`
  3. Compute FX variance: `baseAmountAtInvoiceRate - baseAmountAtPaymentRate`
  4. Add a 3rd journal line to FX gain/loss account (from `account_mappings.PAYMENT_VARIANCE_GAIN/LOSS`)
- **Given** an invoice in USD ($100 at rate 15,000 = 1,500,000 IDR base)
- **When** a payment is made at rate 15,500 (1,550,000 IDR for $100)
- **Then** an FX loss of 50,000 IDR is posted to the FX loss account
- **And** the total journal entry balances (DR AP 1,500,000 + DR FX Loss 50,000 = CR Bank 1,550,000)

**AC5:** Integration tests written and 3× consecutive green

**AC6:** Code review GO required

---

## Implementation Plan

### Execution Order
1. **Write AC4 discovery test FIRST** — same pattern as 54.3 AC3
   - Expect it to fail (no FX gain/loss posting exists in AP payments)
2. **Write AC1 + AC2 + AC3 confirmation tests** — these should all pass (no production fix)
3. **Implement AC4 production fix** — add 3-line journal with FX gain/loss to `postAPPayment`
4. Run full suite 3× (AC5)
5. Submit for code review (AC6)

### Production Fix Details (AC4 — only if discovery test fails)

#### FX Computation Logic (in `postAPPayment`, `ap-payment-service.ts`)

For each payment line that allocates to a foreign-currency invoice, the FX variance is:

```typescript
// 1. Get invoice's locked exchange rate
const invoice = await getInvoice(companyId, invoiceId);
const invoiceRate = invoice.exchange_rate;    // locked at invoice posting time

// 2. Get payment-date exchange rate for same currency pair (FOR UPDATE)
const paymentRate = await exchangeRateService.getRate({
  companyId,
  currencyCode: invoice.currency_code,
  date: payment.payment_date,                 // rate at payment date
});

// 3. Compute what the allocation is worth at each rate
// allocationAmount is in base currency (IDR) — it's the actual cash paid
// We reverse-compute the foreign-currency amount using the payment rate:
//   foreignAmount = allocationAmount / paymentRate
// Then re-compute at invoice rate:
//   baseAtInvoiceRate = foreignAmount × invoiceRate

const allocScaled4 = toScaled4(allocationAmount);
const payRateScaled8 = toScaled8(paymentRate.rate);
const invRateScaled8 = toScaled8(invoiceRate);

// foreignAmount (in USD, scaled to 8 decimals) = alloc(IDR) / paymentRate(IDR per USD)
// Avoid float: foreignAmount = (allocScaled4 × 10^8) / payRateScaled8
const foreignAmountScaled8 = (allocScaled4 * 100_000_000n) / payRateScaled8;

// baseAtInvoiceRate = foreignAmount × invoiceRate
// Again: (foreignAmount × invoiceRate) / 10^8
const baseAtInvoiceRate = (foreignAmountScaled8 * invRateScaled8) / 100_000_000n;

// 4. FX variance
const fxDiff = fromScaled4(baseAtInvoiceRate) - fromScaled4(fromScaled8To4(allocScaled4));
// simplified: openAmount is already known, so:
// fxDiff = allocationAmount - openAmount   (positive = loss, negative = gain)
```

**Key insight:** In the scenario where `allocationAmount > openAmount` for a foreign-currency invoice, the excess is **not an overpayment** — it's a higher cash outflow caused by the rate change. The overpayment guard must be adjusted to allow this.

#### FX Journal Line Structure
```
Scenario: Invoice $100 at rate 15,000; Payment at rate 15,500; Allocation = 1,550,000 IDR

DR  AP Account (liability)         1,500,000    ← settle at invoice (locked) rate
DR  FX Loss (expense)                 50,000    ← excess = loss (payment rate > invoice rate)
CR  Bank Account                   1,550,000    ← actual cash paid

[If payment rate < invoice rate: CR FX Gain (revenue)]
```

#### FX Account Resolution
Use `account_mappings` table with `PAYMENT_VARIANCE_GAIN` and `PAYMENT_VARIANCE_LOSS` mapping types:
```typescript
import { getAccountMapping } from "packages/modules/accounting/src/account-mappings-service";
// or use ensurePaymentVarianceMappings() pattern from sales
```

#### Overpayment Check Adjustment
The existing overpayment check at `ap-payment-service.ts:695–707` compares `allocatedAmount > openAmount`. For foreign-currency allocations, the excess may be FX variance, not overpayment. Adjust the check:

```typescript
// Instead of strict overpayment rejection for foreign-currency allocations:
if (invoice.currency_code !== companyCurrency && fxDiff !== 0n) {
  // Allow allocation > open_amount — excess is FX variance
} else if (allocatedAmount > openAmount) {
  throw new APPaymentOverpaymentError(...);
}
```

### Test File
`apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts`

### No-Go Criteria
- AC4 production fix affects accounting posting (journal entry structure) — if discovery test reveals deeper architecture gaps requiring >2 days effort, escalate to Epic 54 decision
- Complex FX rounding edge cases discovered during testing may require separate story

---

## Test Coverage Criteria

- [ ] Happy paths:
  - [ ] AC1: Temporal rate lookup — invoice rate ≠ current rate
  - [ ] AC2: Base amount precision — $100.5555 × 15,000 = exact 1,508,332.5000
  - [ ] AC3: Multi-currency allocation — full payment closes invoice
  - [ ] AC4: FX loss — invoice locked at 15,000; payment at 15,500 → 50,000 loss posted
  - [ ] AC4: FX gain — invoice locked at 15,500; payment at 15,000 → 50,000 gain posted
- [ ] Error paths:
  - [ ] 400: Missing exchange rate for transaction date on invoice post
  - [ ] 400: Exchange rate not found for currency pair
- [ ] Same-currency: no FX line when company currency = invoice currency (rate = 1.0)

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` | Create | Multi-currency correctness tests — AC1–AC4 |
| `packages/modules/purchasing/src/services/ap-payment-service.ts` | Modify | AC4: Add FX gain/loss posting to `postAPPayment` + adjust overpayment check for FX variance |
| `packages/modules/purchasing/src/types/ap-payment.ts` | Modify | Possibly: add FX-related types if needed |
| `packages/modules/purchasing/src/services/purchase-invoice-open-amount.ts` | Possibly modify | May need metadata about invoice currency for FX check |

---

## Estimated Effort

2 days (1 day test-only ACs + AC4 discovery/fix; 1 day review prep)

## Risk Level

Medium (P1 — currency precision errors cause financial discrepancies)

## Risk Register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R54-004a | AC4 production fix touches journal posting — regression in AP payment journal | P1 | Write discovery test first; run full AP payment test suite 3× after fix |
| R54-004b | `account_mappings` for `PAYMENT_VARIANCE_GAIN/LOSS` may not exist for all test companies | P2 | Use `ensurePaymentVarianceMappings()` helper to create if missing |
| R54-004c | Overpayment check rejects legitimate FX variance as overpayment | P1 | Adjust overpayment logic to allow excess when currency differs |
| R54-004d | FX diff rounding edge case (0.0001 asymmetry) | P3 | Use same bigint arithmetic as existing `computeBaseAmount()` — already proven correct |

---

## Dev Notes

- **FX accounts**: Use `account_mappings` table with `PAYMENT_VARIANCE_GAIN` and `PAYMENT_VARIANCE_LOSS` (same pattern as sales module). Query via `getAccountMapping(companyId, 'PAYMENT_VARIANCE_GAIN')`.
- **Scaled math**: Use `toScaled4()` and `toScaled8()` from `packages/shared` — same as existing `computeBaseAmount()`.
- **Exchange rate lookup**: `ExchangeRateService.getRate({ companyId, currencyCode, date: paymentDate })` — returns most-recent-on-or-before rate.
- **Invoice rate source**: `purchase_invoices.exchange_rate` — locked at `postPI` time.
- **Overpayment guard**: Must allow `allocation_amount > open_amount` when invoice currency ≠ company currency (excess = FX variance).
- **Journal balance invariant**: `sum(debits) = sum(credits)` must hold — DR(cash) = DR(AP) + DR(FX Loss) or DR(AP) = CR(cash) + CR(FX Gain).
- **Same-currency case**: When `invoice.currency_code = company.currency_code`, rate = 1.0, no FX line should be posted.

---

## Dependencies

- Stories 54.1 and 54.2 (invoice + payment correctness) — ✅ both done
- Story 54.3 (AP state machine, GRN linkage) — ✅ done
- Exchange rate fixtures in `modules-purchasing`

## Validation Evidence

```bash
npm run test:single -w @jurnapod/api -- "__test__/integration/purchasing/ap-multicurrency-correctness.test.ts"
```
