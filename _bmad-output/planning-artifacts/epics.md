---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - '/home/ahmad/jurnapod/_bmad-output/planning-artifacts/prd.md'
  - '/home/ahmad/jurnapod/_bmad-output/planning-artifacts/architecture.md'
  - '/home/ahmad/jurnapod/_bmad-output/planning-artifacts/epics-backoffice-ux.md'
workflowComplete: true
dateCompleted: 2026-03-18
---

# jurnapod - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for jurnapod, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Cashiers can ring up sales with items and quantities.  
FR2: Cashiers can apply discounts to transactions.  
FR3: Cashiers can process multiple payment methods.  
FR4: POS works offline without network connectivity.  
FR5: POS syncs transactions when connectivity is restored.  
FR6: System prevents duplicate transactions during sync.  
FR7: All POS transactions post to journal entries automatically.  
FR8: Users can create manual journal entries.  
FR9: Users can view journal batch history.  
FR10: Users can run trial balance reports.  
FR11: Users can view general ledger reports.  
FR12: Users can log in with email and password.  
FR13: Users have role-based access control (RBAC).  
FR14: Admins can create and manage user accounts.  
FR15: Admins can assign roles to users.  
FR16: Users can manage company settings.  
FR17: Users can manage multiple outlets.  
FR18: Users can configure outlet-specific settings.  
FR19: Users can configure tax rates.  
FR20: Users can configure payment methods.  
FR21: Users can enable/disable modules per company.  
FR22: Users can view sales reports by date range.  
FR23: Users can export reports for accountants.  
FR24: Users can view POS transaction history.  
FR25: Users can manage items/products.  
FR26: Users can set prices per outlet.  
FR27: System supports multiple item types (product, service, ingredient, recipe).

### NonFunctional Requirements

NFR1: POS transaction processing must complete in under 1 second.  
NFR2: Sync operations must complete within 30 seconds when online.  
NFR3: Standard report generation should complete in under 5 seconds.  
NFR4: Standard CRUD API responses should be under 500ms.  
NFR5: All data in transit must be encrypted (TLS 1.2+).  
NFR6: Passwords must be hashed with Argon2id (or bcrypt for legacy compatibility).  
NFR7: JWT tokens must support configurable expiry and secure validation.  
NFR8: RBAC must be enforced at API boundaries.  
NFR9: Financial data changes must have an audit trail.  
NFR10: Journal transactions must be ACID-compliant and atomic.  
NFR11: Sync protocol must be idempotent and duplicate-safe via client_tx_id.  
NFR12: Journal entries must be immutable; corrections use explicit reversal/adjustment flows.  
NFR13: Multi-outlet and multi-user scale must be supported with 10x growth headroom.  
NFR14: New cashiers should be trainable in under 30 minutes.  
NFR15: POS UX must be tablet-optimized and backoffice desktop-responsive.  
NFR16: Availability target is 99.9% during business hours.  
NFR17: POS must support up to 7 days of offline operation with queued sync.  
NFR18: Recovery targets are RTO 4 hours and RPO 1 hour.  
NFR19: Critical-path automated test coverage target is 80%+ (auth, sync, posting).  
NFR20: Backoffice must meet WCAG 2.1 AA accessibility requirements.

### Additional Requirements

- Brownfield continuation: architecture and implementation must extend existing modular monorepo patterns; no greenfield starter template is specified.
- Accounting/GL is the source of truth: posted business events must reconcile to journal batches and lines.
- POS remains offline-first with outbox + IndexedDB + idempotent sync via `client_tx_id`.
- Tenant isolation is mandatory: enforce `company_id` and `outlet_id` scoping in schema, services, and APIs.
- Money handling must use deterministic decimal strategy (`DECIMAL` in DB, no FLOAT/DOUBLE for money).
- Financial writes must be transactionally atomic; no partial posting.
- Immutable correction model required for finalized financial records (VOID/REFUND vs silent mutation).
- Migrations must be MySQL/MariaDB portable, rerunnable, and guarded via `information_schema` where needed.
- Shared contracts and validation should be centralized in `packages/shared` using Zod.
- Architecture recommendations to factor common cross-cutting logic into reusable packages (`@jurnapod/sync`, `@jurnapod/posting`) should be considered in epic design.
- Critical test-path coverage must include: offline sync idempotency, POS-to-GL correctness, tenant isolation, and refund/void correction integrity.
- API error envelopes and response consistency should be standardized as part of implementation quality.

### UX Design Requirements

UX-DR1: Split the current combined items/prices experience into dedicated `/items` and `/prices` pages with clear task separation.  
UX-DR2: Replace inline editing with explicit create/edit modals for safer browsing and reduced accidental edits.  
UX-DR3: Implement reusable `useItems()` hook with shared caching and refresh semantics across pages.  
UX-DR4: Implement reusable `useItemGroups()` hook with fast lookup mapping and shared state usage.  
UX-DR5: Build a reusable 3-step `ImportWizard` (Source -> Preview -> Apply) with row-level validation feedback and progress reporting.  
UX-DR6: Add clear pricing hierarchy visuals (default vs outlet override) including status badges/tooltips and significance cues.  
UX-DR7: Update backoffice routing/navigation to support cross-links between items and prices and redirect legacy routes safely.  
UX-DR8: Add deep-link support for pricing views (e.g., outlet-filter query parameters).  
UX-DR9: Redesign user management by separating account data editing from role/outlet assignment workflows.  
UX-DR10: Replace outlet-role accordion interactions with a scalable matrix/grid assignment UI supporting bulk operations.  
UX-DR11: Consolidate per-row user actions into dropdown menus for cleaner tables and better mobile usability.  
UX-DR12: Standardize filters with immediate application behavior and a universal "Clear All" action.  
UX-DR13: Normalize modal UX patterns (focused scope, validation clarity, cancel/save behavior, unsaved-change confirmation).  
UX-DR14: Create reusable `PageHeader` component with consistent title/action layout and responsive behavior.  
UX-DR15: Create reusable `FilterBar` component with configurable field types and consistent behavior across pages.  
UX-DR16: Standardize table interaction patterns across high-traffic pages (actions, empty states, loading states, pagination, sorting).  
UX-DR17: Add breadcrumb navigation for nested/deep pages with clear hierarchy and contextual back-navigation.  
UX-DR18: Document backoffice UI standards (page structure, header/filter/table/modal/form/action patterns) for future consistency.

