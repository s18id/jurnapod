# Story 39.3: Phase 1C — Database Schema Migration

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** done
**Priority:** High

## Objective

Create and execute database migration to add resource column to module_roles table, update unique constraints, and add necessary indexes for resource-level permission lookups.

## Context

The database schema must be extended to support resource-level permission scoping. The `resource` column will be nullable to maintain backward compatibility with existing module-level permissions.

## Acceptance Criteria

- [x] Migration file created: `packages/db/migrations/0147_acl_reorganization.sql`
- [x] Resource column added to module_roles table (VARCHAR(64), NULL after module)
- [x] Unique constraint updated: (company_id, role_id, module, resource)
- [x] Index added on resource column for lookup performance
- [x] Migration removes reports module data from modules table
- [x] Migration is idempotent (can be run multiple times safely)
- [x] Migration includes rollback plan documentation
- [x] npm run db:migrate -w @jurnapod/db runs successfully
- [x] npm run db:smoke -w @jurnapod/db passes

## Technical Details

### Files to Create

- `packages/db/migrations/0147_acl_reorganization.sql`

### Dependencies

- Story 39.2 (Auth Package Updates must be complete first)

### Implementation Notes

1. **Migration SQL operations:**
   ```sql
   -- Add resource column to module_roles table
   ALTER TABLE module_roles ADD COLUMN resource VARCHAR(64) NULL AFTER module;

   -- Update unique constraint to include resource
   ALTER TABLE module_roles DROP INDEX uq_module_role;
   ALTER TABLE module_roles ADD UNIQUE INDEX uq_module_role (company_id, role_id, module, resource);

   -- Add index on resource column for lookup performance
   ALTER TABLE module_roles ADD INDEX idx_resource (resource);
   ```

2. **Schema Design Decisions:**
   - `resource` column is nullable — NULL indicates module-level permission (backward compatible)
   - Unique key `(company_id, role_id, module, resource)` — ensures no duplicate module+resource per role
   - Index on `resource` enables fast lookup when checking permissions for specific resource

3. **Idempotency:** Use `information_schema` checks before ALTER TABLE operations

4. **Rollback Plan:** Document that this migration involves data deletion and rollback requires PITR recovery. Include compensating SQL for partial recovery.

## Testing Strategy

- Run migration against test database
- Verify schema changes applied correctly
- Verify unique constraint works with NULL resource values
- Verify index is created on resource column
- Verify reports module data is removed
- Smoke test database operations

## Dev Notes

### Implementation Summary (2026-04-12)

**Migration File Created:**
- `packages/db/migrations/0147_acl_reorganization.sql`

**Migration Steps:**
1. **Add resource column** - `ALTER TABLE module_roles ADD COLUMN resource VARCHAR(64) NULL AFTER module`
2. **Update unique constraint** - Drop old index, add new `uq_module_role (company_id, role_id, module, resource)`
3. **Add index on resource column** - `ADD INDEX idx_resource (resource)`
4. **Remove reports module** - `DELETE FROM modules WHERE code = 'reports'`

**Idempotency:** All operations use `information_schema` checks. Re-run shows "skip" - confirmed idempotent.

**Verification:**
- ✅ `npm run db:migrate -w @jurnapod/db` - applied successfully
- ✅ Re-run shows "skip" - idempotency confirmed
- ✅ `npm run db:smoke -w @jurnapod/db` - smoke checks passed

**Notes:**
- Unique key allows multiple NULL resources (backward compatible for module-level permissions)
- Rollback plan documented at top of migration file
- Migration compatible with MySQL 8.0+ and MariaDB
