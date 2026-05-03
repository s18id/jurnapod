# Story 51.4 Completion Report (Second-Pass Sign-Off)

**Story:** Inventory Subledger Reconciliation
**Epic:** Epic 51 — Fiscal Correctness Hardening
**Status:** ✅ DONE
**Completed:** 2026-05-28 (second-pass sign-off)

---

## Summary

Story 51.4 implements Inventory subledger-to-GL reconciliation. The service computes inventory balance from `inventory_cost_layers` (SUM of `remaining_qty × unit_cost`) and compares it against the GL inventory control account balance from `journal_lines`. This is architecturally distinct from AR/AP because inventory costing uses a layered cost model rather than open invoice amounts.

---

## Second-Pass Determinism Review — Sign-Off

**Reviewer:** Charlie (Senior Dev) / Second-Pass Reviewer
**Date:** 2026-05-28
**Verdict:** ✅ **GO** — no post-review fixes required.

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | **Inventory subledger sum computed deterministically** (stock movements + costing adjustments) | ✅ **PASS** | `getInventorySubledgerBalance()` (lines 351-364): queries `inventory_cost_layers` with `ROUND(SUM(CAST(remaining_qty AS DECIMAL(19,4)) × CAST(unit_cost AS DECIMAL(19,4))), 4)`. No JOIN row multiplication. Uses fixed `asOfDate` parameter. Correctly handles DECIMAL precision with `ROUND(..., 4)`. |
| 2 | **GL control account balance from `journal_entries` with correct account code filter** | ✅ **PASS** | `getGLControlBalance()` (lines 369-395): queries `journal_lines` via `journal_batches`, filtered by `account_id IN (...)` and `posted_at <= asOfDateUtcEnd`. Asset sign: `debit - credit` — correct for inventory. |
| 3 | **Reconciliation report deterministic** | ✅ **PASS** | `getInventoryReconciliationSummary()` (lines 400-431): fixed `asOfDate`, canonical `toUtcIso.businessDate()` timezone, `Promise.all` with both branches read-only and deterministic. |
| 4 | **Variance drilldown reproducible** | ✅ **PASS** | `getInventoryReconciliationDrilldown()` (lines 439-643): single query with `GROUP BY it.id` handling the 1:N cost-layer join. Cursor pagination uses `type\|id` format with `ORDER BY transaction_type ASC, id ASC`. Two-pass GL lookup updates variance after batch retrieval. |
| 5 | **No `Date.now()` or `Math.random()`** | ✅ **PASS** | Service: no randomness in business logic. `NOW()` only in settings audit fields. Test: `FIXED_AS_OF_DATE = "2099-12-31"`. |
| 6 | **Integration test 3× consecutive green** | ✅ **PASS** | Verified 2026-05-28: Runs 1, 2, 3 — 13/13 passed each time. |
| 7 | **No post-review fixes expected** | ✅ **PASS** | No blocking correctness issues found. Minor observations documented below. |

---

## Review Observations (Non-Blocking)

### P3: `DATE(acquired_at)` on indexed column

**Location:** Service line 356:
```sql
DATE(icl.acquired_at) <= ${asOfDate}
```

The `DATE()` function wraps the `acquired_at` column, which may prevent index usage on this datetime column. For reconciliation queries over large data volumes, this could cause full table scans. The correct pattern would be `acquired_at < ${nextDay}` where `nextDay` is the start of the next day in UTC.

**Recommendation:** Deferred to Story 51.5 or a future performance pass. Not a correctness issue — the query is deterministic regardless of execution plan.

### P3: No seeded-data integration test

Unlike AR (51.2) and AP (51.3) which have isolated-company tests with symmetric seeded data proving variance = 0, the inventory test suite has no equivalent. This is partially explained by the complexity of inventory costing (multiple tables, layered cost model) and the accepted limitation documented at lines 340-349 (`remaining_qty` reflects current state, not as-of-date state). However, this leaves a test coverage gap for the non-zero data path.

**Recommendation:** When inventory costing fixtures are extracted, add a seeded-data test that creates cost layers with symmetric GL entries and verifies zero variance.

### Local test fixture: `createTestInventoryAccount`

**Location:** Test lines 43-51.

Uses raw SQL INSERT for an inventory control account, with a TODO comment (line 41) acknowledging it should be extracted to `packages/modules/accounting/src/test-fixtures/`. This is acceptable per Fixture Policy Partial Mode — no canonical fixture exists yet.

---

## Testing Performed

- ✅ `inventory-subledger-reconciliation.test.ts` — 13 tests, 3× consecutive green (run 1: 13, run 2: 13, run 3: 13)
- ✅ No regressions in AR or AP reconciliation suites (verified 2026-05-28)

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-28 | 1.0 | Second-pass determinism review — GO sign-off |

---

**Story is COMPLETE.**