### FR Coverage Map

FR1: Epic 3 - Core POS transaction capture (items/quantities) in cashier workflows.
FR2: Epic 3 - Discount application in POS checkout flow.
FR3: Epic 3 - Multi-method payment handling in POS; Epic 11 adds reliability/performance hardening.
FR4: Epic 3 - Offline-first POS operation; Epic 11 adds resilience guardrails and failure-mode validation.
FR5: Epic 3 - Reconnect sync workflow; Epic 11 adds sync reliability and observability hardening.
FR6: Epic 3 - Duplicate prevention via idempotent sync; Epic 11 reinforces anti-duplication confidence under stress.
FR7: Epic 5 - POS-to-GL posting and journal linkage; Epic 7 extends sales domain posting use cases; Epic 11 hardens correctness SLOs.
FR8: Epic 5 - Manual journal entry capability.
FR9: Epic 5 - Journal batch history visibility.
FR10: Epic 6 - Trial balance reporting; Epic 11 adds reporting reliability/performance guardrails.
FR11: Epic 6 - General ledger reporting; Epic 11 adds reliability/performance guardrails.
FR12: Epic 1 - Email/password authentication foundation.
FR13: Epic 1 - RBAC authorization model and enforcement baseline.
FR14: Epic 1 - Admin user creation/management; Epic 9 improves UX and workflow safety.
FR15: Epic 1 - Role assignment baseline; Epic 9 improves outlet-role usability.
FR16: Epic 2 - Company settings management and governance.
FR17: Epic 2 - Multi-outlet management setup.
FR18: Epic 2 - Outlet-specific configuration handling.
FR19: Epic 2 - Tax rate configuration.
FR20: Epic 2 - Payment method configuration.
FR21: Epic 2 - Module enablement/disablement per company.
FR22: Epic 6 - Sales reporting and views; Epic 10 improves consistency/UX discoverability.
FR23: Epic 6 - Report export capabilities.
FR24: Epic 6 - POS transaction history visibility; Epic 10 improves standardization and navigation.
FR25: Epic 4 - Item/product lifecycle management; Epic 8 improves backoffice UX workflows.
FR26: Epic 4 - Outlet-level pricing operations; Epic 8 improves price-management UX clarity.
FR27: Epic 4 - Support for multiple item types across catalog model.

## Epic List

### Epic 1: Authentication and Access Foundation
Users can securely authenticate and operate with role-appropriate permissions across the platform.
**FRs covered:** FR12, FR13, FR14, FR15

### Epic 2: Company and Outlet Setup
Business owners can configure company context, outlets, taxes, payment methods, and module activation.
**FRs covered:** FR16, FR17, FR18, FR19, FR20, FR21

### Epic 3: Core POS Transactions (Offline-First)
Cashiers can run complete POS transactions reliably offline with safe reconnect sync and duplicate prevention.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6

### Epic 4: Catalog and Pricing Operations
Teams can manage products, item types, and outlet pricing to support daily selling operations.
**FRs covered:** FR25, FR26, FR27

### Epic 5: Accounting and Journal Operations
Accounting users can post business events to GL, create journals, and maintain ledger integrity.
**FRs covered:** FR7, FR8, FR9

### Epic 6: Financial Reporting and Audit Visibility
Owners and accountants can view core financial reports and export data for oversight and compliance.
**FRs covered:** FR10, FR11, FR22, FR23, FR24

### Epic 7: Sales and Invoicing Expansion
Teams can execute broader sales/invoicing flows while preserving posting correctness and financial traceability.
**FRs covered:** FR7 (extended), FR22 (extended), FR24 (extended)

### Epic 8: Backoffice Items and Prices UX Refactor
Backoffice users can manage items and prices through clearer, split pages and safer edit workflows.
**FRs covered:** FR25, FR26 (UX refinement)

### Epic 9: Backoffice User Management UX Simplification
Admins can manage users, roles, and outlet assignments with lower cognitive load and clearer actions.
**FRs covered:** FR14, FR15 (UX refinement)

### Epic 10: Backoffice Consistency and Navigation Standards
Users experience consistent page structure, filtering, table behavior, and navigation context across backoffice.
**FRs covered:** FR22, FR24 (UX consistency support)

### Epic 11: Operational Trust and Scale Readiness
Users and operators gain confidence from measurable reliability, accessibility, and performance hardening of critical flows.
**FRs covered:** FR3, FR4, FR5, FR6, FR7, FR10, FR11 (NFR-driven hardening)

## Epic 1: Authentication and Access Foundation

Users can securely authenticate and operate with role-appropriate permissions across the platform.

### Story 1.1: User Login with Email and Password

As a registered user,
I want to log in with email and password,
So that I can access Jurnapod features based on my role and tenant scope.

**Acceptance Criteria:**

**Given** a user has an active account with a valid email and password
**When** they submit credentials to the login endpoint
**Then** the system authenticates successfully and returns an access token and refresh token
**And** the response includes user identity context needed by the client (role, company scope, outlet scope where applicable)

