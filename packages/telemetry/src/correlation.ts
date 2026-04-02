// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Correlation ID Types and Propagation Matrix
 * 
 * Defines correlation IDs used for distributed tracing across critical flows.
 */

import { z } from "zod";
import type { CriticalFlowName } from "./slo.js";

/**
 * Correlation ID types used in the system
 */
export const CORRELATION_ID_TYPES = ["request_id", "client_tx_id", "journal_batch_id", "trace_id"] as const;
export type CorrelationIdType = (typeof CORRELATION_ID_TYPES)[number];

/**
 * Correlation ID header names (lowercase for HTTP headers)
 */
export const CORRELATION_HEADERS: Record<CorrelationIdType, string> = {
  request_id: "x-request-id",
  client_tx_id: "x-client-tx-id",
  journal_batch_id: "x-journal-batch-id",
  trace_id: "x-trace-id",
};

/**
 * Correlation context schema for propagating IDs through a request
 */
export const CorrelationContextSchema = z.object({
  request_id: z.string().uuid().optional(),
  client_tx_id: z.string().optional(),
  journal_batch_id: z.string().optional(),
  trace_id: z.string().optional(),
});

export type CorrelationContext = z.infer<typeof CorrelationContextSchema>;

/**
 * Correlation ID propagation matrix for each critical flow
 * Specifies which correlation IDs are required/optional for each flow
 */
export const CORRELATION_PROPAGATION_MATRIX: Record<CriticalFlowName, {
  request_id: "generated" | "propagated" | "-";
  client_tx_id: "required" | "optional" | "-";
  journal_batch_id: "required" | "optional" | "-";
  trace_id: "propagated" | "-";
}> = {
  payment_capture: {
    request_id: "generated",
    client_tx_id: "required",
    journal_batch_id: "-",
    trace_id: "propagated",
  },
  offline_local_commit: {
    request_id: "generated",
    client_tx_id: "required",
    journal_batch_id: "-",
    trace_id: "propagated",
  },
  sync_replay_idempotency: {
    request_id: "generated",
    client_tx_id: "required",
    journal_batch_id: "-",
    trace_id: "propagated",
  },
  pos_to_gl_posting: {
    request_id: "generated",
    client_tx_id: "-",
    journal_batch_id: "required",
    trace_id: "propagated",
  },
  trial_balance: {
    request_id: "generated",
    client_tx_id: "-",
    journal_batch_id: "-",
    trace_id: "propagated",
  },
  general_ledger: {
    request_id: "generated",
    client_tx_id: "-",
    journal_batch_id: "-",
    trace_id: "propagated",
  },
};

/**
 * Check if a correlation ID type is required for a flow
 */
export function isCorrelationRequired(
  flowName: CriticalFlowName,
  idType: CorrelationIdType
): boolean {
  const flowConfig = CORRELATION_PROPAGATION_MATRIX[flowName];
  const value = flowConfig[idType];
  return value === "required" || value === "generated";
}

/**
 * Generate a new request ID (UUID v4)
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a client transaction ID (UUID v4)
 */
export function generateClientTxId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a journal batch ID (UUID v4)
 */
export function generateJournalBatchId(): string {
  return crypto.randomUUID();
}

/**
 * Extract correlation ID from a request header
 */
export function extractCorrelationId(request: Request, headerName: string): string | undefined {
  const value = request.headers.get(headerName)?.trim();
  return value && value.length > 0 ? value : undefined;
}

/**
 * Get request correlation ID from request.
 * 
 * Checks `x-correlation-id` header first, then `x-request-id`.
 * Falls back to generating a new UUID if neither header is present.
 */
export function getRequestCorrelationId(request: Request): string {
  const headerValue =
    request.headers.get("x-correlation-id")?.trim() ?? request.headers.get("x-request-id")?.trim();

  if (!headerValue || headerValue.length === 0) {
    return generateRequestId();
  }

  return headerValue;
}
