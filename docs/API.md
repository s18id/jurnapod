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
  "companyCode": "JP",
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "jwt_token_here",
    "token_type": "Bearer",
    "expires_in": 3600
  }
}
```

---

## POS Sync

### Pull Master Data

```http
GET /api/sync/pull?outlet_id={outletId}&since_version=0
```

**Response:**
```json
{
  "success": true,
  "data": {
    "data_version": 123,
    "items": [],
    "prices": [],
    "tax_rates": [],
    "tax_defaults": []
  }
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

### Push Table Events (Table Occupancy Sync)

```http
POST /api/sync/push/table-events
Content-Type: application/json

{
  "outlet_id": 1,
  "events": [
    {
      "client_tx_id": "pos-evt-001",
      "table_id": 12,
      "expected_table_version": 3,
      "event_type": 2,
      "payload": { "guest_count": 4 },
      "recorded_at": "2026-03-19T10:00:00.000Z"
    }
  ]
}
```

**Success response (`200`):**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "client_tx_id": "pos-evt-001",
        "status": "OK",
        "table_version": 4,
        "conflict_payload": null,
        "errorMessage": null
      }
    ],
    "sync_timestamp": "2026-03-19T10:00:00.500Z"
  }
}
```

**Conflict response (`409`):**

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Table state conflict detected",
    "details": [
      {
        "client_tx_id": "pos-evt-001",
        "status": "CONFLICT",
        "table_version": 5,
        "conflict_payload": {
          "current_occupancy": {
            "status_id": 2,
            "guest_count": 2,
            "service_session_id": 9001
          },
          "active_session": {
            "id": 9001,
            "status_id": 1,
            "started_at": "2026-03-19T09:55:00.000Z"
          },
          "current_version": 5,
          "conflict_reason": "Table state has changed since last sync (optimistic version mismatch)"
        }
      }
    ]
  }
}
```

### Pull Table State (Table Occupancy Sync)

```http
GET /api/sync/pull/table-state?outlet_id=1&cursor=1500&limit=100
```

**Response (`200`):**

```json
{
  "success": true,
  "data": {
    "tables": [
      {
        "table_id": 12,
        "table_number": "A-12",
        "status": 2,
        "current_session_id": 9001,
        "version": 5,
        "staleness_ms": 1200
      }
    ],
    "events": [
      {
        "id": 1501,
        "table_id": 12,
        "event_type": "2",
        "payload": { "guest_count": 4 },
        "recorded_at": "2026-03-19T10:00:00.000Z"
      }
    ],
    "next_cursor": "1501",
    "has_more": false,
    "sync_timestamp": "2026-03-19T10:00:00.500Z"
  }
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

### Finalize Checkpoints (canonical model)

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
GET /api/settings/tax-rates/defaults
PUT /api/settings/tax-rates/defaults
```

---

## Reports

### General Ledger

```http
GET /api/reports/general-ledger?from=2026-01-01&to=2026-12-31
```

### Trial Balance

```http
GET /api/reports/trial-balance?as_of=2026-12-31
```

### Profit & Loss

```http
GET /api/reports/profit-loss?from=2026-01-01&to=2026-12-31
```

### Journal Entries

```http
GET /api/reports/journals?from=2026-01-01&to=2026-12-31
```

### POS Transactions

```http
GET /api/reports/pos-transactions?outlet_id={outletId}&from=2026-01-01&to=2026-12-31
```

---

## Export

Export master data (items, prices) to CSV or Excel format.

### Export Items or Prices

```http
POST /api/export/{entityType}?format=csv&columns=id,sku,name
Authorization: Bearer {access_token}
```

**Path Parameters:**
- `entityType` - `items` or `prices`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string | Export format: `csv` (default) or `xlsx` |
| `columns` | string | Comma-separated list of columns to include |
| `search` | string | Filter by item name or SKU |
| `type` | string | Filter items by type (for items only) |
| `group_id` | number | Filter by item group ID |
| `is_active` | boolean | Filter by active status (`true` or `false`) |
| `outlet_id` | number | Filter prices by outlet (for prices only) |
| `view_mode` | string | `defaults` or `outlet` (for prices only) |
| `scope_filter` | string | `override` or `default` (for prices only) |
| `date_from` | string | Start date for date range filter (YYYY-MM-DD, for prices only) |
| `date_to` | string | End date for date range filter (YYYY-MM-DD, for prices only) |

**Response:** Binary file download with appropriate Content-Type:
- CSV: `text/csv; charset=utf-8`
- XLSX: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Headers:**
```
Content-Disposition: attachment; filename="jurnapod-{entityType}-{timestamp}.{ext}"
```

### Export Limits and Streaming Behavior

**Size Thresholds:**
- CSV exports with >10,000 rows use streaming response (no Content-Length header)
- Excel exports with >10,000 rows use chunked generation (multiple sheets)
- Excel exports are limited to 50,000 rows maximum

**Error Responses:**

