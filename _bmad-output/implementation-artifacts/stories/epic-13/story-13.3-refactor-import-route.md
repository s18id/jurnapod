# Story 13.3: Refactor import.ts Route

**Status:** done  
**Epic:** Epic 13: Complete Library Migration for Deferred Routes  
**Story ID:** 13-3-refactor-import-route  
**Estimated Effort:** 4 hours  
**Depends on:** 13.1, 13.2

---

## Context

Refactor the complex `import.ts` route (1200+ lines) to use the new libraries.

---

## Current Structure

```typescript
// Current import.ts has:
// 1. Upload handling
// 2. File parsing (CSV/Excel)
// 3. Validation (inline)
// 4. Batch processing (inline SQL)
// 5. Session management
// 6. Progress tracking
```

---

## Acceptance Criteria

### AC1: Import Libraries

Replace inline code with libraries:

```typescript
// BEFORE: Inline validation
const errors = validateItemsInline(items);

// AFTER: Library validation
import { validateImportItems, preValidateItems } from "../lib/import/validation.js";
const validationResult = await validateImportItems(companyId, items);
```

```typescript
// BEFORE: Inline batch SQL
await connection.execute(`INSERT INTO items...`);

// AFTER: Library batch operations
import { batchInsertItems, batchUpdateItems } from "../lib/import/batch-operations.js";
await batchInsertItems(companyId, items, connection);
```

### AC2: Keep Complex Logic

Preserve in route (not in library):
- File upload handling
- Session management
- Progress tracking
- Error response formatting

### AC3: Transaction Management

Route manages transactions:
```typescript
const connection = await pool.getConnection();
await connection.beginTransaction();
try {
  await batchInsertItems(companyId, items, connection);
  await connection.commit();
} catch (e) {
  await connection.rollback();
  throw e;
} finally {
  connection.release();
}
```

### AC4: Zero Direct SQL

Verify no SQL in route:
- [ ] No `pool.execute()` calls
- [ ] No inline SQL strings
- [ ] All DB operations through libraries

---

## Files to Modify

1. `apps/api/src/routes/import.ts`

---

## Verification

```bash
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
# Manual test: Import items CSV
# Manual test: Import prices CSV
```

---

## Definition of Done

- [ ] Route uses validation library
- [ ] Route uses batch-operations library
- [ ] Zero direct SQL in route
- [ ] All import functionality preserved
- [ ] TypeScript compilation passes
- [ ] Integration tests pass

---

*Ready for implementation after 13.1 and 13.2.*
