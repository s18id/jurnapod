# @jurnapod/modules-sales

Sales domain for Jurnapod ERP — invoices, payments, credit notes, and light AR.

## Overview

The `@jurnapod/modules-sales` package provides:

- **Invoice management** — Service invoices with line items, tax, discounts
- **Payment recording** — Cash, card, e-wallet payment methods
- **Credit notes** — Reversal of invoices with AR tracking
- **Order integration** — Links to POS orders and reservations

## Installation

```bash
npm install @jurnapod/modules-sales
```

## Usage

### Invoices

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
    { 
      itemId: 10, 
      description: 'Latte', 
      qty: 2, 
      unitPrice: 25000,
      taxRate: 0.10
    },
    { 
      itemId: 11, 
      description: 'Pastry', 
      qty: 1, 
      unitPrice: 15000,
      taxRate: 0.10
    }
  ],
  discountPercent: 0,
  notes: 'Customer is VIP'
});

// Get invoice with payments
const fullInvoice = await invoiceService.getInvoiceWithPayments(1, invoice.id);
```

### Payments

```typescript
import { PaymentService } from '@jurnapod/modules-sales';

const paymentService = new PaymentService(db);

// Record payment
const payment = await paymentService.recordPayment({
  companyId: 1,
  outletId: 1,
  invoiceId: invoice.id,
  method: 'CASH',
  amount: 60500,
  paidAt: new Date()
});

// Record partial payment
const cardPayment = await paymentService.recordPayment({
  companyId: 1,
  outletId: 1,
  invoiceId: invoice.id,
  method: 'CARD',
  amount: 30000,
  reference: 'CARD-XXXX1234'
});
```

### Payment Methods

| Method | Description |
|--------|-------------|
| `CASH` | Cash payment |
| `CARD_DEBIT` | Debit card |
| `CARD_CREDIT` | Credit card |
| `EWALLET` | E-wallet (GoPay, OVO, etc.) |
| `BANK_TRANSFER` | Bank transfer |
| `QRIS` | QRIS payment |

### Credit Notes

```typescript
import { CreditNoteService } from '@jurnapod/modules-sales';

const creditNoteService = new CreditNoteService(db);

// Create credit note (void/reverse invoice)
const creditNote = await creditNoteService.createCreditNote({
  companyId: 1,
  outletId: 1,
  originalInvoiceId: invoice.id,
  reason: 'Customer complaint',
  lines: [
    { itemId: 10, qty: 1, unitPrice: 25000 }
  ]
});

// Credit note automatically:
// - Creates AR reversal
// - Links to original invoice
// - Updates invoice balance
```

### AR Tracking

```typescript
// Get outstanding invoices for customer
const outstanding = await invoiceService.getOutstandingByCustomer(1, 5);
// [{ invoiceNo: 'INV-001', balance: 27500, dueDate: ... }, ...]

// Apply payment to reduce balance
await invoiceService.applyPayment(invoice.id, payment.id);
```

## Architecture

```
packages/modules-sales/
├── src/
│   ├── index.ts                    # Main exports
│   ├── services/                   # Business logic
│   │   ├── invoice-service.ts
│   │   ├── payment-service.ts
│   │   ├── credit-note-service.ts
│   │   └── order-service.ts
│   ├── interfaces/                 # Contracts
│   └── types/                      # Domain types
```

## Related Packages

- [@jurnapod/modules-accounting](../accounting) - Posts journal entries
- [@jurnapod/modules-inventory](../inventory) - Deducts stock on sale
- [@jurnapod/modules-reservations](../reservations) - Links to reservations
- [@jurnapod/db](../../packages/db) - Database connectivity
- [@jurnapod/shared](../../packages/shared) - Shared schemas