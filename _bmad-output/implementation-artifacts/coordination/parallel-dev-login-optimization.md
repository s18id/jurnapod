# Parallel Dev Coordination: API Test Login Optimization

## Objective
Reduce integration test runtime and flakiness by removing repeated per-test `/api/auth/login` calls and reusing suite-level tokens/context where safe.

## Global Guardrails
- Do **not** change route/business logic behavior; test-only optimization unless absolutely necessary.
- Do **not** increase test timeout values.
- Preserve negative auth semantics (401/403 expectations).
- Preserve role semantics: use `CASHIER` for insufficient-permission tests.
- Ensure created users intended for login have deterministic password set.
- Keep ACL cleanup safe (no destructive system-role mutations).
- Prefer shared setup in `beforeAll` with reused tokens.
- Maintain/restore green typecheck and targeted test runs.

## Work Split (No Overlap)

### Dev-A Scope
Files:
- `apps/api/__test__/integration/companies/create.test.ts`
- `apps/api/__test__/integration/companies/list.test.ts`
- `apps/api/__test__/integration/companies/get-by-id.test.ts`

Task:
- Replace repeated login calls with shared suite token strategy.
- If test creates new login-capable user, set explicit password and reuse `loginForTest`.

### Dev-B Scope
Files:
- `apps/api/__test__/integration/outlets/create.test.ts`
- `apps/api/__test__/integration/outlets/access.test.ts`
- `apps/api/__test__/integration/outlets/delete.test.ts`
- `apps/api/__test__/integration/outlets/tenant-scope.test.ts`
- `apps/api/__test__/integration/outlets/get-by-id.test.ts`
- `apps/api/__test__/integration/outlets/list.test.ts`

Task:
- Apply same login/token reuse optimization without changing assertions/behavior.

## Expected Validation
- `npm run test:single -- <files in scope>`
- `npm run typecheck -w @jurnapod/api`

## Status
- Dev-A: PENDING
- Dev-B: PENDING
