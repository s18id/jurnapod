# @jurnapod/offline-db

Offline-first IndexedDB wrapper using Dexie for POS Progressive Web App.

## Overview

The `@jurnapod/offline-db` package provides:

- **Dexie.js wrapper** for type-safe IndexedDB access
- **Offline storage** for POS operational data
- **Sync-ready data structures** aligned with server schemas
- **Schema versioning** for database migrations

## Installation

```bash
npm install @jurnapod/offline-db
```

## Quick Start

```typescript
import { createOfflineDb } from '@jurnapod/offline-db/dexie';

// Create database with schema version
const db = createOfflineDb({
  version: 1,
  tables: ['items', 'variants', 'orders', 'transactions']
});

// Store data locally
await db.items.put({
  id: 1,
  companyId: 1,
  outletId: 1,
  name: 'Latte',
  code: 'LAT001',
  price: 25000
});

// Query data
const items = await db.items
  .where('companyId')
  .equals(1)
  .toArray();
```

## Data Tables

| Table | Primary Key | Indexes |
|-------|-------------|---------|
| `items` | `id` | `companyId`, `outletId`, `code` |
| `variants` | `id` | `itemId`, `code` |
| `orders` | `id` | `companyId`, `outletId`, `status` |
| `transactions` | `client_tx_id` | `companyId`, `outletId` |

## Architecture

```
packages/offline-db/
├── dexie/
│   ├── index.ts              # Main exports (createOfflineDb)
│   ├── db.ts                 # Dexie database setup and migrations
│   └── types.ts             # Type definitions
```

## Sync Integration

Data structures in offline-db are designed to sync with `@jurnapod/pos-sync`:

```typescript
// Local transaction format matches sync contract
interface LocalTransaction {
  client_tx_id: string;      // Idempotency key
  company_id: number;
  outlet_id: number;
  cashier_user_id: number;
  status: 'COMPLETED' | 'VOID' | 'REFUND';
  service_type: 'TAKEAWAY' | 'DINE_IN';
  trx_at: string;
  items: TransactionItem[];
  payments: Payment[];
}
```

## Security Notes

- **Clear data on logout** — call `db.delete()` to remove all local data
- **No sensitive data in IndexedDB** — may be accessible if device is compromised
- **Consider encryption** for production deployment

## Related Packages

- [@jurnapod/pos-sync](../pos-sync) - Sync module using this offline storage
- [@jurnapod/shared](../shared) - Shared Zod schemas