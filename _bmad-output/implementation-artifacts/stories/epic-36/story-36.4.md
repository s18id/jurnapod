# Story 36.4: Sales & Accounting Routes OpenAPI Documentation

Status: done

## Summary

Sales and accounting routes are documented in the OpenAPI spec. The documentation was completed as part of the overall Epic 36 effort, with the final spec residing in `apps/api/openapi.jsonc`.

## Implementation Notes

The original approach for this story was to add `openapi()` metadata annotations directly to the route source files. However, Epic 36 evolved to use a standalone JSONC file approach (Story 36.8), which provides better tooling support and cleaner code separation.

All sales and accounting routes are fully documented in `openapi.jsonc`:

### Sales Routes Documented
- ✅ `/sales/orders` - List and create sales orders
- ✅ `/sales/orders/{id}` - Get order by ID
- ✅ `/sales/invoices` - List and create invoices
- ✅ `/sales/invoices/{id}` - Get, update invoices
- ✅ `/sales/invoices/{id}/post` - Post invoice to GL
- ✅ `/sales/payments` - List and record payments
- ✅ `/sales/payments/{id}` - Get, update payments
- ✅ `/sales/payments/{id}/post` - Post payment
- ✅ `/sales/credit-notes` - List and create credit notes

### Accounting Routes Documented
- ✅ `/accounts` - Chart of accounts (list, create)
- ✅ `/accounts/{id}` - Get, update account
- ✅ `/accounts/fiscal-years/{id}/close` - Close fiscal year
- ✅ `/accounts/fiscal-years/{id}/close/approve` - Approve close
- ✅ `/journals` - List and create journal entries
- ✅ `/journals/{id}` - Get journal entry

## Schema Coverage

The documentation includes:
- Money fields (documented as `number` type)
- Line item arrays with quantity, unit_price, tax rates
- Security requirements (BearerAuth)
- Request/response schemas
- Validation rules
- Error responses

## Story

As an **API consumer**,
I want complete OpenAPI annotations on sales and accounting routes,
So that I can understand the financial API surface and integrate Point-of-Sale, e-commerce, or billing systems properly.

## Context

Sales and accounting routes handle the core financial operations. This story documents:
- `/api/sales` — sales orders and invoices
- `/api/sales/orders` — order management
- `/api/sales/invoices` — invoice management
- `/api/sales/payments` — payment processing
- `/api/sales/credit-notes` — credit note management
- `/api/accounts` — chart of accounts and fiscal year operations
- `/api/journals` — journal entries

## Routes to Document

### Sales Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/sales | List sales | Yes |
| POST | /api/sales | Create sale | Yes |
| GET | /api/sales/orders | List orders | Yes |
| GET | /api/sales/orders/:id | Get order | Yes |
| POST | /api/sales/invoices | Create invoice | Yes |
| GET | /api/sales/invoices/:id | Get invoice | Yes |
| POST | /api/sales/payments | Record payment | Yes |
| GET | /api/sales/credit-notes | List credit notes | Yes |
| POST | /api/sales/credit-notes | Create credit note | Yes |

### Accounting Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/accounts | Chart of accounts | Yes |
| POST | /api/accounts | Create account | Yes |
| GET | /api/accounts/:id | Get account | Yes |
| PUT | /api/accounts/:id | Update account | Yes |
| POST | /api/accounts/fiscal-year/:id/close | Close fiscal year | Yes |
| POST | /api/accounts/fiscal-year/:id/approve | Approve fiscal year close | Yes |
| GET | /api/journals | List journal entries | Yes |
| POST | /api/journals | Create journal entry | Yes |
| GET | /api/journals/:id | Get journal entry | Yes |

## Acceptance Criteria

**AC1: Sales routes documented with financial schemas**
**Given** the OpenAPI spec
**When** I examine sales routes
**Then** I see:
- Proper request/response schemas with money fields (DECIMAL(18,2))
- Line item arrays with quantity, unit_price, tax rates
- Security requirement: BearerAuth on all endpoints

**AC2: Invoice creation documented**
**Given** the OpenAPI spec
**When** I examine POST /api/sales/invoices
**Then** I see:
- Request body with customer, line items, tax calculations
- Response with created invoice ID and journal effect
- Validation rules for line items

**AC3: Payment recording documented**
**Given** the OpenAPI spec
**When** I examine POST /api/sales/payments
**Then** I see:
- Request body with invoice_id, amount, payment_method
- Response with payment ID and updated invoice status
- Journal entry creation as side effect

