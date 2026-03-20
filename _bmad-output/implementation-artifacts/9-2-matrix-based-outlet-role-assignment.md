# Story 9.2: Matrix-Based Outlet-Role Assignment

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want a scalable matrix/grid for outlet-role assignments with bulk actions,
so that I can manage permissions across many outlets efficiently.

## Acceptance Criteria

1. **Given** a user with many outlet-role combinations
   **When** the admin opens assignment matrix view
   **Then** role/outlet intersections are rendered with clear current-state indicators and sticky headers on large datasets
   **And** the layout remains usable at supported desktop and tablet breakpoints

2. **Given** the admin performs bulk assign/revoke operations
   **When** they preview and confirm changes
   **Then** the UI shows before/after delta counts and affected outlets/users
   **And** save is blocked until validation passes

3. **Given** an assignment crosses tenant/company boundaries or violates role policy
   **When** validation runs client/server side
   **Then** the operation is rejected with row-level and summary feedback
   **And** no partial cross-tenant assignment is persisted

4. **Given** assignment changes are submitted
   **When** processing completes
   **Then** success/failure outcomes include deterministic per-row result states
   **And** audit/telemetry events capture actor, target user, delta size, latency, and outcome class for observability

## Tasks / Subtasks

- [ ] Task 1: Design matrix grid layout with sticky headers (AC: #1)
  - [ ] Subtask 1.1: Create `OutletRoleMatrix` component replacing `OutletRoleAssignmentsField`
  - [ ] Subtask 1.2: Implement sticky header row (roles) and first column (outlets)
  - [ ] Subtask 1.3: Add current-state indicators (checkmarks, badges) per cell
  - [ ] Subtask 1.4: Ensure responsive breakpoints for desktop and tablet

- [ ] Task 2: Implement bulk assign/revoke with preview (AC: #2)
  - [ ] Subtask 2.1: Add row/column multi-select for bulk operations
  - [ ] Subtask 2.2: Create preview modal showing before/after delta counts
  - [ ] Subtask 2.3: Block save until client-side validation passes
  - [ ] Subtask 2.4: Wire preview to existing bulk API in `apps/api/src/lib/users.ts`

- [ ] Task 3: Add client/server validation with row-level feedback (AC: #3)
  - [ ] Subtask 3.1: Client-side validation for role scope (global vs outlet-scoped)
  - [ ] Subtask 3.2: Hook into server-side `RoleScopeViolationError` handling
  - [ ] Subtask 3.3: Display row-level error messages per cell
  - [ ] Subtask 3.4: Show summary feedback banner for cross-tenant violations
  - [ ] Subtask 3.5: Ensure atomic transactions - no partial persistence

- [ ] Task 4: Implement deterministic per-row results and audit telemetry (AC: #4)
  - [ ] Subtask 4.1: Update API response to include per-row success/failure states
  - [ ] Subtask 4.2: Emit audit events with: actor, target_user, delta_size, latency, outcome_class
  - [ ] Subtask 4.3: Display deterministic result states in UI (success/failure per outlet-role pair)
  - [ ] Subtask 4.4: Add telemetry capture in the backoffice sync layer

## Dev Notes

- **Replace**: `OutletRoleAssignmentsField` accordion component (users-page.tsx lines 86-209)
- **Component location**: `apps/backoffice/src/components/outlet-role-matrix.tsx`
- **API contract**: Bulk role assignment via `PUT /users/:id/roles` (already exists in `apps/api/src/lib/users.ts`)
- **Data model**: `user_role_assignments` table with `user_id`, `role_id`, `outlet_id`
- **Tech stack**: React, Mantine Table/Grid, TypeScript
- **Testing**: Unit tests for matrix component, integration tests for bulk API

### Project Structure Notes

- **Backoffice path**: `apps/backoffice/src/features/users-page.tsx`
- **Shared types**: `packages/shared/src/types/user.ts`
- **API layer**: `apps/api/src/lib/users.ts` (already has bulk assignment logic)
- **Auth guard**: `@/lib/auth-guard` for role validation

### References

- Existing `OutletRoleAssignmentsField` component: `apps/backoffice/src/features/users-page.tsx` lines 86-209
- Bulk assignment API: `apps/api/src/lib/users.ts` `updateUserRoles()` function
- Role scope validation: `apps/api/src/lib/users.ts` `RoleScopeViolationError`
- User type definitions: `packages/shared/src/types/user.ts`
- Epic 9 overview: `_bmad-output/planning-artifacts/epics.md` lines 1307-1363
- Backoffice UX spec: `_bmad-output/planning-artifacts/epics-backoffice-ux.md` lines 457-501

## Dev Agent Record

### Agent Model Used

minimax-m2.5 (opencode-go/minimax-m2.5)

### Debug Log References

### Completion Notes List

### File List
