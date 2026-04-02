// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions Checkpoint - Thin API Adapter
 *
 * Delegates to @jurnapod/modules-reservations and injects db connection.
 */

import { getDb } from "@/lib/db";

// Re-export types from the reservations module for API compatibility
export type {
  SessionLine,
  FinalizeSessionBatchInput,
  FinalizeSessionBatchResult,
  AdjustSessionLineInput,
  AdjustSessionLineResult,
} from "@jurnapod/modules-reservations";

// Re-export error classes from the reservations module
export {
  SessionNotFoundError,
  SessionConflictError,
  SessionValidationError,
  InvalidSessionStatusError,
} from "@jurnapod/modules-reservations";

// Re-export helpers from session-utils
export {
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLineWithConnection,
  logSessionEvent,
  getSessionVersionWithConnection,
  syncSnapshotLinesFromSession,
} from "@jurnapod/modules-reservations";

// Import checkpoint functions from reservations module
import {
  finalizeSessionBatch as finalizeSessionBatchModule,
  adjustSessionLine as adjustSessionLineModule,
} from "@jurnapod/modules-reservations";

// ============================================================================
// ADAPTER FUNCTIONS
// ============================================================================

/**
 * Finalize a batch of session lines
 */
export async function finalizeSessionBatch(
  input: {
    companyId: bigint;
    outletId: bigint;
    sessionId: bigint;
    clientTxId: string;
    notes?: string;
    updatedBy: string;
  }
) {
  const db = getDb();
  return finalizeSessionBatchModule(db, input);
}

/**
 * Adjust a session line quantity
 */
export async function adjustSessionLine(
  input: {
    companyId: bigint;
    outletId: bigint;
    sessionId: bigint;
    lineId: bigint;
    action: "CANCEL" | "REDUCE_QTY";
    qtyDelta?: number;
    reason: string;
    clientTxId: string;
    updatedBy: string;
  }
) {
  const db = getDb();
  return adjustSessionLineModule(db, input);
}