# Story 8.8: Variant Sync Push

**Status:** done

## Story

As a **POS cashier**,
I want variant sale transactions to sync successfully to the server,
So that offline variant sales are recorded in the system with correct stock and accounting effects.

---

## Context

Epic 8 completes the variant sync push path. Story 8.8 extends the `/sync/push` route to handle variant line items correctly, including COGS calculation per variant and idempotent stock deduction using `client_tx_id`.

**Dependencies:** Stories 8.7 (variant stock tracking) must be complete.

---

## Acceptance Criteria

**AC1: Variant Line Items in Sync Push**
POS sync push payloads containing variant line items are accepted and processed.

**AC2: Idempotent Variant Stock Deduction**
Retried sync push with same `client_tx_id` does not double-deduct variant stock.

**AC3: COGS Journal for Variant Sales**
COGS posting is generated per variant line item using the variant's cost price.

**AC4: Integration Tests**
Integration tests verify idempotency and correct stock/accounting effects for variant sync push.

---

## Dev Notes

_Created retroactively — implementation completed as part of Epic 8 execution._
