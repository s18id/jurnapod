# Story 49.3: Purchasing Suite Determinism Hardening

**Status:** backlog

## Story

As a **QA engineer**,
I want all purchasing-domain integration test suites to produce consistent results across reruns,
So that AP correctness regressions (invoice posting, payment, credit notes, reconciliation) are not masked by flaky test behavior.

---

## Context

Epic 48 story 48.4 already stabilized `ap-reconciliation.test.ts` and `ap-reconciliation-snapshots.test.ts`. Story 49.3 extends purchasing-domain hardening to all remaining purchasing suites identified in the Story 49.1 audit:

- `apps/api/__test__/integration/purchasing/purchase-orders.test.ts`
- `apps/api/__test__/integration/purchasing/goods-receipts.test.ts`
- `apps/api/__test__/integration/purchasing/purchase-invoices.test.ts`
- `apps/api/__test__/integration/purchasing/ap-payments.test.ts`
- `apps/api/__test__/integration/purchasing/purchase-credits.test.ts`
- `apps/api/__test__/integration/purchasing/suppliers.test.ts`
- `apps/api/__test__/integration/purchasing/supplier-statements.test.ts`
- `apps/api/__test__/integration/purchasing/exchange-rates.test.ts`
- `apps/api/__test__/integration/purchasing/ap-aging-report.test.ts`
- `apps/api/__test__/integration/purchasing/po-order-no.concurrency.test.ts`
- `apps/api/__test__/integration/purchasing/supplier-soft-delete.regression.test.ts`
- `apps/api/__test__/integration/purchasing/supplier-contacts.test.ts`
- `apps/api/__test__/integration/purchasing/suppliers-tenant-isolation.test.ts`

Also includes any new purchasing suites discovered in the Story 49.1 audit.

## Acceptance Criteria

**AC1: Time-Dependent Fixes**
All `Date.now()`, `new Date()`, and `Math.random()` usages within in-scope suites must be replaced with:
- Deterministic Unix-millisecond timestamps from canonical fixtures
- `crypto.randomUUID()` for idempotency keys and unique fixture identifiers
- No wall-clock time in assertions or fixture setup that affects test outcomes

**AC2: Pool Cleanup Verification**
Every in-scope suite must have a verified `afterAll` that closes the DB pool and releases any RWLock. Verify with `--detect-open-handles`.

**AC3: Fixture Isolation**
Each `describe` block uses a unique `company_id` and `outlet_id`. No test may depend on state created by another `it()` block within the same suite. Use canonical seed helpers from `packages/db/test-fixtures.ts` or `apps/api/src/lib/test-fixtures.ts`.

**AC4: RWLock Pattern**
Any in-scope suite that uses the test server (HTTP requests) must use `acquireReadLock`/`releaseReadLock`. If missing, add it.

**AC5: Concurrency Suite Determinism**
`po-order-no.concurrency.test.ts` exercises parallel order creation. Its determinism depends on:
- No shared idempotency key across parallel calls
- Deterministic error assertion order (use `Promise.allSettled` and assert by error type, not order)
- Fixed warehouse/outlet assignment for concurrent ops

**AC6: Tenant Isolation Suite Verification**
`suppliers-tenant-isolation.test.ts` and `suppliers-tenant-isolation.test.ts` must use distinct `company_id` values per test case. No cross-tenant data visible in any assertion.

**AC7: 3-Consecutive-Green Rerun Proof**
Each in-scope suite passes 3 times consecutively. Log evidence at:
- `apps/api/logs/s49-3-{suite-name}-run-{1,2,3}.log`

---

## Dev Notes

- **RWLock pattern**: Same as Story 49.2 — import from `../../helpers/setup`
- **Canonical fixtures**: If `purchase-orders.test.ts` or `purchase-invoices.test.ts` use ad-hoc SQL for fixture setup, refactor to use canonical helpers before adding determinism fixes
- **Exchange rates**: Date sensitivity is high in `exchange-rates.test.ts` — use fixed canonical timestamps, not `Date.now()`
- **Supplier soft delete**: This is a regression test — ensure it uses a fresh seeded supplier with deterministic IDs, not shared state from other tests
- **AP aging report**: Time-sensitive cutoff assertions must use fixed `as_of_date` values, not relative dates
- **Supplier statements**: Statement matching logic may depend on invoice date ordering — use fixed timestamp anchors

## Files In Scope

| File | Determinism Issues to Fix |
|------|--------------------------|
| `apps/api/__test__/integration/purchasing/purchase-orders.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/goods-receipts.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/purchase-invoices.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/ap-payments.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/purchase-credits.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/suppliers.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/supplier-statements.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/exchange-rates.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/ap-aging-report.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/po-order-no.concurrency.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/supplier-soft-delete.regression.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/supplier-contacts.test.ts` | (audit from 49.1) |
| `apps/api/__test__/integration/purchasing/suppliers-tenant-isolation.test.ts` | (audit from 49.1) |

## Validation Evidence

```bash
# Run each suite 3 times with isolated logs
for suite in purchase-orders goods-receipts purchase-invoices ap-payments \
  purchase-credits suppliers supplier-statements exchange-rates \
  ap-aging-report po-order-no.concurrency supplier-soft-delete \
  supplier-contacts suppliers-tenant-isolation; do
  for run in 1 2 3; do
    nohup npm run test:single -- \
      "apps/api/__test__/integration/purchasing/${suite}.test.ts" \
      > "apps/api/logs/s49-3-${suite}-run-${run}.log" 2>&1 &
  done
done
wait
```

All logs must show 0 failures.
