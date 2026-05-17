// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Silent token refresh — deduplicated concurrent refresh with structured
// return type. Delegates to the canonical requestRefreshToken() from
// lib/auth-refresh.ts.
//
// Also tracks session state so other modules can query token expiry.

import { requestRefreshToken } from "@/lib/auth-refresh";
import { getStoredAccessToken } from "@/lib/auth-storage";

// ---------------------------------------------------------------------------
// Session state tracking (in-memory, no PII logged)
// ---------------------------------------------------------------------------

export interface SessionState {
  /** Whether the session is currently authenticated (has a token) */
  authenticated: boolean;
  /** Epoch milliseconds when the access token was issued */
  tokenIssuedAt: number | null;
  /** Token TTL in seconds (from login/refresh response) */
  tokenTtlSeconds: number | null;
  /** Epoch milliseconds when the session was last actively refreshed */
  lastRefreshedAt: number | null;
}

let _sessionState: SessionState = {
  authenticated: false,
  tokenIssuedAt: null,
  tokenTtlSeconds: null,
  lastRefreshedAt: null,
};

/**
 * Get the current in-memory session state (zero PII).
 */
export function getSessionState(): Readonly<SessionState> {
  // Refresh the authenticated flag from storage
  _sessionState.authenticated = getStoredAccessToken() !== null;
  return _sessionState;
}

/**
 * Call after login or refresh to record token expiry metadata.
 * tokenTtlSeconds comes from the `expires_in` field in the auth response.
 */
export function setAccessTokenExpiry(tokenTtlSeconds: number): void {
  const now = Date.now();
  _sessionState = {
    authenticated: true,
    tokenIssuedAt: now,
    tokenTtlSeconds,
    lastRefreshedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Silent refresh wrapper
// ---------------------------------------------------------------------------

/**
 * Silently refresh the access token using the httpOnly refresh cookie.
 *
 * - Deduplicates concurrent refresh calls (only one in-flight at a time).
 * - Returns the new token on success, null on failure.
 * - Updates session state tracking on success.
 * - Never logs tokens.
 */
export async function silentRefresh(): Promise<string | null> {
  const token = await requestRefreshToken();

  if (token) {
    // Success — the underlying requestRefreshToken already called storeAccessToken.
    const now = Date.now();
    _sessionState = {
      authenticated: true,
      tokenIssuedAt: now,
      // Preserve TTL (refresh response includes new expires_in; the underlying
      // function doesn't currently pass it through. We conservatively keep the
      // existing TTL or use a reasonable default.)
      tokenTtlSeconds: _sessionState.tokenTtlSeconds ?? 3600,
      lastRefreshedAt: now,
    };
  } else {
    _sessionState.authenticated = getStoredAccessToken() !== null;
  }

  return token;
}
