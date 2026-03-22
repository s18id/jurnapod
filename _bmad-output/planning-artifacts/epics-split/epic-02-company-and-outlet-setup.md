## Epic 2: Company and Outlet Setup

Business owners can configure company context, outlets, taxes, payment methods, and module activation.

### Story 2.1: Company Settings Profile Management
As a company admin,
I want to update company-level settings (name, legal info, fiscal preferences),
So that all modules use the correct business context.

**Acceptance Criteria:**

**Given** an authenticated user with `company.settings.write` permission for Company A
**When** they submit a valid company settings payload
**Then** the API persists only Company A settings and returns the normalized saved profile
**And** no fields from other companies are read or updated.

**Given** a request payload is missing required fields or has invalid formats (e.g., empty legal name, invalid tax ID format)
**When** validation runs
**Then** the API returns a structured validation error response
**And** no partial settings are saved.

**Given** a user scoped to Company A attempts to update Company B settings
**When** the request is authorized and scoped
**Then** the API rejects the request with an authorization/scope error
**And** an audit record is created with actor, target company, and failure result.

### Story 2.2: Multi-Outlet Lifecycle Management
As an operations manager,
I want to create, edit, activate, and deactivate outlets,
So that I can reflect my real operating locations in the system.

**Acceptance Criteria:**

**Given** an authorized user in Company A
**When** they create an outlet with valid required fields (name, code, timezone)
**Then** the outlet is created under Company A
**And** the outlet appears in Company A outlet list.

**Given** an outlet create/update payload has duplicate code or name within Company A policy scope
**When** the request is validated
**Then** the API returns a conflict error
**And** no duplicate outlet record is stored.

**Given** an authorized user updates outlet status to active or inactive
**When** the request targets an outlet in their company scope
**Then** status is updated successfully
**And** status changes are reflected in subsequent outlet list responses.

**Given** a user attempts to create or modify an outlet in another company
**When** tenant scope checks run
**Then** the request is denied
**And** no cross-tenant write occurs.

### Story 2.3: Outlet-Specific Configuration
As an outlet manager,
I want to configure outlet-specific settings (timezone, receipt fields, default tax/payment behavior),
So that each outlet operates with the right local rules.

**Acceptance Criteria:**

**Given** an authorized user with outlet-config permission for Outlet X in Company A
**When** they submit a valid outlet configuration payload
**Then** the system saves settings scoped to Outlet X only
**And** reads for other outlets are unaffected.

**Given** the payload contains unsupported keys or invalid values (e.g., invalid timezone, malformed receipt template fields)
**When** validation runs
**Then** the API returns a validation error with field-level details
**And** existing outlet configuration remains unchanged.

**Given** a user from Company A attempts to update Outlet Y in Company B
**When** tenant and outlet scope checks run
**Then** the request is rejected
**And** the failed attempt is recorded in audit logs.

### Story 2.4: Tax Rate Configuration with Effective Dating
As a finance admin,
I want to create and maintain tax rates with effective dates,
So that sales calculations remain accurate across tax changes.

**Acceptance Criteria:**

**Given** an authorized finance/admin user in Company A
**When** they create a tax rate with valid name, percentage, and effective start date
**Then** the tax rate is stored under Company A
**And** it is eligible for tax resolution on and after its effective start.

**Given** a tax-rate payload includes invalid percentage or invalid date range (end before start)
**When** validation runs
**Then** the API returns a validation error
**And** no tax rate record is created or updated.

**Given** an update would create overlapping effective windows for the same tax rule scope
**When** overlap checks run
**Then** the API rejects the request with a conflict error
**And** existing active windows remain unchanged.

**Given** a user attempts to read or mutate tax rates outside their company scope
**When** tenant isolation checks are enforced
**Then** access is denied
**And** no cross-company data is returned.

### Story 2.5: Payment Method Configuration
As a company admin,
I want to configure available payment methods and their status,
So that checkout only shows methods my business accepts.

**Acceptance Criteria:**

**Given** an authorized admin in Company A
**When** they create or update a payment method with valid fields (name, type, enabled flag)
**Then** the method is saved under Company A
**And** configuration fetch endpoints return the updated method set.

**Given** a payment method payload is invalid (missing name, unsupported type, duplicate key within company policy)
**When** validation runs
**Then** the API returns a validation/conflict error
**And** no partial payment-method changes are persisted.

**Given** an admin disables an existing payment method
**When** checkout configuration is requested afterward
**Then** the method is excluded from new checkout options
**And** historical transactions that used the method still render correctly.

**Given** a request targets payment methods from another company
**When** tenant scope enforcement runs
**Then** the request is denied
**And** cross-tenant read/write access is prevented.

### Story 2.6: Company Module Enablement Controls
As a business owner,
I want to enable or disable modules per company,
So that my team only sees features that are licensed and operationally needed.

**Acceptance Criteria:**

**Given** an authorized owner/admin in Company A
**When** they enable or disable a module with a valid module key
**Then** module state is persisted for Company A
**And** subsequent capability checks enforce that state at API boundaries.

**Given** a module toggle request contains unknown module keys or invalid payload shape
**When** validation runs
**Then** the API returns a validation error
**And** no module state is changed.

**Given** an admin attempts to disable a module that has blocking dependencies (e.g., active workflows requiring that module)
**When** dependency checks execute
**Then** the API rejects the change with a dependency error
**And** current module state remains unchanged.

**Given** a user from Company A attempts to modify module state for Company B
**When** tenant isolation checks run
**Then** the request is denied
**And** an audit log entry records the denied cross-tenant attempt.

