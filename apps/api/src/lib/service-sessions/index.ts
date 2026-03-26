// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Re-export types from types module (canonical location)
export * from './types';

// Re-export shared utilities from session-utils (single source of truth)
export {
  mapDbRowToServiceSession,
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLineWithConnection,
  logTableEventWithConnection,
  logSessionEvent,
  getSessionVersionWithConnection,
  syncSnapshotLinesFromSession,
  validateSessionModifiable,
  isValidSessionStateTransition,
} from './session-utils';

// Re-export lifecycle functions
export * from './lifecycle';

// Re-export line functions
export {
  addSessionLine,
  updateSessionLine,
  removeSessionLine,
} from './lines';

// Re-export checkpoint functions
export {
  finalizeSessionBatch,
  adjustSessionLine,
} from './checkpoint';
