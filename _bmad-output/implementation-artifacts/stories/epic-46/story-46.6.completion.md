# Story 46.6 — AP Payments — Completion Report

## Story
- **ID:** 46.6
- **Title:** AP Payments
- **Epic:** 46 — Purchasing / Accounts Payable Module
- **Status:** ✅ DONE

## Implementation Summary

Implemented AP Payments end-to-end with draft/post/void flow and AP balance impact:

1. **Schema + ACL foundation**
   - Added AP payment header/line tables
   - Added ACL seed for `purchasing.payments`
   - Added Kysely types and shared schemas/constants

2. **Domain service (library-first)**
   - Draft create with tenant, supplier, invoice, and overpayment validation
   - Post flow creates balanced journal entries (`D AP`, `C Bank/Cash`) in one transaction
   - Void flow creates reversal journal and restores open invoice amounts

3. **Route layer**
   - Added thin routes under `/api/purchasing/payments`
   - Added ACL enforcement for `purchasing.payments`
   - Added explicit error mapping for domain validation errors

4. **Critical hardening applied**
   - Foreign-currency open amount uses SQL decimal conversion (`ROUND(grand_total * exchange_rate, 4)`)
   - Added row locks (`FOR UPDATE`) for payment/invoice/account consistency in post/void paths
   - Enforced bank account type/active checks (`BANK`/`CASH`, `is_active=1`)
   - Enforced AP account type checks (`LIABILITY`/`CREDITOR`)
   - Added supplier active checks

## Acceptance Criteria Coverage

| AC | Requirement | Status |
|---|---|---|
| AC1 | AP Payment creation in DRAFT | ✅ |
| AC2 | Posting creates journal and transitions status | ✅ |
| AC3 | Partial payment reduces open amount | ✅ |
| AC4 | Full payment drives open amount to 0 (PI remains POSTED) | ✅ |
| AC5 | One payment with multiple PI lines | ✅ |
| AC6 | Bank/Cash account required and validated | ✅ |
| AC7 | Overpayment rejected | ✅ |
| AC8 | ACL enforcement (`purchasing.payments`) | ✅ |
| AC9 | Void creates reversal and restores open amount | ✅ |

## Files Added / Modified

### Added
- `packages/db/migrations/0181_ap_payments.sql`
- `packages/db/migrations/0182_acl_purchasing_payments.sql`
- `apps/api/src/lib/purchasing/ap-payment.ts`
- `apps/api/src/routes/purchasing/ap-payments.ts`
- `apps/api/__test__/integration/purchasing/ap-payments.test.ts`

### Modified
- `packages/db/src/kysely/schema.ts`
- `packages/shared/src/constants/purchasing.ts`
- `packages/shared/src/schemas/purchasing.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/constants/roles.defaults.json`
- `apps/api/src/routes/purchasing/index.ts`
- `apps/api/src/lib/test-fixtures.ts`

## Validation Evidence

### Story test suite
- `ap-payments.test.ts`: **27/27 pass**

### Purchasing regression suite
- `ap-payments.test.ts`: 27/27
- `purchase-invoices.test.ts`: 15/15
- `purchase-orders.test.ts`: 27/27
- `goods-receipts.test.ts`: 21/21
- `exchange-rates.test.ts`: 26/26
- `suppliers.test.ts`: 18/18
- `supplier-contacts.test.ts`: 16/16
- `suppliers-tenant-isolation.test.ts`: 5/5

**Total:** **155/155 passing**

## Notes

- PI fully paid behavior follows approved decision: PI remains `POSTED`; open amount reaches zero.
- Status/state columns introduced in this story use `TINYINT`.
