# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Account Mappings Page (Backoffice)**: Split settings into tabs for clearer separation between Invoice and POS configuration.
  - **Invoice Tab**: Sales account mappings (AR, Sales Revenue, Sales Tax) + "Default Payment Bank Account" setting.
  - **POS Tab**: POS payment method mappings (method code, label, account).
  - Files: `apps/backoffice/src/features/account-mappings-page.tsx`

- **Invoice Payment Default (Backoffice)**: New dedicated "Default Payment Bank Account" setting stored in account mappings as `INVOICE_PAYMENT_BANK` key.
  - Separate from POS payment method mappings to avoid tangling concerns.
  - Used as default when creating sales payments in backoffice.
  - Supports company default with per-outlet override (inheritance).
  - Files: 
    - `packages/db/migrations/0082_account_mappings_add_invoice_payment_bank.sql`
    - `apps/backoffice/src/hooks/use-outlet-account-mappings.ts`
    - `apps/api/app/api/settings/outlet-account-mappings/route.ts`
    - `apps/backoffice/src/features/account-mappings-page.tsx`
    - `apps/backoffice/src/features/sales-payments-page.tsx`

### Changed

- **Account Mappings Page (Backoffice)**: Removed "Invoice Default" checkbox from POS payment methods table.
  - Invoice default is now configured via dedicated "Default Payment Bank Account" in Invoice tab.
  - Backward compatible: legacy `is_invoice_default` flag in payment method mappings still works as fallback.
  - Files: `apps/backoffice/src/features/account-mappings-page.tsx`

- **Sales Payments Page (Backoffice)**: Updated default payment account logic.
  - Now uses `INVOICE_PAYMENT_BANK` from account mappings as first priority.
  - Falls back to legacy `is_invoice_default` from payment method mappings for backward compatibility.
  - Files: `apps/backoffice/src/features/sales-payments-page.tsx`

### Fixed

- **Account Mappings Page (Backoffice)**: Invoice default can remain selected after payment method account is cleared.
  - **Scope A (UI State)**: Hydration effect now validates account exists before accepting backend invoice default; Select onChange clears default immediately when account is cleared.
  - **Scope B (Payload)**: `handlePaymentSave` now only sends `is_invoice_default: true` when method has a non-blank mapped account.
  - **Scope C (API Boundary)**: `useOutletPaymentMethodMappings.save()` normalizes outlet scope mappings to strip `is_invoice_default` when account is blank (defense-in-depth).
  - Files: `apps/backoffice/src/features/account-mappings-page.tsx`, `apps/backoffice/src/hooks/use-outlet-payment-method-mappings.ts`
