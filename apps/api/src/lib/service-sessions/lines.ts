// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions Lines - Thin API Adapter
 *
 * Delegates to @jurnapod/modules-reservations and injects db connection.
 */

import { getDb } from "@/lib/db";

// Re-export types from the reservations module for API compatibility
export type {
  SessionLine,
  AddSessionLineInput,
  UpdateSessionLineInput,
  RemoveSessionLineInput,
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
  logTableEventWithConnection,
} from "@jurnapod/modules-reservations";

// Import line functions from reservations module
import {
  addSessionLine as addSessionLineModule,
  updateSessionLine as updateSessionLineModule,
  removeSessionLine as removeSessionLineModule,
} from "@jurnapod/modules-reservations";

// ============================================================================
// ADAPTER FUNCTIONS
// ============================================================================

/**
 * Add a line to a service session
 */
export async function addSessionLine(
  input: {
    companyId: bigint;
    outletId: bigint;
    sessionId: bigint;
    productId: bigint;
    productName: string;
    productSku?: string;
    quantity: number;
    unitPrice: number;
    discountAmount?: number;
    taxAmount?: number;
    notes?: string;
    createdBy: string;
    clientTxId: string;
  }
) {
  const db = getDb();
  return addSessionLineModule(db, input);
}

/**
 * Update a session line
 */
export async function updateSessionLine(
  input: {
    companyId: bigint;
    outletId: bigint;
    sessionId: bigint;
    lineId: bigint;
    quantity?: number;
    unitPrice?: number;
    discountAmount?: number;
    taxAmount?: number;
    notes?: string;
    isVoided?: boolean;
    voidReason?: string;
    updatedBy: string;
    clientTxId: string;
  }
) {
  const db = getDb();
  return updateSessionLineModule(db, input);
}

/**
 * Remove a session line
 */
export async function removeSessionLine(
  input: {
    companyId: bigint;
    outletId: bigint;
    sessionId: bigint;
    lineId: bigint;
    updatedBy: string;
    clientTxId: string;
  }
) {
  const db = getDb();
  return removeSessionLineModule(db, input);
}