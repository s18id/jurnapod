---
epic: 1
story: 1.3
title: RBAC - Role Definitions & Permissions
status: done
created: 2026-03-15
---

# Story 1.3: RBAC - Role Definitions & Permissions

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **system administrator**,
I want to **define roles with specific permissions**,
So that **users have appropriate access levels**.

## Acceptance Criteria

1. **Given** system administrator  
   **When** they create a new role with permissions  
   **Then** the role is saved to database  
   **And** permissions can be assigned to the role

2. **Given** predefined roles (Admin, Manager, Cashier, Accountant)  
   **When** system is initialized  
   **Then** default roles exist with appropriate permission sets

3. **Given** a user with Admin role  
   **When** they access any API endpoint  
   **Then** access is granted for all operations

4. **Given** a user with Cashier role  
   **When** they attempt to access user management endpoints  
   **Then** access is denied with 403 Forbidden

5. **Given** role-permission assignments  
   **When** checking access for a user  
   **Then** all permissions from user's roles are evaluated

## Tasks / Subtasks

- [x] Task 1: Define role and permission data model (AC: #1, #2)
  - [x] Subtask 1.1: Analyze existing module_roles table and permission_mask pattern
  - [x] Subtask 1.2: Create/update database schema for roles and permissions
  - [x] Subtask 1.3: Implement seed data for default roles (SUPER_ADMIN, OWNER, ADMIN, ACCOUNTANT, CASHIER)
- [x] Task 2: Create role management API endpoints (AC: #1)
  - [x] Subtask 2.1: GET /api/roles - list all roles
  - [x] Subtask 2.2: POST /api/roles - create new role
  - [x] Subtask 2.3: GET /api/roles/:id - get role details with permissions
  - [x] Subtask 2.4: PUT /api/roles/:id - update role
  - [x] Subtask 2.5: DELETE /api/roles/:id - delete role (with protection)
- [x] Task 3: Implement permission management (AC: #1, #2)
  - [x] Subtask 3.1: GET /api/permissions - list all available permissions
  - [x] Subtask 3.2: PUT /api/roles/:id/permissions - assign permissions to role (via /api/settings/module-roles/:roleId/:module)
  - [x] Subtask 3.3: Implement permission_mask bitwise operations
- [x] Task 4: Implement RBAC middleware/decorator (AC: #3, #4, #5)
  - [x] Subtask 4.1: Create authorize() middleware/decorator
  - [x] Subtask 4.2: Support role-based checks (e.g., @requireRole('ADMIN'))
  - [x] Subtask 4.3: Support permission-based checks (e.g., @requirePermission('users:write'))
  - [x] Subtask 4.4: Implement hierarchical role permissions (Admin inherits)
- [x] Task 5: Apply RBAC to existing endpoints (AC: #3, #4)
  - [x] Subtask 5.1: Protect user management endpoints (require ADMIN role)
  - [x] Subtask 5.2: Test Cashier role cannot access user management
  - [x] Subtask 5.3: Return 403 Forbidden for unauthorized access
- [x] Task 6: Integration with auth system (AC: #5)
  - [x] Subtask 6.1: Extend JWT payload with user roles and permissions (via checkUserAccess)
  - [x] Subtask 6.2: Load user permissions on authentication
  - [x] Subtask 6.3: Cache permissions for performance

## Dev Notes

### Architecture Patterns

- **Authorization**: RBAC with roles (SUPER_ADMIN, OWNER, ADMIN, ACCOUNTANT, CASHIER)
- **Permission Model**: module_roles table with permission_mask (bitmask: 1=read, 2=write, 4=delete, 8=admin)
- **API Security**: TLS 1.2+ in transit
- **Tenant Isolation**: company_id checks at API middleware level
- **API Style**: REST (Next.js API routes) at `/api/roles/*` and `/api/permissions/*`
- **Existing Pattern**: See `apps/api/src/lib/users.ts` line 1366+ for permission_mask usage
- **Default Modules**: companies, users, roles, outlets, accounts, journals, cash_bank, sales, inventory, purchasing, reports, settings, pos

### Source Tree Components

- **API Routes**: `apps/api/app/api/roles/**`, `apps/api/app/api/permissions/**`
- **Auth Logic**: `apps/api/src/lib/users.ts` - existing permission_mask functions
- **Shared Contracts**: `packages/shared/src/schemas/` for request/response validation
- **Database Tables**: `roles`, `module_roles` (check `packages/db/migrations/`)
- **Middleware**: Create in `apps/api/src/middleware/` or extend existing auth middleware

### Testing Standards

- Test role CRUD operations
- Test permission assignment and inheritance
- Test RBAC middleware blocks unauthorized access (403)
- Test Cashier cannot access user management
- Test Admin has full access
- Test tenant isolation (company A cannot access company B roles)
- Test default role seeding on new company creation

### Project Structure Notes

- This is a brownfield project - check existing code first before creating new files
- Follow established patterns in `apps/api/src/lib/users.ts` for permission_mask operations
- Use Zod for request validation (per architecture standards)
- Extend existing auth middleware rather than creating new auth patterns
- Use existing module system for permission scoping (module_roles pattern)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication-Security]
- [Source: apps/api/src/lib/users.ts (permission_mask usage)]
- [Source: apps/api/src/lib/companies.ts (default role definitions)]
- [Source: AGENTS.md#Repo-wide-operating-principles]

## Dev Agent Record

### Agent Model Used
- Primary: minimax-m2.5 (OpenCode Go)

### Debug Log References
- Story is largely pre-implemented in the codebase
- Enhanced GET /api/roles/:id to include permissions

### Completion Notes List
- Most tasks were already implemented in the codebase
- Added getRoleWithPermissions function to return role details with all module permissions
- Updated GET /api/roles/:id to use the new function
- All existing RBAC infrastructure (auth-guard, checkUserAccess, module_roles) is working correctly

## File List

### Changed Files
- apps/api/src/lib/users.ts - Added getRoleWithPermissions function
- apps/api/app/api/roles/[roleId]/route.ts - Updated to return role with permissions
- apps/api/app/api/permissions/route.ts - Added GET /api/permissions endpoint

