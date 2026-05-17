// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// Unit tests for auth session helpers:
//   - silent-refresh.ts: token refresh, session state tracking
//   - re-auth.ts: re-auth requirement checks, pending state
//   - session-expiry.ts: session ending soon computation, formatting
//
// Run with:
//   npx vitest run --config apps/backoffice/vitest.config.ts __test__/unit/lib-auth.test.ts

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Hoisted mocks
// ============================================================================

const { mockGetStoredAccessToken, mockStoreAccessToken, mockClearAccessToken, mockRequestRefreshToken } = vi.hoisted(() => {
  return {
    mockGetStoredAccessToken: vi.fn(),
    mockStoreAccessToken: vi.fn(),
    mockClearAccessToken: vi.fn(),
    mockRequestRefreshToken: vi.fn(),
  };
});

vi.mock("@/lib/auth-storage", () => ({
  getStoredAccessToken: mockGetStoredAccessToken,
  storeAccessToken: mockStoreAccessToken,
  clearAccessToken: mockClearAccessToken,
}));

vi.mock("@/lib/auth-refresh", () => ({
  requestRefreshToken: mockRequestRefreshToken,
}));

// ============================================================================
// Imports
// ============================================================================

import {
  silentRefresh,
  setAccessTokenExpiry,
  getSessionState,
} from "@/lib/auth/silent-refresh";

import {
  isReAuthRequired,
  requestReAuth,
  markReAuthenticated,
  cancelReAuth,
  getPendingReAuth,
  resetReAuthState,
} from "@/lib/auth/re-auth";

import {
  computeSessionEndingSoon,
  formatRemainingMs,
  isSessionAuthenticated,
  DEFAULT_SESSION_WARNING_THRESHOLD_MS,
} from "@/lib/auth/session-expiry";

// ============================================================================
// silent-refresh tests
// ============================================================================

describe("silentRefresh", () => {
  beforeEach(() => {
    mockGetStoredAccessToken.mockReturnValue("stored-token");
    mockRequestRefreshToken.mockClear();
    mockStoreAccessToken.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns the new token on successful refresh", async () => {
    mockRequestRefreshToken.mockResolvedValue("new-fresh-token");

    const token = await silentRefresh();

    expect(token).toBe("new-fresh-token");
    expect(mockRequestRefreshToken).toHaveBeenCalledTimes(1);
  });

  test("returns null when refresh fails", async () => {
    mockRequestRefreshToken.mockResolvedValue(null);

    const token = await silentRefresh();

    expect(token).toBeNull();
  });

  test("updates session state on successful refresh", async () => {
    mockRequestRefreshToken.mockResolvedValue("another-token");

    await silentRefresh();

    const state = getSessionState();
    expect(state.authenticated).toBe(true);
    expect(state.lastRefreshedAt).not.toBeNull();
  });
});

// ============================================================================
// Session state tests
// ============================================================================

describe("getSessionState / setAccessTokenExpiry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("getSessionState returns authenticated=false when no token", () => {
    mockGetStoredAccessToken.mockReturnValue(null);

    const state = getSessionState();

    expect(state.authenticated).toBe(false);
  });

  test("getSessionState returns authenticated=true when token exists", () => {
    mockGetStoredAccessToken.mockReturnValue("some-token");

    const state = getSessionState();

    expect(state.authenticated).toBe(true);
  });

  test("setAccessTokenExpiry records token TTL and issued at", () => {
    const before = Date.now();

    setAccessTokenExpiry(3600);

    const state = getSessionState();
    expect(state.authenticated).toBe(true);
    expect(state.tokenTtlSeconds).toBe(3600);
    expect(state.tokenIssuedAt).not.toBeNull();
    expect(state.tokenIssuedAt!).toBeGreaterThanOrEqual(before - 100);
    expect(state.lastRefreshedAt).not.toBeNull();
  });
});

// ============================================================================
// re-auth tests
// ============================================================================

