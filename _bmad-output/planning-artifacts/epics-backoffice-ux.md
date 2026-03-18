---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories"]
inputDocuments: [
  '/home/ahmad/jurnapod/_bmad-output/planning-artifacts/prd.md',
  '/home/ahmad/jurnapod/_bmad-output/planning-artifacts/architecture.md'
]
workflowComplete: true
dateCompleted: 2026-03-17
documentType: 'epics-and-stories'
scope: 'backoffice-ux-refactoring'
---

# jurnapod - Backoffice UX Refactoring Epics

## Overview

This document provides the epic and story breakdown for the **Backoffice UX Refactoring** initiative. These epics focus on improving the user experience of the existing backoffice application by splitting complex pages, simplifying workflows, and standardizing UI patterns.

**Note:** The core system features (Epics 1-7) are already implemented. This document covers UX improvements only.

## Epic Summary

| Epic | Name | Priority | Stories | Effort | Status |
|------|------|----------|---------|--------|--------|
| Epic 8 | Backoffice-Items-Split | P0 | 8 | 12-15h | Ready |
| Epic 9 | Backoffice-Users-Simplify | P1 | 5 | 8-10h | Ready |
| Epic 10 | Backoffice-Consistency-Standards | P2 | 6 | 6-8h | Ready |
| Epic 11 | Backoffice-Performance | P3 | - | 4-6h | **Deferred** |

## Implementation Priority

**Phase 1 (P0):** Epic 8 - Items/Prices Split  
**Phase 2 (P1):** Epic 9 - Users Simplification  
**Phase 3 (P2):** Epic 10 - Consistency Standards  

**Total Active Epics:** 3  
**Total Stories:** 19  
**Total Effort:** ~26-33 hours

---

## Epic 8: Backoffice-Items-Split

**Goal:** Split the 2,195-line, 91KB Items & Prices god component into focused, manageable pages with improved UX.

**Current Pain Points:**
- Single file: Items tab + Prices tab + 8 modals + inline editing
- Cognitive overload from too many responsibilities
- Accidental changes from inline editing
- Confusing "defaults" vs "outlet" pricing hierarchy

**User Outcome:**
- Clear separation: Items catalog vs Price management
- Explicit edit modals (no inline editing)
- Visual pricing hierarchy (defaults → overrides)
- Easier navigation, faster task completion

**Priority:** P0 | **Effort:** 12-15 hours

### Story 8.1: Extract useItems Hook with Caching

As a **developer**,  
I want to **extract a reusable useItems hook with caching**,  
So that **both Items and Prices pages can share item data efficiently**.

**Acceptance Criteria:**

**Given** the existing items data fetching logic in items-prices-page.tsx  
**When** I extract it into a standalone `useItems()` hook  
**Then** the hook returns `{ items, loading, error, refresh, itemMap }`

**Given** the useItems hook is implemented  
**When** multiple components use the hook  
**Then** data is cached and shared between components (not re-fetched)

**Given** cached item data  
**When** the `refresh()` function is called  
**Then** data is re-fetched from the API and cache is updated

**Given** the hook is used  
**When** the component unmounts  
**Then** no memory leaks occur (proper cleanup)

**Technical Notes:**
- Location: `apps/backoffice/src/hooks/use-items.ts`
- Use React Context or Zustand for shared state
- Cache invalidation on mutations

---

### Story 8.2: Extract useItemGroups Hook

As a **developer**,  
I want to **extract a reusable useItemGroups hook**,  
So that **item group data can be shared across pages**.

**Acceptance Criteria:**

**Given** the existing item groups fetching logic  
**When** I extract it into `useItemGroups()` hook  
**Then** the hook returns `{ itemGroups, loading, error, refresh, groupMap }`

**Given** the useItemGroups hook  
**When** used in Items or Prices page  
**Then** group data is available for filtering and display

**Given** a groupMap derived from itemGroups  
**When** looking up a group by ID  
**Then** O(1) lookup time is achieved

**Technical Notes:**
- Location: `apps/backoffice/src/hooks/use-item-groups.ts`
- Share with useItems hook via same state management

---

### Story 8.3: Create New /items Page

