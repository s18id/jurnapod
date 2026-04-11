# Story 39.11: Phase 3 — Verification & Cleanup

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** High

## Objective

Perform final verification that the ACL reorganization is complete and correct, including running all tests, verifying no references to the old module system remain, and updating documentation.

## Context

This is the final story for Epic 39 that performs comprehensive verification across all changes made in Stories 39.1 through 39.10. All module implementations should be complete and the codebase should be fully migrated to the new resource-level permission model.

## Acceptance Criteria

- [ ] All unit tests pass across all packages
- [ ] All integration tests pass
- [ ] No references to `reports` module in codebase (grep verification)
- [ ] No references to `REPORT` permission bit constant in code (grep verification)
- [ ] No references to `canReport` function in code (grep verification)
- [ ] Resource-level permissions work correctly (verified via tests)
- [ ] npm run build passes for all packages
- [ ] TypeScript typecheck passes on ALL packages:
  - npm run typecheck -w @jurnapod/shared
  - npm run typecheck -w @jurnapod/auth
  - npm run typecheck -w @jurnapod/db
  - npm run typecheck -w @jurnapod/modules-platform
  - npm run typecheck -w @jurnapod/modules-accounting
  - npm run typecheck -w @jurnapod/modules-inventory
  - npm run typecheck -w @jurnapod/modules-treasury
  - npm run typecheck -w @jurnapod/modules-sales
  - npm run typecheck -w @jurnapod/modules-pos
  - npm run typecheck -w @jurnapod/modules-reservations
  - npm run typecheck -w @jurnapod/api
- [ ] Cleanup SQL executed to remove old module entries (users, roles, companies, outlets, settings, accounts, journals, cash_bank) that have been migrated to new format
- [ ] Verify only new module.resource format remains in module_roles table
- [ ] Documentation updated to reflect new permission model
- [ ] Epic 39 status updated to "completed"

## Technical Details

### Verification Commands

```bash
# Verify no reports module references
rg -l "module.*reports|['\"]reports['\"]" --type ts

# Verify no REPORT permission references
rg -l "REPORT|canReport" --type ts

# Build all packages
npm run build

# Typecheck all packages
npm run typecheck

# Run all tests
npm test
```

### Cleanup SQL

```sql
-- Remove old module entries after transition complete
-- Only run after all routes updated to use new module codes
DELETE FROM module_roles 
WHERE module IN ('users', 'roles', 'companies', 'outlets', 'settings', 
                'accounts', 'journals', 'cash_bank', 'reports');

-- Verify cleanup
SELECT DISTINCT module FROM module_roles ORDER BY module;
-- Should only show: platform, accounting, treasury, inventory, sales, pos, reservations
```

### Dependencies

- Story 39.10 (reservations Module must be complete first)

### Implementation Notes

1. **Grep verification checklist:**
   - [ ] No `module: 'reports'` in route files
   - [ ] No `REPORT` constant usage (should be ANALYZE now)
   - [ ] No `canReport` function calls (should be `canAnalyze` now)
   - [ ] No `ACCESS_MODULE_CODES.reports` or similar
   - [ ] No `FEATURE_MODULE_CODES.reporting`

2. **Documentation updates needed:**
   - Update any README files referencing old module system
   - Update API documentation if applicable
   - Ensure permission matrix is reflected in docs

3. **Epic completion:**
   - Update epic status to "completed"
   - Set completion date
   - Verify all Definition of Done items checked

## Testing Strategy

- Run full test suite across all packages
- Run integration tests with real database
- Perform grep searches to verify no old references
- Manual verification of permission behavior if needed

## Dev Notes

[To be filled during implementation]
