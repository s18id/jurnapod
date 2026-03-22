// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit Tests for Telemetry Middleware
 * Story 11.1: Reliability Baseline and SLO Instrumentation
 * 
 * Tests correlation ID injection and structured logging.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach, mock } from "node:test";
import {
  generateCorrelationId,
  extractCorrelationId,
  extractCorrelationIds,
  createCorrelationHeaders,
  createStructuredLog,
  type CorrelationIds,
  type TelemetryContext,
} from "./telemetry.js";

describe("Telemetry Middleware", () => {
  describe("generateCorrelationId()", () => {
    it("should generate valid UUID v4 format", () => {
      const uuid = generateCorrelationId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(uuid), `Generated ID is not valid UUID: ${uuid}`);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      assert.strictEqual(ids.size, 100);
    });
  });

  describe("extractCorrelationId()", () => {
    it("should extract correlation ID from headers", () => {
      const existingId = "123e4567-e89b-12d3-a456-426614174000";
      const request = new Request("http://localhost", {
        headers: {
          "x-request-id": existingId,
        },
      });

      const result = extractCorrelationId(request, "x-request-id");
      assert.strictEqual(result, existingId);
    });

    it("should return undefined for missing header", () => {
      const request = new Request("http://localhost");

      const result = extractCorrelationId(request, "x-request-id");
      assert.strictEqual(result, undefined);
    });

    it("should return undefined for empty header", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-request-id": "",
        },
      });

      const result = extractCorrelationId(request, "x-request-id");
      assert.strictEqual(result, undefined);
    });

    it("should trim whitespace from header value", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-request-id": "  123e4567-e89b-12d3-a456-426614174000  ",
        },
      });

      const result = extractCorrelationId(request, "x-request-id");
      assert.strictEqual(result, "123e4567-e89b-12d3-a456-426614174000");
    });
  });

  describe("extractCorrelationIds()", () => {
    it("should extract all correlation IDs from request", () => {
      const requestId = "123e4567-e89b-12d3-a456-426614174000";
      const clientTxId = "223e4567-e89b-12d3-a456-426614174000";
      const journalBatchId = "323e4567-e89b-12d3-a456-426614174000";
      const traceId = "423e4567-e89b-12d3-a456-426614174000";

      const request = new Request("http://localhost", {
        headers: {
          "x-request-id": requestId,
          "x-client-tx-id": clientTxId,
          "x-journal-batch-id": journalBatchId,
          "x-trace-id": traceId,
        },
      });

      const result = extractCorrelationIds(request);

      assert.strictEqual(result.requestId, requestId);
      assert.strictEqual(result.clientTxId, clientTxId);
      assert.strictEqual(result.journalBatchId, journalBatchId);
      assert.strictEqual(result.traceId, traceId);
    });

    it("should generate request_id if not provided", () => {
      const request = new Request("http://localhost");

      const result = extractCorrelationIds(request);

      assert.ok(result.requestId);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(result.requestId));
    });

    it("should only generate request_id and leave others undefined", () => {
      const requestId = "123e4567-e89b-12d3-a456-426614174000";
      const request = new Request("http://localhost", {
        headers: {
          "x-request-id": requestId,
        },
      });

      const result = extractCorrelationIds(request);

      assert.strictEqual(result.requestId, requestId);
      assert.strictEqual(result.clientTxId, undefined);
      assert.strictEqual(result.journalBatchId, undefined);
      assert.strictEqual(result.traceId, undefined);
    });
  });

  describe("createCorrelationHeaders()", () => {
    it("should create headers with all IDs", () => {
      const ids: CorrelationIds = {
        requestId: "123e4567-e89b-12d3-a456-426614174000",
        clientTxId: "223e4567-e89b-12d3-a456-426614174000",
        journalBatchId: "323e4567-e89b-12d3-a456-426614174000",
        traceId: "423e4567-e89b-12d3-a456-426614174000",
      };

      const headers = createCorrelationHeaders(ids);

      assert.strictEqual(headers["x-request-id"], ids.requestId);
      assert.strictEqual(headers["x-client-tx-id"], ids.clientTxId);
      assert.strictEqual(headers["x-journal-batch-id"], ids.journalBatchId);
      assert.strictEqual(headers["x-trace-id"], ids.traceId);
    });

    it("should only include present IDs", () => {
      const ids: CorrelationIds = {
        requestId: "123e4567-e89b-12d3-a456-426614174000",
        clientTxId: "223e4567-e89b-12d3-a456-426614174000",
      };

      const headers = createCorrelationHeaders(ids);

      assert.strictEqual(headers["x-request-id"], ids.requestId);
      assert.strictEqual(headers["x-client-tx-id"], ids.clientTxId);
      assert.strictEqual(headers["x-journal-batch-id"], undefined);
      assert.strictEqual(headers["x-trace-id"], undefined);
    });
  });

  describe("createStructuredLog()", () => {
    it("should create log entry with all correlation IDs", () => {
      const context: TelemetryContext = {
        correlationIds: {
          requestId: "123e4567-e89b-12d3-a456-426614174000",
          clientTxId: "223e4567-e89b-12d3-a456-426614174000",
          journalBatchId: "323e4567-e89b-12d3-a456-426614174000",
          traceId: "423e4567-e89b-12d3-a456-426614174000",
        },
        companyId: 1,
        outletId: 2,
        flowName: "payment_capture",
        startTime: Date.now(),
      };

      const entry = createStructuredLog("info", "Test message", context);

      assert.strictEqual(entry.message, "Test message");
      assert.strictEqual(entry.level, "info");
      assert.strictEqual(entry.request_id, context.correlationIds.requestId);
      assert.strictEqual(entry.client_tx_id, context.correlationIds.clientTxId);
      assert.strictEqual(entry.journal_batch_id, context.correlationIds.journalBatchId);
      assert.strictEqual(entry.trace_id, context.correlationIds.traceId);
      assert.strictEqual(entry.company_id, context.companyId);
      assert.strictEqual(entry.outlet_id, context.outletId);
      assert.strictEqual(entry.flow_name, context.flowName);
      assert.ok(entry.timestamp);
    });

    it("should include extra fields in log entry", () => {
      const context: TelemetryContext = {
        correlationIds: {
          requestId: "123e4567-e89b-12d3-a456-426614174000",
        },
        startTime: Date.now(),
      };

      const entry = createStructuredLog("error", "Error occurred", context, {
        status: 500,
        error_class: "internal",
        latency_ms: 100,
      });

      assert.strictEqual(entry.status, 500);
      assert.strictEqual(entry.error_class, "internal");
      assert.strictEqual(entry.latency_ms, 100);
    });
  });
});