As a **backoffice user**,  
I want to **access a dedicated Items page**,  
So that **I can manage the product catalog without pricing distractions**.

**Acceptance Criteria:**

**Given** I navigate to `/items`  
**When** the page loads  
**Then** I see a list of all items with columns: ID, SKU, Name, Group, Type, Status

**Given** the Items page  
**When** I use the search box  
**Then** items are filtered by name or SKU in real-time

**Given** the Items page  
**When** I use filters (Type, Group, Status)  
**Then** the table updates to show only matching items

**Given** the Items page  
**When** I click "Create Item"  
**Then** a modal opens with form fields: SKU, Name, Type, Group, Active

**Given** the create item form  
**When** I fill in valid data and click "Create"  
**Then** the item is created and appears in the list

**Given** an existing item in the list  
**When** I click "Edit"  
**Then** an edit modal opens pre-filled with item data (no inline editing)

**Given** the edit modal is open  
**When** I modify fields and click "Save"  
**Then** changes are saved and list refreshes

**Given** an item in the list  
**When** I click "Delete"  
**Then** a confirmation modal appears before deletion

**Given** the Items page has import functionality  
**When** I click "Import Items"  
**Then** the ImportWizard modal opens with item-specific configuration

**Given** the Items page has export functionality  
**When** I click "Export"  
**Then** items are downloaded as CSV

**Technical Notes:**
- Location: `apps/backoffice/src/features/items-page.tsx`
- Use extracted hooks from Stories 8.1 and 8.2
- File size target: < 600 lines (vs current 2,195)

---

### Story 8.4: Create New /prices Page

As a **backoffice user**,  
I want to **access a dedicated Prices page**,  
So that **I can manage pricing with clear hierarchy visibility**.

**Acceptance Criteria:**

**Given** I navigate to `/prices`  
**When** the page loads  
**Then** I see a pricing view with outlet selector and "Company Defaults" section

**Given** I select an outlet from the dropdown  
**When** the view updates  
**Then** I see outlet-specific prices with visual indicators for overrides

**Given** the Prices page  
**When** I view an item's price  
**Then** I can see: Company Default Price → Outlet Override Price (if any)

**Given** a company default price  
**When** I click "Set Override"  
**Then** a modal opens to create outlet-specific price

**Given** the override modal  
**When** I enter a price and save  
**Then** the override is created and displayed with visual distinction

**Given** an existing override  
**When** I click "Edit"  
**Then** I can modify the override price

**Given** an existing override  
**When** I click "Remove Override"  
**Then** the outlet reverts to company default price

**Given** the Prices page has import functionality  
**When** I click "Import Prices"  
**Then** the ImportWizard modal opens with price-specific configuration

**Given** the Prices page has export functionality  
**When** I click "Export"  
**Then** prices are downloaded as CSV with scope indicators

**Technical Notes:**
- Location: `apps/backoffice/src/features/prices-page.tsx`
- Visual hierarchy is key differentiator from old combined page
- File size target: < 800 lines

---

### Story 8.5: Build Reusable ImportWizard Component

As a **developer**,  
I want to **create a generic ImportWizard component**,  
So that **both items and prices can use consistent import UX**.

**Acceptance Criteria:**

**Given** any import feature needs a wizard  
**When** I use `<ImportWizard config={importConfig} />`  
**Then** a 3-step wizard renders: Source → Preview → Apply

**Given** the Source step  
**When** the user pastes CSV data or uploads a file  
**Then** the data is parsed and validated

**Given** the Preview step  
**When** validation completes  
**Then** a table shows rows with status (Create/Error) and error messages

**Given** the Preview step has errors  
**When** the user views the preview  
**Then** error rows are highlighted with specific error messages

**Given** the Preview step has valid rows  
**When** the user clicks "Import"  
**Then** the Apply step shows progress with progress bar

**Given** the Apply step completes  
**When** all rows are processed  
**Then** a summary shows: Success count, Failed count

**Given** the component is reusable  
**When** used for Items import vs Prices import  
**Then** only the column definitions and API endpoints differ

**Given** the wizard is reusable  
**When** configured for different entity types  
**Then** the same 3-step pattern is maintained consistently

