# Story 30.4: Alerting Infrastructure

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-30.4 |
| Title | Alerting infrastructure |
| Status | review |
| Type | Infrastructure |
| Sprint | 1 of 1 |
| Dependencies | 30.2, 30.3 |

---

## Story

As an Operations Engineer,
I want to receive alerts when SLOs are breached,
So that I can respond to production issues before they become incidents.

---

## Acceptance Criteria

1. Alert rules defined in configuration (not hardcoded)
2. Alerts fire for: sync latency breach, sync failure rate, outbox lag threshold
3. Alerts fire for: posting failure rate, GL imbalance detected
4. Slack integration for alert delivery (webhook)
5. Alert deduplication to prevent spam

---

## Technical Notes

### Alert Rules

```yaml
# config/alerts.yaml
alerts:
  - name: sync_latency_breach
    metric: sync_push_latency_ms
    threshold: p95 > 500ms
    severity: warning
    window: 5m
    
  - name: sync_failure_rate
    metric: sync_push_total{status=failed}
    threshold: rate > 0.5%
    severity: critical
    window: 5m
    
  - name: outbox_lag_critical
    metric: outbox_lag_items
    threshold: > 100
    severity: critical
    window: 1m
    
  - name: journal_failure_rate
    metric: journal_post_failure_total
    threshold: rate > 0.1%
    severity: critical
    window: 5m
    
  - name: gl_imbalance_detected
    metric: gl_imbalance_detected_total
    threshold: > 0
    severity: critical
    window: 1m
```

### Alert Payload

```typescript
interface Alert {
  name: string;
  severity: 'warning' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  window: string;
  timestamp: number;
  labels: Record<string, string>;
}
```

---

## Tasks

- [x] Create alert rule configuration schema
- [x] Implement alert evaluation engine
- [x] Add Slack webhook integration
- [x] Implement alert deduplication
- [x] Create dead man's switch (heartbeat) alert
- [x] Validate with typecheck and build

---

## Dev Notes

- Keep alerting simple initially - evaluate on metrics flush interval
- Use Slack webhook for delivery; PagerDuty as future option
- Deduplication key should be alert name + labels hash

---

## Dev Agent Record

### Implementation Plan

1. Created `config/alerts.yaml` with YAML-based alert rule configuration following the story spec
2. Created `packages/telemetry/src/alert-config.ts` for loading and validating alert configuration from YAML
3. Updated `apps/api/src/lib/alerts/alert-rules.ts` to use YAML config with lazy initialization
4. Enhanced `apps/api/src/lib/alerts/alert-manager.ts` with:
   - Metric value retrieval from prom-client registry
   - Rate-based threshold evaluation
   - Deduplication via cooldown tracking
5. Created `apps/api/src/lib/alerts/alert-evaluation.ts` for periodic alert evaluation
6. Integrated alert evaluation service into server lifecycle

### Completion Notes

- ✅ Alert rules loaded from YAML configuration (config/alerts.yaml)
- ✅ Alerts configured for: sync_latency_breach, sync_failure_rate, outbox_lag_critical, journal_failure_rate, gl_imbalance_detected
- ✅ Slack webhook integration functional (ALERT_WEBHOOK_URL env var)
- ✅ Alert deduplication via cooldown period (default 5 minutes)
- ✅ Dead man's switch heartbeat alert included (alert_evaluation_total metric)
- ✅ TypeScript typecheck passes
- ✅ Build passes
- ✅ 14 new unit tests added and passing

### Files Created/Modified

**Created:**
- `config/alerts.yaml` - Alert rules YAML configuration
- `packages/telemetry/src/alert-config.ts` - Alert configuration loader and schema
- `packages/telemetry/src/__tests__/alert-config.test.ts` - Alert config tests
- `apps/api/src/lib/alerts/alert-evaluation.ts` - Alert evaluation service
- `apps/api/src/lib/alerts/alert-manager.test.ts` - Alert manager tests

**Modified:**
- `packages/telemetry/src/index.ts` - Added alert-config export
- `packages/telemetry/package.json` - Added alert-config export path
- `apps/api/src/lib/alerts/alert-rules.ts` - Updated to use YAML config
- `apps/api/src/lib/alerts/alert-manager.ts` - Enhanced with metric evaluation
- `apps/api/src/server.ts` - Integrated alert evaluation service

### Change Log

- 2026-04-04: Implemented alerting infrastructure following story spec

---

## File List

| File | Status | Notes |
|------|--------|-------|
| `config/alerts.yaml` | created | Alert rules YAML configuration |
| `packages/telemetry/src/alert-config.ts` | created | Alert configuration loader and schema |
| `packages/telemetry/src/__tests__/alert-config.test.ts` | created | Unit tests for alert config |
| `packages/telemetry/src/index.ts` | modified | Added alert-config export |
| `packages/telemetry/package.json` | modified | Added alert-config export path |
| `apps/api/src/lib/alerts/alert-rules.ts` | modified | Updated to use YAML config |
| `apps/api/src/lib/alerts/alert-manager.ts` | modified | Enhanced with metric evaluation |
| `apps/api/src/lib/alerts/alert-evaluation.ts` | created | Periodic alert evaluation service |
| `apps/api/src/lib/alerts/alert-manager.test.ts` | created | Unit tests for alert manager |
| `apps/api/src/server.ts` | modified | Integrated alert evaluation service |
