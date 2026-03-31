# Story 18.6: Migrate modules-accounting to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - Packages

---

## Story

As a developer,
I want `modules-accounting` to use pure Kysely API for all database operations,
so that the package fully migrates from mysql2-style patterns and `.kysely` wrapper.

## Context

modules-accounting currently uses:
- `this.db.kysely.selectFrom()` - unnecessary wrapper
- `this.db.execute()` - mysql2-style
- `this.db.begin/commit/rollback()` - mysql2-style transactions

This needs to be migrated to pure Kysely.

## Acceptance Criteria

1. **Migrate accounts-service.ts** (AC-1)
   - Remove `.kysely` wrapper → use `this.db` directly
   - Convert `begin/commit/rollback` → `db.transaction().execute()`

2. **Migrate account-types-service.ts** (AC-2)
   - Same pattern conversion

3. **Migrate journals-service.ts** (AC-3)
   - Remove `.kysely` wrapper
   - Convert `execute()` → `sql` template or Kysely
   - Convert transactions

4. **Typecheck passes** (AC-4)
   - `npm run typecheck -w @jurnapod/modules-accounting`

## Tasks

- [ ] Task 1: Migrate accounts-service.ts
- [ ] Task 2: Migrate account-types-service.ts
- [ ] Task 3: Migrate journals-service.ts
- [ ] Task 4: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `packages/modules/accounting/src/accounts-service.ts` | Remove .kysely, fix transactions |
| `packages/modules/accounting/src/account-types-service.ts` | Remove .kysely, fix transactions |
| `packages/modules/accounting/src/journals-service.ts` | Remove .kysely, fix execute/transactions |

## Pattern Conversion

```typescript
// Remove .kysely wrapper
// BEFORE
this.db.kysely.selectFrom('accounts')...

// AFTER
this.db.selectFrom('accounts')...

// Transaction conversion
// BEFORE
await this.db.begin();
try { ... await this.db.commit(); } catch { await this.db.rollback(); }

// AFTER
await this.db.transaction().execute(async (trx) => { ... });
```

## Dev Notes

### Dependencies
- Story 18.1 (verify db exports) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/modules-accounting`
- `npm run build -w @jurnapod/modules-accounting`

## Definition of Done

- [ ] All 3 files migrated to pure Kysely
- [ ] No `.kysely` wrapper remains
- [ ] No mysql2-style patterns remain
- [ ] Typecheck passes
- [ ] Build passes

## References

- [modules-accounting AGENTS.md]
- [Epic 18: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
