# Story 14.2 Completion: Migrate auth/permissions.ts to Kysely

## Summary
Migrated `canManageCompanyDefaults` function from raw SQL to Kysely ORM, including bitwise permission check.

## Files Modified
- `apps/api/src/lib/auth/permissions.ts`
- `apps/api/src/lib/auth/permissions.test.ts` (new)

## Changes
- Replaced raw SQL with Kysely query builder
- Used `sql` template tag for bitmask check: `sql\`(${sql\`mr.permission_mask\`} & ${sql\`${permissionBit}\`})\``
- 3-way JOIN logic preserved exactly
- Added connection leak fix (try/finally)
- New unit tests added (7 tests)

## Test Results
```
npm run test:unit:single -w @jurnapod/api src/lib/auth/permissions.test.ts
# pass 7 (100%)
```

## Acceptance Criteria Evidence
- [x] `canManageCompanyDefaults` uses Kysely query builder
- [x] Bitmask check uses `sql` template tag correctly
- [x] 3-way JOIN logic preserved exactly
- [x] Same function signature (no breaking changes)
- [x] All existing tests pass
- [x] TypeScript compilation succeeds
- [x] New unit tests added for the function

## Technical Notes
- The `sql` template tag nesting is required for proper typing
- `permissionBit` interpolated via template literal
- `executeTakeFirst()` used instead of `LIMIT 1`

---

_Completion date: 2026-03-28_
