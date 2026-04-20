# Story 49.4: Platform + ACL Suite Determinism Hardening

**Status:** backlog

## Story

As a **QA engineer**,
I want all platform-domain and ACL integration test suites to produce consistent results across reruns,
So that tenant isolation and permission regressions are not masked by flaky test behavior.

---

## Context

The platform and ACL domain is correctness-critical: tenant data leaks and permission bypasses are P0/P1 issues. Story 49.4 hardens platform and ACL suites identified in the Story 49.1 audit:

Platform suites:
- `apps/api/__test__/integration/platform/customers.test.ts`
- `apps/api/__test__/integration/outlets/tenant-scope.test.ts`
- `apps/api/__test__/integration/outlets/create.test.ts`
- `apps/api/__test__/integration/companies/create.test.ts`
- `apps/api/__test__/integration/companies/update.test.ts`
- `apps/api/__test__/integration/companies/get-by-id.test.ts`
- `apps/api/__test__/integration/companies/list.test.ts`
- `apps/api/__test__/integration/users/create.test.ts`
- `apps/api/__test__/integration/users/update.test.ts`
- `apps/api/__test__/integration/users/list.test.ts`
- `apps/api/__test__/integration/users/get-by-id.test.ts`
- `apps/api/__test__/integration/users/roles.test.ts`
- `apps/api/__test__/integration/users/tenant-scope.test.ts`
- `apps/api/__test__/integration/users/activate.test.ts`
- `apps/api/__test__/integration/users/password.test.ts`
- `apps/api/__test__/integration/users/outlets.test.ts`
- `apps/api/__test__/integration/users/me.test.ts`

ACL/Permission suites:
- `packages/auth/__test__/integration/resource-level-acl.integration.test.ts`
- `packages/auth/__test__/integration/access-check.integration.test.ts`
- `packages/auth/__test__/integration/tokens.integration.test.ts`
- `packages/auth/__test__/integration/refresh-tokens.integration.test.ts`
- `packages/auth/__test__/integration/login-throttle.integration.test.ts`

Also includes any new platform/ACL suites discovered in the Story 49.1 audit.

## Acceptance Criteria

**AC1: Tenant Isolation Verification**
Each platform suite must use unique `company_id` and `outlet_id` values. There must be NO cross-tenant data visibility in any assertion. Specifically:
- `tenant-scope.test.ts` must verify data from Company A is invisible to Company B
- User creation tests must use deterministic role IDs from canonical fixtures

**AC2: ACL Suite Determinism**
`resource-level-acl.integration.test.ts` and `access-check.integration.test.ts` must use:
- Fixed role IDs from canonical fixtures (no `Math.random()` for role assignment)
- Deterministic permission assertions (no ordering assumptions about which deny occurs first)
- Deterministic token generation (use canonical seed tokens, not `Date.now()`-based)

**AC3: Time-Dependent Fixes**
All `Date.now()`, `new Date()`, and `Math.random()` usages within in-scope suites replaced with deterministic alternatives.

**AC4: Pool Cleanup Verification**
Every in-scope suite has a verified `afterAll` that closes the DB pool and releases RWLock.

**AC5: 3-Consecutive-Green Rerun Proof**
Each in-scope suite passes 3 times consecutively with zero failures. Log evidence at:
- `apps/api/logs/s49-4-{suite-name}-run-{1,2,3}.log`
- `packages/auth/logs/s49-4-{suite-name}-run-{1,2,3}.log`

---

## Dev Notes

- **Canonical ACL fixtures**: Use `packages/auth/__test__/fixtures/` for role and permission fixtures. Do NOT ad-hoc insert into `module_roles` — this is a P0 ACL corruption risk per AGENTS.md policy.
- **Token determinism**: Login tests may generate JWTs — use fixed `iat`/`exp` values or mock the token generation with a deterministic seed
- **Login throttle**: Time-based throttle tests are inherently time-dependent. Use `vi.useFakeTimers()` for throttle boundary tests instead of real delays.
- **RWLock**: Suites that use the HTTP test server must use `acquireReadLock`/`releaseReadLock`
- **Customer tests**: `platform/customers.test.ts` — ensure tenant isolation with unique `company_id`

## Files In Scope

| File | Determinism Issues to Fix |
|------|--------------------------|
| `apps/api/__test__/integration/platform/customers.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/outlets/tenant-scope.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/outlets/create.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/companies/create.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/companies/update.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/companies/get-by-id.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/companies/list.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/users/create.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/users/update.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/users/list.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/users/get-by-id.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/users/roles.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/users/tenant-scope.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/users/activate.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/users/password.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/users/outlets.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/users/me.test.ts` | (audit from 49.1) |
| `packages/auth/__test__/integration/resource-level-acl.integration.test.ts` | (audit from 49.1) |
| `packages/auth/__test__/integration/access-check.integration.test.ts` | (audit from 49.1) |
| `packages/auth/__test__/integration/tokens.integration.test.ts` | (audit from 49.1) |
| `packages/auth/__test__/integration/refresh-tokens.integration.test.ts` | (audit from 49.1) |
| `packages/auth/__test__/integration/login-throttle.integration.test.ts` | (audit from 49.1) |

## Validation Evidence

```bash
# API platform suites
for suite in customers tenant-scope create \
  companies/create companies/update companies/get-by-id companies/list \
  users/create users/update users/list users/get-by-id users/roles \
  users/tenant-scope users/activate users/password users/outlets users/me; do
  for run in 1 2 3; do
    nohup npm run test:single -- \
      "apps/api/__test__/integration/platform/${suite}.test.ts" \
      > "apps/api/logs/s49-4-${suite}-run-${run}.log" 2>&1 &
  done
done

# Auth packages suites
for suite in resource-level-acl.integration access-check.integration \
  tokens.integration refresh-tokens.integration login-throttle.integration; do
  for run in 1 2 3; do
    nohup npm run test:single -- \
      "packages/auth/__test__/integration/${suite}.test.ts" \
      > "packages/auth/logs/s49-4-${suite}-run-${run}.log" 2>&1 &
  done
done
wait
```

All logs must show 0 failures.
