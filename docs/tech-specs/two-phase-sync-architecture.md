# Two-Phase Sync Architecture: State Diagram & Handoff Contract

**Status:** Approved  
**Effective Date:** 2026-03-31  
**Epic:** Epic 17  
**Last Updated:** 2026-04-04

---

## Overview

The POS Sync Push operation uses a two-phase architecture to separate concerns between:
- **Phase 1 (pos-sync package):** Data persistence — transactions, orders, items, payments
- **Phase 2 (API layer):** Business logic — COGS posting, stock deduction, table release, reservation updates, posting hooks

This document provides:
1. State diagram showing the complete lifecycle
2. Handoff contract defining what Phase 1 passes to Phase 2
3. Validation rules at each transition point

---

## State Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         POS PUSH SYNC LIFECYCLE                               │
└──────────────────────────────────────────────────────────────────────────────┘

[Client Request] ──▶ [Phase 1: Persistence]
                            │
                            ▼
              ┌─────────────────────────────┐
              │      POS-SYNC PACKAGE      │
              │  packages/pos-sync/src/    │
              │                             │
              │  State: PERSISTING         │
              │                             │
              │  • Validate company_id     │
              │  • Check idempotency       │
              │  • Insert transactions     │
              │  • Upsert order snapshots  │
              │  • Process variant sales   │
              │  • Deduct stock            │
              └─────────────────────────────┘
                            │
                            │ SyncPushResultItem[]
                            │
                            ▼
              ┌─────────────────────────────┐
              │        HANDOFF POINT        │ ◄── PhaseBoundary
              │                             │     Critical: All Phase 1
              │  State: PHASE1_COMPLETE    │     must succeed before
              │                             │     Phase 2 begins
              └─────────────────────────────┘
                            │
                            │ Iterate phase1Results
                            ▼
              ┌─────────────────────────────┐
              │       API LAYER            │
              │  apps/api/src/routes/sync/ │
              │                             │
              │  State: BUSINESS_LOGIC     │
              │                             │
              │  For each result:           │
              │  • postCOGS()             │
              │  • deductStock()           │
              │  • releaseTable()          │
              │  • updateReservation()      │
              │  • invokePostingHook()     │
              └─────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │      COMPLETION            │
              │                             │
              │  State: SYNC_COMPLETE      │
              │                             │
              │  • Return SyncResponse     │
              │  • Audit completeEvent     │
              └─────────────────────────────┘
                            │
                            ▼
                       [Response]
