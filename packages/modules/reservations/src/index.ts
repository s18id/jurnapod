// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Modules Reservations Package
 *
 * Bootstrap package for reservation management with canonical timestamp contracts
 * and overlap rules.
 */

// Time model exports (canonical timestamp contracts, overlap rules, timezone resolution)
export * from "./time/index.js";

// Interface exports (service contracts, types)
export * from "./interfaces/index.js";

// Reservations domain module - re-export everything
export * from "./reservations/index.js";

// Table occupancy module - re-export everything
export * from "./table-occupancy/index.js";

// Outlet tables module - re-export everything
export * from "./outlet-tables/index.js";

// Service sessions module - re-export everything
export * from "./service-sessions/index.js";

// Table sync module - re-export everything
export * from "./table-sync/index.js";

// Reservation groups module - re-export everything
export * from "./reservation-groups/index.js";

// Module type marker
export type ReservationsModuleStub = "reservations";
