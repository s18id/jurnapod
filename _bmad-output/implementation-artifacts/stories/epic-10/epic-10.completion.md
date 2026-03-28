# Epic 10: Fix Critical Hardcoded ID Tests - COMPLETED

## Summary

Refactored 3 brittle test files that used hardcoded `TEST_*_ID` constants (especially `company_id=1`) to use dynamic IDs from library functions. Added `createOutletBasic()` library function.

## Stories Completed

| Story | Status | Completion Notes |
|-------|--------|------------------|
| 10.1 | ✅ Done | Added `createOutletBasic()` to outlets.ts |
| 10.2 | ✅ Done | Refactored `variant-stock.test.ts` |
| 10.3 | ✅ Done | Refactored `services/stock.test.ts` |
| 10.4 | ✅ Done | Refactored `routes/stock.test.ts` |

## Completion Evidence

### Test Results
```
# tests 1524
# pass 1524
# fail 0
# cancelled 0
```

### Files Modified
1. `apps/api/src/lib/outlets.ts` - Added `createOutletBasic()` function
2. `apps/api/src/lib/inventory/variant-stock.test.ts` - Refactored to use dynamic IDs
3. `apps/api/src/services/stock.test.ts` - Refactored to use dynamic IDs
4. `apps/api/src/routes/stock.test.ts` - Refactored to use dynamic IDs

### Key Changes

**Story 10.1 - createOutletBasic():**
- Added `createOutletBasic()` function following `createCompanyBasic()` pattern
- No audit logging (difference from `createOutlet()`)
- Returns `{ id, company_id, code, name }`
- Checks for duplicate `company_id + code` combination

**Stories 10.2-10.4 - Test Refactoring:**
- Removed hardcoded `TEST_COMPANY_ID`, `TEST_OUTLET_ID`, `TEST_PRODUCT_ID` constants
- Each test now creates its own company/outlet dynamically using `createCompanyBasic()` and `createOutletBasic()`
- All INSERT statements use dynamic IDs from created entities
- All DELETE cleanup statements use dynamic IDs
- Proper cleanup order maintained (children before parents due to FK constraints)

## Technical Details

### createOutletBasic() Signature
```typescript
export async function createOutletBasic(params: {
  company_id: number;
  code: string;
  name: string;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
}): Promise<{ id: number; company_id: number; code: string; name: string }>
```

### Before/After Example

**Before (brittle):**
```typescript
const TEST_COMPANY_ID = 1;
const TEST_OUTLET_ID = 1;
await conn.execute(
  `INSERT INTO items (company_id, name) VALUES (?, ?)`,
  [TEST_COMPANY_ID, `Test Item ${runId}`]
);
```

**After (robust):**
```typescript
const company = await createCompanyBasic({
  code: `TEST-VS-${runId}`,
  name: `Test Variant Stock ${runId}`
});
const outlet = await createOutletBasic({
  company_id: company.id,
  code: `OUTLET-${runId}`,
  name: `Outlet ${runId}`
});
await conn.execute(
  `INSERT INTO items (company_id, name) VALUES (?, ?)`,
  [company.id, `Test Item ${runId}`]
);
```

## Dependencies
- Epic 9 completed (provided `createCompanyBasic()` and `createUserBasic()`)

## Follow-up
- Epic 11 will refactor remaining 11 test files with hardcoded IDs
