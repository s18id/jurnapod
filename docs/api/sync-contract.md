# POS Sync Contract (Draft)

## Pull
`GET /sync/pull?outlet_id=...&since_version=...`

## Push
`POST /sync/push`

- Idempotent by `client_tx_id`
- Result per transaksi: `OK | DUPLICATE | ERROR`