**400 Bad Request** - Excel export exceeds row limit:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Excel export is limited to 50,000 rows. This export has 60,000 rows. Please use CSV format for larger datasets or apply filters to reduce the result set."
  }
}
```

**401 Unauthorized** - Missing or invalid access token

**400 Invalid Request** - Invalid entity type (must be 'items' or 'prices')

**Performance Notes:**
- Large CSV exports (>10K rows) stream data to minimize memory usage
- Excel exports >10K rows create multiple sheets (10K rows per sheet)
- For datasets >50K rows, use CSV format or apply filters

### Get Available Columns

```http
GET /api/export/{entityType}/columns
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "entityType": "prices",
    "columns": [
      { "key": "id", "header": "ID", "fieldType": "number" },
      { "key": "item_sku", "header": "Item SKU", "fieldType": "string" },
      { "key": "price", "header": "Price", "fieldType": "money" }
    ],
    "defaultColumns": ["item_sku", "item_name", "outlet_name", "price", "is_active"]
  }
}
```

**Available Item Columns:**
- `id`, `sku`, `name`, `item_type`, `barcode`, `item_group_name`, `is_active`, `created_at`, `updated_at`

**Available Price Columns:**
- `id`, `item_id`, `item_sku`, `item_name`, `outlet_id`, `outlet_name`, `price`, `is_active`, `is_override`, `created_at`, `updated_at`

---

## Import

Import master data (items, prices) from CSV or Excel files.

### Upload File

Upload and parse CSV/Excel file, returning column headers for mapping.

```http
POST /import/:entityType/upload
Content-Type: multipart/form-data
Authorization: Bearer {access_token}

file: <csv or xlsx file>
```

**Path Parameters:**
- `entityType` - `items` or `prices`

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "uuid-v4-string",
    "columns": ["SKU", "Item Name", "Price", "Group"],
    "preview_rows": [
      ["SKU001", "Item 1", "10000", "Group A"],
      ["SKU002", "Item 2", "20000", "Group B"]
    ],
    "total_rows": 150,
    "expires_at": "2026-03-28T12:00:00Z"
  }
}
```

### Validate Data

Validate mapped data and return any errors.

```http
POST /import/:entityType/validate
Content-Type: application/json
Authorization: Bearer {access_token}

{
  "session_id": "uuid-v4-string",
  "mapping": {
    "sku": "SKU",
    "name": "Item Name",
    "item_group_id": "Group"
  }
}
```

**Response - Valid:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "row_count": 150,
    "errors": []
  }
}
```

**Response - With Errors:**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "row_count": 150,
    "valid_rows": 148,
    "error_rows": 2,
    "errors": [
      {
        "row": 5,
        "field": "sku",
        "value": "",
        "error": "Required field missing"
      }
    ]
  }
}
```

### Apply Import

Apply validated import to create/update records.

```http
POST /import/:entityType/apply
Content-Type: application/json
Authorization: Bearer {access_token}

{
  "session_id": "uuid-v4-string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "created": 75,
    "updated": 73,
    "errors": 2,
    "total": 150
  }
}
```

### Download Template

Get CSV template file for import.

```http
GET /import/:entityType/template
Authorization: Bearer {access_token}
```

**Response:** CSV file download with template headers.

### Import Session Behavior

- Sessions expire after 30 minutes of inactivity
- Sessions stored in MySQL (survives server restarts)
- Maximum file size: 50MB
- Supported formats: CSV, XLSX, XLS

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

## Reservation Groups (Large Party Support)

### Create Reservation Group (Multi-Table)

Creates a reservation group for parties requiring 2+ tables.

```http
POST /api/reservation-groups
Content-Type: application/json
Authorization: Bearer {access_token}

{
  "outlet_id": 1,
  "customer_name": "Smith Party",
  "customer_phone": "+1234567890",
  "guest_count": 10,
  "table_ids": [1, 2, 3],
  "reservation_at": "2026-03-20T19:00:00+07:00",
  "duration_minutes": 120,
  "notes": "Birthday celebration"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "group_id": 123,
    "reservation_ids": [456, 457, 458]
  }
}
```

**Errors:**
- `400` - Invalid request (missing fields, not enough tables, insufficient capacity)
- `409` - Tables not available (conflict detected — tables already booked for overlapping time window)

### Get Reservation Group

```http
GET /api/reservation-groups/{group_id}
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "company_id": 1,
    "outlet_id": 1,
    "group_name": null,
    "total_guest_count": 10,
    "created_at": "2026-03-20T10:00:00.000Z",
    "updated_at": "2026-03-20T10:00:00.000Z",
    "reservations": [
      {
        "reservation_id": 456,
        "table_id": 1,
        "table_code": "A1",
        "table_name": "Table 1",
        "status": "BOOKED",
        "reservation_at": "2026-03-20T19:00:00.000Z",
        "reservation_start_ts": 1742494800000,
        "reservation_end_ts": 1742502000000
      }
    ]
  }
}
```

### Cancel Reservation Group

Cancels all linked reservations, then unlinks and deletes the group.
All linked reservations are set to `CANCELLED` status before the group row is removed.

```http
DELETE /api/reservation-groups/{group_id}
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "ungrouped_count": 3
  }
}
```

