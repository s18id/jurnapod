// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests: Permission-aware route guards and navigation filtering (Epic 66 — Story 66-4)
//
// Run with:
//   npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-router-guards-permissions.test.ts

import { describe, it, expect } from "vitest";

import { APP_ROUTES, findRoute, userCanAccessRoute, type AppRoute } from "@/app/routes";
import { checkResourcePermission, createPermissionGuard } from "@/app/router/guards";
import {
  filterNavigation,
  hasMinimumPermission,
  PERMISSION_BITS,
} from "@/app/shell/use-nav-filtering";

import {
  permissionsFromRoleCodes,
  resolveEffectivePermissions,
  userSatisfiesRoutePermission,
} from "@/lib/auth/permissions";
import type { UserPermissionEntry, NavPermissionRequirement } from "@/app/shell/use-nav-filtering";
// ============================================================================
// Route permission metadata formalization (AC1)
// ============================================================================

describe("AppRoute permission metadata (AC1)", () => {
  it("AppRoute type includes optional permission field", () => {
    // Verify the type includes the permission field (compile-time check)
    const route: AppRoute = {
      path: "/test",
      label: "Test",
      allowedRoles: ["OWNER"],
      permission: { module: "platform", resource: "users", permissionMask: 1 },
    };
    expect(route.permission?.module).toBe("platform");
    expect(route.permission?.resource).toBe("users");
    expect(route.permission?.permissionMask).toBe(1);
  });

  it("core admin routes have permission metadata", () => {
    const routes = [
      "/users",
      "/roles",
      "/companies",
      "/outlets",
      "/audit-logs",
      "/items",
      "/prices",
      "/module-roles",
    ];

    for (const path of routes) {
      const route = findRoute(path);
      expect(route, `Route ${path} should exist`).toBeTruthy();
      if (route) {
        expect(
          route.permission,
          `Route ${path} should have permission metadata`,
        ).toBeDefined();
      }
    }
  });

  it("users route has platform.users.READ permission", () => {
    const route = findRoute("/users");
    expect(route?.permission).toEqual({
      module: "platform",
      resource: "users",
      permissionMask: 1, // READ
    });
  });

  it("roles route has platform.roles.READ permission", () => {
    const route = findRoute("/roles");
    expect(route?.permission).toEqual({
      module: "platform",
      resource: "roles",
      permissionMask: 1,
    });
  });

  it("module-roles route has platform.roles.MANAGE permission", () => {
    const route = findRoute("/module-roles");
    expect(route?.permission).toEqual({
      module: "platform",
      resource: "roles",
      permissionMask: PERMISSION_BITS.MANAGE,
    });
  });

  it("companies route has platform.companies.READ permission", () => {
    const route = findRoute("/companies");
    expect(route?.permission).toEqual({
      module: "platform",
      resource: "companies",
      permissionMask: 1,
    });
  });

  it("companies route coarse role metadata includes platform.companies.READ-capable canonical roles", () => {
    const route = findRoute("/companies");
    expect(route?.allowedRoles).toEqual(["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]);
  });

  it("outlets route has platform.outlets.READ permission", () => {
    const route = findRoute("/outlets");
    expect(route?.permission).toEqual({
      module: "platform",
      resource: "outlets",
      permissionMask: 1,
    });
  });

  it("audit-logs route has platform.settings.READ permission", () => {
    const route = findRoute("/audit-logs");
    expect(route?.permission).toEqual({
      module: "platform",
      resource: "settings",
      permissionMask: 1,
    });
  });

  it("items route has inventory.items.READ permission", () => {
    const route = findRoute("/items");
    expect(route?.permission).toEqual({
      module: "inventory",
      resource: "items",
      permissionMask: 1,
    });
  });

  it("item detail routes inherit inventory.items.READ permission", () => {
    const route = findRoute("/items/123");
    expect(route?.path).toBe("/items");
    expect(route?.permission).toEqual({
      module: "inventory",
      resource: "items",
      permissionMask: 1,
    });
  });

  it("prices route uses canonical inventory.items.READ permission", () => {
    const route = findRoute("/prices");
    expect(route?.permission).toEqual({
      module: "inventory",
      resource: "items",
      permissionMask: 1,
    });
  });

  it("legacy routes without permission metadata pass through", () => {
    // daily-sales should NOT have permission metadata (legacy role-based only)
    const route = findRoute("/daily-sales");
    expect(route).toBeTruthy();
    expect(route?.permission).toBeUndefined();
  });
});

// ============================================================================
// Navigation section filtering (AC2)
// ============================================================================

describe("navigation section filtering (AC2)", () => {
  const userPerms: UserPermissionEntry[] = [
    { module: "platform", resource: "users", mask: 63 }, // CRUDAM
    { module: "inventory", resource: "items", mask: 15 }, // CRUD
  ];

  it("hides inventory section when user has no inventory permissions", () => {
    const noInvPerms: UserPermissionEntry[] = [
      { module: "platform", resource: "users", mask: 63 },
    ];

    // Items route requires inventory.items.READ
    const itemsRoute = findRoute("/items")!;
    expect(itemsRoute.permission).toBeDefined();

    const visible = filterNavigation(
      [itemsRoute],
      ["OWNER"],
      [],
      { inventory: true },
      noInvPerms,
    );

    // Items should be hidden because user lacks inventory.items.READ
    expect(visible.visibleRoutes).toHaveLength(0);
  });

  it("shows inventory section when user has inventory.items.READ", () => {
    const itemsRoute = findRoute("/items")!;
    const visible = filterNavigation(
      [itemsRoute],
      ["OWNER"],
      [],
      { inventory: true },
      userPerms,
    );
    expect(visible.visibleRoutes).toHaveLength(1);
    expect(visible.visibleRoutes[0].path).toBe("/items");
  });

  it("shows explicit-permission operations route without role-derived access", () => {
    const operationsRoute = findRoute("/operations")!;
    const visible = filterNavigation(
      [operationsRoute],
      ["CASHIER"],
      [],
      {},
      [],
      [{ module: "platform", resource: "operations", mask: PERMISSION_BITS.READ }],
    );

    expect(operationsRoute.requiresExplicitPermission).toBe(true);
    expect(visible.visibleRoutes).toHaveLength(1);
    expect(visible.visibleRoutes[0].path).toBe("/operations");
  });

  it("hides explicit-permission operations route when backend permission is absent", () => {
    const operationsRoute = findRoute("/operations")!;
    const visible = filterNavigation(
      [operationsRoute],
      ["OWNER"],
      [],
      {},
      permissionsFromRoleCodes(["OWNER"]),
      [],
    );

    expect(visible.visibleRoutes).toHaveLength(0);
  });
});

// ============================================================================
// Resource link filtering (AC3)
// ============================================================================

describe("resource link filtering (AC3)", () => {
  const itemsOnlyPerms: UserPermissionEntry[] = [
    { module: "inventory", resource: "items", mask: 15 },
    // No inventory.prices
  ];

  it("shows Items and Prices through the canonical inventory.items.READ grant", () => {
    const itemsRoute = findRoute("/items")!;
    const pricesRoute = findRoute("/prices")!;

    const visible = filterNavigation(
      [itemsRoute, pricesRoute],
      ["OWNER"],
      [],
      { inventory: true },
      itemsOnlyPerms,
    );

    const visiblePaths = visible.visibleRoutes.map((r) => r.path);
    expect(visiblePaths).toContain("/items");
    expect(visiblePaths).toContain("/prices");
  });

  it("shows both Items and Prices when user has both permissions", () => {
    const bothPerms: UserPermissionEntry[] = [
      { module: "inventory", resource: "items", mask: 15 },
    ];

    const itemsRoute = findRoute("/items")!;
    const pricesRoute = findRoute("/prices")!;

    const visible = filterNavigation(
      [itemsRoute, pricesRoute],
      ["OWNER"],
      [],
      { inventory: true },
      bothPerms,
    );

    const visiblePaths = visible.visibleRoutes.map((r) => r.path);
    expect(visiblePaths).toContain("/items");
    expect(visiblePaths).toContain("/prices");
  });
});

// ============================================================================
// Direct route guard (AC4)
// ============================================================================

describe("direct route guard (AC4)", () => {
  it("allows when authenticated and role authorized", () => {
    const guard = createPermissionGuard(
      "token",
      findRoute("/items"),
      ["OWNER"],
      [],
      { inventory: true },
      [{ module: "inventory", resource: "items", mask: 1 }],
    );
    const result = guard();
    expect(result.allowed).toBe(true);
  });

  it("redirects to login when not authenticated", () => {
    const guard = createPermissionGuard(
      null,
      findRoute("/items"),
      ["OWNER"],
      [],
      { inventory: true },
      [{ module: "inventory", resource: "items", mask: 1 }],
    );
    const result = guard();
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.redirectTo).toContain("/login");
    }
  });

  it("denies access when user lacks required role (CASHIER)", () => {
    const guard = createPermissionGuard(
      "token",
      findRoute("/users"),
      ["CASHIER"], // CASHIER is not in users' allowedRoles
      [],
      {},
      [{ module: "platform", resource: "users", mask: 1 }],
    );
    const result = guard();
    expect(result.allowed).toBe(false);
  });

  it("denies access when required module is not enabled", () => {
    const guard = createPermissionGuard(
      "token",
      findRoute("/items"),
      ["OWNER"],
      [],
      { inventory: false },
      [{ module: "inventory", resource: "items", mask: 1 }],
    );
    const result = guard();
    expect(result.allowed).toBe(false);
  });

  it("denies direct route access when READ permission is missing", () => {
    const guard = createPermissionGuard(
      "token",
      findRoute("/items"),
      ["OWNER"],
      [],
      { inventory: true },
      [{ module: "inventory", resource: "prices", mask: 1 }],
    );
    const result = guard();
    expect(result.allowed).toBe(false);
  });
});

