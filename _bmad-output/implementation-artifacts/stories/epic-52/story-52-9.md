# Story 52-9: Observability: Idempotency Metrics

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-9 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | Observability: Idempotency Metrics |
| Status | ✅ DONE |
| Completed | 2026-05-02 |
| Risk | P2 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 52-6 (contract standardized), Story 52-7 (duplicate-vs-error semantics) |

## Story

Emit structured metrics for sync outcomes so observability can detect duplicate spikes,
error rate changes, and latency regressions — by extending existing collectors, not
building a new parallel system.

## Context

Without idempotency metrics, there is no way to detect:
- Duplicate rate spikes (could indicate client bug or replay attack)
- Error rate increases (could indicate validation drift or schema mismatch)
- Latency regressions in sync processing

Metrics must be label-scoped per tenant (`company_id`, `outlet_id`) for observability
without cross-tenant aggregation, following the pattern established by `OutboxMetricsCollector`
(Story 30.7 tenant isolation).

### Existing Infrastructure (Must Reuse)

| Component | Location | Purpose |
|-----------|----------|---------|
| `SyncIdempotencyMetricsCollector` | `packages/sync-core/src/idempotency/metrics-collector.ts` | In-memory operational collector. Has `recordResults(SyncOperationResult[])`. Tracks dedupe rate, retry rate, queue age, batch latency. **Gap:** No per-tenant state, no OK tracking, no p50/p95, thresholds don't match AC. |
| `SyncMetricsCollector` | `apps/api/src/lib/metrics/sync-metrics.ts` | Prometheus-backed. Wired to `/metrics`. **Gap:** Lacks `company_id` label (tenant isolation gap from Story 30.7). Only tracks `outlet_id`. No per-result-type counters. |
| `OutboxMetricsCollector` | `apps/api/src/lib/metrics/outbox-metrics.ts` | Correct pattern to follow: `{company_id, outlet_id}` labels on all metrics. |
| `AlertEvaluationService` | `packages/telemetry/src/runtime/alert-evaluation.ts` | Canonical alert evaluation. Rate rules in YAML config. Use this, not hardcoded thresholds. |

### Metric Label Cardinality Rules

Per telemetry policy (`packages/telemetry/src/metrics.ts`):
- **SAFE (low-cardinality):** `company_id`, `outlet_id`, `flow_name`, `status`, `result`, `error_class`
- **FORBIDDEN (high-cardinality):** `user_id`, `transaction_id`, `client_tx_id`, `item_id`, `customer_id`

**`client_tx_id` MUST NOT appear as a Prometheus metric label.** It is acceptable as
input data for structured logging alongside the metric recording call.

## Acceptance Criteria

- [x] **AC-1:** Per-push outcome recording function accepts:
      `{ company_id, outlet_id, result: OK|DUPLICATE|ERROR, latency_ms, client_tx_id? }`
      where `client_tx_id` is used for structured logging only, NEVER as a metric label.
      Metric labels are limited to `{company_id, outlet_id, result}`.

- [x] **AC-2:** `SyncMetricsCollector` in `apps/api/src/lib/metrics/sync-metrics.ts` extended with:
      - `sync_push_results_total{company_id, outlet_id, result}` Counter
      - `sync_push_result_latency_ms{company_id, outlet_id, result}` Histogram
      - All existing metrics (`sync_push_total`, `sync_push_latency_ms`, `sync_pull_total`,
        `sync_pull_latency_ms`, `sync_conflicts_total`) gain `company_id` label
        (tenant isolation fix — currently labeled by `outlet_id` only)

- [x] **AC-3:** `SyncIdempotencyMetricsCollector` in `packages/sync-core` extended with:
      - Per-tenant aggregation (`Map<company_id, TenantMetrics>`)
      - OK result tracking (currently only tracks DUPLICATE and ERROR)
      - Latency percentile arrays for p50/p95 computation
      - Updated `getAlertConditions()` thresholds: dedupe rate >5%, error rate >1%

- [x] **AC-4:** Duplicate rate alert (>5%) configured in telemetry alert rules (YAML),
      evaluated by `AlertEvaluationService` against `sync_push_results_total{result="DUPLICATE"}`

- [x] **AC-5:** Error rate alert (>1%) configured in telemetry alert rules (YAML),
      evaluated by `AlertEvaluationService` against `sync_push_results_total{result="ERROR"}`