**Errors:**
- `404` - Group not found
- `409` - Cannot cancel group: all reservations must be in `BOOKED` or `CONFIRMED` status.
  Reservations that are `ARRIVED`, `SEATED`, `COMPLETED`, `CANCELLED`, or `NO_SHOW` cannot be cancelled via this endpoint.

### Get Table Suggestions

Suggests optimal table combinations for large parties.

```http
GET /api/reservation-groups/suggest-tables?outlet_id=1&guest_count=10&reservation_at=2026-03-20T19:00:00+07:00&duration_minutes=120
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `outlet_id` (required) - Outlet ID
- `guest_count` (required) - Number of guests (2-100)
- `reservation_at` (required) - ISO 8601 datetime
- `duration_minutes` (optional) - Duration in minutes (default: 120)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "tables": [
          { "id": 1, "code": "A1", "name": "Table 1", "capacity": 4, "zone": "main" },
          { "id": 2, "code": "A2", "name": "Table 2", "capacity": 4, "zone": "main" },
          { "id": 3, "code": "B1", "name": "Table 3", "capacity": 4, "zone": "patio" }
        ],
        "total_capacity": 12,
        "excess_capacity": 2,
        "score": 220
      }
    ]
  }
}
```

**Scoring:** Lower score is better. Prefers fewer tables with less excess capacity.

---

## Error Responses

All endpoints return standard error format:

```json
{
  "success": false,
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
- `409` - Conflict (e.g., table not available, group has active reservations)
- `422` - Unprocessable Entity
- `500` - Internal Server Error

---

## API Stability and Contract Governance

The Jurnapod API uses a **stability classification** system to clearly define which endpoints clients can rely on and what changes are permitted without warning.

### Stability Levels

| Level | Meaning | Breaking Changes |
|-------|---------|-----------------|
| `stable` | Safe for production clients and internal app contracts | **No**, unless versioned or migrated |
| `beta` | Usable internally; still under active design | Yes, with release notes |
| `internal` | Not part of the client-facing contract | Yes, at any time |
| `deprecated` | Scheduled for removal | Only for removal timeline |

### Stable Endpoint Baseline

The authoritative list of stable endpoints is in `docs/api-contracts/stable-endpoints.json` and is protected by CI via `scripts/check-api-contract-diff.ts`.

**Current stable count:** 136 endpoints (OpenAPI-registered and runtime-mounted)

**Baseline file:** `docs/api-contracts/openapi-0.3-stability-baseline.json`

### Contract Documents

| Document | Purpose |
|----------|---------|
| `docs/api-stability-matrix.md` | Exhaustive endpoint classification table (method/path/owner/clients/auth/permissions/idempotency/pagination) |
| `docs/api-contracts/sync-contract.md` | POS sync push/pull contract, `client_tx_id` idempotency, result ordering, atomicity |
| `docs/api-contracts/auth-acl-contract.md` | Auth model, role/permission system, company/outlet scoping, negative test requirements |
| `docs/api-contracts/error-contract.md` | Standard error envelope, error code registry, HTTP status mapping |
| `docs/api-contracts/datetime-money-contract.md` | RFC3339 datetime format, money format (string decimal), currency/FX rules, cursor semantics |
| `docs/api-contracts/stable-contract-rules.md` | Change classification table (allowed / requires changelog / requires version bump) |
| `docs/api-contracts/CHANGELOG.md` | Change history for stable endpoints |

### Breaking Change Detection

The CI gate `lint:api-contracts` runs on every PR to detect breaking changes to stable endpoints:

```bash
npx tsx scripts/check-api-contract-diff.ts
```

- **Exit 0**: No changes, or only additive changes with changelog entry
- **Exit 1**: Breaking change detected (MUST be resolved)
- **Exit 2**: Additive change without changelog entry (MUST be documented)
- **Exit 3**: Missing baseline files

### Beta Gaps (Known)

The following groups are classified `beta` until OpenAPI registration and stable-list promotion are complete:

| Group | Count | OpenAPI Required |
|-------|------:|-----------------|
| Non-promoted `/api/purchasing/*` routes (supplier statements, AP reconciliation detail/export/snapshots) | 13 | Yes |

These MUST have OpenAPI registration and stable-list promotion before classification as `stable`.

### Key Contracts

**Sync (`POST /api/sync/push`)**
- `client_tx_id` is required and is the idempotency key
- Result statuses: `OK`, `DUPLICATE`, `ERROR`, `CONFLICT`
- Response results preserve input order

**Auth**
- JWT Bearer token in `Authorization` header
- Token expiry: configurable, default 15 minutes
- Refresh via `POST /api/auth/refresh` with httpOnly cookie
- All auth errors return `401 UNAUTHORIZED` (no distinction in message)

**Error Envelope**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": []
  }
}
```

**Datetime**: RFC3339 with timezone (`2026-03-19T10:00:00.000Z`)

**Money**: Decimal string (`"100000.00"`) — never floating-point

---

## Rate Limiting

- **Development**: No rate limits
- **Production**: 10 requests/second per IP (configured in Nginx)

---

## Additional Resources

- [API Contracts](../apps/api/src/routes) - Full request/response schemas
- [Development Guide](DEVELOPMENT.md)
- [Production Deployment](PRODUCTION.md)
