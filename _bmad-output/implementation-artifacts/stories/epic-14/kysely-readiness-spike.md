# Kysely Readiness Spike - Epic 14 Prep

**Date:** 2026-03-28  
**Estimated Time:** 4 hours  
**Actual Time:** ~2 hours  
**Status:** COMPLETE

## Executive Summary

This spike audits the current SQL patterns in the codebase to assess Kysely ORM migration readiness for Epic 14. The codebase shows a **mixed pattern**: Epic 13 created library modules that are candidates for migration, while some newer code already uses Kysely directly.

**Key Finding:** The codebase is **partially Kysely-ready**. The `@jurnapod/db` package provides proper Kysely schema definitions and a `newKyselyConnection()` helper for transaction support. However, most library code still uses raw `pool.execute()` / `connection.execute()` patterns.

---

## 1. Complete Inventory of SQL Patterns

### 1.1 Epic 13 Created Modules (Primary Migration Targets)

#### `apps/api/src/lib/import/batch-operations.ts`

| Function | SQL Pattern | Lines | Difficulty |
|----------|-------------|-------|------------|
| `batchFindItemsBySkus` | `SELECT sku, id FROM items WHERE company_id = ? AND sku IN (...)` | 97-99 | **Easy** |
| `batchUpdateItems` | `UPDATE items SET ... WHERE id = ?` | 128-144 | **Easy** |
| `batchInsertItems` | `INSERT INTO items (...) VALUES (...)` | 168-184 | **Easy** |
| `batchFindPricesByItemIds` | `SELECT item_id, outlet_id, id FROM item_prices WHERE ...` | 216-218 | **Easy** |
| `batchUpdatePrices` | `UPDATE item_prices SET price = ? WHERE id = ?` | 248-250 | **Easy** |
| `batchInsertPrices` | `INSERT INTO item_prices (...) VALUES (...)` | 275-285 | **Easy** |

**Migration Notes:**
- All queries use parameterized placeholders (no SQL injection risk)
- Transaction-aware (receives `PoolConnection`)
- Simple CRUD patterns that map directly to Kysely query builder
- **No joins, subqueries, or complex aggregations**

#### `apps/api/src/lib/import/validation.ts`

| Function | SQL Pattern | Lines | Difficulty |
|----------|-------------|-------|------------|
| `checkSkuExists` | `SELECT id FROM items WHERE company_id = ? AND sku = ? LIMIT 1` | 54-56 | **Easy** |
| `checkItemExistsBySku` | Same as `checkSkuExists` | 82-92 | **Easy** |
| `batchCheckSkusExist` | `SELECT sku, id FROM items WHERE company_id = ? AND sku IN (...)` | 121-123 | **Easy** |

**Migration Notes:**
- Simple existence checks with company scoping
- Supports optional connection for transaction reuse
- **No complex logic**

#### `apps/api/src/lib/auth/permissions.ts`

| Function | SQL Pattern | Lines | Difficulty |
|----------|-------------|-------|------------|
| `canManageCompanyDefaults` | `SELECT 1 FROM user_role_assignments ura INNER JOIN roles r ON ... INNER JOIN module_roles mr ON ... WHERE ... AND (mr.permission_mask & ?) <> 0 LIMIT 1` | 35-47 | **Medium** |

**Migration Notes:**
- Uses bitmask permission check (`permission_mask & ?`)
- 3-table JOIN
- Kysely can handle this but requires `sql` template tag or expression builder for bitmask

#### `apps/api/src/lib/sync/audit-adapter.ts`

| Pattern | Assessment | Lines |
|---------|------------|-------|
| Adapter wrapper | **Not a migration target** - thin adapter for interface compliance | 28-55 |

**Note:** This file is an adapter, not a query layer. The SQL is encapsulated by `@jurnapod/modules-platform`.

---

### 1.2 Other Library Files with Raw SQL