**Given** a user submits an incorrect password or unknown email
**When** login is attempted
**Then** authentication is rejected with a generic error response
**And** the response does not reveal whether the email exists

**Given** a user account is inactive/disabled
**When** valid credentials are submitted
**Then** login is rejected
**And** no tokens are issued

**Given** login succeeds
**When** tokens are issued
**Then** access token expiry follows configured policy
**And** refresh token expiry follows configured policy

**Given** a login attempt is processed
**When** authentication succeeds or fails
**Then** security-relevant audit information is recorded according to current audit policy
**And** sensitive fields (plaintext password, raw secrets) are never logged

**Given** the login request payload is malformed (missing email/password or invalid shape)
**When** the request is validated
**Then** the API returns a validation error envelope consistent with project response conventions

**Given** concurrent login attempts for the same account
**When** multiple valid requests are submitted
**Then** each request is handled safely without corrupting auth/session state
**And** no tenant scope leakage occurs between sessions

### Story 1.2: JWT Session and Refresh Management

As an authenticated user,
I want secure access/refresh token lifecycle management,
So that I can stay signed in safely without frequent re-login.

**Acceptance Criteria:**

**Given** a user has a valid refresh token
**When** they call the refresh endpoint
**Then** a new access token is issued with configured expiry
**And** the token is signed and verifiable by the existing auth middleware

**Given** a refresh token is expired, malformed, revoked, or signed with an invalid key
**When** refresh is attempted
**Then** the request is rejected with an auth error
**And** no new access token is issued

**Given** token refresh succeeds
**When** token rotation policy is enabled
**Then** the system rotates refresh tokens according to configured policy
**And** previously invalidated token artifacts cannot be replayed

**Given** a user logs out
**When** logout is processed
**Then** local/session auth state is cleared on the client contract path
**And** server-side token invalidation behavior follows current project policy

**Given** multiple concurrent refresh attempts for the same session
**When** requests race
**Then** the system behaves deterministically and safely
**And** does not create inconsistent auth state or tenant leakage

**Given** auth token handling is implemented
**When** requests target protected APIs
**Then** expired/invalid access tokens are rejected consistently
**And** valid tokens pass through role/tenant checks without bypass

**Given** auth lifecycle events occur (refresh success/failure, logout, invalid token)
**When** they are recorded
**Then** audit/security logs capture required metadata without leaking token secrets

### Story 1.3: RBAC Enforcement at API Boundaries

As a system administrator,
I want role-based authorization enforced on protected endpoints,
So that users can only perform actions permitted by their assigned roles.

**Acceptance Criteria:**

**Given** a protected API endpoint has required permission rules
**When** a request is made with a valid token from a user lacking required role/permission
**Then** the API rejects the request with an authorization error
**And** no protected action is executed

**Given** a request is made by a user with appropriate role/permission
**When** the request passes auth middleware
**Then** the endpoint executes successfully within the user's allowed scope
**And** response data respects tenant boundaries

**Given** a role is intended to be read-only for a resource
**When** that role attempts create/update/delete operations
**Then** write operations are denied
**And** read operations remain permitted where configured

**Given** endpoint-level RBAC is configured
**When** new endpoints are added
**Then** they must explicitly declare authorization requirements
**And** missing/undefined authorization configuration fails safely (deny-by-default)

**Given** cross-tenant data exists
**When** an authorized user accesses APIs
**Then** company/outlet scoping still applies after RBAC checks
**And** no cross-company leakage is possible

**Given** authorization decisions are made
**When** access is denied for permission reasons
**Then** audit/security logs capture actor, endpoint, and denial reason class
**And** logs avoid leaking sensitive payload data

### Story 1.4: Admin User Management CRUD

As an admin,
I want to create, view, update, and deactivate user accounts,
So that I can control who has access to the system.

**Acceptance Criteria:**

**Given** an authenticated admin with user-management permission
**When** they submit valid create-user data (email, role baseline, company context)
**Then** a new user account is created successfully
**And** required defaults (status, timestamps, tenant linkage) are set correctly

**Given** a create-user request uses an email already in use within restricted uniqueness scope
**When** validation runs
**Then** creation is rejected with a clear validation/conflict error
**And** no duplicate account is persisted

**Given** an admin requests the user list
**When** list API is called
**Then** only users within the admin's permitted tenant scope are returned
**And** sensitive fields (password hash, secrets) are never exposed

**Given** an admin edits allowed user fields
**When** update is submitted with valid payload
**Then** user data is updated successfully
**And** immutable/security-sensitive fields remain protected by policy

**Given** an admin deactivates a user
**When** deactivation is processed
**Then** user status changes to inactive (or equivalent soft-disable state)
**And** disabled users can no longer authenticate

**Given** a non-admin or unauthorized actor calls user-management endpoints
**When** request is evaluated
**Then** access is denied consistently by RBAC
**And** no user state is changed

**Given** admin CRUD operations succeed or fail
**When** events are recorded
**Then** audit logs capture actor, target user, operation type, and outcome class
**And** logs exclude sensitive credential material

### Story 1.5: Admin Role Assignment

As an admin,
I want to assign and update user roles,
So that access permissions match each user's responsibility.

**Acceptance Criteria:**

**Given** an authenticated admin with role-management permission
**When** they assign a valid role to a user
**Then** the user-role mapping is persisted successfully
**And** changes become effective for authorization checks on subsequent requests

**Given** a role assignment payload contains unsupported/invalid roles
**When** validation is performed
**Then** the request is rejected with a clear validation error
**And** no partial role assignment is saved

**Given** outlet-scoped role assignment is required
**When** admin assigns role with outlet context
**Then** role linkage respects company/outlet boundaries
**And** cross-tenant or cross-company assignments are rejected

