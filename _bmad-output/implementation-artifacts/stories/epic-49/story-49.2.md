# Story 49.2: Accounting Suite Determinism Hardening

**Status:** backlog

## Story

As a **QA engineer**,
I want all accounting-domain integration test suites to produce consistent results across reruns,
So that financial correctness regressions are not masked by flaky test behavior.

---

## Context

Epic 48 story 48.4 already stabilized 4 critical suites including `fiscal-year-close.test.ts` and `period-close-guardrail.test.ts`. Story 49.2 extends accounting-domain hardening to all remaining accounting suites identified in the Story 49.1 audit:
- `apps/api/__test__/integration/accounting/ap-exceptions.test.ts`
- `apps/api/__test__/integration/admin-dashboards/reconciliation.test.ts`
- `apps/api/__test__/integration/admin-dashboards/period-close.test.ts`
- `apps/api/__test__/integration/admin-dashboards/trial-balance.test.ts`
- `apps/api/__test__/integration/sales/invoices-discounts.test.ts`
- `apps/api/__test__/integration/sales/invoices-update.test.ts`
- `apps/api/__test__/integration/sales/orders.test.ts`
- `apps/api/__test__/integration/sales/credit-notes-customer.test.ts`

Also includes any new accounting suites discovered in the Story 49.1 audit.

## Acceptance Criteria

**AC1: Time-Dependent Fixes**
All `Date.now()`, `new Date()`, and `Math.random()` usages within in-scope suites must be replaced with:
- Deterministic Unix-millisecond timestamps from canonical fixtures (e.g., `CANONICAL_TIMESTAMPS` from `packages/db/test-fixtures.ts`)
- `crypto.randomUUID()` for idempotency keys (standard Node.js API, no collision risk)
- No wall-clock time in assertions or fixture identifiers

**AC2: Pool Cleanup Verification**
Every in-scope suite must have a verified `afterAll` that:
- Closes the DB pool via `pool.end()` or `await db.destroy()`
- Calls `releaseReadLock()` if the suite uses RWLock
- Does NOT leave any async handles open

Verify by running the suite in isolation with `--detect-open-handles`.

**AC3: Fixture Isolation**
No test in-scope may share mutable state through persistent tables without explicit tenant isolation. Each `describe` block should use a unique `company_id` and `outlet_id` seed. If this requires fixture refactoring, use canonical helpers from `packages/db/test-fixtures.ts`.

**AC4: RWLock Pattern**
Any in-scope suite that imports from `helpers/setup` must use `acquireReadLock`/`releaseReadLock` in `beforeAll`/`afterAll`. If a suite is missing the lock pattern, add it.

**AC5: 3-Consecutive-Green Rerun Proof**
Each in-scope suite must pass 3 times consecutively with zero failures. Log evidence for each run (timestamp, pass/fail, test count). Store logs at:
- `apps/api/logs/s49-2-{suite-name}-run-{1,2,3}.log`

**AC6: Suite Pass at Baseline**
Before any hardening begins, run each in-scope suite once. Suites that fail at baseline (before fixes) must be explicitly tracked as baseline failures with a root-cause note. These failures must be fixed as part of this story's scope.

---

## Dev Notes

- **Priority order for fixes**: Start with `ap-exceptions.test.ts` (financial correctness — AP exception handling), then `reconciliation.test.ts`, `trial-balance.test.ts`, `period-close.test.ts`, then sales suites
- **RWLock import**: `import { acquireReadLock, releaseReadLock } from '../../helpers/setup'`
- **Pool cleanup pattern**:
  ```typescript
  afterAll(async () => {
    await releaseReadLock();
    await pool.end();
  });
  ```
- **Deterministic timestamp approach**: Use `CANONICAL_TIMESTAMPS` from `packages/db/test-fixtures.ts` for all date-based fixture values. If canonical fixtures don't exist for a needed timestamp range, add them to `packages/db/test-fixtures.ts` (do NOT use ad-hoc `new Date()`)
- **No fixture ordering assumptions**: Each `it()` block must be fully self-contained — no test should assume a prior `it()` block created or modified any state

## Files In Scope

| File | Determinism Issues to Fix |
|------|--------------------------|
| `apps/api/__test__/integration/accounting/ap-exceptions.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/admin-dashboards/reconciliation.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/admin-dashboards/period-close.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/admin-dashboards/trial-balance.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/sales/invoices-discounts.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/sales/invoices-update.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/sales/orders.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/sales/credit-notes-customer.test.ts` | (audit from 49.1) |

## Validation Evidence

```bash
# Run each suite 3 times with isolated logs
for suite in ap-exceptions reconciliation period-close trial-balance invoices-discounts invoices-update orders credit-notes-customer; do
  for run in 1 2 3; do
    nohup npm run test:single -- \
      "apps/api/__test__/integration/accounting/${suite}.test.ts" \
      > "apps/api/logs/s49-2-${suite}-run-${run}.log" 2>&1 &
  done
done
wait
```

All logs must show 0 failures.
