// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Auth session model: silent token refresh, foreground re-auth trigger, and
// session-expiry affordances.
//
// All helpers MUST NOT log tokens or PII.

export { silentRefresh, setAccessTokenExpiry, getSessionState, type SessionState } from "./silent-refresh";
export { requestReAuth, isReAuthRequired, markReAuthenticated, type ReAuthContext } from "./re-auth";
export { computeSessionEndingSoon, DEFAULT_SESSION_WARNING_THRESHOLD_MS, type SessionExpiryInfo } from "./session-expiry";

// Re-export existing auth utilities for convenience
export { getStoredAccessToken, storeAccessToken, clearAccessToken } from "@/lib/auth-storage";
export { requestRefreshToken } from "@/lib/auth-refresh";
