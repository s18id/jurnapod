# Story 46.2: Exchange Rate Table

Status: backlog

## Story

As a **purchasing manager**,  
I want to maintain a table of exchange rates,  
So that purchase invoices in foreign currencies can be converted to company base currency for GL posting.

---

## Context

Story 46.2 adds the `exchange_rates` table and API. Exchange rates are company-scoped, keyed by currency code and effective date. Rates are manually entered (no auto-feed). The most recent rate on or before a given date is used for conversion. This is a simple implementation — no historical rate chains, no time-series complexity.

**Dependencies:** Story 46.1 (supplier module exists)

---

## Acceptance Criteria

**AC1: Exchange Rate CRUD**
**Given** a user with `purchasing.exchange_rates` CREATE permission,
**When** they create an exchange rate with currency_code, rate, and effective_date,
**Then** the rate is stored, scoped to company_id.

**AC2: Rate Lookup by Date**
**Given** exchange rates exist for a currency,
**When** I query the rate for a specific date,
**Then** the most recent rate on or before that date is returned.

**AC3: Rate for Currency Conversion**
**Given** a PI with a foreign supplier currency,
**When** the system needs to convert the PI amount to base currency,
**Then** it uses the exchange rate where `currency_code = supplier.currency` and `effective_date <= pi_date`, ordered by effective_date DESC, limit 1.

**AC4: Base Currency Handling**
**Given** a supplier with currency equal to company base currency,
**When** conversion is needed,
**Then** the rate is 1.0 (no conversion, return early).

**AC5: Missing Rate Handling**
**Given** a PI in a foreign currency,
**When** no exchange rate exists for the currency or date,
**Then** the PI creation/posting returns an error with a clear message about missing rate.

**AC6: ACL Enforcement**
**Given** a user without `purchasing.exchange_rates` CREATE permission,
**When** they attempt to create an exchange rate,
**Then** they receive a 403 Forbidden response.

---

## Tasks / Subtasks

- [ ] Create `exchange_rates` table migration
- [ ] Add ACL resource `purchasing.exchange_rates`
- [ ] Implement exchange rate routes (CRUD)
- [ ] Implement `getExchangeRate(companyId, currencyCode, date)` utility function
- [ ] Write integration tests for rate lookup
- [ ] Write integration tests for ACL enforcement

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/routes/purchasing/exchange-rates.ts` | Exchange rate CRUD routes |
| `apps/api/src/lib/purchasing/exchange-rate.ts` | Rate lookup utility |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add exchange_rates table |
| `packages/shared/src/schemas/purchasing.ts` | Modify | Add exchange rate schemas |
| `packages/auth/src/acls.ts` | Modify | Add exchange_rates resource |

---

## Validation Evidence

```bash
# Create exchange rate
curl -X POST /api/purchasing/exchange-rates \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"currency_code": "USD", "rate": "1.1200", "effective_date": "2026-04-15"}'

# Lookup rate for date
curl "/api/purchasing/exchange-rates/lookup?currency_code=USD&date=2026-04-19" \
  -H "Authorization: Bearer $TOKEN"

# Missing rate test
# Create PI with USD supplier but no USD rate -> expect 400 error
```

---

## Dev Notes

- `exchange_rates` table: `(company_id, currency_code, effective_date)` as PK
- Rate precision: DECIMAL(19,8) — more precision than money columns since these are ratios
- Effective date = the date FROM which this rate applies (inclusive)
- If multiple rates on same date, use the most recently created one
- No delete endpoint — rates are append-only per date (update with new effective_date instead)

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `as any` casts added without justification
