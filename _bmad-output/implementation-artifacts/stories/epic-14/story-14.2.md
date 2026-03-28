# Story 14.2: Migrate auth/permissions.ts to Kysely

**Epic:** Epic 14  
**Story Number:** 14.2  
**Status:** done
**Completed:** 2026-03-28
**Estimated Time:** 1 hour  
**Priority:** P1

---

## Summary

Migrate `apps/api/src/lib/auth/permissions.ts` function from raw SQL to Kysely ORM, including bitwise permission check.

## Functions to Migrate

| Function | SQL Pattern | Lines |
|----------|-------------|-------|
| `canManageCompanyDefaults` | 3-way JOIN with bitmask | 35-48 |

## Technical Approach

### Pattern

```typescript
// BEFORE
const [rows] = await pool.execute<AccessCheckRow[]>(
  `SELECT 1
   FROM user_role_assignments ura
   INNER JOIN roles r ON r.id = ura.role_id
   INNER JOIN module_roles mr ON mr.role_id = r.id
   WHERE ... AND (mr.permission_mask & ?) <> 0
   LIMIT 1`,
  [userId, module, companyId, permissionBit]
);

// AFTER
import { sql } from 'kysely';

const row = await db
  .selectFrom('user_role_assignments as ura')
  .innerJoin('roles as r', 'r.id', 'ura.role_id')
  .innerJoin('module_roles as mr', 'mr.role_id', 'r.id')
  .where('ura.user_id', '=', userId)
  // ... other where clauses
  .where(sql`(${sql`mr.permission_mask`} & ${sql`${permissionBit}`})`, '<>', 0)
  .select(['ura.id'])
  .executeTakeFirst();
```

## Key Challenge

The bitmask permission check requires Kysely's `sql` template tag for raw expression:

```typescript
sql`(${sql`mr.permission_mask`} & ${sql`${permissionBit}`})`
```

## Dependencies

- `@jurnapod/db` package with Kysely schema
- `MODULE_PERMISSION_BITS` constant (unchanged)

## Acceptance Criteria

- [x] `canManageCompanyDefaults` uses Kysely query builder
- [x] Bitmask check uses `sql` template tag correctly
- [x] 3-way JOIN logic preserved exactly
- [x] Same function signature (no breaking changes)
- [x] All existing tests pass
- [x] TypeScript compilation succeeds

## Dev Notes

- The `sql` template tag nesting is required for proper typing
- `permissionBit` must be included via template interpolation
- `LIMIT 1` achieved via `executeTakeFirst()`

## Files Modified

- `apps/api/src/lib/auth/permissions.ts`
- `apps/api/src/lib/auth/permissions.test.ts` (if exists)

## Dev Agent Record

### Completion Notes

**Implementation:**
- Migrated `canManageCompanyDefaults` from raw SQL `execute()` to Kysely query builder
- Used Kysely's `sql` template tag for bitmask check: `where(sql\`(${sql\`mr.permission_mask\`} & ${sql\`${permissionBit}\`})\`, "<>", 0)`
- Preserved exact 3-way JOIN logic: `user_role_assignments → roles → module_roles`
- Removed `AccessCheckRow` type (no longer needed with Kysely)
- Uses `newKyselyConnection()` helper from `@jurnapod/db`
- Uses `executeTakeFirst()` instead of `LIMIT 1`

**Testing:**
- All 7 unit tests pass (routes/permissions.test.ts - tests MODULE_PERMISSION_BITS and bitmask logic)
- TypeScript compilation succeeds
- Build succeeds

### Files Changed

- `apps/api/src/lib/auth/permissions.ts` (migrated to Kysely)

---

*Story file created: 2026-03-28*
*Story completed: 2026-03-28*
