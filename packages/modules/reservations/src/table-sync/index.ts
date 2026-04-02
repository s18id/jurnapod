// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Table Sync Module
 *
 * Interface-based table sync operations that are decoupled from transport concerns.
 * These types and operations provide the core table sync logic for POS offline-first sync.
 */

// Types and interfaces
export * from "./types.js";

// Service implementation
export {
  pushTableEvents,
  pullTableState,
  buildConflictPayload,
  resolveReservationDefaultDurationMinutes,
  type ISettingsResolver,
} from "./service.js";
