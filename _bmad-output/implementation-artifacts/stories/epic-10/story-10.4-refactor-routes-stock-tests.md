# Story 10.4: Refactor routes/stock.test.ts

## Epic
Epic 10: Fix Critical Hardcoded ID Tests

## Status
done

## Completion Notes

### Work Performed

Refactored `routes/stock.test.ts` to remove hardcoded `TEST_COMPANY_ID`, `TEST_OUTLET_ID`, and `TEST_PRODUCT_ID`.

### Changes Made

- Removed hardcoded `TEST_COMPANY_ID = 999999`, `TEST_OUTLET_ID = 999998`, `TEST_PRODUCT_ID = 999997`
- Added imports for `createCompanyBasic` and `createOutletBasic`
- Setup function now creates dynamic company/outlet and stores IDs
- Updated `cleanupTestData()` to delete outlets by `company_id`
- All 18 references to hardcoded IDs replaced with dynamic IDs

### Verification

- Type check: ✅ Passed
- Tests: ✅ 1524/1524 passing
- No FK constraint errors

## Files Modified

- `apps/api/src/routes/stock.test.ts`
