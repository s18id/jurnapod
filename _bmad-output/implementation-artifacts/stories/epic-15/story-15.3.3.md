# Story 15.3.3: Tax Rates & Roles Routes

Status: review

## Story

As a backoffice user or POS device,
I want to read tax rates and roles via /tax-rates and /roles endpoints,
so that I can apply correct taxes and manage user permissions.

## User Story

As a user needing reference data,
I want to list tax rates with effective date filtering and roles with permissions,
so that I can apply correct tax calculations and enforce access control.

## Acceptance Criteria

1. **AC-1:** Tax rates filtered by company ✅
2. **AC-2:** Roles include role details ✅
3. **AC-3:** Company scoping enforced ✅
4. **AC-4:** All tests pass ✅

## Tasks / Subtasks

- [x] Task 1: Analyze legacy tax-rates and roles routes (AC: 1, 2, 3)
  - [x] Subtask 1.1: Found tax rate functions in taxes.ts
  - [x] Subtask 1.2: Found roles functions in users.ts
  - [x] Subtask 1.3: Identified tax rate data structure
- [x] Task 2: Implement GET /tax-rates - List for company (AC: 1, 3)
  - [x] Subtask 2.1: GET /tax-rates - List all tax rates
  - [x] Subtask 2.2: GET /tax-rates/default - List default tax rates
  - [x] Subtask 2.3: Filter by company_id from auth context
- [x] Task 3: Implement GET /roles - List with role details (AC: 2, 3)
  - [x] Subtask 3.1: GET /roles - List all roles
  - [x] Subtask 3.2: GET /roles/:id - Get single role
  - [x] Subtask 3.3: Filter by company_id from auth context
- [x] Task 4: Write 8+ combined test cases (AC: 4)
  - [x] Subtask 4.1: Test tax rates data structure
  - [x] Subtask 4.2: Test tax rates filtering
  - [x] Subtask 4.3: Test roles with permissions
  - [x] Subtask 4.4: Test company scoping enforcement

## Dev Notes

### Technical Context

**Routes Implemented:**
- `apps/api/src/routes/tax-rates.ts` (GET /tax-rates, GET /tax-rates/default)
- `apps/api/src/routes/roles.ts` (GET /roles, GET /roles/:id)
- Framework: Hono
- Complexity: LOW - Read operations

**Tax Rate Data Model:**
- id, name, rate (percentage), company_id
- effective_from, effective_to
- is_active

**Role Data Model:**
- id, name, company_id, is_active
- permissions: Array<{ resource, actions: string[] }>

## Dev Agent Record

### Implementation Log

**Date:** 2026-03-22

**Changes:**
1. Created `tax-rates.ts` Hono route with:
   - GET /tax-rates - List all tax rates for company
   - GET /tax-rates/default - List default tax rates for company
2. Created `roles.ts` Hono route with:
   - GET /roles - List all roles for company
   - GET /roles/:id - Get single role by ID
3. Updated server.ts to use `rolesRoutes` (renamed from `roleRoutes`)
4. Created 17 combined tests covering:
   - Tax rates data structure and filtering
   - Roles data structure
   - Company scoping enforcement
   - Access control
   - Error handling

**Completion Notes:**
- Full implementation complete
- TypeScript type check passes
- ESLint passes
- 17 tests passing

### Files Modified

- `apps/api/src/routes/tax-rates.ts` - Tax rates route (92 lines)
- `apps/api/src/routes/roles.ts` - Roles route (118 lines)
- `apps/api/src/server.ts` - Fixed import name (roleRoutes → rolesRoutes)
- `apps/api/src/routes/tax-rates.test.ts` - Combined tests (17 tests)
  - Note: Test file is untracked in git (not committed). Run tests individually for validation.

## Change Log

- **2026-03-22:** Implemented tax rates and roles routes. List endpoints for both with company scoping and role-based access. 17 tests passing.

## File List

- `apps/api/src/routes/tax-rates.ts` - Tax rates route (92 lines)
- `apps/api/src/routes/roles.ts` - Roles route (118 lines)
- `apps/api/src/routes/tax-rates.test.ts` - 17 combined tests
