// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Telemetry Middleware - Correlation ID Injection, OpenTelemetry Tracing, and Structured Logging
 * 
 * Provides middleware for Hono that:
 * - Generates/extracts correlation IDs (request_id, client_tx_id, journal_batch_id)
 * - Creates OpenTelemetry spans for distributed tracing
 * - Propagates trace context across services
 * - Injects telemetry context into requests
 * - Provides structured logging with correlation context
 */

import { generateRequestId } from "@jurnapod/telemetry/correlation";
import type { Context, Next } from "hono";
import { nowUTC } from "@/lib/date-helpers";

// OpenTelemetry imports - lazy loaded to allow optional dependency
let trace: typeof import("@opentelemetry/api").trace | null = null;
let SpanKind: typeof import("@opentelemetry/api").SpanKind | null = null;
let context: typeof import("@opentelemetry/api").context | null = null;

try {
  const otel = await import("@opentelemetry/api");
  trace = otel.trace;
  SpanKind = otel.SpanKind;
  context = otel.context;
} catch {
  // OpenTelemetry SDK not installed - tracing disabled
}

/**
 * OpenTelemetry tracer name
 */
const TRACER_NAME = "@jurnapod/api";

/**
 * Correlation IDs to propagate
 */
export interface CorrelationIds {
  requestId: string;
  clientTxId?: string;
  journalBatchId?: string;
  traceId?: string;
}

/**
 * Telemetry context stored in Hono context
 */
export interface TelemetryContext {
  correlationIds: CorrelationIds;
  companyId?: number;
  outletId?: number;
  flowName?: string;
  startTime: number;
  /** OpenTelemetry span (if tracing enabled) */
  span?: import("@opentelemetry/api").Span;
}

/**
 * Extend Hono context with telemetry
 */
declare module "hono" {
  interface ContextVariableMap {
    telemetry?: TelemetryContext;
  }
}

/**
 * Header names for correlation IDs
 */
const CORRELATION_HEADERS = {
  REQUEST_ID: "x-request-id",
  CLIENT_TX_ID: "x-client-tx-id",
  JOURNAL_BATCH_ID: "x-journal-batch-id",
  TRACE_ID: "x-trace-id",
} as const;

/**
 * Generate a new correlation ID
 * 
 * @deprecated Use generateRequestId from @jurnapod/telemetry/correlation directly
 */
export function generateCorrelationId(): string {
  return generateRequestId();
}

/**
 * Extract correlation ID from headers
 * 
 * @deprecated Use extractCorrelationId from @jurnapod/telemetry/correlation directly
 */
export function extractCorrelationId(request: Request, headerName: string): string | undefined {
  const value = request.headers.get(headerName)?.trim();
  return value && value.length > 0 ? value : undefined;
}

/**
 * Extract all correlation IDs from a request
 */
export function extractCorrelationIds(request: Request): CorrelationIds {
  return {
    requestId: extractCorrelationId(request, CORRELATION_HEADERS.REQUEST_ID) ?? generateCorrelationId(),
    clientTxId: extractCorrelationId(request, CORRELATION_HEADERS.CLIENT_TX_ID),
    journalBatchId: extractCorrelationId(request, CORRELATION_HEADERS.JOURNAL_BATCH_ID),
    traceId: extractCorrelationId(request, CORRELATION_HEADERS.TRACE_ID),
  };
}

/**
 * Create correlation ID headers object for response
 */
export function createCorrelationHeaders(ids: CorrelationIds): Record<string, string> {
  const headers: Record<string, string> = {
    [CORRELATION_HEADERS.REQUEST_ID]: ids.requestId,
  };
  if (ids.clientTxId) {
    headers[CORRELATION_HEADERS.CLIENT_TX_ID] = ids.clientTxId;
  }
  if (ids.journalBatchId) {
    headers[CORRELATION_HEADERS.JOURNAL_BATCH_ID] = ids.journalBatchId;
  }
  if (ids.traceId) {
    headers[CORRELATION_HEADERS.TRACE_ID] = ids.traceId;
  }
  return headers;
}

/**
 * Structured log entry format
 */
export interface StructuredLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  // Correlation IDs
  request_id?: string;
  client_tx_id?: string;
  journal_batch_id?: string;
  trace_id?: string;
  // Context
  company_id?: number;
  outlet_id?: number;
  flow_name?: string;
  // Request info
  method?: string;
  path?: string;
  status?: number;
  latency_ms?: number;
  // Error info
  error_class?: string;
  error_message?: string;
}

/**
 * Create a structured log entry with telemetry context
 */