## Tasks/Subtasks

### Phase 1: API Metrics Layer (prom-client)

- [x] 9.1 Add `company_id` label to all existing metrics in `SyncMetricsCollector`
      (`sync_push_total`, `sync_push_latency_ms`, `sync_pull_total`,
      `sync_pull_latency_ms`, `sync_conflicts_total`)
- [x] 9.2 Add `sync_push_results_total{company_id, outlet_id, result}` Counter
      to `SyncMetricsCollector`
- [x] 9.3 Add `sync_push_result_latency_ms{company_id, outlet_id, result}` Histogram
      to `SyncMetricsCollector`

### Phase 2: Sync-Core Operational Collector

- [x] 9.4 Extend `SyncIdempotencyMetricsCollector.recordResults()` to:
      - Accept and count OK results (currently only DUPLICATE and ERROR)
      - Track per-company state via `Map<number, TenantMetrics>`
      - Maintain latency arrays per result type for percentile computation
- [x] 9.5 Implement `getLatencyPercentiles(results, p50 | p95)` in the collector
      using sorted-array approach (no external dependency)

### Phase 3: Route Wiring

- [x] 9.6 In `apps/api/src/routes/sync/push.ts`, after `handlePushSync()` returns:
      - For each `SyncPushResultItem`, call `syncMetrics.recordPushResult()`
        and `syncIdempotencyMetricsCollector.recordResults()`
      - Structured log entry per push with aggregate stats (total, duplicates, errors)

### Phase 4: Alert Rules (Telemetry Package)

- [x] 9.7 Add alert rules in `packages/telemetry/src/alert-config.ts` (or `config/alerts.yaml`):
      - `sync_duplicate_rate` — rate_percent >5%, metric `sync_push_results_total`,
        label filter `{result="DUPLICATE"}`, severity warning
      - `sync_error_rate` — rate_percent >1%, metric `sync_push_results_total`,
        label filter `{result="ERROR"}`, severity warning

### Phase 5: Testing

- [x] 9.8 Unit test: `SyncMetricsCollector` new counters record correctly for
      OK/DUPLICATE/ERROR outcomes
- [x] 9.9 Unit test: `SyncIdempotencyMetricsCollector` per-tenant aggregation
      returns correct per-company counts
- [x] 9.10 Unit test: `getLatencyPercentiles` with known values — verify p50/p95
- [ ] 9.11 Integration test: `/metrics` endpoint returns `sync_push_results_total`
      and `sync_push_result_latency_ms` after a sync push (deferred)
- [x] 9.12 Run full test suite:
```bash
npm run build -w @jurnapod/sync-core
npm run test:unit -w @jurnapod/sync-core -- --run
npm run build -w @jurnapod/api
npm run test -w @jurnapod/api -- --run
```

## Dev Notes

- **Never add `client_tx_id` as a Prometheus label** — see cardinality rules above.
  It may appear in structured log entries for debugging.
- **`SyncIdempotencyMetricsCollector` is in-memory only** — it does not survive
  restarts. That is acceptable: it provides operational health checks within the
  sync module lifecycle. The prom-client collectors in API provide durable metrics.
- **Company ID as Prometheus label:** Convert `company_id` (number) to string
  explicitly at call sites, matching the `OutboxMetricsCollector` pattern:
  `{ company_id: String(companyId), outlet_id: String(outletId) }`
- **Percentile calculation:** Use sorted-array approach (collect latencies, sort,
  pick index at percentile rank). No external percentile library needed.
  Acceptable for moderate per-push volumes (<1000 results per push).
- **Alert rules in telemetry:** The `AlertEvaluationService` already supports
  `rate_percent` threshold type with label filtering. Add rules to
  `DEFAULT_ALERT_CONFIG` in `alert-config.ts`.
- **Tenant isolation fix:** Adding `company_id` to `SyncMetricsCollector` changes
  existing metric label sets. This is additive — existing `outlet_id`-only queries
  still work but will be deprecated. All new queries should use `company_id`.
- **No breaking changes to `SyncMetricsCollector` public API:** Existing methods
  (`recordPushOperation`, `recordPushDuration`, etc.) retain their signatures.
  New methods are additive: `recordPushResult(companyId, outletId, result, latencyMs)`.

