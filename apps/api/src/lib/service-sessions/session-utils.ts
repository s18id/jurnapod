// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions Shared Utilities - Thin API Adapter
 *
 * This module re-exports utilities from @jurnapod/modules-reservations
 * and provides API-specific entry points that inject the db connection.
 */

import { getDb } from "@/lib/db";

// Re-export all utilities from the reservations module
export {
  mapDbRowToServiceSession,
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLineWithConnection,
  getSessionLinesWithConnection,
  logTableEventWithConnection,
  logSessionEvent,
  getSessionVersionWithConnection,
  syncSnapshotLinesFromSession,
  getSessionEvents,
  validateSessionModifiable,
  isValidSessionStateTransition,
} from "@jurnapod/modules-reservations";

export type { SessionEvent } from "@jurnapod/modules-reservations";

// Re-export types from the reservations module
export type {
  ServiceSession,
  SessionLine,
  ServiceSessionDbRow,
  SessionLineDbRow,
  SessionEventDbRow,
  ListSessionsParams,
  ListSessionsResult,
  AddSessionLineInput,
  UpdateSessionLineInput,
  RemoveSessionLineInput,
  LockSessionInput,
  CloseSessionInput,
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