#### `apps/api/src/lib/users.ts`

| Pattern Type | Count | Assessment |
|--------------|-------|------------|
| Raw `execute()` SELECT queries | ~15 | Medium |
| Raw `execute()` INSERT/UPDATE/DELETE | ~20 | Medium |
| Kysely queries (new) | 4 functions | Already migrated |
| Transaction patterns | Multiple | Complex |

**Functions Already Using Kysely:**
- `listRoles()` (lines 1142-1182)
- `getRole()` (lines 1184-1211)
- `createRole()` (lines 1236-1312)
- `updateRole()` (lines 1314-1383)
- `deleteRole()` (lines 1385-1452)

**Functions Still Using Raw SQL:**
- `findUserRowById`, `ensureUserExists`, `ensureRoleCodesExist`
- `getUserMaxRoleLevelForConnection`, `userHasSuperAdminRole`, `userHasRoleCode`
- `hydrateUserGlobalRoles`, `hydrateUserOutletRoleAssignments`
- `listUsers`, `createUserBasic`, `createUser`
- `updateUserEmail`, `setUserRoles`, `setUserOutlets`
- `setUserPassword`, `setUserActiveState`, `listModuleRoles`, `setModuleRolePermission`

**Migration Difficulty: MEDIUM-HIGH**
- Complex role assignment logic with SELECT → INSERT patterns
- Transaction boundaries across multiple operations
- Hydration patterns (multiple queries for denormalized output)

#### `apps/api/src/lib/outlets.ts`

| Pattern Type | Count | Assessment |
|--------------|-------|------------|
| Raw `execute()` queries | ~10 | Medium |
| Kysely queries | 0 | None yet |

**Functions Using Raw SQL:**
- `listOutletsByCompany`, `listAllOutlets`, `getOutlet`
- `createOutlet`, `updateOutlet`, `deleteOutlet`
- `createOutletBasic`, `listModuleRoles`, `setModuleRolePermission`

**Migration Difficulty: MEDIUM**
- Standard CRUD with audit logging
- Transaction patterns similar to users.ts
- Less complex than user role assignment

---

### 1.3 Sync Push Operations (Critical for POS)

#### `apps/api/src/lib/sync/push/transactions.ts`

| Pattern | Count | Assessment |
|---------|-------|------------|
| Raw `execute()` calls | 10+ | **Hard** |

**Migration Difficulty: HARD**
- Complex idempotency logic via `client_tx_id`
- Financial transaction integrity requirements
- Heavy transaction use with savepoints
- POS sync is on the critical path - requires careful migration

#### `apps/api/src/lib/sync/push/stock.ts`

| Pattern | Count | Assessment |
|---------|-------|------------|
| Raw `execute()` calls | 4 | **Medium-Hard** |

**Note:** Stock operations are simpler but still require transaction safety.

---

### 1.4 Import Framework

#### `apps/api/src/lib/import/validator.ts`

| Function | SQL Pattern | Lines | Difficulty |
|----------|-------------|-------|------------|
| `batchValidateForeignKeys` | Dynamic `SELECT id FROM ${table} WHERE company_id = ? AND id IN (...)` | 659-684 | **Medium** |

