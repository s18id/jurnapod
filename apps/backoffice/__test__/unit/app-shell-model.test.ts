// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests: Shell model / navigation filtering / permission utils (Story 65-4)

import { describe, it, expect, beforeAll } from "vitest";

import {
  PERMISSION_BITS,
  hasMinimumPermission,
  userSatisfiesPermission,
  filterNavigation,
} from "@/app/shell/use-nav-filtering";
import type { UserPermissionEntry, NavPermissionRequirement } from "@/app/shell/use-nav-filtering";

import { getStoredOutletId, setStoredOutletId } from "@/app/shell/use-outlet-switcher";

import { formatTimeAgo } from "@/app/shell/use-sync-health";

import type { AppRoute } from "@/app/routes";

// ---------------------------------------------------------------------------
// sessionStorage polyfill for Node test environment
// ---------------------------------------------------------------------------

let sessionStore: Record<string, string> = {};

beforeAll(() => {
  // Minimal sessionStorage polyfill
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
// Permission bit tests
// ---------------------------------------------------------------------------

describe("PERMISSION_BITS", () => {
  it("has canonical bit values matching Epic 39 spec", () => {
    expect(PERMISSION_BITS.READ).toBe(1);
    expect(PERMISSION_BITS.CREATE).toBe(2);
    expect(PERMISSION_BITS.UPDATE).toBe(4);
    expect(PERMISSION_BITS.DELETE).toBe(8);
    expect(PERMISSION_BITS.ANALYZE).toBe(16);
    expect(PERMISSION_BITS.MANAGE).toBe(32);
  });
});

describe("hasMinimumPermission", () => {
  it("returns true when mask exactly equals requirement", () => {
    expect(hasMinimumPermission(15, 15)).toBe(true);
  });

  it("returns true when mask includes extra bits", () => {
    expect(hasMinimumPermission(63, 1)).toBe(true);
    expect(hasMinimumPermission(63, 15)).toBe(true);
  });

  it("returns false when mask lacks required bits", () => {
    expect(hasMinimumPermission(1, 2)).toBe(false);
    expect(hasMinimumPermission(15, 32)).toBe(false);
  });

  it("returns true for zero requirement", () => {
    expect(hasMinimumPermission(0, 0)).toBe(true);
    expect(hasMinimumPermission(63, 0)).toBe(true);
  });

  it("returns false when mask has partial overlap but not all required bits", () => {
    expect(hasMinimumPermission(3, 5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// User permission satisfaction tests
// ---------------------------------------------------------------------------

describe("userSatisfiesPermission", () => {
  const permissions: UserPermissionEntry[] = [
    { module: "inventory", resource: "items", mask: 15 },
    { module: "accounting", resource: "journals", mask: 31 },
    { module: "platform", resource: "*", mask: 63 },
  ];

  it("satisfies exact resource requirement", () => {
    const req: NavPermissionRequirement = { module: "inventory", resource: "items", permissionMask: 1 };
    expect(userSatisfiesPermission(permissions, req)).toBe(true);
  });

  it("satisfies wildcard resource", () => {
    const req: NavPermissionRequirement = { module: "platform", resource: "users", permissionMask: 4 };
    expect(userSatisfiesPermission(permissions, req)).toBe(true);
  });

  it("rejects when module doesn't match", () => {
    const req: NavPermissionRequirement = { module: "pos", resource: "transactions", permissionMask: 1 };
    expect(userSatisfiesPermission(permissions, req)).toBe(false);
  });

  it("rejects when resource doesn't match", () => {
    const req: NavPermissionRequirement = { module: "inventory", resource: "costing", permissionMask: 1 };
    expect(userSatisfiesPermission(permissions, req)).toBe(false);
  });

  it("rejects when mask is insufficient", () => {
    const req: NavPermissionRequirement = { module: "inventory", resource: "items", permissionMask: 32 };
    expect(userSatisfiesPermission(permissions, req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Navigation filtering tests
// ---------------------------------------------------------------------------

describe("filterNavigation", () => {
  const testRoutes: AppRoute[] = [
    { path: "/daily-sales", label: "Daily Sales", allowedRoles: ["OWNER", "ADMIN"] },
    { path: "/items", label: "Items", allowedRoles: ["OWNER", "ADMIN"], requiredModule: "inventory" },
    { path: "/users", label: "Users", allowedRoles: ["SUPER_ADMIN"] },
    { path: "/pos-transactions", label: "POS Tx", allowedRoles: ["OWNER"], requiredModule: "pos" },
  ];

  it("filters routes by role when all modules are enabled", () => {
    // OWNER can access daily-sales, items, pos-transactions (not users which needs SUPER_ADMIN)
    const result = filterNavigation(testRoutes, ["OWNER"], [], { inventory: true, pos: true });
    expect(result.visibleRoutes.length).toBe(3);
    expect(result.visibleRoutes.map((r) => r.path)).toEqual([
      "/daily-sales",
      "/items",
      "/pos-transactions",
    ]);
  });

  it("filters routes by module enablement", () => {
    // With inventory and pos disabled, only daily-sales remains for OWNER
    const result = filterNavigation(
      testRoutes,
      ["OWNER"],
      [],
      { inventory: false, pos: false },
    );
    expect(result.visibleRoutes.length).toBe(1);
    expect(result.visibleRoutes[0].path).toBe("/daily-sales");
  });

  it("tracks hidden count", () => {
    const result = filterNavigation(testRoutes, ["CASHIER"], [], {});
    expect(result.hiddenCount).toBe(4);
    expect(result.visibleRoutes.length).toBe(0);
  });

  it("reports ready when modules are loaded", () => {
    const result = filterNavigation(testRoutes, ["OWNER"], [], { inventory: true });
    expect(result.ready).toBe(true);
  });

  it("reports not ready when modules are empty", () => {
    const result = filterNavigation(testRoutes, ["OWNER"], [], {});
    expect(result.ready).toBe(false);
  });

  it("filters routes by resource permission metadata when permissions are available", () => {
    const permissionRoutes = [
      testRoutes[0],
      {
        ...testRoutes[1],
        permission: { module: "inventory", resource: "items", permissionMask: PERMISSION_BITS.READ },
      },
      {
        ...testRoutes[3],
        permission: { module: "pos", resource: "transactions", permissionMask: PERMISSION_BITS.READ },
      },
    ] as readonly (AppRoute & { permission?: NavPermissionRequirement })[];

    const result = filterNavigation(
      permissionRoutes,
      ["OWNER"],
      [],
      { inventory: true, pos: true },
      [{ module: "inventory", resource: "items", mask: PERMISSION_BITS.READ }],
    );

    expect(result.visibleRoutes.map((route) => route.path)).toEqual(["/daily-sales", "/items"]);
  });
});

// ---------------------------------------------------------------------------
// Outlet switcher model tests
// ---------------------------------------------------------------------------

describe("getStoredOutletId / setStoredOutletId", () => {
  it("returns null when no outlet is stored", () => {
    sessionStorage.removeItem("jurnapod.backoffice.selectedOutletId");
    expect(getStoredOutletId()).toBeNull();
  });

  it("persists and retrieves outlet ID", () => {
    setStoredOutletId(42);
    expect(getStoredOutletId()).toBe(42);
  });

  it("clears when removed", () => {
    setStoredOutletId(42);
    sessionStorage.removeItem("jurnapod.backoffice.selectedOutletId");
    expect(getStoredOutletId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sync health formatTimeAgo tests
// ---------------------------------------------------------------------------

describe("formatTimeAgo", () => {
  const nowMs = 1_800_000_000_000;

  it('returns "Just now" for recent timestamps', () => {
    expect(formatTimeAgo(nowMs - 10_000, nowMs)).toBe("Just now");
  });

  it('returns minutes for < 1 hour', () => {
    expect(formatTimeAgo(nowMs - 5 * 60_000, nowMs)).toBe("5m ago");
  });

  it('returns hours for < 24 hours', () => {
    expect(formatTimeAgo(nowMs - 2 * 3600_000, nowMs)).toBe("2h ago");
  });

  it('returns days for >= 24 hours', () => {
    expect(formatTimeAgo(nowMs - 3 * 86400_000, nowMs)).toBe("3d ago");
  });
});
