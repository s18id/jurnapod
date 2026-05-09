# Story 59.8 Completion Report — POS_SALE Reversal Journal Correctness

## Story
- **Epic:** 59
- **Story:** 59.8
- **Title:** POS_SALE Reversal Journal Correctness

## Outcome
Closed the P0 gap where POS_SALE journals (sales revenue, tax, payments, discount, AR) were never reversed on VOID/REFUND when `SYNC_PUSH_POSTING_MODE=active`. Implemented `createPosSaleReversalJournalsForCorrection()` as a decomposed production function, refactored to use only Kysely-native queries and production repository. Fully wired through the posting hook chain.

## Acceptance Criteria Evidence

| AC | Requirement | Evidence | Status |
|---|---|---|---|
| AC1 | POS_SALE_REVERSAL created on VOID | Accounting test: `createPosSaleReversalJournalsForCorrection()` returns non-null `reversalBatchId` with `doc_type='POS_SALE_REVERSAL'` | ✅ PASS |
| AC2 | Revised lines debit↔credit swapped | Test verifies `revLines[i].debit === origLines[i].credit` and `revLines[i].credit === origLines[i].debit` | ✅ PASS |
| AC3 | Reversal balanced | `totalDebit === totalCredit` and `totalDebit > 0` verified | ✅ PASS |
| AC4 | Linkage tags present | `REV:VOID`, `OT:{id}`, `CT:{id}`, `CTX:{id}` verified on every line | ✅ PASS |
| AC5 | Original journal immutable | `afterLines[i].debit === origLines[i].debit` verified after reversal | ✅ PASS |
| AC6 | Returns null when no POS_SALE | Function returns `null` for nonexistent `originalPosTransactionId` | ✅ PASS |

## Production Functions Used

All operations in the reversal path now use decomposed production functions:

| Operation | Function | Location |
|-----------|----------|----------|
| Find batches | `findJournalBatchesByDoc` | `sync-push.ts` |
| Read lines | `readJournalLinesByBatch` | `sync-push.ts` |
| Insert batch | `PosSyncPushPostingRepository.createJournalBatch` | `sync-push.ts` |
| Insert lines | `PosSyncPushPostingRepository.insertJournalLines` | `sync-push.ts` |
| Create reversal | `createPosSaleReversalJournalsForCorrection` | `sync-push.ts` |

No raw SQL `INSERT` statements remain in the reversal function. All queries use Kysely-native `insertInto`, `selectFrom`, etc.

## Commands and Results

```bash
npm run test:single -w @jurnapod/modules-accounting -- __test__/integration/posting/pos-sale-reversal.test.ts  # 7/7
npm run test:single -w @jurnapod/api -- __test__/integration/sync/pos-sale-reversal.test.ts  # 3/3
npm run build -w @jurnapod/modules-accounting  # PASS
npm run typecheck -w @jurnapod/api  # PASS
```

Result: **10/10 tests pass** (7 accounting + 3 API)

## Files Modified

| File | Change |
|---|---|
| `packages/modules/accounting/src/posting/sync-push.ts` | Added `findJournalBatchesByDoc`, `readJournalLinesByBatch`, `createPosSaleReversalJournalsForCorrection`, `runActiveReversalHook`. Refactored `PosSyncPushPostingRepository` to Kysely-native `insertInto`. |
| `packages/modules/accounting/src/posting/index.ts` | Exported new functions |
| `packages/modules/accounting/package.json` | Added `./posting/sync-push` and `./test-fixtures/pos-sale-journal-fixtures` exports |
| `packages/pos-sync/src/push/index.ts` | Wired posting hook callback for VOID/REFUND reversal |
| `packages/pos-sync/src/push/types.ts` | Extended with `PostingHookContext`, `PostingHookFn` |
| `apps/api/src/routes/sync/push.ts` | Created posting hook callback wiring |
| `apps/api/src/lib/sync/push/transactions.ts` | Extended GL imbalance check for VOID/REFUND |
| `apps/api/__test__/integration/sync/pos-sale-reversal.test.ts` | **NEW** — 3 tests using production functions only |
| `packages/modules/accounting/__test__/integration/posting/pos-sale-reversal.test.ts` | **NEW** — 7 tests |

## Review Gate
- Reviewer GO with P2/P3 findings filed (59.8-1: e2e test hardening, 59.8-2: dead code in transactions.ts, 59.8-3: linkage tag duplication)
- No P0/P1 blockers

_Last Updated: 2026-05-09_
