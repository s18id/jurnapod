# Development Session Changelog

**Date:** 2026-03-16  
**Session Focus:** Database schema fixes, company currency support, and test stability improvements

---

## 0. COGS Journal Date Semantics Fix (2026-03-17)

### Changes Made

#### Business Date for COGS Journal Lines
**Files:**
- `apps/api/src/lib/cogs-posting.ts`
- `apps/api/src/lib/sales.ts`
- `apps/api/src/lib/cogs-posting.test.ts`
- `apps/api/tests/integration/cogs-posting.integration.test.mjs`

- `journal_lines.line_date` for COGS now uses sale/invoice business date, not runtime UTC date.
- `postInvoice()` now passes `invoice_date` explicitly into COGS posting.
- Added unit/integration assertions for `line_date` correctness.

### Why
- Prevent accounting period drift from timezone/runtime clock differences.
- Keep journal date semantics aligned with DATE-only business documents.

---

## 1. Company Currency Code Support

### Changes Made

#### Database Migration
**File:** `packages/db/migrations/0117_add_company_currency_code.sql`

Added `currency_code` column to `companies` table for multi-currency support:
- Column: `currency_code VARCHAR(3) NULL DEFAULT 'IDR'`
- Index: `idx_companies_currency_code` for efficient lookups
- Default: 'IDR' for backward compatibility

#### Shared Schema Updates
**File:** `packages/shared/src/schemas/companies.ts`

Updated all company schemas:
- `CompanyResponseSchema`: Added `timezone` and `currency_code` fields
- `CompanyCreateRequestSchema`: Added optional `timezone` and `currency_code`
- `CompanyUpdateRequestSchema`: Added optional `timezone` and `currency_code`

#### API Library Updates
**File:** `apps/api/src/lib/companies.ts`

- Added `currency_code` to `CompanyResponse` and `CompanyRow` types
- Updated `normalizeCompanyRow()` to include `currency_code`
- Updated all SQL SELECT statements to include `currency_code`
- Modified `createCompany()` to accept and store `timezone` and `currency_code`
- Modified `updateCompany()` to handle `timezone` and `currency_code` updates
- Added audit logging for currency and timezone changes
- Defaults: `timezone='UTC'`, `currency_code='IDR'`

### Commits
- `d61d2ed` - feat: add currency_code to company details for forex calculations

---

## 2. Products Table → Items Table Fix

### Problem
Multiple test files and service code were referencing a non-existent `products` table. The actual table name is `items` (from migration `0003_master_data_items_prices_sync_pull.sql`).

### Files Modified

#### `apps/api/src/routes/stock.test.ts`
- Line 39: `INSERT INTO products` → `INSERT INTO items`
  - Added required `item_type` column (set to 'PRODUCT')
  - Changed `status` → `is_active`
- Line 64: `DELETE FROM products` → `DELETE FROM items`
- Line 127: `FROM products p` → `FROM items i` (updated JOIN query)

#### `apps/api/src/services/stock.test.ts`
- Lines 55, 62: `INSERT INTO products` → `INSERT INTO items`
  - Added `item_type='PRODUCT'` and `is_active=1`
- Line 95: `DELETE FROM products` → `DELETE FROM items`

#### `apps/api/src/services/stock.ts`
- Line 832: `FROM products p` → `FROM items i` (getLowStockAlerts function)

#### `apps/api/app/api/sync/stock/route.test.ts`
- Line 38: `INSERT INTO products` → `INSERT INTO items`
  - Added `item_type='PRODUCT'` and `is_active=1`
- Line 64: `DELETE FROM products` → `DELETE FROM items`

#### `apps/api/app/api/sync/stock/route.ts`
- Line 108: `JOIN products p` → `JOIN items i`

### Key Differences

| Aspect | products (wrong) | items (correct) |
|--------|-----------------|----------------|
| Table name | products | items |
| Status column | status | is_active |
| Type column | N/A | item_type (required) |
| Stock tracking | track_stock | track_stock (from migration 0111) |

### Related Migration
**File:** `packages/db/migrations/0111_add_stock_fields_to_products.sql`

This migration adds stock tracking columns to the `items` table:
- `track_stock TINYINT(1) NOT NULL DEFAULT 0`
- `low_stock_threshold DECIMAL(15,4) DEFAULT NULL`

---

## 3. Test Fixture Fixes

### Outlet Column Name Fix
**File:** `apps/api/tests/integration/fixtures.ts`

#### Problem
Test fixture was using incorrect column name `address` which doesn't exist in the `outlets` table.

#### Changes
- Line 62: Changed `address` → `address_line1`
- Added `address_line2` column for completeness

**Before:**
```sql
INSERT INTO outlets (company_id, name, code, address, phone, email, is_active, created_at, updated_at)
VALUES (?, ?, ?, '', '', '', 1, NOW(), NOW())
```

