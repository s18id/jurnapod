# @jurnapod/telemetry

Observability primitives for Jurnapod ERP — SLO definitions, metrics collection, correlation IDs, and standardized labels.

## Overview

The `@jurnapod/telemetry` package provides:

- **SLO tracking** — Service Level Objective definitions with compliance calculation
- **Metrics primitives** — Counters, Histograms, Gauges with standardized labels
- **Correlation context** — Request tracing with correlation ID propagation
- **Label schemas** — Validated label definitions for observability data

## Installation

```bash
npm install @jurnapod/telemetry
```

## SLOs

### Define an SLO

```typescript
import { defineSLO, calculateSLOCompliance } from '@jurnapod/telemetry/slo';

const slo = defineSLO({
  name: 'api-availability',
  target: 0.999,        // 99.9%
  window: '30d',
  threshold: 1000,      // p99 latency threshold in ms
  metric: 'http_request_duration_ms'
});

// Calculate compliance
const compliance = calculateSLOCompliance(
  goodEvents: 9990,
  totalEvents: 10000
);

console.log(`SLO compliance: ${compliance}%`); // 99.9%
```

## Metrics

### Metric Schema

The telemetry package defines canonical metric schemas for sync, outbox, and journal operations. All tenant-scoped metrics MUST include the `company_id` label.

#### Sync Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `sync_push_latency_ms` | Histogram | `company_id`, `outlet_id`, `status` | Sync push operation latency in milliseconds |
| `sync_push_total` | Counter | `company_id`, `outlet_id`, `status` | Total sync push operations |
| `sync_pull_latency_ms` | Histogram | `company_id`, `outlet_id`, `status` | Sync pull operation latency in milliseconds |
| `sync_pull_total` | Counter | `company_id`, `outlet_id`, `status` | Total sync pull operations |
| `client_tx_id_duplicates_total` | Counter | `company_id`, `outlet_id` | Duplicate transaction suppressions |
| `sync_conflicts_total` | Counter | `company_id`, `outlet_id` | Sync conflicts detected |

#### Outbox Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `outbox_lag_items` | Gauge | `company_id`, `outlet_id` | Number of pending outbox items |
| `outbox_retry_depth` | Gauge | `company_id`, `outlet_id` | Current retry attempt depth |
| `outbox_failure_total` | Counter | `company_id`, `outlet_id`, `reason` | Outbox processing failures |

#### Journal/Financial Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `journal_post_success_total` | Counter | `company_id`, `domain` | Successful journal postings |
| `journal_post_failure_total` | Counter | `company_id`, `domain`, `reason` | Failed journal postings |
| `gl_imbalance_detected_total` | Counter | `company_id` | GL imbalance alerts when debit != credit |

### Naming Rules

- Use `snake_case` for all metric names
- Include units in the name:
  - `_ms` for latency/histogram metrics (e.g., `sync_push_latency_ms`)
  - `_total` for counter metrics (e.g., `sync_push_total`)
  - `_items` for gauge metrics representing counts (e.g., `outbox_lag_items`)
- **Never use `_duration_seconds`** — use `_latency_ms` instead
- All tenant-scoped metrics MUST include the `company_id` label
- Use `_total` suffix for all Counter types

### How to Add a New Metric

1. **Propose name in epic documentation** — Align on naming before implementation
2. **Verify no drift from existing collectors** — Check `packages/telemetry/src/metrics.ts` for existing metric name constants
3. **Add to `packages/telemetry/src/metrics.ts`** — Define the metric name constant and label schema
4. **Update alert rules in `config/alerts.yaml`** — Add corresponding alert threshold
5. **Update dashboards in `apps/api/src/routes/admin-dashboards.ts`** — Include new metric in relevant panels
6. **Update this document** — Add the new metric to the appropriate table above

### Counter

```typescript
import { defineCounter } from '@jurnapod/telemetry/metrics';

const ordersTotal = defineCounter({
  name: 'pos_orders_total',
  help: 'Total POS orders processed',
  labelNames: ['company_id', 'outlet_id', 'status'] as const
});

// Increment
ordersTotal.inc({ company_id: 1, outlet_id: 1, status: 'COMPLETED' });
ordersTotal.inc({ company_id: 1, outlet_id: 1, status: 'COMPLETED' }, 5); // by 5
```

### Histogram

```typescript
import { defineHistogram } from '@jurnapod/telemetry/metrics';

const requestDuration = defineHistogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'path', 'status'] as const,
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000]
});

// Observe value
requestDuration.observe(
  { method: 'POST', path: '/sync/push', status: 200 },
  145.5  // duration in ms
);
```

### SLO Configuration (YAML)

Load SLO thresholds from YAML configuration:

```typescript
import { loadSLOConfig, getSyncLatencyThreshold } from '@jurnapod/telemetry/slo-config';

const config = loadSLOConfig();

// Get specific thresholds
const p50 = getSyncLatencyThreshold(config, 'p50');  // 200ms
const p95 = getSyncLatencyThreshold(config, 'p95');  // 500ms
const p99 = getSyncLatencyThreshold(config, 'p99');  // 2000ms
```

The SLO configuration file (`config/slos.yaml`) contains:

```yaml
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

## Correlation

### Context Propagation

```typescript
import { withCorrelation, getCorrelationId } from '@jurnapod/telemetry/correlation';

async function handleRequest(req) {
  return withCorrelation(req.headers['x-correlation-id'], async () => {
    const correlationId = getCorrelationId();
    
    // Use in logs
    logger.info({ correlationId, event: 'request received' });
    
    // Pass to services
    await processOrder({ correlationId });
  });
}
```

### Child Spans

```typescript
import { withSpan, getCorrelationId } from '@jurnapod/telemetry/correlation';

async function parentOperation() {
  return withSpan('parent-operation', async (span) => {
    await childOperation();
    span.setAttribute('items.count', 5);
  });
}
```

## Labels

### Standardized Labels

```typescript
import { 
  COMPANY_LABEL,
  OUTLET_LABEL,
  USER_LABEL,
  formatMetricLabels 
} from '@jurnapod/telemetry/labels';

const labels = formatMetricLabels({
  companyId: 1,
  outletId: 2,
  userId: 5
});

// { company_id: '1', outlet_id: '2', user_id: '5' }
```

### Label Validation

```typescript
import { MetricLabelsSchema } from '@jurnapod/telemetry/labels';

const validated = MetricLabelsSchema.parse({
  company_id: '1',
  outlet_id: '2'
});
```

## Architecture

```
packages/telemetry/
├── src/
│   ├── index.ts                    # Main exports
│   ├── slo.ts                      # SLO definitions
│   ├── slo-config.ts               # SLO YAML configuration loader
│   ├── metrics.ts                  # Metrics primitives & schema
│   ├── correlation.ts              # Correlation context
│   └── labels.ts                   # Label schemas
```

## Related Packages

- [@jurnapod/api](../../apps/api) - Request tracing and metrics
- [@jurnapod/pos-sync](../../packages/pos-sync) - Sync operation metrics