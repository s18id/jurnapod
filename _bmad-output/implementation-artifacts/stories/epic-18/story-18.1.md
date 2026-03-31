# Story 18.1: Verify @jurnapod/db Exports

Status: backlog
Priority: P0
Epic: Pure Kysely Migration - Packages

---

## Story

As a developer,
I want `@jurnapod/db` to export the correct types and functions for pure Kysely usage,
so that all packages can migrate from mysql2-style patterns to pure Kysely ORM.

## Context

The `@jurnapod/db` package is the foundation for all database access. It should export:
- `KyselySchema` = `Kysely<DB>` (type alias)
- `createKysely(config)` - factory function
- `getKysely()` - singleton getter
- `withTransaction()` - transaction helper

This story verifies the exports are correct before migrating downstream packages.

## Acceptance Criteria

1. **Verify exports exist** (AC-1)
   - `KyselySchema` type export
   - `createKysely` function export
   - `getKysely` function export
   - `withTransaction` function export

2. **Verify KyselySchema = Kysely<DB>** (AC-2)
   - Type alias is correct
   - Can be used as `Kysely<DB>` replacement

3. **Verify factory functions work** (AC-3)
   - `createKysely` creates a valid Kysely instance
   - `getKysely` returns singleton

4. **No DbConn or JurnapodDbClient exports** (AC-4)
   - These were in old Epic 18 but are superseded
   - Package should NOT export mysql2 wrapper types

## Tasks

- [ ] Task 1: Read `@jurnapod/db/src/index.ts` and verify exports
- [ ] Task 2: Verify type definitions in `@jurnapod/db/src/kysely/`
- [ ] Task 3: Document any missing exports or issues

## Files to Verify

| File | Purpose |
|------|---------|
| `packages/db/src/index.ts` | Main exports |
| `packages/db/src/kysely/index.ts` | Factory functions |
| `packages/db/src/kysely/schema.ts` | DB type |
| `packages/db/src/kysely/transaction.ts` | withTransaction helper |

## Dev Notes

### Expected Exports
```typescript
// packages/db/src/index.ts
export type { DB as DatabaseSchema } from './kysely/schema.js';
export { createKysely, getKysely, type KyselySchema } from './kysely/index.js';
export { withTransaction } from './kysely/transaction.js';
export type { Transaction } from './kysely/transaction.js';
```

### Kysely Usage Pattern
```typescript
import { createKysely, getKysely, type KyselySchema } from '@jurnapod/db';

const db = createKysely({ uri: 'mysql://...' });
// or
const db = getKysely();

// Query
const rows = await db.selectFrom('items').where('company_id', '=', 1).execute();

// Transaction
await db.transaction().execute(async (trx) => { ... });
```

## Definition of Done

- [ ] All expected exports verified present
- [ ] TypeScript typecheck passes for `@jurnapod/db`
- [ ] Build passes for `@jurnapod/db`
- [ ] No mysql2 wrapper types exported
- [ ] Documentation of any issues found

## References

- [Auth package Kysely usage: `packages/auth/src/lib/kysely-adapter.ts`]
- [Epic 18: Pure Kysely Migration]

---

## Dev Agent Record

### Agent Model Used

<!-- To be filled by dev agent -->

### Debug Log References

<!-- To be filled by dev agent -->

### Completion Notes

<!-- To be filled by dev agent -->

### Files Modified

<!-- To be filled by dev agent -->

### Test Evidence

<!-- To be filled by dev agent -->
