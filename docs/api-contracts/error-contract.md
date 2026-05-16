# API Error Contract

**Applies to:** All stable API endpoints  
**Stability:** `stable`  
**Owner:** API/Platform  
**CI gate:** `lint:api-contracts` (via `scripts/check-api-contract-diff.ts`)

---

## Success Envelope

All stable JSON endpoints MUST return one of:

```json
{
  "success": true,
  "data": {}
}
```

or with pagination metadata:

```json
{
  "success": true,
  "data": [],
  "meta": {}
}
```

Endpoints that do not use the standard envelope (e.g., health probes) are documented as exceptions in the stability matrix.

---

## Error Envelope

All stable endpoints MUST return the standard error envelope for error conditions:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": []
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | `false` | **Yes** | Must be `false` for all errors |
| `error.code` | `string` | **Yes** | Machine-readable error code |
| `error.message` | `string` | **Yes** | Human-readable description |
| `error.details` | `array` | No | Additional context; MAY be omitted when contract explicitly allows it |

### Envelope Rules

1. Error responses MUST have `success: false` at the top level.
2. Error responses MUST NOT mix success and error fields.
3. `error.code` MUST be a non-empty string from the registered error code registry.
4. `error.details` is optional; when omitted, the contract MUST explicitly note this.

---

## Error Code Registry

### Auth / Session Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired access token |

### Authorization Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `FORBIDDEN` | 403 | Authenticated but insufficient permissions |
| `FORBIDDEN` | 403 | Outlet access denied |
| `FORBIDDEN` | 403 | Company access denied |

### Resource Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Resource not found or not accessible |
| `CONFLICT` | 409 | Optimistic lock failure, duplicate key, state conflict |
| `INVALID_TRANSITION` | 409 | Lifecycle transition not allowed |

### Business Rule Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request shape or field (Zod validation) |
| `INVALID_REQUEST` | 400 | Business-level invalid request |
| `PERIOD_CLOSED` | 400/409 | Fiscal period blocks operation |
| `FISCAL_YEAR_CLOSED` | 400/409 | Fiscal year blocks operation |

### Server Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server failure; never includes stack trace |
| `HEALTH_CHECK_ERROR` | 500 | Health check subsystem failure |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

---

## HTTP Status Mapping

| Status | When to Use |
|--------|-------------|
| `200` | Success; standard response |
| `201` | Success; resource created |
| `204` | Success; no content (OPTIONS, CORS preflight) |
| `400` | Validation error; business rule violation |
| `401` | Auth failure; missing or invalid token |
| `403` | ACL failure; authenticated but not allowed |
| `404` | Resource not found (or safely hidden) |
| `409` | Conflict; duplicate; invalid state transition |
| `422` | Unprocessable entity; semantic validation failure |
| `429` | Rate limit exceeded |
| `500` | Internal server error; unexpected failure |

---

## Validation Errors

### Zod Validation Failure

1. Parse request body with Zod schema.
2. On `ZodError`, return `400 VALIDATION_ERROR`.
3. Include field-level error details in `error.details`:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      { "field": "email", "message": "Invalid email format" },
      { "field": "amount", "message": "Must be a positive number" }
    ]
  }
}
```

### Query Parameter Validation

- Invalid query params return `400 VALIDATION_ERROR`.
- Missing required params return `400 VALIDATION_ERROR`.

---

## Auth Errors

All auth errors return `401 UNAUTHORIZED` with no distinction between token types:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid access token"
  }
}
```

Rules:
1. Do not distinguish between "missing token" and "invalid token" in the response message.
2. Do not reveal token expiry status in the message.
3. Do not reveal which part of the token is invalid.

---

## Conflict Errors

### Duplicate Resource

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Resource with that identifier already exists"
  }
}
```

### Invalid State Transition

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Cannot void a posted invoice"
  }
}
```

### Sync Conflict

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
        "conflict_payload": { ... }
      }
    ]
  }
}
```

---

## Fiscal Period Errors

### Period Closed

```json
{
  "success": false,
  "error": {
    "code": "PERIOD_CLOSED",
    "message": "Fiscal period 2026-01 is closed; posting is not allowed"
  }
}
```

### Fiscal Year Closed

```json
{
  "success": false,
  "error": {
    "code": "FISCAL_YEAR_CLOSED",
    "message": "Fiscal year 2025 is closed; transactions cannot be posted"
  }
}
```

---

## Rate Limit Errors

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again later."
  }
}
```

Response headers:
- `Retry-After: <seconds>` — required for `429` responses
- `X-RateLimit-Limit: <limit>`
- `X-RateLimit-Remaining: <remaining>`
- `X-RateLimit-Reset: <unix timestamp>`

---

## Security / Non-Leakage Rules

1. Error responses MUST NOT include stack traces.
2. Error responses MUST NOT include internal file paths or module names.
3. Error responses for cross-tenant access MUST return `FORBIDDEN` or safe `NOT_FOUND`, not expose that the entity exists.
4. Error codes MUST be from the registered error code registry; ad-hoc codes are prohibited in stable endpoints.
5. Error messages MUST be human-readable but MUST NOT reveal internal implementation details.
6. `error.details` for validation errors MUST NOT include internal field names or database column names.

---

## Error Contract Checklist

- [ ] All stable endpoints use standard error envelope.
- [ ] All stable endpoints use standard success envelope or documented exception.
- [ ] Zod validation errors are normalized to `400 VALIDATION_ERROR`.
- [ ] Auth errors are normalized to `401 UNAUTHORIZED`.
- [ ] ACL errors are normalized to `403 FORBIDDEN`.
- [ ] Conflict errors are normalized to `409 CONFLICT` or `409 INVALID_TRANSITION`.
- [ ] Fiscal period/year errors use `PERIOD_CLOSED` / `FISCAL_YEAR_CLOSED`.
- [ ] Internal errors use `500 INTERNAL_SERVER_ERROR` without stack traces.
- [ ] Cross-tenant errors do not leak entity existence.

---

## Breaking Change Policy

The following changes to the error contract require a version bump:

| Change | Breaking? |
|--------|-----------|
| Change `success` field from boolean to anything else | Yes |
| Change error envelope structure | Yes |
| Remove `error.code` field | Yes |
| Change `error.code` values | Yes |
| Change `error.message` semantics | Yes |
| Remove `error.details` from an endpoint that previously documented it | Yes |
| Change HTTP status mapping for an error code | Yes |

---

## OpenAPI Registration

Error responses for all stable endpoints are registered in `openapi-0.3-stability-baseline.json`.

Baseline version: `0.3-stability-baseline`

Reference: `docs/api-contracts/openapi-0.3-stability-baseline.json`
