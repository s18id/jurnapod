# Story 15.1: Connection Guard for Library Template

**Epic:** Epic 15
**Story Number:** 15.1
**Status:** backlog
**Estimated Time:** 2 hours
**Priority:** P1

---

## Summary

Add connection guard to library template to prevent connection leaks like the one discovered in Epic 14.

## Context

Epic 14 revealed that library functions using `newKyselyConnection()` could leak connections if the caller doesn't pass a connection. The pattern:

```typescript
// PROBLEMATIC - acquires connection but never releases
const db = newKyselyConnection(
  connection ?? (await getDbPool().getConnection())  // LEAK!
);
```

## Technical Approach

### Option A: Auto-Release Wrapper

Create a wrapper that automatically releases the connection:

```typescript
export async function withKysely<T>(
  callback: (db: Kysely<DB>) => Promise<T>,
  connection?: PoolConnection
): Promise<T> {
  let needsRelease = false;
  let db: Kysely<DB>;
  
  if (connection) {
    db = newKyselyConnection(connection);
  } else {
    const conn = await getDbPool().getConnection();
    needsRelease = true;
    db = newKyselyConnection(conn);
  }
  
  try {
    return await callback(db);
  } finally {
    if (needsRelease) {
      await db.destroy();
    }
  }
}
```

### Option B: Lint Rule

Create ESLint rule that detects when `getDbPool().getConnection()` is called without corresponding `release()` or `destroy()`.

### Recommendation

Implement **Option A** (Auto-Release Wrapper) as primary solution, with Option B (Lint Rule) as backup.

## Acceptance Criteria

- [ ] `withKysely()` wrapper function created
- [ ] All library functions using `newKyselyConnection()` updated to use wrapper
- [ ] Same function signatures preserved (no breaking changes)
- [ ] Connection leak scenario tested
- [ ] All existing tests pass
- [ ] TypeScript compilation succeeds

## Dependencies

- `@jurnapod/db` package with Kysely schema

## Files to Modify

- `apps/api/src/lib/db.ts` (add `withKysely`)
- Library files using `newKyselyConnection()`

---

*Story file created: 2026-03-28*