**Given** a user has existing roles
**When** admin updates or removes role assignments
**Then** obsolete permissions are revoked consistently
**And** effective permissions reflect the latest persisted role state

**Given** a user's role changes reduce their permissions
**When** they attempt previously allowed operations
**Then** access is denied per updated RBAC rules
**And** no stale permission cache allows bypass

**Given** role assignment actions are performed
**When** operations succeed or fail
**Then** audit logs capture actor, target user, role delta, scope (global/outlet), and outcome class
**And** logs avoid sensitive data exposure

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

## Epic 3: Core POS Transactions (Offline-First)

Cashiers can run complete POS transactions reliably offline with safe reconnect sync and duplicate prevention.

### Story 3.1: POS Cart Item and Quantity Capture
As a cashier,
I want to add items and quantities to a cart,
So that I can build a customer sale quickly and accurately.

**Acceptance Criteria:**

**Given** a cashier is assigned to Outlet X and has access to active sellable items for Outlet X
**When** they add or remove items and change quantities in cart
**Then** line totals and cart subtotal recalculate deterministically using configured decimal rules
**And** only Outlet X catalog/pricing data is used.

**Given** quantity input is zero, negative, non-numeric, or exceeds configured limits
**When** the cashier attempts to apply the quantity
**Then** the cart rejects the change with inline validation feedback
**And** no invalid line state is persisted.

**Given** a cashier attempts to add an inactive or cross-company item ID
**When** item validation and tenant checks run
**Then** the request is rejected
**And** the cart state remains unchanged.

### Story 3.2: Transaction Discount Application
As a cashier,
I want to apply line or order discounts within allowed rules,
So that I can honor promotions or manager-approved adjustments.

**Acceptance Criteria:**

**Given** a valid cart and cashier permission to apply discounts within configured limits
**When** a valid line-level or order-level discount is applied
**Then** totals are recalculated correctly and discount metadata (type, value, reason) is stored on draft transaction
**And** discount math uses deterministic decimal rounding rules.

**Given** a discount value is invalid (negative, exceeds policy cap, or makes total below allowed floor)
**When** validation runs
**Then** the discount is rejected with a validation error
**And** no checkout submission is allowed with invalid discount state.

**Given** a discount requires higher permission than the cashier has
**When** the cashier attempts to apply it
**Then** the request is denied with a permission error
**And** no unauthorized discount is saved.

### Story 3.3: Multi-Method Payment Checkout
As a cashier,
I want to split payment across multiple methods,
So that customers can pay using mixed tender.

**Acceptance Criteria:**

**Given** a finalized cart amount and enabled payment methods for the outlet/company
**When** the cashier submits one or more payment allocations
**Then** checkout succeeds only if sum(payments) equals payable total
**And** each payment leg is recorded with method, amount, and reference metadata.

**Given** payment allocations underpay, overpay beyond allowed policy, or include disabled/unknown methods
**When** checkout validation runs
**Then** checkout is rejected with explicit balance/method errors
**And** no partial sale record is created.

**Given** a payload includes payment methods from another company configuration scope
**When** tenant and method scope checks run
**Then** checkout is denied
**And** no cross-tenant payment configuration is accepted.

### Story 3.4: Offline Transaction Commit and Outbox Queueing
As a cashier,
I want POS to complete sales while offline,
So that I can keep serving customers during network outages.

**Acceptance Criteria:**

**Given** device connectivity is unavailable
**When** cashier completes a valid checkout
**Then** the sale is committed to local storage with a durable unique `client_tx_id`
**And** an outbox record is created in `pending` state for sync.

**Given** POS app restarts after offline checkouts
**When** local state is reloaded
**Then** unsynced transactions and outbox records are recovered intact
**And** no duplicate local transactions are created during recovery.

**Given** local persistence fails (storage quota/error/corruption detection) during offline commit
**When** checkout attempts to persist transaction and outbox
**Then** commit is aborted with a recoverable error to cashier
**And** no half-written transaction/outbox state is left behind.

### Story 3.5: Reconnect Sync with Idempotent Duplicate Prevention
As a store operator,
I want queued offline transactions to sync safely on reconnect,
So that I avoid lost sales and duplicate postings.

**Acceptance Criteria:**

**Given** outbox contains unsynced transactions with stable `client_tx_id` values
**When** connectivity returns and sync runs
**Then** each outbox record is submitted and acknowledged transactionally
**And** successful records are marked synced with server reference.

**Given** sync retries occur due to timeout/network interruption
**When** the same payload with identical `client_tx_id` is resent
**Then** server returns idempotent success semantics
**And** no duplicate transaction or duplicate posting is created.

**Given** server rejects a record due to validation or tenant-scope mismatch
**When** sync processes that record
**Then** the record is marked failed with actionable error code/message
**And** failed records are not retried infinitely without operator intervention policy.

**Given** outbox contains records from multiple outlets assigned to the same company
**When** sync executes for Outlet X context
**Then** only records in allowed outlet/company scope are processed
**And** cross-outlet or cross-company leakage is prevented.

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

## Epic 5: Accounting and Journal Operations

Accounting users can post business events to GL, create journals, and maintain ledger integrity.

### Story 5.1: Automatic POS-to-Journal Posting
As a finance owner,
I want each finalized POS sale to create journal entries automatically,
So that the ledger is always up to date without manual re-entry.

**Acceptance Criteria:**

**Given** a POS transaction is finalized in company/outlet scope and has a unique `client_tx_id`
**When** posting is triggered
**Then** exactly one journal batch is created for that business event (idempotent by source reference)
**And** the batch is linked to the POS transaction with immutable source metadata (document id, outlet, cashier, posted_at)

