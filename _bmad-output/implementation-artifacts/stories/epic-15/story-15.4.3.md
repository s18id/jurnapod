# Story 15.4.3: Payment Routes

Status: ready-for-dev

## Story

As a backoffice user or POS device,
I want to process and list payments via /sales/payments endpoints,
so that I can record payment transactions with GL posting for bank reconciliation.

## User Story

As a user receiving payments,
I want to process payments against invoices or orders,
so that I can record cash flow and maintain accurate bank reconciliation data.

## Acceptance Criteria

1. **AC-1:** Payments processed with GL posting
2. **AC-2:** Payment methods validated (cash, card, bank_transfer, etc.)
3. **AC-3:** Refunds handled correctly
4. **AC-4:** Bank reconciliation data preserved
5. **AC-5:** All tests pass

## Tasks / Subtasks

- [ ] Task 1: Analyze legacy payment routes (AC: 1, 2, 3, 4)
  - [ ] Subtask 1.1: Find and read legacy payment routes
  - [ ] Subtask 1.2: Identify payment method validation
  - [ ] Subtask 1.3: Identify GL posting for payments
  - [ ] Subtask 1.4: Identify refund handling
- [ ] Task 2: Implement GET /sales/payments - List with filtering (AC: 4)
  - [ ] Subtask 2.1: Accept query params: date_from, date_to, method, invoice_id
  - [ ] Subtask 2.2: Filter by company_id from auth context
  - [ ] Subtask 2.3: Return paginated payment list
- [ ] Task 3: Implement POST /sales/payments - Process payments (AC: 1, 2, 3, 4)
  - [ ] Subtask 3.1: Validate payment payload with Zod
  - [ ] Subtask 3.2: Validate payment method
  - [ ] Subtask 3.3: Create payment record with GL posting
  - [ ] Subtask 3.4: Handle refund scenario (negative amount or type)
  - [ ] Subtask 3.5: Preserve bank reconciliation data (reference numbers, etc.)
- [ ] Task 4: Write comprehensive tests (AC: 5)
  - [ ] Subtask 4.1: Test payment processing with GL
  - [ ] Subtask 4.2: Test payment method validation
  - [ ] Subtask 4.3: Test refund handling
  - [ ] Subtask 4.4: Test bank reconciliation data preservation

## Dev Notes

### Technical Context

**Routes to Implement:**
- `apps/api/src/routes/sales/payments.ts` (GET /sales/payments, POST /sales/payments)
- Framework: Hono
- Complexity: MEDIUM - Financial data, GL posting

**Payment Data Model:**
- id, payment_number, invoice_id (nullable), outlet_id, company_id
- amount, currency, payment_method (cash, card, bank_transfer, e_wallet)
- reference_number, collected_by, collected_at
- is_refund, original_payment_id (for refunds)
- created_at, updated_at

**Payment GL Posting:**
- Debit: Cash/Bank account (based on payment method)
- Credit: Customer receivable / Invoice

**Refund GL Posting:**
- Debit: Customer receivable / Invoice (reversal)
- Credit: Cash/Bank account

### Project Structure Notes

- Use `@/lib/db` for database access with transactions
- Route file: `apps/api/src/routes/sales/payments.ts`
- Test file: `apps/api/src/routes/sales/payments.test.ts`

### Testing Standards

- Use Node.js `test` module
- Test various payment methods
- Test GL posting balance
- Test refund scenarios
- Test bank reconciliation data
- Ensure closeDbPool cleanup hook

## File List

- `apps/api/src/routes/sales/payments.ts` - Implement payment routes
- `apps/api/src/routes/sales/payments.test.ts` - Add tests
