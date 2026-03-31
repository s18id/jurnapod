# Story 0.1.3: Tax Rates Route Migration

Status: done

## Story

As a **Jurnapod developer**,
I want **the tax-rates route migrated to Kysely**,
So that **I can validate the Kysely integration with a simple CRUD route**.

## Acceptance Criteria

1. **AC1: GET /tax-rates Migration**
   - Given the existing GET /tax-rates endpoint
   - When migrated to Kysely
   - Then the endpoint returns identical results to raw SQL implementation
   - And type checking passes

2. **AC2: POST /tax-rates Migration**
   - Given the existing POST /tax-rates endpoint
   - When migrated to Kysely
   - Then the endpoint creates tax rates with identical behavior
   - And type checking passes

3. **AC3: PUT /tax-rates/:id Migration**
   - Given the existing PUT /tax-rates/:id endpoint
   - When migrated to Kysely
   - Then the endpoint updates tax rates with identical behavior
   - And type checking passes

4. **AC4: DELETE /tax-rates/:id Migration**
   - Given the existing DELETE /tax-rates/:id endpoint
   - When migrated to Kysely
   - Then the endpoint deletes tax rates with identical behavior
   - And type checking passes

5. **AC5: Test Validation**
   - Given the existing tax-rates test suite
   - When migration is complete
   - Then all existing tests pass
   - And `npm run test:unit -w @jurnapod/api` passes

## Tasks / Subtasks

- [ ] **Task 1: Read current implementation**
  - [ ] 1.1 Read apps/api/src/routes/tax-rates.ts
  - [ ] 1.2 Identify raw SQL queries to migrate
  - [ ] 1.3 Check existing tests

- [ ] **Task 2: Migrate GET /tax-rates (AC1)**
  - [ ] 2.1 Convert raw SQL to Kysely query
  - [ ] 2.2 Verify results match
  - [ ] 2.3 Type check passes

- [ ] **Task 3: Migrate POST /tax-rates (AC2)**
  - [ ] 3.1 Convert raw SQL insert to Kysely
  - [ ] 3.2 Verify insertion works
  - [ ] 3.3 Type check passes

- [ ] **Task 4: Migrate PUT /tax-rates/:id (AC3)**
  - [ ] 4.1 Convert raw SQL update to Kysely
  - [ ] 4.2 Verify update works
  - [ ] 4.3 Type check passes

- [ ] **Task 5: Migrate DELETE /tax-rates/:id (AC4)**
  - [ ] 5.1 Convert raw SQL delete to Kysely
  - [ ] 5.2 Verify deletion works
  - [ ] 5.3 Type check passes

- [ ] **Task 6: Run Tests (AC5)**
  - [ ] 6.1 Run tax-rates tests
  - [ ] 6.2 Run full API test suite
  - [ ] 6.3 All tests pass

## Dev Notes

### Migration Pattern

**Before (raw SQL):**
```typescript
const sql = `
  SELECT id, company_id, code, name, rate, is_active
  FROM tax_rates
  WHERE company_id = ? AND is_active = ?
`;
const rows = await db.query<TaxRateRow>(sql, [companyId, true]);
```

**After (Kysely):**
```typescript
const taxRates = await db.kysely
  .selectFrom('tax_rates')
  .where('company_id', '=', companyId)
  .where('is_active', '=', true)
  .select(['id', 'company_id', 'code', 'name', 'rate', 'is_active'])
  .execute();
```

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/tax-rates.ts` | Modify | Migrate all endpoints to Kysely |

### Dependencies

- Story 0.1.2 (DbClient Integration)

## Dev Agent Record

### Agent Model Used

kimi-k2.5

### Debug Log References

N/A

### Completion Notes List

**Story 0.1.3: Tax Rates Route Migration - COMPLETED**

**AC Evidence:**
- AC1-AC5: All CRUD operations migrated to Kysely
- All 692 tests pass

**Migration Summary:**
- `findTaxRateByIdWithExecutor`: Raw SQL → Kysely select
- `createTaxRate`: Raw SQL → Kysely insert with validation
- `updateTaxRate`: Raw SQL → Kysely update with dynamic set builder
- `deleteTaxRate`: Raw SQL → Kysely delete with count checks
- `listTaxRates`: Raw SQL → Kysely select with filters

**Key Patterns Used:**
```typescript
// Count with expression builder
db.kysely
  .selectFrom('table')
  .where('tax_rate_id', '=', taxRateId)
  .select((eb) => [eb.fn.count('id').as('count')])
  .executeTakeFirst()

// Delete with result check
const result = await db.kysely
  .deleteFrom('tax_rates')
  .where('company_id', '=', companyId)
  .where('id', '=', taxRateId)
  .executeTakeFirst()
if (result.numDeletedRows === 0n) { ... }
```

### File List

**Files Modified:**
- `apps/api/src/routes/tax-rates.ts`

**Estimated Effort:** 1 day

**Risk Level:** Low (simple CRUD, easy to validate)

**Dependencies:** Story 0.1.2

**FRs Covered:** FR3
