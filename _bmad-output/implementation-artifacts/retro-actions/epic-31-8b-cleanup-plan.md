# Epic 31-8b: Legacy Lib Cleanup Plan

## Overview

After module extractions (Epics 23-35), `apps/api/src/lib/` still contains duplicate/dead implementations that should be removed. This document audits all files and determines what to DELETE, KEEP, or REVIEW.

## Audit Criteria

- **DELETE**: Pure adapter/re-export with no own logic AND no route consumers AND no lib-internal consumers
- **KEEP**: Has actual implementation logic OR is actively used by routes
- **REVIEW**: Needs careful analysis before deletion

## Cleanup Plan

| File | Status | Reason | Module Owner |
|------|--------|--------|--------------|
| `account-types.ts` | REVIEW | Thin wrapper with no route consumers. Exports via accounting-services which is used by accounts.ts and journals.ts (both used by routes). Need to verify accounts.ts and journals.ts are the actual route entrypoints. | @jurnapod/modules-accounting |
| `accounting-import.ts` | KEEP | Has actual import implementation logic (778 lines). Used by routes/import.ts. | @jurnapod/modules-accounting |
| `accounting-services.ts` | KEEP | Singleton factory used by accounts.ts, journals.ts, account-types.ts which are used by routes. | @jurnapod/modules-accounting |
| `accounts.ts` | KEEP | Thin wrapper but actively used by routes/accounts.ts which has route consumers. | @jurnapod/modules-accounting |
| `admin-dashboards.ts` | KEEP | Used by admin-dashboards routes (2 route files). Has implementation (delegates to module services). | @jurnapod/modules-accounting |
| `audit-logs.ts` | REVIEW | Only imports from @jurnapod/modules-platform. No route consumers, no lib-internal consumers. Pure re-export candidate. | @jurnapod/modules-platform |
| `audit.ts` | KEEP | Used by routes/audit.ts (1 route file). Has logic. | @jurnapod/modules-platform |
| `auth-adapter.ts` | KEEP | Framework adapter for @jurnapod/auth. | @jurnapod/auth |
| `auth-client.ts` | KEEP | Used by routes/auth.ts. Has implementation. | @jurnapod/auth |
| `auth-guard.ts` | KEEP | Critical auth middleware, heavily used (43 route consumers). | @jurnapod/auth |
| `auth-throttle.ts` | KEEP | Used by routes/auth.ts. Has implementation. | @jurnapod/auth |
| `auth.ts` | KEEP | Critical auth logic, heavily used (44 route consumers). | @jurnapod/auth |
| `batch.ts` | DELETE | Pure utility (105 lines) with no route consumers. No lib-internal usage. | N/A |
| `cash-bank.ts` | DELETE | Pure re-export shim (48 lines). No route consumers. Route handlers use treasury-adapter.js directly. | @jurnapod/modules-treasury |
| `cogs-posting.test.ts` | KEEP | Test file. | N/A |
| `companies.ts` | KEEP | Actively used by routes/companies.ts (6 route consumers). Has implementation. | @jurnapod/modules-platform |
| `correlation-id.ts` | DELETE | Pure re-export (11 lines). No route consumers, no lib-internal usage. | @jurnapod/telemetry |
| `date-helpers.ts` | REVIEW | Used by 1 route (roles.ts) and 1 lib file (table-occupancy.ts). Has some utility functions. Need to check if utility is generic enough. | N/A |
| `db.ts` | KEEP | Core DB connection. Has 17 lib-internal consumers. | @jurnapod/db |
| `depreciation-posting.ts` | KEEP | Has actual implementation logic. Not heavily used but has implementation. | @jurnapod/modules-accounting |
| `email-outbox.ts` | REVIEW | No route consumers. No lib-internal consumers. Pure re-export candidate? Has some implementation (email queue). | @jurnapod/notifications |
| `email-tokens.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (213 lines). | @jurnapod/auth |
| `encryption.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (utility). | N/A |
| `env.ts` | KEEP | Used by routes/auth.ts. Core environment config. | N/A |
| `feature-flags.ts` | REVIEW | No route consumers. No lib-internal consumers. Pure re-export? | N/A |
| `features.ts` | KEEP | Used by routes/features.ts (1 route). Has implementation. | N/A |
| `fiscal-years.ts` | KEEP | Actively used (2 routes, 3 lib internal). Has implementation logic. | @jurnapod/modules-accounting |
| `google-oauth.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (213 lines). | @jurnapod/auth |
| `invoice-template.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (246 lines). | N/A |
| `item-barcodes.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (398 lines). | @jurnapod/modules-inventory |
| `item-images.ts` | KEEP | Used by routes/inventory-images.ts (1 route). Has implementation. | N/A |
| `item-variants.ts` | KEEP | Used by routes/pos-items.ts and routes/pos-cart.ts (2 routes). Has implementation. | @jurnapod/modules-inventory |
| `journals.ts` | KEEP | Actively used by routes/journals.ts (1 route). Thin wrapper but route is used. | @jurnapod/modules-accounting |
| `mailer.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (227 lines). | @jurnapod/notifications |
| `master-data-errors.ts` | KEEP | Re-export used by 2 routes and multiple lib files. | @jurnapod/shared |
| `numbering.ts` | REVIEW | No route consumers. 2 lib-internal consumers (table-occupancy.ts, tax-rates.ts). Need to check if those are still active. | N/A |
| `outlet-tables.ts` | KEEP | Deprecated wrapper but has 1 route consumer (dinein.ts). | @jurnapod/modules-reservations |
| `outlets.ts` | KEEP | Actively used by routes/outlets.ts (1 route). Has implementation. | @jurnapod/modules-platform |
| `pagination.ts` | REVIEW | No route consumers. No lib-internal consumers. Pure utility (65 lines). | N/A |
| `password-hash.ts` | KEEP | Used by auth.ts (critical auth logic). | @jurnapod/auth |
| `password-reset-throttle.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (134 lines). | @jurnapod/auth |
| `pdf-generator.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (92 lines). | N/A |
| `period-close-workspace.ts` | KEEP | Used by routes/admin-dashboards/period-close.ts (1 route). Has implementation. | @jurnapod/modules-accounting |
| `platform-settings-schemas.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (schema definitions). | @jurnapod/modules-platform |
| `platform-settings.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (257 lines). | @jurnapod/modules-platform |
| `recipe-composition.ts` | KEEP | Used by routes/recipes.ts (1 route). Has implementation. | @jurnapod/modules-inventory |
| `recipe-ingredients.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (223 lines). | @jurnapod/modules-inventory |
| `reconciliation-metrics.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (188 lines). | @jurnapod/modules-accounting |
| `reconciliation-service.ts` | DELETE | Pure re-export (53 lines). No route consumers, no lib-internal consumers. | @jurnapod/modules-accounting |
| `refresh-tokens.ts` | KEEP | Used by routes/auth.ts. Has implementation. | @jurnapod/auth |
| `report-context.ts` | KEEP | Used by routes/reports.ts (1 route). Has implementation. | @jurnapod/modules-reporting |
| `report-error-handler.ts` | KEEP | Used by routes/reports.ts (1 route). Has implementation. | N/A |
| `report-telemetry.ts` | KEEP | Used by routes/reports.ts (1 route). Has implementation. | @jurnapod/modules-reporting |
| `reports.ts` | DELETE | Pure re-export (43 lines). No route consumers. | @jurnapod/modules-reporting |
| `request-meta.ts` | KEEP | Used by 6 routes. Has implementation (15 lines). | N/A |
| `reservation-groups.ts` | DELETE | Deprecated re-export (144 lines). No route consumers. | @jurnapod/modules-reservations |
| `reservations.ts` | DELETE | Pure re-export (3 lines). No route consumers, no lib-internal consumers. | @jurnapod/modules-reservations |
| `response.ts` | KEEP | Heavily used (41 route consumers). Core HTTP response helpers. | N/A |
| `retry.ts` | REVIEW | No route consumers. No lib-internal consumers. Pure utility (79 lines). | N/A |
| `routes.ts` | KEEP | Route registration. | N/A |
| `sales-posting.ts` | KEEP | Used by routes/sales/payments.ts (1 route). Has implementation. | @jurnapod/modules-sales |
| `service-sessions.ts` | KEEP | Used by routes/dinein.ts (1 route). Re-export barrel. | @jurnapod/modules-reservations |
| `settings-modules.ts` | KEEP | Used by routes/settings-modules.ts (1 route). Has implementation. | @jurnapod/modules-platform |
| `settings.ts` | KEEP | Used by 2 routes. Has implementation. | @jurnapod/modules-platform |
| `static-pages-admin.ts` | KEEP | Used by routes/settings-pages.ts (1 route). Has implementation. | @jurnapod/modules-platform |
| `static-pages.ts` | KEEP | Used by routes/settings-pages.ts (1 route). Has implementation. | @jurnapod/modules-platform |
| `stock.ts` | KEEP | Used by routes/stock.ts (1 route). Has implementation. | @jurnapod/modules-inventory |
| `super-admin-audit.ts` | REVIEW | No route consumers. No lib-internal consumers. Has implementation (91 lines). | @jurnapod/modules-platform |
| `sync-modules.ts` | KEEP | Used by routes/sync.ts (3 routes). Has implementation. | @jurnapod/sync-core |
| `table-occupancy.ts` | KEEP | Actively used. Has implementation (840 lines). | @jurnapod/modules-reservations |
| `table-sync.ts` | KEEP | Used by sync routes. Has implementation. | @jurnapod/modules-reservations |
| `tax-rates.ts` | KEEP | Used by routes/tax-rates.ts (1 route). Thin wrapper but route consumer exists. | @jurnapod/modules-accounting |
| `taxes-kysely.ts` | REVIEW | No route consumers. 2 lib-internal consumers (tax-rates.ts, taxes.ts). Need to check if still needed as tax-rates.ts re-exports from it. | @jurnapod/modules-accounting |
| `taxes.ts` | KEEP | Has implementation (598 lines). 2 lib-internal consumers. | @jurnapod/modules-accounting |
| `test-fixtures.ts` | KEEP | Test infrastructure. Has many internal dependencies but that's expected for test fixtures. | N/A |
| `treasury-adapter.ts` | KEEP | Used by routes/cash-bank-transactions.ts (1 route). Has implementation (424 lines). | @jurnapod/modules-treasury |
| `users.ts` | KEEP | Actively used by routes/users.ts, routes/roles.ts (4 routes). Has implementation. | @jurnapod/modules-platform |

