# Story 2.5: Reports Routes Migration

Status: backlog

## Story

As a **Jurnapod developer**,
I want **the reports routes migrated to Kysely**,
So that **GL aggregation reports remain performant while using Kysely for data retrieval**.

## Acceptance Criteria

1. **AC1: ReportsService Kysely Integration**
   - Given the ReportsService in modules-accounting
   - When migrated to use Kysely
   - Then simple data retrieval uses Kysely
   - And complex aggregations (trial balance, P&L) preserve raw SQL

2. **AC2: GET /reports/trial-balance Migration**
   - Given the existing GET /reports/trial-balance endpoint
   - When migrated to Kysely
   - Then the endpoint retrieves account balances using Kysely
   - And aggregation logic preserves raw SQL for performance

3. **AC3: GET /reports/income-statement Migration**
   - Given the existing GET /reports/income-statement endpoint
   - When migrated to Kysely
   - Then the endpoint retrieves revenue/expense data using Kysely
   - And aggregation logic preserves raw SQL

4. **AC4: GET /reports/balance-sheet Migration**
   - Given the existing GET /reports/balance-sheet endpoint
   - When migrated to Kysely
   - Then the endpoint retrieves asset/liability data using Kysely
   - And aggregation logic preserves raw SQL

5. **AC5: Test Validation**
   - Given the existing reports test suite
   - When migration is complete
   - Then all existing tests pass
   - And `npm run test:unit -w @jurnapod/api` passes

## Tasks / Subtasks

- [ ] **Task 1: Read current implementation**
  - [ ] 1.1 Read modules-accounting/src/reports-service.ts (if exists)
  - [ ] 1.2 Check existing tests in apps/api/src/routes/reports/

- [ ] **Task 2: Identify Kysely vs Raw SQL Boundaries**
  - [ ] 2.1 Map data retrieval operations to migrate
  - [ ] 2.2 Identify GL aggregation queries to preserve as raw SQL
  - [ ] 2.3 Document the decision in code comments

- [ ] **Task 3: Migrate ReportsService (AC1)**
  - [ ] 3.1 Add kysely property to ReportsDbClient interface
  - [ ] 3.2 Implement kysely getter in MySQL adapter
  - [ ] 3.3 Convert data retrieval operations to Kysely

- [ ] **Task 4: Migrate GET /reports/trial-balance (AC2)**
  - [ ] 4.1 Update route handler to use Kysely for data retrieval
  - [ ] 4.2 Preserve raw SQL for balance aggregation

- [ ] **Task 5: Migrate GET /reports/income-statement (AC3)**
  - [ ] 5.1 Update route handler to use Kysely for data retrieval
  - [ ] 5.2 Preserve raw SQL for income statement aggregation

- [ ] **Task 6: Migrate GET /reports/balance-sheet (AC4)**
  - [ ] 6.1 Update route handler to use Kysely for data retrieval
  - [ ] 6.2 Preserve raw SQL for balance sheet aggregation

- [ ] **Task 7: Test Validation (AC5)**
  - [ ] 7.1 Run reports test suite
  - [ ] 7.2 Run full API test suite
  - [ ] 7.3 Verify no regressions

## Technical Notes

**Key Decision: Raw SQL for GL Aggregations**

```typescript
// Data retrieval → Kysely
const accounts = await db.kysely
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .where('deleted_at', 'is', null)
  .select(['id', 'code', 'name', 'account_type_id'])
  .execute();

// Aggregation → Raw SQL (preserved)
const balanceQuery = `
  SELECT
    a.id,
    a.code,
    a.name,
    COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) as balance
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  WHERE a.company_id = ?
    AND a.deleted_at IS NULL
    AND (jl.deleted_at IS NULL OR jl.deleted_at > ?)
  GROUP BY a.id, a.code, a.name
`;
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules-accounting/src/reports-service.ts` | Modify | Migrate to Kysely |
| `apps/api/src/routes/reports/trial-balance.ts` | Modify | Migrate endpoint |
| `apps/api/src/routes/reports/income-statement.ts` | Modify | Migrate endpoint |
| `apps/api/src/routes/reports/balance-sheet.ts` | Modify | Migrate endpoint |

## Dependencies

- Story 1.1 (Journals Route Migration)

## Estimated Effort

2 days

## Risk Level

Medium (financial reports, aggregation performance critical)
