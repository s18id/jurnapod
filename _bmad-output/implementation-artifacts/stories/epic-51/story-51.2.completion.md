# Story 51.2 Completion Report (Second-Pass Sign-Off)

**Story:** Receivables Subledger Reconciliation
**Epic:** Epic 51 — Fiscal Correctness Hardening
**Status:** ✅ DONE
**Completed:** 2026-04-27 (implementation) / 2026-05-28 (second-pass sign-off)

---

## Summary

Story 51.2 implements AR (Accounts Receivable) subledger-to-GL reconciliation. The implementation was completed and committed (`1098d0be`), with 18 integration tests passing. This document records the mandatory E50-A1 second-pass determinism review sign-off.

---

## Second-Pass Determinism Review — Sign-Off

**Reviewer:** Charlie (Senior Dev) / Second-Pass Reviewer
**Date:** 2026-05-28
**Verdict:** ✅ GO — no post-review fixes required.

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | **AR subledger sum computed deterministically** (invoices + payments + credit notes) | ✅ **PASS** | Three separate aggregate queries in `getARSubledgerBalance()` (lines 307-368). No JOIN row multiplication. Uses `grand_total` directly (not `grand_total - paid_total` — avoids double-counting, documented at lines 308-311). All filters use `asOfDate` parameter and `'POSTED'` status. |
| 2 | **GL control account balance from `journal_entries` with correct account code** | ✅ **PASS** | `getGLControlBalance()` (lines 373-399): queries `journal_lines` via `journal_batches`, filtered by `account_id IN (...)` and `posted_at <= asOfDateUtcEnd`. Asset sign convention: `debit - credit` — correct for AR. |
| 3 | **Reconciliation report deterministic** | ✅ **PASS** | `getARReconciliationSummary()` (lines 404-435): fixed `asOfDate`, canonical `toUtcIso.businessDate()` timezone normalization, `Promise.all` with both branches read-only and deterministic. Variance = `arBalance - glBalance`. |
| 4 | **Variance drilldown reproducible** | ✅ **PASS** | `getARReconciliationDrilldown()` (lines 443-717): three separate typed queries, cursor = `type\|id` with `ORDER BY id ASC`. Type-level date filters pushed to each query. GL lookup reuses same `account_ids` and `asOfDateUtcEnd`. Stable sort by type then id. |
| 5 | **No `Date.now()` or `Math.random()`** | ✅ **PASS** | Service: no randomness in business logic. `NOW()` only in settings audit fields. Test: `FIXED_AS_OF_DATE = "2099-12-31"`. `makeTag()` for unique IDs only, not affecting reconciliation values. |
| 6 | **Integration test 3× consecutive green** | ✅ **PASS** | Verified 2026-05-28: Runs 1, 2, 3 — 18/18 passed each time. |
| 7 | **No post-review fixes expected** | ✅ **PASS** | No correctness issues found. |

---

## Review Observations

### AR Pattern vs AP Pattern (51.2 vs 51.3)

| Aspect | AR (51.2) | AP (51.3) | Note |
|--------|-----------|-----------|------|
| Exchange rate | Not applicable — base amounts stored directly | `grand_total * exchange_rate` — DECIMAL(19,4) × DECIMAL(18,8) | AP required CAST fix for DECIMAL overflow; AR avoids this naturally |
| Status values | Hardcoded string `'POSTED'` | Constant references from `@jurnapod/shared` | Minor consistency difference, not a correctness issue |
| Sign convention | `debit - credit` (asset) | `credit - debit` (liability) | Both correct for their account types |
| Timezone boundary | Separate `paymentCutoff` param for datetime columns | Same `asOfDateUtcEnd` for all | AR's approach is more explicit; both are correct |

### Key Design Decisions Verified
- **`grand_total` used directly** (lines 509, 527, 545) — NOT `grand_total - paid_total`, avoiding double-counting documented at lines 308-311
- **Payment boundary aligned with GL** (line 497): `payment_at <= asOfDateUtcEnd` ensures the datetime boundary matches the GL `posted_at` query exactly
- **Empty document type filters** (lines 576-583): `1=0` placeholder prevents SQL syntax errors from empty `IN ()` clauses — handles `documentType` filtering correctly

---

## Testing Performed

- ✅ `ar-subledger-reconciliation.test.ts` — 18 tests, 3× consecutive green (run 1: 18, run 2: 18, run 3: 18)
- ✅ No regressions in AP or inventory reconciliation suites (verified 2026-05-28)

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-27 | 1.0 | Initial implementation (commit `1098d0be`) |
| 2026-05-28 | 1.1 | Second-pass determinism review — GO sign-off |

---

**Story is COMPLETE.**