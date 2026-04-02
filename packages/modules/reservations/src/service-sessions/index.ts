// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions Module
 *
 * Exports all service session-related types, errors, and operations.
 */

// Types and errors
export * from "./types.js";

// Shared utilities (mappers, helpers)
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
} from "./session-utils.js";

// Lifecycle operations
export {
  getSession,
  getSessionLines,
  listSessions,
  lockSessionForPayment,
  closeSession,
} from "./lifecycle.js";

// Line operations
export {
  addSessionLine,
  updateSessionLine,
  removeSessionLine,
} from "./lines.js";

// Checkpoint operations
export {
  finalizeSessionBatch,
  adjustSessionLine,
} from "./checkpoint.js";
