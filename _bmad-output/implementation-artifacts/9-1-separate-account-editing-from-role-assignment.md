# Story 9.1: Separate Account Editing from Role Assignment

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want account-profile editing separated from role/outlet assignment,
so that each workflow is clearer and less error-prone.

## Acceptance Criteria

1. [AC-1] Given an admin opens user management, when they choose `Edit Account` versus `Manage Access`, then each flow opens in a dedicated surface with only workflow-relevant fields and actions, and switching flows requires explicit navigation (no mixed inline edits).

2. [AC-2] Given an admin saves account profile changes, when the request is processed, then only profile fields are mutated and role/outlet mappings remain unchanged unless the access flow is used.

3. [AC-3] Given an admin has unsaved changes in one flow, when they attempt to leave or close the surface, then a consistent unsaved-change confirmation is shown and no partial data is persisted without explicit confirmation.

4. [AC-4] Given keyboard-only or assistive-technology usage, when either flow is opened and completed, then focus order, labels, and error announcements conform to WCAG 2.1 AA patterns used across backoffice, and all actions are reachable without pointer-only interactions.

## Tasks / Subtasks

- [ ] Task 1 (AC: #1) - Split Edit dialog into "Edit Account" (profile-only) and "Manage Access" (roles/outlets) dedicated surfaces
  - [ ] Subtask 1.1: Refactor `users-page.tsx` - replace `DialogMode` union with two separate modal types: `AccountDialogMode` and `AccessDialogMode`
  - [ ] Subtask 1.2: Rename current `openEditDialog` to `openAccountDialog` - opens profile-only form (email, active status)
  - [ ] Subtask 1.3: Rename current `openRolesDialog` + `openOutletsDialog` to unified `openAccessDialog` - opens roles + outlet role assignment
  - [ ] Subtask 1.4: Remove roles/outlets fields from account dialog - confirm only email + active status editable in account flow
  - [ ] Subtask 1.5: Remove roles/outlets fields from account save handler - `updateUser` call must NOT include role or outlet assignments
  - [ ] Subtask 1.6: Update table action buttons to show "Edit Account" and "Manage Access" as separate buttons (not combined "Edit")

- [ ] Task 2 (AC: #2) - Ensure profile-only mutations do not touch roles or outlets
  - [ ] Subtask 2.1: Verify `updateUser` API call in account dialog sends only `{ email?, is_active? }` payload
  - [ ] Subtask 2.2: Verify `createUser` in create-flow can still set roles/outlets independently (create includes initial roles, but edit does not)
  - [ ] Subtask 2.3: Add integration test confirming role/outlet state unchanged after profile-only edit

- [ ] Task 3 (AC: #3) - Add unsaved-changes confirmation on account and access dialogs
  - [ ] Subtask 3.1: Add `hasUnsavedChanges` boolean state to account dialog form
  - [ ] Subtask 3.2: Add `hasUnsavedChanges` boolean state to access dialog form
  - [ ] Subtask 3.3: Implement `beforeClose` handler on both modals that checks dirty state and shows Mantine confirmation dialog
  - [ ] Subtask 3.4: Ensure closing via X button, Escape key, and backdrop click all trigger the same unsaved-changes check
  - [ ] Subtask 3.5: Verify no partial data persists when confirmation is "Discard"

- [ ] Task 4 (AC: #4) - WCAG 2.1 AA accessibility for both flows
  - [ ] Subtask 4.1: Audit tab order in account dialog - email field → active toggle → Save → Cancel
  - [ ] Subtask 4.2: Audit tab order in access dialog - global role → outlet accordion → Save → Cancel
  - [ ] Subtask 4.3: Add `aria-label` or `aria-labelledby` to all form fields and buttons in both dialogs
  - [ ] Subtask 4.4: Add `role="alert"` + `aria-live="polite"` on error messages for screen reader announcement
  - [ ] Subtask 4.5: Verify all interactive elements reachable via keyboard (no pointer-only actions)
  - [ ] Subtask 4.6: Test with Mantine's keyboard navigation patterns already used in backoffice

## Dev Notes

- Relevant architecture patterns and constraints
  - Mantine UI components used throughout backoffice (`@mantine/core`)
  - TanStack React Table for DataTable (`@tanstack/react-table`)
  - Modals use Mantine `Modal` component with `centered` and `size="lg"` props
  - `FilterBar`, `PageCard` components for page layout
  - Existing `useUsers`, `useRoles`, `useOutlets` hooks for data fetching
  - API mutations via `updateUser`, `updateUserRoles`, `updateUserOutlets` from `use-users.ts`
  - No routing changes - all interaction is modal-based (same `/users` route)

- Source tree components to touch
  - `apps/backoffice/src/features/users-page.tsx` - main implementation file (~1218 lines, primary target)
  - `apps/backoffice/src/hooks/use-users.ts` - read-only reference for API shapes

- Testing standards summary
  - Backoffice tests use Vitest + React Testing Library
  - Test pattern: `describe/it/expect` with `@testing-library/react`
  - Component render tests for modal open/close behavior
  - User interaction tests for form fill + submit
  - Dirty-state tests for unsaved-changes confirmation
  - Run: `npm run test -w @jurnapod/backoffice`

### Project Structure Notes

- Alignment with unified project structure (paths, modules, naming)
  - Feature file: `apps/backoffice/src/features/users-page.tsx` ✓
  - Hooks: `apps/backoffice/src/hooks/use-users.ts` ✓
  - Components: `apps/backoffice/src/components/` (FilterBar, PageCard, DataTable) ✓

- Detected conflicts or variances (with rationale)
  - Current `DialogMode` type mixes ALL modes in one union — needs to split into `AccountDialogMode` and `AccessDialogMode`
  - Current "Edit" button in table opens combined dialog — needs explicit "Edit Account" vs "Manage Access" split
  - Current `openEditDialog` loads ALL user fields (including roles/outlets) into form state — needs to load profile-only fields

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.1]
- [Source: _bmad-output/planning-artifacts/epics-backoffice-ux.md#Story 9.1]
- [Source: apps/backoffice/src/features/users-page.tsx] - current implementation (lines 45-63 DialogMode, lines 266-1218 UsersPage)
- [Source: apps/backoffice/src/hooks/use-users.ts] - API shapes (updateUser at line 272, updateUserRoles at line 292)

## Dev Agent Record

### Agent Model Used

minimax-m2.5 (context-filled by kimi-k2.5 create-story workflow)

### Debug Log References

### Completion Notes List

### File List
