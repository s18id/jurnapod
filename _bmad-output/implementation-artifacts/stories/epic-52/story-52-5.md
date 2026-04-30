# Story 52-5: AP Idempotency Key Standardization

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-5 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | AP Idempotency Key Standardization |
| Status | done |
| Risk | P1 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 52-4 (fiscal close pattern as reference) |

## Story

Standardize all AP document types (Purchase Order, Goods Receipt, Purchase Invoice, Payment, Credit Note) on a single `idempotency_key` column pattern with DB-atomic dedup.

## Context

AP document types currently have inconsistent idempotency handling:
- Some use `client_tx_id` (legacy POS pattern)
- Some use application-level check-then-insert
- No consistent `idempotency_key` column across all 5 AP document types

The canonical pattern should be:
- `idempotency_key: string` column on each AP document table
- Unique constraint: `(company_id, idempotency_key)` per document type
- `INSERT...ON DUPLICATE KEY` for atomic dedup
- `client_tx_id` remains reserved for POS sync

## Acceptance Criteria

- [x] All five AP document types have `idempotency_key: string` column
- [x] Unique constraint: `(company_id, idempotency_key)` per document type table
- [x] Insert path checks `idempotency_key` existence before insert; duplicate returns existing record
- [x] AP payment atomic: `ap_payments` record + GL journal entry in single DB transaction
- [x] AP credit note void is idempotent: voiding already-voided note returns OK
- [x] No document type uses `client_tx_id` for idempotency (reserved for POS sync)

## Tasks/Subtasks

- [x] 5.1 Audit all 5 AP document tables for existing idempotency column patterns (PO, GRN, PI, Payment, Credit Note)
- [x] 5.2 Add `idempotency_key` column to any AP table missing it (additive migration, guarded)
- [x] 5.3 Add unique constraint on `(company_id, idempotency_key)` for each AP table (if not already present)
- [x] 5.4 Audit AP payment route — verify uses `idempotency_key` not `client_tx_id`
- [x] 5.5 Refactor AP payment to use `INSERT...ON DUPLICATE KEY` for atomic idempotency
- [x] 5.6 Verify AP credit note void is idempotent (already-voided note voided again returns OK)
- [x] 5.7 Add integration test: duplicate PO submission → second returns DUPLICATE
- [x] 5.8 Add integration test: duplicate GRN submission → single receipt created
- [x] 5.9 Add integration test: duplicate PI submission → single invoice created
- [x] 5.10 Add integration test: duplicate payment submission → single payment + journal
- [x] 5.11 Run `npm run test:integration -w @jurnapod/modules-purchasing -- --grep "idempotency.*payment|idempotency.*po|idempotency.*credit" --run`

## Dev Notes

- `idempotency_key` format: client-supplied string (UUID or similar) — must be stable per business operation
- AP payment atomicity: `ap_payments` + `journal_entries` in same transaction — if journal fails, payment rolls back
- Credit note void idempotency: voiding an already-voided note should return OK (not error), no duplicate journal reversal
- `client_tx_id` is reserved for POS sync — AP documents use `idempotency_key` to avoid confusion

## Validation Commands

```bash
rg "idempotency_key" packages/modules/purchasing/src/ --type ts -l
npm run test:integration -w @jurnapod/modules-purchasing -- --grep "idempotency.*payment|idempotency.*po|idempotency.*credit" --run

# Executed equivalents and gates:
npm run db:migrate -w @jurnapod/db
npm run build -w @jurnapod/db
npm run build -w @jurnapod/shared
npm run build -w @jurnapod/modules-purchasing
npm run typecheck -w @jurnapod/api
npm run test:single -w @jurnapod/api -- --run __test__/integration/purchasing/purchase-orders.test.ts __test__/integration/purchasing/goods-receipts.test.ts __test__/integration/purchasing/purchase-invoices.test.ts __test__/integration/purchasing/ap-payments.test.ts __test__/integration/purchasing/purchase-credits.test.ts
```

Validation results:
- `@jurnapod/modules-purchasing` integration target path has no test files (`__test__/integration`) in package, so story idempotency validation executed via API purchasing integration suites.
- API purchasing integration suites: **5 files passed, 102 tests passed**.

## File List

