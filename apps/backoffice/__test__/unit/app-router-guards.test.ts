// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests: Router guard helpers and hash redirect mapping (Story 65-5)

import { describe, it, expect } from "vitest";

// We test pure functions directly; they have no React/DB dependencies
import {
  checkAuth,
  checkRouteAccess,
  checkResourcePermission,
  createPermissionGuard,
} from "@/app/router/guards";

import {
  resolveLegacyHash,
  isLegacyHash,
  buildHashRedirect,
  LEGACY_HASH_REDIRECTS,
} from "@/app/router/hash-redirect";

import { HASH_TO_V6_ROUTE, getV6RedirectForHash, ROUTE_PATHS } from "@/app/router/routes";

import type { AppRoute } from "@/app/routes";
import type { UserPermissionEntry } from "@/app/shell/use-nav-filtering";

// ---------------------------------------------------------------------------
// Auth guard tests
// ---------------------------------------------------------------------------

describe("checkAuth", () => {
  it("returns authenticated true when access token is present", () => {
    const result = checkAuth("valid-token");
    expect(result.authenticated).toBe(true);
  });

  it("returns authenticated false when access token is null", () => {
    const result = checkAuth(null);
    expect(result.authenticated).toBe(false);
  });

  it("returns authenticated false when access token is empty string", () => {
    const result = checkAuth("");
    expect(result.authenticated).toBe(false);
  });

  it("includes return URL in redirect path", () => {
    const result = checkAuth(null);
    expect(result.redirectTo).toContain("/login?return=");
  });
});

// ---------------------------------------------------------------------------
// Route access check tests
// ---------------------------------------------------------------------------

