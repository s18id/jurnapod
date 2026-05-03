# Epic 51 Retrospective — Fiscal Correctness Hardening

**Date:** 2026-05-28
**Epic:** 51 — Fiscal Correctness Hardening
**Status:** ✅ Complete

---

## Story Summary

| Story | Title | Status |
|-------|-------|--------|
| 51.1 | Fiscal Year Close Correctness Hardening | done |
| 51.2 | Receivables Subledger Reconciliation | done |
| 51.3 | Payables Subledger Reconciliation | done |
| 51.4 | Inventory Subledger Reconciliation | done |
| 51.5 | Follow-Up Closure Bucket | done |

---

## What Went Well

**Fiscal year close concurrency proof established (Story 51.1)**
- All three close paths (`executeCloseWithLocking`, `closeFiscalYearWithTransaction`, `approveFiscalYearClose`) hardened with row-count-verified guarded transitions (`PENDING→IN_PROGRESS`, `OPEN→CLOSED`)
- Deterministic timestamps (`requestedAtEpochMs`) enforced throughout; `Date.now()` removed from `approveFiscalYearClose`
- FOR UPDATE locks on close request + fiscal year rows verified as the concurrency surface
- 6+9 tests × 3 consecutive green runs on fiscal-year-close integration suites
- Usage surface estimation documented (10 call sites measured), satisfying E50-A1 carry-over

**4 subledger reconciliations verified — all 3× consecutive green**
- AR (Story 51.2): 18 tests, 3× green — `getARSubledgerBalance()` uses three separate aggregate queries with no JOIN row multiplication; `grand_total` used directly (not `grand_total - paid_total`) to avoid double-counting
- AP (Story 51.3): 19 tests, 3× green — separate aggregate queries; AP handles FX conversion via `CAST(... AS DECIMAL(19,4))` to prevent DECIMAL overflow
- Inventory (Story 51.4): 13 tests, 3× green — layered cost model via `inventory_cost_layers`; `ROUND(CAST(remaining_qty AS DECIMAL(19,4)) × CAST(unit_cost AS DECIMAL(19,4)), 4)` for precision

**AP reconciliation bugs found and fixed in Story 51.3 (scope of 51.5)**
- Bug 1 (Currency code CHAR(3) overflow): Test used `'BASE'` (4 chars) in `suppliers.currency` and `purchase_invoices.currency_code`; fixed to `'IDR'`
- Bug 2 (DECIMAL precision overflow): `grand_total DECIMAL(19,4) × exchange_rate DECIMAL(18,8)` = `DECIMAL(38,12)` exceeded `toScaled(..., 4)` regex; fixed with `CAST(... AS DECIMAL(19,4))`

**HARD GATE enforcement — E50-A1/E50-A2 prerequisites satisfied**
- Every story spec (51.1–51.5) included mandatory second-pass review checklist per E50-A1
- Story 51.5 included explicit coordination protocol per E50-A2
- No story began implementation until all gates verified present; reviewers had authority to reject PRs lacking evidence

**Second-pass review discipline (mandatory for all 4 reconciliation stories)**
- Charlie (Senior Dev) second-pass sign-off on Stories 51.1, 51.2, 51.3, 51.4
- Second-pass checklist enforced deterministic evidence: no `Date.now()` or `Math.random()`, fixed `asOfDate` parameters, stable cursor pagination, 3× green runs
- All four second-pass verdicts: GO with no post-review fixes required

**All 6 risks (R51-001 through R51-006) formally closed**
- R51-001 (fiscal year close race): mitigated by Story 51.1 concurrency proof
- R51-002 (AR drift): mitigated by Story 51.2 reconciliation
- R51-003 (AP drift): mitigated by Story 51.3 reconciliation + 2 bug fixes
- R51-004 (Inventory drift): mitigated by Story 51.4 reconciliation
- R51-005 (51.5 scope creep): closed — no new scope introduced
- R51-006 (E50-A1/A2 prerequisites): closed — all gates satisfied

