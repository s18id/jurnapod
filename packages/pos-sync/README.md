# @jurnapod/pos-sync

POS sync module for Jurnapod ERP - handles offline-first data synchronization between POS clients and the central database.

## Overview

The `@jurnapod/pos-sync` package provides:

- **PULL sync**: Fetch master data (items, variants, prices, tables, reservations, open orders)
- **PUSH sync**: Upload transactions, active orders, order updates, item cancellations, variant sales, variant stock adjustments
- **Idempotency**: Client-side `client_tx_id` prevents duplicate processing
- **Tier-based versioning**: MASTER/OPERATIONAL/REALTIME tier sync with version tracking

## Installation

```bash
npm install @jurnapod/pos-sync
```

## Quick Start

```typescript
import { PosSyncModule } from '@jurnapod/pos-sync';
import { createDbPool, DbConn } from '@jurnapod/db';

// Create database connection
const pool = createDbPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
const db = new DbConn(pool);

// Create and initialize module
const module = new PosSyncModule({
  module_id: 'pos',
  client_type: 'POS',
  enabled: true,
});

await module.initialize({
  database: db,
  logger: console,
  config: { env: 'production' },
});
```

## PULL Sync

Fetch data from server (typically on app startup or periodic sync):

```typescript
// Full sync (sinceVersion: 0)
const fullResult = await module.handlePullSync({
  companyId: 1,
  outletId: 1,
  sinceVersion: 0,
});

// Incremental sync
const incrementalResult = await module.handlePullSync({
  companyId: 1,
  outletId: 1,
  sinceVersion: fullResult.currentVersion,
});
```

**Returns:**
```typescript
{
  currentVersion: number,
  payload: {
    items: Item[],
    variants: Variant[],
    variant_prices: VariantPrice[],
    tables: Table[],
    reservations: Reservation[],
    open_orders: ActiveOrder[],
    order_updates: OrderUpdate[],
  }
}
```

## PUSH Sync

Upload POS data to server (typically after transactions or during sync):

```typescript
const result = await module.handlePushSync({
  db,
  companyId: 1,
  outletId: 1,
  transactions: [{
    client_tx_id: 'tx-123',
    company_id: 1,
    outlet_id: 1,
    cashier_user_id: 5,
    status: 'COMPLETED',
    service_type: 'TAKEAWAY',
    trx_at: '2024-01-15T10:30:00+07:00',
    items: [{ item_id: 1, qty: 2, price_snapshot: 15000, name_snapshot: 'Item A' }],
    payments: [{ method: 'CASH', amount: 30000 }],
  }],
  activeOrders: [],
  orderUpdates: [],
  itemCancellations: [],
  variantSales: [],
  variantStockAdjustments: [],
  correlationId: 'sync-batch-123',
});
```

**Returns:**
```typescript
{
  results: TransactionResult[],
  orderUpdateResults: OrderUpdateResult[],
  itemCancellationResults: ItemCancellationResult[],
  variantSaleResults: VariantSaleResult[],
  variantStockAdjustmentResults: VariantStockAdjustmentResult[],
}
```

### Push Result Types

Each result object contains:
- `result`: `'OK' | 'ERROR' | 'DUPLICATE'`
- `message`: Error message if failed

## Data Types

### TransactionPush
```typescript
interface TransactionPush {
  client_tx_id: string;        // Idempotency key
  company_id: number;
  outlet_id: number;
  cashier_user_id: number;
  status: 'COMPLETED' | 'VOID' | 'REFUND';
  service_type: 'TAKEAWAY' | 'DINE_IN';
  table_id?: number;           // Required for DINE_IN
  trx_at: string;              // ISO 8601 timestamp
  items: TransactionItem[];
  payments: Payment[];
}
```

### ActiveOrderPush
```typescript
interface ActiveOrderPush {
  order_id: string;
  company_id: number;
  outlet_id: number;
  service_type: 'TAKEAWAY' | 'DINE_IN';
  table_id?: number;
  order_status: 'OPEN' | 'CLOSED';
  order_state: 'OPEN' | 'CLOSED';
  is_finalized: boolean;
  paid_amount: number;
  opened_at: string;
  updated_at: string;
  lines: OrderLine[];
}
```

### OrderUpdatePush
```typescript
interface OrderUpdatePush {
  update_id: string;           // Idempotency key
  order_id: string;
  company_id: number;
  outlet_id: number;
  event_type: 'ITEM_ADDED' | 'ITEM_MODIFIED' | 'ITEM_CANCELLED' | 'STATUS_CHANGED';
  delta_json: string;          // JSON with changes
  device_id: string;
  event_at: string;
}
```

### ItemCancellationPush
```typescript
interface ItemCancellationPush {
  cancellation_id: string;     // Idempotency key
  order_id: string;
  item_id: number;
  company_id: number;
  outlet_id: number;
  cancelled_quantity: number;
  reason: string;
  cancelled_at: string;
}
```

## Validation Rules

| Field | Rule |
|-------|------|
| `company_id` | Must match authenticated user's company |
| `service_type: 'DINE_IN'` | Requires `table_id` |
| `order_state` | Must be `'OPEN'` or `'CLOSED'` |
| `service_type` | Must be `'TAKEAWAY'` or `'DINE_IN'` |

## Idempotency

All push operations support idempotency via client-generated IDs:

| Operation | Idempotency Key |
|-----------|-----------------|
| Transaction | `client_tx_id` |
| Order Update | `update_id` |
| Item Cancellation | `cancellation_id` |
| Variant Sale | `client_tx_id` |

Duplicate pushes return `result: 'DUPLICATE'` without reprocessing.

## Architecture

```
packages/pos-sync/
├── src/
│   ├── index.ts                 # Exports PosSyncModule
│   ├── pos-sync-module.ts       # Main module class
│   ├── pull/                    # PULL sync logic
│   ├── push/                    # PUSH sync logic
│   ├── endpoints/              # HTTP endpoint factory
│   └── core/                    # Data service
```

## Testing

```bash
# Run integration tests (requires database)
npm test -w @jurnapod/pos-sync

# Run once
npm run test:run -w @jurnapod/pos-sync
```

**Note**: Integration tests require a real database. Set up `.env` with database credentials:

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=jurnapod_test
```

## Related Packages

- [@jurnapod/sync-core](../sync-core) - Sync infrastructure and module interface
- [@jurnapod/db](../db) - Database connectivity
- [@jurnapod/api](../../apps/api) - HTTP API using this module