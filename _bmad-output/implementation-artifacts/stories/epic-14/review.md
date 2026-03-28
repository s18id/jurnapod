# Epic 14 Implementation Review

**Review Date:** 2026-03-28  
**Reviewer:** BMAD Code Review Agent  
**Scope:** Epic 14 - Kysely ORM Migration

---

## Files Reviewed

| File | Story | Lines | Status |
|------|-------|-------|--------|
| `apps/api/src/lib/import/validation.ts` | 14.1 | 141 | ✅ Migrated |
| `apps/api/src/lib/auth/permissions.ts` | 14.2 | 49 | ✅ Migrated |
| `apps/api/src/lib/import/batch-operations.ts` | 14.3, 14.4 | 305 | ✅ Migrated |
| `apps/api/src/lib/import/validation.test.ts` | - | 52 | ✅ Tests Pass |
| `apps/api/src/lib/import/batch-operations.test.ts` | - | 65 | ✅ Tests Pass |

---

## Validation Commands Run

```bash
✅ npm run typecheck -w @jurnapod/api    # Passed
✅ npm run build -w @jurnapod/api         # Passed  
✅ npm run lint -w @jurnapod/api          # No new errors in reviewed files
✅ Unit tests (validation + batch-ops)    # 7/7 passed
```

---

## Issues Found

### 🔴 P1 - Connection Resource Leak (validation.ts, permissions.ts)

**Location:** 
- `validation.ts:53-55` (checkSkuExists)
- `validation.ts:118-120` (batchCheckSkusExist)
- `permissions.ts:30-32` (canManageCompanyDefaults)

**Issue:** When `connection` parameter is not provided, the functions acquire a new connection from the pool via `getDbPool().getConnection()` but never release it.

**Code:**
```typescript
const db = newKyselyConnection(
  connection ?? (await getDbPool().getConnection())  // Acquired but never released!
);
```

**Impact:** Connection pool exhaustion under load when these functions are called without an explicit connection parameter.

**Rationale:** Unlike the batch-operations functions which require `connection` as a mandatory parameter, validation and permissions functions accept optional connections. The current pattern creates a Kysely wrapper but the underlying mysql2 connection remains acquired.

**Recommended Fix:**
```typescript
export async function checkSkuExists(
  companyId: number,
  sku: string,
  connection?: PoolConnection
): Promise<SkuCheckResult> {
  const shouldRelease = !connection;
  const conn = connection ?? (await getDbPool().getConnection());
  try {
    const db = newKyselyConnection(conn);
    const row = await db
      .selectFrom("items")
      .select(["id"])
      .where("company_id", "=", companyId)
      .where("sku", "=", sku)
      .executeTakeFirst();
    return row ? { exists: true, itemId: row.id } : { exists: false };
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}
```

---

### 🟡 P2 - Missing Unit Tests for permissions.ts

**Location:** `apps/api/src/lib/auth/permissions.ts`

**Issue:** No dedicated unit tests exist for `canManageCompanyDefaults` function. The function is tested indirectly via `routes/permissions.test.ts` but that tests the general permission system, not this specific library function.

**Impact:** Reduced confidence in refactoring; no isolated test for the Kysely migration verification.

**Rationale:** While routes/permissions.test.ts tests MODULE_PERMISSION_BITS and the general permission system, the `canManageCompanyDefaults` function in lib/auth/permissions.ts has specific logic (global role check, outlet_id IS NULL, 3-way JOIN) that should be tested in isolation.

**Recommended Action:** Create `apps/api/src/lib/auth/permissions.test.ts` with tests covering:
- User with global role and permission returns true
- User without global role returns false  
- User with outlet-specific role (outlet_id IS NOT NULL) returns false
- User with wrong permission bit returns false

---

### 🟡 P2 - Type Conversion Defensiveness vs Schema Trust

**Location:** `batch-operations.ts:106`

**Code:**
```typescript
for (const row of rows) {
  result.set(String(row.sku), Number(row.id));  // Defensive but unnecessary
}
```

