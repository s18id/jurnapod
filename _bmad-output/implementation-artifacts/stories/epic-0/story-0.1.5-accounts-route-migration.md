# Story 0.1.5: Accounts Route Migration

Status: in-progress

## Story

As a **Jurnapod developer**,
I want **the accounts route migrated to Kysely**,
So that **I can validate Kysely with a core entity that has complex patterns**.

## Acceptance Criteria

1. **AC1: GET /accounts Migration**
   - Given the existing GET /accounts endpoint
   - When migrated to Kysely
   - Then the endpoint returns identical results to raw SQL implementation
   - And type checking passes

2. **AC2: POST /accounts Migration**
   - Given the existing POST /accounts endpoint
   - When migrated to Kysely
   - Then the endpoint creates accounts with identical behavior
   - And type checking passes

3. **AC3: PUT /accounts/:id Migration**
   - Given the existing PUT /accounts/:id endpoint
   - When migrated to Kysely
   - Then the endpoint updates accounts with identical behavior
   - And type checking passes

4. **AC4: DELETE /accounts/:id Migration**
   - Given the existing DELETE /accounts/:id endpoint
   - When migrated to Kysely
   - Then the endpoint deletes accounts with identical behavior
   - And type checking passes

5. **AC5: Account Tree Building**
   - Given the account tree building logic
   - When migrated to Kysely
   - Then the account hierarchy is built correctly
   - And parent-child relationships are preserved

6. **AC6: Test Validation**
   - Given the existing accounts test suite
   - When migration is complete
   - Then all existing tests pass
   - And `npm run test:unit -w @jurnapod/api` passes

## Tasks / Subtasks

- [ ] **Task 1: Read current implementation**
  - [ ] 1.1 Read apps/api/src/lib/accounts.ts
  - [ ] 1.2 Identify raw SQL queries to migrate
  - [ ] 1.3 Check existing tests

- [ ] **Task 2: Migrate accounts lib functions (AC1-AC5)**
  - [ ] 2.1 Migrate list/get functions to Kysely
  - [ ] 2.2 Migrate create function to Kysely
  - [ ] 2.3 Migrate update function to Kysely
  - [ ] 2.4 Migrate delete function to Kysely
  - [ ] 2.5 Verify tree building works

- [ ] **Task 3: Run Tests (AC6)**
  - [ ] 3.1 Run accounts tests
  - [ ] 3.2 Run full API test suite
  - [ ] 3.3 All tests pass

## Dev Notes

### Migration Pattern

Same as tax-rates and roles - convert raw SQL to Kysely queries.

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/accounts.ts` | Modify | Migrate all functions to Kysely |

### Dependencies

- Story 0.1.4

## Dev Agent Record

### Agent Model Used

kimi-k2.5

### Debug Log References

N/A

### Completion Notes List

(To be filled during implementation)

### File List

**Files Modified:**
- `apps/api/src/lib/accounts.ts`

**Estimated Effort:** 1 day

**Risk Level:** Low (core entity, validates patterns)

**Dependencies:** Story 0.1.4

**FRs Covered:** FR3
