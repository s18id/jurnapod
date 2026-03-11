# Company Default Account Mappings with Outlet Override

## 1) Objective
Deliver company-wide default account mappings with per-outlet override for:
- Sales account mappings (`AR`, `SALES_REVENUE`, `SALES_TAX`)
- POS payment method mappings

Outcome requirements:
- Outlet configuration may override company defaults.
- Blank outlet value means inherit from company default.
- Posting and sync logic must resolve mappings in precedence order: outlet -> company -> error.

## 2) Current Status (as of 2026-03-11)
- ✅ Database migrations implemented.
- ✅ Settings API scope model implemented for account and payment mappings.
- ✅ Posting and sync fallback logic implemented.
- ✅ Backoffice hooks/UI updated for scope-aware editing.
- ✅ Core scope unit tests and e2e coverage implemented.
- ✅ HTTP behavior tests relocated to `e2e-tests/account-mappings-behavior.spec.mjs`.
- ✅ Posting helper unit tests added (`apps/api/src/lib/sales-posting-fallback.test.ts`).

## 3) Locked Decisions
- Scope includes both Sales mappings and Payment Method mappings.
- Override semantics: outlet blank value removes outlet override and inherits company default.
- Database model uses dedicated company-level mapping tables (not nullable `outlet_id` in outlet tables).
- DB compatibility requirement: migration SQL must remain MySQL 8.0+ and MariaDB compatible.

## 4) Implemented Changes (Record)

### 4.1 Database Layer
- Added `company_account_mappings` via `packages/db/migrations/0080_company_account_mappings.sql`.
- Added `company_payment_method_mappings` via `packages/db/migrations/0081_company_payment_method_mappings.sql`.

### 4.2 Settings API

`apps/api/app/api/settings/outlet-account-mappings/route.ts`
- GET supports `scope=company|outlet` (default `outlet`).
- Outlet scope requires `outlet_id`.
- Company response shape: `{ scope: "company", mappings: [{ mapping_key, account_id }] }`.
- Outlet response shape includes source metadata:
  `{ scope: "outlet", outlet_id, mappings: [{ mapping_key, account_id, source, company_account_id }] }`.
- PUT supports body: `{ scope: "company" | "outlet", outlet_id?, mappings }`.
- Company PUT upserts `company_account_mappings` and enforces required keys.
- Outlet PUT upserts `outlet_account_mappings`; blank `account_id` clears outlet override row.

`apps/api/app/api/settings/outlet-payment-method-mappings/route.ts`
- GET supports same scope model and returns effective outlet values with source metadata.
- Outlet GET merge precedence: outlet override first, then company default.
- Company PUT upserts `company_payment_method_mappings`.
- Outlet PUT upserts `outlet_payment_method_mappings`.
- Validation enforces at most one `is_invoice_default` per scope.
- Blank `account_id` removes outlet override row.

### 4.3 Posting and Sync Logic (Critical)

`apps/api/src/lib/sales-posting.ts`
- `readOutletAccountMappingByKey`: lookup outlet mapping first, then company default.
- Throws `OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE` only when both scopes are missing.
- `readOutletPaymentMethodMappings`: outlet mappings first, then company defaults.

`apps/api/src/lib/sync-push-posting.ts`
- Applies same fallback precedence: outlet -> company -> error.
- Preserves legacy behavior for payment method keys still sourced from `outlet_account_mappings`.

### 4.4 Backoffice

`apps/backoffice/src/hooks/use-outlet-account-mappings.ts`
- Added scope parameter (`company` or `outlet`) and corresponding GET URL behavior.

`apps/backoffice/src/hooks/use-outlet-payment-method-mappings.ts`
- Added same scope-aware fetching pattern.

`apps/backoffice/src/features/account-mappings-page.tsx`
- Added scope selector: company default + outlet list.
- Outlet view shows effective value and source badge (`Outlet` or `Company Default`).
- Outlet blank selection clears override and inherits company.
- Company view remains direct-edit (no inheritance layer).
- Validation:
  - Company scope requires all mapping keys.
  - Outlet scope validates effective values (inherited values count as valid).

### 4.5 Tests Implemented
- `apps/api/src/lib/account-mappings-scope.test.ts` (12 tests passing):
  - Scope query validation
  - Company completeness validation
  - Outlet blank clears override semantics
  - Payment invoice default uniqueness validation
  - Fallback precedence logic checks
- `e2e-tests/outlet-account-mappings-api.spec.mjs` updated for scope-aware API.
- `e2e-tests/payment-defaults-api.spec.mjs` updated for scope-aware API.
- `e2e-tests/payment-defaults.spec.mjs` updated to align with the new contract.

## 5) Remaining Work (Execution Plan)

All implementation work is complete. Tests have been added for:

- Scope validation logic (unit tests in `account-mappings-scope.test.ts`)
- Posting fallback precedence (unit tests in `sales-posting-fallback.test.ts`)
- HTTP behavior (e2e tests in `account-mappings-behavior.spec.mjs`)

