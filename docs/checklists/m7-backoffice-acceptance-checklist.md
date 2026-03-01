<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# M7 Backoffice v0 Acceptance Checklist

Status: implementation complete, verified in integration suite.

## PR-14 scope

- [x] Items + prices management
  - Backoffice UI: `apps/backoffice/src/features/items-prices-page.tsx`
  - API: `apps/api/app/api/inventory/items/route.ts`, `apps/api/app/api/inventory/item-prices/route.ts`

- [x] POS transactions list (outlet/date filters)
  - Backoffice UI: `apps/backoffice/src/features/reports-pages.tsx`
  - API: `apps/api/app/api/reports/pos-transactions/route.ts`
  - Query layer: `apps/api/src/lib/reports.ts`

- [x] Daily sales summary
  - API: `apps/api/app/api/reports/daily-sales/route.ts`
  - View migration: `packages/db/migrations/0009_v_pos_daily_totals.sql`
  - Fallback query: `apps/api/src/lib/reports.ts`

- [x] Journal list + simple trial balance
  - API: `apps/api/app/api/reports/journals/route.ts`
  - API: `apps/api/app/api/reports/trial-balance/route.ts`
  - Backoffice UI: `apps/backoffice/src/features/reports-pages.tsx`

## Acceptance criteria

- [x] OWNER can view daily sales and journal
  - Route/role coverage in UI routing: `apps/backoffice/src/app/routes.ts`
  - Role guards in API routes:
    - `apps/api/app/api/reports/daily-sales/route.ts`
    - `apps/api/app/api/reports/journals/route.ts`
  - Integration coverage: `apps/api/tests/integration/reports.integration.test.mjs`

## Concurrency and correctness hardening

- [x] DATETIME boundary correctness (`>= fromStart` and `< nextDayStart`)
- [x] Strict outlet scoping for journals/trial-balance on explicit `outlet_id`
- [x] Daily-sales fallback for missing/invalid view rollout cases
- [x] Snapshot hints for stable paging (`as_of`, `as_of_id`) on paginated reports

## Verification commands and latest result

- [x] `npm run typecheck -w @jurnapod/api`
- [x] `node --test "tests/integration/reports.integration.test.mjs"` (from `apps/api`)
- [x] `npm run test:integration -w @jurnapod/api`
- [x] `npm run build -w @jurnapod/api`
- [x] `npm run build -w @jurnapod/backoffice`
