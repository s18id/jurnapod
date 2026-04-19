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