## Files Modified

```
# prom-client metrics (API layer)
apps/api/src/lib/metrics/sync-metrics.ts        # company_id label, new counters/histograms
apps/api/src/routes/sync/push.ts                 # recordPushMetrics() helper, normalizeSyncResult()

# operational collector (sync-core)
packages/sync-core/src/idempotency/metrics-collector.ts  # per-tenant, OK tracking, percentiles
packages/sync-core/src/index.ts                           # re-export (unchanged)

# alert rules (telemetry)
packages/telemetry/src/alert-config.ts                     # duplicate/error rate rules

# tests
packages/sync-core/__test__/unit/metrics-collector.test.ts # unit tests for collector (47 tests)
apps/api/__test__/unit/metrics/sync-metrics.test.ts        # unit tests for collector (16 tests)
```

## Known Limitations

1. **Task 9.11 deferred (integration test for `/metrics` endpoint):** The integration test
   `apps/api/__test__/integration/sync/push-metrics.test.ts` was not created. Unit test
   coverage of `SyncMetricsCollector.recordPushResult()` confirms label-scoped counters
   and histograms are registered correctly. Full integration test can be added in a
   follow-up story if needed.

## Validation Commands

```bash
# Build sync-core first (package dependency order)
npm run build -w @jurnapod/sync-core

# Run unit tests for sync-core
npm run test:unit -w @jurnapod/sync-core -- --run

# Build API
npm run build -w @jurnapod/api

# Run unit tests for API
npm run test:unit -w @jurnapod/api -- --run

# Verify new metrics appear in /metrics output
# (manual or integration test)
```

## Change Log

- 2026-05-02: Revised from original. Key changes:
  - AC-1: removed `client_tx_id` from metric labels (cardinality violation)
  - Restructured to extend existing collectors (not build new)
  - Added tenant isolation fix for `SyncMetricsCollector` (add `company_id` label)
  - Alert thresholds moved to telemetry `AlertEvaluationService` (not hardcoded)
  - Added per-tenant tracking to `SyncIdempotencyMetricsCollector`

## Dev Agent Record

- Phase 1: Extended `SyncMetricsCollector` — added `company_id` to all existing metric labels (tenant isolation fix), added `sync_push_results_total{company_id,outlet_id,result}` Counter and `sync_push_result_latency_ms{company_id,outlet_id,result}` Histogram, added `recordPushResult()` method with CONFLICT→ERROR runtime mapping, negative latency guard (`Math.max(0, latencyMs)`)
- Phase 2: Extended `SyncIdempotencyMetricsCollector` — per-tenant tracking via `Map<company_id, TenantMetrics>`, OK result tracking, nearest-rank `getLatencyPercentiles()` (capped 1000 entries), deep-copy snapshot in `getTenantMetrics()`, empty-array early-return
- Phase 3: Wired recording in `apps/api/src/routes/sync/push.ts` — extracted `recordPushMetrics()` DRY helper, both handlers call `syncMetrics.recordPushResult()` + `syncIdempotencyMetricsCollector.recordResults()` via helper; catch-block guarded with `if (outlet_id > 0)`; `normalizeSyncResult()` replaces all unsafe `as` casts
- Phase 4: Added alert rules to telemetry package — `sync_duplicate_rate` (>5%/min) and `sync_error_rate` (>1%/min) in `AlertEvaluationService`
- Phase 5: Unit tests — sync-core 71 passed (`packages/sync-core/__test__/unit/metrics-collector.test.ts`); API 232 passed (`apps/api/__test__/unit/metrics/sync-metrics.test.ts`); Task 9.11 (integration test) deferred
- Cleanup: removed YAGNI surface (`recordSingleResult()`, `getTrackedTenants()`, `clearTenantMetrics()`, internal-only exports); removed `console.debug` production noise; simplified percentile to nearest-rank (8 lines vs 25)
- Status: ✅ DONE — story owner sign-off received 2026-05-02

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-02 | 1.0 | Initial implementation — Prometheus metrics, per-tenant idempotency tracking, alert rules |
| 2026-05-02 | 1.1 | ✅ DONE — AC-1 through AC-5 complete; all tasks done except 9.11 (deferred); sync-core 71 tests, API 232 tests pass |
