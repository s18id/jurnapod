---
epic: Epic 9 - Backoffice-Users-Simplify
storyId: "9.4"
title: "Simplify Filters with Clear All"
status: ready
priority: P1
---

# Story 9.4: Simplify Filters with Clear All

## User Story

As a **backoffice admin**,  
I want to **use simplified filters with a clear-all option**,  
So that **I can quickly find users without filter confusion**.

## Acceptance Criteria

### Filter Layout

**Given** I'm on the Users page  
**When** I look at the filters section  
**Then** I see: Company (if super admin), Search, Status, Role, Outlet

### Clear All Functionality

**Given** multiple filters are applied  
**When** I click "Clear All" button  
**Then** all filters reset to defaults and table refreshes

### Filter Behavior

**Given** the Outlet filter  
**When** I select "All Outlets"  
**Then** it shows users from all outlets (current behavior is confusing - clarify)

**Given** the Role filter  
**When** filtering by "Admin"  
**Then** it matches users with Admin role anywhere (global OR outlet)

**Given** filter interactions  
**When** I change one filter  
**Then** table updates immediately (no extra "Apply" button needed)

### Sensible Defaults

**Given** the Status filter  
**When** it defaults to "Active Only"  
**Then** inactive users are hidden by default (reduces noise)

**Given** the Search field  
**When** I type an email address  
**Then** it filters by email (primary identifier for users)

**Given** complex filter logic existed before  
**When** this story is complete  
**Then** filters are intuitive: AND logic between different filter types

## Technical Notes

- Simplify filter state management
- Clear separation of filter concerns
- "Clear All" resets to sensible defaults
- Immediate updates (no Apply button)
- Default to Active Only status

## Files to Modify

### Modified:
- `apps/backoffice/src/features/users-page.tsx` - Refactor filter section

## Dependencies

- Existing filter state management
- Company selector (if super admin)
- Role options from `useRoles`
- Outlet options from `useOutlets`

## Testing Notes

1. Verify all 5 filters present (Company, Search, Status, Role, Outlet)
2. Apply multiple filters
3. Click "Clear All" - verify all reset
4. Verify table updates immediately on filter change
5. Verify Status defaults to "Active Only"
6. Test Search by email
7. Test Role filter (matches global OR outlet)

## Definition of Done

- [ ] Filter section simplified
- [ ] "Clear All" button implemented
- [ ] Immediate updates on filter change
- [ ] Status defaults to Active Only
- [ ] Search filters by email
- [ ] Role filter matches global OR outlet
- [ ] AND logic between filter types
- [ ] Tests pass
