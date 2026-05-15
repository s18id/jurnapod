# Story 64.1 Completion Report: Fix ap-multicurrency-correctness — Use computePurchaseInvoiceOpenAmount

**Status:** done
**Date:** 2026-05-15
**Epic:** Epic 64 — Test Production-Code Integration Phase 2
**Reviewer:** bmad-master (consolidated batch review — datetime deferral accepted)

---

## Implementation Summary

This story replaces inline SQL aggregation in `ap-multicurrency-correctness.test.ts` with the canonical production function `computePurchaseInvoiceOpenAmount()` exported from `@jurnapod/modules-purchasing`. The test was already pre-migrated prior to this batch; Batch 1 validation confirmed the migration is correct and complete.

---

## Files

| Action | File | Note |
|--------|------|------|
| Modified | `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` | Pre-migrated — inline SQL at line ~409 replaced with `computePurchaseInvoiceOpenAmount()` |

---

## AC Status

| AC | Description | Status |
|----|-------------|--------|
| AC1 | Inline SQL replaced with production function | PASS — `SELECT (pi.grand_total * pi.exchange_rate - COALESCE(SUM(apl.allocation_amount), 0))` removed; `computePurchaseInvoiceOpenAmount(invoiceId)` in use |
| AC2 | Test assertions remain correct | PASS — all 6 tests pass |
| AC3 | No inline SQL aggregation remains in verification path | PASS — `grep -n 'COALESCE(SUM' returns 0 results in verification paths |

---

## Validation Evidence

```bash
# Focused test run
npm run test:integration -w @jurnapod/api -- --run ap-multicurrency-correctness

Result: Test Files 1 passed, Tests 6 passed (1607ms)
```

---

## Reviewer Sign-off

Batch 1 consolidated review GO for story scope. No P0/P1 blockers in Story 64.1 scope.
