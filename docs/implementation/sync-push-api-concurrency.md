# Sync Push API Concurrency Enhancement

## Overview
Process multiple POS transactions concurrently within a single `/api/sync/push` request to reduce end-to-end latency when many pending transactions exist.

## Current Behavior
- Sequential `for ... of` loop processing on a single DB connection
- Each transaction: `BEGIN -> insert header/items/payments/taxes -> posting hook -> COMMIT`
- One slow transaction (or posting) delays all others in same request
- Latency scales linearly with transaction count

## Problem
- High latency when uploading many pending transactions
- Poor user experience on unstable networks due to sequential blocking
- Underutilized server DB connection capacity

## Solution: Bounded Parallel Processing

### Strategy
Process `transactions` with concurrency (e.g., 3-5), each using its **own DB connection + transaction**.

### Key Invariants to Preserve
1. **Idempotency**: unique `client_tx_id` handling unchanged
2. **Atomicity**: each transaction's writes stay in one DB transaction
3. **Output order**: results maintain stable order by input index
4. **Retry mapping**: retryable DB lock/error mapping unchanged
5. **Per-transaction outcome**: `OK | DUPLICATE | ERROR` per `client_tx_id`

### Processing Order
1. `transactions`: processed in parallel (bounded)
2. `order_updates`: processed sequentially (table/reservation conflict risk)

## Implementation Plan

### Phase 1: Bounded Parallel In-Handler (Recommended Now)

**Files to modify:**
- `apps/api/app/api/sync/push/route.ts`

**Changes:**
1. Acquire multiple DB connections from pool (up to `maxConcurrency`)
2. Partition transactions into chunks of size `maxConcurrency`
3. Process each chunk with `Promise.all`, each tx on its own connection
4. Aggregate results maintaining original input order
5. Keep `order_updates` sequential (no changes needed)

**Configuration:**
- Default concurrency: 3
- Max concurrency: 5 (tune based on DB pool size)

**Example flow:**
```
Input: [txA, txB, txC, txD, txE]
Concurrency: 3

Chunk 1: [txA, txB, txC] -> parallel on conn1, conn2, conn3
Chunk 2: [txD, txE]      -> parallel on conn1, conn2
Output: [resultA, resultB, resultC, resultD, resultE]
```

### Phase 2: Async Posting Worker (Optional Future)

Only if Phase 1 is insufficient:
- Accept transaction immediately (write header/items)
- Queue posting/journal work to background worker
- Add `posting_status` state machine (`PENDING | POSTING | POSTED | FAILED`)
- Implement dead-letter handling for failed postings
- Add admin/operator UI for posting failures

**Trade-offs:**
- Changes semantics: transaction accepted before posting completes
- Requires new state machine and retry logic
- Higher complexity, do only after measuring Phase 1

## Safety Checks

### DB Connection Pool Sizing
- Ensure pool size >= max concurrency + other concurrent requests
- Monitor `dbPool.activeConnections()` and `dbPool.getConnection()`

### Transaction Isolation
- Each transaction must use its own connection
- No shared state between parallel executions

### Idempotency
- `client_tx_id` unique constraint still enforced
- Duplicate detection still works per transaction

### Error Handling
- Individual transaction failures don't affect others
- All errors map to `ERROR` result for that `client_tx_id`

## Testing Requirements

### Integration Tests
1. **Parallel success**: 5 transactions succeed in parallel, all return `OK`
2. **Mixed outcomes**: some succeed, some fail, some duplicate
3. **Order preservation**: results match input order
4. **Concurrent duplicate**: duplicate `client_tx_id` returns `DUPLICATE`
5. **Connection pool**: no exhaustion under load

### Performance Targets
- Latency for N transactions should be ~N/concurrency instead of N*single_tx_latency

## Rollout

1. Start with concurrency = 2 in production
2. Monitor:
   - DB connection pool utilization
   - Error rate per transaction
   - End-to-end sync latency
3. Increase to 3-5 if stable

## Configuration
- Environment: `JP_SYNC_PUSH_CONCURRENCY` (optional, default 3)
- Or runtime config through orchestrator (future)
