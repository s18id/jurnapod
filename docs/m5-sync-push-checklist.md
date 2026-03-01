<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Milestone M5 — POS Sync Push v1 Checklist

## Phase 1 — Server Safety (Atomic + Idempotent)
- [ ] Add DB tables for POS child payloads (`pos_transaction_items`, `pos_transaction_payments`).
- [ ] Add `payload_sha256` (+ optional `payload_hash_version`) to `pos_transactions`.
- [ ] Keep/verify UNIQUE index on `pos_transactions.client_tx_id`.
- [ ] Refactor `/sync/push` to use explicit SQL transaction per transaction item (`BEGIN/COMMIT/ROLLBACK`).
- [ ] Persist header + items + payments + audit in one transaction boundary.
- [ ] Handle duplicate key deterministically:
  - [ ] same hash => `DUPLICATE`
  - [ ] different hash => `CONFLICT` (or backward-compatible `ERROR` code)
- [ ] Handle lock timeout/deadlock as retryable error.

## Phase 2 — Client Concurrency Hardening
- [ ] Add single-flight drain scheduler (coalesce interval/online/focus/manual triggers).
- [ ] Add per-job outbox lease fields (`lease_owner_id`, `lease_token`, `lease_expires_at`).
- [ ] Implement atomic claim before send and CAS finalize after send.
- [ ] Add lease heartbeat/renew during long in-flight request.
- [ ] Add request timeout (AbortController) in sender.
- [ ] Use capped exponential backoff with jitter for retryable failures.

## Phase 3 — UX / Manual Push
- [ ] Add manual **Sync now** (push) action in POS UI.
- [ ] Wire manual action to the same drain scheduler path (no bypass).
- [ ] Show per-run status/result feedback for cashier.

## Phase 4 — Tests & Observability
- [ ] API integration: concurrent same `client_tx_id` requests (`Promise.all`) => one `OK`, one `DUPLICATE`.
- [ ] API integration: same `client_tx_id` with different payload => `CONFLICT` (or mapped error).
- [ ] API integration: rollback on injected mid-transaction failure => zero partial rows.
- [ ] API assertions: row-count invariants for header/items/payments (exactly once).
- [ ] POS tests: overlapping triggers are coalesced (single-flight).
- [ ] POS tests: stale lease token cannot overwrite newer attempt result.
- [ ] POS tests: timeout + replay converges to `SENT` via `OK|DUPLICATE`.
- [ ] Add structured logs with: `correlation_id`, `client_tx_id`, `attempt`, `lease_token`, `drain_reason`, `latency_ms`, `result`.

## Definition of Done (M5)
- [ ] `/sync/push` atomically persists header + items + payments.
- [ ] Re-push of same payload never duplicates business rows.
- [ ] Concurrent same-key pushes resolve deterministically (`OK` then `DUPLICATE`/`CONFLICT`).
- [ ] POS outbox prevents duplicate in-flight send for same job (single-flight + lease).
- [ ] Manual push exists and uses the same safe scheduler.
- [ ] Concurrency and rollback tests pass.
