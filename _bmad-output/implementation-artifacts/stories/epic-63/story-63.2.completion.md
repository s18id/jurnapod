# Story 63.2 Completion Report: Replace inline scaled() with @jurnapod/shared

**Story:** Replace inline scaled() with @jurnapod/shared in purchasing tests  
**Epic:** 63 - Test Production-Code Hardening  
**Status:** ✅ DONE  
**Completed:** 2026-05-10

---

## Summary

Replaced all 4 inline decimal-to-BigInt conversion functions with the canonical `scaled()` and `unscaled()` imports from `@jurnapod/shared`. The inline implementations used `BigInt(Math.round(parseFloat(val) * 10000))` which introduces IEEE 754 float rounding errors. The canonical implementation uses string-based parsing to avoid precision issues.

---

## Files Modified

| File | Change |
|------|--------|
| `ap-payments.test.ts` | Replaced `BigInt(Math.round(parseFloat()*10000))` → `scaled()`. Added import. |
| `ap-multicurrency-correctness.test.ts` | Removed `toScaledBigInt()` function (9 lines). Replaced all calls with `scaled(val, { signed: true })`. Added import. |
| `ap-reconciliation-snapshots.test.ts` | Removed `parseDecimal()` function (6 lines). Replaced all calls with `scaled()`. Added import. |
| `ap-reconciliation.test.ts` | Removed `toScaled4()` function (7 lines). Replaced 13 call sites with `scaled()`. Added import. |

## Acceptance Criteria

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | All 4 files import `scaled`/`unscaled` from `@jurnapod/shared` | ✅ |
| AC2 | All existing assertions pass | ✅ |
| AC3 | No inline decimal conversion functions remain | ✅ 4 removed |
| AC4 | All 4 test suites pass | ✅ |

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| Build | ✅ Successful |

## Dev Notes

- `scaled()` from `packages/shared/src/decimal-scale4.ts` uses string-splitting (not `parseFloat`) to avoid IEEE 754 drift
- `scaled(val, { signed: true })` handles negative values that the inline functions previously handled manually
- Incidental fix: 13 `toScaled4()` call sites in `ap-reconciliation.test.ts` needed `);` → `)};` closure fix after function removal

---

**Story is COMPLETE.**
