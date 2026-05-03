# Story 51.3 Completion Report

**Story:** Payables Subledger Reconciliation
**Epic:** Epic 51 — Fiscal Correctness Hardening
**Status:** ✅ DONE
**Completed:** 2026-05-28

---

## Summary

Story 51.3 implements AP (Accounts Payable) subledger-to-GL reconciliation. The acceptance criteria were pre-implemented in prior work; this story resolved two correctness bugs that prevented the integration test suite from passing:

1. **Bug 1 (Test fixture):** The seeded-company test inserted `'BASE'` (4 chars) into `suppliers.currency` and `purchase_invoices.currency_code`, both defined as `CHAR(3)` — causing "Data too long" errors.
2. **Bug 2 (Service):** The SQL expression `grand_total * exchange_rate` where `grand_total` is `DECIMAL(19,4)` and `exchange_rate` is `DECIMAL(18,8)` produced `DECIMAL(38,12)` results, which `toScaled(..., 4)` rejected as overflow.

Both bugs are now fixed. The AP reconciliation service is functionally complete and deterministic.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts` | Fix: `'BASE'` → `'IDR'` on lines 234 and 241. Added `-- CHAR(3) column — use 3-letter ISO code` comment on supplier insert. |
| `packages/modules/accounting/src/reconciliation/subledger/ap-reconciliation-service.ts` | Fix: Added `CAST(... AS DECIMAL(19,4))` around `SUM(grand_total * exchange_rate)` in `getAPSubledgerBalance()` (line 282) and `grand_total * exchange_rate` in `getAPReconciliationDrilldown()` (line 429). Added inline drift-prevention comments. |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | AP subledger-to-GL reconciliation implemented (purchase_invoices + payments + credit_notes = GL control) | ✅ Complete |
| AC2 | Reconciliation report endpoint (`GET /accounting/reports/ap-reconciliation/summary`) | ✅ Complete |
| AC3 | Variances surfaced with drilldown capability by document type | ✅ Complete |
| AC4 | All gaps/defects fixed with evidence | ✅ Complete (Bug 1 + Bug 2 fixed) |
| AC5 | Integration tests written and 3× consecutive green | ✅ Complete (19 tests, 3× green) |
| AC6 | Code review GO required | ✅ Complete (second-pass sign-off attached) |

---

## Second-Pass Determinism Review — Sign-Off

**Reviewer:** Charlie (Senior Dev) / Second-Pass Reviewer
**Date:** 2026-05-28
**Verdict:** ✅ GO — no post-review fixes required.

| # | Item | Result |
|---|------|--------|
| 1 | AP subledger sum computed deterministically (separate aggregate queries, no row multiplication) | ✅ PASS |
| 2 | GL control account balance from `journal_entries` with correct account code filter | ✅ PASS |
| 3 | Reconciliation report deterministic (fixed `asOfDate`, canonical timezone API, pure arithmetic variance) | ✅ PASS |
| 4 | Variance drilldown reproducible (typed cursor `type\|id`, stable sort, consistent GL boundary) | ✅ PASS |
| 5 | No `Date.now()` or `Math.random()` in reconciliation logic or test fixtures | ✅ PASS |
| 6 | Integration test 3× consecutive green | ✅ PASS (verified: 19/19 × 3 runs) |
| 7 | No post-review fixes expected | ✅ PASS |

---

## Testing Performed

- ✅ `ap-subledger-reconciliation.test.ts` — 19 tests, 3× consecutive green (run 1: 19 passed, run 2: 19 passed, run 3: 19 passed)
- ✅ `ar-subledger-reconciliation.test.ts` — 18 tests, no regression
- ✅ `inventory-subledger-reconciliation.test.ts` — 13 tests, no regression

---

## Technical Notes

### Bug 1 — Currency Code Length
Both `suppliers.currency` and `purchase_invoices.currency_code` are `CHAR(3)` columns. The test used `'BASE'` (4 chars). Changed to `'IDR'` which is both schema-compliant and the canonical default in `createTestCompanyMinimal()`.

### Bug 2 — DECIMAL Precision Overflow
`grand_total DECIMAL(19,4) * exchange_rate DECIMAL(18,8) = DECIMAL(38,12)`. MySQL returns up to 12 decimal places from `SUM()` of such products. `toScaled(value, 4)` uses the regex `/^-?\d+(\.\d{1,4})?$/` which rejects >4 decimal places. Fix: `CAST(SUM(grand_total * exchange_rate) AS DECIMAL(19,4))` — same precision as the column type, no information loss.

### DRY / KISS / SOLID
- **KISS:** Minimal surgical fix, no new abstraction. CAST is the simplest correct solution.
- **DRY:** Comment explaining rationale added at both CAST locations to prevent future drift.
- **SOLID:** No new classes or interfaces introduced. Service SRP unchanged.
- **YAGNI:** No shared utility extraction for 2 call sites.

### Comparison with AR Pattern
The AR reconciliation service uses simple `SUM(grand_total)` without exchange rate multiplication (sales invoices store base amounts directly). The AP service must handle FX conversion because purchase invoices store original-currency amounts. The `CAST` approach preserves the AP pattern while fixing the precision issue.

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-28 | 1.0 | Initial implementation — Bug 1 + Bug 2 fixes |

---

**Story is COMPLETE.**