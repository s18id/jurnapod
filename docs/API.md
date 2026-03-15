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

