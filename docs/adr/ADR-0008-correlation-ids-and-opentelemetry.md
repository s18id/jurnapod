<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0008: Correlation IDs and Optional OpenTelemetry

**Status:** Accepted
**Date:** 2026-03-25
**Deciders:** Ahmad Faruk (Signal18 ID)
**Epic:** Epic 11 (Operational trust and scale readiness)

---

## Context

Jurnapod processes multi-step financial operations (POS sync batch push → journal posting → stock deduction) that span several service layers within a single API request. Debugging production issues requires:

- Tracing a POS sync transaction from device to database entry.
- Correlating a failed journal post to the sync batch that triggered it.
- Attributing errors to a specific company/outlet without exposing tenant data in plain logs.

Before Epic 11, requests had no correlation identifiers. Logs were `console.log()` with ad-hoc messages. Production issues required database queries to reconstruct what happened.

---

## Decision

Every API request carries a set of **correlation IDs**, propagated from client to server via HTTP headers and echoed back in the response. Structured JSON logging uses these IDs on every log line. OpenTelemetry span instrumentation is supported but loaded lazily — the API runs correctly without it.

### Correlation IDs

Four identifiers cover the main tracing contexts:

| Header | Field | Purpose |
|--------|-------|---------|
| `x-request-id` | `requestId` | Unique per HTTP request (UUID v4, generated if absent) |
| `x-client-tx-id` | `clientTxId` | POS device idempotency key (UUID v4 from device) |
| `x-journal-batch-id` | `journalBatchId` | Ties all lines in a GL posting batch together |
| `x-trace-id` | `traceId` | Distributed trace root (passed through from upstream, or generated) |

The telemetry middleware extracts these from the request, generates any that are missing, and echoes all four back in the response headers.

```typescript
export interface CorrelationIds {
  requestId: string;
  clientTxId?: string;
  journalBatchId?: string;
  traceId?: string;
}
```

### Telemetry context

The middleware stores a `TelemetryContext` in Hono context for the duration of the request:

```typescript
export interface TelemetryContext {
  correlationIds: CorrelationIds;
  companyId?: number;   // populated after auth resolves
  outletId?: number;    // populated for outlet-scoped routes
  flowName?: string;    // logical operation name (e.g., "sync.push", "invoice.post")
  startTime: number;    // `Date.now()` at request start
  span?: Span;          // OpenTelemetry span (if SDK loaded)
}
```

Handlers that perform notable operations set `flowName` for log correlation:

```typescript
c.set("telemetry", { ...c.get("telemetry"), flowName: "sync.push" });
```

### Structured logging

All log output is newline-delimited JSON:

```typescript
export interface StructuredLogEntry {
  timestamp: string;       // ISO 8601
  level: "info" | "warn" | "error" | "debug";
  message: string;
  request_id?: string;
  client_tx_id?: string;
  journal_batch_id?: string;
  trace_id?: string;
  company_id?: number;
  outlet_id?: number;
  flow_name?: string;
  method?: string;
  path?: string;
  status?: number;
  latency_ms?: number;
  error_class?: string;
  error_message?: string;
}

export function logStructured(entry: StructuredLogEntry): void {
  console.log(JSON.stringify(entry));
}
```

Every request logs at least one entry on completion with `status`, `latency_ms`, and all correlation IDs.

### OpenTelemetry — lazy, optional

OpenTelemetry SDK (`@opentelemetry/api`) is imported via dynamic `import()` at middleware initialization time. If the package is not installed or the SDK is not configured, the middleware runs without span creation — no `try/catch` noise, no startup failure:

```typescript
// middleware/telemetry.ts
let trace: typeof import("@opentelemetry/api").trace | undefined;
let SpanKind: typeof import("@opentelemetry/api").SpanKind | undefined;

try {
  const otel = await import("@opentelemetry/api");
  trace = otel.trace;
  SpanKind = otel.SpanKind;
} catch {
  // OpenTelemetry not installed — structured logs only
}

// In handler:
if (trace && SpanKind) {
  const tracer = trace.getTracer("@jurnapod/api");
  const span = tracer.startSpan(`${method} ${path}`, {
    kind: SpanKind.SERVER,
    attributes: {
      "http.method": method,
      "http.url": url,
      "http.request_id": correlationIds.requestId,
    }
  });
  // ... run handler within span context ...
  span.setAttribute("http.status_code", c.res.status);
  span.end();
}
```

Span attributes follow OpenTelemetry semantic conventions for HTTP spans.

---

## Alternatives Considered

### No correlation IDs (logs only)

Rejected. Plain text logs with no request identifier make it impossible to correlate log lines from a single request when the API handles concurrent traffic. The POS sync client sends batches of transactions — without a `client_tx_id` echoed in the response, the client cannot match server responses to device-side records.

### Hard dependency on OpenTelemetry SDK

Rejected. Requiring the full OpenTelemetry SDK at startup creates a cold-start cost and forces SDK configuration in all environments (development, CI, production). The lazy-load approach keeps development simple while allowing production observability to be enabled via the SDK's auto-instrumentation or explicit configuration.

### Datadog / Sentry SDK

Evaluated. Vendor SDKs provide more out-of-the-box features but couple the codebase to a specific vendor. The structured logging + correlation ID approach is vendor-neutral — logs can be shipped to any backend (Datadog, Loki, CloudWatch, Elasticsearch) by configuring the log drain without changing application code.

---

## Consequences

### Positive

- Every error in production can be searched by `request_id` to retrieve all log lines for that request.
- POS device failures can be traced by `client_tx_id` — the same UUID the device generates appears in both the sync push response and in `audit_logs`.
- GL posting issues can be traced by `journal_batch_id` across multiple log lines (batch insert, journal line inserts, stock deductions).
- OpenTelemetry spans are additive — enabling them in production requires only SDK configuration, not code changes.

### Negative / Trade-offs

- `companyId` and `outletId` appear in log output. Log storage must be treated as sensitive data.
- `flowName` is set manually by handlers — it can be omitted. Inconsistent `flowName` values reduce the usefulness of flow-based log filtering.
- Lazy OpenTelemetry import means trace context is not propagated to outbound calls (e.g., email service, future microservices) unless the SDK is explicitly initialized. This is acceptable for the current single-service architecture.

---

## References

- `apps/api/src/middleware/telemetry.ts` — full implementation
- `apps/api/src/lib/response.ts` — response headers include correlation IDs
- Epic 11.1: Reliability baseline and SLO instrumentation
- Epic 11.3: Sync idempotency (use of `client_tx_id` in sync routes)
- `packages/telemetry/` — shared telemetry utilities
