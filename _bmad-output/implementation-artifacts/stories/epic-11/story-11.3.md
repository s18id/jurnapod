# Story 11.3: Sync Idempotency and Retry Resilience Hardening

Status: backlog

## Story

As a platform operator,
I want reconnect sync to be resilient to retries/timeouts/replays,
So that duplicate transaction creation risk is minimized at scale.

## Acceptance Criteria

### AC 1: Exactly-Once Processing

**Given** retries, timeouts, replayed payloads, and out-of-order acknowledgments
**When** sync processes records keyed by `client_tx_id`
**Then** each logical transaction is exactly-once effective server-side under idempotent semantics
**And** duplicate submissions return deterministic idempotent responses without extra writes

- [ ] Task 1: Audit current idempotency implementation
- [ ] Task 2: Add unique constraint on (company_id, outlet_id, client_tx_id)
- [ ] Task 3: Implement idempotency check before processing
- [ ] Task 4: Return cached response for duplicate requests
- [ ] Task 5: Test duplicate submit scenarios (10x retry)
- [ ] Task 6: Verify no duplicate business effects

### AC 2: Retry Classification

**Given** partial failures in sync batches
**When** retry logic runs
**Then** retryable vs non-retryable errors are classified consistently
**And** successful records are not reprocessed in ways that create duplicate business effects

- [ ] Task 1: Define error classification taxonomy
- [ ] Task 2: Implement error classification in sync handler
- [ ] Task 3: Only retry transient errors (network, timeout)
- [ ] Task 4: Do not retry business logic errors
- [ ] Task 5: Track retry counts per error class
- [ ] Task 6: Document error handling behavior

### AC 3: Sync Throughput and Stability

**Given** sync throughput and latency are measured
**When** normal online conditions apply
**Then** end-to-end sync completion meets SLO target (< 30s for standard backlog size)
**And** queue drain behavior remains stable under sustained reconnect bursts

- [ ] Task 1: Define standard backlog size for SLO
- [ ] Task 2: Measure sync completion latency
- [ ] Task 3: Stress test with reconnect bursts
- [ ] Task 4: Optimize batch processing if needed
- [ ] Task 5: Validate < 30s under normal conditions
- [ ] Task 6: Document queue drain behavior

### AC 4: Observability for Anomalies

**Given** observability is enabled
**When** anomalies occur
**Then** metrics/logs expose duplicate-attempt counts, dedupe-hit rate, retry counts, and stale-queue age
**And** alerts fire on unusual dedupe spikes, stuck queues, or repeated replay storms

- [ ] Task 1: Add duplicate attempt counter
- [ ] Task 2: Add dedupe hit rate metric
- [ ] Task 3: Track retry count per record
- [ ] Task 4: Measure stale-queue age
- [ ] Task 5: Configure alerts for anomalies
- [ ] Task 6: Create operational dashboards

## Dev Notes

### Idempotency Implementation

```typescript
// Sync handler pseudo-code
async function processSyncRecord(record: SyncRecord) {
  // Check if already processed
  const existing = await findByClientTxId(record.companyId, record.outletId, record.clientTxId);
  if (existing) {
    // Return cached result - exactly-once semantics
    return { status: 'already_processed', result: existing.result };
  }
  
  // Process new record
  const result = await executeTransaction(record);
  
  // Store with idempotency key
  await storeProcessedRecord(record.companyId, record.outletId, record.clientTxId, result);
  
  return { status: 'processed', result };
}
```

### Error Classification

| Error Type | Retry? | Example |
|------------|--------|---------|
| Transient | Yes | Network timeout, DB connection |
| Business Logic | No | Insufficient stock, Invalid data |
| Idempotency | No | Already processed |
| System | Escalate | DB down, Disk full |

### Dependencies

- Database (unique constraint support)
- Redis (optional: dedupe cache)
- OpenTelemetry (metrics)
- AlertManager (alerts)

### Test Approach

1. **Idempotency Tests:** Submit same record 10 times, verify 1 result
2. **Retry Tests:** Simulate failures, verify correct classification
3. **Load Tests:** Burst reconnection, verify stability
4. **Observability Tests:** Verify all metrics emitted correctly

### References

- Epic: `_bmad-output/planning-artifacts/epics-split/epic-11-operational-trust-and-scale-readiness.md`
- client_tx_id: Epic 2, 7 implementations
- SLO: Story 11.1 (sync completion < 30s)

### Related Stories

- Story 11.1: Reliability Baseline and SLO Instrumentation
- Story 11.2: POS Payment and Offline Performance Hardening
- Story 11.4: Posting Correctness and Reconciliation Guardrails

---

## Dev Agent Record

*To be completed when story is implemented.*
