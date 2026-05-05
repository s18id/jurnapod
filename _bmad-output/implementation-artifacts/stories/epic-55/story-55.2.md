# Story 55.2: Verify AP Reconciliation Computation Determinism

Status: ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 55 --story 55-2 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers

## Story

As an **accountant**,  
I want the **AP reconciliation computation (subledger balance, GL control balance, variance) to be deterministic**,  
So that **running reconciliation for the same `as_of_date` always produces the same result, even under concurrent AP writes**.

## Context

Epic 51 proved AP subledger reconciliation at a point-in-time. Epic 55 must prove that the computation itself is deterministic — the same inputs always produce the same outputs, and the outputs are arithmetically correct.

The reconciliation computation has three components:
1. **AP subledger balance:** Sum of `purchase_invoices.amount` - `purchase_payments.allocated_amount` - `supplier_credit_notes.amount` for the `as_of_date`
2. **GL control account balance:** Sum of journal entries in the AP control account up to the `as_of_date`
3. **Variance:** `gl_control_balance - ap_subledger_balance` (zero = reconciled, non-zero = items in flight)

**Risk:** Concurrent AP writes (invoice created, payment posted, credit note applied) during reconciliation computation could produce non-deterministic balances if the queries are not properly isolated or if the computation uses non-deterministic ordering.

**Files involved:**
- `packages/modules/purchasing/src/services/ap-reconciliation-service.ts` — subledger + GL balance queries, variance computation
- `packages/modules/accounting/src/reconciliation/subledger/ap-reconciliation-service.ts` — accounting module's parallel AP reconciliation service
- `apps/api/src/lib/purchasing/ap-reconciliation.ts` — thin API adapter (delegates to purchasing module)

> **⚠️ File path correction:** The story originally referenced `packages/modules/accounting/src/services/gl-balance-service.ts` which does not exist. The actual GL control balance logic lives in `packages/modules/accounting/src/reconciliation/subledger/ap-reconciliation-service.ts` (lines 320–346).

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** (1) Reconciled state (zero variance), (2) Unreconciled state (non-zero variance), (3) Partial period
- [x] **Error paths identified:** Invalid company_id, missing GL control account, no AP transactions
- [x] **Edge cases identified:** Zero AP balance, fully paid period, partial period, multicurrency AP, concurrent writes during computation
- [x] **Test fixture needs identified:** Company with AP transactions, fiscal year, GL control account, supplier, invoices, payments, credit notes
- [x] **Integration test scope defined:** All tests need real DB (balance computation requires actual rows)
- [x] **Negative auth test role selected:** `CASHIER` (no `accounting.journals` ANALYZE permission)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Reconciled state: subledger = GL balance | Happy | Integration |
| Unreconciled state: invoices posted but payment pending | Happy | Integration |
| Zero AP balance (no transactions in period) | Edge | Integration |
| Fully paid period (all invoices paid) | Edge | Integration |
| Partial period (as_of_date mid-fiscal-year) | Edge | Integration |
| Multi-currency AP: base amount computed correctly | Edge | Integration |
| Concurrent invoice creation during reconciliation | Edge | Integration |
| Missing GL control account | Error | Integration |
| Unauthorized role rejected | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `purchasing` (subledger), `accounting` (GL balance)
- [x] **Cross-module decisions identified:** Which module owns the variance formula
- [x] **Winston sign-off obtained:** ✅ `purchasing` owns variance computation; `accounting` provides raw GL balance
- [x] **Decisions recorded:** See Decision Record below

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | `purchasing` module owns variance computation; `accounting` provides raw GL balance | purchasing, accounting | Variance is a purchasing-domain concept (AP subledger vs GL); accounting should not know about AP-specific reconciliation logic | Accounting owns variance — rejected: couples accounting to purchasing reconciliation semantics | `2026-05-04 ✓` |

**Hard gate:** Implementation MUST NOT begin until all rows in the table above have Winston's sign-off.

---

## Acceptance Criteria

**AC1: Subledger Balance Determinism**
**Given** a company with AP transactions up to `as_of_date`
**When** the subledger balance is computed twice in succession
**Then** both computations return the exact same balance
**And** the balance equals: `SUM(invoice_amounts) - SUM(payment_allocations) - SUM(credit_note_amounts)`

**AC2: GL Control Balance Determinism**
**Given** the same company and `as_of_date`
**When** the GL control account balance is computed twice in succession
**Then** both computations return the exact same balance
**And** the balance equals: `SUM(journal_entries.debit - journal_entries.credit)` for the AP control account

**AC3: Variance Formula Correctness**
**Given** reconciled state (all AP items posted to GL)
**When** variance is computed
**Then** variance equals `0.00`

**AC4: Unreconciled State Variance**
**Given** unreconciled state (invoices in DRAFT, payments unallocated, or credit notes unposted)
**When** variance is computed
**Then** variance is non-zero
**And** the sign correctly indicates direction (positive = GL > subledger, negative = GL < subledger)

**AC5: Concurrent Write Safety**
**Given** an ongoing reconciliation computation
**When** a concurrent process creates a new AP invoice
**Then** the reconciliation computation is NOT affected (uses snapshot isolation or point-in-time query)
**And** a subsequent reconciliation for the same `as_of_date` includes the new invoice

**AC6: Edge Cases**
**Given** edge case scenarios
**When** reconciliation is computed
**Then:**
- Zero AP balance → variance equals GL control balance (or zero if no GL entries)
- Fully paid period → subledger balance = 0, GL balance = 0, variance = 0
- Partial period → only items up to `as_of_date` included
- Multi-currency AP → base amounts (converted at transaction date rate) used, not original currency amounts