**After:**
```sql
INSERT INTO outlets (company_id, name, code, address_line1, address_line2, phone, email, is_active, created_at, updated_at)
VALUES (?, ?, ?, '', '', '', '', 1, NOW(), NOW())
```

### User Role Assignments Fix
**File:** `apps/api/tests/integration/fixtures.ts`

#### Problem
Test fixture was inserting into `user_role_assignments` with a non-existent `company_id` column.

#### Changes
- Line 84-86: Removed `company_id` from INSERT
- Changed to use `outlet_id = NULL` for global roles (OWNER)

**Before:**
```sql
INSERT INTO user_role_assignments (user_id, role_id, company_id, created_at)
SELECT ?, id, ?, NOW() FROM roles WHERE name = 'OWNER'
```

**After:**
```sql
INSERT INTO user_role_assignments (user_id, role_id, outlet_id, created_at)
SELECT ?, id, NULL, NOW() FROM roles WHERE name = 'OWNER'
```

#### Table Schema Reference
**File:** `packages/db/migrations/0062_merge_user_roles.sql`

The `user_role_assignments` table schema:
```sql
CREATE TABLE user_role_assignments (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NULL,  -- NULL = global role
  created_at DATETIME
)
```

### Commits
- `f901d90` - fix(test): correct outlets column names in test fixture

---

## 4. Database Pool Leak Fix

### Problem
**File:** `apps/api/src/lib/sales.idempotency.test.ts`

Tests were hanging indefinitely because:
1. Each test called `createDbPool()` which creates a **new pool**
2. Two tests = two separate pools
3. Cleanup hook `closeDbPool()` only closes the **global singleton pool**
4. Test-specific pools remain open → test hangs

### Solution
Changed from `createDbPool()` to `getDbPool()` which returns a singleton:

#### Import Changes
**Before:**
```typescript
import {
  createDbPool,
  loadEnvIfPresent,
  readEnv
} from "../../tests/integration/integration-harness.mjs";
import { closeDbPool } from "./db";
```

**After:**
```typescript
import {
  loadEnvIfPresent,
  readEnv
} from "../../tests/integration/integration-harness.mjs";
import { getDbPool, closeDbPool } from "./db";
```

#### Pool Usage Changes
**Before:**
```typescript
const pool = createDbPool();
```

**After:**
```typescript
const pool = getDbPool();
```

### Pool Management Reference

**File:** `apps/api/src/lib/db.ts`

```typescript
// Singleton pattern - returns same pool instance
export function getDbPool(): Pool {
  if (globalForDb.__jurnapodApiDbPool) {
    return globalForDb.__jurnapodApiDbPool;
  }
  // ... create and store pool globally
}

// Closes the singleton pool
export async function closeDbPool(): Promise<void> {
  if (globalForDb.__jurnapodApiDbPool) {
    await globalForDb.__jurnapodApiDbPool.end();
    globalForDb.__jurnapodApiDbPool = undefined;
  }
}
```

**File:** `apps/api/tests/integration/integration-harness.mjs`

```typescript
// Creates a NEW pool each time - causes leaks if not manually closed
export function createDbPool(options = {}) {
  return mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: options.connectionLimit ?? 10
  });
}
```

---

## Summary of Files Changed

### Database
- `packages/db/migrations/0117_add_company_currency_code.sql` (new)

### Shared Schema
- `packages/shared/src/schemas/companies.ts`

### API Library
- `apps/api/src/lib/companies.ts`
- `apps/api/src/lib/sales.idempotency.test.ts`

### Services
- `apps/api/src/services/stock.ts`
- `apps/api/src/services/stock.test.ts`

### Routes
- `apps/api/src/routes/stock.test.ts`
- `apps/api/app/api/sync/stock/route.ts`
- `apps/api/app/api/sync/stock/route.test.ts`

### Test Fixtures
- `apps/api/tests/integration/fixtures.ts`

---

## Testing Recommendations

1. **Always use `getDbPool()`** from `./db` for unit tests
2. **Always include cleanup hook:**
   ```typescript
   test.after(async () => {
     await closeDbPool();
   });
   ```
3. **Verify table names** against migrations before writing tests
4. **Check column names** in `information_schema.COLUMNS` if unsure
5. **Use test fixtures** from `tests/integration/fixtures.ts` for consistent test data

---

## Related Migrations Reference

| Migration | Purpose |
|-----------|---------|
| `0003_master_data_items_prices_sync_pull.sql` | Creates `items` table |
| `0062_merge_user_roles.sql` | Creates `user_role_assignments` table |
| `0099_outlets_profile_fields.sql` | Adds profile fields to `outlets` |
| `0111_add_stock_fields_to_products.sql` | Adds stock columns to `items` |
| `0115_add_company_timezone.sql` | Adds `timezone` to `companies` |
| `0117_add_company_currency_code.sql` | Adds `currency_code` to `companies` |
