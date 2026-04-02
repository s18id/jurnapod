// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions - Thin API Adapter
 *
 * Re-exports from sub-modules which delegate to @jurnapod/modules-reservations.
 * This module provides backward compatibility for API routes.
 */

// Re-export types and errors from types module
export * from "./types";

// Re-export session-utils (helpers, mappers, event logging)
export * from "./session-utils";

// Re-export lifecycle functions (getSession, listSessions, lockSessionForPayment, closeSession)
export * from "./lifecycle";

// Re-export line functions (addSessionLine, updateSessionLine, removeSessionLine)
export * from "./lines";

// Re-export checkpoint functions (finalizeSessionBatch, adjustSessionLine)
export * from "./checkpoint";