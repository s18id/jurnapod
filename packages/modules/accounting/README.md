# @jurnapod/modules-accounting

Accounting module for Jurnapod ERP — chart of accounts, journal generation, posting integrity, and financial reporting.

## Overview

The `@jurnapod/modules-accounting` package provides:

- **Chart of accounts** — Account management and classification
- **Journal service** — Journal batch and line CRUD
- **Posting service** — Business document to journal entry mapping
- **Reconciliation** — Data consistency verification
- **Sync posting** — POS sync to journal integration

## Installation

```bash
npm install @jurnapod/modules-accounting
```

## Usage

### Accounts

```typescript
import { AccountsService, AccountTypesService } from '@jurnapod/modules-accounting';

const accountsService = new AccountsService(db);

// Create account
const account = await accountsService.createAccount({
  companyId: 1,
  code: '1101',
  name: 'Cash',
  type: 'ASSET',
  subtype: 'CASH',
  isActive: true
});

// Get account tree
const tree = await accountsService.getAccountTree(1);
```

### Journals

```typescript
import { JournalsService } from '@jurnapod/modules-accounting';

const journalsService = new JournalsService(db);

// Create journal batch
const batch = await journalsService.createBatch({
  companyId: 1,
  journalDate: new Date('2024-01-15'),
  reference: 'POS-2024-001',
  description: 'Daily sales settlement',
  lines: [
    { accountId: revenueId, debit: 0, credit: 100000 },
    { accountId: taxId, debit: 0, credit: 10000 },
    { accountId: cashId, debit: 110000, credit: 0 }
  ]
});

// Post batch
await journalsService.postBatch(batch.id, userId);
```

### Posting Service

```typescript
import { PostingService } from '@jurnapod/modules-accounting';

const postingService = new PostingService(db, accountsService);

// Post sale transaction
const journalBatch = await postingService.postSale({
  companyId: 1,
  transactionId: 'TRX-123',
  transactionDate: new Date(),
  lines: [
    { itemId: 1, amount: 100000, taxAmount: 10000, accountCode: 'REVENUE' }
  ],
  payments: [
    { method: 'CASH', amount: 110000 }
  ]
});

// Post inventory movement
const inventoryJournal = await postingService.postInventoryMovement({
  companyId: 1,
  movementType: 'SALE',
  items: [{ itemId: 1, quantity: 1, unitCost: 25000 }],
  cogsAccountCode: 'COGS',
  inventoryAccountCode: 'INVENTORY'
});
```

## Posting Types

| Type | Description |
|------|-------------|
| `SALE` | Revenue from sale |
| `REFUND` | Refund to customer |
| `VOID` | Voided transaction |
| `INVENTORY_SALE` | COGS on sale |
| `INVENTORY_REFUND` | COGS reversal |
| `DEPRECIATION` | Asset depreciation |

## Account Types

| Type | Balance | Examples |
|------|---------|----------|
| `ASSET` | Debit | Cash, Accounts Receivable, Inventory |
| `LIABILITY` | Credit | Accounts Payable, Taxes Payable |
| `EQUITY` | Credit | Owner's Capital, Retained Earnings |
| `REVENUE` | Credit | Sales Revenue, Service Income |
| `EXPENSE` | Debit | COGS, Rent, Wages |

## Architecture

```
packages/modules-accounting/
├── src/
│   ├── index.ts                    # Main exports
│   ├── posting.ts                  # Posting service
│   ├── journals-service.ts         # Journal CRUD
│   ├── accounts-service.ts         # Account management
│   ├── account-types-service.ts    # Account classification
│   ├── posting/
│   │   ├── index.ts               # Posting exports
│   │   ├── sales.ts               # Sale posting logic
│   │   ├── cogs.ts                # COGS posting logic
│   │   ├── common.ts              # Common posting helpers
│   │   ├── sync-push.ts           # POS sync posting
│   │   └── depreciation.ts        # Depreciation posting
│   └── reconciliation/
│       └── index.ts               # Reconciliation checks
```

## Related Packages

- [@jurnapod/db](../../packages/db) - Database connectivity
- [@jurnapod/shared](../../packages/shared) - Shared schemas
- [@jurnapod/modules-sales](../sales) - Sales events
- [@jurnapod/modules-inventory](../inventory) - Inventory events