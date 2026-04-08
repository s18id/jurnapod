# AGENTS.md — @jurnapod/telemetry

## Package Purpose

Observability primitives for Jurnapod ERP — SLO definitions, metrics collection, correlation IDs, and standardized labels.

**Core Capabilities:**
- **SLO tracking**: Service Level Objective definitions and compliance calculation
- **Metrics**: Structured metrics with labels and value types
- **Correlation**: Request tracing with correlation IDs
- **Labels**: Standardized label definitions for metrics and logs

**Boundaries:**
- ✅ In: SLO definitions, metrics structures, label schemas, correlation context
- ❌ Out: Metrics export (to external APM), logging implementation, alerting

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run test` | Run unit tests with Node.js test runner |
| `npm run test:verbose` | Run tests with verbose output |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### SLO Definition

Define SLOs with thresholds and windows:

```typescript
import { defineSLO, type SLOConfig } from '@jurnapod/telemetry/slo';

const config: SLOConfig = {
  name: 'api-latency',
  target: 0.999,        // 99.9%
  window: '30d',
  threshold: 1000,      // 1000ms
  metric: 'http_request_duration_ms'
};

const slo = defineSLO(config);
```

### Metrics with Labels

```typescript
import { defineCounter, defineHistogram, type MetricLabels } from '@jurnapod/telemetry/metrics';

const ordersCounter = defineCounter({
  name: 'pos_orders_total',
  help: 'Total POS orders processed',
  labelNames: ['company_id', 'outlet_id', 'status'] as const
});

ordersCounter.inc({ company_id: 1, outlet_id: 1, status: 'COMPLETED' });
```

### Correlation Context

```typescript
import { withCorrelation, getCorrelationId } from '@jurnapod/telemetry/correlation';

async function handleRequest(req) {
  return withCorrelation(req.id, async () => {
    // All operations within this context share correlation ID
    const cid = getCorrelationId();
    console.log({ correlationId: cid });
  });
}
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| SLO | `slo.ts` | SLO definitions and compliance calculation |
| Metrics | `metrics.ts` | Counter, Histogram, Gauge definitions |
| Correlation | `correlation.ts` | Correlation ID propagation |
| Labels | `labels.ts` | Standardized label schemas |

### File Structure

```
packages/telemetry/
├── src/
│   ├── index.ts                    # Main exports
│   ├── slo.ts                      # SLO definitions
│   ├── metrics.ts                  # Metrics primitives
│   ├── correlation.ts               # Correlation context
│   ├── labels.ts                    # Standardized labels
│   └── __tests__/
│       ├── slo.test.ts
│       ├── correlation.test.ts
│       ├── labels.test.ts
│       └── quality-gate.test.ts
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### TypeScript Conventions

1. **Use `.js` extensions in imports** (ESM compliance):
   ```typescript
   import { defineSLO } from './slo.js';
   ```

2. **Export types from `index.ts`** for public API surface

3. **Use Zod for label validation**:
   ```typescript
   import { MetricLabelsSchema } from './labels.js';
   
   const labels = MetricLabelsSchema.parse(rawLabels);
   ```

### Metrics Naming

Follow Prometheus naming conventions:
- Use `snake_case`
- Include units (e.g., `_ms`, `_total`, `_bytes`)
- Include appropriate suffixes ( `_total` for counters)

---

## Testing Approach

### Unit Tests

```typescript
import { describe, it } from 'vitest';
import { calculateSLOCompliance } from '@jurnapod/telemetry/slo';

describe('SLO Compliance', () => {
  it('should calculate correct availability', () => {
    const good = 1000;
    const total = 1005;
    const compliance = calculateSLOCompliance(good, total);
    // 99.5% availability
  });
});
```

### Running Tests

```bash
npm test           # Run all tests
npm run test:verbose  # Verbose output
```

---

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB integration via `.env`.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

This package (`@jurnapod/telemetry`) contains observability primitives (SLO, metrics, correlation) with NO database operations. All tests are unit tests for pure computation.

If this package is extended to store telemetry data in a database, those tests MUST use real DB:

```typescript
// Load .env before other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { createKysely, type KyselySchema } from '@jurnapod/db';

const db = createKysely({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// CRITICAL: Clean up in afterAll
afterAll(async () => {
  await db.destroy();
});
```

**Non-DB logic (pure computation) may use unit tests without database.**

**Why no mocks for DB-backed tests?**
- Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and can introduce **severe production risk/destruction**
- Mocks do not catch SQL/schema/constraint mismatches
- Mocks hide transaction and concurrency behavior

---

## Security Rules

### Critical Constraints

1. **Never include PII in labels** — labels are often exported to external systems
2. **Validate label values** — use Zod schemas to prevent injection
3. **Sanitize metric names** — no user-provided strings in metric names

---

## Review Checklist

When modifying this package:

- [ ] New SLOs have clear business justification
- [ ] Metrics names follow naming conventions
- [ ] Labels are validated with Zod schemas
- [ ] No PII in correlation context
- [ ] Tests cover calculation logic
- [ ] Label allowlists are documented

---

## Related Packages

- `@jurnapod/api` — Uses telemetry for request tracing
- `@jurnapod/pos-sync` — Uses telemetry for sync metrics
- `@jurnapod/shared` — Uses shared Zod schemas

For project-wide conventions, see root `AGENTS.md`.
