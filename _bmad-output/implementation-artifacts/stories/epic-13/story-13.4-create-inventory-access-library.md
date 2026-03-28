# Story 13.4: Create lib/inventory/access-check.ts

**Status:** done  
**Epic:** Epic 13: Complete Library Migration for Deferred Routes  
**Story ID:** 13-4-create-inventory-access-library  
**Estimated Effort:** 2 hours

---

## Context

The `inventory.ts` route has a single access check query that should be moved to a library.

---

## Current Code

**File:** `apps/api/src/routes/inventory.ts` (lines 97-100)

```typescript
const pool = getDbPool();
const [rows] = await pool.execute<AccessCheckRow[]>(
  `SELECT 1 as has_access
   FROM items i
   WHERE i.id = ?
     AND i.company_id = ?
     AND (i.outlet_id IS NULL OR i.outlet_id = ?)
   LIMIT 1`,
  [itemId, companyId, outletId]
);
const hasAccess = rows.length > 0;
```

---

## Acceptance Criteria

### AC1: Access Check Function

```typescript
export interface AccessCheckResult {
  hasAccess: boolean;
  reason?: 'not_found' | 'wrong_company' | 'wrong_outlet';
}

/**
 * Check if user has access to an inventory item
 * @param itemId - Item ID to check
 * @param companyId - Company ID (for scoping)
 * @param outletId - Outlet ID (for scoping)
 * @param connection - Optional database connection
 * @returns Access check result
 */
export async function checkItemAccess(
  itemId: number,
  companyId: number,
  outletId?: number,
  connection?: PoolConnection
): Promise<AccessCheckResult>
```

### AC2: SQL Query

```sql
SELECT 1 as has_access, i.outlet_id
FROM items i
WHERE i.id = ?
  AND i.company_id = ?
  AND i.deleted_at IS NULL
LIMIT 1
```

### AC3: Reason Codes

Return specific reason when access denied:
- `not_found` - Item doesn't exist
- `wrong_company` - Item belongs to different company
- `wrong_outlet` - Item not available in this outlet

---

## Files to Create

1. `apps/api/src/lib/inventory/access-check.ts`
2. `apps/api/src/lib/inventory/access-check.test.ts`

---

## Implementation Notes

- Simple single-function library
- Used by inventory route and potentially others
- Clear reason codes for debugging

---

## Definition of Done

- [ ] Function implemented with reason codes
- [ ] Unit tests for all access scenarios
- [ ] TypeScript compilation passes

---

*Simple story - good for quick win.*
