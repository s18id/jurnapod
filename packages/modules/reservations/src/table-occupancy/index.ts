// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Table Occupancy Module
 *
 * Exports all table occupancy-related types and operations.
 */

// Types and errors
export * from "./types.js";

// Service operations
export {
  getTableBoard,
  getTableOccupancy,
  holdTable,
  holdTableWithKysely,
  seatTable,
  seatTableWithKysely,
  releaseTable,
  ensureTableOccupancy,
  verifyTableExists,
} from "./service.js";
