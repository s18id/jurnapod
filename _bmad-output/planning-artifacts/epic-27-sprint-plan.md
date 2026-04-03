# Epic 27 Sprint Plan

## Overview
**Epic:** POS Sync Push Boundary Completion  
**Duration:** 2-3 sprints  
**Goal:** Extract remaining heavy API-local sync push logic into packages, leaving API as thin transport adapter.

## Dependency Direction

```
pos-sync → modules-accounting (COGS/posting)
pos-sync → modules-inventory (stock deduction)
pos-sync → sync-core (idempotency)
pos-sync → modules-reservations (table/reservation)
modules-accounting → modules-inventory-costing (cost calculation)
```

## Sprint Breakdown

### Sprint 1: Contract + Package Parity (Stories 27.1–27.4)

#### Story 27.1: Contract alignment & type source-of-truth
- **Estimate:** 2h
- **Priority:** P1
- **Dependencies:** None
- **Focus:** Move domain types/errors to packages, remove mysql2 types

#### Story 27.2: Replace API POS-sale posting with modules-accounting
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 27.1
- **Focus:** Parity check + wire API to package `runSyncPushPostingHook`, delete duplicate

#### Story 27.3: COGS parity in modules-accounting
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 27.1
- **Focus:** Port missing behaviors to package `posting/cogs.ts`, delete duplicate

#### Story 27.4: Move stock transaction-resolution to modules-inventory
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 27.1
- **Focus:** Add `resolveAndDeductForPosTransaction` to inventory service, delete API copy

### Sprint 2: Phase2 Wiring + API Simplification (Stories 27.5–27.6)

#### Story 27.5: Implement phase2 in pos-sync (replace stubs)
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 27.2, 27.3, 27.4
- **Focus:** Replace pos-sync stubs with concrete package calls

#### Story 27.6: API simplification + full validation gate
- **Estimate:** 2h
- **Priority:** P1
- **Dependencies:** 27.5
- **Focus:** Thin route, clean dead files, full test gate

## Story Dependencies

```
27.1 (contract)
  └── 27.2 (posting) ─┐
  └── 27.3 (COGS)    ─┼─ parallel after 27.1
  └── 27.4 (stock)    ┘
        └── 27.5 (phase2 wiring) ── sequential
              └── 27.6 (gate) ── sequential
```

## Files Changed Summary

| Story | File | Change |
|-------|------|--------|
| 27.1 | `packages/pos-sync/src/push/types.ts` | +domain types + errors |
| 27.1 | `packages/sync-core/src/constants.ts` | +idempotency constants |
| 27.1 | `apps/api/src/lib/sync/push/types.ts` | thin re-export facade |
| 27.2 | `packages/modules/accounting/src/posting/sync-push.ts` | parity fixes if needed |
| 27.2 | `apps/api/src/lib/sync-push-posting.ts` | DELETE |
| 27.3 | `packages/modules/accounting/src/posting/cogs.ts` | parity fixes |
| 27.3 | `apps/api/src/lib/cogs-posting.ts` | DELETE |
| 27.4 | `packages/modules/inventory/src/services/stock-service.ts` | +POS method |
| 27.4 | `apps/api/src/lib/sync/push/stock.ts` | delete or thin facade |
| 27.5 | `packages/pos-sync/src/push/index.ts` | replace stubs |
| 27.6 | `apps/api/src/routes/sync/push.ts` | thin adapter |
| 27.6 | `apps/api/src/lib/sync/push/transactions.ts` | remove heavy orchestration |

## Key Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Double-posting under retries | Medium | Parity check in 27.2/27.3 preserves idempotency guard |
| Behavior drift | Medium | Compare API vs package before deleting; add integration tests |
| Phase1/phase2 transaction boundary | High | `withTransaction` pattern must stay exact |
| Table/reservation side effects lost | Low | Explicit contract tests for table/reservation calls |
| Type split-brain | Low | 27.1 establishes single source of truth |

## Completion Criteria

All stories done +:
- `npm run typecheck -w @jurnapod/pos-sync`
- `npm run build -w @jurnapod/pos-sync`
- `npm run typecheck -w @jurnapod/modules-inventory`
- `npm run build -w @jurnapod/modules-inventory`
- `npm run typecheck -w @jurnapod/modules-accounting`
- `npm run build -w @jurnapod/modules-accounting`
- `npm run typecheck -w @jurnapod/api`
- `npm run build -w @jurnapod/api`
- `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts`
- `npm run test:unit:critical -w @jurnapod/api`
- `npm run test:unit -w @jurnapod/api`
- `sync-push-posting.ts` deleted
- `cogs-posting.ts` deleted