**Technical Notes:**
- Location: `apps/backoffice/src/components/import-wizard.tsx`
- Props interface: `ImportWizardConfig`
- Replaces duplicate import logic in items-prices-page.tsx

---

### Story 8.6: Remove Inline Editing - Implement Explicit Edit Modals

As a **backoffice user**,  
I want to **edit items and prices through explicit modals**,  
So that **I don't accidentally change data while browsing**.

**Acceptance Criteria:**

**Given** I'm viewing the Items or Prices list  
**When** I click on a row or "Edit" button  
**Then** an edit modal opens (no inline form fields in the table)

**Given** an edit modal is open  
**When** I modify data  
**Then** the list behind doesn't change until I click "Save"

**Given** I make changes in the edit modal  
**When** I click "Cancel"  
**Then** the modal closes without saving changes

**Given** I make changes in the edit modal  
**When** I click "Save"  
**Then** changes are saved, modal closes, and list refreshes

**Given** the old items-prices-page had inline editing  
**When** this story is complete  
**Then** no inline editing remains in the new pages

**Given** a user is browsing the list  
**When** they accidentally click on a field  
**Then** no edit mode is triggered (safe browsing experience)

**Technical Notes:**
- Remove all `editingItemId`, `itemDraft` state patterns
- Replace with modal-based edit flows
- Explicit "Edit" action required to modify data

---

### Story 8.7: Add Visual Pricing Hierarchy Indicators

As a **backoffice user**,  
I want to **see clear visual indicators of pricing hierarchy**,  
So that **I understand which prices are defaults vs overrides**.

**Acceptance Criteria:**

**Given** I'm viewing the Prices page  
**When** I look at an item with only company default  
**Then** I see a visual indicator (e.g., "Default" badge) and the default price

**Given** an item has an outlet override  
**When** I view it in outlet mode  
**Then** I see: Default price (strikethrough or gray) → Override price (highlighted)

**Given** an item with override  
**When** I hover over the price  
**Then** a tooltip shows: "Default: $X.XX, Override: $Y.YY"

**Given** the pricing hierarchy  
**When** displayed visually  
**Then** it's clear that Outlet Price overrides Company Default

**Given** color coding is used  
**Then** green = using default, blue = has override, red = override differs significantly (>20%)

**Given** I'm in "Company Defaults" view  
**When** I view the prices  
**Then** all items show default prices with "Default" badges

**Given** I'm in "Outlet" view  
**When** an item uses the default price (no override)  
**Then** it shows "Using Default" with the default price value

**Technical Notes:**
- Use Mantine Badge and Tooltip components
- Color scheme: default=green, override=blue, significant-diff=red
- Clear visual hierarchy prevents pricing confusion

---

### Story 8.8: Update Routing and Add Cross-Navigation

As a **developer**,  
I want to **update routes and add navigation between Items and Prices**,  
So that **users can move seamlessly between related features**.

**Acceptance Criteria:**

**Given** the new pages exist  
**When** I navigate to `/items`  
**Then** the Items page renders (no 404)

**Given** I navigate to `/prices`  
**When** the route is accessed  
**Then** the Prices page renders

**Given** the old `/items-prices` route  
**When** accessed  
**Then** it redirects to `/items` (temporary redirect, not permanent)

**Given** I'm on the Items page  
**When** I look at the header/actions  
**Then** I see a "Manage Prices" button linking to `/prices`

**Given** I'm on the Prices page  
**When** I look at the header/actions  
**Then** I see a "View Items" button linking to `/items`

**Given** navigation menu is updated  
**When** viewed in the sidebar  
**Then** "Items" and "Prices" appear as separate menu items (not "Items & Prices")

**Given** the backoffice sync module has navigation  
**When** sync completes for items or prices  
**Then** appropriate success message includes link to view the data

**Given** deep linking is supported  
**When** I share `/prices?outlet=123`  
**Then** recipient sees prices filtered to that outlet

**Technical Notes:**
- Update `apps/backoffice/src/app/routes.ts`
- Update `apps/backoffice/src/app/router.tsx`
- Add query param support for outlet filtering
- Remove or redirect old `/items-prices` route

