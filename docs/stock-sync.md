# Stock Synchronization System

## Overview

This module implements bidirectional stock synchronization between the POS (offline-first) and backend server. It ensures accurate stock tracking, prevents overselling, and handles conflict resolution.

## Architecture

### Server-Side Components

1. **Stock Sync Endpoint** (`apps/api/app/api/sync/stock/route.ts`)
   - `GET /api/v1/sync/stock` - Returns stock updates since last sync
   - Supports cursor-based pagination
   - Returns quantity, reserved_quantity, available_quantity for each product

2. **Stock Reservation Endpoint** (`apps/api/app/api/sync/stock/reserve/route.ts`)
   - `POST /api/v1/sync/stock/reserve` - Reserves stock for a transaction
   - Validates available stock before reserving
   - Returns 409 Conflict if insufficient stock
   - Atomic reservation with row-level locking

3. **Stock Release Endpoint** (`apps/api/app/api/sync/stock/release/route.ts`)
   - `POST /api/v1/sync/stock/release` - Releases reserved stock
   - Used for voids, refunds, and cancellations
   - Returns reserved stock to available pool

### POS-Side Components

1. **Stock Sync Handler** (`apps/pos/src/sync/stock.ts`)
   - Fetches stock updates from server
   - Updates local IndexedDB inventory_stock table
   - Handles cursor-based pagination
   - Server wins conflict resolution

2. **Outbox Stock Integration** (`apps/pos/src/sync/outbox-stock.ts`)
   - Creates stock reservation jobs in outbox
   - Creates stock release jobs for voids
   - Sorts jobs by priority (reservations before transactions)
   - Processes stock operations during sync

3. **Stock Validation** (integrated with cart/checkout)
   - Validates stock availability before adding to cart
   - Uses local cache for offline validation
   - Flags stale stock data (> 1 hour old)

## Data Flow

### Stock Sync (Server → POS)

```
Server (inventory_stock table)
    ↓ (GET /api/v1/sync/stock)
POS Inventory Stock Cache
    ↓ (offline validation)
Cart/Checkout
```

### Stock Reservation (POS → Server)

```
POS Transaction Created
    ↓ (add to outbox)
Outbox Job: STOCK_RESERVATION
    ↓ (during sync)
POST /api/v1/sync/stock/reserve
    ↓ (server validates)
Stock Reserved or Conflict Returned
```

## Conflict Resolution

### Server Wins Strategy

When POS and server have conflicting stock data:
1. Server stock values are always authoritative
2. POS updates local cache with server values
3. If reservation fails due to insufficient stock:
   - Server returns 409 Conflict with details
   - POS marks transaction for manual review
   - Cashier notified of stock discrepancy

### Stale Data Detection

- Stock data older than 60 minutes is considered stale
- Stale data shows warning indicator in UI
- Transactions allowed but flagged for review
- Priority given to server values during sync

## Database Schema

### Server: inventory_stock

```sql
CREATE TABLE inventory_stock (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  reserved_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  available_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id, outlet_id, product_id),
  CHECK (available_quantity = quantity - reserved_quantity)
);
```

### POS: inventory_stock (IndexedDB)

```typescript
interface InventoryStockRow {
  pk: string;                      // "company:outlet:item"
  company_id: number;
  outlet_id: number;
  item_id: number;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  last_updated_at: string;
  data_version: number;
}
```

## API Endpoints

### GET /api/v1/sync/stock

**Query Parameters:**
- `outlet_id` (required) - Outlet to sync stock for
- `since` (optional) - ISO timestamp for incremental sync
- `cursor` (optional) - Pagination cursor
- `limit` (optional) - Max items per page (default: 100, max: 500)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "product_id": 1,
        "outlet_id": 1,
        "quantity": 100,
        "reserved_quantity": 10,
        "available_quantity": 90,
        "updated_at": "2026-03-16T10:00:00Z"
      }
    ],
    "has_more": false,
    "next_cursor": "...",
    "sync_timestamp": "2026-03-16T10:00:00Z"
  }
}
```

### POST /api/v1/sync/stock/reserve

**Request Body:**
```json
{
  "client_tx_id": "uuid",
  "company_id": 1,
  "outlet_id": 1,
  "items": [
    { "item_id": 1, "quantity": 5 }
  ]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "reserved": true,
    "client_tx_id": "uuid",
    "items_reserved": 1
  }
}
```

**Conflict Response (409):**
```json
{
  "success": false,
  "error": {
    "code": "STOCK_CONFLICT",
    "message": "Insufficient stock",
    "conflicts": [
      { "item_id": 1, "requested": 5, "available": 2 }
    ]
  }
}
```

### POST /api/v1/sync/stock/release

**Request Body:**
```json
{
  "client_tx_id": "uuid",
  "company_id": 1,
  "outlet_id": 1,
  "items": [
    { "item_id": 1, "quantity": 5 }
  ]
}
```

## Testing

### Server Tests

Run server-side stock sync tests:
```bash
cd apps/api
npm test -- app/api/sync/stock/route.test.ts
```

### POS Tests

Run POS stock sync tests:
```bash
cd apps/pos
npm test -- src/sync/__tests__/stock.test.ts
```

### Test Coverage

- Stock sync with pagination
- Stock reservation success/failure
- Stock release after void/refund
- Conflict scenarios (server < POS stock)
- Stale data detection
- Race condition handling
- Idempotency (duplicate reservation attempts)

## Implementation Notes

1. **Idempotency**: Stock reservations use client_tx_id for deduplication. Same client_tx_id will not reserve stock twice.

2. **Atomicity**: Stock reservations use database transactions with row-level locking to prevent race conditions.

3. **Offline-First**: POS validates stock from local cache. Stale data is allowed but flagged. Final validation happens on server during sync.

4. **Performance**: Stock sync uses cursor-based pagination for efficient large dataset handling. Default page size is 100 items.

5. **Audit Trail**: All stock reservations and releases are logged in inventory_transactions table for audit purposes.

## Security Considerations

- All endpoints require authentication with valid JWT token
- Company and outlet scoping enforced on all operations
- Cashier role allowed for stock reservation/release
- Row-level security via company_id and outlet_id filters
