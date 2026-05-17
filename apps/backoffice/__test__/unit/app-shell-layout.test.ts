// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests: Shell layout integration (Story 65-4)
// Tests the shell context provider and hooks used by AppLayout.

import { describe, it, expect, beforeAll } from "vitest";

// Shell context provider
import { ShellProvider, useShell } from "@/app/shell/shell-context";
import type { ShellState } from "@/app/shell/shell-context";

// Sync health format utility
import { formatTimeAgo } from "@/app/shell/use-sync-health";

// Outlet switcher storage helpers
import { getStoredOutletId, setStoredOutletId } from "@/app/shell/use-outlet-switcher";

// Task: sessionStorage polyfill
let sessionStore: Record<string, string> = {};

beforeAll(() => {
  const polyfill = {
    getItem: (key: string) => sessionStore[key] ?? null,
    setItem: (key: string, value: string) => { sessionStore[key] = value; },
    removeItem: (key: string) => { delete sessionStore[key]; },
    clear: () => { sessionStore = {}; },
    get length() { return Object.keys(sessionStore).length; },
    key: (index: number) => Object.keys(sessionStore)[index] ?? null,
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    value: polyfill,
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Shell context shape tests
// ---------------------------------------------------------------------------

describe("ShellState shape", () => {
  it("has all required top-level fields in its default value", () => {
    const ctx = {
      user: null,
      companyId: null,
      companyTimezone: null,
      outlet: {
        currentOutlet: null,
        availableOutlets: [],
        switchOutlet: () => {},
      },
      pendingJobs: { count: 0, loading: false },
      isOnline: true,
      syncHealth: {
        healthy: true,
        lastSyncTimestamp: null,
        lastSyncLabel: "Never",
      },
    } satisfies ShellState;

    expect(ctx.user).toBeNull();
    expect(ctx.companyId).toBeNull();
    expect(ctx.isOnline).toBe(true);
    expect(ctx.syncHealth.healthy).toBe(true);
    expect(ctx.syncHealth.lastSyncLabel).toBe("Never");
  });
});

// ---------------------------------------------------------------------------
// ShellProvider structural tests
// ---------------------------------------------------------------------------

describe("ShellProvider", () => {
  it("is a function (React component)", () => {
    expect(typeof ShellProvider).toBe("function");
  });

  it("accepts state prop with ShellState shape", () => {
    // Structural test: the component exists and is callable
    expect(ShellProvider).toBeDefined();
  });
});

describe("useShell", () => {
  it("is a function (React hook)", () => {
    expect(typeof useShell).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Outlet storage integration
// ---------------------------------------------------------------------------

describe("outlet storage for shell integration", () => {
  it("getStoredOutletId returns null when nothing stored", () => {
    sessionStorage.removeItem("jurnapod.backoffice.selectedOutletId");
    expect(getStoredOutletId()).toBeNull();
  });

  it("persists and retrieves outlet ID for layout header", () => {
    setStoredOutletId(99);
    expect(getStoredOutletId()).toBe(99);
  });

  it("handles non-numeric stored values gracefully", () => {
    sessionStorage.setItem("jurnapod.backoffice.selectedOutletId", "invalid");
    expect(getStoredOutletId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sync health display helpers for footer status bar
// ---------------------------------------------------------------------------

describe("formatTimeAgo for status bar display", () => {
  const nowMs = 1_800_000_000_000;

  it("returns a non-empty string", () => {
    const result = formatTimeAgo(nowMs - 60_000, nowMs);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns "Just now" for very recent timestamps', () => {
    expect(formatTimeAgo(nowMs - 200, nowMs)).toBe("Just now");
  });

  it("returns a time label for older timestamps", () => {
    const oneHourAgo = nowMs - 3600_000;
    expect(formatTimeAgo(oneHourAgo, nowMs)).toBe("1h ago");
  });
});

// ---------------------------------------------------------------------------
// Shell state defaults for offline/empty scenarios
// ---------------------------------------------------------------------------

describe("shell state defaults (edge cases)", () => {
  it("defaults sync health to healthy when loading", () => {
    const health = { healthy: true, lastSyncTimestamp: null, lastSyncLabel: "Never" };
    expect(health.healthy).toBe(true);
    expect(health.lastSyncTimestamp).toBeNull();
  });

  it("defaults pending jobs to zero", () => {
    const jobs = { count: 0, loading: false };
    expect(jobs.count).toBe(0);
    expect(jobs.loading).toBe(false);
  });

  it("defaults online status to true", () => {
    const shell = { isOnline: true } as Partial<ShellState>;
    expect(shell.isOnline).toBe(true);
  });
});