```
packages/modules/purchasing/src/
apps/api/src/routes/purchasing/
packages/db/src/migrations/
apps/api/src/lib/purchasing/
apps/api/__test__/integration/purchasing/
packages/shared/src/schemas/purchasing.ts
packages/db/src/kysely/schema.ts
packages/modules/purchasing/src/services/ap-payment-service.ts
packages/modules/purchasing/src/services/decimal-scale4.ts
packages/modules/purchasing/src/services/goods-receipt-service.ts
packages/modules/purchasing/src/services/purchase-invoice-open-amount.ts
packages/modules/purchasing/src/services/purchase-credit-service.ts
packages/modules/purchasing/src/services/purchase-invoice-service.ts
packages/modules/purchasing/src/types/purchase-credit.ts
apps/api/__test__/integration/purchasing/ap-payments.test.ts
apps/api/__test__/integration/purchasing/goods-receipts.test.ts
apps/api/__test__/integration/purchasing/purchase-invoices.test.ts
apps/api/__test__/integration/purchasing/purchase-credits.test.ts
packages/db/migrations/0199_goods_receipts_idempotency_warnings_json.sql
_bmad-output/implementation-artifacts/stories/epic-52/story-52-5.md
```

## Change Log

- 2026-04-29 — Added migration `0198_ap_idempotency_keys.sql` with guarded additive idempotency columns + unique constraints across AP document tables.
- 2026-04-29 — Added `idempotency_key` request contract support across purchasing create schemas, API adapters, and route mappings.
- 2026-04-29 — Implemented create-path idempotent replay in PO/GRN/PI/AP Payment/Purchase Credit services.
- 2026-04-29 — Implemented idempotent replay for already-voided Purchase Credit (`VOID -> OK`, no duplicate reversal journal).
- 2026-04-29 — Added API integration tests for duplicate submission replay and credit-void idempotency behavior.
- 2026-04-29 — Resolved AP payment concurrent idempotency race by absorbing duplicate `ap_payment_lines` insert collisions for same `(ap_payment_id, line_no)` during replay.
- 2026-04-29 — Added migration `0199_goods_receipts_idempotency_warnings_json.sql` to persist GR idempotency warnings for deterministic replay responses.
- 2026-04-29 — Fixed P2 replay semantics: credit void now returns `reversal_batch_id=null` when no VOID journal exists, and GR idempotent replay now returns stored warnings.
- 2026-04-29 — Added concurrent duplicate-idempotency integration tests for PI and Purchase Credit create paths.
- 2026-04-30 — DRY refactor: extracted shared scale-4 decimal helpers and shared purchase-invoice open-amount computation used by AP Payment and Purchase Credit (plus Purchase Invoice helper reuse).

## Dev Agent Record

### What was implemented

- Added AP idempotency DB contract via migration `0198_ap_idempotency_keys.sql`:
  - `purchase_orders.idempotency_key`
  - `goods_receipts.idempotency_key`
  - `purchase_invoices.idempotency_key`
  - `ap_payments.idempotency_key`
  - `purchase_credits.idempotency_key`
  - unique indexes `(company_id, idempotency_key)` for each table.

- Updated Kysely table interfaces in `packages/db/src/kysely/schema.ts` for the five AP tables.

- Extended shared purchasing create schemas with optional `idempotency_key` to keep backward compatibility while enabling canonical idempotent replay.

- Extended purchasing module create input contracts and API lib wrappers to pass `idempotencyKey` through to services.

- Service hardening:
  - PO create: duplicate idempotency key returns existing PO.
  - GRN create: duplicate idempotency key returns existing receipt.
  - PI create: duplicate idempotency key returns existing invoice.
  - AP Payment create: atomic idempotent create path with `ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)` and replay return.
  - Purchase Credit create: duplicate idempotency key returns existing credit.
  - Purchase Credit void: already-VOID replay returns OK with existing reversal batch id (no duplicate reversal creation).

- P2 follow-up hardening:
  - Purchase Credit void replay now returns `reversal_batch_id: null` when a credit is already VOID but no VOID reversal journal batch exists (no misleading apply-batch fallback).
  - Goods Receipt idempotent replay now returns deterministic stored warnings from `goods_receipts.idempotency_warnings_json`.

- DRY cleanup pass:
  - Extracted shared decimal helpers into `services/decimal-scale4.ts` and reused from AP Payment / Purchase Credit / Purchase Invoice services.
  - Extracted shared purchase invoice open amount logic into `services/purchase-invoice-open-amount.ts` and reused from AP Payment / Purchase Credit services.

### Tests created/updated

- `purchase-orders.test.ts`: added duplicate PO idempotency replay test (same id/order_no; DB row count = 1 for key).
- `goods-receipts.test.ts`: added duplicate GR replay test (same id/reference_number; DB row count = 1 for key).
- `purchase-invoices.test.ts`: added duplicate PI replay test (same id/invoice_no; DB row count = 1 for key).
- `ap-payments.test.ts`: added duplicate AP payment replay test (same id/payment_no; single journal batch after post).
- `ap-payments.test.ts`: added concurrent duplicate-key replay test (`Promise.all`) proving same payment returned and no duplicate-line failure.
- `goods-receipts.test.ts`: updated GR duplicate replay test to assert warning replay determinism.
- `purchase-invoices.test.ts`: added concurrent duplicate-key PI replay test (`Promise.all`) proving single invoice row for key.
- `purchase-credits.test.ts`: added concurrent duplicate-key credit replay test (`Promise.all`) proving single credit row for key.
- `purchase-credits.test.ts`: added second-void idempotency replay test (200 OK; same reversal batch; no duplicate reversal batch rows).

