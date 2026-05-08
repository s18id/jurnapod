# Story 58.4 Completion Report — Inventory/GL Reconciliation Correctness

## Story
- **Epic:** 58
- **Story:** 58.4
- **Title:** Inventory-GL Reconciliation Correctness

## Outcome
Story 58.4 implementation is complete with reconciliation correctness fixes and AC1–AC5 evidence.

This batch delivered:
- historical as-of inventory subledger valuation using layer + consumption history up to cutoff,
- multi-account inventory control reconciliation (no single-account `LIMIT 1` fallback),
- atomic stock-adjustment + variance journal posting in one transaction,
- explicit accounting journal access guard for stock adjustments,
- AC-proving integration assertions for COGS/GL/reconciliation/multi-currency behavior.

## Acceptance Criteria Evidence

### AC1 — Sale creates balanced COGS journal (debit COGS, credit inventory)
- Evidence:
  - `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts`
  - Assertion: total debits equal total credits for COGS journal batch

### AC2 — COGS journal sum equals reported COGS
- Evidence:
  - `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts`
  - Assertion: summed COGS debit lines == `postCogsForSale(...).totalCogs` (scaled bigint comparison)

### AC3 — Inventory subledger vs GL variance < 0.01
- Evidence:
  - `apps/api/__test__/integration/accounting/inventory-subledger-reconciliation.test.ts`
  - Assertion: `Math.abs(Number(variance)) < 0.01`
- Implementation:
  - `packages/modules/accounting/src/reconciliation/subledger/inventory-reconciliation-service.ts`
    - historical as-of query (layers acquired up to cutoff minus consumed qty up to cutoff)
    - `jb.company_id` filter added to GL query
    - no silent catch fallback

### AC4 — Stock adjustments post balanced variance-account journal entries
- Evidence:
  - `apps/api/__test__/integration/stock/adjustments.test.ts`
  - Assertion: STOCK_ADJUSTMENT journal exists, lines include inventory asset + variance account, debits == credits
- Implementation:
  - `apps/api/src/lib/stock.ts`
  - `apps/api/src/routes/stock.ts`

### AC5 — Multi-currency purchase conversion uses purchase-date rate with 4-decimal rounding
- Evidence:
  - `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts`
- Implementation:
  - `packages/modules/purchasing/src/services/purchase-invoice-service.ts`
  - Conversion uses rate lookup by effective date path and rounded scaled arithmetic

## Key Correctness/Hardening Fixes

1. **Atomicity:** stock adjustment + variance posting now share one transaction executor.
2. **Error propagation:** removed silent catch in stock adjustment wrapper.
3. **Auth guard:** added `accounting.journals:create` permission guard for stock-adjustment routes.
4. **Reconciliation safety:** removed try/catch fallback in subledger query; added explicit tenant filter to journal batch join.
5. **Fixture compliance:** replaced raw SQL account setup in AC4 test with canonical owner-package accounting fixtures.

## Files Added
- `packages/modules/accounting/src/test-fixtures/account-fixtures.ts`

## Files Modified
- `packages/modules/accounting/src/reconciliation/subledger/inventory-reconciliation-service.ts`
- `packages/modules/accounting/src/test-fixtures/index.ts`
- `packages/modules/accounting/src/test-fixtures/types.ts`
- `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts`
- `packages/modules/inventory/src/interfaces/stock-service.ts`
- `packages/modules/inventory/src/services/stock-service.ts`
- `apps/api/src/lib/stock.ts`
- `apps/api/src/routes/stock.ts`
- `apps/api/src/lib/test-fixtures.ts`
- `apps/api/__test__/fixtures/index.ts`
- `apps/api/__test__/integration/stock/adjustments.test.ts`
- `apps/api/__test__/integration/accounting/inventory-subledger-reconciliation.test.ts`
- `packages/modules/purchasing/src/services/purchase-invoice-service.ts`
- `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts`

## Validation Evidence

### Build/Typecheck
- `npm run build -w @jurnapod/modules-accounting` ✅
- `npm run build -w @jurnapod/modules-inventory` ✅
- `npm run build -w @jurnapod/modules-purchasing` ✅
- `npm run build -w @jurnapod/api` ✅
- `npm run typecheck -w @jurnapod/modules-accounting` ✅
- `npm run typecheck -w @jurnapod/modules-inventory` ✅
- `npm run typecheck -w @jurnapod/modules-purchasing` ✅
- `npm run typecheck -w @jurnapod/api` ✅

### Integration tests
- `npm run test:single -w @jurnapod/modules-accounting -- __test__/integration/posting/cogs-posting.test.ts` ✅ (5/5)
- `npm run test:single -w @jurnapod/api -- __test__/integration/accounting/inventory-subledger-reconciliation.test.ts` ✅ (13/13)
- `npm run test:single -w @jurnapod/api -- __test__/integration/stock/adjustments.test.ts` ✅ (11/11)
- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/ap-multicurrency-correctness.test.ts` ✅ (6/6)

## Review Gate
- Consolidated adversarial re-review (`bmad-review`): **GO (clean)**
- P0/P1/P2/P3 blocker findings: **all resolved**

## Sign-off
- **Reviewer GO:** ✅ Completed (bmad-review ses_1fa9f6139ffeoAJ4yLxdXY7n7M — GO clean)
- **Story Owner Sign-off:** ✅ Ahmad (2026-03-28)
