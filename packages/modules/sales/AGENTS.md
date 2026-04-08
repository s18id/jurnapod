# AGENTS.md — @jurnapod/modules-sales

## Package Purpose

Sales domain for Jurnapod ERP — invoices, payments, credit notes, and light AR management.

**Core Capabilities:**
- **Invoice management**: Service invoices with line items, tax, and discounts
- **Payment recording**: Cash, card, e-wallet payment methods
- **Credit notes**: Reversal of invoices with AR tracking
- **Order integration**: Links to POS orders and reservations

**Boundaries:**
- ✅ In: Invoice CRUD, payment recording, credit notes, AR tracking
- ❌ Out: Journal posting (modules-accounting), inventory deduction (modules-inventory)

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### Invoice Creation

```typescript
import { InvoiceService } from '@jurnapod/modules-sales';

const invoiceService = new InvoiceService(db);

// Create invoice
const invoice = await invoiceService.createInvoice({
  companyId: 1,
  outletId: 1,
  customerId: 5,
  invoiceDate: new Date('2024-01-15'),
  lines: [
    { itemId: 10, description: 'Latte', qty: 2, unitPrice: 25000 },
    { itemId: 11, description: 'Pastry', qty: 1, unitPrice: 15000 }
  ],
  taxRate: 0.10,
  discountPercent: 0,
  payments: [
    { method: 'CASH', amount: 60500 }
  ]
});
```

### Payment Recording

```typescript
import { PaymentService } from '@jurnapod/modules-sales';

const paymentService = new PaymentService(db);

// Record payment
const payment = await paymentService.recordPayment({
  companyId: 1,
  outletId: 1,
  invoiceId: invoice.id,
  method: 'CARD',
  amount: 60500,
  reference: 'CARD-XXXX1234'
});
```

### Credit Note

```typescript
import { CreditNoteService } from '@jurnapod/modules-sales';

const creditNoteService = new CreditNoteService(db);

// Create credit note (void/reverse)
const creditNote = await creditNoteService.createCreditNote({
  companyId: 1,
  outletId: 1,
  originalInvoiceId: invoice.id,
  reason: 'Customer complaint - item wrong',
  lines: [
    { itemId: 10, qty: 1, unitPrice: 25000 }  // Partial reversal
  ]
});
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| InvoiceService | `services/invoice-service.ts` | Invoice CRUD |
| PaymentService | `services/payment-service.ts` | Payment recording |
| CreditNoteService | `services/credit-note-service.ts` | Credit notes |
| OrderService | `services/order-service.ts` | POS order integration |
| AccessScope | `interfaces/access-scope-checker.ts` | Outlet access validation |

### File Structure

```
packages/modules/sales/
├── src/
│   ├── index.ts                    # Main exports
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── invoice-service.ts      # Invoice CRUD
│   │   ├── payment-service.ts      # Payment recording
│   │   ├── credit-note-service.ts # Credit notes
│   │   ├── order-service.ts        # Order integration
│   │   └── sales-db.ts             # DB helpers
│   │
│   ├── interfaces/
│   │   ├── index.ts
│   │   ├── repository.ts
│   │   └── access-scope-checker.ts
│   │
│   └── types/
│       ├── invoices.ts
│       ├── payments.ts
│       ├── credit-notes.ts
│       └── sales.ts
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### Money Handling

1. **Use integer cents** — never floating point
2. **Calculate tax and discounts** before storing
3. **Verify totals** — sum of lines + tax - discounts must equal payment amount

---

## Review Checklist

When modifying this package:

- [ ] Invoice totals verified (lines + tax - discounts = total)
- [ ] Payment amounts don't exceed invoice balance
- [ ] Credit notes linked to original invoice
- [ ] AR tracking properly maintained
- [ ] No floating-point math for money
- [ ] Kysely query builder used (not raw SQL)
- [ ] Company/outlet scoping on all queries

---

## Related Packages

- `@jurnapod/db` — Database connectivity
- `@jurnapod/shared` — Shared schemas
- `@jurnapod/modules-accounting` — Posts journal entries
- `@jurnapod/modules-inventory` — Deducts stock on sale

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and introduces **severe production risk**:

- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks hide transaction isolation issues that only manifest under real concurrency
- Mocks mask performance problems that only appear with real data volumes
- Integration tests with real DB catch these issues early, before production

**What may still be mocked:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic** (pure computation) may use unit tests without database.

For project-wide conventions, see root `AGENTS.md`.