**Given** posting creates journal lines
**When** lines are persisted
**Then** total debits equal total credits using deterministic decimal math
**And** no `FLOAT`/`DOUBLE` values are used for money fields

**Given** an infrastructure or validation failure occurs during posting
**When** the transaction boundary completes
**Then** all posting writes are rolled back atomically
**And** no partial batch, orphan lines, or half-linked source references remain

**Given** a replay/retry arrives for the same source POS transaction
**When** posting is re-invoked
**Then** the system returns the existing posting result without creating duplicate batches or lines

**Given** posting succeeds or fails
**When** audit is recorded
**Then** audit logs contain actor/system identity, source reference, outcome, and error class (if failed)
**And** logs exclude sensitive payload data and preserve tenant isolation

### Story 5.2: Manual Journal Entry Creation
As an accountant,
I want to create manual journal entries,
So that I can record non-POS financial adjustments.

**Acceptance Criteria:**

**Given** an authorized accounting user submits a manual journal payload
**When** validation runs
**Then** account ids, company scope, posting date, and line schema are validated before write
**And** cross-company or unauthorized account references are rejected

**Given** journal lines are valid
**When** totals are computed
**Then** debit total must equal credit total exactly at configured precision
**And** zero-value or logically invalid lines are rejected with clear validation messages

**Given** the entry passes validation
**When** posting is committed
**Then** batch header, lines, and source metadata are persisted in one atomic database transaction
**And** the resulting batch status is `POSTED` only after all writes succeed

**Given** posting fails at any point
**When** commit is attempted
**Then** no journal header/line artifacts are left behind
**And** the API returns a consistent error envelope with a recoverable message

**Given** a manual journal is posted
**When** audit is queried
**Then** audit records include actor, reason/narration, account set, and timestamp
**And** subsequent edits to posted lines are blocked by immutability rules

### Story 5.3: Journal Batch History and Detail View
As an accountant,
I want to browse journal batch history and inspect details,
So that I can trace financial changes over time.

**Acceptance Criteria:**

**Given** journal batches exist for a tenant
**When** the user opens history
**Then** list results are filtered strictly by authorized company (and outlet, where applicable)
**And** each row shows batch id, posting date, source type/reference, status, totals, and creator

**Given** a user opens a batch detail
**When** detail is loaded
**Then** header and line data reconcile (sum of lines equals batch totals)
**And** source-link navigation to originating document is available when reference exists

**Given** filters/pagination are applied
**When** the user navigates pages
**Then** ordering and pagination are stable and deterministic
**And** no records are skipped or duplicated between pages under the same filter set

**Given** unauthorized access is attempted
**When** a user requests another tenant's batch id
**Then** access is denied without leaking batch existence or metadata

**Given** history/detail views are used for audit workflows
**When** exported/printed values are reviewed
**Then** displayed monetary values retain ledger precision and sign conventions consistently

### Story 5.4: Journal Correction via Reversal/Adjustment Flow
As a finance admin,
I want corrections to happen through explicit reversal/adjustment entries,
So that finalized journals remain immutable and auditable.

**Acceptance Criteria:**

**Given** a posted journal requires correction
**When** an authorized user initiates correction
**Then** the original posted batch remains immutable
**And** correction is performed only through linked reversal and/or adjustment entries

**Given** a full reversal is selected
**When** reversal is posted
**Then** new lines mirror original accounts with opposite debit/credit directions and equal amounts
**And** reversal metadata links to the original batch id and correction reason code

**Given** an adjustment is selected
**When** adjustment is posted
**Then** only net corrective impact is posted in a new batch
**And** the chain original -> reversal/adjustment remains queryable end-to-end

**Given** required correction reason/reference fields are missing
**When** correction is submitted
**Then** the request is rejected before any write occurs

**Given** correction posting succeeds or fails
**When** audit is reviewed
**Then** audit includes actor, correction type, reason, linked batch ids, and outcome
**And** duplicate correction requests for the same action are handled idempotently

## Epic 6: Financial Reporting and Audit Visibility

Owners and accountants can view core financial reports and export data for oversight and compliance.

### Story 6.1: Trial Balance Report
As an accountant,
I want to run trial balance by date range,
So that I can verify debits and credits remain balanced.

**Acceptance Criteria:**

**Given** a valid company scope and date range
**When** trial balance is generated
**Then** opening, movement, and closing balances are computed from posted journal entries only
**And** total debits equal total credits at report precision

**Given** filters include outlet/dimension constraints
**When** report runs
**Then** results reflect only authorized scoped data
**And** cross-tenant data is never included

**Given** no activity exists in period
**When** report is requested
**Then** the API returns a valid empty-state report (not an error) with explicit zero totals

**Given** invalid date ranges or malformed filters
**When** validation runs
**Then** request fails with clear field-level guidance and consistent error envelope

**Given** the same filters are re-run
**When** report is regenerated
**Then** totals and row ordering are deterministic and reproducible for audit use

### Story 6.2: General Ledger Report with Drill-Down
As an accountant,
I want to view general ledger movements per account,
So that I can inspect transaction-level posting activity.

**Acceptance Criteria:**

**Given** an authorized user selects account and period filters
**When** the report is generated
**Then** each account view includes opening balance, ordered movements, and closing balance
**And** opening + net movement equals closing

**Given** movement rows are returned
**When** user drills down
**Then** each row links to source journal batch/line and originating business document where available
**And** debit/credit signage is consistent with chart-of-accounts rules

**Given** pagination is required
**When** pages are requested
**Then** result order is stable (date, batch, line tie-breakers) and audit-safe across page boundaries

**Given** unauthorized account or tenant scope is requested
**When** access check runs
**Then** request is denied without exposing account existence in other tenants

**Given** report generation hits transient failure
**When** error is returned
**Then** no partial/corrupt dataset is cached as success
**And** user receives a recoverable retry path

