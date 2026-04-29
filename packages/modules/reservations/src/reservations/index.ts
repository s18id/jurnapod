// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Module
 *
 * Exports all reservation-related types, errors, and operations.
 * Note: Types are defined in interfaces/ - this module re-exports
 * implementation utilities and functions.
 */

// Errors
export {
  ReservationNotFoundError,
  ReservationValidationError,
  ReservationConflictError,
  InvalidStatusTransitionError,
  DuplicateReservationCodeError,
} from "./errors.js";

// Internal types for implementation (not re-exported to avoid conflicts with interfaces)
export type {
  ReservationDbRow,
  OccupancySnapshotRow,
  CreateReservationInput as ImplCreateReservationInput,
  UpdateReservationInput as ImplUpdateReservationInput,
  UpdateReservationStatusInput as ImplUpdateReservationStatusInput,
  ListReservationsParams as ImplListReservationsParams,
  ReservationRecord as ImplReservationRecord,
  OverlapCheckResult as ImplOverlapCheckResult,
} from "./types.js";

// Constants
export { RESERVATION_DEFAULT_DURATION_KEY, RESERVATION_DEFAULT_DURATION_FALLBACK, MAX_CODE_GENERATION_RETRIES } from "./types.js";

// Utilities
export {
  toUnixMsFromDate,
  fromUnixMsToNumber,
  mapDbRowToReservation,
  checkTimeOverlap,
  columnExists,
  generateReservationCodeWithConnection,
} from "./utils.js";

// Re-export status helpers from shared
export { isFinalStatus, canTransition, VALID_STATUS_TRANSITIONS as VALID_TRANSITIONS } from "../interfaces/shared.js";

// Re-export from time module
export { reservationsOverlap } from "../time/overlap.js";

// CRUD
export {
  getReservation,
  readReservationOutletId,
  listReservations,
  createReservation,
  updateReservation,
} from "./crud.js";

// Status
export {
  updateReservationStatus,
  generateReservationCode,
} from "./status.js";

// Availability
export {
  getTableOccupancySnapshotWithConnection,
  readTableForUpdate,
  hasOpenDineInOrderOnTable,
  checkReservationOverlap,
  hasActiveReservationOnTable,
} from "./availability.js";