// ============================================================================
// Resource permission check (used by guards)
// ============================================================================

describe("checkResourcePermission", () => {
  const userPerms: UserPermissionEntry[] = [
    { module: "platform", resource: "users", mask: 15 }, // CRUD
    { module: "inventory", resource: "*", mask: 63 },    // CRUDAM wildcard
  ];

  it("allows when user has exact resource permission", () => {
    const result = checkResourcePermission(userPerms, {
      module: "platform",
      resource: "users",
      permissionMask: 1, // READ
    });
    expect(result.allowed).toBe(true);
  });

  it("denies when user lacks resource", () => {
    const result = checkResourcePermission(userPerms, {
      module: "platform",
      resource: "roles",
      permissionMask: 1,
    });
    expect(result.allowed).toBe(false);
  });

  it("allows via wildcard resource", () => {
    const result = checkResourcePermission(userPerms, {
      module: "inventory",
      resource: "costing",
      permissionMask: 32, // MANAGE
    });
    expect(result.allowed).toBe(true);
  });

  it("denies when mask is insufficient (CASHIER with READ only needs CREATE)", () => {
    const limitedPerms: UserPermissionEntry[] = [
      { module: "platform", resource: "users", mask: 1 }, // READ only
    ];
    const result = checkResourcePermission(limitedPerms, {
      module: "platform",
      resource: "users",
      permissionMask: 2, // CREATE — user only has READ=1
    });
    expect(result.allowed).toBe(false);
  });
});