```

---

## Phase Boundaries

### PhaseBoundary Enum

```typescript
// packages/pos-sync/src/push/types.ts
export enum PhaseBoundary {
  PERSISTING = 'PERSISTING',
  PHASE1_COMPLETE = 'PHASE1_COMPLETE',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  SYNC_COMPLETE = 'SYNC_COMPLETE',
  FAILED = 'FAILED'
}
```

### State Transitions

| Current State | Event | Next State | Transition Valid |
|--------------|-------|------------|------------------|
| PERSISTING | All writes succeed | PHASE1_COMPLETE | ✅ |
| PERSISTING | Idempotency duplicate | PHASE1_COMPLETE | ✅ (skip Phase 2) |
| PERSISTING | Write failure | FAILED | ❌ Rollback |
| PHASE1_COMPLETE | Iterate results | BUSINESS_LOGIC | ✅ |
| BUSINESS_LOGIC | All handlers succeed | SYNC_COMPLETE | ✅ |
| BUSINESS_LOGIC | Handler failure | FAILED | ❌ Partial commit |
| ANY | Timeout | FAILED | ❌ |

---

## Handoff Contract

### Phase 1 → Phase 2 Contract

**Input to Phase 2:** `SyncPushResultItem[]`

```typescript
interface SyncPushResultItem {
  client_tx_id: string;           // Idempotency key
  result: 'CREATED' | 'DUPLICATE' | 'FAILED';
  transaction_id?: number;         // Set if CREATED
  error_message?: string;         // Set if FAILED
  items?: {
    item_id: number;
    variant_id: number;
    quantity: number;
    unit_price: number;
  }[];
}
```

### What Phase 1 Guarantees

Before passing to Phase 2, Phase 1 ensures:

| Guarantee | Description |
|-----------|-------------|
| **Durability** | All Phase 1 writes are committed to database |
| **Idempotency** | Duplicate `client_tx_id` returns immediately with existing `transaction_id` |
| **Validation** | `company_id` matches authenticated company |
| **Referential Integrity** | Foreign keys (item_id, variant_id) exist or are null |
| **Stock Deducted** | Variant stock already reduced for CREATED transactions |

### What Phase 2 Must Handle

| Scenario | Phase 2 Responsibility |
|----------|------------------------|
| `result: 'CREATED'` | Execute business logic (COGS, stock, tables, reservations, posting) |
| `result: 'DUPLICATE'` | Skip business logic, return success |
| `result: 'FAILED'` | Log error, do NOT retry (Phase 1 already failed) |

---

## Error Handling

### Phase 1 Errors

| Error | Behavior | Phase 2 Called? |
|-------|----------|-----------------|
| `company_id` mismatch | Return `COMPANY_MISMATCH` error | No |
| Idempotency duplicate | Return `DUPLICATE` result | No |
| Database write failure | Throw, trigger `failEvent` | No |
| Missing required field | Return validation error | No |

### Phase 2 Errors

| Error | Behavior | Recovery |
|-------|----------|----------|
| `postCOGS()` fails | Log error, mark transaction as `COGS_FAILED` | Manual intervention |
| `deductStock()` fails | Log error, mark transaction as `STOCK_FAILED` | Manual intervention |
| `releaseTable()` fails | Log warning, continue | Logged, non-blocking |
| `updateReservation()` fails | Log warning, continue | Logged, non-blocking |
| `invokePostingHook()` fails | Log error, mark transaction as `POSTING_FAILED` | Retry via queue |

### Critical Rule

> **Phase 2 MUST NOT throw**. All Phase 2 errors must be caught, logged, and returned as part of the response. The transaction is already persisted — Phase 2 failures affect business logic, not data integrity.

---

## Validation Checklist

### Before Phase 1 → Phase 2 Handoff

- [ ] All `SyncPushResultItem.result` values are set (CREATED/DUPLICATE/FAILED)
- [ ] All CREATED items have `transaction_id` populated
- [ ] Audit `completeEvent` called with correct item count
- [ ] Idempotency check completed for each transaction

### Before Phase 2 Iteration

- [ ] Phase 1 results array is not empty
- [ ] `correlationId` is passed from original request
- [ ] Tax context is loaded from API layer

### During Phase 2 Iteration

- [ ] Each result is processed in order
- [ ] DUPLICATE results are skipped
- [ ] FAILED results are logged but don't stop iteration
- [ ] Non-blocking failures (table release, reservation) don't affect other results

---

## Feature Flag: PUSH_SYNC_MODE

The two-phase architecture is controlled by the `PUSH_SYNC_MODE` environment variable:

| Mode | Behavior |
|------|----------|
| `shadow` | Run two-phase but don't return Phase 2 results; log for comparison |
| `10` | 10% of companies use two-phase, 90% use legacy |
| `50` | 50% split |
| `100` | All companies use two-phase |

### Migration Path

1. **Shadow mode** (default during rollout): Log metrics, compare outputs
2. **Canary** (10%): Monitor error rates, performance
3. **Majority** (50%): Full production traffic
4. **Complete** (100%): Remove legacy path

---

## Related Documents

- [Sync Protocol Checklist](../process/sync-protocol-checklist.md)
- [Story 17.5: Move Push Logic to pos-sync](../../_bmad-output/implementation-artifacts/stories/epic-17/story-17.5.md)
- [Story 17.6: Refactor API Routes as Thin Adapters](../../_bmad-output/implementation-artifacts/stories/epic-17/story-17.6.md)

---

*Document: Two-Phase Sync Architecture State Diagram & Handoff Contract*  
*E17-A2, E17-A3 Action Items*
