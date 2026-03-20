# Story 9.3: Consolidated Row Action Menus

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want user-row actions grouped in dropdown menus,
so that tables remain clean and usable on smaller screens.

## Acceptance Criteria

1. **AC1: Dropdown Replaces Individual Buttons** - Given the user list is displayed on desktop and mobile widths; When an admin opens a row action menu; Then actions appear in a consistent order and naming convention shared with other backoffice tables

2. **AC2: Destructive Action Safety** - Given the user list is displayed; When an admin opens a row action menu; Then destructive actions are visually distinguished (red color) and require confirmation modal

3. **AC3: Role-Based Restrictions** - Given role-based restrictions apply; When row actions are rendered; Then unavailable actions are hidden or disabled according to the global UI standard; And inaccessible operations cannot be triggered via direct URL or stale client state

4. **AC4: Keyboard & Screen Reader Accessibility** - Given keyboard and screen-reader users interact with the menu; When focus enters, moves, and exits the dropdown; Then menu behavior meets WCAG 2.1 AA for focus management, role semantics, and announced state; And escape/enter/arrow key behavior is consistent with documented component standards

5. **AC5: Telemetry & Observability** - Given action menu usage occurs in production; When telemetry is collected; Then action-open/action-select/error events are emitted with page, actor role, and outcome metadata; And dashboards can detect abnormal error rates or abandoned actions

## Tasks / Subtasks

- [ ] Task 1: Replace action button group with consolidated Menu component (AC: #1)
  - [ ] Subtask 1.1: Import Mantine Menu components (Menu, Menu.Target, Menu.Dropdown, Menu.Item)
  - [ ] Subtask 1.2: Wrap existing action buttons in Menu structure
  - [ ] Subtask 1.3: Use IconDots (three-dot menu icon) as trigger, matching items-page.tsx pattern
  - [ ] Subtask 1.4: Define consistent action order: Edit User, Manage Roles, Assign Outlets, Change Password, Deactivate/Reactivate
  - [ ] Subtask 1.5: Add leftSection icons to each Menu.Item for visual consistency

- [ ] Task 2: Apply destructive action styling and confirmation (AC: #2)
  - [ ] Subtask 2.1: Add `color="red"` to Deactivate Menu.Item
  - [ ] Subtask 2.2: Add `color="green"` to Reactivate Menu.Item
  - [ ] Subtask 2.3: Ensure existing confirmation modal (lines 1191-1215) is reused for Deactivate/Reactivate

- [ ] Task 3: Implement role-based action visibility/disability (AC: #3)
  - [ ] Subtask 3.1: Apply `disabled` prop to Menu.Item when user cannot perform action (self-modification prevention)
  - [ ] Subtask 3.2: Apply `disabled` prop when targeting SUPER_ADMIN user
  - [ ] Subtask 3.3: Add `title` attribute for tooltip on disabled items (same logic as lines 864-870)

- [ ] Task 4: Ensure WCAG 2.1 AA accessibility compliance (AC: #4)
  - [ ] Subtask 4.1: Use Mantine's Menu which provides built-in keyboard navigation (Arrow Up/Down, Enter, Escape)
  - [ ] Subtask 4.2: Verify focus trap within open menu
  - [ ] Subtask 4.3: Ensure screen reader announces menu state (aria-expanded, aria-haspopup)
  - [ ] Subtask 4.4: Test keyboard-only navigation through menu items

- [ ] Task 5: Add telemetry events for observability (AC: #5)
  - [ ] Subtask 5.1: Emit `action-menu-open` event when menu dropdown opens
  - [ ] Subtask 5.2: Emit `action-select` event when menu item is clicked (with action name, outcome)
  - [ ] Subtask 5.3: Emit `action-error` event on failure (with error context)
  - [ ] Subtask 5.4: Include metadata: page="users", actorRole=currentUser.global_roles, outcome=success|error

- [ ] Task 6: Mobile responsiveness verification (AC: #1)
  - [ ] Subtask 6.1: Verify touch targets meet 44px minimum (Mantine ActionIcon provides this)
  - [ ] Subtask 6.2: Test menu opens/closes properly on mobile Safari and Chrome

## Dev Notes

- **Reference Pattern**: See `apps/backoffice/src/features/items-page.tsx` lines 681-730 for existing Menu implementation
- **Existing Confirmation Modal**: Reuse the confirm modal at lines 1191-1215 (Modal with "Confirm Action" title)
- **Self-Modification Prevention**: Lines 684-688 (deactivate) and 706-710 (reactivate) already enforce this in handlers
- **Telemetry Pattern**: See Epic 12's table-board-page.tsx for telemetry event patterns if available

### Project Structure Notes

- File to modify: `apps/backoffice/src/features/users-page.tsx`
- No new files required - this is an in-place refactor
- Mantine Menu components already available via @mantine/core import

### References

- [Source: _bmad-output/planning-artifacts/epics.md#1365-1390] - Epic 9 Story 9.3 acceptance criteria
- [Source: _bmad-output/planning-artifacts/epics-backoffice-ux.md#507-540] - UX design for consolidated menus
- [Source: apps/backoffice/src/features/items-page.tsx#681-730] - Mantine Menu pattern to follow
- [Source: apps/backoffice/src/features/users-page.tsx#858-928] - Current action button implementation (to be replaced)
- [Source: apps/backoffice/src/features/users-page.tsx#1191-1215] - Existing confirmation modal (to reuse)
- [Source: _bmad-output/planning-artifacts/epics.md#70] - NFR20: WCAG 2.1 AA compliance requirement

## Dev Agent Record

### Agent Model Used

minimax-m2.5 (create-story context building)

### Debug Log References

### Completion Notes List

### File List

- `apps/backoffice/src/features/users-page.tsx` - Replace 5 individual action buttons with Mantine Menu dropdown (modifies lines 857-928)
