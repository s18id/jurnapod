# Coordination: Epic 47 B2B — Story 47.5 Period-Close Guardrails for AP

**Date:** 2026-04-20  
**Owner:** BMAD build agent  
**Implementation delegates:** `@bmad-dev`, `@bmad-qa`  
**Review delegate:** `@bmad-review`

## Decision Lock (User-Approved Recommended Options)

- Override ACL uses **`accounting.fiscal_years` + `MANAGE`**.
- Bulk fail-fast scope is limited to **current AP APIs only** in this story.
- Override input shape uses optional **`override_reason`** request field, and it is mandatory only when override path is exercised.

## Detailed Checklist (Execution Guardrail)

1. [ ] Add shared setting key and schema support for AP period-close guardrail strictness.
2. [ ] Add DB migration for `period_close_overrides` with append-only immutability protection.
3. [ ] Update Kysely schema typings for `period_close_overrides`.
4. [ ] Implement reusable AP period-close guardrail service:
   - [ ] detect closed status via `fiscal_periods` (primary)
   - [ ] fallback to `fiscal_years` closed status
   - [ ] tenant-safe lookup (`company_id`)
   - [ ] override eligibility check via ACL contract
5. [ ] Integrate guardrail checks into AP routes and AP service transaction flows:
   - [ ] purchase invoices (create/post/void)
   - [ ] AP payments (create/post/void)
   - [ ] purchase credits (create/apply/void)
6. [ ] Ensure override audit insert (`period_close_overrides`) is atomic with AP mutation.
7. [ ] Fix fiscal period fixture drift (`period_no`, status int mapping) for reliable tests.
8. [ ] Add integration tests for block/override/ACL/tenant isolation/correction flows.
9. [ ] Run targeted build/typecheck/tests with `nohup + pid + logs`.
10. [ ] Run final adversarial review gate (`@bmad-review`) and address blockers.

## Work Package Locks

### WP-A1 (parallel) — Shared setting + schema key
- Owner: `@bmad-dev`
- Files:
  - `packages/shared/src/schemas/settings.ts`
  - `packages/modules/platform/src/companies/constants/settings-definitions.ts`
  - `packages/shared/src/index.ts` (if export updates needed)
- Requirements:
  - Add `accounting.ap_period_close_guardrail` with default strict behavior.
  - Keep backward compatibility (optional, additive only).
  - Add inline fix comments: `FIX(47.5-WP-A1): ...`

### WP-A2 (parallel) — DB migration + Kysely typing
- Owner: `@bmad-dev`
- Files:
  - `packages/db/migrations/0189_period_close_overrides.sql` (new)
  - `packages/db/src/kysely/schema.ts`
- Requirements:
  - Add `period_close_overrides` with required indexes and FK safety.
  - Add append-only triggers to block UPDATE/DELETE.
  - Keep migration idempotent and MySQL/MariaDB compatible.
  - Add inline fix comments: `FIX(47.5-WP-A2): ...`

### WP-B (sequential after A1/A2) — Guardrail service + fixture alignment
- Owner: `@bmad-dev`
- Files:
  - `apps/api/src/lib/accounting/ap-period-close-guardrail.ts` (new)
  - `apps/api/src/lib/test-fixtures.ts`
- Requirements:
  - Implement decision API for closed-period block / override.
  - Use `fiscal_periods` primary lookup and `fiscal_years` fallback.
  - Add helper to build override audit row payload.
  - Fix fiscal period fixture schema mismatch (`period_no`, status int).
  - Add inline fix comments: `FIX(47.5-WP-B): ...`

### WP-C (sequential after B) — Route + service integration
- Owner: `@bmad-dev`
- Files:
  - `apps/api/src/routes/purchasing/purchase-invoices.ts`
  - `apps/api/src/routes/purchasing/ap-payments.ts`
  - `apps/api/src/routes/purchasing/purchase-credits.ts`
  - `apps/api/src/lib/purchasing/purchase-invoice.ts`
  - `apps/api/src/lib/purchasing/ap-payment.ts`
  - `apps/api/src/lib/purchasing/purchase-credit.ts`
  - `packages/shared/src/schemas/purchasing.ts`
- Requirements:
  - Enforce guardrail before AP business mutation logic.
  - For successful override path, insert `period_close_overrides` inside same DB transaction.
  - Require `override_reason` when closed period + override allowed flow is used.
  - Add inline fix comments: `FIX(47.5-WP-C): ...`

### WP-D (sequential after C) — Integration tests
- Owner: `@bmad-qa`
- Files:
  - `apps/api/__test__/integration/accounting/period-close-guardrail.test.ts` (new)
- Requirements:
  - 409 block path for closed periods.
  - override success with audit row persisted.
  - insufficient permission denial with low-priv/custom role.
  - tenant isolation for lookup and mutation.
  - correction flow validation (post/apply/void under closed period).
  - no system-role mutation in test ACL setup.
  - Add inline fix comments: `FIX(47.5-WP-D): ...`

## Validation Commands

- `npm run build -w @jurnapod/shared`
- `npm run typecheck -w @jurnapod/api`
- `npm run test:single -w @jurnapod/api -- __test__/integration/accounting/period-close-guardrail.test.ts`

> Execute tests using `nohup + pid + logs` policy.

## Exit Criteria

- Story 47.5 implementation complete with passing targeted tests and typecheck.
- `@bmad-review` reports **No unresolved P0/P1 blockers**.
