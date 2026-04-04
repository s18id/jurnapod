# Alert Authoring Guide

> **Scope:** This guide covers how to write, configure, and troubleshoot alert rules in Jurnapod ERP.
> **Audience:** Backend engineers, SREs, and platform engineers adding or modifying alerts.
> **Reference Implementation:** `packages/telemetry/src/runtime/alert-manager.ts`

---

## 1. Alert Rule Structure

Alert rules are defined in `config/alerts.yaml`:

```yaml
alerts:
  - name: sync_push_latency_high
    metric: sync_push_latency_ms
    threshold: 500
    threshold_type: greater_than
    severity: warning
    window: 5m
    description: "Sync push latency p95 exceeds 500ms threshold"
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique alert identifier |
| `metric` | string | Yes | Prometheus metric name to evaluate |
| `threshold` | number | Yes | Threshold value for comparison |
| `threshold_type` | enum | Yes | How to compare: `greater_than`, `less_than`, `rate_percent`, `rate_minute` |
| `severity` | enum | Yes | `warning` or `critical` |
| `window` | duration | Yes | Evaluation window (e.g., `5m`, `1m`) |
| `labels` | map | No | Label filters for multi-label metrics |
| `description` | string | No | Human-readable explanation |
| `status` | enum | **Deprecated** | ❌ Do NOT use `status: failed` — use `status: error` |

---

## 2. Rate Calculation

Rate-based alerts measure the **velocity** of a counter, not its absolute value.

### Formula

```
rate = (current_value - previous_value) / time_delta_seconds
```

- Units: events per second
- Convert to per-minute by multiplying rate × 60
- Convert to percentage by multiplying rate × 60 × 100

### Counter Reset Handling

When a counter resets to a lower value (process restart, etc.), the delta is treated as **zero** to avoid spurious spikes:

```typescript
// From alert-manager.ts line 228-232
const valueDiff = value >= state.previousValue 
  ? (value - state.previousValue) 
  : 0;  // Counter reset → zero delta
rate = valueDiff / timeDiffSeconds;
```

**Example:** Counter drops from 1000 → 0

| Scenario | Delta | Rate | Alert Fires? |
|----------|-------|------|--------------|
| ❌ Naive (wrong) | -1000 | -1000/s → spike | Yes (false positive) |
| ✅ Correct (zero delta) | 0 | 0/s | No |

### Threshold Types for Rate

| `threshold_type` | Measures | Units |
|-----------------|----------|-------|
| `rate_percent` | % change per minute of a single counter | 0.5 = 0.5% per minute growth |
| `rate_minute` | Events per minute | 5 = 5 events/minute |

### Minimum Window Guidance

- **Rate-based alerts**: Minimum **5m** window to smooth out traffic bursts
- **Gauge/threshold alerts**: Minimum **1m** window

---

## 3. Heartbeat Semantics

The heartbeat alert is a **dead-man switch** that fires when the entire alert evaluation loop stops.

### How It Works

1. `evaluateAllAlerts()` calls `recordEvaluationCycle()` at the start of each cycle
2. `recordEvaluationCycle()` updates `AlertManager.evaluationCycleState.lastCycleTime`
3. When evaluating the heartbeat alert, if `(now - lastCycleTime) > window`, the alert fires

### Configuration

```yaml
- name: heartbeat
  metric: alert_evaluation_total  # Not actually used for heartbeat
  threshold: 0
  threshold_type: rate_minute
  severity: warning
  window: 5m
  description: "Heartbeat alert - fires if alerting system stops evaluating"
```

### Registration Requirement

The API layer **must** call `registerEvaluationCounter()` at startup:

```typescript
alertManager.registerEvaluationCounter(evaluationCounter);
```

If not registered, a warning is logged once:
```
[alert] Evaluation counter not registered; heartbeat alerts will not fire.
Call registerEvaluationCounter() at startup.
```

---

## 4. Condition Types

### 4.1 Histogram Percentile (`greater_than`)

Use for latency, duration, or size metrics where you want to alert on a percentile threshold.

```yaml
- name: sync_latency_breach
  metric: sync_push_latency_ms
  threshold: 500
  threshold_type: greater_than
  severity: warning
  window: 5m
```

**Evaluates:** `current_value > threshold`

### 4.2 Rate of Counter Increase (`rate_percent`, `rate_minute`)

Use for counters that track cumulative events (failures, errors, etc.).

```yaml
# Example: 5 sync failures per minute triggers alert
- name: sync_failure_rate
  metric: sync_push_total
  labels:
    status: error
  threshold: 5
  threshold_type: rate_minute
  severity: critical
  window: 5m
```

### 4.3 Gauge Below Minimum (`less_than`)

Use for metrics that should stay above a minimum (e.g., available connections, disk space).

```yaml
# Example: Alert when available connections drops below 10
- name: connection_pool_exhausted
  metric: db_connections_available
  threshold: 10
  threshold_type: less_than
  severity: critical
  window: 1m
```

### 4.4 Heartbeat / Dead Man's Switch (`rate_minute` with special handling)

Fires when evaluation cycles stop. See Section 3.

---

## 5. Anti-Patterns

### ❌ Don't Use `status: failed`

Use `status: error` in metric labels:

```yaml
# WRONG
labels:
  status: failed

# CORRECT
labels:
  status: error
