# Story 48.4: Integration Test Determinism Hardening

**Status:** ready-for-dev

## Story

As a **QA engineer**,  
I want integration tests to produce consistent results across reruns,  
So that flaky tests don't mask real correctness regressions.

---

## Context

Sprint 48 identified that flaky integration behavior may hide real correctness failures (Risk R48-004). Prior to R48-001 fixes, some AP reconciliation timezone tests were observed to fail depending on fixture state and timing assumptions. This story stabilizes the critical test fixtures and enforces a 3-consecutive-rerun proof requirement for suites in scope.

The critical suites are:
1. `__test__/integration/accounting/fiscal-year-close.test.ts`
2. `__test__/integration/purchasing/ap-reconciliation.test.ts`
3. `__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts`
4. `__test__/integration/accounting/period-close-guardrail.test.ts`

---

## Acceptance Criteria

**AC1: Fixture Lifecycle Audit**
For each critical suite, identify all fixture setup that:
- Uses `Date.now()` or `Math.random()` without deterministic anchors
- Shares mutable state across `it()` blocks without proper cleanup
- Depends on execution order between tests

For each finding, either refactor to deterministic or add explicit cleanup.

**AC2: 3-Consecutive-Run Proof**
Each critical suite must pass 3 times in a row with no modifications between runs. Log evidence for each run (timestamp, pass/fail, test count).

If any run fails, identify root cause and treat as P1 regression (must fix before story close).

**AC3: Remove Time/Ordering Assumptions**
Any test that relies on wall-clock time, sleep, or execution order must be refactored to use deterministic fixtures or explicit waits with known state.

**AC4: Deterministic Snapshot Replay Test**
The snapshot auto-creation test (triggered by fiscal-year close approve) must be stable regardless of prior test execution order. This requires that each test file resets its own snapshot state in `beforeAll` or uses tenant isolation to prevent cross-test interference.

**AC5: RWLock Enforcement Documented**
Confirm that all critical suites use the RWLock server pattern (single test server, read-lock beforeAll, release afterAll). If any suite is missing the pattern, add it.

---

## Tasks / Subtasks

- [ ] Audit fixture patterns in `fiscal-year-close.test.ts`, `ap-reconciliation.test.ts`, `ap-reconciliation-snapshots.test.ts`, `period-close-guardrail.test.ts`
- [ ] Identify and fix non-deterministic fixture patterns (Date.now(), random, shared mutable state)
- [ ] Run 3-consecutive-rerun for all 4 critical suites; collect evidence logs
- [ ] Fix any flakes found in reruns
- [ ] Add explicit teardown/reset for snapshot-related fixtures
- [ ] Verify RWLock pattern is present in all 4 suite files

---

## Technical Constraints

- No changes to business logic or application code should be needed — only test fixture hardening
- All tests must continue to pass the correctness criteria from Story 48-2
- If a test is found to be fundamentally non-deterministic (e.g., depends on external timing), tag it with a skip reason and file a follow-up issue

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/accounting/fiscal-year-close.test.ts` | Modify | Audit and harden fixture determinism |
| `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts` | Modify | Audit and harden fixture determinism |
| `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` | Modify | Audit and harden snapshot fixture lifecycle |
| `apps/api/__test__/integration/accounting/period-close-guardrail.test.ts` | Modify | Audit and harden fixture determinism |
| `apps/api/__test__/helpers/setup.ts` | Modify | Ensure RWLock pattern is enforced |

---

## Validation Evidence

```bash
# Run each suite 3 times and confirm consistent results
for i in 1 2 3; do
  echo "=== Run $i ===" >> logs/s48-4-fiscal-rerun.log
  npm run test:single -- __test__/integration/accounting/fiscal-year-close.test.ts >> logs/s48-4-fiscal-rerun.log 2>&1
done

for i in 1 2 3; do
  echo "=== Run $i ===" >> logs/s48-4-aprec-rerun.log
  npm run test:single -- __test__/integration/purchasing/ap-reconciliation.test.ts >> logs/s48-4-aprec-rerun.log 2>&1
done

# Each log should show: Test Files 1 passed (1), Tests N passed (N)
# No failures across any of the 3 runs
```

---

## Dev Notes

- Determinism failures often stem from test-company or test-outlet fixtures that generate non-unique codes when run in rapid succession. The fix is to include a run-unique suffix (e.g., `Date.now()` in the code but stable within a test run).
- Snapshot tests may share the same `company_id` across test files if they don't properly isolate. The `createTestFiscalCloseBalanceFixture` already uses deterministic code anchors; audit that no other fixture overrides these.
- The `period-close-guardrail.test.ts` may have timing assumptions around fiscal year state transitions — verify it cleans up FY state between runs.

---

## Risk Disposition

- R48-004 (flake): This story directly addresses this risk. Target is **mitigating** → **closed** after 3-rerun proof is documented.