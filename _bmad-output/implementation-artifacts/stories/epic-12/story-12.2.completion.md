# Story 12.2 Completion: Refactor `settings-modules.ts` Route

**Status:** DONE  
**Epic:** Epic 12: Standardize Library Usage for All Routes  
**Story ID:** 12-2-refactor-settings-modules-route  
**Completed:** 2026-03-28

---

## Summary

Successfully refactored `settings-modules.ts` route to use the library functions from Story 12.1 instead of direct SQL queries.

## Changes Made

### File Modified: `apps/api/src/routes/settings-modules.ts`

**1. Import Changes (lines 20-25)**
```typescript
// BEFORE:
import { getDbPool } from "../lib/db.js";

// AFTER:
import {
  listCompanyModules,
  updateCompanyModule,
  ModuleNotFoundError
} from "../lib/settings-modules.js";
```

**2. GET Handler - Replaced SQL with library call (line 81)**
```typescript
// BEFORE:
const pool = getDbPool();
const [rows] = await pool.execute<any[]>(
  `SELECT m.code, m.name, cm.enabled, cm.config_json
   FROM modules m
   INNER JOIN company_modules cm ON cm.module_id = m.id
   WHERE cm.company_id = ?
   ORDER BY m.code ASC`,
  [auth.companyId]
);
const modules = rows.map((row) => ({...}));

// AFTER:
const modules = await listCompanyModules(auth.companyId);
```

**3. PUT Handler - Replaced SQL with library call (lines 108-122)**
```typescript
// BEFORE:
const pool = getDbPool();
for (const module of input.modules) {
  const [moduleRows] = await pool.execute<any[]>(...);
  if (moduleRows.length === 0) {
    return errorResponse("NOT_FOUND", `Module ${module.code} not found`, 404);
  }
  const moduleId = moduleRows[0].id;
  await pool.execute(`INSERT INTO company_modules...`, [...]);
}

// AFTER:
for (const module of input.modules) {
  try {
    await updateCompanyModule(
      auth.companyId,
      module.code,
      module.enabled,
      module.config_json || null
    );
  } catch (error) {
    if (error instanceof ModuleNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    throw error;
  }
}
```

## Acceptance Criteria Verification

| Criteria | Status |
|----------|--------|
| Import library functions | ✅ |
| GET handler uses `listCompanyModules()` | ✅ |
| PUT handler uses `updateCompanyModule()` | ✅ |
| Error handling catches `ModuleNotFoundError` | ✅ |
| Zero `pool.execute()` calls in route file | ✅ |
| Zero `getDbPool()` calls in route file | ✅ |
| TypeScript compilation passes | ✅ |
| All unit tests pass (58 tests) | ✅ |

## Verification Commands

```bash
npm run typecheck -w @jurnapod/api  # ✅ Passed
npm run lint -w @jurnapod/api       # ✅ No issues in settings-modules.ts
npm run test:unit:single -w @jurnapod/api src/routes/settings-modules.test.ts  # ✅ 58 tests pass
```

## Test Results

- **Total tests:** 58
- **Passed:** 58
- **Failed:** 0
- **Skipped:** 0

## Files Modified

1. `apps/api/src/routes/settings-modules.ts` - Refactored to use library functions

## Notes

- Pre-existing lint issues in other files (unrelated to this change)
- The `/module-roles/:roleId/:module` endpoint still uses direct library calls but is not part of this story's scope
- Library functions provide proper error handling via `ModuleNotFoundError`