describe("checkRouteAccess", () => {
  const testRoute: AppRoute = {
    path: "/items",
    label: "Items",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN"],
    requiredModule: "inventory",
  };

  it("allows access when user has the required role", () => {
    const result = checkRouteAccess(
      testRoute,
      ["OWNER"],
      [],
      { inventory: true },
    );
    expect(result.allowed).toBe(true);
  });

  it("denies access when user lacks the required role", () => {
    const result = checkRouteAccess(
      testRoute,
      ["CASHIER"],
      [],
      { inventory: true },
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not authorized");
  });

  it("denies access when required module is not enabled", () => {
    const result = checkRouteAccess(
      testRoute,
      ["OWNER"],
      [],
      { inventory: false },
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not enabled");
  });

  it("denies access when route is null", () => {
    const result = checkRouteAccess(null, ["OWNER"], [], {});
    expect(result.allowed).toBe(false);
  });

  it("allows access through global role", () => {
    const route: AppRoute = {
      path: "/users",
      label: "Users",
      allowedRoles: ["SUPER_ADMIN"],
    };
    const result = checkRouteAccess(route, [], ["SUPER_ADMIN"], {});
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Resource permission check tests
// ---------------------------------------------------------------------------

describe("checkResourcePermission", () => {
  const permissions: UserPermissionEntry[] = [
    { module: "inventory", resource: "items", mask: 15 }, // CRUD
    { module: "accounting", resource: "journals", mask: 1 }, // READ only
    { module: "platform", resource: "*", mask: 63 }, // CRUDAM
  ];

  it("allows access when user has sufficient permission mask", () => {
    const result = checkResourcePermission(permissions, {
      module: "inventory",
      resource: "items",
      permissionMask: 1, // READ
    });
    expect(result.allowed).toBe(true);
  });

  it("denies access when user lacks the resource", () => {
    const result = checkResourcePermission(permissions, {
      module: "inventory",
      resource: "costing",
      permissionMask: 1,
    });
    expect(result.allowed).toBe(false);
  });

  it("denies access when user has insufficient mask", () => {
    const result = checkResourcePermission(permissions, {
      module: "accounting",
      resource: "journals",
      permissionMask: 2, // CREATE — user only has READ=1
    });
    expect(result.allowed).toBe(false);
  });

  it("matches wildcard resource", () => {
    const result = checkResourcePermission(permissions, {
      module: "platform",
      resource: "users",
      permissionMask: 32, // MANAGE
    });
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Permission guard factory tests
// ---------------------------------------------------------------------------

describe("createPermissionGuard", () => {
  const testRoute: AppRoute = {
    path: "/items",
    label: "Items",
    allowedRoles: ["OWNER"],
    requiredModule: "inventory",
  };

  it("returns allowed when authenticated and authorized", () => {
    const guard = createPermissionGuard("token", testRoute, ["OWNER"], [], { inventory: true });
    expect(guard().allowed).toBe(true);
  });

  it("returns redirect when not authenticated", () => {
    const guard = createPermissionGuard(null, testRoute, ["OWNER"], [], { inventory: true });
    const result = guard();
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.redirectTo).toContain("/login");
    }
  });

  it("returns redirect when not authorized", () => {
    const guard = createPermissionGuard("token", testRoute, ["CASHIER"], [], { inventory: true });
    const result = guard();
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.redirectTo).toBe("/items"); // safe fallback
    }
  });
});

// ---------------------------------------------------------------------------
// Hash redirect tests
// ---------------------------------------------------------------------------

describe("resolveLegacyHash", () => {
  it("redirects legacy items-prices hash", () => {
    expect(resolveLegacyHash("#/items-prices")).toBe("/items");
    expect(resolveLegacyHash("/items-prices")).toBe("/items");
  });

  it("redirects feature-flags hash", () => {
    expect(resolveLegacyHash("#/feature-flags")).toBe("/modules");
  });

  it("redirects feature-settings hash", () => {
    expect(resolveLegacyHash("#/feature-settings")).toBe("/outlet-settings");
  });

  it("returns null for unknown legacy hash", () => {
    expect(resolveLegacyHash("#/nonexistent-route")).toBeNull();
  });

  it("passes through existing valid routes", () => {
    expect(resolveLegacyHash("#/items")).toBe("/items");
    expect(resolveLegacyHash("#/users")).toBe("/users");
  });
});

describe("isLegacyHash", () => {
  it("returns true for known legacy hashes", () => {
    expect(isLegacyHash("#/items-prices")).toBe(true);
    expect(isLegacyHash("#/feature-flags")).toBe(true);
  });

  it("returns false for current routes", () => {
    expect(isLegacyHash("#/items")).toBe(false);
    expect(isLegacyHash("#/unknown")).toBe(false);
  });
});

describe("buildHashRedirect", () => {
  it("builds a hash URL from a v6 path", () => {
    expect(buildHashRedirect("/items")).toBe("#/items");
  });
});

describe("getV6RedirectForHash", () => {
  it("finds redirect for legacy hash", () => {
    expect(getV6RedirectForHash("#/items-prices")).toBe("/items");
  });
});

describe("LEGACY_HASH_REDIRECTS", () => {
  it("covers all expected legacy paths", () => {
    expect(LEGACY_HASH_REDIRECTS).toHaveProperty("#/items-prices");
    expect(LEGACY_HASH_REDIRECTS).toHaveProperty("#/feature-flags");
    expect(LEGACY_HASH_REDIRECTS).toHaveProperty("#/feature-settings");
    expect(LEGACY_HASH_REDIRECTS["#/items-prices"]).toBe("/items");
  });
});

// ---------------------------------------------------------------------------
// Route constants tests
// ---------------------------------------------------------------------------

describe("ROUTE_PATHS", () => {
  it("includes all expected path constants", () => {
    expect(ROUTE_PATHS.LOGIN).toBe("/login");
    expect(ROUTE_PATHS.ITEMS).toBe("/items");
    expect(ROUTE_PATHS.USERS).toBe("/users");
    expect(ROUTE_PATHS.COMPANIES).toBe("/companies");
    expect(ROUTE_PATHS.NOT_FOUND).toBe("*");
  });
});

describe("HASH_TO_V6_ROUTE", () => {
  it("maps all legacy hashes to canonical paths", () => {
    expect(HASH_TO_V6_ROUTE["#/items-prices"]).toBe("/items");
    expect(HASH_TO_V6_ROUTE["#/feature-flags"]).toBe("/modules");
  });
});