**Migration Difficulty: MEDIUM**
- Uses dynamic table names (requires `sql` template tag or Kysely's `DynamicQueryBuilder`)
- Batches large ID sets (>100) into multiple queries
- This is intentionally documented as an anti-N+1 solution

---

### 1.5 Test Files (NOT Migration Targets)

**Total matches:** ~500+ in `*.test.ts` files  
**Assessment:** Tests use raw SQL for setup/teardown - this is acceptable per AGENTS.md guidelines.

---

## 2. Kysely Integration Status

### 2.1 What's Already in Place

| Component | Path | Status |
|-----------|------|--------|
| Schema definitions | `packages/db/src/kysely/schema.ts` | ✅ Complete (90+ tables) |
| Kysely connection helper | `packages/db/src/connection-kysely.ts` | ✅ `newKyselyConnection()` |
| DB interface | `packages/db/src/index.ts` | ✅ Exports `DB` type |
| Mixed usage | `users.ts` | ✅ Some functions already migrated |

### 2.2 Schema Coverage

The Kysely schema in `packages/db/src/kysely/schema.ts` covers:
- All core tables (users, outlets, items, accounts, etc.)
- POS tables (pos_transactions, pos_order_snapshots, etc.)
- Financial tables (journal_batches, journal_lines, etc.)
- Sync tables (sync_audit_events, sync_operations, etc.)

**Note:** Some newer tables may not be in schema yet (feature flags, etc.).

---

## 3. Migration Difficulty Assessment

### Easy (Direct Mapping)

| Module | Function | Reason |
|--------|----------|--------|
| `batch-operations.ts` | All 6 functions | Simple CRUD, no joins |
| `validation.ts` | All 3 functions | Simple SELECT with WHERE/IN |
| `outlets.ts` | Simple reads | `SELECT ... WHERE company_id = ?` |

### Medium (Straightforward with Attention)

| Module | Function | Reason |
|--------|----------|--------|
| `permissions.ts` | `canManageCompanyDefaults` | 3-way JOIN + bitmask (requires `sql` tag) |
| `outlets.ts` | Writes with audit | Transaction + audit pattern |
| `users.ts` | Role reads | JOINs, but well-structured |
| `validator.ts` | `batchValidateForeignKeys` | Dynamic table names |

### Hard (Complex Business Logic)

| Module | Function | Reason |
|--------|----------|--------|
| `users.ts` | `createUser`, `setUserRoles` | SELECT → INSERT pattern, role validation |
| `users.ts` | `setUserOutlets` | Complex DELETE/INSERT with existence checks |
| `sync/push/transactions.ts` | All | Idempotency, financial integrity, savepoints |
| `sync/push/stock.ts` | All | Transactional stock updates |

---

## 4. Blockers and Concerns

### 4.1 Technical Blockers

| Blocker | Severity | Description |
|---------|----------|-------------|
| Dynamic table names in `batchValidateForeignKeys` | Medium | Requires `sql` template tag - not a hard blocker |
| Bitmask permission checks | Low | Kysely can handle via `sql` template |
| Transaction pattern with `newKyselyConnection` | Low | Already supported via helper |

### 4.2 Complexity Concerns

| Concern | Risk | Mitigation |
|---------|------|------------|
| SELECT → INSERT patterns (users.ts) | Medium | Keep as-is or refactor to batch inserts |
| POS sync idempotency | High | Do NOT migrate sync/push in Epic 14 |
| Audit logging integration | Medium | AuditService already has Kysely adapter |

### 4.3 Recommended Scope Boundaries

**DO NOT attempt to migrate in Epic 14:**
- `lib/sync/push/transactions.ts` - Critical POS sync path
- `lib/sync/push/stock.ts` - Stock integrity
- Any test files

**Safe to migrate in Epic 14:**
- Epic 13 modules (batch-operations, validation, permissions)
- Simple CRUD modules (outlets basic ops)

---

## 5. Recommended Epic 14 Migration Approach

### Phase 1: Epic 13 Modules (Easy Wins)

**Target:** `apps/api/src/lib/import/`

1. **`batch-operations.ts`** (6 functions)
   - Direct 1:1 mapping to Kysely query builder
   - Test with existing import tests
   - **Estimated: 2-3 hours**

2. **`validation.ts`** (3 functions)
   - Simple existence checks
   - No transaction complexity
   - **Estimated: 1-2 hours**

### Phase 2: Permissions Module

**Target:** `apps/api/src/lib/auth/permissions.ts`

3. **`canManageCompanyDefaults`**
   - Use Kysely's `sql` template tag for bitmask
   - **Estimated: 1-2 hours**

### Phase 3: Audit Adapter (Optional)

**Target:** `apps/api/src/lib/sync/audit-adapter.ts`

4. **Assessment:** This is an adapter, not a query layer. Consider whether migration adds value.

### Phase 4: Simple Outlets CRUD (If Time Permits)

**Target:** `apps/api/src/lib/outlets.ts`

5. **Read operations:** `listOutletsByCompany`, `getOutlet`
6. **Skip write operations** due to audit integration complexity

### NOT in Epic 14 Scope

- `lib/users.ts` - Complex role assignment logic
- `lib/sync/push/*` - Critical POS path, requires separate spike
- `lib/import/validator.ts` - Dynamic SQL pattern requires design decision

---

## 6. Specific Technical Recommendations

### 6.1 For `batch-operations.ts`

```typescript
// BEFORE
const [rows] = await connection.execute<RowDataPacket[]>(
  `SELECT sku, id FROM items WHERE company_id = ? AND sku IN (${placeholders})`,
  [companyId, ...skus]
);

// AFTER (Kysely)
const rows = await kysely
  .selectFrom('items')
  .select(['sku', 'id'])
  .where('company_id', '=', companyId)
  .where('sku', 'in', skus)
  .execute();
```

### 6.2 For Bitmask in `permissions.ts`

```typescript
// Use Kysely's sql template
import { sql } from 'kysely';

const rows = await kysely
  .selectFrom('user_role_assignments as ura')
  .innerJoin('roles as r', 'r.id', 'ura.role_id')
  .innerJoin('module_roles as mr', 'mr.role_id', 'r.id')
  .where('ura.user_id', '=', userId)
  .where(sql`mr.permission_mask & ${permissionBit}`, '<>', 0)
  .limit(1)
  .execute();
```

### 6.3 For Dynamic Table Names in `validator.ts`

```typescript
// Use DynamicQueryBuilder
const query = kysely
  .selectFrom(sql.table(tableName))
  .select('id')
  .where('company_id', '=', companyId)
  .where('id', 'in', [...ids]);
```

---

## 7. Files Created/Modified Summary

This spike did not modify any production code. All findings are documented in this file.

### Key Files Reviewed:
- `apps/api/src/lib/import/batch-operations.ts` - Epic 13
- `apps/api/src/lib/import/validation.ts` - Epic 13
- `apps/api/src/lib/auth/permissions.ts` - Epic 13
- `apps/api/src/lib/sync/audit-adapter.ts` - Epic 13
- `apps/api/src/lib/users.ts` - Mixed patterns
- `apps/api/src/lib/outlets.ts` - Mixed patterns
- `apps/api/src/lib/import/validator.ts` - Dynamic SQL
- `apps/api/src/lib/sync/push/transactions.ts` - Complex
- `apps/api/src/lib/sync/push/stock.ts` - Medium complex
- `packages/db/src/kysely/schema.ts` - Schema definitions
- `packages/db/src/connection-kysely.ts` - Kysely helper

---

## 8. Appendix: SQL Pattern Summary Table

| File | Functions | Raw SQL Count | Kysely Count | Difficulty |
|------|-----------|---------------|--------------|------------|
| `batch-operations.ts` | 6 | 6 | 0 | Easy |
| `validation.ts` | 3 | 3 | 0 | Easy |
| `permissions.ts` | 1 | 1 | 0 | Medium |
| `audit-adapter.ts` | 1 | 0 (adapter) | 0 | N/A |
| `users.ts` | 20+ | 16+ | 5 | Medium-High |
| `outlets.ts` | 8 | 8 | 0 | Medium |
| `validator.ts` | 1 | 1 | 0 | Medium |
| `sync/push/transactions.ts` | 10+ | 10+ | 0 | Hard |
| `sync/push/stock.ts` | 4 | 4 | 0 | Medium-Hard |

---

**Spike Complete** ✅
