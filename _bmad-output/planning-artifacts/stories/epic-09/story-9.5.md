---
epic: Epic 9 - Backoffice-Users-Simplify
storyId: "9.5"
title: "Optimize Modal Workflows"
status: ready
priority: P1
---

# Story 9.5: Optimize Modal Workflows

## User Story

As a **backoffice admin**,  
I want to **complete user management tasks in focused, optimized modals**,  
So that **I can work efficiently without overwhelming interfaces**.

## Acceptance Criteria

### Modal Structure

**Given** any modal opens  
**When** it appears  
**Then** it has clear title, focused content, and primary/secondary actions

### Create User Modal

**Given** the Create User modal  
**When** I open it  
**Then** I see only essential fields: Email, Company (super admin), Password, Active checkbox

### Edit User Modal

**Given** the Edit User modal  
**When** I open it  
**Then** I see editable fields with current values pre-populated

### Manage Roles Modal

**Given** the Manage Roles modal  
**When** I open it  
**Then** I see Global Role section + Outlet Roles grid (from Story 9.2)

### Change Password Modal

**Given** the Change Password modal  
**When** I open it  
**Then** I see only: New Password field, Confirm Password field

### Validation and Feedback

**Given** form validation errors  
**When** I try to submit with invalid data  
**Then** clear error messages appear next to relevant fields

**Given** successful operations  
**When** I save changes  
**Then** a success toast appears and modal closes automatically

### UX Patterns

**Given** any modal is open  
**When** I press Escape key  
**Then** the modal closes (standard UX pattern)

**Given** any modal has unsaved changes  
**When** I try to close it  
**Then** I see a confirmation: "Discard unsaved changes?"

## Technical Notes

- Each modal has single responsibility
- Follow modal UX best practices
- Consistent styling across all modals
- Use Mantine Modal component consistently
- Track form dirty state for unsaved changes warning
- Escape key handler for all modals

## Files to Modify

### Modified:
- `apps/backoffice/src/components/user-create-modal.tsx` - Polish UX
- `apps/backoffice/src/components/user-edit-modal.tsx` - Polish UX
- `apps/backoffice/src/components/user-role-management-modal.tsx` - Polish UX
- `apps/backoffice/src/components/change-password-modal.tsx` - New component

## Dependencies

- Story 9.1: All modal components created
- Story 9.2: Grid-based role assignment
- Mantine Modal, Alert, Notification components
- Form validation logic

## Testing Notes

1. Open each modal, verify clear title and focused content
2. Verify Create User has only essential fields
3. Verify Edit User pre-populates values
4. Verify Manage Roles has global + outlet sections
5. Verify Change Password has password + confirm
6. Test validation errors appear next to fields
7. Test success toast and auto-close
8. Test Escape key closes modal
9. Test unsaved changes confirmation

## Definition of Done

- [ ] All modals have clear titles
- [ ] Focused content (no extra fields)
- [ ] Pre-populated values in edit modals
- [ ] Validation errors next to fields
- [ ] Success toast + auto-close
- [ ] Escape key closes modal
- [ ] Unsaved changes confirmation
- [ ] Consistent styling across all modals
- [ ] Tests pass
