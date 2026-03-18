## Epic 4: Catalog and Pricing Operations

Teams can manage products, item types, and outlet pricing to support daily selling operations.

### Story 4.1: Item Catalog CRUD
As an inventory admin,
I want to create, edit, view, and deactivate items,
So that the sellable catalog stays accurate.

**Acceptance Criteria:**

**Given** an authorized user in Company A
**When** they create an item with valid required fields
**Then** the item is stored under Company A and appears in catalog list responses
**And** response data excludes data from other companies.

**Given** an authorized user updates item fields within allowed mutability rules
**When** they submit a valid update payload
**Then** the item is updated successfully
**And** immutable/system-managed fields are not overwritten.

**Given** create/update payload fails validation (missing required field, invalid enum, duplicate SKU/code by company policy)
**When** validation runs
**Then** the API returns structured validation/conflict errors
**And** no partial writes occur.

**Given** a user attempts CRUD operations on an item outside their company scope
**When** tenant isolation checks execute
**Then** the API denies access
**And** no cross-tenant reads or writes are allowed.

### Story 4.2: Multi-Type Item Model Support
As a product manager,
I want items to support product, service, ingredient, and recipe types,
So that catalog modeling fits different business operations.

**Acceptance Criteria:**

**Given** an authorized user creates or updates an item with type `product`, `service`, `ingredient`, or `recipe`
**When** type-specific schema validation runs
**Then** required fields for that type are enforced
**And** valid type payloads are stored successfully.

**Given** payload includes incompatible field combinations for selected type
**When** validation runs
**Then** the API rejects the request with field-level actionable errors
**And** item data remains unchanged.

**Given** an existing item changes type
**When** the new type violates referential or business constraints
**Then** type change is rejected with a clear constraint error
**And** previous valid type state is preserved.

### Story 4.3: Outlet-Specific Pricing Management
As a pricing manager,
I want to set default prices and outlet overrides,
So that each outlet can sell at the right price.

**Acceptance Criteria:**

**Given** an authorized user in Company A sets a default item price
**When** the payload uses valid money format and precision rules
**Then** default price is stored successfully
**And** price history/audit metadata is captured per policy.

**Given** an authorized user sets an outlet-specific override price for Outlet X in Company A
**When** pricing is resolved for Outlet X
**Then** override price is returned ahead of default fallback
**And** outlets without override continue using default price.

**Given** payload contains invalid money values (negative, too many decimals, overflow) or references an outlet outside Company A
**When** validation and tenant checks run
**Then** request is rejected with validation/scope error
**And** no invalid price record is persisted.

**Given** an override is disabled or removed by policy-supported action
**When** pricing is resolved afterward
**Then** engine falls back to current default price deterministically
**And** historical transactions retain original sold price values.

### Story 4.4: Catalog Safety Rules for Historical Integrity
As an accounting-conscious admin,
I want safe deactivation rules for used items,
So that historical sales and reporting remain intact.

**Acceptance Criteria:**

**Given** an item has references in finalized sales or posted financial documents
**When** an admin attempts hard delete
**Then** the system blocks hard delete with a business-rule error
**And** only deactivation/archive action is allowed.

**Given** an admin deactivates an item that has historical usage
**When** deactivation succeeds
**Then** the item is hidden from new sellable catalog selection
**And** historical documents continue to display original item name, type, and sold price.

**Given** an item has no transactional references and policy permits deletion
**When** admin performs delete action
**Then** delete succeeds safely within tenant scope
**And** audit logs capture actor, item, action, and outcome.

**Given** a user attempts destructive item actions across tenant boundary
**When** tenant isolation checks run
**Then** the request is denied
**And** no cross-company catalog mutation occurs.

