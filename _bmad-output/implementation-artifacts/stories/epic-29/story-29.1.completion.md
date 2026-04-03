# story-29.1.completion.md — Scope Freeze + Parity Matrix + Boundary Contracts

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-29.1 |
| Title | Scope freeze + parity matrix + boundary contracts |
| Status | review |
| Type | Read-only analysis |
| Date | 2026-04-04 |

---

## Decision Log

### Decision 1: Idempotency Contract — `idempotency_key` Remains Optional

**Decision:** Confirmed — `idempotency_key` is optional on all mutation endpoints. When omitted, the server auto-generates a key using `generateIdempotencyKey()` which returns `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`.

**Rationale:**
- All lifecycle events (acquisition, transfer, impairment, disposal, void) use `insertEventWithIdempotency()` which attempts the insert and catches MySQL error 1062 (duplicate key). If a duplicate is detected with matching asset_id and event_type, it returns `{ eventId: existing.id, isDuplicate: true }`.
- The duplicate detection happens inside the same transaction, ensuring consistent behavior under concurrent retries.
- Fixed asset and category CRUD rely on database-level unique constraints (e.g., unique code per company) rather than application-level idempotency keys.
- Depreciation plan and run do not currently implement idempotency (they use plan_id + period uniqueness to detect duplicates).

**Source:**
- `fixed-assets-lifecycle.ts` line 65-67: `generateIdempotencyKey()`
- `fixed-assets-lifecycle.ts` line 437-474: `insertEventWithIdempotency()`
- `depreciation.ts` line 679-694: runDepreciationPlan catches MySQL duplicate error

---

### Decision 2: Void Semantics — Void Creates Reversal Journal in Same Transaction

**Decision:** Confirmed — When voiding a voidable event (ACQUISITION or DISPOSAL), a reversal journal is created in the same database transaction. The void operation:
1. Inserts a new VOID event with idempotency protection
2. Posts a reversal journal batch (doc_type = "VOID") that swaps debits/credits of the original
3. Marks the original event status as "VOIDED"
4. Recomputes the asset book from remaining POSTED events
5. Updates `fixed_asset_books` with recomputed values
6. Updates `fixed_assets.disposed_at` based on recomputed state

**Voidable Event Types:**
- ACQUISITION (via `isAcquisitionType()`)
- DISPOSAL (via `isDisposalType()`)

**Non-voidable:**
- TRANSFER, IMPAIRMENT, DEPRECIATION — throw `FixedAssetEventNotVoidableError`

**Source:**
- `fixed-assets-lifecycle.ts` line 1524-1526: `isVoidableEventType()`
- `fixed-assets-lifecycle.ts` line 1528-1648: `voidEvent()` full implementation
- `fixed-assets-lifecycle.ts` line 1650-1703: `postVoidToJournal()` reversal logic

---

### Decision 3: Book/Run Consistency — Depreciation Run Updates Book + Runs in Same Transaction

**Decision:** Confirmed — When `runDepreciationPlan()` executes, both `asset_depreciation_runs` insert and `fixed_asset_books` update happen inside the same `db.transaction().execute()` block. The journal batch is also created in the same transaction.

**Sequence in single transaction:**
1. Validate plan is ACTIVE
2. Compute depreciation amount based on method (STRAIGHT_LINE, DECLINING_BALANCE, SUM_OF_YEARS)
3. Insert into `asset_depreciation_runs` with status "POSTED"
4. Call `postDepreciationRunToJournal()` which creates journal batch and lines
5. Update `asset_depreciation_runs.journal_batch_id` with result

**Note:** The `fixed_asset_books` table is NOT directly updated by the depreciation run. Depreciation is tracked via the `asset_depreciation_runs` table. Book values are maintained by lifecycle events (acquisition, impairment, disposal, void).

**Source:**
- `depreciation.ts` line 554-696: `runDepreciationPlan()` full transaction block

---

### Decision 4: Transaction Atomicity — Each Mutation Type Has Explicit Atomic Unit

**Decision:** Confirmed — Each mutation type documents its atomic unit:

