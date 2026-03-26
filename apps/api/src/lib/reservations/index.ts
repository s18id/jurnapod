// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Domain Module
 *
 * Part of Story 6.5 (Reservations Domain Extraction).
 * This module provides the public API for reservations functionality.
 */

// Re-export all types and errors from types module (canonical location)
export * from './types';

// Re-export helpers from utils (single source of truth)
export {
  toIso,
  toDbDateTime,
  toUnixMs,
  fromUnixMs,
  mapRow,
  mapDbRowToReservation,
  isFinalStatus,
  canTransition,
  reservationsOverlap,
  columnExists,
  generateReservationCodeWithConnection,
  MAX_CODE_GENERATION_RETRIES,
  resolveEffectiveDurationMinutes,
} from './utils';

// Re-export CRUD operations
export {
  listReservations,
  readReservationOutletId,
  getReservation,
  updateReservation,
  createReservation,
  createReservationV2,
  listReservationsV2,
} from './crud';

// Re-export status management functions
export {
  generateReservationCode,
  updateReservationStatus,
} from './status';

// Re-export availability and overlap checking functions
export {
  checkReservationOverlap,
  hasActiveReservationOnTable,
  getTableOccupancySnapshotWithConnection,
  readTableForUpdate,
  setTableStatus,
  hasOpenDineInOrderOnTable,
  recomputeTableStatus,
} from './availability';