---

## Epic 9: Backoffice-Users-Simplify

**Goal:** Redesign the 40KB Users page with complex role management to simplify workflows and improve usability.

**Current Pain Points:**
- Single modal with 5 modes (create, edit, roles, outlets, password)
- Accordion forest for outlet-role assignment
- 4 filter dropdowns with confusing interactions
- 5-6 action buttons per table row

**User Outcome:**
- Clear separation: User creation vs Role management
- Streamlined outlet-role assignment (grid view vs accordions)
- Simplified filters with "clear all"
- Consolidated actions (edit dropdown vs 6 buttons)

**Priority:** P1 | **Effort:** 8-10 hours

### Story 9.1: Split User Create/Edit from Role Management

As a **backoffice admin**,  
I want to **separate user account management from role assignment**,  
So that **I can focus on one task at a time without overwhelming options**.

**Acceptance Criteria:**

**Given** I'm on the Users page  
**When** I click "Create User"  
**Then** a modal opens for basic user info only: Email, Company, Password, Active status

**Given** the create user modal  
**When** I save the new user  
**Then** the user is created and the modal closes  
**And** I can optionally proceed to assign roles

**Given** an existing user  
**When** I click "Edit User"  
**Then** a modal opens for editing basic info: Email, Active status

**Given** I want to manage roles  
**When** I click "Manage Roles" (separate action)  
**Then** a dedicated role management interface opens

**Given** the old single-modal-with-5-modes approach  
**When** this story is complete  
**Then** no multi-mode modal remains - each workflow has its own focused interface

**Given** a user creation workflow  
**When** I complete basic info  
**Then** I see an option: "Assign Roles Now" or "Done (assign later)"

**Technical Notes:**
- Separate concerns: User entity vs Role assignments
- Clearer mental model for admins
- Reduces cognitive load significantly

---

### Story 9.2: Redesign Outlet-Role Assignment UI

As a **backoffice admin**,  
I want to **assign outlet roles through a streamlined grid interface**,  
So that **I can efficiently manage permissions without accordion overload**.

**Acceptance Criteria:**

**Given** I'm managing roles for a user  
**When** the role assignment interface opens  
**Then** I see a grid: Outlets as rows, Roles as columns

**Given** the outlet-role grid  
**When** I look at an outlet row  
**Then** I see checkboxes or dropdowns for each assignable role

**Given** a user with existing outlet roles  
**When** the grid loads  
**Then** current assignments are pre-selected/checkmarked

**Given** I want to assign the same role to multiple outlets  
**When** I use bulk selection (checkbox multiple outlets + select role once)  
**Then** the role is applied to all selected outlets

**Given** I want to remove all roles from an outlet  
**When** I click "Clear" for that outlet row  
**Then** all role assignments for that outlet are removed

**Given** the old accordion-based interface  
**When** this story is complete  
**Then** no accordions remain - replaced with flat grid view

**Given** many outlets exist (>10)  
**When** viewing the grid  
**Then** the grid is scrollable or paginated for usability

**Given** global roles (company-wide)  
**When** viewing the assignment interface  
**Then** global roles are in a separate section above outlet-specific roles

**Technical Notes:**
- Replace `OutletRoleAssignmentsField` accordion component
- Use Mantine Table or Grid for outlet-role matrix
- Support bulk operations for efficiency

---

### Story 9.3: Consolidate Table Action Buttons

As a **backoffice admin**,  
I want to **access user actions through a consolidated menu**,  
So that **the table is cleaner and I can find actions easily**.

**Acceptance Criteria:**

**Given** I'm viewing the Users table  
**When** I look at a user row  
**Then** I see: "Edit" dropdown button instead of 5-6 separate buttons

**Given** I click the "Edit" dropdown  
**When** the menu opens  
**Then** I see options: Edit User, Manage Roles, Assign Outlets, Change Password, Deactivate

**Given** a deactivated user  
**When** I open the actions dropdown  
**Then** I see "Reactivate" instead of "Deactivate"

**Given** I'm on a mobile device  
**When** viewing the users table  
**Then** the dropdown pattern works on touchscreens

