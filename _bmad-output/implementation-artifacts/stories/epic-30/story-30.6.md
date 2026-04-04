# Story 30.6: Fix Metric Contracts and Alert Semantics

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-30.6 |
| Title | Fix metric contracts and alert semantics |
| Status | done |
| Type | Bug Fix |
| Sprint | 1 of 1 (remediation) |
| Priority | P1 |

---

## Story

As an Operations Engineer,
I want accurate metric names and alert evaluation,
So that alerts fire correctly when SLOs are breached.

---

## Architect Findings

### P1 Issue: Metric Name Mismatch

**Problem:** Alert rules expect `sync_push_latency_ms`, `sync_push_total`, but runtime emits `sync_push_duration_seconds`, `sync_conflicts_total`.

**Affected Files:**
- `config/alerts.yaml` - expects `sync_push_latency_ms`
- `apps/api/src/lib/metrics/sync-metrics.ts` - emits `sync_push_duration_seconds`

### P1 Issue: Alert Rate Logic Broken

**Problem:** `AlertManager.evaluateCondition()` treats `rate_percent`/`rate_minute` as plain `value > threshold`, not actual rate calculation.

**Affected Files:**
- `apps/api/src/lib/alerts/alert-manager.ts` lines 125-130

---

## Acceptance Criteria

1. Metric names unified - choose canonical names and align collectors, alerts, dashboards
2. Alert rate evaluation properly calculates rates over time windows
3. `alert_evaluation_total` metric is emitted
4. Heartbeat alert logic fixed ("fire when no evaluations over window")

---

## Tasks

- [x] Audit all metric names across collectors, configs, constants
- [x] Choose canonical sync metric names (either `_ms` or `_seconds`)
- [x] Update `config/alerts.yaml` to use correct metric names
- [x] Fix `AlertManager.evaluateCondition()` to calculate actual rates
- [x] Add `alert_evaluation_total` emission
- [x] Fix heartbeat logic
- [x] Validate with typecheck and build

---

## Dev Notes

**Canonical Sync Metric Names (choose one):**
- Option A: `sync_push_latency_ms` (histogram in ms)
- Option B: `sync_push_duration_seconds` (histogram in seconds)

**Alert Rate Calculation:**
```typescript
// Correct rate calculation
const rate = (currentValue - previousValue) / (currentTime - previousTime);
// Then compare rate against threshold
```

---

## Completion Notes

- Canonical sync metric contract aligned to `sync_*_latency_ms` + `sync_*_total` + `sync_conflicts_total`.
- Alert evaluation now computes rate-based thresholds using value delta over time windows.
- `alert_evaluation_total` is emitted once per evaluation cycle.
- Heartbeat semantics fixed to alert when evaluation cycles stop over configured window.
- Alert config label corrected to match runtime status values (`error` instead of `failed`).
