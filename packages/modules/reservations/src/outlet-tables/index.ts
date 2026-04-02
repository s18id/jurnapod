// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Outlet Tables Module
 *
 * Exports all outlet table-related types and operations.
 */

// Types and errors
export * from "./types.js";

// Service operations
export {
  listOutletTablesByOutlet,
  getOutletTable,
  createOutletTable,
  createOutletTablesBulk,
  updateOutletTable,
  deleteOutletTable,
} from "./service.js";
