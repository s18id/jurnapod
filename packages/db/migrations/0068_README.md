# Migration 0068: Add POS Module Permissions

## Purpose

This migration adds the `pos` module permissions to `module_roles` table for all existing companies and roles. This is required for the new Outlet Tables and Reservations features in the backoffice.

## Background

The Outlet Tables and Reservations API endpoints require:
- `module: "pos"`
- `permission: "read"/"create"/"update"/"delete"`

However, existing companies don't have these permissions in their `module_roles` table, which means even OWNER users cannot access these features.

## What This Migration Does

This migration performs three steps:

1. **Creates the POS module** in the `modules` table (if it doesn't exist)
2. **Enables the POS module** for all companies in `company_modules` table
3. **Adds POS module permissions** for each role in `module_roles` table

### POS Module Permissions

Adds the following POS module permissions for each company:

| Role | Permission Mask | Permissions |
|------|-----------------|-------------|
| SUPER_ADMIN | 15 | Create, Read, Update, Delete (Full) |
| OWNER | 15 | Create, Read, Update, Delete (Full) |
| COMPANY_ADMIN | 15 | Create, Read, Update, Delete (Full) |
| ADMIN | 15 | Create, Read, Update, Delete (Full) |
| CASHIER | 3 | Create, Read (no Update/Delete) |
| ACCOUNTANT | 2 | Read only |

## Running the Migration

### Automatic (via migration runner)

If using a migration runner:

```bash
npm run migrate:run
# or
yarn migrate:run
```

### Manual (MySQL/MariaDB)

```bash
mysql -u your_user -p your_database < packages/db/migrations/0068_add_pos_module_permissions.sql
```

## Verification

After running the migration, verify it worked correctly:

```bash
mysql -u your_user -p your_database < packages/db/scripts/verify-pos-module-permissions.sql
```

### Expected Output

1. **POS Module Exists**: Should show "PASS" - confirms POS module is in modules table

2. **Total Companies**: Should show the count of companies in your database

3. **Companies with POS Module Enabled**: Should match the total companies count

4. **Missing POS Module**: Should be EMPTY (no rows returned)
   - If any rows appear, those companies don't have POS enabled

5. **POS module_roles per role**: Should show each role with:
   - Number of companies that have the permission
   - The permission mask value
   - Description of permissions

6. **Missing permissions**: Should be EMPTY (no rows returned)
   - If any rows appear, those companies are missing POS permissions

7. **Detailed view**: Shows all companies with their POS permissions broken down by create/read/update/delete flags

### Example Good Output

**Check 1: POS Module Exists**
```
check_name          | status | count
--------------------|--------|-------
POS Module Exists   | PASS   | 1
```

**Check 2-3: Company Counts**
```
metric                            | count
----------------------------------|-------
Total Companies                   | 5
Companies with POS Module Enabled | 5
```

**Check 4: Missing POS Module** (should be empty)
```
(No rows - this is good!)
```

**Check 5: POS module_roles per role**
```
role_code      | companies_with_permission | permission_mask | permission_description
---------------|---------------------------|-----------------|---------------------------
SUPER_ADMIN    | 5                        | 15              | Full (Create, Read, Update, Delete)
OWNER          | 5                        | 15              | Full (Create, Read, Update, Delete)
COMPANY_ADMIN  | 5                        | 15              | Full (Create, Read, Update, Delete)
ADMIN          | 5                        | 15              | Full (Create, Read, Update, Delete)
CASHIER        | 5                        | 3               | Create + Read
ACCOUNTANT     | 5                        | 2               | Read Only
```

## Rollback

If you need to rollback this migration:

```sql
-- Step 1: Remove POS module permissions from module_roles
DELETE FROM module_roles 
WHERE module = 'pos'
  AND created_at >= 'YYYY-MM-DD HH:MM:SS'; -- Use the timestamp when migration was run

-- Step 2: Disable POS module for all companies (optional)
UPDATE company_modules cm
INNER JOIN modules m ON m.id = cm.module_id
SET cm.enabled = 0
WHERE m.code = 'pos';

-- Step 3: Remove POS module from modules table (only if you're sure)
-- DELETE FROM modules WHERE code = 'pos';
```

Or to fully remove all POS-related data:

```sql
-- Remove all module permissions
DELETE FROM module_roles WHERE module = 'pos';

-- Remove from company_modules (this will cascade to module_roles)
DELETE cm FROM company_modules cm
INNER JOIN modules m ON m.id = cm.module_id
WHERE m.code = 'pos';

-- Remove the module itself
DELETE FROM modules WHERE code = 'pos';
```

**⚠️ Warning**: Only rollback if you haven't:
- Manually adjusted any POS permissions through the backoffice UI
- Created any outlet tables or reservations
- Started using POS features in production

## Safety Features

- Uses `INSERT IGNORE` to prevent duplicate entries
- Includes `NOT EXISTS` checks to ensure idempotency
- Safe to re-run multiple times
- Won't affect existing POS permissions if they already exist

## Impact

- **Existing companies**: Will gain access to Outlet Tables and Reservations features
- **New companies**: Already have these permissions (added via `companies.ts` defaults)
- **Performance**: Minimal - one INSERT per role per company (typically 6 inserts per company)
- **Downtime**: None required
