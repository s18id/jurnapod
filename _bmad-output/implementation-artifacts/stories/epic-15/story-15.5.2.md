# Story 15.5.2: Report Routes

Status: ready-for-dev

## Story

As a backoffice user,
I want to generate financial and sales reports via /reports endpoints,
so that I can analyze business performance and ensure compliance.

## User Story

As a business owner or accountant,
I want to generate reports like Trial Balance, P&L, and Daily Sales,
so that I can make informed decisions and maintain financial compliance.

## Acceptance Criteria

1. **AC-1:** Reports generate accurate data matching GL entries
2. **AC-2:** Date filtering works correctly (date_from, date_to)
3. **AC-3:** Export formats supported (JSON, CSV)
4. **AC-4:** Performance acceptable for large datasets

## Tasks / Subtasks

- [ ] Task 1: Analyze legacy report generation (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Find and read legacy report routes
  - [ ] Subtask 1.2: Identify report calculation logic
  - [ ] Subtask 1.3: Identify export format handling
- [ ] Task 2: Implement GET /reports/trial-balance (AC: 1, 2, 4)
  - [ ] Subtask 2.1: Aggregate account balances by date range
  - [ ] Subtask 2.2: Apply company scoping
  - [ ] Subtask 2.3: Optimize for large datasets
- [ ] Task 3: Implement GET /reports/pnl (AC: 1, 2, 4)
  - [ ] Subtask 3.1: Calculate revenue and expenses
  - [ ] Subtask 3.2: Group by period (daily, monthly)
- [ ] Task 4: Implement GET /reports/daily-sales (AC: 1, 2, 4)
  - [ ] Subtask 4.1: Aggregate sales by date
  - [ ] Subtask 4.2: Include tax and discounts
- [ ] Task 5: Implement export formats (AC: 3)
  - [ ] Subtask 5.1: Support JSON format (default)
  - [ ] Subtask 5.2: Support CSV format (query param: format=csv)
- [ ] Task 6: Write report accuracy tests (AC: 4)
  - [ ] Subtask 6.1: Verify trial balance debits = credits
  - [ ] Subtask 6.2: Verify P&L calculations
  - [ ] Subtask 6.3: Verify date filtering
  - [ ] Subtask 6.4: Test CSV export format

## Dev Notes

### Technical Context

**Routes to Implement:**
- `apps/api/src/routes/reports/trial-balance.ts` (GET /reports/trial-balance)
- `apps/api/src/routes/reports/pnl.ts` (GET /reports/pnl)
- `apps/api/src/routes/reports/daily-sales.ts` (GET /reports/daily-sales)
- Framework: Hono
- Complexity: MEDIUM - Aggregation, calculations

**Report Parameters:**
- date_from: Start date (required)
- date_to: End date (required)
- outlet_id: Optional filter
- format: json | csv (optional, default json)

**Trial Balance Report:**
- List all accounts with debit/credit balances
- Total debits must equal total credits

**P&L Report:**
- Revenue accounts by category
- Expense accounts by category
- Net income = total revenue - total expenses

**Daily Sales Report:**
- Total sales per day
- Tax collected
- Discounts given
- Net sales

### Project Structure Notes

- Use `@/lib/db` for database access
- Route files: `apps/api/src/routes/reports/*.ts`
- Test files: `apps/api/src/routes/reports/*.test.ts`

### Testing Standards

- Use Node.js `test` module
- Test report accuracy (verify calculations)
- Test date range filtering
- Test CSV export format
- Test performance with large date ranges
- Ensure closeDbPool cleanup hook

## File List

- `apps/api/src/routes/reports/trial-balance.ts` - Trial balance report
- `apps/api/src/routes/reports/pnl.ts` - Profit & Loss report
- `apps/api/src/routes/reports/daily-sales.ts` - Daily sales report
- `apps/api/src/routes/reports/*.test.ts` - Report tests
