# Story 12.2: Refactor `settings-modules.ts` Route

**Status:** backlog  
**Epic:** Epic 12: Standardize Library Usage for All Routes  
**Story ID:** 12-2-refactor-settings-modules-route  
**Estimated Effort:** 2 hours  
**Depends on:** Story 12.1

---

## Context

Refactor the `settings-modules.ts` route to use the new library instead of direct SQL. This story demonstrates the route-to-library pattern that other stories will follow.

---

## Acceptance Criteria

### AC1: Import Library

Replace direct SQL imports with library imports:

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

### AC2: Replace GET Handler

**Before:**
```typescript
const pool = getDbPool();
const [rows] = await pool.execute<any[]>(
  `SELECT m.code, m.name, cm.enabled, cm.config_json
   FROM modules m
   INNER JOIN company_modules cm ON cm.module_id = m.id
   WHERE cm.company_id = ?
   ORDER BY m.code ASC`,
  [auth.companyId]
);

const modules = rows.map((row) => ({
  code: row.code,
  name: row.name,
  enabled: Boolean(row.enabled),
  config_json: row.config_json
}));
```

**After:**
```typescript
const modules = await listCompanyModules(auth.companyId);
```

### AC3: Replace PUT Handler

**Before:**
```typescript
const pool = getDbPool();

for (const module of input.modules) {
  // Get module_id from code
  const [moduleRows] = await pool.execute<any[]>(
    `SELECT id FROM modules WHERE code = ? LIMIT 1`,
    [module.code]
  );

  if (moduleRows.length === 0) {
    return errorResponse("NOT_FOUND", `Module ${module.code} not found`, 404);
  }

  const moduleId = moduleRows[0].id;

  // Update or insert company_module
  await pool.execute(
    `INSERT INTO company_modules ...`,
    [auth.companyId, moduleId, module.enabled ? 1 : 0, module.config_json || null]
  );
}
```

**After:**
```typescript
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

### AC4: Error Handling

- Catch `ModuleNotFoundError` and return 404
- All other errors should bubble up to existing error handler
- Remove manual 404 checks (handled by library error)

### AC5: Zero Direct SQL

Verify no SQL queries remain in route file:
- [ ] No `pool.execute()` calls
- [ ] No `getDbPool()` calls
- [ ] No SQL strings

### AC6: Imports Cleanup

Remove unused imports:
- [ ] Remove `import { getDbPool } from "../lib/db.js";`
- Keep other imports (auth-guard, response, users, request-meta)

---

## Files to Modify

1. `apps/api/src/routes/settings-modules.ts` - Refactor to use library

---

## Verification Steps

1. **Type Check:** `npm run typecheck -w @jurnapod/api`
2. **Tests:** `npm run test:unit -w @jurnapod/api` (settings-modules tests should pass)
3. **Lint:** `npm run lint -w @jurnapod/api`
4. **Manual:** Test GET /settings/modules and PUT /settings/modules endpoints

---

## Definition of Done

- [ ] Route imports from library
- [ ] GET handler uses `listCompanyModules()`
- [ ] PUT handler uses `updateCompanyModule()`
- [ ] Error handling catches `ModuleNotFoundError`
- [ ] No direct SQL in route file
- [ ] All tests pass
- [ ] TypeScript compilation passes
- [ ] Route functionality verified (manual or integration test)

---

## Dependencies

- Story 12.1 complete (library exists)
- `lib/settings-modules.ts` with all functions

---

*Ready for implementation after Story 12.1.*