**Given** the old table with 6 action buttons per row  
**When** this story is complete  
**Then** maximum 2 buttons visible: "Edit" dropdown + Status toggle

**Given** hover states  
**When** I hover over the Edit button  
**Then** subtle visual feedback indicates interactivity

**Technical Notes:**
- Use Mantine Menu component for dropdown
- Reduces visual clutter significantly
- Mobile-friendly touch target

---

### Story 9.4: Simplify Filters with Clear All

As a **backoffice admin**,  
I want to **use simplified filters with a clear-all option**,  
So that **I can quickly find users without filter confusion**.

**Acceptance Criteria:**

**Given** I'm on the Users page  
**When** I look at the filters section  
**Then** I see: Company (if super admin), Search, Status, Role, Outlet

**Given** multiple filters are applied  
**When** I click "Clear All" button  
**Then** all filters reset to defaults and table refreshes

**Given** the Outlet filter  
**When** I select "All Outlets"  
**Then** it shows users from all outlets (current behavior is confusing - clarify)

**Given** the Role filter  
**When** filtering by "Admin"  
**Then** it matches users with Admin role anywhere (global OR outlet)

**Given** filter interactions  
**When** I change one filter  
**Then** table updates immediately (no extra "Apply" button needed)

**Given** the Status filter  
**When** it defaults to "Active Only"  
**Then** inactive users are hidden by default (reduces noise)

**Given** the Search field  
**When** I type an email address  
**Then** it filters by email (primary identifier for users)

**Given** complex filter logic existed before  
**When** this story is complete  
**Then** filters are intuitive: AND logic between different filter types

**Technical Notes:**
- Simplify filter state management
- Clear separation of filter concerns
- "Clear All" resets to sensible defaults

---

### Story 9.5: Optimize Modal Workflows

As a **backoffice admin**,  
I want to **complete user management tasks in focused, optimized modals**,  
So that **I can work efficiently without overwhelming interfaces**.

**Acceptance Criteria:**

**Given** any modal opens  
**When** it appears  
**Then** it has clear title, focused content, and primary/secondary actions

**Given** the Create User modal  
**When** I open it  
**Then** I see only essential fields: Email, Company (super admin), Password, Active checkbox

**Given** the Edit User modal  
**When** I open it  
**Then** I see editable fields with current values pre-populated

**Given** the Manage Roles modal  
**When** I open it  
**Then** I see Global Role section + Outlet Roles grid (from Story 9.2)

**Given** the Change Password modal  
**When** I open it  
**Then** I see only: New Password field, Confirm Password field

**Given** form validation errors  
**When** I try to submit with invalid data  
**Then** clear error messages appear next to relevant fields

**Given** successful operations  
**When** I save changes  
**Then** a success toast appears and modal closes automatically

**Given** any modal is open  
**When** I press Escape key  
**Then** the modal closes (standard UX pattern)

**Given** any modal has unsaved changes  
**When** I try to close it  
**Then** I see a confirmation: "Discard unsaved changes?"

**Technical Notes:**
- Each modal has single responsibility
- Follow modal UX best practices
- Consistent styling across all modals

---

## Epic 10: Backoffice-Consistency-Standards

**Goal:** Standardize the 6-8 most inconsistent/problematic backoffice pages to create a cohesive user experience.

**Current Pain Points:**
- Inconsistent action button placement across pages
- Mixed filter patterns (some inline, some sidebar, some header)
- Varying table column widths and layouts
- Some pages lack navigation context

**User Outcome:**
- Consistent page header with title + actions
- Standardized filter bar pattern
- Uniform table layouts
- Clear breadcrumb/context navigation

**Priority:** P2 | **Effort:** 6-8 hours

### Story 10.1: Identify Most Inconsistent Pages

As a **UX designer/developer**,  
I want to **audit all backoffice pages and identify the worst inconsistencies**,  
So that **we focus standardization efforts on the most problematic pages**.

**Acceptance Criteria:**

**Given** 34 backoffice pages exist  
**When** I audit each page  
**Then** I document: Header pattern, Filter pattern, Table pattern, Action placement

