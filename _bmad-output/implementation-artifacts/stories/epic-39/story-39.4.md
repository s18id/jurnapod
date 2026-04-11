# Story 39.4: Phase 2A — platform Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** High

## Objective

Update platform module routes to use resource-level permission checks (`platform.users`, `platform.roles`, `platform.companies`, `platform.outlets`, `platform.settings`) and update the permission matrix accordingly.

## Context

Following the database schema migration (Story 39.3), platform is the first module to be updated to the new resource-level permission model. All platform routes need to be audited and updated to use the new `module.resource` permission format.

## Acceptance Criteria

- [ ] All platform routes updated to use resource-level permission checks
- [ ] Permission matrix updated for platform resources:
  - `platform.users`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=CRUDA, ADMIN=READ, ACCOUNTANT=READ
  - `platform.roles`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=CRUDA, ADMIN=READ, ACCOUNTANT=READ
  - `platform.companies`: SUPER_ADMIN/OWNER=CRUDAM only
  - `platform.outlets`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=CRUDA, ADMIN=READ
  - `platform.settings`: SUPER_ADMIN/OWNER=CRUDAM, COMPANY_ADMIN=CRUDA, ADMIN=READ
- [ ] Tests added/updated for all platform resource permissions
- [ ] npm run build -w @jurnapod/modules-platform passes
- [ ] npm run typecheck -w @jurnapod/modules-platform passes

## Technical Details

### Files to Modify

- Platform route files in `packages/modules/platform/src/`
- `packages/modules/platform/src/*/constants/permission-matrix.ts` (if exists)

### Dependencies

- Story 39.3 (Database Schema Migration must be complete first)

### Implementation Notes

1. **Resource-level permission checks format:**
   ```typescript
   // Before
   requireAccess({ module: 'users', permission: 'read' });
   
   // After
   requireAccess({ module: 'platform', permission: 'read', resource: 'users' });
   ```

2. **Platform Resources:**
   | Resource | Category | Permission Pattern |
   |----------|----------|-------------------|
   | users | Operational | CRUD for admins, READ for accountant |
   | roles | Operational | CRUD for admins, READ for accountant |
   | companies | Structural | CRUDAM for SUPER_ADMIN/OWNER only |
   | outlets | Operational | CRUD for admins, READ for admin |
   | settings | Structural | CRUD for admins, READ for admin |

3. **Update permission matrix constants** to reflect new resource-level grants

## Testing Strategy

- Unit tests for each resource permission check
- Integration tests for platform routes with different role permissions
- Verify permission escalation is blocked correctly
- Build verification

## Dev Notes

[To be filled during implementation]