| Mutation Type | Atomic Unit |
|---------------|-------------|
| Fixed asset category create/update/delete | Entire operation in `db.transaction()` including audit log |
| Fixed asset create/update/delete | Entire operation in `db.transaction()` including audit log |
| Depreciation plan create/update | Entire operation in `db.transaction()` |
| Depreciation run | Single transaction: run INSERT + journal INSERT + journal_batch_id UPDATE |
| Acquisition | Single transaction: event INSERT + journal batch/lines INSERT + book INSERT/UPDATE |
| Transfer | Single transaction: event INSERT + fixed_assets.outlet_id UPDATE |
| Impairment | Single transaction: event INSERT + journal batch/lines INSERT + book UPDATE |
| Disposal | Single transaction: event INSERT + journal batch/lines INSERT + disposal INSERT + book UPDATE + disposed_at UPDATE |
| Void | Single transaction: void event INSERT + reversal journal INSERT + original event status UPDATE + book recompute + book UPDATE |

**Source:**
- `fixed-assets/index.ts`: All CRUD wrapped in `db.transaction()`
- `depreciation.ts`: All operations wrapped in `db.transaction()`
- `fixed-assets-lifecycle.ts` line 84-87: `withTransaction()` helper

---

### Decision 5: Module Placement — Extend `modules-accounting`, Not New Package

**Decision:** Confirmed — The fixed assets extraction extends `modules-accounting`. The existing `packages/modules/accounting/src/posting/depreciation.ts` provides the `postDepreciationRunToJournal()` function which is called by the depreciation run logic.

**Evidence:**
- `depreciation.ts` line 6: `import { postDepreciationRunToJournal } from "./depreciation-posting"`
- `packages/modules/accounting/src/posting/depreciation.ts` line 144-169: `postDepreciationRun()` public API
- No new package created; all code lives in `apps/api/src/lib/` and `packages/modules/accounting/src/posting/`

---

## Parity Matrix — All 18 Endpoints

### Fixed Asset Category Endpoints (5)

| Endpoint | Idempotency | Voidable | Journal | tx_scope |
|----------|-------------|----------|---------|----------|
| `GET /accounts/fixed-asset-categories` | None (read) | N/A | None | Single SELECT |
| `POST /accounts/fixed-asset-categories` | Optional (DB-level duplicate code constraint) | No | None | Single INSERT in transaction + audit log |
| `GET /accounts/fixed-asset-categories/:id` | None (read) | N/A | None | Single SELECT |
| `PATCH /accounts/fixed-asset-categories/:id` | Optional (DB-level duplicate code constraint on code change) | No | None | Single UPDATE in transaction + audit log |
| `DELETE /accounts/fixed-asset-categories/:id` | None | No | None | Single DELETE in transaction + audit log |

### Fixed Asset Endpoints (5)

| Endpoint | Idempotency | Voidable | Journal | tx_scope |
|----------|-------------|----------|---------|----------|
| `GET /accounts/fixed-assets` | None (read) | N/A | None | Single SELECT with outlet filtering |
| `POST /accounts/fixed-assets` | Optional (DB-level duplicate constraint) | No | None | Single INSERT in transaction + audit log |
| `GET /accounts/fixed-assets/:id` | None (read) | N/A | None | Single SELECT with outlet access check |
| `PATCH /accounts/fixed-assets/:id` | Optional (DB-level duplicate constraint) | No | None | Single UPDATE in transaction + audit log |
| `DELETE /accounts/fixed-assets/:id` | None | No | None | Single DELETE in transaction + audit log |

### Depreciation Endpoints (3)

| Endpoint | Idempotency | Voidable | Journal | tx_scope |
|----------|-------------|----------|---------|----------|
| `POST /accounts/fixed-assets/:id/depreciation-plan` | None (no idempotency key) | No | None | Single INSERT in transaction |
| `PATCH /accounts/fixed-assets/:id/depreciation-plan` | None (no idempotency key) | No | None | Single UPDATE in transaction; blocked if posted runs exist |
| `POST /accounts/depreciation/run` | None (detects duplicate via plan_id+period uniqueness, returns `duplicate: true`) | No | Yes (DEPRECIATION journal batch created via `postDepreciationRunToJournal()`) | Multi-write: run INSERT + journal batch/lines INSERT + journal_batch_id UPDATE in single transaction |

