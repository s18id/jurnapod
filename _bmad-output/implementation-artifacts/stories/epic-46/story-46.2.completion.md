# Story 46.2 — Exchange Rate Table — Completion Report

## Story
- **ID:** 46.2
- **Title:** Exchange Rate Table
- **Epic:** 46 — Purchasing / Accounts Payable Module
- **Status:** ✅ DONE

## What Was Implemented

- Exchange rate table migration and ACL seeding for `purchasing.exchange_rates`
- CRUD routes for exchange rates under `/api/purchasing/exchange-rates`
- Lookup utility `getExchangeRate(companyId, currencyCode, date)`
- Company-scoped date-effective lookup: latest rate on or before requested date
- Base-currency handling (`rate = 1`) and missing-rate error path support for downstream PI flows

## Acceptance Criteria Evidence

| AC | Requirement | Status | Evidence |
|---|---|---|---|
| AC1 | Exchange rate CRUD | ✅ | Integration suite pass |
| AC2 | Lookup by effective date | ✅ | Lookup tests pass |
| AC3 | Currency conversion lookup rule | ✅ | Utility + tests use `effective_date <= date`, DESC, LIMIT 1 |
| AC4 | Base currency rate = 1 | ✅ | Utility behavior covered in tests |
| AC5 | Missing rate handling | ✅ | Error path covered in tests |
| AC6 | ACL enforcement | ✅ | Unauthorized role gets 403 in tests |

## Files Added / Modified

### Added
- `packages/db/migrations/0170_exchange_rates.sql`
- `packages/db/migrations/0171_acl_purchasing_exchange_rates.sql`
- `apps/api/src/routes/purchasing/exchange-rates.ts`
- `apps/api/src/lib/purchasing/exchange-rate.ts`
- `apps/api/__test__/integration/purchasing/exchange-rates.test.ts`

### Modified
- `packages/db/src/kysely/schema.ts`
- `packages/shared/src/schemas/purchasing.ts`
- `packages/shared/src/constants/roles.defaults.json`
- `apps/api/src/routes/purchasing/index.ts`
- `apps/api/src/lib/test-fixtures.ts`
- `apps/api/src/app.ts`

## Validation

- `exchange-rates.test.ts`: **26/26 pass**
- Regression suite rerun after 46.4 hardening: **26/26 pass** (still green)

## Open Items

- None blocking Story 46.2 completion.
