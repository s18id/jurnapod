# Response Envelope Checkpoint (Mon Mar 02 2026)

## Goal

Standardize all API responses to a consistent `{ success: true, data: ... }` envelope (and `{ success: false, error: { code, message } }` for errors), update shared schemas and all clients/tests to match.

## Instructions

- Use a shared helper for responses to avoid redeclaring envelopes.
- Keep success envelope `{ success: true, data: ... }`, use HTTP status codes normally (201 for created), and return `{ success: true, data: null }` for empty success.
- Continue auditing all API routes; add todo list items per module and update clients/tests accordingly.

## Discoveries

- Users API originally returned `{ ok: true, users/user }`; backoffice expected `{ success: true, data }` causing list not to render.
- Response helper added at `apps/api/src/lib/response.ts`.
- Existing shared schemas used `ok: true` in `packages/shared/src/schemas/*` and were updated to success/data in: `feature-flags.ts`, `modules.ts`, `settings.ts`, `taxes.ts`, `master-data.ts`, `pos-sync.ts`.
- Sync pull/push and POS offline clients expected `ok` and raw payload; updated to new envelope.
- Several tests/scripts used `response.success` on fetch Response; fixed to `response.ok` where needed.

## Accomplished

- **Committed**: `ab4965b` "fix: add response helper and standardize users payloads" (users endpoints now use success/data, added helper).
- **Auth routes** standardized:
  - Updated `/api/auth/login`, `/api/auth/google`, `/api/auth/refresh` to return `{ success: true, data: { access_token, token_type, expires_in } }`.
  - `/api/auth/logout` returns `{ success: true, data: null }`.
  - Adjusted type guards in auth routes for TS (`"accessToken" in authResult`, `"reason" in linkResult`, etc.).
- **Health endpoint** now returns success/data (`{ service: "jurnapod-api" }`) with helper.
- **Settings routes** standardized with helper + data envelope: `feature-flags`, `tax-defaults`, `tax-rates`, `tax-rates/[id]`, `modules`, `config`, `pages`, `pages/[id]`, `pages publish/unpublish`, `outlet-account-mappings`, `outlet-payment-method-mappings`, `module-roles`.
- **Sales routes** standardized: invoices list/single/post, payments list/single/post; use helper with `data` and list payloads wrapped in `data` (e.g. `{ total, invoices }`).
- **Inventory routes** standardized: items, items/[id], item-prices, item-prices/[id], item-prices/active, supplies, supplies/[id] using helper + data.
- **Public pages** `/api/pages/[slug]` now returns `{ success: true, data: page }`.
- **Outlets access** endpoint returns `data: null`.
- **Sync pull/push**:
  - `packages/shared/src/schemas/master-data.ts` adds `SyncPullPayloadSchema` and wraps response: `{ success: true, data: payload }`.
  - `packages/shared/src/schemas/pos-sync.ts` adds `SyncPushPayloadSchema` and wraps response: `{ success: true, data: { results } }`.
  - `apps/api/app/api/sync/pull/route.ts` returns `successResponse(payload)` using new payload schema.
  - `apps/api/app/api/sync/push/route.ts` uses `SyncPushPayloadSchema` + helper, returns `data` with correlation headers.
  - POS offline `sync-pull.ts` updated to new success/data envelope; `outbox-sender.ts` now handles envelope and uses `response.ok` for HTTP.
- **Backoffice & POS updates**:
  - `apps/backoffice/src/lib/session.ts` uses `auth.data.access_token`.
  - `apps/pos/src/main.tsx` updated login/google login for `data.access_token`; corrected Response checks.
  - `apps/pos/e2e/pwa-smoke.spec.ts` updated mocks for auth/health/sync pull to use `data`.
  - `apps/backoffice` updated for settings/tax rates/modules/static pages/supplies/sales invoices/payments (all use `response.data`).
  - `apps/backoffice/src/lib/cache-service.ts` uses `data` for inventory items/prices.
  - `apps/backoffice/src/hooks/use-outlet-account-mappings.ts` and `use-outlet-payment-method-mappings.ts` updated to data envelope.
  - `apps/backoffice/src/features/privacy-page.tsx` updated to `data`.