## DELETE Candidates (Executable)

These files are **pure re-exports with no consumers**:

1. `batch.ts` - Pure utility, no consumers
2. `cash-bank.ts` - Pure re-export, no consumers
3. `correlation-id.ts` - Pure re-export, no consumers
4. `reconciliation-service.ts` - Pure re-export, no consumers
5. `reports.ts` - Pure re-export, no consumers
6. `reservation-groups.ts` - Deprecated re-export, no consumers
7. `reservations.ts` - Pure re-export, no consumers

## REVIEW Candidates (Requires Verification)

### Audit-logs.ts
- **What to verify**: Check if audit-logs.ts has any actual implementation or is purely a re-export from modules-platform.
- **Action if pure re-export**: Delete after verifying no consumers.

### Email-outbox.ts, email-tokens.ts, encryption.ts, google-oauth.ts, mailer.ts, password-reset-throttle.ts, pdf-generator.ts, super-admin-audit.ts
- **What to verify**: Check if these have actual implementation logic or are dead code.
- **Action**: If purely utility/re-export with no consumers, mark for deletion.

### Pagination.ts, retry.ts, date-helpers.ts, feature-flags.ts
- **What to verify**: Check if they have generic utility code that could be kept.
- **Action**: If utility is used in only 1-2 places and those places could be migrated, consider deletion.