### Historical Record (Completed)

#### 5.1 Relocate HTTP Behavior Tests to E2E ✅ COMPLETE
- Test file exists at: `e2e-tests/account-mappings-behavior.spec.mjs`
- Covers GET/PUT company/outlet scope behavior, company required keys, and blank override deletion.
- Previously tracked as remaining work but was already implemented in e2e location.

#### 5.2 Add Posting Helper Unit Tests ✅ COMPLETE
- Test file: `apps/api/src/lib/sales-posting-fallback.test.ts`
- 9 tests covering:
  - Outlet override wins over company default
  - Company fallback when outlet missing
  - Throws when missing in both scopes
  - Partial outlet + partial company merges correctly
  - Ignores invalid rows with missing fields
  - Payment method mapping precedence (outlet_payment_method > outlet_account_mappings > company_payment_method)
  - Legacy outlet_account_mappings fallback
  - Company payment method as final fallback
  - Lowercase method code normalization

## 6) Validation Matrix

| Area | Test Type | Command | Expected Result |
|------|-----------|---------|-----------------|
| Scope validation logic | Unit | `node --test --import tsx apps/api/src/lib/account-mappings-scope.test.ts` | All pass (12 tests) |
| Posting fallback helpers | Unit | `node --test --import tsx apps/api/src/lib/sales-posting-fallback.test.ts` | All pass (9 tests) |
| API behavior (scope + auth) | E2E/API | `node --test e2e-tests/account-mappings-behavior.spec.mjs` | All pass |
| Account mappings API | E2E/API | `node e2e-tests/outlet-account-mappings-api.spec.mjs` | All pass |
| Payment defaults API | E2E/API | `node e2e-tests/payment-defaults-api.spec.mjs` | All pass |

Behavior test prerequisites:
- API running (`npm run dev -w @jurnapod/api`)
- Valid credentials (`JP_COMPANY_CODE`, `JP_OWNER_EMAIL`, `JP_OWNER_PASSWORD`)

## 7) Rollout and Safety
- Run migrations before deploying API/backoffice code that depends on company default tables.
- Maintain zero-downtime order: existing outlet mappings remain valid; company defaults can be backfilled after deployment.
- Posting safety remains protected by fallback precedence; unresolved mappings still fail explicitly when missing in both scopes.
- Backoffice validation should continue checking effective values, not only local outlet rows.

## 8) Risks and Open Questions
- Risk: incomplete company defaults plus partially configured outlets can still trigger posting errors where both scopes are empty.
- Risk: incorrect tenant/outlet scoping in future changes may leak mapping resolution across tenants; keep `company_id`/`outlet_id` guardrails explicit.
- Open question: whether to fully deprecate legacy payment mapping key reads from `outlet_account_mappings` after migration horizon.

## 9) Appendix

### 9.1 File Change Summary
| File | Status |
|------|--------|
| `packages/db/migrations/0080_company_account_mappings.sql` | ✅ Complete |
| `packages/db/migrations/0081_company_payment_method_mappings.sql` | ✅ Complete |
| `apps/api/app/api/settings/outlet-account-mappings/route.ts` | ✅ Complete |
| `apps/api/app/api/settings/outlet-payment-method-mappings/route.ts` | ✅ Complete |
| `apps/api/src/lib/sales-posting.ts` | ✅ Complete |
| `apps/api/src/lib/sync-push-posting.ts` | ✅ Complete |
| `apps/backoffice/src/hooks/use-outlet-account-mappings.ts` | ✅ Complete |
| `apps/backoffice/src/hooks/use-outlet-payment-method-mappings.ts` | ✅ Complete |
| `apps/backoffice/src/features/account-mappings-page.tsx` | ✅ Complete |
| `apps/api/src/lib/account-mappings-scope.test.ts` | ✅ Complete |
| `apps/api/src/lib/sales-posting-fallback.test.ts` | ✅ Complete |
| `e2e-tests/account-mappings-behavior.spec.mjs` | ✅ Complete |
| `e2e-tests/outlet-account-mappings-api.spec.mjs` | ✅ Complete |
| `e2e-tests/payment-defaults-api.spec.mjs` | ✅ Complete |
| `e2e-tests/payment-defaults.spec.mjs` | ✅ Complete |

### 9.2 Useful Commands
```bash
# Unit - scope validation
node --test --import tsx apps/api/src/lib/account-mappings-scope.test.ts

# Unit - posting fallback
node --test --import tsx apps/api/src/lib/sales-posting-fallback.test.ts

# Start API (for behavior/e2e that require live endpoints)
npm run dev -w @jurnapod/api

# E2E
node --test e2e-tests/account-mappings-behavior.spec.mjs
node e2e-tests/outlet-account-mappings-api.spec.mjs
node e2e-tests/payment-defaults-api.spec.mjs
```
