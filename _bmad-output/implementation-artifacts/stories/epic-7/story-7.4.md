# Story 7.4: Fixed-Assets Route Test Coverage Backfill

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want comprehensive test coverage for fixed-assets routes,
so that I can confidently make changes without introducing regressions.

## Context

TD-006: Fixed-assets CRUD endpoints have thin test coverage compared to items and item-groups, identified in the Epic 3 retrospective but deferred.

## Acceptance Criteria

### AC1: Route Coverage
- Add unit tests for all fixed-assets CRUD routes: list, get, create, update, delete
- Cover: happy path, validation errors, not-found, company-scoped isolation

### AC2: Integration Tests
- Add API-level integration test for create → get → update → delete flow
- Consistent with patterns established in Story 6.7 import integration tests

### AC3: No Regressions
- All existing 881+ tests continue to pass

## Tasks / Subtasks

- [x] Create fixed-assets route unit tests (AC1)
  - [x] Test GET /fixed-assets (list)
  - [x] Test GET /fixed-assets/:id (get by ID)
  - [x] Test POST /fixed-assets (create)
  - [x] Test PUT /fixed-assets/:id (update)
  - [x] Test DELETE /fixed-assets/:id (delete)
  - [x] Test validation errors for each route
  - [x] Test not-found scenarios
  - [x] Test company-scoped isolation
- [x] Create integration tests (AC2)
  - [x] Test full CRUD flow: create → get → update → delete
  - [x] Follow Story 6.7 import integration test patterns
- [x] Verify no regressions (AC3)
  - [x] Run full test suite
  - [x] Confirm 881+ tests pass

## Dev Notes

### Technical Requirements
- Follow existing test patterns for items and item-groups routes
- Use Kysely for test database operations
- Proper database pool cleanup after tests (see AGENTS.md)

### Files to Create
- `apps/api/src/routes/fixed-assets.test.ts` - Unit and integration tests

### Files to Reference
- `apps/api/src/routes/items.test.ts` - Reference for CRUD test patterns
- `apps/api/src/routes/item-groups.test.ts` - Reference for test patterns
- `apps/api/src/routes/import.test.ts` (Story 6.7) - Reference for integration test patterns

### Project Structure Notes
- Tests are co-located with routes in apps/api/src/routes/
- Use existing test utilities and fixtures
- Follow naming convention: `{route}.test.ts`

### Testing Patterns to Follow

**Unit Test Structure:**
```typescript
import { test } from 'node:test';
import assert from 'node:assert';
// ... imports

test('GET /fixed-assets returns company-scoped list', async () => {
  // Setup
  // Execute
  // Assert
});
```

**Integration Test Structure:**
```typescript
test('fixed-assets CRUD flow', async () => {
  // Create
  // Get and verify
  // Update
  // Verify update
  // Delete
  // Verify deletion
});
```

### Database Pool Cleanup
```typescript
test.after(async () => {
  await closeDbPool();
});
```

### References

- [Source: _bmad-output/planning-artifacts/epic-7.md] - Epic 7 full specification
- [Source: apps/api/src/routes/fixed-assets.ts] - Routes to test
- [Source: apps/api/src/routes/items.test.ts] - Test pattern reference

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- [COMPLETED 2026-03-28] All acceptance criteria met
- Created comprehensive test suite: 1005 lines covering CRUD operations
- Tests include: list, get, create, update, delete for both categories and assets
- Error scenarios covered: 401 unauthorized, 404 not-found, 400 validation errors, 409 conflicts
- Tenant isolation tested with second company fixture
- Database constraint errors tested (foreign key violations)
- TD-006 marked RESOLVED in TECHNICAL-DEBT.md

### File List

**Created:**
- `apps/api/src/routes/accounts.fixed-assets.test.ts` (1005 lines)
  - Tests for /accounts/fixed-asset-categories endpoints
  - Tests for /accounts/fixed-assets endpoints
  - CRUD lifecycle tests
  - Tenant isolation tests
  - Error handling tests
