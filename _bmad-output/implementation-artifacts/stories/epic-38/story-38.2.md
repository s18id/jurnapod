# Story 38.2: Import Batch Correctness Fixes

**Status:** done

## Story

As an **engineer**,
I want import batch operation counts (`created`/`updated`) to reflect actual durable DB writes,
So that API responses accurately report how many rows were committed when a batch partially fails or is retried.

## Context

Two bugs in `batch-operations.ts` and `routes/import.ts`:

**Bug 1 — Counts before commit** (`routes/import.ts`): `applyItemImport` and `applyPriceImport` incremented `result.created++` and `result.updated++` inside the per-row loop (before the batch DB write). If `batchUpdateItems` failed mid-batch, counts were already inflated.

**Bug 2 — Wrong connection inside retry** (`batch-operations.ts`): `batchUpdateItems`, `batchInsertItems`, and `batchUpdatePrices` wrapped their loops in `withTransactionRetry(db, async () => { ... })` but used `db` inside the callback instead of `trx`. Each statement auto-committed individually, defeating atomicity — a retry after deadlock could re-apply already-committed rows.

## Acceptance Criteria

**AC1: Created count reflects actual inserted rows**
**Given** an apply import with 2 new items
**When** the batch insert succeeds
**Then** `body.data.created === 2` and items exist in DB

**AC2: Updated count reflects actual updated rows**
**Given** an apply import that updates 1 existing item's name
**When** the batch update succeeds
**Then** `body.data.updated === 1` and the item's name is changed in DB

**AC3: Failed count is accurate when batch fails**
**Given** an apply import with an invalid row that causes a validation error
**When** the batch is processed
**Then** `body.data.failed > 0` reflects actual failed rows (not inflated)

**AC4: batchUpdateItems retries atomically**
**Given** a batch update where a deadlock occurs mid-batch
**When** `withTransactionRetry` retries
**Then** all rows in the batch are re-applied as a single transaction (no partial auto-committed rows)

**AC5: Batch operations are tenant-scoped**
**Given** a batch update call
**When** items are updated
**Then** UPDATE queries include `WHERE company_id = ?` to prevent cross-tenant modification

## Tasks

### batch-operations.ts fixes
- [x] Wrap `batchUpdateItems` in `withTransactionRetry(db, async (trx) => { ... })` — use `trx` for all statements
- [x] Add `companyId` parameter to `batchUpdateItems`; add `where("company_id", "=", companyId)` to UPDATE
- [x] Wrap `batchInsertItems` in `withTransactionRetry(db, async (trx) => { ... })` — use `trx` for all statements
- [x] Wrap `batchUpdatePrices` in `withTransactionRetry(db, async (trx) => { ... })` — use `trx` for all statements
- [x] Add `companyId` parameter to `batchUpdatePrices`; add `where("company_id", "=", companyId)` to UPDATE
- [x] Move `if (items.length === 0) return` guard outside the retry wrapper for efficiency

### routes/import.ts fixes
- [x] Remove `result.updated++` and `result.created++` from inside the per-row loop in `applyItemImport`
- [x] After each successful `batchUpdateItems(companyId, updates)`, set `result.updated += updatedCount` (from return value)
- [x] After each successful `batchInsertItems(companyId, inserts)`, set `result.created += insertedIds.length`
- [x] Apply same pattern to `applyPriceImport` with `batchUpdatePrices` and `batchInsertPrices`

### Test fixture hardening
- [x] Wrap `setTestItemLowStockThreshold` UPDATE in `withTransactionRetry(db, async (trx) => { ... })`
- [x] Wrap cleanup reset UPDATE in `withTransactionRetry` too

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/lib/import/batch-operations.ts` | Wrap batch ops in retry; use `trx`; add `companyId` param; add tenant scope |
| `apps/api/src/routes/import.ts` | Move counters after durable writes; use actual DB return values |
| `apps/api/src/lib/test-fixtures.ts` | Harden `setTestItemLowStockThreshold` with retry for set and cleanup |

## Completion Evidence

- `npm run test:single -w @jurnapod/api -- "__test__/integration/import/apply.test.ts"` — 11/11 pass ✅
- `npm run test:single -w @jurnapod/api -- "__test__/integration/stock/low-stock.test.ts"` — 6/6 pass ✅
- `npm run typecheck -w @jurnapod/api` ✅
- `npm run lint -w @jurnapod/api` — 0 errors ✅
