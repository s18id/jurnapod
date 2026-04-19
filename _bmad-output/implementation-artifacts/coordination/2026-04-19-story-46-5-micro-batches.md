# Coordination: Story 46.5 Purchase Invoices (Micro-Batches)

## Objective
Implement Story 46.5 accurately by delegating in small, dependency-safe scopes and validating each scope before moving forward.

## Mandatory Rule
- Status/state columns in new work must use `TINYINT` (no `ENUM` for status/state).

## Batch Plan

### Scope A — Purchasing AP account setting foundation
Files expected:
- `packages/db/migrations/*` (add `purchasing_default_ap_account_id` to `company_modules` + FK)
- `apps/api/src/lib/settings-modules.ts`

Acceptance:
- Settings module can read/write `purchasing_default_ap_account_id`
- Migration is idempotent and MySQL/MariaDB-safe

### Scope B — PI schema/contracts foundation
Files expected:
- `packages/db/migrations/*` (PI tables + ACL)
- `packages/db/src/kysely/schema.ts`
- `packages/shared/src/constants/purchasing.ts`
- `packages/shared/src/schemas/purchasing.ts`
- `packages/shared/src/index.ts`

Acceptance:
- `purchase_invoices.status` is `TINYINT`
- PI contracts compile and are exported
- ACL resource `purchasing.invoices` seeded

### Scope C — Domain service (library-first)
Files expected:
- `apps/api/src/lib/purchasing/purchase-invoice.ts`

Acceptance:
- Draft create/list/get implemented
- Post flow: exchange rate, account resolution, balanced journal creation, status transition
- Void flow: reversal journal + status transition
- Credit limit enforcement logic in post path

### Scope D — Route layer + fixtures + integration tests
Files expected:
- `apps/api/src/routes/purchasing/purchase-invoices.ts`
- `apps/api/src/routes/purchasing/index.ts`
- `apps/api/src/lib/test-fixtures.ts`
- `apps/api/__test__/integration/purchasing/purchase-invoices.test.ts`

Acceptance:
- Thin routes delegate to library
- ACL enforced with resource `purchasing.invoices`
- Integration tests cover create/post/void and failure paths

## Dependency Rules
- Scope A must complete before C (AP account resolution depends on it)
- Scope B must complete before C and D
- Scope C must complete before D
- Run review after each scope before proceeding

## Review & Quality Gate
- After each scope: delegate adversarial review to `@bmad-review`
- Before marking story done:
  - Build `@jurnapod/db`, `@jurnapod/shared`, `@jurnapod/api`
  - Run PI integration tests + purchasing regression suites
