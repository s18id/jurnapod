# Story 30.1: Define Sync SLOs and Metrics Schema

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-30.1 |
| Title | Define Sync SLOs and metrics schema |
| Status | review |
| Type | Infrastructure |
| Sprint | 1 of 1 |

---

## Story

As an Operations Engineer,
I want to define clear Sync SLOs and a metrics schema,
So that we can measure and alert on system health objectively.

---

## Acceptance Criteria

1. Sync SLO thresholds defined in configuration (not hardcoded)
2. Metrics schema documented with naming conventions
3. Metrics endpoint (`/metrics`) returns Prometheus-compatible format
4. All metrics have appropriate labels for filtering

---

## Technical Notes

### SLO Targets

| Metric | SLO Target |
|--------|------------|
| Sync Push Latency p50 | < 200ms |
| Sync Push Latency p95 | < 500ms |
| Sync Push Latency p99 | < 2s |
| Sync Success Rate | > 99.5% |
| Duplicate Suppression Rate | < 0.1% |

### Metrics Schema

```typescript
// Sync metrics
sync_push_latency_ms{outlet_id, status}
sync_push_total{outlet_id, status}
sync_pull_latency_ms{outlet_id, status}
sync_pull_total{outlet_id, status}
client_tx_id_duplicates_total{outlet_id}

// Outbox metrics
outbox_lag_items{outlet_id}
outbox_retry_depth{outlet_id}
outbox_failure_total{outlet_id, reason}

// Journal metrics
journal_post_success_total{domain}
journal_post_failure_total{domain, reason}
gl_imbalance_detected_total{}
journal_missing_alert_total{}
```

### Configuration Schema

```yaml
# config/slos.yaml
sync:
  latency:
    p50_threshold_ms: 200
    p95_threshold_ms: 500
    p99_threshold_ms: 2000
  success_rate_threshold: 0.995
  duplicate_rate_threshold: 0.001

outbox:
  lag_warning_threshold: 50
  lag_critical_threshold: 100
  retry_depth_warning: 2
  retry_depth_critical: 5
  failure_rate_threshold: 0.005

journal:
  posting_success_rate_threshold: 0.999
  gl_balance_check_enabled: true
```

---

## Tasks

- [x] Create `config/slos.yaml` with SLO thresholds
- [x] Create `packages/telemetry/src/metrics.ts` with metric registry
- [x] Create `/metrics` endpoint in API
- [x] Document metrics schema in README
- [x] Add typecheck validation

---

## Dev Notes

- Use Prometheus client library for metrics format
- Metrics should be low-cardinality to avoid performance issues
- Consider using atomic counters for high-frequency updates

---

## Dev Agent Record

### Implementation Plan

1. **Created `config/slos.yaml`** - YAML configuration file with SLO thresholds for sync, outbox, and journal operations

2. **Enhanced `packages/telemetry/src/metrics.ts`** - Added:
   - Sync metric name constants (`SYNC_METRIC_NAMES`)
   - Outbox metric name constants (`OUTBOX_METRIC_NAMES`)
   - Journal metric name constants (`JOURNAL_METRIC_NAMES`)
   - Label types for sync, outbox, and journal metrics
   - Zod schemas for SLO configuration validation
   - `DEFAULT_SLO_CONFIG` for fallback when YAML not available

3. **Created `packages/telemetry/src/slo-config.ts`** - New module for loading and validating SLO configuration from YAML:
   - `loadSLOConfig()` - Loads config from YAML with fallback to defaults
   - `validateSLOYamlConfig()` - Validates YAML config against schema
   - Helper functions for accessing specific thresholds

4. **Updated `packages/telemetry/README.md`** - Documented:
   - Complete metrics schema with tables
   - SLO configuration YAML format
   - Usage examples for `loadSLOConfig()` and threshold helpers

5. **Verified `/metrics` endpoint** - Confirmed existing implementation in `apps/api/src/server.ts` uses prom-client and returns Prometheus-compatible format

### Completion Notes

- ✅ All 73 telemetry package tests pass
- ✅ API typecheck passes (`npm run typecheck -w @jurnapod/api`)
- ✅ API build passes (`npm run build -w @jurnapod/api`)
- ✅ Metrics endpoint at `/metrics` already implemented with Prometheus format
- ✅ SLO configuration loaded from YAML with validation
- ✅ Low-cardinality labels enforced (outlet_id, status, domain, reason)
- ✅ No PII in metrics labels

### Files Created/Modified

- `config/slos.yaml` (created)
- `packages/telemetry/src/metrics.ts` (modified)
- `packages/telemetry/src/slo-config.ts` (created)
- `packages/telemetry/src/index.ts` (modified)
- `packages/telemetry/README.md` (modified)

### Change Log

- Date: 2026-04-04
- Implemented Sync SLOs and metrics schema per story requirements
- Added YAML-based SLO configuration with Zod validation
- Documented complete metrics schema in telemetry README