### Taxes-kysely.ts, item-barcodes.ts, invoice-template.ts, platform-settings.ts, platform-settings-schemas.ts
- **What to verify**: Check if they contain actual implementation that should be kept.
- **Action**: If implementation exists, keep. If pure re-export, consider deletion.

## Execution Log

### Attempted Deletions (Epic 31-8b)

Attempted to delete the following files as pure re-exports:

| File | Intended Action | Actual Result |
|------|-----------------|---------------|
| `batch.ts` | DELETE | ✅ Deleted successfully |
| `cash-bank.ts` | DELETE | ✅ Deleted successfully |
| `correlation-id.ts` | DELETE | ❌ Restored - hidden consumers in sync routes |
| `reconciliation-service.ts` | DELETE | ✅ Deleted successfully |
| `reports.ts` | DELETE | ❌ Restored - routes/reports.ts imports it |
| `reservation-groups.ts` | DELETE | ✅ Deleted successfully |
| `reservations.ts` | DELETE | ✅ Deleted successfully |

### Final State

**Successfully Deleted (5 files):**
- `apps/api/src/lib/batch.ts` - Pure utility, no consumers
- `apps/api/src/lib/cash-bank.ts` - Pure re-export, no consumers
- `apps/api/src/lib/reconciliation-service.ts` - Pure re-export, no consumers
- `apps/api/src/lib/reservation-groups.ts` - Deprecated re-export, no consumers
- `apps/api/src/lib/reservations.ts` - Pure re-export, no consumers

**Restored (2 files - had hidden consumers):**
- `apps/api/src/lib/correlation-id.ts` - Used by sync routes (sync/check-duplicate.ts, sync/pull.ts, sync/push.ts)
- `apps/api/src/lib/reports.ts` - Used by routes/reports.ts

### Validation Results

- `npm run typecheck -w @jurnapod/api` ✅ Passes
- `npm run build -w @jurnapod/api` ✅ Passes
- `npm run test -w @jurnapod/api -- --run` ⚠️ Server not running (expected in dev environment)

### Hidden Consumer Discovery

After attempting deletion, typecheck revealed:
1. **correlation-id.ts**: Used by sync routes via `../../lib/correlation-id.js`
2. **reports.ts**: Used by routes/reports.ts via `@/lib/reports`

These files appeared to have no consumers in initial analysis but actually had route consumers that were not detected by the pattern matching used.

### Next Steps (REVIEW candidates)

The following files were identified as potential DELETE candidates but need careful review before deletion:

1. **audit-logs.ts** - Pure re-export from modules-platform
2. **email-outbox.ts** - Email queue implementation
3. **email-tokens.ts** - Auth token utilities  
4. **encryption.ts** - Encryption utilities
5. **pagination.ts** - Pure utility (65 lines)
6. **retry.ts** - Pure utility (79 lines)
7. **google-oauth.ts** - OAuth implementation
8. **mailer.ts** - Email sending implementation
9. **pdf-generator.ts** - PDF generation
10. **password-reset-throttle.ts** - Auth throttle implementation
11. **super-admin-audit.ts** - Audit utilities
12. **feature-flags.ts** - Feature flag utilities

Before deleting these, verify:
1. No route imports
2. No lib-internal imports from other lib files
3. Any imports from within the file itself are self-contained