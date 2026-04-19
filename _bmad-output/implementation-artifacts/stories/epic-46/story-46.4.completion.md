# Story 46.4 — Goods Receipt Against PO — Completion Report

## Story
- **ID:** 46.4
- **Title:** Goods Receipt Against PO
- **Epic:** 46 — Purchasing / Accounts Payable Module
- **Status:** ✅ DONE

## Implementation Summary

Implemented Goods Receipt (GR) flow end-to-end with PO receipt tracking:

1. **Schema and ACL**
   - Added `goods_receipts` and `goods_receipt_lines` tables (`0175_goods_receipts.sql`)
   - Added ACL seed migration for `purchasing.receipts` (`0176_acl_purchasing_receipts.sql`)
   - Added Kysely types for both GR tables

2. **Shared contracts**
   - Added GR schemas in `packages/shared/src/schemas/purchasing.ts`
   - Enforced line invariant: each GR line must include at least one of `po_line_id` or `item_id`
   - Added `purchasing.receipts` defaults in `roles.defaults.json`

3. **API + library-first implementation**
   - Added thin route adapter: `apps/api/src/routes/purchasing/goods-receipts.ts`
   - Added domain logic library: `apps/api/src/lib/purchasing/goods-receipt.ts`
   - Registered route under `/api/purchasing/receipts`

4. **Business rules implemented**
   - GR creation sets GR status to `RECEIVED`
   - For `po_line_id` lines, increments PO line `received_qty`
   - Over-receipt allowed with warning + persisted `over_receipt_allowed` flag
   - PO auto-transition:
     - `SENT`/`PARTIAL_RECEIVED` → `PARTIAL_RECEIVED` when any line remains short
     - `SENT`/`PARTIAL_RECEIVED` → `RECEIVED` when all lines are fully received
   - Supplier tenant ownership is validated before GR create

## Post-Review Fixes Applied (Risk Remediation)

- **P1 fixed:** Supplier tenant validation added in GR create path (`SUPPLIER_NOT_FOUND` → 404)
- **P1 fixed:** Partial-received transition logic corrected (`received_qty < qty`)
- **P2 fixed:** Line-index mapping bug removed by tracking PO update metadata per input index
- **P2 fixed:** Shared schema now enforces `po_line_id || item_id`
- **Hardening:** Supplier joins in GR list/get include `company_id` in join condition

## Test Results

### Story test suite
- `goods-receipts.test.ts`: **21/21 pass**

### Purchasing regression suites
- `purchase-orders.test.ts`: **27/27 pass**
- `exchange-rates.test.ts`: **26/26 pass**

### Total validated in regression run
- **74/74 passing** across GR + PO + FX suites

## Acceptance Criteria Coverage

- **AC1 (GR creation + received_qty increment):** ✅
- **AC2 (PO line matching + over-receipt warning):** ✅
- **AC3 (PO status auto-update):** ✅
- **AC4 (GR list with filters + supplier + PO ref):** ✅
- **AC5 (ACL enforcement):** ✅

## Files Added/Modified

### Added
- `packages/db/migrations/0175_goods_receipts.sql`
- `packages/db/migrations/0176_acl_purchasing_receipts.sql`
- `apps/api/src/lib/purchasing/goods-receipt.ts`
- `apps/api/src/routes/purchasing/goods-receipts.ts`
- `apps/api/__test__/integration/purchasing/goods-receipts.test.ts`
- `_bmad-output/implementation-artifacts/stories/epic-46/story-46.4.completion.md`

### Modified
- `packages/db/src/kysely/schema.ts`
- `packages/shared/src/schemas/purchasing.ts`
- `packages/shared/src/constants/roles.defaults.json`
- `apps/api/src/routes/purchasing/index.ts`
- `apps/api/src/lib/test-fixtures.ts`
- `_bmad-output/implementation-artifacts/stories/epic-46/story-46.4.md`

## Notes

- GR remains off-balance-sheet (no journal posting), as designed for Story 46.4.
- `sprint-status.yaml` now correctly reflects:
  - `46-3-purchase-orders: done`
  - `46-4-goods-receipt: done`