**Issue:** The `String()` and `Number()` conversions suggest uncertainty about Kysely's typing. The schema should guarantee types.

**Impact:** Minor code clarity issue; suggests lack of confidence in type system.

**Rationale:** The Kysely schema types `row.id` as `number` and `row.sku` as `string | null`. The conversion is defensive but the null check is already done at line 105-107. Either trust the schema or add a comment explaining why conversion is needed.

---

### 🟢 P3 - Unused Type Imports in Test File

**Location:** `batch-operations.test.ts:14-17`

**Code:**
```typescript
import {
  type BatchItemInsert,
  type BatchItemUpdate,
  type BatchPriceInsert,
  type BatchPriceUpdate,
} from "./batch-operations.js";
```

**Issue:** These types are imported but never used in the test file.

**Impact:** Lint noise (already flagged by eslint).

---

## Correctness Verification

### Kysely Query Builder Usage

| Function | Query Pattern | Correct | Notes |
|----------|---------------|---------|-------|
| `checkSkuExists` | `.selectFrom().where().executeTakeFirst()` | ✅ | Proper LIMIT 1 equivalent |
| `checkItemExistsBySku` | Delegates to checkSkuExists | ✅ | Correct delegation |
| `batchCheckSkusExist` | `.selectFrom().where('in').execute()` | ✅ | Proper IN clause handling |
| `canManageCompanyDefaults` | 3-way JOIN + sql template | ✅ | Bitmask: `sql\`(\${sql\`mr.permission_mask\`} & \${sql\`\${permissionBit}\`})\` |
| `batchFindItemsBySkus` | `.selectFrom().where('in').execute()` | ✅ | Empty array guard present |
| `batchFindPricesByItemIds` | `.selectFrom().where('in').execute()` | ✅ | Empty array guard present |
| `batchUpdateItems` | `.updateTable().set().where().executeTakeFirst()` | ✅ | Loop with individual updates |
| `batchInsertItems` | `.insertInto().values().executeTakeFirst()` | ✅ | Returns insertId array |
| `batchUpdatePrices` | `.updateTable().set().where().executeTakeFirst()` | ✅ | Loop with individual updates |
| `batchInsertPrices` | `.insertInto().values().executeTakeFirst()` | ✅ | Returns insertId array |

### JOIN Logic Preservation (permissions.ts)

**Original (raw SQL):**
```sql
FROM user_role_assignments ura
INNER JOIN roles r ON r.id = ura.role_id
INNER JOIN module_roles mr ON mr.role_id = r.id
```

**Migrated (Kysely):**
```typescript
.selectFrom("user_role_assignments as ura")
.innerJoin("roles as r", "r.id", "ura.role_id")
.innerJoin("module_roles as mr", "mr.role_id", "r.id")
```

✅ **VERIFIED:** JOIN order and conditions preserved exactly.

### Bitmask Operation (permissions.ts)

**Original (raw SQL):**
```sql
(mr.permission_mask & ?) <> 0
```

**Migrated (Kysely):**
```typescript
.where(sql`(${sql`mr.permission_mask`} & ${sql`${permissionBit}`})`, "<>", 0)
```

✅ **VERIFIED:** Uses `sql` template tag correctly for raw expression.

---

## Edge Cases Handled

| Edge Case | validation.ts | permissions.ts | batch-operations.ts |
|-----------|---------------|----------------|---------------------|
| Empty array input | ✅ batchCheckSkusExist returns empty Map | N/A | ✅ All functions handle empty arrays |
| Null/undefined SKU | ✅ null check before Map.set | N/A | N/A |
| Non-existent records | ✅ returns {exists: false} | ✅ returns false | ✅ returns empty Map |
| Connection parameter | ⚠️ leak risk | ⚠️ leak risk | ✅ required parameter |

---

## Type Safety Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| No `any` types introduced | ✅ | All functions properly typed |
| Schema types used | ✅ | Uses Kysely-generated DB types |
| Return types preserved | ✅ | All return types match original |
| Null handling | ✅ | Proper null checks present |

---

## Breaking Changes Assessment

| Function | Signature Changed | API Changed | Breaking? |
|----------|-------------------|-------------|-----------|
| `checkSkuExists` | No | No | ✅ No |
| `checkItemExistsBySku` | No | No | ✅ No |
| `batchCheckSkusExist` | No | No | ✅ No |
| `canManageCompanyDefaults` | No | No | ✅ No |
| `batchFindItemsBySkus` | No | No | ✅ No |
| `batchFindPricesByItemIds` | No | No | ✅ No |
| `batchUpdateItems` | No | No | ✅ No |
| `batchInsertItems` | No | No | ✅ No |
| `batchUpdatePrices` | No | No | ✅ No |
| `batchInsertPrices` | No | No | ✅ No |

✅ **VERIFIED:** Zero breaking changes.

---

## Test Coverage Summary

| Test File | Tests | Pass | Coverage |
|-----------|-------|------|----------|
| `validation.test.ts` | 4 | 4 ✅ | Basic existence checks |
| `batch-operations.test.ts` | 3 | 3 ✅ | Empty array + non-existent |
| `permissions.test.ts` | **MISSING** | - | No unit tests for canManageCompanyDefaults |

**Note:** `routes/permissions.test.ts` exists and tests the broader permission system, but there's no `lib/auth/permissions.test.ts` for the specific library function.

---

## Recommendations

### Immediate Actions (Before Approval)

1. **🔴 Fix connection leak in validation.ts and permissions.ts**
   - Add try/finally pattern to release connections acquired within the function
   - This is a P1 issue that could cause production incidents

2. **🟡 Create permissions.test.ts**
   - Add dedicated unit tests for `canManageCompanyDefaults`
   - Test global role requirement, outlet_id=NULL filter, permission bitmask logic

### Follow-up Actions (Post-Approval)

3. **🟢 Clean up unused imports in batch-operations.test.ts**
   - Remove unused type imports (BatchItemInsert, etc.)

---

## Final Assessment

| Criterion | Score | Notes |
|-----------|-------|-------|
| Kysely Migration Correctness | 9/10 | All queries correctly migrated |
| Type Safety | 10/10 | No `any` types, proper schema usage |
| Transaction Handling | 7/10 | Connection leak in optional param functions |
| Edge Case Handling | 8/10 | Empty arrays handled, connection leak is gap |
| Test Coverage | 6/10 | Missing permissions.ts unit tests |
| Breaking Changes | 10/10 | Zero breaking changes |

### Overall Recommendation: **REQUEST CHANGES**

The Epic 14 implementation successfully migrates all 9 functions to Kysely ORM with correct query patterns and type safety. However, **the connection resource leak in validation.ts and permissions.ts is a P1 issue that must be fixed before approval.** These functions acquire database connections when called without an explicit connection parameter but never release them, which will cause connection pool exhaustion under load.

Once the connection leak is fixed and basic unit tests are added for permissions.ts, this implementation can be approved.

---

## Acceptance Criteria Verification

### Story 14.1 (validation.ts)
- [x] Functions use Kysely query builder
- [x] Same function signatures
- [ ] Connection parameter handled safely **⚠️ LEAK RISK**
- [x] All existing tests pass
- [x] TypeScript compilation succeeds

### Story 14.2 (permissions.ts)
- [x] Bitmask check uses sql template correctly
- [x] 3-way JOIN logic preserved
- [x] Same function signature
- [ ] Connection parameter handled safely **⚠️ LEAK RISK**
- [x] TypeScript compilation succeeds
- [ ] Unit tests exist **❌ MISSING**

### Story 14.3 (batch-operations.ts SELECT)
- [x] Functions use Kysely query builder
- [x] Map return type preserved
- [x] Same function signatures
- [x] Empty array edge case handled
- [x] All existing tests pass

### Story 14.4 (batch-operations.ts WRITE)
- [x] All functions use Kysely builders
- [x] Transaction handling preserved
- [x] Batch operation behavior identical
- [x] Empty array edge cases handled
- [x] All existing tests pass

---

*Review completed: 2026-03-28*
