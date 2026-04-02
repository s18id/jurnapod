# Story 1.2: Account Types Route Migration

Status: done

## Story

As a **Jurnapod developer**,
I want **the account-types route migrated to Kysely**,
So that **I can validate Kysely with a route that has soft-delete patterns and audit logging**.

## Acceptance Criteria

1. **AC1: AccountTypesService Kysely Integration**
   - Given the AccountTypesService in modules-accounting
   - When migrated to use Kysely
   - Then all CRUD operations use Kysely query builder

2. **AC2: GET /account-types Migration**
   - Given the existing GET /account-types endpoint
   - When migrated to Kysely
   - Then the endpoint returns identical results to raw SQL implementation
   - And type checking passes

3. **AC3: POST /account-types Migration**
   - Given the existing POST /account-types endpoint
   - When migrated to Kysely
   - Then the endpoint creates account types with identical behavior
   - And type checking passes

4. **AC4: PUT /account-types/:id Migration**
   - Given the existing PUT /account-types/:id endpoint
   - When migrated to Kysely
   - Then the endpoint updates account types with identical behavior
   - And type checking passes

5. **AC5: DELETE /account-types/:id Migration**
   - Given the existing DELETE /account-types/:id endpoint
   - When migrated to Kysely
   - Then the endpoint soft-deletes account types with identical behavior
   - And type checking passes

6. **AC6: Test Validation**
   - Given the existing account-types test suite
   - When migration is complete
   - Then all existing tests pass
   - And `npm run test:unit -w @jurnapod/api` passes

## Tasks / Subtasks

- [ ] **Task 1: Read current implementation**
  - [ ] 1.1 Read modules-accounting/src/account-types-service.ts
  - [ ] 1.2 Identify raw SQL queries to migrate
  - [ ] 1.3 Check for existing tests

- [ ] **Task 2: Migrate AccountTypesService (AC1)**
  - [ ] 2.1 Add kysely property to AccountTypesDbClient interface
  - [ ] 2.2 Implement kysely getter in MySQL adapter
  - [ ] 2.3 Convert all CRUD operations to Kysely

- [ ] **Task 3: Migrate GET /account-types (AC2)**
  - [ ] 3.1 Convert listAccountTypes to Kysely
  - [ ] 3.2 Verify results match
  - [ ] 3.3 Type check passes

- [ ] **Task 4: Migrate POST /account-types (AC3)**
  - [ ] 4.1 Convert createAccountType to Kysely
  - [ ] 4.2 Verify creation works
  - [ ] 4.3 Type check passes

- [ ] **Task 5: Migrate PUT /account-types/:id (AC4)**
  - [ ] 5.1 Convert updateAccountType to Kysely
  - [ ] 5.2 Verify update works
  - [ ] 5.3 Type check passes

- [ ] **Task 6: Migrate DELETE /account-types/:id (AC5)**
  - [ ] 6.1 Convert deactivateAccountType to Kysely (soft-delete)
  - [ ] 6.2 Verify soft-delete works
  - [ ] 6.3 Type check passes

- [ ] **Task 7: Run Tests (AC6)**
  - [ ] 7.1 Run account-types tests
  - [ ] 7.2 Run full API test suite
  - [ ] 7.3 All tests pass

## Dev Notes

### Migration Pattern

**Soft-Delete Pattern:**

```typescript
// Kysely soft-delete (update deleted_at)
const result = await db.kysely
  .updateTable('account_types')
  .set({ deleted_at: new Date() })
  .where('id', '=', id)
  .where('company_id', '=', companyId)
  .executeTakeFirst();

const affected = Number(result?.numUpdatedRows ?? 0);
if (affected === 0) {
  throw new AccountTypeNotFoundError();
}
```

**Active Record Check:**

```typescript
// Check before deactivation
const inUse = await db.kysely
  .selectFrom('accounts')
  .where('account_type_id', '=', accountTypeId)
  .where('company_id', '=', companyId)
  .where('deleted_at', 'is', null)
  .select((eb) => eb.fn.count('id').as('count'))
  .executeTakeFirst();

if (Number(inUse?.count ?? 0) > 0) {
  throw new AccountTypeInUseError();
}
```

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/accounting/src/account-types-service.ts` | Modify | Add kysely to interface, migrate CRUD |
| `apps/api/src/lib/account-types.ts` | Modify | Ensure kysely integration |
| `apps/api/src/routes/account-types.ts` | Create | Create route file if missing |

### Dependencies

- Story 1.1 (Journals Route Migration) - recommended but not required

### Estimated Effort

1 day (similar complexity to tax-rates)

### Risk Level

Low (standard CRUD with soft-delete)

### FRs Covered

FR3 (Incremental migration path)

## Dev Agent Record

### Agent Model Used

kimi-k2.5

### Completion Notes

**Story 1.2: Account Types Route Migration - COMPLETED**

**AC Evidence:**
- AC1: ✅ AccountTypesService fully migrated to Kysely
- AC2: ✅ GET /account-types (listAccountTypes) uses Kysely
- AC3: ✅ POST /account-types (createAccountType) uses Kysely
- AC4: ✅ PUT /account-types/:id (updateAccountType) uses Kysely
- AC5: ✅ DELETE /account-types/:id (deactivateAccountType) uses Kysely
- AC6: ✅ All 692 tests pass

**Migration Summary:**
All CRUD operations migrated from raw SQL to Kysely:
- `listAccountTypes()` - Kysely with dynamic filters
- `getAccountTypeById()` - Kysely select with single row
- `createAccountType()` - Kysely insert with transaction
- `updateAccountType()` - Kysely update with dynamic set
- `deactivateAccountType()` - Kysely update for soft-delete
- `isAccountTypeInUse()` - Kysely count query
- `validateAccountTypeName()` - Kysely existence check

**Key Patterns Used:**
```typescript
// Count with expression builder
const result = await this.db.kysely
  .selectFrom('accounts')
  .where('account_type_id', '=', accountTypeId)
  .where('company_id', '=', companyId)
  .select((eb) => eb.fn.count('id').as('count'))
  .executeTakeFirst();

// Dynamic update
const updates: Record<string, any> = {};
if (data.name !== undefined) updates.name = data.name;
if (data.category !== undefined) updates.category = data.category;
await this.db.kysely
  .updateTable('account_types')
  .set(updates)
  .where('id', '=', accountTypeId)
  .execute();
```

**Files Modified:**
- `packages/modules/accounting/src/account-types-service.ts` - All CRUD migrated to Kysely

**Validation Results:**
```
npm run typecheck -w @jurnapod/api ✅
npm run build -w @jurnapod/api ✅
npm run lint -w @jurnapod/api ✅
npm run test:unit -w @jurnapod/api ✅ (692 tests)
```
