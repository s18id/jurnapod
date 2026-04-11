# Story 39.3.5: Phase 1D — Data Migration — Convert Existing Module Roles

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** Critical

## Objective

Create and execute a data migration that maps old module codes to new module codes with resources, while maintaining backward compatibility during the transition period.

## Context

The database currently has `module_roles` entries with old module codes (`users`, `roles`, `companies`, `accounts`, `journals`, `settings`, `cash_bank`, etc.). After Story 39.3 adds the `resource` column to the `module_roles` table, we need to migrate this data to the new `module.resource` format.

This migration follows the **dual-write strategy**: insert NEW entries with new module codes + resources, while keeping OLD entries during the transition period. Story 39.11 (Verification & Cleanup) will remove the old entries.

### Old → New Mapping

| Old Module | New Module | Resource | Notes |
|-----------|------------|----------|-------|
| `users` | `platform` | `users` | User management |
| `roles` | `platform` | `roles` | Role management |
| `companies` | `platform` | `companies` | Company creation (SUPER_ADMIN only) |
| `outlets` | `platform` | `outlets` | Outlet management |
| `settings` | `platform` | `settings` | System settings |
| `accounts` | `accounting` | `accounts` | Chart of accounts |
| `journals` | `accounting` | `journals` | Journal entries |
| `cash_bank` | `treasury` | `transactions` | Cash/bank transactions |
| `inventory` | `inventory` | `NULL` | Item master (module-level during transition) |
| `sales` | `sales` | `NULL` | Sales operations (module-level during transition) |
| `pos` | `pos` | `NULL` | POS operations (module-level during transition) |
| `reports` | — | — | **Delete all entries** |

## Acceptance Criteria

- [ ] Migration file created: `packages/db/migrations/0147.5_acl_data_migration.sql`
- [ ] Migration maps all old module codes to new module codes with resources
- [ ] Existing permission masks are preserved exactly
- [ ] New entries created for: `platform.users`, `platform.roles`, `platform.companies`, `platform.outlets`, `platform.settings`, `accounting.accounts`, `accounting.journals`, `treasury.transactions`
- [ ] Old entries remain in database during transition (backward compatibility)
- [ ] `reports` module entries deleted from `module_roles` and `modules` tables
- [ ] Migration is idempotent (can be run multiple times safely)
- [ ] Migration handles `NULL` company_id cases (global roles)
- [ ] Rollback plan documented (restore from backup if needed)
- [ ] `npm run db:migrate -w @jurnapod/db` runs successfully
- [ ] Verify existing permissions still work after migration (test query)

## Technical Details

### Files to Create

- `packages/db/migrations/0147.5_acl_data_migration.sql`

### Dependencies

- Story 39.3 (Database Schema Migration must be complete first — `resource` column must exist)

### Blocks

- Stories 39.4–39.10 (Module implementation stories need data migrated first)

### Migration SQL

```sql
-- Migration: 0147.5_acl_data_migration.sql
-- Description: Migrate existing module_roles to new module.resource format
-- Idempotent: Uses INSERT ... ON DUPLICATE KEY UPDATE for safe re-runs
-- Strategy: Dual-write — new entries created, old entries preserved for backward compatibility

-- ============================================================================
-- STEP 1: Insert new platform module entries
-- ============================================================================

-- platform.users (from users)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'platform', 'users', permission_mask
FROM module_roles
WHERE module = 'users'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- platform.roles (from roles)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'platform', 'roles', permission_mask
FROM module_roles
WHERE module = 'roles'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- platform.companies (from companies)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'platform', 'companies', permission_mask
FROM module_roles
WHERE module = 'companies'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- platform.outlets (from outlets)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'platform', 'outlets', permission_mask
FROM module_roles
WHERE module = 'outlets'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- platform.settings (from settings)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'platform', 'settings', permission_mask
FROM module_roles
WHERE module = 'settings'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ============================================================================
-- STEP 2: Insert new accounting module entries
-- ============================================================================

-- accounting.accounts (from accounts)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'accounting', 'accounts', permission_mask
FROM module_roles
WHERE module = 'accounts'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- accounting.journals (from journals)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'accounting', 'journals', permission_mask
FROM module_roles
WHERE module = 'journals'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ============================================================================
-- STEP 3: Insert new treasury module entries
-- ============================================================================

-- treasury.transactions (from cash_bank)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'treasury', 'transactions', permission_mask
FROM module_roles
WHERE module = 'cash_bank'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ============================================================================
-- STEP 4: Handle module-level entries (keep as NULL resource for transition)
-- ============================================================================

-- inventory: Keep module-level (resource = NULL) — updated in Story 39.6
-- sales: Keep module-level (resource = NULL) — updated in Story 39.8
-- pos: Keep module-level (resource = NULL) — updated in Story 39.9

-- ============================================================================
-- STEP 5: Delete reports module entries (no longer needed)
-- ============================================================================

DELETE FROM module_roles WHERE module = 'reports';
DELETE FROM modules WHERE code = 'reports';
```

### Idempotency Design

The migration uses `INSERT ... ON DUPLICATE KEY UPDATE` pattern which ensures:
- First run: Creates all new `module.resource` entries
- Subsequent runs: Updates permission_mask if duplicate key exists (no new rows created)
- Old entries remain untouched (dual-write strategy)

### Handling NULL company_id

The migration preserves `company_id` values as-is. Global roles (where `company_id IS NULL`) will be migrated alongside tenant-specific roles.

### Rollback Plan

**Important:** This migration involves data transformation. Rollback requires Point-in-Time Recovery (PITR) from database backups.

1. Stop all application traffic
2. Restore from PITR backup taken before migration
3. Redeploy application with pre-migration code

**Compensating SQL** (partial recovery — restores new entries only):
```sql
-- Delete newly created entries (restore old entries if they exist)
DELETE FROM module_roles WHERE module = 'platform' AND resource IN ('users', 'roles', 'companies', 'outlets', 'settings');
DELETE FROM module_roles WHERE module = 'accounting' AND resource IN ('accounts', 'journals');
DELETE FROM module_roles WHERE module = 'treasury' AND resource = 'transactions';

-- Note: Old entries still exist due to dual-write strategy
```

## Testing Strategy

1. **Pre-migration state verification:**
   ```sql
   -- Count entries by old module
   SELECT module, COUNT(*) FROM module_roles GROUP BY module;
   ```

2. **Run migration:**
   ```bash
   npm run db:migrate -w @jurnapod/db
   ```

3. **Post-migration verification:**
   ```sql
   -- Verify new entries created
   SELECT module, resource, COUNT(*) FROM module_roles 
   WHERE resource IS NOT NULL 
   GROUP BY module, resource;

   -- Verify old entries still exist (backward compatibility)
   SELECT module, COUNT(*) FROM module_roles 
   WHERE module IN ('users', 'roles', 'companies', 'outlets', 'settings', 'accounts', 'journals', 'cash_bank')
   GROUP BY module;

   -- Verify reports entries deleted
   SELECT COUNT(*) FROM module_roles WHERE module = 'reports';
   ```

4. **Idempotency test:**
   ```bash
   # Run migration again
   npm run db:migrate -w @jurnapod/db
   # Verify no duplicate entries created
   ```

5. **Permission mask preservation test:**
   ```sql
   -- Compare permission masks before and after
   -- (requires backup of original data)
   ```

## Dev Notes

[To be filled during implementation]
