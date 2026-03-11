# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Account Mappings Page (Backoffice)**: Invoice default can remain selected after payment method account is cleared.
  - **Scope A (UI State)**: Hydration effect now validates account exists before accepting backend invoice default; Select onChange clears default immediately when account is cleared.
  - **Scope B (Payload)**: `handlePaymentSave` now only sends `is_invoice_default: true` when method has a non-blank mapped account.
  - **Scope C (API Boundary)**: `useOutletPaymentMethodMappings.save()` normalizes outlet scope mappings to strip `is_invoice_default` when account is blank (defense-in-depth).
  - Files: `apps/backoffice/src/features/account-mappings-page.tsx`, `apps/backoffice/src/hooks/use-outlet-payment-method-mappings.ts`