**AC7: Integration Tests 3× Green**
**Given** the reconciliation test suite
**When** run 3 times consecutively
**Then** all tests pass every time

---

## Test Coverage Criteria

- [ ] Coverage target: all computation paths
- [ ] Happy paths to test:
  - [ ] Reconciled state (zero variance)
  - [ ] Unreconciled state (non-zero variance)
- [ ] Error paths to test:
  - [ ] 404: Missing GL control account
  - [ ] 403: Unauthorized role
- [ ] Edge cases:
  - [ ] Zero AP balance
  - [ ] Fully paid period
  - [ ] Partial period
  - [ ] Multi-currency AP
  - [ ] Concurrent writes during computation

## Tasks / Subtasks

> **Priority order:** P1 → AC5 concurrent write test (highest value). P2 → Promise.all parallel query audit (real risk). Validation → AC7 3× consecutive green.

**HIGH PRIORITY**

- [x] **Task A1:** Fix `Promise.all` parallel query race in `ap-reconciliation-service.ts` (lines 417–420) — two balance queries run in parallel and can observe inconsistent DB state under concurrent writes. Wrap in a single transaction or serial execution so both queries see the same DB snapshot.
- [x] **Task A2:** Add concurrent write simulation test (AC5) — start reconciliation, fire concurrent invoice creation, verify first result pre-invoice and second result post-invoice. Use the same `Promise.all` pattern but structure the assertions to catch the race.

**LOW PRIORITY (deferrable to Story 55.5)**

- [x] **Task B1:** Add AC7 validation — run reconciliation suite 3× consecutive and report results
- [ ] **Task C1:** Audit existing query patterns for non-deterministic ordering (ORDER BY in aggregation subqueries). Document findings; only fix if a concrete bug is found.
- [ ] **Task C2:** Add edge case tests for fully paid period (variance=0, subledger=0, GL=0) if time permits

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/purchasing/src/services/ap-reconciliation-service.ts` | Modify | Fix `Promise.all` parallel query race — serialize balance queries within a transaction |
| `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts` | Modify | Add concurrent write simulation test (AC5)

## Estimated Effort

1.5 days — P1 fix (Promise.all serialization) + AC5 concurrent test + AC7 3× green validation + edge case tests if time permits

## Risk Level

Medium — P1 risk identified (`Promise.all` parallel queries can produce impossible variance). Fix is small (wrap in transaction), not a systemic issue.

## Dev Notes

- **P1: `Promise.all` parallel queries (critical)** — `getAPReconciliationSummary` at lines 417–420 runs two balance queries in parallel:
  ```typescript
  const [apBalance, glBalance] = await Promise.all([
    this.getAPSubledgerBalance(companyId, asOfDate),
    this.getGLControlBalance(companyId, settings.accountIds, asOfDateUtcEnd),
  ]);
  ```
  Under concurrent AP writes, one query can read state *just before* a write and the other *just after* — producing a variance value that **never existed at any point in time**. The fix: wrap both queries in a single `READ COMMITTED` transaction so they observe the same DB snapshot.
- **Deterministic ordering:** Use `ORDER BY id ASC` or equivalent in all aggregation queries. Without explicit ordering, MySQL may return rows in non-deterministic order under concurrent writes, affecting `GROUP BY` results. Note: SUM is commutative, so ordering does NOT affect balance correctness — this is a documentation preference, not a bug.
- **Transaction isolation:** The reconciliation computation currently uses default Kysely connection isolation (no explicit `READ COMMITTED`). Verify current isolation level in Kysely connection config before implementing the serial query fix.
- **Base amount precision:** Use `DECIMAL(19,4)` arithmetic, never floating-point. Verify `SUM()` casts in SQL.
- **Multi-currency:** Base amount = original_amount * exchange_rate. Rate must be the rate at transaction date (not current rate). Verify rate lookup uses temporal query.
- **Concurrent write test design:** The test must simulate the actual race — not `Promise.all([summary, createInvoice])` at test level, which doesn't guarantee overlap. Instead:
  1. Start the reconciliation summary call (it takes real DB time)
  2. While it's running, fire an API call that creates + posts an invoice
  3. Wait for both to complete
  4. Assert first result shows pre-invoice state; second result shows post-invoice state
  Use `Promise.all` at the test level but structure the two operations so they overlap. The summary takes measurable time due to multiple joins/aggregations, so even without explicit delays the overlap is likely.
- **Edge case tests (deferred):** Add AC6 fully-paid period and AC4 variance sign tests only if time permits. These are low-value compared to the AC5 concurrent test.

## Validation Evidence

```bash
# Run reconciliation test suite
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts" -w @jurnapod/api

# Run 3× consecutive
for i in 1 2 3; do
  npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts" -w @jurnapod/api
done
```

## Dependencies

- Story 55.1 completed (or at least the spike — no code dependency, but 55.1 sets the pattern for correctness stories)

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left without linked TD item
- [ ] No `as any` casts without justification
- [ ] Integration tests included in AC (not deferred)

## Notes

- **This is now a hybrid story** — originally "verification only," but a P1 correctness issue was discovered: the `Promise.all` parallel query pattern can produce impossible variance values under concurrent writes. The fix is small (wrap in a transaction) and in the same file. Deferring this to Story 55.5 would leave a known P1 risk unaddressed.
- **The concurrent write test (AC5) is the highest-value item.** Proving the fix works under real concurrency patterns is worth more than all the edge case tests combined.
- **Edge case tests deferred to 55.5:** Fully paid period, variance sign, summary repeat — all low-value additions that can wait.
- **Existing test coverage is strong** — 1,570 lines with comprehensive happy path and error path coverage. The gaps are narrow and well-understood.
