// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions Lifecycle - Thin API Adapter
 *
 * Delegates to @jurnapod/modules-reservations and injects db connection.
 */

import { getDb } from "@/lib/db";
import { ServiceSessionStatus, type ServiceSessionStatusType } from "@jurnapod/shared";

// Re-export types from the reservations module for API compatibility
export type {
  ServiceSession,
  SessionLine,
  ListSessionsParams,
  ListSessionsResult,
  LockSessionInput,
  CloseSessionInput,
} from "@jurnapod/modules-reservations";

// Re-export error classes from the reservations module
export {
  SessionNotFoundError,
  SessionConflictError,
  SessionValidationError,
  InvalidSessionStatusError,
} from "@jurnapod/modules-reservations";

// Import lifecycle functions from reservations module
import {
  getSession as getSessionModule,
  listSessions as listSessionsModule,
  getSessionLines as getSessionLinesModule,
  lockSessionForPayment as lockSessionForPaymentModule,
  closeSession as closeSessionModule,
} from "@jurnapod/modules-reservations";

// ============================================================================
// ADAPTER FUNCTIONS
// ============================================================================

/**
 * Get a single service session by ID with lines
 * Strict company_id + outlet_id scoping enforced
 */
export async function getSession(
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint
) {
  const db = getDb();
  return getSessionModule(db, companyId, outletId, sessionId);
}

/**
 * Get lines for a specific session
 * Scoped to session_id (company/outlet scoping via session lookup)
 */
export async function getSessionLines(sessionId: bigint) {
  const db = getDb();
  return getSessionLinesModule(db, sessionId);
}

/**
 * List service sessions with filtering and pagination
 * Strict company_id + outlet_id scoping enforced
 */
export async function listSessions(
  params: {
    companyId: bigint;
    outletId: bigint;
    limit?: number;
    offset?: number;
    statusId?: ServiceSessionStatusType;
    tableId?: bigint;
    fromDate?: Date;
    toDate?: Date;
  }
) {
  const db = getDb();
  return listSessionsModule(db, params);
}

/**
 * Lock a session for payment
 * Transitions: ACTIVE (1) -> LOCKED_FOR_PAYMENT (2)
 * Logs SESSION_LOCKED event to table_events
 * Idempotent: duplicate clientTxId returns existing session without mutation
 */
export async function lockSessionForPayment(
  params: {
    companyId: bigint;
    outletId: bigint;
    sessionId: bigint;
    clientTxId: string;
    posOrderSnapshotId?: string;
    notes?: string;
    updatedBy: string;
  }
) {
  const db = getDb();
  return lockSessionForPaymentModule(db, params);
}

/**
 * Close a session
 * Transitions: ACTIVE (1) or LOCKED_FOR_PAYMENT (2) -> CLOSED (3)
 */
export async function closeSession(
  params: {
    companyId: bigint;
    outletId: bigint;
    sessionId: bigint;
    clientTxId: string;
    notes?: string;
    updatedBy: string;
  }
) {
  const db = getDb();
  return closeSessionModule(db, params);
}