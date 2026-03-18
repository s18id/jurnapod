## Epic 8: Backoffice Items and Prices UX Refactor

Backoffice users can manage items and prices through clearer, split pages and safer edit workflows.

### Story 8.1: Split Items and Prices into Dedicated Pages
As a backoffice user,
I want separate `/items` and `/prices` pages,
So that I can manage catalog and pricing tasks with less confusion.

**Acceptance Criteria:**

**Given** a user navigates to catalog management
**When** they open `/items`
**Then** the page focuses on item lifecycle actions only (create/edit/deactivate/search) with no price-edit confusion

**Given** a user opens `/prices`
**When** page loads
**Then** pricing hierarchy actions are shown clearly (default vs outlet override) with item context but no item-structure editing

**Given** legacy combined routes are visited
**When** redirect executes
**Then** user lands on the correct new page with preserved intent/filter state where possible

**Given** page headers and navigation are rendered
**When** user scans the UI
**Then** title, breadcrumb, and primary action make task scope explicit on desktop and tablet widths

**Given** deep links are shared/bookmarked
**When** route is reopened
**Then** page state resolves consistently without ambiguous task context

### Story 8.2: Safer Create/Edit Modal Workflows
As a catalog manager,
I want create/edit interactions in explicit modals instead of inline table edits,
So that accidental changes are reduced during browsing.

**Acceptance Criteria:**

**Given** a user starts create/edit from list pages
**When** modal opens
**Then** form fields are isolated from browsing state and edits are not applied until explicit save

**Given** user changes values and attempts close/cancel
**When** unsaved data exists
**Then** a discard-confirmation prompt appears and prevents accidental loss

**Given** validation fails
**When** save is attempted
**Then** field-level errors are shown inline with clear wording
**And** entered values are preserved for correction

**Given** save succeeds
**When** modal closes
**Then** list refreshes deterministically and reflects exactly the committed change once

**Given** keyboard and accessibility interactions are used
**When** modal is navigated
**Then** focus trap, escape behavior, and screen-reader labels follow consistent modal standards

### Story 8.3: Reusable Items and Item-Groups Data Hooks
As a frontend developer,
I want shared `useItems()` and `useItemGroups()` hooks,
So that pages reuse consistent caching, lookup, and refresh behavior.

**Acceptance Criteria:**

**Given** items/prices pages consume catalog data
**When** data is loaded
**Then** both pages use the shared hooks as single sources of fetch/cache/refresh behavior

**Given** mutations occur (create/edit/deactivate/import apply)
**When** mutation succeeds
**Then** hook cache invalidation refreshes dependent views deterministically without duplicate ad-hoc requests

**Given** stale cache or race conditions occur
**When** multiple components request the same dataset
**Then** hook behavior is deduplicated and returns consistent normalized records

**Given** hook errors occur
**When** fetch fails
**Then** a uniform error shape is returned to UI layers for consistent UX messaging

**Given** tenant/outlet context changes
**When** hooks re-run
**Then** old-scope data is cleared and no cross-tenant bleed appears in cache

### Story 8.4: Three-Step Import Wizard for Catalog Data
As an operations admin,
I want a guided import flow (Source -> Preview -> Apply),
So that I can bulk update catalog data with confidence.

**Acceptance Criteria:**

**Given** user uploads a supported file
**When** Source step validates format/schema
**Then** unsupported templates or malformed rows are flagged before preview

**Given** Preview step is shown
**When** row validation completes
**Then** each row displays status (valid/error/warning), error reason, and mapped target fields clearly

**Given** Apply is executed
**When** commit runs
**Then** import applies in an atomic server transaction per defined batch policy
**And** failed apply does not leave partial catalog corruption

**Given** import includes money/price fields
**When** values are parsed
**Then** decimal precision rules are enforced and invalid numeric formats are rejected explicitly

**Given** apply completes
**When** results are displayed
**Then** success/failure counts, downloadable error report, and audit reference id are provided for traceability

### Story 8.5: Pricing Hierarchy Clarity and Deep-Link Support
As a pricing manager,
I want clear default-vs-override visuals and deep-linkable price filters,
So that I can diagnose outlet pricing quickly and share exact views.

**Acceptance Criteria:**

**Given** pricing rows are rendered
**When** both default and outlet override exist
**Then** UI clearly indicates effective price source and precedence using consistent badges/tooltips/labels

**Given** only default price exists
**When** viewing outlet context
**Then** fallback behavior is explicit so users understand why that price is applied

**Given** a user changes outlet/search/filter/sort state
**When** state updates
**Then** URL query params reflect current view and reloading restores identical state

**Given** a shared deep link is opened by an authorized user
**When** page initializes
**Then** filters are applied deterministically and inaccessible scopes are safely rejected

**Given** pricing edits are made from this view
**When** user rechecks hierarchy indicators
**Then** updated effective prices and source labels remain accurate and audit-friendly without ambiguous UI states

