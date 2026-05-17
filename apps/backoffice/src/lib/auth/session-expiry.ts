// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Session expiry affordance helpers.
//
// Provides utilities to compute when the session will end and whether to
// display a "session ending soon" banner. These helpers are pure functions
// (no side effects, no DB) and are safe to call at any lifecycle point.
//
// Token lifetime is tracked via the session state in silent-refresh.ts.
// The expiry time is estimated as: tokenIssuedAt + (tokenTtlSeconds * 1000).

import { getSessionState } from "./silent-refresh";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default warning threshold: show "session ending soon" banner 2 minutes
 * before the access token expires. Configurable per deployment.
 */
export const DEFAULT_SESSION_WARNING_THRESHOLD_MS = 2 * 60 * 1000;

/**
 * Clock skew buffer: assume the client clock may be up to 30 seconds behind
 * the server. We subtract this to avoid false positives from clock drift.
 */
const CLOCK_SKEW_BUFFER_MS = 30 * 1000;

// ---------------------------------------------------------------------------
// SessionExpiryInfo
// ---------------------------------------------------------------------------

export interface SessionExpiryInfo {
  /** Whether the session is authenticated */
  authenticated: boolean;
  /** Epoch ms when the access token expires (estimated) */
  expiresAt: number | null;
  /** Milliseconds remaining until expiry (negative if already expired) */
  remainingMs: number | null;
  /** Whether the session has already expired */
  expired: boolean;
  /** Whether the session is within the warning threshold */
  endingSoon: boolean;
  /** Human-readable string like "1m 30s" or "" if not applicable */
  remainingFormatted: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Compute session expiry information based on the current session state.
 *
 * @param warningThresholdMs — How far ahead to trigger "ending soon".
 *   Defaults to DEFAULT_SESSION_WARNING_THRESHOLD_MS (2 minutes).
 */
export function computeSessionEndingSoon(
  warningThresholdMs: number = DEFAULT_SESSION_WARNING_THRESHOLD_MS,
): SessionExpiryInfo {
  const state = getSessionState();

  if (!state.authenticated || state.tokenIssuedAt === null || state.tokenTtlSeconds === null) {
    return {
      authenticated: false,
      expiresAt: null,
      remainingMs: null,
      expired: false,
      endingSoon: false,
      remainingFormatted: "",
    };
  }

  const expiresAt = state.tokenIssuedAt + state.tokenTtlSeconds * 1000;
  const remainingMs = expiresAt - Date.now() - CLOCK_SKEW_BUFFER_MS;
  const expired = remainingMs <= 0;
  const endingSoon = !expired && remainingMs <= warningThresholdMs;

  return {
    authenticated: true,
    expiresAt,
    remainingMs: Math.max(0, remainingMs),
    expired,
    endingSoon,
    remainingFormatted: formatRemainingMs(remainingMs),
  };
}

/**
 * Format remaining milliseconds into a human-readable string like "2m 30s".
 * Returns "" for negative or zero values.
 */
export function formatRemainingMs(remainingMs: number): string {
  if (remainingMs <= 0) {
    return "";
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Check if a session is currently authenticated (has a stored access token).
 * Convenience wrapper around getSessionState().
 */
export function isSessionAuthenticated(): boolean {
  return getSessionState().authenticated;
}
