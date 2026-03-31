# Story 0.1.4: Roles Route Migration

Status: done

## Story

As a **Jurnapod developer**,
I want **the roles route migrated to Kysely**,
So that **I can validate Kysely with a route that has simple relations**.

## Acceptance Criteria

1. **AC1: GET /roles Migration**
   - Given the existing GET /roles endpoint
   - When migrated to Kysely
   - Then the endpoint returns identical results to raw SQL implementation
   - And type checking passes

2. **AC2: POST /roles Migration**
   - Given the existing POST /roles endpoint
   - When migrated to Kysely
   - Then the endpoint creates roles with identical behavior
   - And type checking passes

3. **AC3: PUT /roles/:id Migration**
   - Given the existing PUT /roles/:id endpoint
   - When migrated to Kysely
   - Then the endpoint updates roles with identical behavior
   - And type checking passes

4. **AC4: DELETE /roles/:id Migration**
   - Given the existing DELETE /roles/:id endpoint
   - When migrated to Kysely
   - Then the endpoint deletes roles with identical behavior
   - And type checking passes

5. **AC5: Test Validation**
   - Given the existing roles test suite
   - When migration is complete
   - Then all existing tests pass
   - And `npm run test:unit -w @jurnapod/api` passes

## Tasks / Subtasks

- [ ] **Task 1: Read current implementation**
  - [ ] 1.1 Read apps/api/src/routes/roles.ts
  - [ ] 1.2 Identify raw SQL queries to migrate
  - [ ] 1.3 Check existing tests

- [ ] **Task 2: Migrate roles lib functions (AC1-AC4)**
  - [ ] 2.1 Migrate list/get functions to Kysely
  - [ ] 2.2 Migrate create function to Kysely
  - [ ] 2.3 Migrate update function to Kysely
  - [ ] 2.4 Migrate delete function to Kysely

- [ ] **Task 3: Run Tests (AC5)**
  - [ ] 3.1 Run roles tests
  - [ ] 3.2 Run full API test suite
  - [ ] 3.3 All tests pass

## Dev Notes

### Migration Pattern

Same as tax-rates - convert raw SQL to Kysely queries.

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/roles.ts` | Modify | Migrate all functions to Kysely |

### Dependencies

- Story 0.1.3

## Dev Agent Record

### Agent Model Used

kimi-k2.5

### Debug Log References

N/A

### Completion Notes List

**Story 0.1.4: Roles Route Migration - COMPLETED**

**AC Evidence:**
- AC1-AC5: All CRUD operations migrated to Kysely
- All 692 tests pass

**Migration Summary:**
- `listRoles`: Raw SQL → Kysely with dynamic or conditions
- `getRole`: Raw SQL → Kysely select
- `createRole`: Raw SQL → Kysely insert with validation
- `updateRole`: Raw SQL → Kysely update
- `deleteRole`: Raw SQL → Kysely delete with count check

**Key Patterns Used:**
```typescript
// Count with expression builder
db.kysely
  .selectFrom('user_role_assignments')
  .where('role_id', '=', roleId)
  .select((eb) => [eb.fn.count('id').as('count')])
  .executeTakeFirst()

// Or conditions
query.where((eb) => eb.or([
  eb('company_id', '=', companyId),
  eb('company_id', 'is', null)
]))
```

### File List

**Files Modified:**
- `apps/api/src/lib/roles.ts`

**Estimated Effort:** 1 day

**Risk Level:** Low (simple CRUD with relations)

**Dependencies:** Story 0.1.3

**FRs Covered:** FR3
