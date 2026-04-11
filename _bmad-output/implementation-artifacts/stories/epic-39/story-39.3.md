# Story 39.3: Phase 1C — Database Schema Migration

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** High

## Objective

Create and execute database migration to add resource column to module_roles table, update unique constraints, and add necessary indexes for resource-level permission lookups.

## Context

The database schema must be extended to support resource-level permission scoping. The `resource` column will be nullable to maintain backward compatibility with existing module-level permissions.

## Acceptance Criteria

- [ ] Migration file created: `packages/db/migrations/0147_acl_reorganization.sql`
- [ ] Resource column added to module_roles table (VARCHAR(64), NULL after module)
- [ ] Unique constraint updated: (company_id, role_id, module, resource)
- [ ] Index added on resource column for lookup performance
- [ ] Migration removes reports module data from modules table
- [ ] Migration is idempotent (can be run multiple times safely)
- [ ] Migration includes rollback plan documentation
- [ ] npm run db:migrate -w @jurnapod/db runs successfully
- [ ] npm run db:smoke -w @jurnapod/db passes

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

[To be filled during implementation]
