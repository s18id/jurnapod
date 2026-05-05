# Story 55.2 Completion Report

**Story:** 55.2 — Verify AP Reconciliation Computation Determinism
**Epic:** 55 — AP Reconciliation/Snapshot Correctness
**Status:** ✅ DONE
**Completed:** 2026-05-04

---

## Summary

Story 55.2 proved that the AP reconciliation computation (subledger balance, GL control balance, variance) is deterministic under concurrent AP writes. During implementation a P1 issue was discovered: the two balance queries ran in parallel via `Promise.all`, creating a split-brain scenario where they could observe inconsistent DB snapshots under concurrent writes. The fix wraps both queries in a single transaction to guarantee snapshot consistency. A concurrent write simulation test (AC5) validates the fix, and all 55 tests pass 3× consecutive.

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/modules/purchasing/src/services/ap-reconciliation-service.ts` | Fixed `Promise.all` parallel query race — wrapped both balance queries in a `withTransaction()` call. Added optional `executor` parameter to `getAPSubledgerBalance` and `getGLControlBalance`. |
| `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts` | Added AC5 concurrent write simulation test — 69 lines. |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Subledger balance determinism (repeat test) | ✅ Existing coverage + AC5 concurrent test proves internal consistency |
| AC2 | GL control balance determinism (repeat test) | ✅ Existing coverage + AC5 concurrent test proves internal consistency |
| AC3 | Variance = 0 in reconciled state | ✅ Existing coverage + AC5 proves variance=0 invariant even under concurrent writes |
| AC4 | Non-zero variance sign correctness | ✅ Existing coverage (drilldown variance equality test) |
| AC5 | Concurrent write safety | ✅ **Added** — concurrent summary + invoice creation, variance=0 invariant asserted |
| AC6 | Edge cases (multi-currency, partial period) | ✅ Existing coverage (multi-currency test lines 494-543; timezone tests lines 613-749) |
| AC7 | 3× consecutive green | ✅ 55 tests pass on all 3 runs |

---

## Key Technical Details

### P1 Fix: Promise.all → Single Transaction

**The problem:** `getAPReconciliationSummary` ran two balance queries in parallel:
```typescript
// BEFORE — can produce impossible variance values
const [apBalance, glBalance] = await Promise.all([
  this.getAPSubledgerBalance(...),   // sees snapshot A
  this.getGLControlBalance(...),     // sees snapshot B (different!)
]);
```
Under concurrent AP writes, these queries could observe inconsistent DB states, producing a variance value that never existed at any point in time.

**The fix:**
```typescript
// AFTER — both queries see the same DB snapshot
const { apBalance, glBalance } = await withTransaction(this.db, async (trx) => {
  const ap = await this.getAPSubledgerBalance(companyId, asOfDate, trx);
  const gl = await this.getGLControlBalance(companyId, settings.accountIds, asOfDateUtcEnd, trx);
  return { apBalance: ap, glBalance: gl };
});
```

Both private methods now accept an optional `executor` parameter to participate in a parent transaction.

### AC5 Test: Critical Invariant

The concurrent test asserts that **every single summary result** has `subledger == GL` (variance = 0), regardless of concurrent writes. This proves the transaction isolation fix works — both balance queries always see the same DB snapshot.

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript (`npm run typecheck -w @jurnapod/api`) | ✅ Pass |
| Reconciliation test suite 3× consecutive | ✅ 55/55 pass each run |
| Sprint status validation | ✅ Healthy |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-04 | 1.0 | Initial implementation — Promise.all fix + AC5 concurrent test |

---

**Story is COMPLETE.**
