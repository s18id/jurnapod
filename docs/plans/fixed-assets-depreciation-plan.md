# Fixed Assets Depreciation Plan (Backoffice + GL)

Status: in progress (renaming equipment → fixed assets)

This plan defines the minimum scope to add depreciation planning and posting for fixed assets, aligned with accounting-first principles (journals as source of truth).

## Goal and Scope

Goal:
- Allow fixed assets to have a depreciation plan and post monthly depreciation to GL.

Scope (v1):
- Straight-line method only.
- Manual run per period (no scheduler).
- Backoffice CRUD for plan + run action.
- Journal posting per period with idempotency.

## Current Baseline

- Fixed assets master data exists: `fixed_assets` table and backoffice page.
- Posting engine exists: `packages/core/src/posting.ts`.
- Journals service exists for manual entries: `packages/modules/accounting/src/journals-service.ts`.
- Depreciation data model and API endpoints implemented.

## Architecture and Constraints

- Accounting/GL is the source of truth: every depreciation run posts a journal batch.
- All records are scoped by `company_id` and (when relevant) `outlet_id`.
- Monetary fields use `DECIMAL(18,2)` and `number` conversions in API responses.
- Idempotent runs: a plan can only post once per period.

## Delivery Phases

## Phase 1 - Shared Contracts + DB Schema

Tasks:
- Add shared Zod schemas and types for depreciation plan and run.
- Add DB migrations for plan and run tables.

Suggested targets:
- `packages/shared/src/schemas/depreciation.ts` (new)
- `packages/shared/src/index.ts` (export updates)
- `packages/db/migrations/0021_asset_depreciation.sql` (new)

Tables (minimum):
- `asset_depreciation_plans`
  - `company_id`, `asset_id`, `outlet_id`
  - `method` (enum: `STRAIGHT_LINE`)
  - `start_date`, `useful_life_months`, `salvage_value`
  - `purchase_cost_snapshot`
  - `expense_account_id`, `accum_depr_account_id`
  - `status` (`DRAFT|ACTIVE|VOID`)
- `asset_depreciation_runs`
  - `plan_id`, `period_year`, `period_month`, `run_date`
  - `amount`, `journal_batch_id`, `status`
  - Unique key on `(plan_id, period_year, period_month)`

Definition of done:
- Migrations run and schemas validated in shared contracts.

## Phase 2 - API Services + Routes

Tasks:
- CRUD endpoints for depreciation plans.
- Run endpoint that posts journals for a given period.
- Enforce idempotency and account validation.

Suggested targets:
- `apps/api/src/lib/depreciation.ts` (new)
- `apps/api/app/api/fixed-assets/[assetId]/depreciation-plan/route.ts` (new)
- `apps/api/app/api/depreciation/run/route.ts` (new)

Rules:
- Plan changes are blocked after any posted run (must VOID and recreate).
- `start_date` defaults to fixed asset `purchase_date` when present.
- `purchase_cost_snapshot` is stored to avoid drift if asset cost is edited.

Definition of done:
- API supports plan create/update/void and one-period run with idempotent responses.

## Phase 3 - Posting Integration

Tasks:
- Add posting mapper for `DEPRECIATION` doc type.
- Wrap run + posting in a DB transaction.

Suggested targets:
- `packages/core/src/posting.ts` (doc_type wiring only, if needed)
- `apps/api/src/lib/depreciation-posting.ts` (new)

Posting mapping (v1):
- Debit: Depreciation Expense (`expense_account_id`)
- Credit: Accumulated Depreciation (`accum_depr_account_id`)

Definition of done:
- Each run creates a balanced journal batch and returns `journal_batch_id`.

## Phase 4 - Backoffice UI

Tasks:
- Add depreciation plan form to fixed assets page.
- Add schedule preview and run action per period.

Suggested targets:
- `apps/backoffice/src/features/fixed-assets-page.tsx`
- `apps/backoffice/src/lib/api-client.ts` (endpoint helpers as needed)

Definition of done:
- Users can create/edit plan (until first run) and post a period from UI.

## Phase 5 - Tests and Acceptance

Tasks:
- Unit tests for schedule calculation.
- Integration tests for idempotent run and journal posting.

Suggested targets:
- `apps/api/tests/integration/depreciation.integration.test.mjs` (new)
- `packages/modules/accounting` (mapper tests if separated)

Required scenarios:
- Create plan and run for a period posts one journal batch.
- Duplicate run for same plan/period returns duplicate status without new journal.
- Journal lines are balanced and amounts match formula.
- Plan update blocked after posted runs.

Definition of done:
- Automated tests pass and key flows verified.

## Sequencing Recommendation

1) DB + shared contracts
2) API services + routes
3) Posting integration
4) Backoffice UI
5) Tests + acceptance evidence

## Risks and Mitigations

High:
- Incorrect account mapping posts to wrong GL accounts.
  - Mitigation: validate account types and enforce explicit account selection.

Medium:
- Cost edits after plan creation cause schedule drift.
  - Mitigation: store `purchase_cost_snapshot` in plan.

Low:
- Month-end date handling inconsistencies.
  - Mitigation: standardize run date to last day of period or explicit user input.

## Verification Checklist

API and DB:
- `npm run db:migrate`
- `npm run typecheck -w @jurnapod/api`
- `npm run test:integration -w @jurnapod/api`

Backoffice:
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`

Manual smoke:
- Create fixed asset, add depreciation plan, run a period.
- Verify journal batch and lines for that period.

## Terminology Note

- Database tables use `fixed_assets` and `asset_depreciation_*`
- API endpoints use `/fixed-assets` and `/depreciation`
- UI displays "Fixed Assets"
- This aligns with standard accounting terminology for depreciable capital assets
