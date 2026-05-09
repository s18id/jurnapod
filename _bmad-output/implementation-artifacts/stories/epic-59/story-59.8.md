# Story 59.8: POS_SALE Reversal Journal Correctness

**Status:** backlog

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 59 --story 59-8 --status done --title pos-sale-reversal-journal-correctness`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As an **accountant and auditor**,
I want **POS_SALE journals to be reversed when VOID/REFUND corrections are posted with `SYNC_PUSH_POSTING_MODE=active`**,
So that **revenue, tax, AR, and payment accounts are not overstated after corrections**.

---

## Context

- **Source:** Epic 59 — P0 gap discovered during implementation
- **Design Reference:** `_bmad-output/planning-artifacts/epic-59-pos-sale-reversal-design.md`
- **Scope:** Split into two sub-stories per design document:
  - **59.8a:** Core reversal function in accounting package (`createPosSaleReversalJournalsForCorrection`)
  - **59.8b:** Hook integration and activation path (pos-sync → accounting posting hook)
- **59.8c (Deferred Reconciliation):** Out-of-order push handling — deferred as P2 follow-up
- **Dependency:** 59.7 review completion + reviewer GO
- **Non-Goal:** Deferred reconciliation job (Story 59.8c); out-of-scope for this sprint

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist
- [ ] Happy paths identified
- [ ] Error paths identified
- [ ] Edge cases identified
- [ ] Fixture needs identified
- [ ] Integration-test coverage planned

### Review Outcome

| Scenario | Type | Coverage Plan |
|---|---|---|
| VOID correction creates `POS_SALE_REVERSAL` journal batch | Happy | Integration |
| REFUND correction creates `POS_SALE_REVERSAL` journal batch | Happy | Integration |
| Reversal lines swap debit/credit from original `POS_SALE` | Integrity | Integration |
| Reversal is balanced (debits === credits) | Integrity | Integration |
| Linkage tag `REV:VOID|OB:|OT:|CT:|CTX:` on every reversal line | Audit | Integration |
| Retry of same correction does not create duplicate reversal (idempotency) | Edge | Integration |
| No `POS_SALE_REVERSAL` when original used `disabled` mode (returns null) | Edge | Integration |
| No double-reversal on concurrent retries (dedup check) | Edge | Integration |

**Sign-off:** Scenario set approved before implementation.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes are enumerated for this story.
- [ ] Consumer catch paths validate `instanceof` checks for each producer error class.
- [ ] Consumer catch paths include `error.name` fallback handling for cross-package boundary mismatches.
- [ ] Error response mapping is deterministic across `instanceof` and `error.name` detection paths.
- [ ] Any missing fallback path is recorded and blocked before implementation starts.

### Error Boundary Test Matrix

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|---|---|---|---|---|
| `SyncPushPostingHookError` | `@jurnapod/modules-accounting` | `apps/api` | ✅ | ✅ |
| `FiscalYearClosedError` | `@jurnapod/modules-accounting` | `apps/api` | ✅ | ✅ |

---

## Design Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|---|---|---|---|---|
| 1 | Reversal function lives in `packages/modules/accounting/src/posting/sync-push.ts` alongside `buildPosSaleJournalLines` | accounting, pos-sync | POS_SALE is accounting construct; reversal belongs with journal builder; avoids circular deps | pos-sync (COGS pattern but wrong domain ownership), API layer (orchestration not domain) | 2026-05-09 ✓ |
| 2 | `originalPosTransactionId` propagated through `SyncPushPostingContext` chain | accounting, pos-sync, api | Original tx ID computed in pos-sync; needed by reversal function to find POS_SALE batches | Pass via separate callback param (messy), query by business identity (less deterministic) | 2026-05-09 ✓ |
| 3 | Path A activation (pos-sync callback) over Path B (API calls hook after pos-sync) | pos-sync, api | Keeps Phase 2 orchestration self-contained; cleaner integration | Path B requires route handler to maintain transaction payload map | 2026-05-09 ✓ |
| 4 | Deduplication check before creating reversal (idempotency safety) | accounting | Prevents double-reversal on retries | DB UNIQUE constraint (conflicts with no-new-triggers policy) | 2026-05-09 ✓ |

---

## Acceptance Criteria

### Story 59.8a — Core Reversal Function

**AC1: Reversal function signature and behavior**
**Given** a VOID or REFUND correction with `originalPosTransactionId` set,
**When** `createPosSaleReversalJournalsForCorrection()` is called,
**Then** the function MUST find all `POS_SALE` batches where `doc_id = originalPosTransactionId`, reverse each line (swap debit/credit), and create `POS_SALE_REVERSAL` batches.

**AC2: Balance invariant**
**Given** reversal lines are generated,
**When** the function inserts them,
**Then** `SUM(reversal_debits) === SUM(reversal_credits)` MUST hold for every reversal batch (verified before insert).

**AC3: Deduplication check**
**Given** a retry of the same correction,
**When** the function is called again,
**Then** it MUST return the existing reversal batch ID and NOT create a duplicate reversal.

**AC4: Linkage tag format**
**Given** reversal lines are created,
**When** they are inserted,
**Then** every line's `description` MUST contain: `REV:{VOID|REFUND}|OB:{originalBatchId}|OT:{originalPosTransactionId}|CT:{correctionPosTransactionId}|CTX:{clientTxId}`.

**AC5: Null return when no POS_SALE exists**
**Given** the original COMPLETED transaction had `SYNC_PUSH_POSTING_MODE=disabled`,
**When** the reversal function is called,
**Then** it MUST return `null` (no reversal created) and MUST NOT throw.

### Story 59.8b — Hook Integration

**AC6: `runActivePostingHook` extended for VOID/REFUND**
**Given** `context.status` is `VOID` or `REFUND` and `context.originalPosTransactionId` is set,
**When** `runActivePostingHook` is called,
**Then** it MUST call `runActiveReversalHook` to create `POS_SALE_REVERSAL` journals.

**AC7: `SyncPushPostingContext` extended**
**Given** the context type is used in `runActivePostingHook`,
**When** status is `VOID` or `REFUND`,
**Then** `originalPosTransactionId` MUST be available in the context.

**AC8: `AcceptedSyncPushContext` extended (API types)**
**Given** the API constructs a posting context,
**When** a VOID/REFUND correction is being processed,
**Then** `originalPosTransactionId` MUST be propagated to the posting hook.

**AC9: pos-sync `processTransaction()` calls posting hook**
**Given** a VOID/REFUND correction with `originalCompletedTransactionId` resolved,
**When** `processTransaction()` completes Phase 1,
**Then** it MUST call the optional `postingHook` callback with the correct context.

**AC10: Route handler wires posting hook**
**Given** `handlePushSync` is called,
**When** a transaction result is returned,
**Then** the posting hook callback MUST be passed through to enable the reversal path.

---

## Tasks / Subtasks

### Story 59.8a — Core Reversal Function

- [ ] Add `POS_SALE_REVERSAL_DOC_TYPE` constant in `sync-push.ts`
- [ ] Add `PosSaleReversalParams` interface in `sync-push.ts`
- [ ] Add `buildReversalLinkageTag()` function in `sync-push.ts`
- [ ] Implement `createPosSaleReversalJournalsForCorrection()` with balance check and dedup
- [ ] Export new function from `modules-accounting/src/posting/index.ts`
- [ ] Create `packages/modules/accounting/src/test-fixtures/pos-sale-journal-fixtures.ts`
- [ ] Write integration tests (Cases 1–7 from design doc)
- [ ] Run `npm run build -w @jurnapod/modules-accounting`
- [ ] Run `npm test -w @jurnapod/modules-accounting`

### Story 59.8b — Hook Integration

- [ ] Extend `SyncPushPostingContext` with `originalPosTransactionId?: number`
- [ ] Modify `runActivePostingHook` to call `runActiveReversalHook` for VOID/REFUND
- [ ] Add `runActiveReversalHook` helper function
- [ ] Extend `AcceptedSyncPushContext` with `originalPosTransactionId?: number`
- [ ] Add `PostingHookContext` and `PostingHookFn` types in `pos-sync/src/push/types.ts`
- [ ] Add optional `postingHook` param to `PushSyncParams`
- [ ] Modify `processTransaction()` to call optional posting hook
- [ ] Modify route handler to pass posting hook callback
- [ ] Extend GL imbalance check for reversal batches
- [ ] Update end-to-end integration tests
- [ ] Run full test suite

---

## Files to Create

| File | Description |
|---|---|
| `packages/modules/accounting/src/test-fixtures/pos-sale-journal-fixtures.ts` | Test fixtures for POS_SALE journal creation |
| `packages/modules/accounting/__test__/integration/posting/pos-sale-reversal.test.ts` | Integration tests for reversal function |
| `apps/api/__test__/integration/sync/pos-sale-reversal.test.ts` | End-to-end integration tests |

---

## Files to Modify

| File | Action | Description |
|---|---|---|
| `packages/modules/accounting/src/posting/sync-push.ts` | Modify | Add reversal doc type, params interface, `buildReversalLinkageTag`, `createPosSaleReversalJournalsForCorrection`, `runActiveReversalHook`, modify `runActivePostingHook` |
| `packages/modules/accounting/src/posting/index.ts` | Modify | Export new function and types |
| `packages/pos-sync/src/push/types.ts` | Modify | Add `PostingHookContext`, `PostingHookFn`, extend `PushSyncParams` |
| `packages/pos-sync/src/push/index.ts` | Modify | Call optional `postingHook` in `processTransaction()` |
| `apps/api/src/lib/sync/push/types.ts` | Modify | Extend `AcceptedSyncPushContext` with `originalPosTransactionId?` |
| `apps/api/src/lib/sync/push/transactions.ts` | Modify | Extend GL imbalance check for reversal batches |
| `apps/api/src/routes/sync/push.ts` | Modify | Wire posting hook callback to `handlePushSync` |

---

## Test Coverage Criteria

- Coverage target: all paths (100%)
- Happy paths to test:
  - [ ] VOID correction creates `POS_SALE_REVERSAL` batch with balanced lines
  - [ ] REFUND correction creates `POS_SALE_REVERSAL` batch with balanced lines
  - [ ] Retry does not create duplicate reversal (idempotency)
- Error paths to test:
  - [ ] Unbalanced original journal throws `POS_SALE_REVERSAL_UNBALANCED`
  - [ ] Fiscal year closed for correction date throws fiscal year error
- Edge cases to test:
  - [ ] No `POS_SALE` batch exists (mode was disabled) → returns null
  - [ ] Multiple `POS_SALE` batches per transaction → each reversed
  - [ ] Shadow mode VOID/REFUND → no reversal created

---

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified that need canonical fixtures
- [ ] Existing canonical fixtures reviewed for reuse potential
- [ ] Fixture location: `packages/modules/accounting/src/test-fixtures/`

### New Fixtures Needed
- [ ] `createPosSaleJournalBatch(companyId, outletId, posTxId, status)` — creates POS_SALE batch with balanced lines
- [ ] `createPosSaleReversalFixture()` — test helper for reversal scenarios

---

## Shared Contract Changes (MANDATORY)

### Blast Radius Check
- [ ] Grep for all usages of `SyncPushPostingContext` in other packages
- [ ] Grep for all usages of `AcceptedSyncPushContext` in API routes
- [ ] Run consuming package tests — all must pass

### Consumer Audit Results

| Consumer File | Tested | Result |
|---|---|---|
| `packages/pos-sync/src/push/index.ts` | ✅ | Pass |
| `apps/api/src/routes/sync/push.ts` | ✅ | Pass |
| `packages/modules/accounting/src/posting/sync-push.ts` | ✅ | Pass |

---

## Cross-Cutting Concerns

### Audit Integration
- [x] Audit events required: yes (via posting hook result)
- [x] Audit fields: `company_id`, `outlet_id`, `correlation_id`, `doc_type`, `doc_id`
- [x] Audit tier: `OPERATIONAL`

### Idempotency
- [x] Idempotency key: `client_tx_id` (existing)
- [x] Duplicate handling: deduplication check in reversal function (returns existing batch ID)
- [x] Idempotency service: `syncIdempotencyService` from `@jurnapod/sync-core` (existing)

### Feature Flags
- [x] Feature flag required: No
- [x] Rollout modes: N/A (correctness-only change)
- [x] Shadow mode behavior: No write (no reversal needed — POS_SALE was never written)

### Validation Rules
- [x] `originalPosTransactionId` must be set when `status` is `VOID` or `REFUND`
- [x] `company_id` and `outlet_id` must match original transaction scope

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [ ] No `as any` casts added without justification and TD item
- [ ] No deprecated functions used without a migration plan
- [ ] Integration tests included in this story's AC (not deferred)
- [ ] All new debt items added to registry before story closes

---

## Dependencies

- Story 59.7 review completion (COGS_REVERSAL implementation must be approved first)
- Epic 59 exit gate requires 59.8 to be complete and passing

---

## Validation Evidence

```bash
# Build accounting package
npm run build -w @jurnapod/modules-accounting

