# Story 15.5.3: Journal Routes

Status: ready-for-dev

## Story

As a backoffice user or accountant,
I want to view and create journal entries via /journals endpoints,
so that I can record manual adjustments and review GL activity.

## User Story

As an accountant,
I want to list journal entries and create manual journal entries,
so that I can record adjustments, corrections, and view GL transaction history.

## Acceptance Criteria

1. **AC-1:** Journal entries created correctly with balanced debits/credits
2. **AC-2:** Batch operations atomic (all or nothing)
3. **AC-3:** Void/correction workflows work
4. **AC-4:** All tests pass

## Tasks / Subtasks

- [ ] Task 1: Analyze journal operations (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Find and read legacy journal routes
  - [ ] Subtask 1.2: Identify manual entry creation
  - [ ] Subtask 1.3: Identify void/correction logic
- [ ] Task 2: Implement GET /journals - List journal entries (AC: 1)
  - [ ] Subtask 2.1: Accept query params: date_from, date_to, account_id, entry_type
  - [ ] Subtask 2.2: Filter by company_id from auth context
  - [ ] Subtask 2.3: Return paginated list with line items
- [ ] Task 3: Implement POST /journals - Create manual entries (AC: 1, 2)
  - [ ] Subtask 3.1: Validate journal entry with Zod (debits = credits)
  - [ ] Subtask 3.2: Create journal header
  - [ ] Subtask 3.3: Create journal lines
  - [ ] Subtask 3.4: Use database transaction for atomicity
  - [ ] Subtask 3.5: Verify debits = credits before commit
- [ ] Task 4: Implement POST /journals/:id/void - Void entry (AC: 3)
  - [ ] Subtask 4.1: Validate entry can be voided
  - [ ] Subtask 4.2: Create reversal journal entry
  - [ ] Subtask 4.3: Mark original as voided
- [ ] Task 5: Write comprehensive tests (AC: 4)
  - [ ] Subtask 5.1: Test balanced entry creation
  - [ ] Subtask 5.2: Test rejection of unbalanced entries
  - [ ] Subtask 5.3: Test void workflow
  - [ ] Subtask 5.4: Test batch atomicity

## Dev Notes

### Technical Context

**Routes to Implement:**
- `apps/api/src/routes/journals.ts` (GET /journals, POST /journals, POST /journals/:id/void)
- Framework: Hono
- Complexity: MEDIUM - GL operations, atomicity

**Journal Entry Data Model:**
- id, entry_number, company_id, outlet_id
- entry_type (manual, adjustment, opening, closing)
- description, reference
- status (draft, posted, voided)
- created_by, created_at, posted_at, voided_at

**Journal Line Data Model:**
- id, journal_id, account_id
- debit_amount, credit_amount
- description

### Critical Requirements

1. **Balance Verification:** Debits must equal credits before posting
2. **Atomic Transactions:** All lines in single transaction
3. **Void Workflow:** Creates reversal entry, marks original voided
4. **Audit Trail:** Track creation, posting, voiding

### Project Structure Notes

- Use `@/lib/db` for database access with transactions
- Route file: `apps/api/src/routes/journals.ts`
- Test file: `apps/api/src/routes/journals.test.ts`

### Testing Standards

- Use Node.js `test` module
- Test balanced entry creation
- Test unbalanced entry rejection
- Test void workflow creates reversal
- Test atomic batch operations
- Ensure closeDbPool cleanup hook

## File List

- `apps/api/src/routes/journals.ts` - Journal routes
- `apps/api/src/routes/journals.test.ts` - Journal tests