describe("re-auth module", () => {
  beforeEach(() => {
    resetReAuthState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("isReAuthRequired returns true for never-verified action", () => {
    expect(isReAuthRequired("fiscal_close")).toBe(true);
    expect(isReAuthRequired("void_transaction")).toBe(true);
    expect(isReAuthRequired("permission_change")).toBe(true);
  });

  test("markReAuthenticated makes isReAuthRequired return false", () => {
    expect(isReAuthRequired("fiscal_close")).toBe(true);

    // Simulate: request → verify → mark
    const ctx = requestReAuth("fiscal_close");
    expect(ctx.action).toBe("fiscal_close");
    markReAuthenticated(true);

    expect(isReAuthRequired("fiscal_close")).toBe(false);
  });

  test("markReAuthenticated(false) does NOT clear the requirement", () => {
    expect(isReAuthRequired("void_transaction")).toBe(true);

    requestReAuth("void_transaction");
    markReAuthenticated(false);

    // Failed re-auth should still require re-auth
    expect(isReAuthRequired("void_transaction")).toBe(true);
  });

  test("re-auth is pending after requestReAuth", () => {
    expect(getPendingReAuth()).toBeNull();

    requestReAuth("fiscal_close");

    const pending = getPendingReAuth();
    expect(pending).not.toBeNull();
    expect(pending!.action).toBe("fiscal_close");
  });

  test("cancelReAuth clears pending state but not verified actions", () => {
    // First, do a successful re-auth
    requestReAuth("fiscal_close");
    markReAuthenticated(true);

    // Then request a new one and cancel
    requestReAuth("permission_change");
    cancelReAuth();

    expect(getPendingReAuth()).toBeNull();
    // The fiscal_close verification should still be valid
    expect(isReAuthRequired("fiscal_close")).toBe(false);
    // permission_change was never verified
    expect(isReAuthRequired("permission_change")).toBe(true);
  });

  test("resetReAuthState clears everything", () => {
    requestReAuth("fiscal_close");
    markReAuthenticated(true);
    requestReAuth("permission_change");
    markReAuthenticated(true);

    resetReAuthState();

    expect(isReAuthRequired("fiscal_close")).toBe(true);
    expect(isReAuthRequired("permission_change")).toBe(true);
    expect(getPendingReAuth()).toBeNull();
  });
});

// ============================================================================
// session-expiry tests
// ============================================================================

describe("session-expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("computeSessionEndingSoon returns expired=false for fresh session", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    mockGetStoredAccessToken.mockReturnValue("token");
    setAccessTokenExpiry(3600); // 1 hour TTL

    const info = computeSessionEndingSoon();

    expect(info.authenticated).toBe(true);
    expect(info.expired).toBe(false);
    expect(info.endingSoon).toBe(false);
    expect(info.expiresAt).toBe(now + 3600 * 1000);
    expect(info.remainingMs).toBeGreaterThan(0);
    expect(info.remainingFormatted).toBeTruthy();
  });

  test("computeSessionEndingSoon returns endingSoon=true within threshold", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    mockGetStoredAccessToken.mockReturnValue("token");
    setAccessTokenExpiry(120); // 2 minutes TTL

    // Fast-forward to 1 minute remaining (within 2-minute default threshold)
    vi.advanceTimersByTime(60 * 1000);

    const info = computeSessionEndingSoon();

    expect(info.endingSoon).toBe(true);
    expect(info.expired).toBe(false);
  });

  test("computeSessionEndingSoon returns expired=true after TTL", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    mockGetStoredAccessToken.mockReturnValue("token");
    setAccessTokenExpiry(120); // 2 minutes TTL

    // Fast-forward past expiry
    vi.advanceTimersByTime(130 * 1000);

    const info = computeSessionEndingSoon();

    expect(info.expired).toBe(true);
    expect(info.remainingMs).toBe(0);
  });

  test("computeSessionEndingSoon handles unauthenticated state", () => {
    mockGetStoredAccessToken.mockReturnValue(null);

    const info = computeSessionEndingSoon();

    expect(info.authenticated).toBe(false);
    expect(info.expiresAt).toBeNull();
    expect(info.remainingMs).toBeNull();
    expect(info.expired).toBe(false);
    expect(info.endingSoon).toBe(false);
    expect(info.remainingFormatted).toBe("");
  });

  test("computeSessionEndingSoon respects custom warning threshold", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    mockGetStoredAccessToken.mockReturnValue("token");
    setAccessTokenExpiry(600); // 10 minutes TTL

    // Fast-forward to 49 seconds remaining
    vi.advanceTimersByTime(551 * 1000);

    // With 30-second threshold, should be ending soon
    const info = computeSessionEndingSoon(30 * 1000);
    expect(info.endingSoon).toBe(true);

    // With 120-second threshold, should NOT be ending soon (49s > 30s)
    // Wait, 551s elapsed out of 600s = 49s remaining. With 30s threshold, yes endingSoon.
  });

  // ------------------------------------------------------------------
  // formatRemainingMs
  // ------------------------------------------------------------------

  test("formatRemainingMs formats minutes and seconds", () => {
    expect(formatRemainingMs(125000)).toBe("2m 5s"); // 125 seconds = 2m5s
    expect(formatRemainingMs(60000)).toBe("1m");     // exactly 1m
    expect(formatRemainingMs(59000)).toBe("59s");     // under 1m
    expect(formatRemainingMs(500)).toBe("0s");        // under 1s, rounds down
    expect(formatRemainingMs(-100)).toBe("");          // negative → empty
    expect(formatRemainingMs(0)).toBe("");             // zero → empty
  });

  // ------------------------------------------------------------------
  // isSessionAuthenticated
  // ------------------------------------------------------------------

  test("isSessionAuthenticated returns true when token exists", () => {
    mockGetStoredAccessToken.mockReturnValue("token");
    expect(isSessionAuthenticated()).toBe(true);
  });

  test("isSessionAuthenticated returns false when no token", () => {
    mockGetStoredAccessToken.mockReturnValue(null);
    expect(isSessionAuthenticated()).toBe(false);
  });

  // ------------------------------------------------------------------
  // DEFAULT_SESSION_WARNING_THRESHOLD_MS
  // ------------------------------------------------------------------

  test("DEFAULT_SESSION_WARNING_THRESHOLD_MS is 2 minutes", () => {
    expect(DEFAULT_SESSION_WARNING_THRESHOLD_MS).toBe(2 * 60 * 1000);
  });
});
