---
epic: Epic 9 - Backoffice-Users-Simplify
storyId: "9.3"
title: "Consolidate Table Action Buttons"
status: ready
priority: P1
---

# Story 9.3: Consolidate Table Action Buttons

## User Story

As a **backoffice admin**,  
I want to **access user actions through a consolidated menu**,  
So that **the table is cleaner and I can find actions easily**.

## Acceptance Criteria

### Dropdown Menu Pattern

**Given** I'm viewing the Users table  
**When** I look at a user row  
**Then** I see: "Edit" dropdown button instead of 5-6 separate buttons

**Given** I click the "Edit" dropdown  
**When** the menu opens  
**Then** I see options: Edit User, Manage Roles, Assign Outlets, Change Password, Deactivate

### Contextual Actions

**Given** a deactivated user  
**When** I open the actions dropdown  
**Then** I see "Reactivate" instead of "Deactivate"

**Given** I'm on a mobile device  
**When** viewing the users table  
**Then** the dropdown pattern works on touchscreens

### Visual Simplification

**Given** the old table with 6 action buttons per row  
**When** this story is complete  
**Then** maximum 2 buttons visible: "Edit" dropdown + Status toggle

**Given** hover states  
**When** I hover over the Edit button  
**Then** subtle visual feedback indicates interactivity

## Technical Notes

- Use Mantine Menu component for dropdown
- Reduces visual clutter significantly
- Mobile-friendly touch target (minimum 44px)
- Keep actions logically grouped
- Disable actions user cannot perform (e.g., self-modification)

## Files to Modify

### Modified:
- `apps/backoffice/src/features/users-page.tsx` - Replace button group with Menu

## Dependencies

- Mantine Menu component
- Existing action handlers: openEditDialog, openRolesDialog, etc.
- `user` context (current user) to check self-modification

## Testing Notes

1. Verify dropdown appears instead of 6 buttons
2. Click dropdown, verify all actions present
3. Test deactivated user shows "Reactivate" instead
4. Test on mobile (touch targets)
5. Verify hover states work
6. Verify disabled states for self-modification

## Definition of Done

- [ ] Actions dropdown implemented per row
- [ ] All 5-6 actions accessible via dropdown
- [ ] "Reactivate" shown for deactivated users
- [ ] Mobile-friendly touch targets
- [ ] Hover states implemented
- [ ] Maximum 2 buttons visible per row
- [ ] Tests pass
