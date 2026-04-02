// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions Types - Thin API Adapter
 *
 * Re-exports types from @jurnapod/modules-reservations for API compatibility.
 */

// Re-export all types and errors from the reservations module
export {
  SessionNotFoundError,
  SessionConflictError,
  SessionValidationError,
  InvalidSessionStatusError,
} from "@jurnapod/modules-reservations";

export type {
  ServiceSession,
  SessionLine,
  ServiceSessionDbRow,
  SessionLineDbRow,
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
  SessionEvent,
  SessionEventDbRow,
} from "@jurnapod/modules-reservations";