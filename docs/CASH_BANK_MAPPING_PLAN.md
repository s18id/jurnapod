# Cash/Bank Mapping Migration Plan

## Goal
Standardize outlet account mappings to use `CASH_BANK` for sales payment destination, remove legacy `CASH/QRIS` keys in `outlet_account_mappings`, and block posting when required mappings (AR/SALES_REVENUE/SALES_TAX) are missing.

## Scope
- Outlet account mappings: migrate to `CASH_BANK`.
- Sales invoice posting: block if required mappings missing.
- Sales payment posting: block if required mappings missing.
- Backoffice UI: disable Post actions when required mappings missing; allow drafts.
- POS mappings remain in `outlet_payment_method_mappings`.

## Non-Goals
- Changing POS payment method behavior or UX.
- Altering GL posting rules beyond mapping validation.

## Migration Steps
1) **DB Constraint Update**
   - Add `CASH_BANK` to the allowed mapping keys.
   - Remove `CASH` and `QRIS` from `outlet_account_mappings` constraint.

2) **Backfill**
   - If `CASH_BANK` is missing and `CASH` exists, create `CASH_BANK` using the same `account_id`.
   - Else if `CASH` missing but `QRIS` exists, use `QRIS` to seed `CASH_BANK`.
   - Optionally delete legacy `CASH/QRIS` rows after backfill.

## API Changes
1) **Outlet Account Mappings Validation**
   - Allow only `AR`, `SALES_REVENUE`, `SALES_TAX`, `CASH_BANK` in `outlet_account_mappings` API.

2) **Posting Guards (Server-Side)**
   - Invoice posting: block if any of `AR/SALES_REVENUE/SALES_TAX` are missing.
   - Payment posting: block if any of `AR/SALES_REVENUE/SALES_TAX` are missing.
   - Draft creation/editing remains allowed.

## Backoffice UI Changes
1) **Sales Invoices**
   - Disable Post action if required mappings missing.
   - Show a clear blocking message directing to Account Mappings.

2) **Sales Payments**
   - Default payment account to `CASH_BANK` if configured.
   - If `CASH_BANK` missing, allow manual selection with a warning.
   - Disable Post action if required mappings missing.

## Key Locations
- DB constraint/migration: `packages/db/migrations/0007_outlet_account_mappings.sql`, new migration file.
- API mapping validation: `apps/api/app/api/settings/outlet-account-mappings/route.ts`.
- Posting guards: `apps/api/src/lib/sales.ts`, `apps/api/src/lib/sales-posting.ts`.
- Backoffice UI: `apps/backoffice/src/features/sales-invoices-page.tsx`, `apps/backoffice/src/features/sales-payments-page.tsx`.

## Test Plan
- API integration tests:
  - `node apps/api/tests/integration/sales.integration.test.mjs`
  - `node apps/api/tests/integration/sync-push.integration.test.mjs`
- Manual UI checks:
  - Sales Invoices: Post disabled when mappings missing.
  - Sales Payments: Post disabled when mappings missing; account default set to `CASH_BANK`.

## Risks & Mitigations
- **Risk:** Existing outlets only have `CASH/QRIS` mappings.
  - **Mitigation:** Backfill `CASH_BANK` before removing legacy keys.
- **Risk:** Posting failures if mappings incomplete.
  - **Mitigation:** UI block and clear error messages; drafts remain allowed.
