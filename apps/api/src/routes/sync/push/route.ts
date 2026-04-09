// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Route - HTTP Thin Layer
 * 
 * This file is the HTTP thin layer for sync push endpoint.
 * It handles only HTTP concerns: routing, auth, request parsing, response shaping.
 * All business logic is delegated to lib/sync/push/.
 * 
 * NOTE: This file is part of the Option A (Route + Lib) refactoring.
 * The full extraction of business logic to lib/sync/push/ is tracked in Story 2.1.
 * For now, this file imports and re-exports from the main push.ts to maintain
 * the current behavior while establishing the layered structure.
 */

// Re-export the syncPushRoutes and registration function from the main push.ts
export { syncPushRoutes, registerSyncPushRoutes } from "../push.js";
