# Story 13.5: Refactor inventory.ts Route

**Status:** backlog  
**Epic:** Epic 13: Complete Library Migration for Deferred Routes  
**Story ID:** 13-5-refactor-inventory-route  
**Estimated Effort:** 2 hours  
**Depends on:** 13.4

---

## Context

Simple refactoring of `inventory.ts` to use the new access-check library.

---

## Changes Required

### AC1: Import Library

```typescript
// Add import
import { checkItemAccess } from "../lib/inventory/access-check.js";
```

### AC2: Replace Access Check

**Before:**
```typescript
const pool = getDbPool();
const [rows] = await pool.execute<AccessCheckRow[]>(
  `SELECT 1 as has_access FROM items...`,
  [itemId, companyId, outletId]
);
const hasAccess = rows.length > 0;
```

**After:**
```typescript
const accessResult = await checkItemAccess(itemId, companyId, outletId);
const hasAccess = accessResult.hasAccess;
```

### AC3: Enhanced Error Messages (Optional)

Use reason codes for better errors:
```typescript
if (!accessResult.hasAccess) {
  const message = accessResult.reason === 'not_found' 
    ? "Item not found"
    : accessResult.reason === 'wrong_company'
    ? "Item belongs to different company"
    : "Item not available in this outlet";
  return errorResponse("FORBIDDEN", message, 403);
}
```

### AC4: Zero Direct SQL

- [ ] Remove `import { getDbPool }` (if not used elsewhere)
- [ ] No `pool.execute()` calls

---

## Files to Modify

1. `apps/api/src/routes/inventory.ts`

---

## Verification

```bash
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
# Manual test: Access inventory item with/without permissions
```

---

## Definition of Done

- [ ] Route uses access-check library
- [ ] Zero direct SQL in route
- [ ] TypeScript compilation passes
- [ ] Functionality preserved

---

*Quick win story - simple refactoring.*