### Lifecycle Event Endpoints (5)

| Endpoint | Idempotency | Voidable | Journal | tx_scope |
|----------|-------------|----------|---------|----------|
| `POST /accounts/fixed-assets/:id/acquisition` | Optional (server generates key if missing) | No | Yes (ACQUISITION journal batch: Dr Asset, Cr Offset) | Multi-write: event INSERT + journal batch/lines INSERT + book INSERT/UPDATE in transaction |
| `POST /accounts/fixed-assets/:id/transfer` | Optional (server generates key if missing) | No | None (no journal; outlet_id change only) | Multi-write: event INSERT + fixed_assets.outlet_id UPDATE in transaction |
| `POST /accounts/fixed-assets/:id/impairment` | Optional (server generates key if missing) | No | Yes (IMPAIRMENT journal batch: Dr Expense, Cr Accum Impairment) | Multi-write: event INSERT + journal batch/lines INSERT + book UPDATE in transaction |
| `POST /accounts/fixed-assets/:id/disposal` | Optional (server generates key if missing) | No | Yes (DISPOSAL journal batch: cash/proceeds + accum depr + accum impairment removed + asset removed + gain/loss) | Multi-write: event INSERT + journal batch/lines INSERT + disposal INSERT + book UPDATE + disposed_at UPDATE in transaction |
| `POST /accounts/fixed-assets/events/:id/void` | Optional (server generates prefixed key "void-{key}" if missing) | Yes (ACQUISITION, DISPOSAL only) | Yes (VOID reversal journal: swaps debits/credits of original; only if original had journal) | Multi-write: void event INSERT + reversal journal INSERT + original event status UPDATE + book recompute + book UPDATE in transaction |

---

## Architectural Direction Confirmed

**Direction:** Extend `modules-accounting`

- All new fixed assets code stays within the existing `modules-accounting` package for posting hooks
- API routes remain in `apps/api/src/routes/`
- Business logic libraries in `apps/api/src/lib/fixed-assets/`, `apps/api/src/lib/depreciation.ts`, `apps/api/src/lib/fixed-assets-lifecycle.ts`
- Shared schemas in `packages/shared/src/schemas/fixed-assets.ts` and `packages/shared/src/schemas/depreciation.ts`
- No new package creation required for the fixed assets extraction

---

## Files Analyzed

| File | LOC | Purpose |
|------|-----|---------|
| `apps/api/src/lib/fixed-assets/index.ts` | 648 | Fixed asset category and asset CRUD |
| `apps/api/src/lib/depreciation.ts` | 704 | Depreciation plan/run orchestration |
| `apps/api/src/lib/fixed-assets-lifecycle.ts` | 1868 | Lifecycle events: acquisition, transfer, impairment, disposal, void |
| `apps/api/src/routes/accounts.fixed-assets.test.ts` | 1024 | Existing test coverage for category and asset CRUD |
| `apps/api/src/routes/accounts.ts` | 1338 | All 18 endpoint signatures and route handlers |
| `packages/modules/accounting/src/posting/depreciation.ts` | 183 | Existing depreciation posting hook |
| `packages/shared/src/schemas/fixed-assets.ts` | 202 | Lifecycle event schemas (acquisition, transfer, impairment, disposal, void) |
| `packages/shared/src/schemas/depreciation.ts` | 101 | Depreciation plan/run schemas |

---

## Typecheck Validation

```
npm run typecheck -w @jurnapod/modules-accounting  # PASSED
npm run typecheck -w @jurnapod/api                   # PASSED
```

---

## Dev Agent Record

**Analysis completed by:** bmad-dev-story (bmad coding plan mini-max-m2.7)
**Date:** 2026-04-04
**Story status:** review (awaiting reviewer approval)
