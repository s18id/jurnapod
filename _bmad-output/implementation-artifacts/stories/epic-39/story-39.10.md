# Story 39.10: Phase 2G — reservations Module

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** High

## Objective

Update reservations module routes to use resource-level permission checks (`reservations.bookings`, `reservations.tables`) and update the permission matrix accordingly.

## Context

Building on the pos module changes (Story 39.9), the reservations module is updated to use the new resource-level permission model. Reservations handles table bookings and table management.

## Acceptance Criteria

- [ ] All reservations routes updated to use resource-level permission checks
- [ ] Permission matrix updated for reservations resources:
  - `reservations.bookings`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=CRUDA, CASHIER=READ
  - `reservations.tables`: SUPER_ADMIN/OWNER/COMPANY_ADMIN=CRUDAM, ADMIN=READ
- [ ] Tests added/updated for all reservations resource permissions
- [ ] npm run build -w @jurnapod/modules-reservations passes
- [ ] npm run typecheck -w @jurnapod/modules-reservations passes

## Technical Details

### Files to Modify

- Reservations route files in `packages/modules/reservations/src/`
- `packages/modules/reservations/src/*/constants/permission-matrix.ts` (if exists)

### Dependencies

- Story 39.9 (pos Module must be complete first)

### Implementation Notes

1. **Resource-level permission checks format:**
   ```typescript
   // Example
   requireAccess({ module: 'reservations', permission: 'read', resource: 'bookings' });
   ```

2. **Reservations Resources:**
   | Resource | Category | Permission Pattern |
   |----------|----------|-------------------|
   | bookings | Operational | CRUDAM for SUPER_ADMIN/OWNER/COMPANY_ADMIN, CRUDA for ADMIN, READ for CASHIER |
   | tables | Structural | CRUDAM for SUPER_ADMIN/OWNER/COMPANY_ADMIN, READ for ADMIN |

## Testing Strategy

- Unit tests for each resource permission check
- Integration tests for reservations routes with different role permissions
- Build verification

## Dev Notes

[To be filled during implementation]