### Key decisions (SOLID / DRY / KISS / YAGNI)

- **SOLID**: kept idempotency orchestration within existing service boundaries; routes remain thin adapters.
- **DRY**: reused existing `get*ById` retrieval paths for replay responses; reused existing transaction + validation flows.
- **DRY**: removed duplicate decimal and invoice-open-amount helper implementations across AP Payment and Purchase Credit (plus Purchase Invoice decimal helper reuse).
- **KISS**: used optional `idempotency_key` to avoid forcing all clients to change immediately.
- **YAGNI**: no speculative status enums or replay wrappers added; only story-required behavior implemented.

### Verification

- `npm run db:migrate -w @jurnapod/db` (migration applied/skipped as idempotent)
- `npm run build -w @jurnapod/db` ✅
- `npm run build -w @jurnapod/shared` ✅
- `npm run build -w @jurnapod/modules-purchasing` ✅
- `npm run typecheck -w @jurnapod/api` ✅
- `npm run test:single -w @jurnapod/api -- --run <5 purchasing integration files>` ✅ (102 passed)
- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/ap-payments.test.ts` ✅ (29 passed)
- `npm run db:migrate -w @jurnapod/db` ✅ (applied `0199_goods_receipts_idempotency_warnings_json.sql`)
- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/goods-receipts.test.ts` ✅ (22 passed)
- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/purchase-invoices.test.ts` ✅ (18 passed)
- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/purchase-credits.test.ts` ✅ (8 passed)
- `npm run build -w @jurnapod/db` ✅
- `npm run build -w @jurnapod/modules-purchasing` ✅
- `npm run typecheck -w @jurnapod/api` ✅
- `npm run build -w @jurnapod/modules-purchasing` ✅ (post-DRY helper extraction)
- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/ap-payments.test.ts` ✅ (29 passed)
- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/purchase-credits.test.ts` ✅ (8 passed)
- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/purchase-invoices.test.ts` ✅ (18 passed)
- `npm run typecheck -w @jurnapod/api` ✅ (post-DRY helper extraction)

### Notes

- Story command `npm run test:integration -w @jurnapod/modules-purchasing -- --grep ...` is not directly runnable as documented because the package has no `__test__/integration` files and vitest does not support the provided `--grep` flag form. Equivalent API purchasing integration coverage was executed and passed.

### Review Findings

- [x] [Review][Patch] Duplicate payment lines race on concurrent identical-idempotency-key requests [`packages/modules/purchasing/src/services/ap-payment-service.ts`]
  - **Resolution:** Wrapped idempotent line inserts with duplicate-key guard for `uk_ap_payment_lines_payment_line`; concurrent identical-key replays now return existing payment instead of bubbling `ER_DUP_ENTRY`.

- [x] [Review][Defer] No client_tx_id enforcement guard in AP routes — deferred, pre-existing convention-only constraint.

- [x] [Review][Patch] Credit void reversal_batch_id fallback to apply-batch is misleading [`packages/modules/purchasing/src/services/purchase-credit-service.ts`] 
  - **Resolution:** Already-VOID replay now returns the latest VOID reversal journal batch id when present; otherwise returns `null`.

- [x] [Review][Patch] GRN warnings reset to empty array on idempotent replay [`packages/modules/purchasing/src/services/goods-receipt-service.ts`]
  - **Resolution:** Persisted warnings JSON on first create and replay now returns stored warnings deterministically.

- [x] [Review][Patch] Missing concurrent replay test coverage for PI/Credit create replay paths (AP payment-only before) [`apps/api/__test__/integration/purchasing/purchase-invoices.test.ts`, `apps/api/__test__/integration/purchasing/purchase-credits.test.ts`]
  - **Resolution:** Added concurrent `Promise.all` replay tests for PI and Purchase Credit idempotency keys; residual PO/GRN concurrency expansion retained as backlog.

- [x] [Review][Defer] Zero-line payment with idempotency_key passes silently with no lines [`packages/modules/purchasing/src/services/ap-payment-service.ts:375-396`] — deferred, pre-existing input validation scope.

- [x] [Review][Defer] Residual concurrent replay coverage gap for PO/GRN (PI/Credit now covered) — deferred, lower-priority coverage expansion.
