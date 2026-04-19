# Story 46.7 — Supplier Credit Notes — Completion Report

## Story
- **ID:** 46.7
- **Title:** Supplier Credit Notes
- **Epic:** 46 — Purchasing / Accounts Payable Module
- **Status:** ✅ DONE

## Implementation Summary

Implemented supplier credit notes end-to-end with draft/apply/void lifecycle:

1. **Schema + ACL**
   - Added `purchase_credits`, `purchase_credit_lines`, and `purchase_credit_applications`
   - Added ACL seed for `purchasing.credits`
   - Added Kysely types + shared constants/schemas

2. **Credit application logic**
   - Draft creation computes `total_credit_amount`
   - Apply supports explicit PI reference and FIFO fallback to oldest open invoices
   - Supports partial application with remaining credit amount
   - Tracks `applied_amount` and status transitions (`DRAFT`→`PARTIAL/APPLIED`)

3. **Accounting impact**
   - Apply creates balanced journal entries per applied amount
   - Pattern aligns with AP reduction requirement: `D: AP`, `C: Inventory/Expense reversal`
   - Void creates reversal journal and restores open invoice amounts through application reversal

4. **Safety/consistency hardening**
   - Tenant scoping on all critical reads/writes
   - Locking (`FOR UPDATE`) in apply/void paths to reduce race risk
   - Deterministic decimal handling for allocation/application math

## Acceptance Criteria Coverage

| AC | Requirement | Status |
|---|---|---|
| AC1 | Credit note creation in DRAFT with total computed | ✅ |
| AC2 | Apply creates AP-reducing journal + PI balance reduction | ✅ |
| AC3 | Explicit PI matching + FIFO fallback | ✅ |
| AC4 | Partial application with remaining credit tracked | ✅ |
| AC5 | ACL enforcement for `purchasing.credits` | ✅ |
| AC6 | Void creates reversal and restores prior effects | ✅ |

## Files Added / Modified

### Added
- `packages/db/migrations/0183_purchase_credits.sql`
- `packages/db/migrations/0184_acl_purchasing_credits.sql`
- `apps/api/src/lib/purchasing/purchase-credit.ts`
- `apps/api/src/routes/purchasing/purchase-credits.ts`
- `apps/api/__test__/integration/purchasing/purchase-credits.test.ts`

### Modified
- `packages/db/src/kysely/schema.ts`
- `packages/shared/src/constants/purchasing.ts`
- `packages/shared/src/schemas/purchasing.ts`
- `packages/shared/src/constants/roles.defaults.json`
- `apps/api/src/routes/purchasing/index.ts`
- `apps/api/src/lib/test-fixtures.ts`

## Validation Evidence

### Story suite
- `purchase-credits.test.ts`: **6/6 pass**

### Purchasing regression
- `purchase-credits.test.ts`: 6/6
- `ap-payments.test.ts`: 27/27
- `purchase-invoices.test.ts`: 15/15
- `purchase-orders.test.ts`: 27/27
- `goods-receipts.test.ts`: 21/21
- `exchange-rates.test.ts`: 26/26

**Total regression subset:** **122/122 passing**

## Notes

- Status/state columns introduced in this story use `TINYINT`.
- Credit note accounting direction follows story requirement and AP-liability reduction convention.