**Given** the audit is complete  
**When** I analyze the findings  
**Then** I identify the 6-8 pages with the most inconsistency issues

**Given** identified problem pages  
**When** prioritized  
**Then** the list is ordered by: User impact × Inconsistency severity

**Given** the audit results  
**When** documented  
**Then** specific issues are noted per page (e.g., "Missing header actions", "Inconsistent filters")

**Expected Problem Pages (from earlier analysis):**
- items-prices-page.tsx (will be replaced by Epic 8)
- users-page.tsx (will be improved by Epic 9)
- pos-transactions-page.tsx
- daily-sales-page.tsx
- general-ledger-page.tsx
- journals-page.tsx
- outlets-page.tsx

**Technical Notes:**
- Document findings in ephemeral notes or separate file
- Focus on patterns, not one-off issues
- Prioritize high-traffic pages

---

### Story 10.2: Create PageHeader Component

As a **developer**,  
I want to **create a reusable PageHeader component**,  
So that **all pages have consistent title and action placement**.

**Acceptance Criteria:**

**Given** any backoffice page  
**When** I use `<PageHeader title="X" actions={buttons} />`  
**Then** it renders consistent header styling

**Given** the PageHeader component  
**When** title prop is provided  
**Then** it displays as page title with consistent typography (Mantine Title order=2)

**Given** action buttons  
**When** passed to the actions prop  
**Then** they render aligned to the right in the header

**Given** the PageHeader  
**When** description prop is provided  
**Then** subtitle/description appears below title

**Given** responsive design  
**When** viewed on smaller screens  
**Then** actions stack below title (not overflow)

**Given** the component is used  
**When** across different pages  
**Then** consistent spacing, borders, and visual hierarchy is maintained

**Given** the existing PageCard component  
**When** PageHeader is created  
**Then** they work together (PageHeader above PageCard, or PageCard includes header)

**Technical Notes:**
- Location: `apps/backoffice/src/components/page-header.tsx`
- Props: title, description?, actions?, backButton?, breadcrumbs?
- Consistent with Mantine design system

---

### Story 10.3: Create FilterBar Component

As a **developer**,  
I want to **create a reusable FilterBar component**,  
So that **filter placement and behavior is consistent across pages**.

**Acceptance Criteria:**

**Given** any page with filters  
**When** I use `<FilterBar filters={filterConfig} onChange={handler} />`  
**Then** it renders consistent filter layout

**Given** the FilterBar component  
**When** multiple filters are provided  
**Then** they display in a row (responsive: wrap on mobile)

**Given** filter configuration  
**When** defining filters  
**Then** I can specify: type (text, select, date), label, placeholder, options

**Given** the FilterBar  
**When** a filter value changes  
**Then** onChange callback fires with all current filter values

**Given** filters have values  
**When** I look at the FilterBar  
**Then** a "Clear All" button appears (enabled when filters have non-default values)

**Given** I click "Clear All"  
**When** button is clicked  
**Then** all filters reset to default values and onChange fires

**Given** responsive design  
**When** on mobile viewport  
**Then** filters stack vertically or use collapsible pattern

**Given** the component is used  
**When** across different pages  
**Then** consistent spacing, styling, and behavior

**Technical Notes:**
- Location: `apps/backoffice/src/components/filter-bar.tsx`
- Support common filter types: TextInput, Select, DatePicker, Checkbox
- Flexible configuration pattern

---

### Story 10.4: Standardize Table Patterns on Problem Pages

As a **developer**,  
I want to **apply consistent table patterns to the identified problem pages**,  
So that **users have uniform table experiences across the backoffice**.

**Acceptance Criteria:**

**Given** the 6-8 identified problem pages (from Story 10.1)  
**When** I update each page  
**Then** they use consistent: column widths, action placement, empty states, loading states

**Given** DataTable component usage  
**When** on standardized pages  
**Then** minWidth is consistently set (e.g., 900px)

**Given** action columns in tables  
**When** displayed  
**Then** they use consistent dropdown menu pattern (from Epic 9)

**Given** empty table states  
**When** no data exists  
**Then** consistent message: "No [items] found" or "No [items] match your search."

