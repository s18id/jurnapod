# Story 10.1: Add createOutletBasic()

## Epic
Epic 10: Fix Critical Hardcoded ID Tests

## Status
done

## Completion Notes

### Work Performed

Added `createOutletBasic()` function to `apps/api/src/lib/outlets.ts`.

### Function Signature

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

### Key Implementation Details

- Uses `getDbPool()` directly (no transaction needed for basic insert)
- Checks for duplicate `company_id + code` combination
- No audit logging (difference from `createOutlet()`)
- Follows same pattern as `createCompanyBasic()`

## Files Modified

- `apps/api/src/lib/outlets.ts`
