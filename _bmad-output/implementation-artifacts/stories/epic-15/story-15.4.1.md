# Story 15.4.1: Invoice Routes

Status: ready-for-dev

## Story

As a backoffice user or POS device,
I want to create and list invoices via /sales/invoices endpoints,
so that I can record sales transactions with proper GL posting.

## User Story

As a user recording sales,
I want to create invoices that automatically generate journal entries,
so that my accounting records stay synchronized with sales activity.

## Acceptance Criteria

1. **AC-1:** POST creates invoice with valid GL journal (debits = credits)
2. **AC-2:** Failed posting rolls back invoice creation (atomic)
3. **AC-3:** Journal lines match invoice totals (debits = credits verified)
4. **AC-4:** Company scoping enforced
5. **AC-5:** All existing tests pass (no regression)
6. **AC-6:** 15+ new tests for edge cases
7. **AC-7:** Load test: 100 invoices/minute sustained
8. **AC-8:** Shadow mode: outputs match legacy exactly

## Tasks / Subtasks

- [ ] Task 1: Analyze legacy invoice routes thoroughly (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Find and read legacy invoice routes
  - [ ] Subtask 1.2: Identify GL posting logic
  - [ ] Subtask 1.3: Identify journal line generation patterns
- [ ] Task 2: Implement GET /sales/invoices - List with filtering (AC: 4, 5)
  - [ ] Subtask 2.1: Accept query params: date_from, date_to, status, outlet_id
  - [ ] Subtask 2.2: Filter by company_id from auth context
  - [ ] Subtask 2.3: Return paginated invoice list
- [ ] Task 3: Implement POST /sales/invoices - Create with GL posting (AC: 1, 2, 3, 4)
  - [ ] Subtask 3.1: Validate invoice payload with Zod
  - [ ] Subtask 3.2: Create invoice record
  - [ ] Subtask 3.3: Generate journal entries (debit = credit verification)
  - [ ] Subtask 3.4: Use database transaction for atomicity
  - [ ] Subtask 3.5: Rollback on any failure
- [ ] Task 4: Write comprehensive tests (AC: 5, 6, 7)
  - [ ] Subtask 4.1: Test invoice creation with GL
  - [ ] Subtask 4.2: Test debit/credit balance verification
  - [ ] Subtask 4.3: Test rollback on GL failure
  - [ ] Subtask 4.4: Test edge cases (zero items, negative price, etc.)
  - [ ] Subtask 4.5: Load test 100 invoices/minute
- [ ] Task 5: Shadow mode validation (AC: 8)
  - [ ] Subtask 5.1: Compare outputs with legacy route
  - [ ] Subtask 5.2: Document any discrepancies

## Dev Notes

### Technical Context

**Routes to Implement:**
- `apps/api/src/routes/sales/invoices.ts` (GET /sales/invoices, POST /sales/invoices)
- Framework: Hono
- Complexity: CRITICAL - GL posting, financial data

**Invoice Data Model:**
- id, invoice_number, customer_id, outlet_id, company_id
- total_amount, tax_amount, status
- created_at, updated_at

**GL Journal Generation:**
- Debit: Revenue account (or POS revenue)
- Credit: Customer receivable / Cash
- Tax lines: Tax liability account
- MUST balance (debits = credits)

### Critical Requirements

1. **Atomic Transaction:** Invoice + Journal lines in single DB transaction
2. **GL Balance:** Debits must equal credits
3. **Shadow Mode:** Run alongside legacy for validation
4. **Performance:** 100 invoices/minute sustained

### Project Structure Notes

- Use `@/lib/db` for database access with transactions
- Route file: `apps/api/src/routes/sales/invoices.ts`
- Test file: `apps/api/src/routes/sales/invoices.test.ts`

### Testing Standards

- 15+ unit tests covering all code paths
- Test GL balance verification
- Test atomic rollback scenarios
- Load test: 100 invoices/minute
- Shadow mode comparison with legacy
- Ensure closeDbPool cleanup hook

## File List

- `apps/api/src/routes/sales/invoices.ts` - Implement invoice routes
- `apps/api/src/routes/sales/invoices.test.ts` - Comprehensive tests
