# Sync Push Concurrency Enhancement

## Overview
Split sequential sync push into concurrent workers for faster POS-to-server upload while preserving safety invariants.

## Problem
- Current: sequential draining (one transaction at a time)
- Impact: slow upload when many pending sales, especially on unstable networks

## Solution
- Add concurrency to `SYNC_POS_TX` job processing
- Keep `SYNC_POS_ORDER_UPDATE` sequential (order state invariants)
- Default concurrency: 3 workers, max: 5

## Changes by Scope

### Scope 1: Concurrent Worker Pool in Outbox Drainer
- File: `apps/pos/src/offline/outbox-drainer.ts`
- Add `send_concurrency` to `DrainOutboxJobsInput`
- Add `processOneJob()` internal function
- Replace `for ... of jobs` with worker pool execution
- Preserve lease/reservation logic per job

### Scope 2: Ordering by Job Type
- `SYNC_POS_TX`: parallel (worker pool)
- `SYNC_POS_ORDER_UPDATE`: sequential (existing behavior)
- Separate job lists by type, process order updates first, then drain TX pool

### Scope 3: Orchestrator Config Wiring
- File: `apps/pos/src/services/sync-orchestrator.ts`
- Add `pushSendConcurrency?: number` config field
- Pass to `drainOutboxJobs()` call
- Default: 3

### Scope 4: Test Coverage
- File: `apps/pos/src/offline/__tests__/outbox-drainer.test.mjs`
- Test: parallel sender respects concurrency limit
- Test: order updates remain sequential
- Test: mixed job counters remain correct

## Safety Invariants Preserved
1. Lease/reservation per job unchanged
2. Idempotency via `client_tx_id` (server-side)
3. Order update state machine stays sequential
4. Retry/backoff unchanged
5. Counters (`sent/failed/stale/skipped`) accurate

## Configuration
- Runtime: `pushSendConcurrency` (default 3, max 5)
- Set via bootstrap config:
  - `WebBootstrapConfig.pushSendConcurrency`
  - `MobileBootstrapConfig.pushSendConcurrency`

## Implementation Details

### Concurrency Behavior
- **TX jobs (`SYNC_POS_TX`)**: processed in parallel chunks of `send_concurrency` size
- **Order update jobs (`SYNC_POS_ORDER_UPDATE`)**: always processed sequentially to preserve order state invariants
- Order updates are processed **first**, then TX jobs in parallel

### Files Changed
- `apps/pos/src/offline/outbox-drainer.ts` - core concurrency logic
- `apps/pos/src/services/sync-orchestrator.ts` - config wiring
- `apps/pos/src/bootstrap/web.tsx` - config passthrough
- `apps/pos/src/bootstrap/mobile.tsx` - config passthrough

## Operational Guidance

### Rollout
1. Start with concurrency = 2 in production
2. Monitor metrics (see below)
3. Increase to 3 if stable

### Metrics to Watch
- **Drain cycle duration**: should decrease with concurrency
- **Failed/stale ratio**: should remain stable (no regression)
- **Duplicate ACK rate**: should remain stable (idempotency preserved)
- **Lease contention**: watch for increased stale counts

### Failure Strategy
If anomalies observed, set `pushSendConcurrency: 1` to revert to sequential mode.