export function createStructuredLog(
  level: StructuredLogEntry["level"],
  message: string,
  context: TelemetryContext,
  extra?: Partial<StructuredLogEntry>
): StructuredLogEntry {
  const entry: StructuredLogEntry = {
    timestamp: nowUTC(),
    level,
    message,
    request_id: context.correlationIds.requestId,
    client_tx_id: context.correlationIds.clientTxId,
    journal_batch_id: context.correlationIds.journalBatchId,
    trace_id: context.correlationIds.traceId,
    company_id: context.companyId,
    outlet_id: context.outletId,
    flow_name: context.flowName,
    ...extra,
  };
  return entry;
}

/**
 * Log a structured entry (console.log format for now - can be replaced with pino)
 */
export function logStructured(entry: StructuredLogEntry): void {
  console.log(JSON.stringify(entry));
}

/**
 * Telemetry middleware for Hono with OpenTelemetry integration
 * 
 * Usage:
 * ```typescript
 * import { telemetryMiddleware } from "./middleware/telemetry";
 * 
 * app.use("/api/*", telemetryMiddleware());
 * ```
 */
export function telemetryMiddleware() {
  return async (c: Context, next: Next): Promise<void | Response> => {
    const request = c.req.raw;
    const correlationIds = extractCorrelationIds(request);

    const telemetryContext: TelemetryContext = {
      correlationIds,
      startTime: Date.now(),
    };

    // Create OpenTelemetry span if SDK is available
    if (trace && SpanKind && context) {
      const tracer = trace.getTracer(TRACER_NAME);
      const span = tracer.startSpan(
        `${c.req.method} ${c.req.path}`,
        {
          kind: SpanKind.SERVER,
          attributes: {
            "http.method": c.req.method,
            "http.url": c.req.url,
            "http.route": c.req.path,
            "http.request_id": correlationIds.requestId,
            ...(correlationIds.clientTxId && { "http.client_tx_id": correlationIds.clientTxId }),
            ...(correlationIds.traceId && { "trace.parent_id": correlationIds.traceId }),
          },
        }
      );

      telemetryContext.span = span;

      // Run the rest of the middleware within the OpenTelemetry context
      await context.with(trace.setSpan(context.active(), span), async () => {
        // Store telemetry context in Hono context
        c.set("telemetry", telemetryContext);

        // Add correlation headers to response
        const responseHeaders = createCorrelationHeaders(correlationIds);
        for (const [key, value] of Object.entries(responseHeaders)) {
          c.header(key, value);
        }

        await next();

        // Record response status on span
        span.setAttribute("http.status_code", c.res.status);
        span.end();
      });
    } else {
      // Fallback without OpenTelemetry
      c.set("telemetry", telemetryContext);

      // Add correlation headers to response
      const responseHeaders = createCorrelationHeaders(correlationIds);
      for (const [key, value] of Object.entries(responseHeaders)) {
        c.header(key, value);
      }

      await next();
    }

    // Log after response (use c.get("telemetry") to access in handlers)
  };
}

/**
 * Get telemetry context from Hono context
 */
export function getTelemetryContext(c: Context): TelemetryContext | undefined {
  return c.get("telemetry");
}

/**
 * Set additional telemetry context
 */
export function setTelemetryContext(c: Context, context: Partial<TelemetryContext>): void {
  const existing = c.get("telemetry") ?? {
    correlationIds: {
      requestId: generateCorrelationId(),
    },
    startTime: Date.now(),
  };
  c.set("telemetry", { ...existing, ...context });
}

/**
 * Log with telemetry context
 */
export function logWithTelemetry(
  c: Context,
  level: StructuredLogEntry["level"],
  message: string,
  extra?: Partial<StructuredLogEntry>
): void {
  const ctx = c.get("telemetry");
  if (ctx) {
    const entry = createStructuredLog(level, message, ctx, {
      method: c.req.method,
      path: c.req.path,
      ...extra,
    });
    logStructured(entry);
  } else {
    // Fallback without telemetry context
    logStructured({
      timestamp: nowUTC(),
      level,
      message,
      ...extra,
    });
  }
}

/**
 * Middleware to add flow name to telemetry context
 */
export function withFlowName(flowName: string) {
  return async (c: Context, next: Next): Promise<void> => {
    const ctx = c.get("telemetry");
    if (ctx) {
      ctx.flowName = flowName;
    }
    await next();
  };
}

/**
 * Middleware to add company/outlet scope to telemetry context
 */
export function withScope(companyId: number, outletId?: number) {
  return async (c: Context, next: Next): Promise<void> => {
    const ctx = c.get("telemetry");
    if (ctx) {
      ctx.companyId = companyId;
      ctx.outletId = outletId;
    }
    await next();
  };
}

/**
 * Log request completion with telemetry
 */
export function logRequestCompletion(
  c: Context,
  status: number,
  latencyMs?: number
): void {
  const ctx = c.get("telemetry");
  if (!ctx) return;

  const actualLatency = latencyMs ?? (Date.now() - ctx.startTime);

  logWithTelemetry(c, "info", "Request completed", {
    status,
    latency_ms: actualLatency,
  });
}
