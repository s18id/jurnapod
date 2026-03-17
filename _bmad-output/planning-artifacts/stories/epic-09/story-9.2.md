---
epic: Epic 9 - Backoffice-Users-Simplify
storyId: "9.2"
title: "Redesign Outlet-Role Assignment UI"
status: ready
priority: P1
---

# Story 9.2: Redesign Outlet-Role Assignment UI

## User Story

As a **backoffice admin**,  
I want to **assign outlet roles through a streamlined grid interface**,  
So that **I can efficiently manage permissions without accordion overload**.

## Acceptance Criteria

### Grid View Layout

**Given** I'm managing roles for a user  
**When** the role assignment interface opens  
**Then** I see a grid: Outlets as rows, Roles as columns

**Given** the outlet-role grid  
**When** I look at an outlet row  
**Then** I see checkboxes or dropdowns for each assignable role

**Given** a user with existing outlet roles  
**When** the grid loads  
**Then** current assignments are pre-selected/checkmarked

### Bulk Operations

**Given** I want to assign the same role to multiple outlets  
**When** I use bulk selection (checkbox multiple outlets + select role once)  
**Then** the role is applied to all selected outlets

**Given** I want to remove all roles from an outlet  
**When** I click "Clear" for that outlet row  
**Then** all role assignments for that outlet are removed

### UI Improvements

**Given** the old accordion-based interface  
**When** this story is complete  
**Then** no accordions remain - replaced with flat grid view

**Given** many outlets exist (>10)  
**When** viewing the grid  
**Then** the grid is scrollable or paginated for usability

**Given** global roles (company-wide)  
**When** viewing the assignment interface  
**Then** global roles are in a separate section above outlet-specific roles

## Technical Notes

- Replace `OutletRoleAssignmentsField` accordion component
- Use Mantine Table or Grid for outlet-role matrix
- Support bulk operations for efficiency
- Flatten the hierarchy for better visibility
- Consider virtual scrolling for large outlet lists

## Files to Modify/Created

### Modified:
- `apps/backoffice/src/features/users-page.tsx` - Remove old accordion component
- `apps/backoffice/src/components/user-role-management-modal.tsx` (from Story 9.1) - Use new grid

### New Components:
- `apps/backoffice/src/components/outlet-role-grid.tsx` - Grid-based assignment component

### Deleted:
- `OutletRoleAssignmentsField` component (accordion-based)

## Dependencies

- Story 9.1: Separate role management modal
- `useOutlets` hook - fetch outlet data
- `useRoles` hook - fetch role data
- `updateUserRoles` mutation function

## Testing Notes

1. Open role management for a user
2. Verify grid loads with outlets as rows, roles as columns
3. Check existing assignments are pre-selected
4. Test bulk assign: select multiple outlets, assign role
5. Test clear all roles for an outlet
6. Verify no accordions remain
7. Test with >10 outlets (scrollability)

## Definition of Done

- [ ] OutletRoleGrid component created
- [ ] Grid shows outlets as rows, roles as columns
- [ ] Existing assignments pre-populated
- [ ] Bulk operations working
- [ ] Clear action per outlet row
- [ ] No accordions remain
- [ ] Scrollable for large outlet lists
- [ ] Global roles in separate section
- [ ] Tests pass