**Given** loading states  
**When** data is fetching  
**Then** consistent loading indicator (skeleton or spinner)

**Given** pagination  
**When** needed  
**Then** consistent pagination component and placement (bottom-right)

**Given** sortable columns  
**When** present  
**Then** consistent sort indicator icons (chevrons)

**Given** the standardized pages  
**When** compared side-by-side  
**Then** tables look and behave consistently

**Pages to Standardize:**
- pos-transactions-page.tsx
- daily-sales-page.tsx
- general-ledger-page.tsx
- journals-page.tsx
- outlets-page.tsx
- (plus any other high-impact pages from audit)

**Technical Notes:**
- Leverage existing DataTable component
- Consistent column width strategy
- Unified action patterns

---

### Story 10.5: Add Breadcrumbs Where Missing

As a **backoffice user**,  
I want to **see breadcrumb navigation on deep pages**,  
So that **I understand where I am and can navigate back easily**.

**Acceptance Criteria:**

**Given** I'm on a top-level page (e.g., /items, /users)  
**When** viewing the page  
**Then** no breadcrumb is shown (top-level, no context needed)

**Given** I'm on a detail/edit page (e.g., /items/123/edit)  
**When** viewing the page  
**Then** breadcrumb shows: Items > Item Name > Edit

**Given** a breadcrumb trail  
**When** I click a parent level  
**Then** I navigate to that page

**Given** the current page in breadcrumb  
**When** displayed  
**Then** it appears as text (not clickable link)

**Given** long page names  
**When** in breadcrumb  
**Then** they truncate gracefully with ellipsis

**Given** the breadcrumb component  
**When** used  
**Then** it integrates with the router and PageHeader

**Pages Requiring Breadcrumbs:**
- Detail pages (item details, user details)
- Edit pages (item edit, price override edit)
- Nested settings pages
- Any page more than 1 level deep

**Technical Notes:**
- Create `Breadcrumb` component
- Integrate with react-router or current routing solution
- Use Mantine Breadcrumbs or custom implementation

---

### Story 10.6: Document Backoffice UI Standards

As a **developer/team member**,  
I want to **document the established UI standards**,  
So that **future development maintains consistency**.

**Acceptance Criteria:**

**Given** the standardization work is complete  
**When** I create documentation  
**Then** it covers: Page structure, Header pattern, Filter pattern, Table pattern

**Given** the documentation  
**When** describing PageHeader usage  
**Then** it includes: Props, Examples, When to use

**Given** the documentation  
**When** describing FilterBar usage  
**Then** it includes: Configuration options, Common patterns, Best practices

**Given** the documentation  
**When** describing table patterns  
**Then** it includes: Action placement, Empty states, Loading states

**Given** code examples  
**When** provided  
**Then** they are copy-paste ready for new page development

**Given** the documentation location  
**When** saved  
**Then** it's in `docs/ui/backoffice-standards.md` or similar

**Given** the documentation exists  
**When** a developer creates a new backoffice page  
**Then** they can follow the standards without guessing

**Documentation Sections:**
1. Page Structure Template
2. PageHeader Component Guide
3. FilterBar Component Guide
4. Table Patterns
5. Modal Patterns
6. Form Patterns
7. Action Button Guidelines

**Technical Notes:**
- Markdown format for easy reading
- Include code examples
- Reference actual components created in this epic

---

## Appendix: Deferred Epics

### Epic 11: Backoffice-Performance (Deferred to P3)

**Goal:** Improve perceived performance and loading states

**Why Deferred:**
- Current performance is acceptable for MVP
- No user complaints about speed
- Can be addressed later if issues arise

**Future Stories (when prioritized):**
1. Add loading skeletons to DataTable
2. Implement optimistic updates for common actions
3. Optimize data fetching patterns
4. Improve offline state visibility
5. Add pagination for large datasets

**Trigger for Reactivation:**
- User complaints about slow loading
- Large dataset performance issues (>1000 rows)
- Competitive pressure for speed

---

## Document Control

**Last Updated:** 2026-03-17  
**Status:** Ready for Implementation  
**Next Step:** Sprint planning and story assignment
