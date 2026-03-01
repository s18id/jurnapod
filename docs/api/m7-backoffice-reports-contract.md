<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# M7 Backoffice Reports Contract

Status: implemented for Backoffice v0

These endpoints support PR-14 report screens in backoffice:
- POS transactions list
- Daily sales summary
- Journal list
- Trial balance

All endpoints:
- Require `Authorization: Bearer <token>`.
- Require role: `OWNER`, `ADMIN`, or `ACCOUNTANT`.
- Enforce company scope from token (`company_id`).
- Enforce outlet access when `outlet_id` filter is provided.

## GET `/api/reports/pos-transactions`

Query:
- `outlet_id` (optional, positive int)
- `date_from` (optional, `YYYY-MM-DD`)
- `date_to` (optional, `YYYY-MM-DD`)
- `as_of` (optional ISO datetime with timezone, snapshot boundary)
- `as_of_id` (optional non-negative int, stable pagination watermark)
- `status` (optional: `COMPLETED|VOID|REFUND`)
- `limit` (optional, default `50`, max `200`)
- `offset` (optional, default `0`)

Response:
- `ok: true`
- `filters`: resolved filters + outlet ids used + `as_of` + `as_of_id`
- `total`: total rows for pagination
- `transactions[]`:
  - `id`, `outlet_id`, `client_tx_id`, `status`, `trx_at`
  - `gross_total`, `paid_total`, `item_count`

Pagination consistency notes:
- First page should be requested without `as_of`/`as_of_id`.
- Reuse returned `filters.as_of` and `filters.as_of_id` on subsequent pages to keep a stable snapshot while new writes occur.

## GET `/api/reports/daily-sales`

Query:
- `outlet_id` (optional, positive int)
- `date_from` (optional, `YYYY-MM-DD`)
- `date_to` (optional, `YYYY-MM-DD`)
- `status` (optional, default `COMPLETED`)

Response:
- `ok: true`
- `filters`: resolved filters + outlet ids used
- `rows[]`:
  - `trx_date`, `outlet_id`, `outlet_name`
  - `tx_count`, `gross_total`, `paid_total`

Implementation notes:
- Uses view `v_pos_daily_totals` when available.
- Falls back to aggregated query over `pos_transactions` + detail tables when view is missing/invalid during rollout.

## GET `/api/reports/journals`

Query:
- `outlet_id` (optional, positive int)
- `date_from` (optional, `YYYY-MM-DD`)
- `date_to` (optional, `YYYY-MM-DD`)
- `as_of` (optional ISO datetime with timezone, snapshot boundary)
- `as_of_id` (optional non-negative int, stable pagination watermark)
- `limit` (optional, default `50`, max `200`)
- `offset` (optional, default `0`)

Response:
- `ok: true`
- `filters`: resolved filters + outlet ids used + `as_of` + `as_of_id`
- `total`: total batches
- `journals[]`:
  - `id`, `outlet_id`, `outlet_name`
  - `doc_type`, `doc_id`, `posted_at`
  - `line_count`, `total_debit`, `total_credit`

Scoping note:
- When `outlet_id` is provided, results are strictly outlet-scoped (unassigned `NULL` outlet rows are excluded).

## GET `/api/reports/trial-balance`

Query:
- `outlet_id` (optional, positive int)
- `date_from` (optional, `YYYY-MM-DD`)
- `date_to` (optional, `YYYY-MM-DD`)
- `as_of` (optional ISO datetime with timezone; truncated to date boundary)

Response:
- `ok: true`
- `filters`: resolved filters + outlet ids used + `as_of`
- `totals`:
  - `total_debit`, `total_credit`, `balance`
- `rows[]`:
  - `account_id`, `account_code`, `account_name`
  - `total_debit`, `total_credit`, `balance`

Scoping note:
- When `outlet_id` is provided, trial balance is strictly outlet-scoped (unassigned `NULL` outlet rows are excluded).

## Error responses

Common errors:
- `401 UNAUTHORIZED` for missing/invalid token.
- `403 FORBIDDEN` for missing role or inaccessible outlet.
- `400 INVALID_REQUEST` for malformed query params.
- `500 INTERNAL_SERVER_ERROR` for unexpected failures.
