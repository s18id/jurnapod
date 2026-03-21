# Story 11.2: POS Payment and Offline Performance Hardening

Status: backlog

## Story

As a store operator,
I want checkout and offline operation to remain fast and stable under load,
So that tills keep moving during peak hours and network instability.

## Acceptance Criteria

### AC 1: Payment Performance Under Load

**Given** peak-like workload and intermittent connectivity test conditions
**When** cashiers complete checkout flows
**Then** `payment_capture` meets p95 < 1s and p99 within agreed tolerance under target concurrency
**And** failure rate remains within defined SLO error budget

- [ ] Task 1: Profile payment_capture under load (k6/locust)
- [ ] Task 2: Identify bottlenecks in payment flow
- [ ] Task 3: Optimize database queries and caching
- [ ] Task 4: Add connection pooling for payment service
- [ ] Task 5: Validate p95 < 1s with 50 concurrent users
- [ ] Task 6: Document p99 tolerance threshold

### AC 2: Offline Commit Durability

**Given** network loss occurs mid-transaction
**When** checkout finalization proceeds offline
**Then** local commit succeeds durably with `client_tx_id` and queued outbox record
**And** app restart/crash recovery preserves pending transactions without duplication or loss

- [ ] Task 1: Implement transactional outbox pattern
- [ ] Task 2: Add client_tx_id generation and persistence
- [ ] Task 3: Implement crash recovery with transaction replay
- [ ] Task 4: Verify no duplicate commits on recovery
- [ ] Task 5: Test network interruption mid-commit
- [ ] Task 6: Validate durability under crash scenarios

### AC 3: Backpressure Behavior

**Given** offline queue depth and storage pressure increase
**When** system approaches local limits
**Then** backpressure behavior is graceful (clear operator messaging and safe retry path)
**And** no committed transaction is dropped silently

- [ ] Task 1: Define storage pressure thresholds
- [ ] Task 2: Implement queue depth monitoring
- [ ] Task 3: Add operator warning UI at 70% capacity
- [ ] Task 4: Implement safe rejection (non-committed)
- [ ] Task 5: Verify committed tx never dropped
- [ ] Task 6: Document backpressure behavior

### AC 4: Observable Metrics

**Given** production and staging telemetry
**When** checkout/offline flows execute
**Then** latency histograms, queue depth, commit failures, and recovery attempts are observable by outlet/company
**And** alerts detect sustained degradations before SLO exhaustion

- [ ] Task 1: Add latency histograms for payment_capture
- [ ] Task 2: Emit queue depth metrics per outlet
- [ ] Task 3: Track commit failure rate
- [ ] Task 4: Track recovery attempt rate
- [ ] Task 5: Configure alerts for sustained degradation
- [ ] Task 6: Create operational dashboards

## Dev Notes

### Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| payment_capture p95 | < 1s | Histogram |
| payment_capture p99 | < 2s | Histogram |
| offline commit latency | < 500ms | Histogram |
| recovery time | < 5s | Timer |
| queue depth alert | > 1000 | Gauge |
| error rate | < 0.1% | Counter |

### Offline Architecture

```
POS Device
  |--[online]--> Payment Service --> DB (sync commit)
  |
  |--[offline]--> Local SQLite --> Outbox Queue --> [reconnect] --> Sync Service
```

**Key Invariants:**
- Every committed transaction has unique client_tx_id
- Outbox record created atomically with transaction
- Idempotent replay via client_tx_id deduplication

### Dependencies

- SQLite (local persistence)
- Service Workers (offline detection)
- IndexedDB (queue storage)
- OpenTelemetry (telemetry)

### Test Approach

1. **Load Tests:** k6 with 50 concurrent POS terminals
2. **Offline Tests:** Network simulation (Charles/Toxiproxy)
3. **Crash Tests:** Kill app mid-transaction, verify recovery
4. **Backpressure Tests:** Fill queue, verify graceful rejection

### References

- Epic: `_bmad-output/planning-artifacts/epics-split/epic-11-operational-trust-and-scale-readiness.md`
- SLO: Story 11.1 (baseline definitions)
- client_tx_id: Epic 2/7 implementations

### Related Stories

- Story 11.1: Reliability Baseline and SLO Instrumentation
- Story 11.3: Sync Idempotency and Retry Resilience Hardening
- Story 11.4: Posting Correctness and Reconciliation Guardrails

---

## Dev Agent Record

*To be completed when story is implemented.*