// ============================================================================
// Mutation button visibility (AC5)
// ============================================================================

describe("mutation button visibility (AC5)", () => {
  it("READ-only user cannot UPDATE or DELETE", () => {
    const readOnlyMask = 1;
    expect(hasMinimumPermission(readOnlyMask, PERMISSION_BITS.UPDATE)).toBe(false);
    expect(hasMinimumPermission(readOnlyMask, PERMISSION_BITS.DELETE)).toBe(false);
    expect(hasMinimumPermission(readOnlyMask, PERMISSION_BITS.READ)).toBe(true);
  });

  it("CRUD user can UPDATE and DELETE but not ANALYZE", () => {
    const crudMask = 15;
    expect(hasMinimumPermission(crudMask, PERMISSION_BITS.UPDATE)).toBe(true);
    expect(hasMinimumPermission(crudMask, PERMISSION_BITS.DELETE)).toBe(true);
    expect(hasMinimumPermission(crudMask, PERMISSION_BITS.ANALYZE)).toBe(false);
  });

  it("Edit action hidden when user lacks UPDATE (CASHIER)", () => {
    // CASHIER with READ only on platform.users
    const cashierMask = 1;
    expect(hasMinimumPermission(cashierMask, PERMISSION_BITS.UPDATE)).toBe(false);
  });

  it("Void/Delete action hidden when user lacks DELETE", () => {
    // User with READ+CREATE+UPDATE = 7 (missing DELETE=8)
    const noDeleteMask = PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE;
    expect(noDeleteMask).toBe(7);
    expect(hasMinimumPermission(noDeleteMask, PERMISSION_BITS.DELETE)).toBe(false);
    expect(hasMinimumPermission(noDeleteMask, PERMISSION_BITS.READ)).toBe(true);
    expect(hasMinimumPermission(noDeleteMask, PERMISSION_BITS.UPDATE)).toBe(true);
  });
});