### Story 6.3: Sales Report by Date Range
As a business owner,
I want sales summaries for chosen date ranges,
So that I can monitor outlet performance and trends.

**Acceptance Criteria:**

**Given** valid date/outlet filters in authorized scope
**When** sales report runs
**Then** gross sales, discounts, taxes, net sales, payments, and void/refund impact are computed deterministically
**And** totals tie back to underlying finalized POS/invoice records

**Given** an outlet comparison view is requested
**When** grouped totals are returned
**Then** each outlet subtotal and grand total reconcile exactly

**Given** finalized records are corrected via void/refund flows
**When** period totals are recalculated
**Then** report reflects correction semantics explicitly (not silent mutation)

**Given** invalid filter combinations (future-only range, start > end, unauthorized outlet)
**When** request is validated
**Then** report is rejected with clear UX guidance and no server error

**Given** report values are displayed
**When** user inspects monetary fields
**Then** formatting and rounding are consistent with accounting precision and locale rules

### Story 6.4: Accountant-Friendly Report Export
As an accountant,
I want to export reports in common formats,
So that I can share and reconcile data externally.

**Acceptance Criteria:**

**Given** a report view is already filtered in UI/API
**When** export is requested
**Then** exported rows and totals match the on-screen dataset exactly
**And** export metadata includes report type, filters, generated_at, and tenant context

**Given** CSV/XLSX (or supported formats) are provided
**When** file is generated
**Then** column schema, signs, decimal precision, and date formats are stable and documented

**Given** large datasets are exported
**When** generation runs
**Then** operation completes within platform limits or fails gracefully with retry instructions
**And** no partial file is marked successful

**Given** unauthorized export is attempted
**When** permission and scope checks run
**Then** request is denied consistently with report-access rules

**Given** export succeeds/fails
**When** audit is reviewed
**Then** audit log includes actor, report type, filter hash/summary, format, and outcome

### Story 6.5: POS Transaction History and Search
As an auditor,
I want to search POS transaction history,
So that I can investigate operational and financial events.

**Acceptance Criteria:**

**Given** transaction data exists in user scope
**When** filters are applied (date, outlet, status, reference, cashier, amount range)
**Then** matching records are returned with stable pagination and deterministic sort

**Given** a transaction row is opened
**When** detail view loads
**Then** it shows payment breakdown, tax/discount components, sync state, and posting/journal linkage fields

**Given** offline/retry behavior occurred
**When** history is inspected
**Then** duplicate-safe semantics are visible via `client_tx_id` and server transaction references

**Given** a user requests unauthorized tenant/outlet records
**When** query executes
**Then** those records are excluded and direct-id access is denied safely

**Given** history supports audit workflows
**When** values are exported or copied
**Then** identifiers and monetary totals remain consistent with ledger-linked records

## Epic 7: Sales and Invoicing Expansion

Teams can execute broader sales/invoicing flows while preserving posting correctness and financial traceability.

### Story 7.1: Draft Invoice Creation
As a sales admin,
I want to create draft invoices with customer, items, and terms,
So that I can prepare billable sales before finalization.

**Acceptance Criteria:**

**Given** an authorized user enters invoice header and line details
**When** save-draft is submitted
**Then** invoice is persisted in `DRAFT` status only (no GL posting yet)
**And** totals, taxes, discounts, due date, and currency are computed deterministically

**Given** draft numbering is configured
**When** draft is created
**Then** a unique reference number is assigned according to company sequence policy

**Given** required fields are missing or line math is invalid
**When** validation runs
**Then** save is rejected with actionable field-level errors and no partial writes

**Given** concurrent updates happen on the same draft
**When** save conflicts are detected
**Then** conflict is handled explicitly (version/updated_at check) to prevent silent overwrite

**Given** draft save succeeds/fails
**When** audit is queried
**Then** actor, action, invoice id/reference, and outcome are recorded

### Story 7.2: Invoice Finalization and Ledger Posting
As an accountant,
I want finalized invoices to post to GL automatically,
So that receivables and revenue stay synchronized with source documents.

**Acceptance Criteria:**

**Given** a valid `DRAFT` invoice is ready for issuance
**When** finalization is requested
**Then** invoice status transition and GL posting occur in one atomic transaction boundary
**And** finalized invoice cannot return to mutable draft fields

**Given** posting lines are generated
**When** journal is created
**Then** debit/credit totals are balanced and linked to invoice id/reference with immutable metadata

**Given** posting fails (validation/infra)
**When** finalization transaction ends
**Then** invoice remains in recoverable pre-final state
**And** no partial journal artifacts exist

**Given** finalization request is retried/replayed
**When** the same invoice finalization key/action is received
**Then** operation is idempotent and does not create duplicate postings

**Given** finalization succeeds/fails
**When** audit is reviewed
**Then** transition details, actor, timestamp, and linked batch ids are captured

### Story 7.3: Invoice Payment Application and Balance Tracking
As a cashier or AR clerk,
I want to apply partial and full payments to invoices,
So that outstanding balances are tracked accurately.

**Acceptance Criteria:**

**Given** an issued invoice has open balance
**When** a payment is applied with valid method/reference/date
**Then** payment record is persisted and invoice balance updates exactly
**And** status transitions follow rules (`ISSUED` -> `PARTIALLY_PAID` -> `PAID`)

**Given** payment would exceed allowed balance policy
**When** validation runs
**Then** overpayment is rejected (or handled per explicit overpayment policy) without corrupting balance state

**Given** duplicate/replayed payment request is received
**When** idempotency key/reference matches prior success
**Then** system returns existing result and does not double-apply payment

**Given** payment posting to GL is required
**When** payment is committed
**Then** AR/cash journal impact is posted atomically with payment record
**And** failures roll back both accounting and operational writes

