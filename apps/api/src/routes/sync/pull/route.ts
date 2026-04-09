// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Pull Route - HTTP Thin Layer
 * 
 * This file is the HTTP thin layer for sync pull endpoint.
 * It handles only HTTP concerns: routing, auth, request parsing, response shaping.
 * All business logic is delegated to lib/sync/pull/.
 * 
 * NOTE: This file is part of the Option A (Route + Lib) refactoring.
 * The structure is established here - full wiring is a follow-up.
 */

// Re-export the syncPullRoutes and registration function from the main pull.ts
export { syncPullRoutes, registerSyncPullRoutes } from "../pull.js";
