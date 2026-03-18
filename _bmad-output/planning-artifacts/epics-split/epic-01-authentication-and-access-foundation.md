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