```

The metric `sync_push_total` uses `status: error` for failed operations.

### ❌ Don't Compare Raw Counter Values

Always use rate-based thresholds for cumulative counters:

```yaml
# WRONG - compares raw count
- name: sync_failure_rate
  metric: sync_push_total
  labels:
    status: error
  threshold: 10
  threshold_type: greater_than  # Will fire constantly!

# CORRECT - compares rate of increase
- name: sync_failure_rate
  metric: sync_push_total
  labels:
    status: error
  threshold: 0.5
  threshold_type: rate_percent
  severity: critical
  window: 5m
```

### ❌ Don't Set Windows Too Short

Rate-based alerts need sufficient time to calculate meaningful rates:

```yaml
# WRONG - too short for rate calculation
window: 30s  # Rate may not be meaningful

# CORRECT - minimum 5m for rate-based
window: 5m
```

### ❌ Don't Forget `company_id` Label on Tenant-Scoped Metrics

When filtering metrics by tenant, always include `company_id`:

```yaml
# WRONG - could aggregate across tenants
labels:
  status: error

# CORRECT - tenant-scoped
labels:
  company_id: "1"  # Or use dynamic resolution
  status: error
```

---

## 6. How to Add a New Alert

### Step 1: Define the Alert Rule

Add a new entry to `config/alerts.yaml`:

```yaml
alerts:
  # ... existing alerts ...
  
  - name: my_new_alert
    metric: my_metric_total
    labels:
      company_id: "1"
      status: error
    threshold: 10
    threshold_type: rate_minute
    severity: warning
    window: 5m
    description: "My new alert description"
```

### Step 2: Add the Alert Type (if new)

If adding a new metric that doesn't have an existing alert type, add to `AlertType` in `packages/telemetry/src/runtime/alert-rules.ts`:

```typescript
export type AlertType =
  | "sync_latency_breach"
  | "sync_failure_rate"
  // ... existing ...
  | "my_new_alert";  // Add here
```

### Step 3: Test with Realistic Data

Use the test pattern from `alert-manager.test.ts`:

```typescript
it("should fire my_new_alert when threshold exceeded", () => {
  const alertManager = createAlertManager();
  
  // Baseline
  alertManager.evaluate("my_new_alert", 0);
  
  // Time passes, counter increases
  setMetricValue("my_metric_total", 60);  // 60 events since last check
  const result = alertManager.evaluate("my_new_alert", 60);
  
  // With threshold_type: rate_minute and rate ~1/s = 60/min
  // Alert should fire if threshold < 60
  assert.strictEqual(result.firing, result.threshold < 60);
});
```

### Step 4: Test Counter Reset Handling

Verify zero-delta behavior on counter reset:

```typescript
it("should not fire on counter reset", () => {
  const alertManager = createAlertManager();
  
  // High baseline
  alertManager.evaluate("my_new_alert", 1000);
  
  // Counter resets (simulates process restart)
  setMetricValue("my_metric_total", 0);
  const result = alertManager.evaluate("my_new_alert", 0);
  
  // Should NOT fire due to zero-delta handling
  assert.strictEqual(result.firing, false);
});
```

### Step 5: Verify TypeScript Compiles

```bash
npm run typecheck -w @jurnapod/telemetry
```

---

## 7. Reference: Threshold Types

| Type | Condition | Use Case |
|------|-----------|----------|
| `greater_than` | `value > threshold` | Latency, size, count exceeding limit |
| `less_than` | `value < threshold` | Available resources below minimum |
| `rate_percent` | `(delta / time) * 60 * 100 > threshold` | % growth rate of counter per minute |
| `rate_minute` | `(delta / time) * 60 > threshold` | Events per minute |

---

## 8. Architecture Overview

```
config/alerts.yaml
        │
        ▼
alert-config.ts (loads YAML)
        │
        ▼
alert-rules.ts (adapts to AlertManager interface)
        │
        ▼
AlertManager.evaluateAllAlerts() ──► evaluate() ──► evaluateCondition()
        │                                    │
        ├──► recordEvaluationCycle()        │
        │    (updates lastCycleTime)         │
        │                                    │
        └──► getMetricValue() ◄───────────────┘
```

---

## 9. Common Issues

### Alert Not Firing When Expected

1. Check if `evaluateAllAlerts()` is being called
2. Verify `registerEvaluationCounter()` was called at startup
3. For rate-based: ensure time passes between evaluations
4. Check cooldown: alerts respect a cooldown period (default 5m)

### False Positives on Counter Reset

Counter reset is handled automatically by treating delta as zero when `current < previous`. No action needed if using `AlertManager.evaluate()`.

### Heartbeat Not Firing

1. Verify `registerEvaluationCounter()` was called
2. Check that `evaluateAllAlerts()` is being called periodically
3. Ensure the heartbeat alert has `threshold: 0` and `threshold_type: rate_minute`

---

## Related Files

| File | Purpose |
|------|---------|
| `packages/telemetry/src/runtime/alert-manager.ts` | Core alert evaluation logic |
| `packages/telemetry/src/runtime/alert-rules.ts` | Type definitions and config adapter |
| `packages/telemetry/src/runtime/__tests__/alert-manager.test.ts` | Unit tests including rate calculation |
| `packages/telemetry/src/alert-config.ts` | YAML config loader |
| `config/alerts.yaml` | Alert rule definitions |