**Given** payments are created/voided/reversed
**When** audit trail is reviewed
**Then** all balance-affecting events are traceable with actor, reason, and linkage to invoice/payment ids

### Story 7.4: Invoice List, History, and Sales Visibility
As a business owner,
I want to view and filter invoice history,
So that I can monitor billed sales alongside POS activity.

**Acceptance Criteria:**

**Given** invoices exist across statuses and periods
**When** filters/search/sort are applied
**Then** list results are scoped to authorized tenant/outlet rules with stable pagination

**Given** a user opens invoice detail from list
**When** detail loads
**Then** it shows customer, lines, totals, payments, outstanding balance, and journal links

**Given** invoices are voided/canceled/adjusted
**When** history is viewed
**Then** those states remain visible with clear reason and timestamps for auditability
**And** records are never silently removed from operational history

**Given** summary totals are shown in list views
**When** filtered dataset changes
**Then** displayed totals reconcile with visible records and preserve decimal precision

**Given** unauthorized access is attempted
**When** another tenant's invoice id/reference is queried
**Then** access is denied without metadata leakage

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

## Epic 10: Backoffice Consistency and Navigation Standards

Users experience consistent page structure, filtering, table behavior, and navigation context across backoffice.

### Story 10.1: Reusable PageHeader Component
As a frontend developer,
I want a shared `PageHeader` component,
So that backoffice pages present title and primary actions consistently.

**Acceptance Criteria:**

**Given** target pages adopt `PageHeader`
**When** rendered across supported breakpoints
**Then** title, subtitle, breadcrumb slot, and action placement follow one canonical responsive layout
**And** optional regions collapse gracefully without spacing or alignment regressions

**Given** pages have long titles, many actions, or no subtitle
**When** content exceeds ideal width
**Then** truncation/wrapping behavior follows documented standards without obscuring primary actions
**And** layout remains stable during loading/skeleton states

**Given** assistive technology users navigate the page
**When** the header is read or focused
**Then** heading hierarchy and landmark semantics are valid and consistent across pages
**And** all actionable controls have accessible names and visible focus states

**Given** component adoption is tracked
**When** new or refactored pages are merged
**Then** nonconforming custom headers are flagged by lint/review guidance
**And** adoption/exception counts are observable in engineering quality reporting

### Story 10.2: Reusable FilterBar Component
As a frontend developer,
I want a configurable shared `FilterBar`,
So that filtering behavior is consistent across report and history pages.

**Acceptance Criteria:**

**Given** a page defines filter schema/config
**When** `FilterBar` renders
**Then** supported field types (text/select/date/range/status) behave consistently for input, validation, and reset
**And** query serialization is deterministic across pages

**Given** users apply, clear, or combine filters
**When** requests are sent
**Then** request payload shape and URL state follow shared contracts
**And** invalid combinations are blocked with uniform, actionable error messaging

**Given** keyboard and screen-reader interaction
**When** users traverse and submit filter controls
**Then** label association, help/error text, and focus order satisfy WCAG 2.1 AA
**And** status changes (results updated/empty/error) are announced accessibly

**Given** filter operations run in production
**When** observability events are emitted
**Then** apply/clear/error latency and failure metrics are captured by page and filter type
**And** alerts trigger on sustained elevated filter-error rates

### Story 10.3: Standardized Table Interaction Patterns
As a backoffice user,
I want consistent table behavior across high-traffic pages,
So that I can use lists without relearning controls each time.

**Acceptance Criteria:**

**Given** standardized pages use the table pattern
**When** users load, sort, paginate, select rows, or encounter empty/error states
**Then** controls, labels, and placements match the documented standard exactly
**And** retry/refresh affordances are always available for recoverable errors

**Given** server-side pagination and sorting are active
**When** filters or sort keys change
**Then** table state transitions are deterministic (including page reset rules)
**And** stale response races do not overwrite newer user intent

**Given** dense datasets and slow networks
**When** loading states are shown
**Then** skeleton/loading indicators prevent layout shift and preserve context
**And** perceived responsiveness stays within agreed UX thresholds for standard CRUD/list APIs

**Given** accessibility conformance is tested
**When** users navigate tables via keyboard/screen readers
**Then** header associations, sortable-state announcements, row action semantics, and focus behavior meet WCAG 2.1 AA
**And** no interaction relies only on hover or pointer gestures

### Story 10.4: Breadcrumb Navigation and UI Standards Documentation
As a product team member,
I want breadcrumbs and documented UI standards,
So that navigation context and future implementation consistency are maintained.

**Acceptance Criteria:**

**Given** nested backoffice routes exist
**When** a user navigates into deeper pages
**Then** breadcrumb trails show accurate hierarchy and current location without ambiguity
**And** breadcrumb links preserve relevant context parameters when navigating upward

**Given** users arrive via deep link, reload, or browser back/forward
**When** route state is reconstructed
**Then** breadcrumb and page context remain correct and consistent
**And** no dead-end navigation states are introduced

**Given** UI standards documentation is published in-repo
**When** developers implement or review new pages
**Then** standards cover header/filter/table/modal/form/action patterns with do/don't examples and accessibility requirements
**And** contribution guidance defines acceptance checks before merge

**Given** documentation and runtime components evolve
**When** changes are released
**Then** versioned change notes are recorded and discoverable
**And** observability includes adoption metrics for standard components vs custom exceptions

## Epic 11: Operational Trust and Scale Readiness

Users and operators gain confidence from measurable reliability, accessibility, and performance hardening of critical flows.

### Story 11.1: Reliability Baseline and SLO Instrumentation
As an engineering lead,
I want baseline metrics and SLO definitions for critical flows,
So that hardening work is measurable and regressions are visible.

