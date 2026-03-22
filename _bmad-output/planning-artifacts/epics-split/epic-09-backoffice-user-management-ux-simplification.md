## Epic 9: Backoffice User Management UX Simplification

Admins can manage users, roles, and outlet assignments with lower cognitive load and clearer actions.

### Story 9.1: Separate Account Editing from Role Assignment
As an admin,
I want account-profile editing separated from role/outlet assignment,
So that each workflow is clearer and less error-prone.

**Acceptance Criteria:**

**Given** an admin opens user management
**When** they choose `Edit Account` versus `Manage Access`
**Then** each flow opens in a dedicated surface with only workflow-relevant fields and actions
**And** switching flows requires explicit navigation (no mixed inline edits)

**Given** an admin saves account profile changes
**When** the request is processed
**Then** only profile fields are mutated
**And** role/outlet mappings remain unchanged unless the access flow is used

**Given** an admin has unsaved changes in one flow
**When** they attempt to leave or close the surface
**Then** a consistent unsaved-change confirmation is shown
**And** no partial data is persisted without explicit confirmation

**Given** keyboard-only or assistive-technology usage
**When** either flow is opened and completed
**Then** focus order, labels, and error announcements conform to WCAG 2.1 AA patterns used across backoffice
**And** all actions are reachable without pointer-only interactions

### Story 9.2: Matrix-Based Outlet-Role Assignment
As an admin,
I want a scalable matrix/grid for outlet-role assignments with bulk actions,
So that I can manage permissions across many outlets efficiently.

**Acceptance Criteria:**

**Given** a user with many outlet-role combinations
**When** the admin opens assignment matrix view
**Then** role/outlet intersections are rendered with clear current-state indicators and sticky headers on large datasets
**And** the layout remains usable at supported desktop and tablet breakpoints

**Given** the admin performs bulk assign/revoke operations
**When** they preview and confirm changes
**Then** the UI shows before/after delta counts and affected outlets/users
**And** save is blocked until validation passes

**Given** an assignment crosses tenant/company boundaries or violates role policy
**When** validation runs client/server side
**Then** the operation is rejected with row-level and summary feedback
**And** no partial cross-tenant assignment is persisted

**Given** assignment changes are submitted
**When** processing completes
**Then** success/failure outcomes include deterministic per-row result states
**And** audit/telemetry events capture actor, target user, delta size, latency, and outcome class for observability

### Story 9.3: Consolidated Row Action Menus
As an admin,
I want user-row actions grouped in dropdown menus,
So that tables remain clean and usable on smaller screens.

**Acceptance Criteria:**

**Given** the user list is displayed on desktop and mobile widths
**When** an admin opens a row action menu
**Then** actions appear in a consistent order and naming convention shared with other backoffice tables
**And** destructive actions are visually distinguished and require confirmation

**Given** role-based restrictions apply
**When** row actions are rendered
**Then** unavailable actions are hidden or disabled according to the global UI standard
**And** inaccessible operations cannot be triggered via direct URL or stale client state

**Given** keyboard and screen-reader users interact with the menu
**When** focus enters, moves, and exits the dropdown
**Then** menu behavior meets WCAG 2.1 AA for focus management, role semantics, and announced state
**And** escape/enter/arrow key behavior is consistent with documented component standards

**Given** action menu usage occurs in production
**When** telemetry is collected
**Then** action-open/action-select/error events are emitted with page, actor role, and outcome metadata
**And** dashboards can detect abnormal error rates or abandoned actions

### Story 9.4: Standard Filters and Modal UX Behavior
As a backoffice user,
I want immediate filters with "Clear All" and consistent modal behavior,
So that I can navigate and edit users faster with predictable interactions.

**Acceptance Criteria:**

**Given** user management filter controls are visible
**When** any filter changes
**Then** results update immediately with debounced, deterministic query behavior
**And** `Clear All` resets every filter and URL query state in one action

**Given** filters are applied and the page is refreshed or shared
**When** the route is re-opened
**Then** filter state is restored from URL/query state
**And** restored state uses the same parsing/validation rules as live interactions

**Given** create/edit/assignment modals are used
**When** save/cancel/close actions occur
**Then** all modals follow one shared behavior for validation messaging, disabled loading states, and close semantics
**And** unsaved-change confirmation is enforced uniformly before dismissal

**Given** modal and filter interactions are exercised via accessibility tools
**When** forms contain errors or async operations complete
**Then** errors and status updates are announced accessibly and focus moves predictably per WCAG 2.1 AA
**And** no critical operation depends on color alone

