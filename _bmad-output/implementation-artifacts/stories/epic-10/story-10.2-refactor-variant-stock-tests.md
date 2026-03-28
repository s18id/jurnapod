# Story 10.2: Refactor variant-stock.test.ts

## Epic
Epic 10: Fix Critical Hardcoded ID Tests

## Status
done

## Completion Notes

### Work Performed

Refactored `inventory/variant-stock.test.ts` to remove hardcoded `TEST_COMPANY_ID = 1` and `TEST_OUTLET_ID = 1`.

### Changes Made

- Removed hardcoded `TEST_COMPANY_ID = 1` and `TEST_OUTLET_ID = 1`
- Added imports for `createCompanyBasic` and `createOutletBasic`
- Each test now creates its own company/outlet dynamically using unique codes
- Updated all INSERTs to use `company.id` and `outlet.id`
- Updated cleanup to delete in proper order: variant_combinations → variants → items → outlets → companies
- Each describe block properly closes its DB pool

### Verification

- Type check: ✅ Passed
- Tests: ✅ 1524/1524 passing
- No FK constraint errors

## Files Modified

- `apps/api/src/lib/inventory/variant-stock.test.ts`
