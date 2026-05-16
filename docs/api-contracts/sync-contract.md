# POS Sync API Contract

**Applies to:** `GET /api/sync/pull`, `POST /api/sync/push`, `POST /api/sync/check-duplicate`, `GET /api/sync/stock`  
**Stability:** `stable`  
**Owner:** API/Sync  
**CI gate:** `lint:api-contracts` (via `scripts/check-api-contract-diff.ts`)

---

## Endpoints

| Method | Path | Stability |
|--------|------|-----------|
| GET | /api/sync/pull | stable |
| POST | /api/sync/push | stable |
| POST | /api/sync/check-duplicate | stable |
| GET | /api/sync/stock | stable |
| GET | /api/sync/health | stable |

---

## Canonical Sync Contract Fields

### Request Cursor (Pull)

| Field | Type | Contract | Notes |
|-------|------|----------|-------|
| `outlet_id` | integer | **Required** | Must match authenticated user's outlet access |
| `since_version` | integer | Optional; default `0` | Cursor for incremental sync; returns all data updated after this version |

### Response Cursor (Pull)

| Field | Type | Contract | Notes |
|-------|------|----------|-------|
| `data_version` | integer | **Always present** | Server-side sync version; client MUST store this and send as `since_version` on next poll |

The field name `data_version` is the canonical response cursor. The request field is `since_version`. These are the only permitted names; alias fields (e.g., `sync_data_version`, `last_sync_version`) are prohibited in API payloads.

### Push Transactions

Each transaction in `POST /api/sync/push` payload:

| Field | Type | Contract | Notes |
|-------|------|----------|-------|
| `client_tx_id` | string (UUID) | **Required** | Idempotency key; globally unique per client operation |
| `outlet_id` | integer | **Required** | Must match authenticated user's outlet |
| `cashier_user_id` | integer | **Required** | Authenticated cashier performing the operation |
| `total_amount` | string (decimal) | **Required** | Decimal string; never floating-point |
| `lines` | array | **Required** | Transaction line items |
| `transaction_at` | string (RFC3339) | Optional | RFC3339 with timezone; defaults to server time |

---

## Idempotency

### Rules

1. `client_tx_id` is **required** for every pushed transaction.
2. `client_tx_id` must be a valid UUID format.
3. Same `client_tx_id` + same payload MUST NOT create duplicate records.
4. Same `client_tx_id` + conflicting payload MUST return `ERROR` or `CONFLICT`, not silently succeed.
5. Missing `client_tx_id` returns `VALIDATION_ERROR` (400).
6. Invalid `client_tx_id` format returns `VALIDATION_ERROR` (400).

### Idempotency Result States

Each result in the push response includes a `status` field with one of:

| Status | Meaning |
|--------|---------|
| `OK` | Transaction processed successfully; journal created |
| `DUPLICATE` | `client_tx_id` already processed with identical payload; no new record created |
| `ERROR` | Processing failed; transaction rejected |
| `CONFLICT` | `client_tx_id` reused with conflicting payload |

### Duplicate Detection

`POST /api/sync/check-duplicate` accepts `client_tx_id` + `company_id` and returns:

```json
{
  "is_duplicate": true,
  "existing_id": "123",
  "created_at": "2026-03-19T10:00:00.000Z"
}
```

or:

```json
{
  "is_duplicate": false
}
```

---

## Result Ordering

### Rules

1. Response `results` array MUST preserve input order.
2. Partial failures MUST NOT reorder results.
3. Each result includes `client_tx_id` for client correlation.
4. Empty push returns stable empty response `{"success": true, "data": {"results": []}}`.
5. Unknown result states are prohibited; every result has an explicit status.

---

## Transaction Atomicity

### Rules

1. Each transaction MUST be atomic within a single DB transaction.
2. Header insert failure MUST roll back lines.
3. Line insert failure MUST roll back header.
4. Posting failure MUST roll back the transaction where required.
5. Stock deduction failure MUST roll back the transaction where required.
6. Cross-transaction isolation: one transaction failure MUST NOT corrupt another.
7. Partial batch failure MUST leave successful transactions valid and failed transactions clean.

### Journal Creation

- Every pushed transaction that is not a `DUPLICATE` MUST create a corresponding GL journal entry.
- Journal creation MUST be synchronous within the transaction; no async side-effects.
- Journal batch MUST balance (debit total = credit total) before commit.

