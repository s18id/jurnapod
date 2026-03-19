# API Reference

Jurnapod API endpoints and contracts.

---

## Base URL

- **Development**: `http://localhost:3001/api`
- **Production**: `https://api.yourdomain.com/api`

---

## Authentication

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "jwt_token_here",
  "refresh_token": "refresh_token_here",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "company_id": 1
  }
}
```

---

## POS Sync

### Pull Master Data

```http
GET /api/sync/pull?outlet_id=1&since_version=0
```

**Response:**
```json
{
  "version": 123,
  "items": [...],
  "prices": [...],
  "tax_rates": [...],
  "tax_defaults": [...]
}
```

### Push Transactions

```http
POST /api/sync/push
Content-Type: application/json

{
  "transactions": [
    {
      "client_tx_id": "uuid-v4-here",
      "outlet_id": 1,
      "cashier_user_id": 1,
      "total_amount": "100.00",
      "lines": [...]
    }
  ]
}
```

**Response (idempotent):**
```json
{
  "results": [
    {
      "client_tx_id": "uuid-v4-here",
      "status": "OK",  // or "DUPLICATE", "ERROR"
      "transaction_id": 456
    }
  ]
}
```

---

## Dine-in Service Sessions

Service sessions support multi-cashier operation with offline-safe idempotency.

### Lifecycle

`ACTIVE -> LOCKED_FOR_PAYMENT -> CLOSED`

### Finalize Checkpoints (recommended model)

- Session lines remain canonical in `table_service_session_lines` while service is active.
- Each `finalize-batch` operation syncs current open lines to `pos_order_snapshot_lines` so other cashiers see the latest finalized order state.
- Payment close performs final settlement and table release.

### Add Line

```http
POST /api/dinein/sessions/:sessionId/lines?outletId=1
Content-Type: application/json

{
  "itemId": 101,
  "itemName": "Nasi Goreng",
  "unitPrice": 35000,
  "quantity": 2,
  "notes": "Less spicy",
  "clientTxId": "line-a1b2c3"
}
```

**Response:** `201 Created`

### Finalize Batch (checkpoint sync)

```http
POST /api/dinein/sessions/:sessionId/finalize-batch?outletId=1
Content-Type: application/json

{
  "clientTxId": "finalize-batch-1-a1b2c3",
  "notes": "First order finalized"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "sessionId": "5001",
    "batchNo": 1,
    "sessionVersion": 7,
    "syncedLinesCount": 3
  }
}
```

### Adjust Line (cancel/reduce before processing)

```http
POST /api/dinein/sessions/:sessionId/lines/:lineId/adjust?outletId=1
Content-Type: application/json

{
  "clientTxId": "adjust-1-a1b2c3",
  "action": "REDUCE_QTY",
  "qtyDelta": 1,
  "reason": "Customer changed mind"
}
```

Rules:
- `reason` is required.
- Adjustment is allowed only when item is not yet processed.
- Endpoint is idempotent by `(company_id, outlet_id, client_tx_id)`.

### Lock Payment

```http
POST /api/dinein/sessions/:sessionId/lock-payment?outletId=1
Content-Type: application/json

{
  "clientTxId": "lock-a1b2c3",
  "posOrderSnapshotId": "snapshot-123"
}
```

### Close Session

```http
POST /api/dinein/sessions/:sessionId/close?outletId=1
Content-Type: application/json

{
  "clientTxId": "close-a1b2c3"
}
```

Notes:
- Close consumes persisted snapshot linkage from the session lifecycle.
- Close finalizes POS snapshot and releases table occupancy.
- Close does not accept caller snapshot override.

### Recommended multi-cashier flow

1. Seat customer and add lines.
2. `finalize-batch` for first order.
3. Add additional lines.
4. `finalize-batch` again.
5. Adjust pending item with reason.
6. Lock payment then close.

---

## Sales

### Create Invoice

```http
POST /api/sales/invoices
Content-Type: application/json

{
  "company_id": 1,
  "outlet_id": 1,
  "customer_name": "John Doe",
  "lines": [
    {
      "item_id": 1,
      "quantity": 2,
      "unit_price": "50.00"
    }
  ]
}
```

### Post Invoice to GL

```http
POST /api/sales/invoices/123/post
```

### Generate PDF

```http
GET /api/sales/invoices/123/pdf
```

---

## Settings

### Read Outlet Settings

```http
GET /api/settings/config?outlet_id=1&keys=receipt_header,tax_rate
```

### Update Settings

```http
PUT /api/settings/config
Content-Type: application/json

{
  "outlet_id": 1,
  "settings": [
    {
      "key": "receipt_header",
      "value": "Welcome to Our Store",
      "value_type": "string"
    }
  ]
}
```

### Module Configuration

```http
GET /api/settings/modules
PUT /api/settings/modules
```

### Tax Rates

```http
GET /api/settings/tax-rates
POST /api/settings/tax-rates
```

### Tax Defaults

```http
GET /api/settings/tax-defaults
PUT /api/settings/tax-defaults
```

---

## Reports

### General Ledger

```http
GET /api/reports/general-ledger?company_id=1&from=2026-01-01&to=2026-12-31
```

### Trial Balance

```http
GET /api/reports/trial-balance?company_id=1&as_of=2026-12-31
```

### Profit & Loss

```http
GET /api/reports/profit-loss?company_id=1&from=2026-01-01&to=2026-12-31
```

### Journal Entries

```http
GET /api/reports/journals?company_id=1&from=2026-01-01&to=2026-12-31
```

### POS Transactions

```http
GET /api/reports/pos-transactions?company_id=1&outlet_id=1&from=2026-01-01&to=2026-12-31
```

---

## Accounting

### Import ODS/Excel

```http
POST /api/accounts/imports
Content-Type: multipart/form-data

file: <ods/xlsx file>
```

**Supported sheets:**
- `DA` → Chart of Accounts
- `JRNL` / `TRNS` → Journal entries

---

## Error Responses

All endpoints return standard error format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [...]
  }
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Unprocessable Entity
- `500` - Internal Server Error

---

## Rate Limiting

- **Development**: No rate limits
- **Production**: 10 requests/second per IP (configured in Nginx)

---

## Additional Resources

- [API Contracts](../apps/api/src/routes) - Full request/response schemas
- [Development Guide](DEVELOPMENT.md)
- [Production Deployment](PRODUCTION.md)
