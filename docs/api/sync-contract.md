<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# POS Sync Contract (Draft)

## Pull
`GET /sync/pull?outlet_id=...&since_version=...`

## Push
`POST /sync/push`

- Idempotent by `client_tx_id`
- Result per transaksi: `OK | DUPLICATE | ERROR`
