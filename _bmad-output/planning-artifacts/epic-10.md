# Epic 10: Fix Critical Hardcoded ID Tests

## Overview

Refactor the most brittle tests that use hardcoded `TEST_*_ID` constants (especially `company_id=1`) to use dynamic IDs from `createCompanyBasic()` and the new `createOutletBasic()` library functions.

## Problem Statement

- **14 test files** use hardcoded `TEST_*_ID` constants with **529+ references** to `TEST_COMPANY_ID`
- `variant-stock.test.ts` uses `company_id=1, outlet_id=1` which will fail in a clean database
- Tests INSERT rows with hardcoded FK values **without creating parent entities first**
- This creates brittle, environment-dependent tests

## Scope

### In Scope
- Add `createOutletBasic()` library function to `outlets.ts`
- Refactor `inventory/variant-stock.test.ts` (uses `company_id=1`)
- Refactor `services/stock.test.ts` (65+ hardcoded `TEST_OUTLET_ID` refs)
- Refactor `routes/stock.test.ts` (18 refs)
- All tests use dynamic IDs from library functions

### Out of Scope
- Remaining test files (Epic 11)
- Changes to production library functions beyond `createOutletBasic()`

## Dependencies

- Epic 9 completed: `createCompanyBasic()` and `createUserBasic()` exist
- `createOutletBasic()` needs to be created first

## Success Criteria

1. `createOutletBasic()` added to `apps/api/src/lib/outlets.ts`
2. All hardcoded `TEST_COMPANY_ID`, `TEST_OUTLET_ID` removed from 3 test files
3. All tests use `createCompanyBasic()` / `createOutletBasic()` for FK references
4. All 1,524 tests pass after refactoring
5. No FK constraint errors

## Stories

| Story | File | Status |
|-------|------|--------|
| 10.1 | Add `createOutletBasic()` | Pending |
| 10.2 | Refactor `variant-stock.test.ts` | Pending |
| 10.3 | Refactor `services/stock.test.ts` | Pending |
| 10.4 | Refactor `routes/stock.test.ts` | Pending |

## Technical Notes

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

### Implementation Pattern

```typescript
// Before (brittle - hardcoded IDs)
const TEST_COMPANY_ID = 1;
const TEST_OUTLET_ID = 1;
await conn.execute(
  `INSERT INTO items (company_id, name) VALUES (?, ?)`,
  [TEST_COMPANY_ID, `Test Item ${runId}`]
);

// After (robust - dynamic IDs)
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

// Cleanup uses dynamic IDs
await conn.execute(`DELETE FROM items WHERE company_id = ?`, [company.id]);
await conn.execute(`DELETE FROM outlets WHERE company_id = ?`, [company.id]);
await conn.execute(`DELETE FROM companies WHERE id = ?`, [company.id]);
```

## Files to Modify

1. `apps/api/src/lib/outlets.ts` - Add `createOutletBasic()`
2. `apps/api/src/lib/inventory/variant-stock.test.ts` - Refactor
3. `apps/api/src/services/stock.test.ts` - Refactor
4. `apps/api/src/routes/stock.test.ts` - Refactor
