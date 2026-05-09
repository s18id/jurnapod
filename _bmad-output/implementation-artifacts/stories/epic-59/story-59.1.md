# Story 59.1: POS Transaction Lifecycle Correctness

**Status:** in-progress

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 59 --story 59-1 --status done --title pos-transaction-lifecycle-correctness`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **cashier and accountant**,  
I want **POS lifecycle transitions to enforce immutable finalization**,  
So that **financial effects remain correct and auditable**.

## Context

- Source: Epic 59
- Predecessor: Epic 58 close gate complete
- Scope: lifecycle transitions + reversal behavior, no net-new features
- Scope refinement (2026-05-09): AC1–AC3 remain in Story 59.1; AC4 execution and evidence closure is deferred to Story 59.7.

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist
- [x] Happy paths identified
- [x] Error paths identified
- [x] Edge cases identified
- [x] Fixture needs identified
- [x] Integration-test coverage planned

### Review Outcome

| Scenario | Type | Coverage Plan |
|---|---|---|
| DRAFT → FINALIZED allowed | Happy | Integration |
| FINALIZED direct mutation rejected | Error | Integration |
| FINALIZED → VOID/REFUND reversal path | Happy | Integration |

**Sign-off:** Scenario set approved before implementation.

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

- [ ] Verify `instanceof` handling for listed producer errors.
- [ ] Verify `error.name` fallback handling for the same errors.
- [ ] Verify response contract is identical across both detection paths.

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|---|---|---|---|---|
| `InvoiceStatusError` | `@jurnapod/modules-sales` | `apps/api` | Yes | No |
| `DatabaseConflictError` | `apps/api/lib/shared` | `apps/api` | Yes | No |
| `SalesAuthorizationError` | `@jurnapod/modules-sales` | `apps/api` | Yes | No |

## Acceptance Criteria

**AC1: Valid transition control**  
**Given** a POS transaction in `DRAFT`,  
**When** the user finalizes the transaction,  
**Then** transition to `FINALIZED` MUST succeed with consistent persisted state.

**AC2: Finalized immutability**  
**Given** a POS transaction in `FINALIZED`,  
**When** an update attempts to mutate finalized financial fields,  
**Then** the mutation MUST be rejected.

**AC3: Correction flow only via VOID/REFUND**  
**Given** a finalized transaction requiring correction,  
**When** correction is requested,  
**Then** the system MUST execute VOID/REFUND semantics and MUST NOT silently mutate original finalized payload.

**AC4: Financial reversal integrity**  
**Given** VOID/REFUND execution,  
**When** journals are inspected,  
**Then** reversal effects MUST be balanced and linked for audit.

## Tasks / Subtasks

- [x] Define/verify lifecycle transition guards
- [x] Add/adjust integration tests for immutable finalized state
- [ ] Verify VOID/REFUND reversal audit linkage

## Files to Modify

| File | Action | Description |
|---|---|---|
| packages/pos-sync/src/push/index.ts | Modify | Enforce finalized immutability guard by business identity and correction path gating |
| packages/pos-sync/__test__/integration/persist-push-batch.integration.test.ts | Modify | Add AC2/AC3 integration coverage for COMPLETED reject + VOID/REFUND allow |

## Dependencies

- Story 59.7: Awaiting reviewer GO for COGS_REVERSAL implementation (pending review completion)
- Story 59.8: Must complete before AC4 can be fully verified — POS_SALE reversal is required for AC4 financial linkage completeness
- **AC4 is blocked until both 59.7 and 59.8 are done** — current evidence shows COGS_REVERSAL but POS_SALE reversal is still required

## AC Evidence Snapshot (2026-05-09)

| AC | Evidence | Status |
|---|---|---|
| AC2 | `packages/pos-sync/src/push/index.ts` finalized-identity guard returns `FINALIZED_TRANSACTION_MUTATION_REQUIRES_VOID_OR_REFUND` for incoming `COMPLETED` mutation on finalized identity | ✅ PASS |
| AC3 | `packages/pos-sync/src/push/index.ts` allows correction statuses `VOID` and `REFUND`; integration tests validate `result=OK` with new `client_tx_id` and same business identity | ✅ PASS |
| AC4 | **BLOCKED** — COGS reversal evidence in 59.7 ✅; POS_SALE reversal required (Story 59.8). Both COGS_REVERSAL and POS_SALE_REVERSAL must exist for AC4 completeness. Story 59.8 creation triggers re-evaluation of 59.1 AC4 status. | ⚠️ BLOCKED |

## Story 59.1 Completion Criteria

AC1, AC2, AC3: ✅ DONE  
AC4: ⏳ WAITING on Story 59.7 review GO + Story 59.8 completion

## Dev Agent Record

### 2026-05-09 — AC2/AC3 implementation + closure prep

- Implemented and verified finalized immutability/correction guard behavior in `packages/pos-sync/src/push/index.ts` (existing working-tree implementation validated by targeted integration tests).
- Added integration tests in `packages/pos-sync/__test__/integration/persist-push-batch.integration.test.ts` for:
  - finalized `COMPLETED` mutation rejection with explicit message,
  - `VOID` correction allow path,
  - `REFUND` correction allow path,
  - preserved duplicate replay behavior by `client_tx_id`.
- Follow-up correctness patch: removed finalized-candidate hard cap (`LIMIT 20`) in `findMatchingFinalizedTransactionByBusinessIdentity` to avoid false negatives.

Validation evidence (targeted):

```bash
npm run typecheck -w @jurnapod/pos-sync
npm run test:single -w @jurnapod/pos-sync -- __test__/integration/persist-push-batch.integration.test.ts --testNamePattern "finalized|VOID|REFUND|duplicate transactions by client_tx_id"
```

Result summary:
- Typecheck: PASS
- Focused integration tests: PASS (`4 passed | 10 skipped`)

Open blocker for AC4:
- POS VOID/REFUND reversal journal creation/linkage assertions are not implemented in `packages/pos-sync` path; correction postings remain outside current package path due existing posting-hook deferral.

Dependency handoff:
- Story 59.7: POS VOID/REFUND Reversal Journal Linkage Correctness (dedicated AC4 execution/evidence story).

## Risk Level

P1 — foundational lifecycle correctness for all subsequent stories.

_Last Updated: 2026-05-08_