**Acceptance Criteria:**

**Given** critical flows are defined (`payment_capture`, `offline_local_commit`, `sync_replay_idempotency`, `pos_to_gl_posting`, `trial_balance`, `general_ledger`)
**When** SLOs are ratified
**Then** each flow has explicit SLI definitions, targets, and measurement windows (e.g., 28-day rolling)
**And** targets align to product NFRs (POS p95 < 1s, sync completion < 30s, report p95 < 5s, business-hours availability >= 99.9%)

**Given** instrumentation is implemented
**When** requests/jobs execute
**Then** structured logs, metrics, and distributed traces include correlation IDs (`request_id`, `client_tx_id`, `journal_batch_id` where applicable)
**And** cardinality-safe labels include `company_id`/`outlet_id` scope without leaking PII

**Given** dashboards and alerts are configured
**When** SLI burn rate or error budget thresholds are breached
**Then** actionable alerts fire with flow name, symptom class, and runbook link
**And** alert noise controls (dedup/suppression windows) are defined

**Given** a release candidate lacks required telemetry on any critical path
**When** quality gates run
**Then** rollout is blocked until coverage is restored
**And** missing telemetry is reported as a release-blocking defect

### Story 11.2: POS Payment and Offline Performance Hardening
As a store operator,
I want checkout and offline operation to remain fast and stable under load,
So that tills keep moving during peak hours and network instability.

**Acceptance Criteria:**

**Given** peak-like workload and intermittent connectivity test conditions
**When** cashiers complete checkout flows
**Then** `payment_capture` meets p95 < 1s and p99 within agreed tolerance under target concurrency
**And** failure rate remains within defined SLO error budget

**Given** network loss occurs mid-transaction
**When** checkout finalization proceeds offline
**Then** local commit succeeds durably with `client_tx_id` and queued outbox record
**And** app restart/crash recovery preserves pending transactions without duplication or loss

**Given** offline queue depth and storage pressure increase
**When** system approaches local limits
**Then** backpressure behavior is graceful (clear operator messaging and safe retry path)
**And** no committed transaction is dropped silently

**Given** production and staging telemetry
**When** checkout/offline flows execute
**Then** latency histograms, queue depth, commit failures, and recovery attempts are observable by outlet/company
**And** alerts detect sustained degradations before SLO exhaustion

### Story 11.3: Sync Idempotency and Retry Resilience Hardening
As a platform operator,
I want reconnect sync to be resilient to retries/timeouts/replays,
So that duplicate transaction creation risk is minimized at scale.

**Acceptance Criteria:**

**Given** retries, timeouts, replayed payloads, and out-of-order acknowledgments
**When** sync processes records keyed by `client_tx_id`
**Then** each logical transaction is exactly-once effective server-side under idempotent semantics
**And** duplicate submissions return deterministic idempotent responses without extra writes

**Given** partial failures in sync batches
**When** retry logic runs
**Then** retryable vs non-retryable errors are classified consistently
**And** successful records are not reprocessed in ways that create duplicate business effects

**Given** sync throughput and latency are measured
**When** normal online conditions apply
**Then** end-to-end sync completion meets SLO target (< 30s for standard backlog size)
**And** queue drain behavior remains stable under sustained reconnect bursts

**Given** observability is enabled
**When** anomalies occur
**Then** metrics/logs expose duplicate-attempt counts, dedupe-hit rate, retry counts, and stale-queue age
**And** alerts fire on unusual dedupe spikes, stuck queues, or repeated replay storms

### Story 11.4: Posting Correctness and Reconciliation Guardrails
As a finance controller,
I want automated checks around POS/invoice posting integrity,
So that ledger correctness is continuously enforced.

**Acceptance Criteria:**

**Given** finalized source transactions and their expected journal links
**When** automated reconciliation runs
**Then** unposted events, missing links, and unbalanced journals are detected deterministically
**And** findings include actionable identifiers (`source_id`, `journal_batch_id`, reason class)

**Given** posting succeeds under normal conditions
**When** journal creation is committed
**Then** source and journal linkage is atomic and auditable
**And** no partial posting state is visible to downstream reports

**Given** posting or reconciliation failures occur
**When** corrective workflows are triggered
**Then** correction follows immutable reversal/adjustment patterns
**And** silent mutation of finalized financial records is disallowed

**Given** operational monitoring is active
**When** posting drift signals emerge
**Then** dashboards show mismatch rate, unposted backlog age, and reconciliation latency against SLO
**And** high-severity alerts trigger when drift risks ledger correctness thresholds

### Story 11.5: Reporting Reliability, Performance, and Accessibility Hardening
As a backoffice user,
I want trial balance and ledger reports to be fast, reliable, and accessible,
So that financial oversight works consistently for all users.

**Acceptance Criteria:**

**Given** realistic large datasets and concurrent report usage
**When** users run Trial Balance and General Ledger reports
**Then** report generation meets p95 latency target (< 5s for standard range/profile) and defined success-rate SLO
**And** repeated identical queries return consistent totals and balances

**Given** timeout, cancellation, or transient backend failures
**When** report requests fail
**Then** users receive deterministic, non-ambiguous error states with safe retry actions
**And** no partial/corrupt financial output is presented as final

**Given** report UI and exported interactions are audited for accessibility
**When** keyboard/screen-reader users apply filters, run reports, and inspect tables
**Then** interaction patterns, announcements, and contrast meet WCAG 2.1 AA
**And** critical status and validation information is not conveyed by color alone

**Given** report observability is enabled
**When** requests execute in production
**Then** telemetry captures latency, error class, dataset size bucket, and retry outcomes per report type
**And** alerts detect sustained degradations before violating report SLO commitments
