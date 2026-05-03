# Story 54.4: Multi-Currency AP Correctness

> **HARD GATE (E54-A2):** Implementation of this story MUST NOT begin until the E54-A2 second-pass review checklist is included below.

**Status:** backlog

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
- **Then** the rate used is 15,000 (rate at invoice date, interpolated or nearest)
- **And** NOT 15,500 (current rate at post time)

**AC2:** Base amount precision is correct
- **Given** an invoice in USD for $100.5555 at rate 15,000
- **When** base amount is computed
- **Then** base_amount = 1,508,332.50 (rounded to 2 decimals) or 1,508,332.5000 (4 decimals)
- **And** no floating-point drift (e.g., 1,508,332.4999 or 1,508,332.5001)

**AC3:** Multi-currency payment allocation uses correct rate
- **Given** an invoice in USD ($100 at rate 15,000 = 1,500,000 IDR base)
- **When** a payment in IDR of 1,500,000 is allocated
- **Then** the invoice is fully paid (open amount = 0)

**AC4:** FX gain/loss is computed and posted correctly
- **Given** an invoice in USD ($100 at rate 15,000 = 1,500,000 IDR)
- **When** a payment is made at rate 15,500 (1,550,000 IDR for $100)
- **Then** a FX loss of 50,000 IDR is posted to the FX loss account
- **And** the journal entries balance

**AC5:** Integration tests written and 3× consecutive green

**AC6:** Code review GO required

---

## Test Coverage Criteria

- [ ] Happy paths:
  - [ ] Invoice in foreign currency → correct base amount
  - [ ] Payment in foreign currency → correct allocation
  - [ ] Rate change between invoice and payment → FX gain/loss posted
- [ ] Error paths:
  - [ ] 400: Missing exchange rate for transaction date
  - [ ] 400: Exchange rate not found for currency pair

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` | Create | Multi-currency correctness tests |

## Estimated Effort

2 days

## Risk Level

Medium (P1 — currency precision errors cause financial discrepancies)

## Dev Notes

- Use `toScaled` / `fromScaled` pattern for monetary assertions
- Exchange rate lookup: check `exchange_rates` table schema for temporal validity
- FX gain/loss account: may need to be configured in company settings
- Temporal rate: clarify whether to use exact-date match or nearest-previous-date

## Dependencies

- Stories 54.1 and 54.2
- Exchange rate fixtures in `modules-purchasing`

## Validation Evidence

```bash
npm run test:single -w @jurnapod/api -- "__test__/integration/purchasing/ap-multicurrency-correctness.test.ts"
```