- **Tests/scripts** updated to new envelope:
  - Many integration tests updated to use `data` for users/auth/tax rates/settings/static pages/sales/master-data sync pull, etc.
  - Sync-push integration tests updated via helper `parseJsonResponse()` to unwrap `data.results` but maintain existing assertion logic.
  - `e2e-tests/payment-defaults*.spec.mjs` and `test-payment-defaults.mjs` updated to use `data` and correct `response.ok` vs body success.
  - POS offline `sync-pull` tests updated to use `data` in payload.

## Accomplished (remaining/in progress)

- **In progress**: continuing audit across reports, accounts, inventory, sales, sync, etc.
- **Remaining**:
  - Finish reports routes (`pos-payments`, `profit-loss`, `trial-balance`, `worksheet`) and update backoffice reports pages + tests.
  - Audit accounts routes and any account-related backoffice usage (accounts tree, types, etc.) to ensure data envelope.
  - Audit outlets/roles/companies routes still using success without data.
  - Update remaining tests/scripts for new envelopes (sync-push integration largely done, but confirm all results access uses `data` now; master-data integration to check any remaining `.prices` etc).
  - Fix any leftover `response.success` uses on fetch Response (should be `response.ok`).
  - Run grep for `success: true` payloads without `data` in API routes and update.
  - Update any remaining shared schemas still expecting old shapes.
  - Commit changes once audit complete.

## Relevant files / directories

- **Response helper**: `apps/api/src/lib/response.ts`
- **Users API**: `apps/api/app/api/users/**/route.ts`
- **Auth API**: `apps/api/app/api/auth/login/route.ts`, `apps/api/app/api/auth/google/route.ts`, `apps/api/app/api/auth/refresh/route.ts`, `apps/api/app/api/auth/logout/route.ts`
- **Health API**: `apps/api/app/api/health/route.ts`
- **Sync API**: `apps/api/app/api/sync/pull/route.ts`, `apps/api/app/api/sync/push/route.ts`
- **Settings API**: `apps/api/app/api/settings/**/route.ts` (feature-flags, tax-defaults, tax-rates, modules, config, pages, outlet mappings, module-roles)
- **Sales API**: `apps/api/app/api/sales/**/route.ts`
- **Inventory API**: `apps/api/app/api/inventory/**/route.ts`
- **Reports API**: `apps/api/app/api/reports/**/route.ts` (daily-sales/general-ledger/journals/pos-transactions updated; others pending)
- **Public pages API**: `apps/api/app/api/pages/[slug]/route.ts`
- **Shared schemas**: `packages/shared/src/schemas/feature-flags.ts`, `modules.ts`, `settings.ts`, `taxes.ts`, `master-data.ts`, `pos-sync.ts`
- **Backoffice**:
  - `apps/backoffice/src/lib/session.ts`
  - `apps/backoffice/src/lib/cache-service.ts`
  - `apps/backoffice/src/hooks/use-outlet-account-mappings.ts`
  - `apps/backoffice/src/hooks/use-outlet-payment-method-mappings.ts`
  - `apps/backoffice/src/features/*` (tax-rates-page.tsx, feature-settings-page.tsx, inventory-settings-page.tsx, modules-page.tsx, static-pages-page.tsx, supplies-page.tsx, sales-invoices-page.tsx, sales-payments-page.tsx, privacy-page.tsx)
- **POS**:
  - `apps/pos/src/main.tsx`
  - `apps/pos/src/offline/sync-pull.ts`
  - `apps/pos/src/offline/outbox-sender.ts`
  - `apps/pos/e2e/pwa-smoke.spec.ts`
  - `apps/pos/src/offline/__tests__/sync-pull.test.mjs`
- **Tests/scripts**:
  - `apps/api/tests/integration/*.mjs` (auth, users, tax-rates, static-pages, modules, sales, settings-config, master-data, sync-push)
  - `e2e-tests/payment-defaults*.spec.mjs`
  - `test-payment-defaults.mjs`