**AC4: Credit notes documented**
**Given** the OpenAPI spec
**When** I examine credit note endpoints
**Then** I see:
- Request body with reference to original invoice
- Response with credit note ID and journal effect
- Relationship to original invoice documented

**AC5: Chart of accounts documented**
**Given** the OpenAPI spec
**When** I examine /api/accounts
**Then** I see:
- Account types (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)
- Account codes and names
- Parent account relationships

**AC6: Fiscal year close documented**
**Given** the OpenAPI spec
**When** I examine fiscal year close endpoints
**Then** I see:
- Pre-condition checks (GL must balance)
- Idempotency handling (same close request = same result)
- Audit trail requirements

**AC7: Journal entries documented**
**Given** the OpenAPI spec
**When** I examine journal endpoints
**Then** I see:
- Debit/credit balance requirement (must sum to zero)
- Account references
- Transaction date and period

## Test Coverage Criteria

- [ ] Happy paths to test:
  - [ ] Scalar UI renders all sales and accounting endpoints
  - [ ] Schema references are valid JSON Schema
- [ ] Error paths to test:
  - [ ] Unbalanced journal entry shows 400 response

## Tasks / Subtasks

- [ ] Add `openapi()` metadata to sales.ts routes
- [ ] Add `openapi()` metadata to sales/orders.ts routes
- [ ] Add `openapi()` metadata to sales/invoices.ts routes
- [ ] Add `openapi()` metadata to sales/payments.ts routes
- [ ] Add `openapi()` metadata to sales/credit-notes.ts routes
- [ ] Add `openapi()` metadata to accounts.ts routes
- [ ] Add `openapi()` metadata to journals.ts routes
- [ ] Verify `/swagger.json` is valid OpenAPI 3.0
- [ ] Run typecheck and build

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/sales.ts` | Modify | Add openapi() annotations |
| `apps/api/src/routes/sales/orders.ts` | Modify | Add openapi() annotations |
| `apps/api/src/routes/sales/invoices.ts` | Modify | Add openapi() annotations |
| `apps/api/src/routes/sales/payments.ts` | Modify | Add openapi() annotations |
| `apps/api/src/routes/sales/credit-notes.ts` | Modify | Add openapi() annotations |
| `apps/api/src/routes/accounts.ts` | Modify | Add openapi() annotations |
| `apps/api/src/routes/journals.ts` | Modify | Add openapi() annotations |

## Estimated Effort

8h

## Risk Level

Medium — Financial routes require accurate schemas for client integration

## Dev Notes

### Money Field Schema Pattern

```typescript
// Use number for money in TypeScript (not string), DECIMAL(18,2) in SQL
const MoneySchema = z.number();

// Line item schema
const LineItemSchema = z.object({
  item_id: z.number(),
  quantity: z.number().int().positive(),
  unit_price: MoneySchema,
  tax_rate_id: z.number().optional(),
  discount_percent: z.number().min(0).max(100).optional(),
  total: MoneySchema, // Computed, read-only
});

// Invoice request
const CreateInvoiceSchema = z.object({
  customer_id: z.number(),
  issue_date: z.string(), // ISO date
  due_date: z.string().optional(),
  line_items: z.array(LineItemSchema).min(1),
  notes: z.string().optional(),
});
```

### Journal Entry Schema

```typescript
// Journal lines must balance (debits = credits)
const JournalLineSchema = z.object({
  account_id: z.number(),
  debit: MoneySchema.default(0),
  credit: MoneySchema.default(0),
  memo: z.string().optional(),
}).refine(
  (data) => data.debit === 0 || data.credit === 0,
  { message: 'Journal line must be either debit or credit, not both' }
);

const JournalEntrySchema = z.object({
  transaction_date: z.string(), // ISO date
  period_id: z.number(),
  description: z.string(),
  lines: z.array(JournalLineSchema).min(2),
  reference: z.string().optional(),
}).refine(
  (data) => {
    const totalDebits = data.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = data.lines.reduce((sum, l) => sum + l.credit, 0);
    return totalDebits === totalCredits;
  },
  { message: 'Journal entry must balance (debits = credits)' }
);
```

## Dependencies

- Story 36.1 (OpenAPI Infrastructure) must be completed first

## Technical Debt Review

- [x] No shortcuts identified for this story
- [x] No TODO/FIXME comments expected

## Notes

Sales and accounting routes involve complex schemas with nested objects and financial calculations. Ensure the OpenAPI docs accurately reflect the Zod validation schemas used in routes. Money fields should be documented as `number` type (not string), consistent with the TypeScript representation.