**Sprint validation gate passed**
- `npx tsx scripts/validate-sprint-status.ts --epic 51` returned exit 0

---

## What Could Improve

**P3: Missing seeded-data integration test for non-zero inventory path**
- AR (51.2) and AP (51.3) each have isolated-company tests with symmetric seeded data proving variance = 0
- Inventory (51.4) has no equivalent because the layered cost model (multiple tables) makes seeded-data setup complex
- The test suite covers zero-balance and edge cases but not the non-zero data path with seeded cost layers and GL entries
- **Evidence:** Story 51.4 completion notes, review observation at lines 47-51
- **Owner needed:** Story 51.4 reviewer observation recommends this when inventory costing fixtures are extracted (tied to Q49-001)

**P3: `DATE(acquired_at)` wrapping indexed column in inventory reconciliation**
- `DATE(icl.acquired_at) <= ${asOfDate}` in `getInventorySubledgerBalance()` (service line 356)
- The `DATE()` function may prevent index usage on `acquired_at` for large data volumes
- Not a correctness issue — query is deterministic regardless of execution plan
- Correct pattern: `acquired_at < ${nextDay}` (start of next day in UTC) to preserve index usage
- **Evidence:** Story 51.4 completion notes, review observation at lines 36-45
- **Deferred to:** Future performance pass (not correctness-critical)

**P1 (deferred): Auto-snapshot race in fiscal year close**
- `hasAutoSnapshotForFiscalYearEnd` check runs outside the close transaction
- Under concurrent snapshot creation, stale state can be read — can cause incorrect close rejection
- Pre-existing infrastructure pattern, not introduced by Story 51.1
- Snapshot infrastructure needs `SELECT ... FOR UPDATE` or transactional check-then-insert
- Non-blocking currently: snapshot failure is already non-fatal
- **Evidence:** Story 51.1 completion notes, residual risks table; Story 51.5 defect log D51-001
- **Deferred to:** Epic 55 (per Story 51.5 defect register)

---

## Action Items (Max 2)

1. **Address auto-snapshot race in fiscal year close transaction**
   - **Owner:** @bmad-dev
   - **Deadline:** Epic 55
   - **Success criterion:** `hasAutoSnapshotForFiscalYearEnd` check runs inside the close transaction with `SELECT ... FOR UPDATE` lock, or the snapshot check uses transactional check-then-insert semantics; fiscal year close service tests cover concurrent snapshot creation scenario with evidence of correct behavior

2. **Add seeded-data integration test for non-zero inventory reconciliation path**
   - **Owner:** @bmad-dev
   - **Deadline:** When inventory costing fixtures are extracted (tied to Q49-001 Pass 2+)
   - **Success criterion:** Inventory subledger reconciliation test suite includes symmetric seeded-data test that creates cost layers with matching GL entries and verifies zero variance; test is deterministic and reproducible

---

## Deferred Items

| Item | Source Story | Rationale | Deferred To |
|------|-------------|-----------|-------------|
| Auto-snapshot race (`hasAutoSnapshotForFiscalYearEnd` check outside close transaction) | 51.1 | Pre-existing infrastructure pattern; snapshot failure is already non-fatal; requires `SELECT ... FOR UPDATE` or transactional check-then-insert in snapshot infrastructure | **Epic 55** |
| `DATE(acquired_at)` on indexed column in inventory reconciliation (performance concern) | 51.4 | Not a correctness issue — query is deterministic regardless of execution plan; performance impact only on large data volumes | **Future performance pass** |
| Missing seeded-data integration test for non-zero inventory path | 51.4 | Test coverage gap; requires inventory costing fixtures in canonical form (not yet extracted); partial fixture mode justification: same production package owns the invariant | **When Q49-001 fixture extraction continues** |

---

*Retrospective complete. Epic 51 closed.*