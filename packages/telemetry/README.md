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
│   ├── metrics.ts                  # Metrics primitives
│   ├── correlation.ts               # Correlation context
│   └── labels.ts                    # Label schemas
```

## Related Packages

- [@jurnapod/api](../../apps/api) - Request tracing and metrics
- [@jurnapod/pos-sync](../../packages/pos-sync) - Sync operation metrics