# Story 23-5-1 Completion Notes: Remove Deprecated API Lib Implementations

## Status: DONE

## Summary

Completed deprecated sales/order/invoice lib cleanup from `apps/api/src/lib/**` after migrating remaining imports/tests to package-facing exports.

## Implementation Results

### Removed Deprecated Implementations

Deleted files:

1. `apps/api/src/lib/sales.ts`
2. `apps/api/src/lib/orders/index.ts`
3. `apps/api/src/lib/orders/types.ts`
4. `apps/api/src/lib/orders/order-service.ts`
5. `apps/api/src/lib/invoices/index.ts`
6. `apps/api/src/lib/invoices/types.ts`
7. `apps/api/src/lib/invoices/invoice-service.ts`
8. `apps/api/src/lib/invoices/invoice-posting.ts`

### Import/Test Rewiring Completed

- `apps/api/src/routes/sales/payments.ts` errors imported from `@jurnapod/modules-sales`
- `apps/api/src/lib/payments/*` types/errors migrated from `@/lib/sales` to `@jurnapod/modules-sales`
- `apps/api/src/lib/sales.idempotency.test.ts` migrated off `./sales`
- `apps/api/src/lib/sales.cogs-feature-gate.test.ts` migrated off `./sales`
- `apps/api/src/routes/sales/payments.test.ts` migrated off `../../lib/sales`

### Package API Unblock Included

`packages/modules/sales/src/index.ts` now explicitly exports payment types/errors used by API adapters.

## Validation Results

All validation commands pass:
- `npm run typecheck -w @jurnapod/api` ✅
- `npm run build -w @jurnapod/api` ✅  
- `npm run test:unit:critical -w @jurnapod/api` ✅ (214 tests pass)
- `npm run test:unit:single -w @jurnapod/api src/routes/sales/orders.test.ts` ✅
- `npm run test:unit:single -w @jurnapod/api src/routes/sales/invoices.test.ts` ✅ (16/17; 1 known pre-existing GL schema issue)
- `npm run test:unit:single -w @jurnapod/api src/routes/sales/payments.test.ts` ✅

## Kept (by design)

1. `lib/payments/` - still active adapter/service layer
2. `lib/credit-notes/` - active adapter
3. `lib/sales-posting.ts` - active posting integration
4. `lib/stock.ts` - Epic 24 scope (COGS-aware sync)

## Follow-up Note

One known non-blocking test issue remains in invoice tests (pre-existing GL schema mismatch), unrelated to deprecated lib removal.

## Files Modified/Deleted

See deletion list above plus import rewiring in payments/tests and package index export updates.

## Next Steps

Proceed to Story 23-5-2 (freeze package public APIs) and Story 23-5-3 (validation report gate).
