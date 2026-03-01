# Milestone M7 PR-14 Implementation Plan (Backoffice v0)

Status: executed (kept as implementation record)

This plan turns the M7 audit findings into a delivery sequence for a minimal backoffice that lets admin/owner view sales and journal data.

## Goal and Scope

Goal:
- Backoffice v0 enables visibility for sales and journal with minimum operational screens.

PR-14 scope:
- Items + prices management.
- POS transactions list with outlet/date filters.
- Daily sales summary (using `v_pos_daily_totals` if available, otherwise API aggregate query).
- Journal list + simple trial balance.
- Acceptance: OWNER can view daily sales and journal.

## Initial Baseline (historical audit snapshot)

- `apps/backoffice/src/main.tsx` was scaffold-only at planning time.
- Existing API routes include auth/users/me/outlets/access and master data (`/api/inventory/items`, `/api/inventory/item-prices`).
- No reporting routes were present at planning time for POS list, daily sales, journal list, or trial balance.
- Core DB tables exist (`pos_transactions`, `journal_batches`, `journal_lines`).
- No confirmed migration for `v_pos_daily_totals` existed at planning time.

## Architecture and Constraints

- Multi-company and outlet scoping are mandatory in all report queries.
- Role baseline: `OWNER`, `ADMIN`, `CASHIER`, `ACCOUNTANT`; report endpoints require owner/admin/accountant at minimum.
- Monetary fields remain `DECIMAL` in SQL and string/number-safe handling in API responses.
- Keep accounting as source of truth: journal and trial balance derive from `journal_batches` + `journal_lines` + COA.

## Delivery Phases

## Phase 0 - Foundations and Route Skeleton (small setup)

Tasks:
- Backoffice app shell and route map.
- Shared fetch/auth utility for backoffice API calls.
- Basic RBAC-aware navigation (hide report links when unauthorized).

