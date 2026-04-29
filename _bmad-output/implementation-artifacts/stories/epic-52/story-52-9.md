# Story 52-9: Observability: Idempotency Metrics

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-9 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | Observability: Idempotency Metrics |
| Status | backlog |
| Risk | P2 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 52-6 (contract standardized) |

## Story

Emit structured metrics for sync outcomes so observability can detect duplicate spikes, error rate changes, and latency regressions.

## Context

Without idempotency metrics, there is no way to detect:
- Duplicate rate spikes (could indicate client bug or replay attack)
- Error rate increases (could indicate validation drift or schema mismatch)
- Latency regressions in sync processing

Metrics should be label-scoped per tenant (`company_id`) for observability without cross-tenant aggregation.

## Acceptance Criteria

- [ ] `SyncOutcomeMetrics` recorded per push: `{ client_tx_id, result: OK|DUPLICATE|ERROR, latency_ms, company_id }`
- [ ] Metrics collector in `packages/sync-core` tracks: total count, OK count, DUPLICATE count, ERROR count, p50/p95 latency
- [ ] Duplicate rate alert threshold: configurable, default >5% triggers alert
- [ ] Error rate alert threshold: configurable, default >1% triggers alert
- [ ] Metrics labels include `company_id` (tenant-scoped), `outlet_id`, `result`

## Tasks/Subtasks

- [ ] 9.1 Audit `packages/sync-core/src/` — identify where sync outcome metrics can be emitted
- [ ] 9.2 Define `SyncOutcomeMetrics` interface: `{ company_id, outlet_id, result, latency_ms, timestamp }`
- [ ] 9.3 Implement metrics counter increments: total, OK, DUPLICATE, ERROR
- [ ] 9.4 Implement latency histogram: p50/p95 computation
- [ ] 9.5 Add duplicate rate threshold alert: configurable >5% default
- [ ] 9.6 Add error rate threshold alert: configurable >1% default
- [ ] 9.7 Add unit test: metrics counter increments correctly for OK/DUPLICATE/ERROR
- [ ] 9.8 Add unit test: duplicate rate threshold alert fires when >5%
- [ ] 9.9 Run `npm run test:unit -w @jurnapod/sync-core -- --grep "metrics.*OK|metrics.*DUPLICATE|duplicate.*rate" --run`

## Dev Notes

- Metrics labels must include `company_id` — tenant-scoped observability per project invariants
- Duplicate rate = DUPLICATE count / total count over a time window
- Error rate = ERROR count / total count over a time window
- p50/p95 latency: can use simple fixed-window histogram or recognized percentile library
- Alert thresholds should be configurable via environment/config, not hardcoded

## Validation Commands

```bash
npm run test:unit -w @jurnapod/sync-core -- --grep "metrics.*OK|metrics.*DUPLICATE|duplicate.*rate" --run
rg "duplicateRate|errorRate" packages/sync-core/src/ --type ts
```

## File List

```
packages/sync-core/src/metrics/
packages/sync-core/src/services/
```

## Change Log

- (none yet)

## Dev Agent Record

- (none yet)