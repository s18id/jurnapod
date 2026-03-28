# Story 12.1: Create `lib/settings-modules.ts` Library

**Status:** backlog  
**Epic:** Epic 12: Standardize Library Usage for All Routes  
**Story ID:** 12-1-create-settings-modules-library  
**Estimated Effort:** 4 hours

---

## Context

The `settings-modules.ts` route has 3 direct SQL queries that need to be moved to a library module. This is the first story in Epic 12 and will establish the library pattern for subsequent stories.

Current route queries:
1. List modules for company (JOIN with company_modules)
2. Get module_id by code
3. Upsert company_module settings

---

## Acceptance Criteria

### AC1: Library Functions

Create `apps/api/src/lib/settings-modules.ts` with:

```typescript
// List all modules for a company with their settings
async function listCompanyModules(companyId: number): Promise<ModuleSettings[]>

// Get module ID by code (for internal use)
async function getModuleIdByCode(
  code: string, 
  connection?: PoolConnection
): Promise<number | null>

// Update or insert company module settings
async function updateCompanyModule(
  companyId: number,
  moduleCode: string,
  enabled: boolean,
  configJson: string | null,
  connection?: PoolConnection
): Promise<void>

// Check if a module is enabled
async function isModuleEnabled(
  companyId: number, 
  moduleCode: string
): Promise<boolean>
```

### AC2: Type Definitions

```typescript
export interface ModuleSettings {
  code: string;
  name: string;
  enabled: boolean;
  config_json: string | null;
}
```

### AC3: Error Types

```typescript
export class ModuleNotFoundError extends Error {
  constructor(code: string) {
    super(`Module ${code} not found`);
    this.name = "ModuleNotFoundError";
  }
}
```

### AC4: Connection Parameter Support

- All functions accept optional `PoolConnection` for transaction support
- Falls back to `getDbPool()` when no connection provided
- Example:
```typescript
async function getModuleIdByCode(
  code: string,
  connection?: PoolConnection
): Promise<number | null> {
  const db = connection || getDbPool();
  // ... use db
}
```

### AC5: SQL Queries (from route)

**listCompanyModules:**
```sql
SELECT m.code, m.name, cm.enabled, cm.config_json
FROM modules m
INNER JOIN company_modules cm ON cm.module_id = m.id
WHERE cm.company_id = ?
ORDER BY m.code ASC
```

**getModuleIdByCode:**
```sql
SELECT id FROM modules WHERE code = ? LIMIT 1
```

**updateCompanyModule:**
```sql
INSERT INTO company_modules (company_id, module_id, enabled, config_json, updated_at)
VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE
  enabled = VALUES(enabled),
  config_json = VALUES(config_json),
  updated_at = CURRENT_TIMESTAMP
```

**isModuleEnabled:**
```sql
SELECT cm.enabled
FROM company_modules cm
INNER JOIN modules m ON m.id = cm.module_id
WHERE cm.company_id = ? AND m.code = ?
```

### AC6: Test Coverage

Create `apps/api/src/lib/settings-modules.test.ts` with:
- Test `listCompanyModules` returns modules for company
- Test `getModuleIdByCode` returns correct ID or null
- Test `updateCompanyModule` creates new record
- Test `updateCompanyModule` updates existing record
- Test `isModuleEnabled` returns correct boolean
- Test `ModuleNotFoundError` thrown when module doesn't exist

---

## Files to Create

1. `apps/api/src/lib/settings-modules.ts` - Library implementation
2. `apps/api/src/lib/settings-modules.test.ts` - Unit tests

---

## Implementation Notes

- Follow existing library patterns (see `lib/accounts.ts`, `lib/companies.ts`)
- Use proper TypeScript types, avoid `any`
- Use `RowDataPacket` from mysql2 for query results
- Follow existing error naming conventions
- Include JSDoc comments for all public functions

---

## Definition of Done

- [ ] Library file created with all functions
- [ ] Type definitions exported
- [ ] Error class exported
- [ ] Test file created with comprehensive coverage
- [ ] All tests pass
- [ ] TypeScript compilation passes
- [ ] No direct SQL in library (uses `pool.execute()`)

---

## Dependencies

- `lib/db.ts` - For `getDbPool()`
- `mysql2/promise` - For types

---

*Ready for implementation.*
