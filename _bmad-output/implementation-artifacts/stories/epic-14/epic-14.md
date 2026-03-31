# Epic 14: Kysely ORM Migration for Epic 13 Libraries

**Status:** Ready for Development  
**Theme:** Migrate Epic 13 library modules from raw SQL to Kysely ORM  
**Epic Number:** 14  
**Dependencies:** Epic 13 (completed - provides migration targets)  
**Estimated Duration:** ~8 hours (1-2 days)

---

## Summary

Epic 14 migrates the library modules created in Epic 13 from raw SQL to Kysely ORM. This completes the ORM migration for the import infrastructure and permissions modules.

## Context

### Why This Epic

Epic 13 created reusable library modules but used raw `pool.execute()` patterns for queries. Epic 14 migrates these to Kysely ORM for:

1. **Type safety** - Catch column/table name typos at compile time
2. **Query reuse** - Kysely's query builder enables composition
3. **Consistency** - Align with Epic 1's Kysely adoption strategy
4. **Maintainability** - Schema changes propagate via type system

### Prep Sprint Results

The prep sprint (Epic 13 retrospective action items) validated:

| Library | Functions | SQL Pattern | Kysely Feasibility |
|---------|-----------|------------|-------------------|
| `validation.ts` | 2 | Simple SELECTs | ✅ Direct mapping |
| `permissions.ts` | 1 | JOIN + bitmask | ✅ Uses `sql` template |
| `batch-operations.ts` | 6 | CRUD loops | ✅ Direct mapping |
| `audit-adapter.ts` | 0 | Adapter pattern | ❌ Excluded |

**Confidence Level:** 85% (HIGH)

### What's NOT in Epic 14

- `audit-adapter.ts` - Adapter pattern, not a query layer
- `lib/users.ts` - Complex role assignment patterns (future epic)
- `lib/sync/push/*` - Critical POS sync path (requires separate spike)

---

## Goals

1. Migrate 9 functions from raw SQL to Kysely ORM
2. Maintain zero breaking changes (same function signatures)
3. Preserve all existing tests and functionality
4. Improve type safety with compile-time checks
5. Document Kysely patterns for future migrations

---

## Stories

### Story 14.1: Migrate import/validation.ts to Kysely

**Functions:**
- `checkSkuExists` - SELECT with company_id + sku
- `batchCheckSkusExist` - SELECT with IN clause

**Estimated:** 1 hour  
**Complexity:** Low

**Acceptance Criteria:**
- [ ] Functions use Kysely query builder
- [ ] Same function signature (no breaking changes)
- [ ] Existing tests pass
- [ ] Type safety verified

---

### Story 14.2: Migrate auth/permissions.ts to Kysely

**Functions:**
- `canManageCompanyDefaults` - 3-way JOIN with bitmask permission check

**Estimated:** 1 hour  
**Complexity:** Medium (bitwise operations)

**Acceptance Criteria:**
- [ ] Bitmask check uses Kysely `sql` template
- [ ] JOIN logic preserved exactly
- [ ] Existing tests pass
- [ ] Type safety verified

---

### Story 14.3: Migrate import/batch-operations.ts - SELECT Operations

**Functions:**
- `batchFindItemsBySkus` - SELECT with IN clause
- `batchFindPricesByItemIds` - SELECT with IN clause

**Estimated:** 2 hours  
**Complexity:** Medium

**Acceptance Criteria:**
- [ ] Functions use Kysely query builder
- [ ] Same function signature (no breaking changes)
- [ ] Map return type maintained
- [ ] Existing tests pass

---

### Story 14.4: Migrate import/batch-operations.ts - WRITE Operations

**Functions:**
- `batchUpdateItems` - UPDATE loop
- `batchInsertItems` - INSERT loop
- `batchUpdatePrices` - UPDATE loop
- `batchInsertPrices` - INSERT loop

**Estimated:** 3 hours  
**Complexity:** Medium (transaction handling)

**Acceptance Criteria:**
- [ ] All functions use Kysely query builder
- [ ] Transaction handling preserved
- [ ] Batch operation behavior identical
- [ ] Existing tests pass
- [ ] Error handling preserved

---

### Story 14.5: Epic 14 Documentation

**Tasks:**
- Update ADR-0011 (Kysely Migration Guide) with new patterns
- Verify all tests pass
- Update TECHNICAL-DEBT.md if any issues found

**Estimated:** 1 hour

**Acceptance Criteria:**
- [ ] ADR-0011 updated with batch-operations patterns
- [ ] All tests pass
- [ ] Documentation reflects final implementation

---

## Technical Approach

### Pattern for Migration

```typescript
// BEFORE
const [rows] = await connection.execute<RowDataPacket[]>(
  `SELECT sku, id FROM items WHERE company_id = ? AND sku IN (${placeholders})`,
  [companyId, ...skus]
);

// AFTER
const rows = await kysely
  .selectFrom('items')
  .select(['sku', 'id'])
  .where('company_id', '=', companyId)
  .where('sku', 'in', skus)
  .execute();
```

### Connection Handling

```typescript
// Use newKyselyConnection for transaction support
const kysely = connection 
  ? newKyselyConnection(connection)
  : newKyselyConnection(await getDbPool().getConnection());
```

### Bitmask Pattern

```typescript
// For permissions.ts bitmask check
import { sql } from 'kysely';

const row = await db
  .selectFrom('user_role_assignments as ura')
  // ... joins
  .where(sql`(${sql`mr.permission_mask`} & ${sql`${permissionBit}`})`, "<>", 0)
  .executeTakeFirst();
```

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Epic 13 | ✅ Done | Provides migration targets |
| `@jurnapod/db` Kysely schema | ✅ Ready | Schema types available |
| `newKyselyConnection()` helper | ✅ Ready | Used in 11+ files |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Batch operation performance | Test vs loop approach; Kysely batch is PostgreSQL-optimized |
| Transaction context loss | Already using `newKyselyConnection()` pattern |
| Decimal handling | Schema uses `Decimal` type (string); existing code handles conversion |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Functions migrated | 9 | Code review |
| Breaking changes | 0 | Test suite |
| Type safety | 100% | TypeScript compilation |
| Test pass rate | 100% | CI pipeline |

---

## Out of Scope

- `audit-adapter.ts` migration (adapter pattern)
- `users.ts` migration (complex role logic)
- `sync/push/*` migration (critical POS path)
- Test file migration (tests can use raw SQL per AGENTS.md)

---

*Epic 14 ready for implementation.*
