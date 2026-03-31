// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions
 *
 * Barrel file that re-exports all service session functionality from sub-modules.
 * This file provides backward compatibility for imports from "@/lib/service-sessions".
 */

// Re-export types and error classes from types module
export type {
  ServiceSession,
  SessionLine,
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
  ServiceSessionDbRow,
  SessionLineDbRow,
} from "./service-sessions/types";

export {
  SessionNotFoundError,
  SessionConflictError,
  SessionValidationError,
  InvalidSessionStatusError,
} from "./service-sessions/types";

// Re-export enums from shared
export { ServiceSessionStatus } from "@jurnapod/shared";
export type { ServiceSessionStatusType } from "@jurnapod/shared";

// Re-export read-side queries from lifecycle
export {
  getSession,
  listSessions,
  getSessionLines,
} from "./service-sessions/lifecycle";

// Re-export session control operations from lifecycle
export {
  lockSessionForPayment,
  closeSession,
} from "./service-sessions/lifecycle";

// Re-export line mutations from lines
export {
  addSessionLine,
  updateSessionLine,
  removeSessionLine,
} from "./service-sessions/lines";

// Re-export checkpoint operations from checkpoint
export {
  finalizeSessionBatch,
  adjustSessionLine,
} from "./service-sessions/checkpoint";

// Re-export shared utilities from session-utils
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
  type SessionEvent,
} from "./service-sessions/session-utils";