Suggested targets:
- `apps/backoffice/src/main.tsx`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/src/app/layout.tsx`
- `apps/backoffice/src/lib/api-client.ts`
- `apps/backoffice/src/lib/session.ts`

Definition of done:
- App has routes for items/prices, POS transactions, daily sales, journals/trial balance.
- Unauthorized users do not see protected menu entries.

## Phase 1 - Items + Prices Management (UI integration first)

Tasks:
- Build items list/create/edit/delete screen using existing endpoints.
- Build outlet-scoped item-price management screen using existing endpoints.
- Add form validation and server error handling aligned with existing API contracts.

Suggested targets:
- `apps/backoffice/src/features/items/items-page.tsx`
- `apps/backoffice/src/features/items/item-form.tsx`
- `apps/backoffice/src/features/prices/prices-page.tsx`
- `apps/backoffice/src/features/prices/price-form.tsx`
- `apps/backoffice/src/features/shared/table.tsx`

API dependency (already present):
- `apps/api/app/api/inventory/items/route.ts`
- `apps/api/app/api/inventory/items/[itemId]/route.ts`
- `apps/api/app/api/inventory/item-prices/route.ts`
- `apps/api/app/api/inventory/item-prices/[priceId]/route.ts`

Definition of done:
- Owner/admin can CRUD items and update outlet prices from backoffice.
- Data refreshes correctly after mutations.

## Phase 2 - POS Transactions List (new API + UI)

Tasks:
- Add API endpoint for paginated POS transactions with filters:
  - `company_id` (from auth context)
  - optional `outlet_id`
  - `date_from` / `date_to`
  - optional status (`COMPLETED`/`VOID`/`REFUND`)
- Add backoffice list screen with filter controls and totals row.

Suggested targets:
- `apps/api/app/api/reports/pos-transactions/route.ts`
- `apps/api/src/lib/reports.ts`
- `apps/backoffice/src/features/reports-pages.tsx`

Definition of done:
- Filtering by outlet/date works and returns scoped results.
- Endpoint enforces role + outlet access.

## Phase 3 - Daily Sales Summary (view-first strategy)

Decision path:
- Preferred: create DB view `v_pos_daily_totals` and query from API.
- Fallback: API aggregate query over `pos_transactions` grouped by day/outlet.

Tasks:
- Add migration for `v_pos_daily_totals` if missing.
- Add API route returning daily totals by date range and optional outlet.
- Add backoffice daily sales summary screen (table + quick date preset).

Suggested targets:
- `packages/db/migrations/0009_v_pos_daily_totals.sql`
- `apps/api/app/api/reports/daily-sales/route.ts`
- `apps/api/src/lib/reports.ts`
- `apps/backoffice/src/features/reports-pages.tsx`

Definition of done:
- Owner can view daily sales totals for accessible outlet(s).
- Output matches sampled POS transaction aggregates.

## Phase 4 - Journal List + Simple Trial Balance (new API + UI)

Tasks:
- Journal list endpoint with filters: `outlet_id`, `date_from`, `date_to`, optional account.
- Trial balance endpoint grouped by account with debit, credit, and balance.
- Backoffice screens for journal list and trial balance summary.

Suggested targets:
- `apps/api/app/api/reports/journals/route.ts`
- `apps/api/app/api/reports/trial-balance/route.ts`
- `apps/api/src/lib/reports.ts`
- `apps/backoffice/src/features/reports-pages.tsx`

Definition of done:
- Journal rows show source doc/date/ref and balanced lines.
- Trial balance debits and credits reconcile in test dataset.

## Phase 5 - Acceptance, Hardening, and Documentation

Tasks:
- Verify OWNER path end-to-end: login -> daily sales -> journal list/trial balance.
- Add integration tests for new report endpoints.
- Add minimal UI smoke checks for key backoffice views.
- Document API contracts and filters.

Suggested targets:
- `apps/api/tests/integration/reports.integration.test.mjs`
- `docs/api/m7-backoffice-reports-contract.md`
- `docs/checklists/m7-backoffice-acceptance-checklist.md`

Definition of done:
- Acceptance criterion passes with evidence logs/screenshots/query output.

## Sequencing and Dependencies

- Phase 0 is required before all UI phases.
- Phase 1 can run in parallel with API work for Phase 2/3/4 because master-data endpoints already exist.
- Phase 2 should land before Phase 3 to reuse shared sales-report query utilities.
- Phase 4 depends on finalizing reporting schema contracts in `packages/shared`.
- Phase 5 runs after all feature phases are merged.

## Risks and Mitigations

High:
- Missing/incorrect outlet scoping in report queries can leak data.
  - Mitigation: enforce company/outlet predicates in shared report service and integration tests.
- Trial balance miscalculation due to sign convention mismatch.
  - Mitigation: lock formula in tests with known journal fixtures.

Medium:
- `v_pos_daily_totals` absent or incompatible with current schema.
  - Mitigation: implement migration with fallback aggregate query feature flag in API.
- Backoffice has no router/UI baseline; initial setup can delay delivery.
  - Mitigation: keep v0 UI simple and table-first.

Low:
- Pagination/performance concerns on larger datasets.
  - Mitigation: add indexes and limit defaults; include date range requirement in API.

## Definition of Done (Milestone M7)

- PR-14 scope items are all implemented in UI + API where needed.
- OWNER can open daily sales summary and journal/trial balance pages and see scoped data.
- Role and outlet enforcement verified in integration tests.
- Daily sales output is correct against source POS transactions.
- Trial balance totals reconcile for seeded integration fixtures.
- Contracts/docs for new endpoints are added under `docs/api`.

## Verification Checklist

API and DB:
- `npm run db:migrate`
- `npm run typecheck -w @jurnapod/api`
- `npm run test:integration -w @jurnapod/api`

Backoffice:
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`

End-to-end manual checks:
- Login as OWNER and verify access to daily sales and journal pages.
- Filter POS transactions by outlet/date and confirm result boundaries.
- Compare daily sales totals against sampled POS transaction data.
- Confirm trial balance debit total equals credit total for selected range.

## Blockers / Assumptions

Assumptions:
- Backoffice can stay React-only v0 without adopting a full framework router outside local route setup.
- Existing auth token/session model can be reused by backoffice API client.
- Journal/COA tables in current schema are sufficient for simple trial balance.

Potential blockers:
- If schema lacks account master fields needed for readable trial balance labels, add migration/seed updates.
- If API auth middleware is tightly coupled to Next server-only runtime assumptions, backoffice session wiring may need adjustment.
