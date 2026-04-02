// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Modules Inventory Package
 * 
 * Bootstrap package providing company/outlet scoped service entrypoints
 * for item, item-group, item-price, and item-variant domain operations.
 * 
 * All service methods require company_id as a fundamental scoping invariant.
 * Item prices additionally require outlet_id scoping for outlet-specific pricing.
 */

// Re-export all interfaces
export * from "./interfaces/index.js";

// Re-export all services (actual implementations)
export * from "./services/index.js";

// Re-export error classes
export * from "./errors.js";