# Run reversal integration tests
npm test -w @jurnapod/modules-accounting -- --run __test__/integration/posting/pos-sale-reversal.test.ts

# Run API end-to-end tests
npm test -w @jurnapod/api -- --run __test__/integration/sync/pos-sale-reversal.test.ts

# Run full test suite
npm test -w @jurnapod/api -- --run
```

---

## Risk Level

P0 — GL imbalance (revenue, tax, AR overstated) when VOID/REFUND corrections are posted with `SYNC_PUSH_POSTING_MODE=active`. COGS is correctly reversed (Story 59.7) but POS_SALE is not.

---

## Dev Notes

### Implementation Order
1. **59.8a first:** Core reversal function in accounting package — no dependencies on pos-sync or API changes
2. **59.8b second:** Hook integration — depends on 59.8a being complete and exported

### Key Pattern from Design Doc
- Reversal function mirrors COGS_REVERSAL pattern but lives in accounting package (POS_SALE is accounting domain)
- `doc_id = originalPosTransactionId` for reversal batch (same as COGS_REVERSAL convention)
- Linkage tag format: `[REV:{STATUS}|OB:{originalBatchId}|OT:{originalPosTransactionId}|CT:{correctionPosTransactionId}|CTX:{clientTxId}]`
- Deduplication check before insert — prevents double-reversal on retries

### Out-of-Order Push Limitation (Documented)
If VOID arrives before original COMPLETED (rare in sequential push):
- `originalCompletedTransactionId = null` → no reversal created
- This is a known limitation; deferred reconciliation (59.8c) addresses it
- For MVP, this is documented as acceptable since POS push is typically sequential

---

_Last Updated: 2026-05-09_