# Story 59.2 Completion Report — Sync Idempotency Contract Correctness

## Story
- **Epic:** 59
- **Story:** 59.2
- **Title:** Sync Idempotency Contract Correctness

## Outcome
Verified and hardened the sync push idempotency contract. The `client_tx_id` lookup in `pos-sync/src/push/index.ts` correctly scopes by `company_id` + `outlet_id` and returns `DUPLICATE` without reprocessing. Added comprehensive integration tests covering all acceptance criteria plus edge cases.

## Acceptance Criteria Evidence

| AC | Requirement | Evidence | Status |
|---|---|---|---|
| AC1 | Unique `client_tx_id` returns OK | `push-idempotency.test.ts` — first submit with unique ID returns OK with pos_transaction created | ✅ PASS |
| AC2 | Duplicate returns DUPLICATE | `push-idempotency.test.ts` — second submit with same `client_tx_id` returns DUPLICATE, no second row created | ✅ PASS |
| AC3 | No duplicate financial effects | `push-idempotency.test.ts` — duplicate does NOT create additional journal batches or pos_transaction rows | ✅ PASS |
| AC4 | Missing `client_tx_id` rejected | `push-idempotency.test.ts` — returns 400 with "client_tx_id is required" via OpenAPI `defaultHook` + `extractClientTxIdValidationError` | ✅ PASS |
| AC5 | Invalid format rejected | Empty string → 400, non-UUID → 400, non-string → 400 | ✅ PASS |
| AC6 | Cross-tenant isolation | Same `client_tx_id` in different company treated as new transaction (not DUPLICATE). Uses outlet-scoped ADMIN + global CASHIER for Company B | ✅ PASS |
| Edge | Retry after DUPLICATE | Retry after DUPLICATE returns same deterministic DUPLICATE response | ✅ PASS |

## Commands and Results

```bash
npm run test:single -w @jurnapod/api -- __test__/integration/sync/push-idempotency.test.ts
```

Result: **9/9 tests pass**

## Files Modified

| File | Change |
|---|---|
| `apps/api/src/routes/sync/push.ts` | Improved `extractClientTxIdValidationError` for all Zod error formats; wired posting hook callback |
| `apps/api/src/routes/openapi-aggregator.ts` | Added `defaultHook` for `client_tx_id` validation errors |
| `apps/api/__test__/integration/sync/push-idempotency.test.ts` | **NEW** — 9 tests covering AC1-AC6 + edge cases |

## Review Gate
- Implementation verified by test evidence
- Cross-tenant isolation works correctly
- No duplicate financial effects confirmed

_Last Updated: 2026-05-09_