---

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Missing or invalid `client_tx_id`, missing required field |
| `UNAUTHORIZED` | 401 | Missing or invalid access token |
| `FORBIDDEN` | 403 | Outlet access denied |
| `CONFLICT` | 409 | `client_tx_id` reused with conflicting payload |
| `INVALID_TRANSITION` | 409 | Lifecycle transition not allowed |
| `PERIOD_CLOSED` | 400/409 | Fiscal period blocks operation |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected failure |

---

## Retry Rules

### Client Retry Policy

1. Max **3 retries** with exponential backoff (1s, 2s, 4s).
2. After 3 failures, mark transaction as `FAILED` and stop retrying.
3. On `DUPLICATE`, do not retry — the transaction was already processed.
4. On `CONFLICT`, do not retry with same payload — payload must be corrected.
5. On `UNAUTHORIZED` (401), do not retry the protected request; refresh the token first.

### Server Side Effects

- Server MUST idempotently handle duplicate deliveries.
- Server MUST return same `status` for same `client_tx_id` regardless of retry count.
- Server MUST NOT change `client_tx_id` semantics across versions.

---

## Concurrency Rules

### Rules

1. Default concurrency: **1** (sequential processing per outlet).
2. Max concurrency: **4** per outlet (configurable).
3. Production rollout value: **1** initially; scale up only after monitoring evidence is reviewed.
4. Deadlock retry: automatic with jitter (max 3 attempts).
5. Sequential operations: `POST /api/sync/push` within same outlet MUST be processed sequentially to preserve order.

### DB Pool Impact

- Each concurrent push holds a DB connection for the duration of the transaction.
- Pool sizing target: `(max_connections / outlets_active) >= 4` for safety margin.
- Monitor: `sync_push_latency_ms`, `sync_push_total{status=failed}`, `outbox_lag_items`.

---

## Observability

### Required Metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `sync_push_latency_ms` | `outlet_id`, `status` | Push latency histogram (p50, p95, p99) |
| `sync_push_total` | `outlet_id`, `status` | Push operations count by status (OK/DUPLICATE/ERROR) |
| `sync_pull_latency_ms` | `outlet_id` | Pull latency histogram |
| `outbox_lag_items` | `outlet_id` | Current lag count |
| `client_tx_id_duplicates_total` | `outlet_id` | Duplicate count |
| `journal_post_failure_total` | `domain`, `reason` | Posting failures |
| `journal_post_success_total` | `domain` | Posting successes |

### Required Logging

| Field | Where |
|-------|-------|
| `client_tx_id` | Every sync log entry |
| `company_id` | Every sync log entry |
| `outlet_id` | Every sync log entry |
| `push_latency_ms` | Push response or logs |
| `ok_count`, `duplicate_count`, `error_count` | Batch push summary |

### Alerting

| Condition | Severity |
|-----------|----------|
| `sync_push_total{status=failed}` rate > 0.5% over 5 min | Critical |
| `outbox_lag_items > 100` | Critical |
| `sync_push_latency_ms{p99} > 500ms` for 5 min | Warning |
| `client_tx_id_duplicates_total > 100` in 5 min | Warning |

---

## Breaking Change Policy

The following changes to `stable` sync endpoints require a version bump or migration plan:

| Change | Breaking? |
|--------|-----------|
| Remove endpoint | Yes |
| Change `client_tx_id` field name | Yes |
| Change `since_version` / `data_version` field names | Yes |
| Change `status` values (`OK`, `DUPLICATE`, `ERROR`, `CONFLICT`) | Yes |
| Remove response field | Yes |
| Change response field type | Yes |
| Change idempotency behavior | Yes |
| Change result ordering | Yes |
| Add optional request field | No |
| Add response field | No |
| Increase max concurrency | No |

See `docs/api-contracts/stable-contract-rules.md` for the full change classification table.

---

## OpenAPI Registration

OpenAPI coverage for sync endpoints is in `openapi-0.3-stability-baseline.json`:

- `GET /api/sync/pull` — registered
- `POST /api/sync/push` — registered
- `POST /api/sync/check-duplicate` — registered
- `GET /api/sync/stock` — registered
- `GET /api/sync/health` — registered

Baseline file: `docs/api-contracts/openapi-0.3-stability-baseline.json`

Baseline version: `0.3-stability-baseline`
