# Post-Epic Fixes Completion Notes (2026-04-08)

## Summary

Fixed 25 failing API integration tests and hardened lint rule after Epic 34 completion.

## Root Cause

**Primary:** `userId: 0` sentinel in `createTestPrice` and `batchInsertPrices` violated FK on `audit_logs.user_id`, causing MySQL errno 1452 → `InventoryReferenceError("Invalid company references")` in 14 tests.

**Secondary:**
- Missing `InventoryReferenceError`/`InventoryConflictError`/`InventoryForbiddenError` catches in inventory routes → 500 instead of proper HTTP status codes
- `DELETE /inventory/item-prices/:id` returned 200 for non-existent prices
- `item-groups/update` test code collision from `.slice(0, 20)` truncation

## Changes

### 1. Audit Actor Enforcement (`commit ed6839c`)

- `MutationAuditActor.userId` is required `number` (not nullable)
- `createTestPrice` requires real `userId` (passed from `ctx.cashierUserId`)
- `batchInsertPrices` requires actor with real `userId`
- Import route passes `auth.userId` through full call chain

### 2. Error Handling (`commit ed6839c`)

Added proper catches for `InventoryReferenceError`, `InventoryConflictError`, `InventoryForbiddenError` in 12 inventory route handlers.

### 3. Unused Import Cleanup (`commit bb297e7`)

Removed 5 unused imports across `batch-operations.ts`, `item-prices/index.ts`, `items/index.ts`.

### 4. Lint Rule Hardening (`commit b0fcf39`)

- Fixed `no-route-business-logic` false positives: SQL-shape regex replaces crude substring matching
- Added 14 unit tests for lint rule
- Guard against undefined/null in `isRawSqlLiteral`

## Results

| Metric | Before | After |
|--------|--------|-------|
| Failing API tests | 25 | 0 |
| Lint errors | 83 | 27 (all genuine) |
| Lint false positives | ~56 | 0 |
| Total tests passing | — | 858 |
| Lint warnings | 69 | 69 |

## Remaining Lint Issues

27 errors — all genuine pre-existing architectural violations:

| Category | Count |
|----------|-------|
| `getDb()` direct in routes | ~18 |
| Service instantiation in routes | ~6 |
| Raw SQL in 2 route files | 2 |
| Hardcoded IDs in test | 1 |

## Commits

- `ed6839c` — `fix(api): enforce authenticated userId in audit actor for all mutations`
- `bb297e7` — `fix(api): remove unused imports causing lint errors`
- `b0fcf39` — `fix(lint): harden no-route-business-logic SQL detection regex`

## Status
✅ COMPLETE — 25 failing tests → 0, lint false positives eliminated
