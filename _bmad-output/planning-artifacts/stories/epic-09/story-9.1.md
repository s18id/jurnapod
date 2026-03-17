---
epic: Epic 9 - Backoffice-Users-Simplify
storyId: "9.1"
title: "Split User Create/Edit from Role Management"
status: ready
priority: P1
---

# Story 9.1: Split User Create/Edit from Role Management

## User Story

As a **backoffice admin**,  
I want to **separate user account management from role assignment**,  
So that **I can focus on one task at a time without overwhelming options**.

## Acceptance Criteria

### Basic User Creation Flow

**Given** I'm on the Users page  
**When** I click "Create User"  
**Then** a modal opens for basic user info only: Email, Company, Password, Active status

**Given** the create user modal  
**When** I save the new user  
**Then** the user is created and the modal closes  
**And** I can optionally proceed to assign roles

### Edit User Flow

**Given** an existing user  
**When** I click "Edit User"  
**Then** a modal opens for editing basic info: Email, Active status

**Given** I want to manage roles  
**When** I click "Manage Roles" (separate action)  
**Then** a dedicated role management interface opens

### Modal Separation

**Given** the old single-modal-with-5-modes approach  
**When** this story is complete  
**Then** no multi-mode modal remains - each workflow has its own focused interface

**Given** a user creation workflow  
**When** I complete basic info  
**Then** I see an option: "Assign Roles Now" or "Done (assign later)"

## Technical Notes

- Separate concerns: User entity vs Role assignments
- Clearer mental model for admins
- Reduces cognitive load significantly
- Each modal component should have single responsibility

## Files to Modify/Created

### Modified:
- `apps/backoffice/src/features/users-page.tsx` - Refactor to use separate modals
- `apps/backoffice/src/app/routes.ts` - No changes needed

### New Components:
- `apps/backoffice/src/components/user-create-modal.tsx` - Create user only
- `apps/backoffice/src/components/user-edit-modal.tsx` - Edit basic info only
- `apps/backoffice/src/components/user-role-management-modal.tsx` - Manage roles/outlets

## Dependencies

- Existing `useUsers`, `useRoles`, `useOutlets` hooks (already exist)
- Existing mutation functions in `use-users.ts`
- Story 9.2: Grid-based outlet-role assignment UI (for the role management modal)

## Testing Notes

1. Create user with basic info only
2. Verify "Assign Roles Now" prompt appears
3. Edit user basic info (email, active status)
4. Verify role management opens separately
5. Ensure no multi-mode modal remains

## Definition of Done

- [ ] UserCreateModal component created
- [ ] UserEditModal component created
- [ ] UserRoleManagementModal component created
- [ ] Old multi-mode modal removed from users-page.tsx
- [ ] Each modal has single responsibility
- [ ] "Assign Roles Now" prompt after user creation
- [ ] Tests pass
