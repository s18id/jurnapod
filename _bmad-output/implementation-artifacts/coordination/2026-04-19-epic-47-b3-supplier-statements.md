# Coordination: Epic 47 B3 — Story 47.3 Supplier Statement Matching (Manual MVP)

**Date:** 2026-04-19  
**Owner:** BMAD build agent  
**Implementation delegate:** `@bmad-dev`  
**Review delegate:** `@bmad-review`

## Scope Decision

- User selected **47.2 scope-only lint cleanup** before continuing.
- Full-package API lint still has legacy route-library errors outside Story 47 scope; do not broaden this batch to those refactors.

## Objective

Implement Story 47.3 endpoints and service logic for manual supplier statement entry, reconciliation, and status updates with strict tenant isolation and ACL.

## Target Endpoints

- `POST /api/purchasing/supplier-statements`
- `GET /api/purchasing/supplier-statements`
- `GET /api/purchasing/supplier-statements/:id/reconcile`
- `PUT /api/purchasing/supplier-statements/:id/reconcile`

## Functional Checklist

- [ ] Create supplier statement entry (supplier_id, statement_date, closing_balance, currency)
- [ ] Per-supplier AP subledger balance as-of statement date
- [ ] Compare statement balance vs subledger balance with variance and tolerance flag
- [ ] List/filter by supplier/date/status
- [ ] Mark reconciled with `reconciled_at` and `reconciled_by_user_id`
- [ ] Reuse Story 47.2 AP detail semantics for variance investigation path (at minimum reconcile response includes supplier-scoped AP detail references)

## Guardrails (P0/P1)

- **P0:** No cross-tenant leakage (`company_id` scoping on all reads/writes)
- **P1:** Money math precision must be decimal-safe (no float math)
- **P1:** Fail on invalid supplier ownership (supplier must belong to company)
- **P1:** ACL must be explicit resource-level and consistent per endpoint
- **P1:** Use library-first route pattern (no direct DB business logic in route files)

## ACL Mapping (for implementation)

- Create/list/reconcile read: `purchasing.suppliers` + `ANALYZE`
- Mark reconciled (PUT): `purchasing.suppliers` + `UPDATE`

## Testing Checklist

- [ ] Integration tests for create/list/reconcile/mark reconciled
- [ ] Integration tests for tenant isolation (company A cannot access B statements)
- [ ] Integration tests for ACL 401/403/200 using low-privilege role for deny
- [ ] Integration tests for variance tolerance behavior

## Validation Commands

- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/supplier-statements.test.ts`
- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing`
- `npm run build -w @jurnapod/shared`
- `npm run typecheck -w @jurnapod/api`

> Test runs must use background `nohup + pid + logs` workflow.

## Expected Artifacts

- Route file: `apps/api/src/routes/purchasing/supplier-statements.ts`
- Route registration: `apps/api/src/routes/purchasing/index.ts`
- Service file: `apps/api/src/lib/purchasing/supplier-statements.ts`
- Shared schema/constants updates in `packages/shared`
- Integration tests: `apps/api/__test__/integration/purchasing/supplier-statements.test.ts`

## Follow-up Batch: P0/P1 Remediation (Post-Review)

Review gate surfaced blocking findings. This follow-up batch is mandatory before Story 47.3 closeout:

- **P0 ACL baseline safety in tests**
  - Remove system-role mutation (`allowSystemRoleMutation: true`) from supplier statements integration tests.
  - Use a custom test role for scoped permissions.
- **P1 subledger correctness**
  - Extend supplier subledger as-of logic to include **prepayments** handling.
  - Ensure as-of filters are applied consistently for payment/credit effects.
- **P1 create-race safety**
  - Make statement creation duplicate-safe under concurrency using DB unique key handling (and map duplicate to 409 business error path).

Validation for remediation batch:

- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/supplier-statements.test.ts`
- `npm run typecheck -w @jurnapod/api`

Exit criteria:

- No unresolved **P0/P1** findings from `@bmad-review` for Story 47.3 patch scope.

## Parallel Remediation Wave (Guardrail Execution)

**Decision lock:** Keep FX conversion policy on **transaction-date basis** (as specified in Story 47.3 AC2), not statement-date revaluation.

### Work Package Locks (parallel-safe)

- **WP-A (P0 fixture policy)** — owner `@bmad-dev`
  - Files (exclusive):
    - `apps/api/src/lib/test-fixtures.ts`
    - `apps/api/__test__/integration/purchasing/supplier-statements.test.ts`
  - Tasks:
    - Fix `createTestSupplierStatement` schema drift (`currency_code`)
    - Replace raw SQL setup inserts with canonical fixture helper

- **WP-B (P1 finance correctness)** — owner `@bmad-dev`
  - Files (exclusive):
    - `apps/api/src/lib/purchasing/supplier-statements.ts`
  - Tasks:
    - Sign-aware rounding for negative values in base->currency conversion
    - Credit application as-of filter uses `pca.applied_at`
    - Keep transaction-date FX basis with explicit code comment

- **WP-C (P2 route consistency)** — owner `@bmad-dev`
  - Files (exclusive):
    - `apps/api/src/routes/purchasing/supplier-statements.ts`
  - Tasks:
    - Normalize `SUPPLIER_STATEMENT_SUPPLIER_NOT_OWNED` error code mapping
    - Remove dead/unreachable error mapping branches if confirmed unreachable
    - Keep ACL mapping: POST=CREATE, GET/GET-reconcile=ANALYZE, PUT=UPDATE

### Integration + Gate

- Merge all WPs
- Validate via nohup+pid logs:
  - `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/supplier-statements.test.ts`
  - `npm run typecheck -w @jurnapod/api`
- Run `@bmad-review` final gate

## Closeout

- ✅ `story-47.3.md` updated to `done`
- ✅ `story-47.3.completion.md` created
- ✅ `sprint-status.yaml` updated (canonical utility): `47-3-supplier-statement-matching: done`
- ✅ No P0/P1 blockers

## Guardrail Wave 2 (Post-Gate P1 fixes)

Decision:
- Use **full-day inclusive** statement cutoff for credit applications via end-exclusive datetime bound (`< next day`).
- Keep transaction-date FX basis policy.

Parallel narrow scopes:

- WP-1 service correctness (`apps/api/src/lib/purchasing/supplier-statements.ts`)
  - Fix sign-aware rounding in `computeBaseAmount`
  - Fix `pca.applied_at` cutoff to include full statement date without wrapping indexed columns
  - Add inline comments explaining each fix

- WP-2 test regression (`apps/api/__test__/integration/purchasing/supplier-statements.test.ts`)
  - Add CASHIER-negative test for PUT reconcile
  - Add inline comment explaining regression intent

- WP-3 route consistency (`apps/api/src/routes/purchasing/supplier-statements.ts`)
  - Confirm/normalize supplier-not-owned error code mapping and add note comment