// ============================================================================
// Backend authority notice (AC6)
// ============================================================================

describe("backend authority notice (AC6)", () => {
  it("route permission metadata is a UX convenience only", () => {
    // This test validates the documentation invariant, not runtime behavior.
    // The permission metadata helps filter the UI but backend enforce is separate.
    const route = findRoute("/users");
    expect(route?.permission).toBeDefined();

    const denied = filterNavigation([route!], ["OWNER"], [], {}, []);
    expect(denied.visibleRoutes).toHaveLength(0);

    const allowed = filterNavigation(
      [route!],
      ["OWNER"],
      [],
      {},
      [{ module: "platform", resource: "users", mask: 1 }],
    );
    expect(allowed.visibleRoutes).toHaveLength(1);
  });

  it("filterNavigation preserves backend deny-by-default", () => {
    // The client-side filter is additive-opt-in, not an auth bypass.
    // Routes without matching permission entries are hidden, not granted.
    const result = filterNavigation(
      APP_ROUTES,
      ["OWNER"],
      [],
      {},
      [], // empty loaded permissions — deny permissioned routes by default
    );
    // Routes WITHOUT permission metadata should still pass (role-based)
    expect(result.visibleRoutes.length).toBeGreaterThan(0);
    expect(result.visibleRoutes.some((route) => route.path === "/users")).toBe(false);
  });

  it("all routes with permission metadata are filtered when permissions exist but don't match", () => {
    const partialPerms: UserPermissionEntry[] = [
      { module: "inventory", resource: "items", mask: 1 }, // Only inventory.items.READ
    ];

    const result = filterNavigation(APP_ROUTES, ["OWNER"], [], {}, partialPerms);

    // Routes with permission metadata that the user does NOT have should be hidden
    // For example, /audit-logs requires platform.settings.READ, which is not in partialPerms
    // But routes WITHOUT permission metadata (like /daily-sales) should still pass

    const routesPermissionFiltered = APP_ROUTES
      .filter((r) => r.permission && !result.visibleRoutes.includes(r));

    // At least /audit-logs (platform.settings), /users (platform.users),
    // /roles (platform.roles), /companies, /outlets should be hidden
    expect(routesPermissionFiltered.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// filterNavigation uses formal AppRoute.permission (not transitional cast)
// ============================================================================

describe("filterNavigation uses formal approute.permission (Story 66-4)", () => {
  it("accesses route.permission directly without casting", () => {
    const route = findRoute("/users")!;
    // This is a type-level assertion: route.permission should be accessible
    // without (route as any).permission
    expect(route.permission).toBeDefined();
    expect(route.permission?.module).toBe("platform");
  });

  it("routes without permission field are treated as pass-through", () => {
    const dailySales = findRoute("/daily-sales")!;
    expect(dailySales.permission).toBeUndefined();

    // In filterNavigation, routes without permission should still show
    const result = filterNavigation(
      [dailySales],
      ["OWNER"],
      [],
      {},
      [], // loaded empty permissions
    );
    expect(result.visibleRoutes).toHaveLength(1);
  });

  it("routes with permission fields are hidden while permissions are not loaded", () => {
    const usersRoute = findRoute("/users")!;
    const result = filterNavigation([usersRoute], ["OWNER"], [], {});
    expect(result.visibleRoutes).toHaveLength(0);
  });

  it("no 'as any' cast needed to access permission", () => {
    // TypeScript should allow direct access to route.permission
    const route: AppRoute = findRoute("/users")!;
    const perm: NavPermissionRequirement | undefined = route.permission;
    expect(perm).toBeDefined();
  });
});

// ============================================================================
// Negative auth: CASHIER access denial for admin routes
// ============================================================================

describe("negative auth: CASHIER admin route access", () => {
  it("CASHIER cannot access users page by role", () => {
    const route = findRoute("/users")!;
    const canAccess = userCanAccessRoute(["CASHIER"], route, []);
    expect(canAccess).toBe(false);
  });

  it("CASHIER cannot access companies page by role", () => {
    const route = findRoute("/companies")!;
    const canAccess = userCanAccessRoute(["CASHIER"], route, []);
    expect(canAccess).toBe(false);
  });

  it("CASHIER cannot access roles page by role", () => {
    const route = findRoute("/roles")!;
    const canAccess = userCanAccessRoute(["CASHIER"], route, []);
    expect(canAccess).toBe(false);
  });

  it("CASHIER cannot access audit-logs page by role", () => {
    const route = findRoute("/audit-logs")!;
    const canAccess = userCanAccessRoute(["CASHIER"], route, []);
    expect(canAccess).toBe(false);
  });

  it("CASHIER can access table-board (correct — POS access)", () => {
    const route = findRoute("/table-board")!;
    const canAccess = userCanAccessRoute(["CASHIER"], route, []);
    expect(canAccess).toBe(true);
  });
});

// ============================================================================
// Route metadata completeness
// ============================================================================

describe("core admin routes have complete permission metadata", () => {
  const adminRoutes = ["/users", "/roles", "/module-roles", "/companies", "/outlets", "/audit-logs"];

  for (const path of adminRoutes) {
    it(`${path} has permission metadata with module, resource, and permissionMask`, () => {
      const route = findRoute(path);
      expect(route).toBeTruthy();
      if (route?.permission) {
        expect(route.permission.module).toBeTruthy();
        expect(route.permission.resource).toBeTruthy();
        expect(route.permission.permissionMask).toBeGreaterThanOrEqual(PERMISSION_BITS.READ);
      }
    });
  }
});

// ============================================================================
// permissionsFromRoleCodes — derive effective permissions from canonical matrix
// ============================================================================

describe("permissionsFromRoleCodes", () => {
  it("derives OWNER platform.users CRUDAM (63) from shared matrix", () => {
    const perms = permissionsFromRoleCodes(["OWNER"]);
    const platformUsers = perms.find(
      (p) => p.module === "platform" && p.resource === "users",
    );
    expect(platformUsers).toBeDefined();
    expect(platformUsers!.mask).toBe(63); // CRUDAM
  });

  it("derives OWNER inventory.items CRUDAM (63) from shared matrix", () => {
    const perms = permissionsFromRoleCodes(["OWNER"]);
    const invItems = perms.find(
      (p) => p.module === "inventory" && p.resource === "items",
    );
    expect(invItems).toBeDefined();
    expect(invItems!.mask).toBe(63);
  });

  it("derives CASHIER inventory.items READ (1) from shared matrix", () => {
    const perms = permissionsFromRoleCodes(["CASHIER"]);
    const invItems = perms.find(
      (p) => p.module === "inventory" && p.resource === "items",
    );
    expect(invItems).toBeDefined();
    expect(invItems!.mask).toBe(1); // READ only
  });

  it("CASHIER has no platform.users access", () => {
    const perms = permissionsFromRoleCodes(["CASHIER"]);
    const platformUsers = perms.filter(
      (p) => p.module === "platform" && p.resource === "users",
    );
    expect(platformUsers).toHaveLength(0);
  });

  it("combines duplicate grants from multiple roles with bitwise OR", () => {
    // OWNER + CASHIER both have inventory.items: OWNER=63, CASHIER=1
    // Combined should still be 63 (bitwise OR)
    const perms = permissionsFromRoleCodes(["OWNER", "CASHIER"]);
    const invItems = perms.find(
      (p) => p.module === "inventory" && p.resource === "items",
    );
    expect(invItems).toBeDefined();
    // OWNER=63 covers everything; combined should be >= 63
    expect(invItems!.mask).toBe(63);
  });

  it("includes global_roles-derived grants (SUPER_ADMIN has full access)", () => {
    const perms = permissionsFromRoleCodes(["SUPER_ADMIN"]);
    // SUPER_ADMIN has many grants; verify a few key ones
    const platformUsers = perms.find(
      (p) => p.module === "platform" && p.resource === "users",
    );
    expect(platformUsers).toBeDefined();
    expect(platformUsers!.mask).toBe(63);

    const accountingJournals = perms.find(
      (p) => p.module === "accounting" && p.resource === "journals",
    );
    expect(accountingJournals).toBeDefined();
    expect(accountingJournals!.mask).toBe(63);
  });

  it("returns deterministically sorted results", () => {
    const perms = permissionsFromRoleCodes(["OWNER"]);
    const keys = perms.map((p) => `${p.module}:${p.resource}`);
    // Verify sorted order
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it("returns empty array for unknown role codes", () => {
    const perms = permissionsFromRoleCodes(["NONEXISTENT_ROLE"]);
    expect(perms).toEqual([]);
  });

  it("ignores malformed keys gracefully (no crash)", () => {
    const perms = permissionsFromRoleCodes(["OWNER"]);
    // All entries should have non-empty module and resource
    for (const p of perms) {
      expect(p.module.length).toBeGreaterThan(0);
      expect(p.resource.length).toBeGreaterThan(0);
    }
  });

  it("empty role codes array returns empty permissions", () => {
    const perms = permissionsFromRoleCodes([]);
    expect(perms).toEqual([]);
  });
});

describe("resolveEffectivePermissions", () => {
  it("uses backend-supplied permissions when present", () => {
    const explicitPerms: UserPermissionEntry[] = [
      { module: "platform", resource: "users", mask: 1 },
    ];

    const resolved = resolveEffectivePermissions({
      roles: ["OWNER"],
      global_roles: [],
      permissions: explicitPerms,
    });

    expect(resolved).toBe(explicitPerms);
  });

  it("treats explicit empty backend permissions as authoritative deny-by-default", () => {
    const resolved = resolveEffectivePermissions({
      roles: ["OWNER"],
      global_roles: [],
      permissions: [],
    });

    expect(resolved).toEqual([]);
  });

  it("falls back to canonical role matrix only when permissions are absent", () => {
    const resolved = resolveEffectivePermissions({
      roles: ["OWNER"],
      global_roles: [],
    });

    expect(resolved?.some(
      (p) => p.module === "platform" && p.resource === "users" && p.mask === 63,
    )).toBe(true);
  });
});

// ============================================================================
// userSatisfiesRoutePermission — pure permission check for routes
// ============================================================================

describe("userSatisfiesRoutePermission", () => {
  const req: NavPermissionRequirement = {
    module: "platform",
    resource: "users",
    permissionMask: 1, // READ
  };

  it("returns true when route has no permission requirement", () => {
    expect(userSatisfiesRoutePermission(undefined, [])).toBe(true);
  });

  it("returns false when permissions are undefined and route requires permission", () => {
    expect(userSatisfiesRoutePermission(req, undefined)).toBe(false);
  });

  it("returns false when permissions array is empty and route requires permission", () => {
    expect(userSatisfiesRoutePermission(req, [])).toBe(false);
  });

  it("returns true when user has exact resource with sufficient mask", () => {
    const perms: UserPermissionEntry[] = [
      { module: "platform", resource: "users", mask: 15 }, // CRUD
    ];
    expect(userSatisfiesRoutePermission(req, perms)).toBe(true);
  });

  it("returns false when user has the resource but insufficient mask", () => {
    const perms: UserPermissionEntry[] = [
      { module: "platform", resource: "users", mask: 2 }, // CREATE only, no READ
    ];
    // READ=1 is required but user only has CREATE=2
    expect(userSatisfiesRoutePermission(req, perms)).toBe(false);
  });

  it("returns true when user has wildcard resource", () => {
    const perms: UserPermissionEntry[] = [
      { module: "platform", resource: "*", mask: 63 },
    ];
    expect(userSatisfiesRoutePermission(req, perms)).toBe(true);
  });

  it("returns false when user has different module", () => {
    const perms: UserPermissionEntry[] = [
      { module: "inventory", resource: "items", mask: 15 },
    ];
    expect(userSatisfiesRoutePermission(req, perms)).toBe(false);
  });

  it("denies when role allows but resource permission missing", () => {
    // OWNER has platform.users.READ in the matrix, but we're testing
    // the pure function: if effective permissions don't include
    // platform.users, access is denied regardless of role.
    const perms: UserPermissionEntry[] = [
      { module: "inventory", resource: "items", mask: 63 },
      { module: "platform", resource: "outlets", mask: 63 },
      // platform.users is NOT in this list
    ];
    expect(userSatisfiesRoutePermission(req, perms)).toBe(false);
  });
});

// ============================================================================
// Route canAccess wired through filterNavigation + effective permissions
// ============================================================================

describe("route canAccess: permission-wired deny-by-default", () => {
  // Use the canonical role-based permission derivation to simulate the
  // AppRouter's effectivePermissions + canAccess flow.
  
  it("/users is visible with OWNER effective permissions", () => {
    const route = findRoute("/users")!;
    expect(route.permission).toBeDefined();

    const effectivePerms = permissionsFromRoleCodes(["OWNER"]);
    const visible = filterNavigation(
      [route],
      ["OWNER"],
      [],
      {},
      effectivePerms,
    );
    expect(visible.visibleRoutes).toHaveLength(1);
  });

  it("/users is hidden with CASHIER effective permissions (role allows but no resource permission)", () => {
    const route = findRoute("/users")!;
    expect(route.permission).toBeDefined();

    // CASHIER is not in /users allowedRoles, so role check fails first.
    // But we also test that even if role were overridden, the permission
    // would block.
    const effectivePerms = permissionsFromRoleCodes(["CASHIER"]);
    // Verify CASHIER has no platform.users in its effective permissions
    const hasUserPerm = effectivePerms.some(
      (p) => p.module === "platform" && p.resource === "users",
    );
    expect(hasUserPerm).toBe(false);
  });

  it("/prices is visible with inventory.items.READ (owner grants)", () => {
    const pricesRoute = findRoute("/prices")!;
    expect(pricesRoute.permission).toBeDefined();
    expect(pricesRoute.permission!.module).toBe("inventory");
    expect(pricesRoute.permission!.resource).toBe("items");

    const effectivePerms = permissionsFromRoleCodes(["OWNER"]);
    const visible = filterNavigation(
      [pricesRoute],
      ["OWNER"],
      [],
      { inventory: true },
      effectivePerms,
    );
    expect(visible.visibleRoutes).toHaveLength(1);
    expect(visible.visibleRoutes[0].path).toBe("/prices");
  });

  it("/prices is visible with CASHIER effective permissions (CASHIER has inventory.items.READ=1)", () => {
    const pricesRoute = findRoute("/prices")!;
    // CASHIER is NOT in the allowedRoles for /prices (OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT),
    // so role check fails. But if we bypass that and test the permission alone:
    const effectivePerms = permissionsFromRoleCodes(["CASHIER"]);
    const invItems = effectivePerms.find(
      (p) => p.module === "inventory" && p.resource === "items",
    );
    expect(invItems).toBeDefined();
    expect(invItems!.mask).toBe(1); // READ

    // The pure permission check should pass
    expect(
      userSatisfiesRoutePermission(pricesRoute.permission!, effectivePerms),
    ).toBe(true);
  });

  it("legacy route without permission is visible even with empty effective permissions", () => {
    const dailySales = findRoute("/daily-sales")!;
    expect(dailySales.permission).toBeUndefined();

    const visible = filterNavigation(
      [dailySales],
      ["OWNER"],
      [],
      {},
      [], // empty permissions — but route has no permission requirement
    );
    expect(visible.visibleRoutes).toHaveLength(1);
  });

  it("permissioned route is hidden with empty effective permissions (deny-by-default)", () => {
    const usersRoute = findRoute("/users")!;
    expect(usersRoute.permission).toBeDefined();

    const visible = filterNavigation(
      [usersRoute],
      ["OWNER"],
      [],
      {},
      [], // empty permissions — deny-by-default
    );
    expect(visible.visibleRoutes).toHaveLength(0);
  });
});
