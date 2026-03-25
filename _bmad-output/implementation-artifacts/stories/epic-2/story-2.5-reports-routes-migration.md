# Story 2.5: Reports Routes Migration

Status: done

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

- [x] **Task 1: Read current implementation**
  - [x] 1.1 Read apps/api/src/lib/reports.ts (1117 lines, all raw SQL)
  - [x] 1.2 Read apps/api/src/routes/reports.ts (already thin HTTP layer)
  - [x] 1.3 Review existing tests in apps/api/src/routes/reports.test.ts

- [x] **Task 2: Identify Kysely vs Raw SQL Boundaries**
  - [x] 2.1 Map data retrieval operations to migrate
  - [x] 2.2 Identify GL aggregation queries to preserve as raw SQL
  - [x] 2.3 Document the decision in code comments

- [x] **Task 3: Migrate lib/reports.ts data retrieval (AC1)**
  - [x] 3.1 Add newKyselyConnection imports to lib/reports.ts
  - [x] 3.2 Migrate account lookups in getTrialBalance to Kysely SELECT
  - [x] 3.3 Migrate account lookups in getProfitLoss to Kysely SELECT
  - [x] 3.4 Migrate account lookups in getTrialBalanceWorksheet to Kysely SELECT
  - [x] 3.5 Migrate asOfId subquery in listPosTransactions to Kysely
  - [x] 3.6 Migrate asOfId subquery in listJournalBatches to Kysely
  - [x] 3.7 Preserve raw SQL for all GL aggregation (SUM, GROUP BY, JOINs)

- [x] **Task 4: Validate migration — getTrialBalance (AC2)**
  - [x] 4.1 getTrialBalance route uses Kysely for account lookup, raw SQL for balance aggregation
  - [x] 4.2 Route handler unchanged (already thin)

- [x] **Task 5: Validate migration — getProfitLoss (AC3)**
  - [x] 5.1 getProfitLoss route uses Kysely for account lookup, raw SQL for PL aggregation
  - [x] 5.2 Route handler unchanged (already thin)

- [x] **Task 6: Validate migration — balance sheet (AC4)**
  - [x] 6.1 getTrialBalanceWorksheet used as balance sheet worksheet
  - [x] 6.2 Migrate account lookup to Kysely, preserve raw SQL for worksheet aggregation

- [x] **Task 7: Test Validation (AC5)**
  - [x] 7.1 Run reports test suite (apps/api/src/routes/reports.test.ts)
  - [x] 7.2 Run full API test suite
  - [x] 7.3 Verify no regressions

## Technical Notes

**Actual file structure:**
- `apps/api/src/lib/reports.ts` — ALL report functions (1117 lines), all raw SQL
- `apps/api/src/routes/reports.ts` — Thin HTTP layer (already well-structured, 899 lines)
- `modules-accounting/src/reports-service.ts` — does NOT exist

**Migration strategy (same pattern as other migrated modules):**
- Use `newKyselyConnection(connection)` pattern — same as `lib/users.ts`, `lib/companies.ts`, etc.
- Data retrieval (account lookups, simple SELECTs) → Kysely
- Complex GL aggregation (SUM + GROUP BY + JOINs across many rows) → preserve raw SQL

**Kysely migration candidates:**
```typescript
// 1. getTrialBalance — fetch accounts with Kysely, aggregate with raw SQL
const accounts = await kysely
  .selectFrom('accounts')
  .where('company_id', '=', filter.companyId)
  .where('is_group', '=', 0)
  .select(['id', 'code', 'name'])
  .execute();

// 2. getProfitLoss — fetch PL accounts with Kysely, aggregate with raw SQL
const plAccounts = await kysely
  .selectFrom('accounts')
  .innerJoin('account_types at', 'at.id', 'accounts.account_type_id')
  .where('accounts.company_id', '=', filter.companyId)
  .where('accounts.is_group', '=', 0)
  .where('at.report_group', 'in', ['PL', 'LR'])
  .select(['accounts.id', 'accounts.code', 'accounts.name'])
  .execute();

// 3. listPosTransactions / listJournalBatches — asOfId lookup with Kysely
const asOfId = await kysely
  .selectFrom('pos_transactions')
  .where('company_id', '=', companyId)
  .where('trx_at', '>=', range.fromStart)
  .where('trx_at', '<', range.nextDayStart)
  .select((eb) => eb.fn.max('id').as('as_of_id'))
  .executeTakeFirst();
```

**Keep as raw SQL (complex aggregations):**
- Balance aggregation: `SUM(jl.debit)`, `SUM(jl.credit)`, `GROUP BY`
- Period calculations with CASE WHEN
- Multi-table JOINs with journal_lines + accounts + account_types
- Paged opening balance subqueries

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/reports.ts` | Modify | Migrate account lookups to Kysely; preserve raw SQL for GL aggregations |

## Dependencies

- Epic 1 completed (journals and account-types migrated to Kysely)

## Estimated Effort

2 days

## Risk Level

Medium (financial reports, aggregation performance critical)

## Dev Agent Record

### Debug Log

1. Story spec referenced non-existent files (`modules-accounting/src/reports-service.ts`, split report route files). Actual implementation lives in `apps/api/src/lib/reports.ts` and `apps/api/src/routes/reports.ts`.
2. Preserved raw SQL for all GL-heavy aggregation queries (`SUM`, `GROUP BY`, `CASE WHEN`, line pagination/opening-balance logic).
3. Migrated only simple retrieval paths to Kysely:
   - account lookups in `getTrialBalance`, `getProfitLoss`, `getTrialBalanceWorksheet`
   - `asOfId` lookups in `listPosTransactions` and `listJournalBatches`
4. `routes/reports.ts` required no structural change because it was already a thin HTTP layer.

### Completion Notes

- Added Kysely-backed retrieval in `apps/api/src/lib/reports.ts` while preserving raw SQL for report aggregation.
- `getTrialBalance`, `getProfitLoss`, and `getTrialBalanceWorksheet` now fetch eligible accounts with Kysely before running raw aggregation queries.
- `listPosTransactions` and `listJournalBatches` now resolve `asOfId` using Kysely `MAX(id)` lookups.
- `apps/api/src/routes/reports.ts` was intentionally left unchanged.
- ✅ Resolved review finding [P2]: preserved empty outlet scope semantics in Kysely `asOfId` lookups so `as_of_id` stays `0` when outlet scope is empty.

### File List

- apps/api/src/lib/reports.ts
- _bmad-output/implementation-artifacts/stories/epic-2/story-2.5-reports-routes-migration.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-03-26: Migrated report retrieval paths to Kysely while preserving raw SQL for GL aggregations.
- 2026-03-26: Validated reports test suite, API typecheck, build, lint, and full API unit tests.
- 2026-03-26: Addressed code review finding for empty-outlet scope consistency in Kysely `asOfId` lookups.
