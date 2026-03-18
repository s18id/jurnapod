---
epic: 1
story: 1.6
title: Outlet Management (CRUD)
status: done
created: 2026-03-15
---

# Story 1.6: Outlet Management (CRUD)

## Story

As a **company admin**,
I want to **create and manage multiple outlets**,
So that **I can operate multiple store locations**.

## Acceptance Criteria

1. **Given** a company admin  
   **When** they create a new outlet with name, address, code  
   **Then** the outlet is created and assigned to the company

2. **Given** a company admin  
   **When** they view all outlets  
   **Then** all outlets for their company are listed

3. **Given** a company admin  
   **When** they update outlet details  
   **Then** changes are saved and reflected immediately

4. **Given** a company admin  
   **When** they deactivate an outlet  
   **Then** new transactions cannot be created for that outlet  
   **And** historical data is preserved

## Tasks / Subtasks

- [x] Task 1: Outlet CRUD API endpoints (AC: #1, #2, #3, #4)
  - [x] Subtask 1.1: GET /api/outlets - list outlets (filtered by company)
  - [x] Subtask 1.2: POST /api/outlets - create outlet
  - [x] Subtask 1.3: GET /api/outlets/:id - get outlet details
  - [x] Subtask 1.4: PATCH /api/outlets/:id - update outlet
  - [x] Subtask 1.5: DELETE/PATCH /api/outlets/:id/deactivate - soft delete
- [x] Task 2: Outlet code uniqueness (AC: #1)
  - [x] Subtask 2.1: Enforce unique outlet_code per company
  - [x] Subtask 2.2: Validate outlet code format
- [x] Task 3: Tenant isolation (AC: #1, #2, #3, #4)
  - [x] Subtask 3.1: Ensure all endpoints enforce company_id
  - [x] Subtask 3.2: Block cross-company outlet access

## Dev Notes

### Architecture Patterns

- **Data Model**: outlets table with company_id foreign key
- **Outlet Code**: unique per company, used for identification
- **Tenant Isolation**: company_id enforced on all operations
- **API Style**: REST (Next.js API routes) at `/api/outlets/*`

### Source Tree Components

- **API Routes**: `apps/api/app/api/outlets/**`
- **Outlet Logic**: `apps/api/src/lib/outlets.ts` (check if exists)
- **Database Tables**: `outlets`

### Testing Standards

- Test outlet CRUD operations
- Test outlet code uniqueness per company
- Test tenant isolation
- Test outlet deactivation preserves data

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.6]
- [Source: AGENTS.md#Repo-wide-operating-principles]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List
