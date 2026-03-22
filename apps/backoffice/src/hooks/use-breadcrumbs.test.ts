// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * useBreadcrumbs Hook Tests
 * 
 * Tests for breadcrumb generation, route mapping, query param preservation,
 * and deep link navigation reconstruction.
 * 
 * Note: These tests focus on the pure logic functions used by the hook.
 * Run with: npm run test -w @jurnapod/backoffice
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  BREADCRUMB_ROUTES,
  findBreadcrumbRoute,
  buildBreadcrumbTrail,
  generateHrefWithParams,
  matchRoutePath,
  normalizeRoutePath,
  type BreadcrumbRoute,
} from "./use-breadcrumbs-logic";
import type { BreadcrumbItem } from "../components/ui/PageHeader/PageHeader";

// Helper to create mock URLSearchParams
function createMockSearchParams(queryString: string): URLSearchParams {
  return new URLSearchParams(queryString);
}

describe("useBreadcrumbs - Pure Logic Functions", () => {
  describe("normalizeRoutePath", () => {
    it("should normalize path with leading/trailing slashes", () => {
      assert.strictEqual(normalizeRoutePath("/items/"), "/items");
      assert.strictEqual(normalizeRoutePath("items/"), "/items");
      assert.strictEqual(normalizeRoutePath("/items"), "/items");
    });

    it("should handle empty paths", () => {
      assert.strictEqual(normalizeRoutePath(""), "/");
      assert.strictEqual(normalizeRoutePath("/"), "/");
    });

    it("should handle paths with multiple slashes", () => {
      assert.strictEqual(normalizeRoutePath("///items///"), "/items");
    });
  });

  describe("matchRoutePath", () => {
    it("should match exact routes", () => {
      assert.strictEqual(matchRoutePath("/items", "/items"), true);
      assert.strictEqual(matchRoutePath("/items", "/users"), false);
    });

    it("should match parameterized routes", () => {
      assert.strictEqual(matchRoutePath("/items/:id", "/items/123"), true);
      assert.strictEqual(matchRoutePath("/items/:id", "/items/abc-xyz"), true);
      assert.strictEqual(matchRoutePath("/users/:id", "/users/456"), true);
    });

    it("should not match routes with different segment counts", () => {
      assert.strictEqual(matchRoutePath("/items/:id", "/items"), false);
      assert.strictEqual(matchRoutePath("/items/:id/prices", "/items/123"), false);
    });

    it("should handle paths with special characters", () => {
      assert.strictEqual(matchRoutePath("/items/:id", "/items/abc_123"), true);
      assert.strictEqual(matchRoutePath("/items/:id", "/items/abc-123"), true);
    });
  });

  describe("findBreadcrumbRoute", () => {
    it("should find exact route match", () => {
      const route = findBreadcrumbRoute("/items", BREADCRUMB_ROUTES);
      assert.notStrictEqual(route, null);
      assert.strictEqual(route?.label, "Items");
    });

    it("should find parameterized route match", () => {
      const route = findBreadcrumbRoute("/items/123", BREADCRUMB_ROUTES);
      assert.notStrictEqual(route, null);
      assert.strictEqual(route?.label, "Item Details");
    });

    it("should return null for unknown routes", () => {
      const route = findBreadcrumbRoute("/unknown/route", BREADCRUMB_ROUTES);
      assert.strictEqual(route, null);
    });

    it("should prefer exact match over parameterized", () => {
      const route = findBreadcrumbRoute("/items", BREADCRUMB_ROUTES);
      assert.strictEqual(route?.label, "Items");
      assert.strictEqual(route?.hasParams, undefined);
    });

    it("should find deeply nested routes", () => {
      const route = findBreadcrumbRoute("/items/123/prices", BREADCRUMB_ROUTES);
      assert.notStrictEqual(route, null);
      assert.strictEqual(route?.label, "Item Prices");
    });
  });

  describe("generateHrefWithParams", () => {
    it("should preserve outlet param by default", () => {
      const params = createMockSearchParams("outlet=456&other=value");
      const href = generateHrefWithParams("/items", params, []);
      assert.ok(href.includes("#/items"));
      assert.ok(href.includes("outlet=456"));
    });

    it("should preserve specified custom keys", () => {
      const params = createMockSearchParams("outlet=456&tab=details&view=list");
      const href = generateHrefWithParams("/items", params, ["tab", "view"]);
      assert.ok(href.includes("outlet=456"));
      assert.ok(href.includes("tab=details"));
      assert.ok(href.includes("view=list"));
    });

    it("should not preserve unspecified keys", () => {
      const params = createMockSearchParams("outlet=456&random=abc");
      const href = generateHrefWithParams("/items", params, ["outlet"]);
      assert.ok(href.includes("outlet=456"));
      assert.ok(!href.includes("random=abc"));
    });

    it("should handle empty params", () => {
      const params = createMockSearchParams("");
      const href = generateHrefWithParams("/items", params, []);
      assert.strictEqual(href, "#/items");
    });

    it("should handle params with only outlet", () => {
      const params = createMockSearchParams("outlet=123");
      const href = generateHrefWithParams("/prices", params, []);
      assert.strictEqual(href, "#/prices?outlet=123");
    });
  });

  describe("buildBreadcrumbTrail", () => {
    it("should build single item for root route", () => {
      const route: BreadcrumbRoute = { path: "/items", label: "Items" };
      const trail = buildBreadcrumbTrail(route, BREADCRUMB_ROUTES, false, [], undefined);

      assert.strictEqual(trail.length, 1);
      assert.deepStrictEqual(trail[0], {
        label: "Items",
        href: undefined,
        current: true,
      });
    });

    it("should build trail for nested route", () => {
      const route: BreadcrumbRoute = { path: "/items/:id", label: "Item Details", parent: "/items", hasParams: true };
      const trail = buildBreadcrumbTrail(route, BREADCRUMB_ROUTES, false, [], undefined);

      assert.strictEqual(trail.length, 2);
      assert.strictEqual(trail[0].label, "Items");
      assert.strictEqual(trail[0].current, false);
      assert.strictEqual(trail[1].label, "Item Details");
      assert.strictEqual(trail[1].current, true);
    });

    it("should build trail for deeply nested route", () => {
      const route: BreadcrumbRoute = {
        path: "/items/:id/prices",
        label: "Item Prices",
        parent: "/items/:id",
        hasParams: true,
      };
      const trail = buildBreadcrumbTrail(route, BREADCRUMB_ROUTES, false, [], undefined);

      assert.strictEqual(trail.length, 3);
      assert.strictEqual(trail[0].label, "Items");
      assert.strictEqual(trail[1].label, "Item Details");
      assert.strictEqual(trail[2].label, "Item Prices");
      assert.strictEqual(trail[2].current, true);
    });

    it("should preserve query params when enabled", () => {
      const route: BreadcrumbRoute = { path: "/items/:id", label: "Item Details", parent: "/items", hasParams: true };
      const params = createMockSearchParams("outlet=789");
      const trail = buildBreadcrumbTrail(route, BREADCRUMB_ROUTES, true, [], params);

      // First item (parent) should have href with outlet param
      assert.ok(trail[0].href?.includes("outlet=789"));
      // Last item should not have href (current page)
      assert.strictEqual(trail[1].href, undefined);
    });

    it("should handle route without parent", () => {
      const route: BreadcrumbRoute = { path: "/users", label: "Users" };
      const trail = buildBreadcrumbTrail(route, BREADCRUMB_ROUTES, false, [], undefined);

      assert.strictEqual(trail.length, 1);
      assert.strictEqual(trail[0].label, "Users");
      assert.strictEqual(trail[0].current, true);
    });
  });

  describe("BREADCRUMB_ROUTES Coverage", () => {
    const expectedRoutes = [
      "/daily-sales",
      "/profit-loss",
      "/general-ledger",
      "/journals",
      "/accounting-worksheet",
      "/account-types",
      "/chart-of-accounts",
      "/fiscal-years",
      "/account-mappings",
      "/tax-rates",
      "/transaction-templates",
      "/transactions",
      "/cash-bank",
      "/sales-invoices",
      "/sales-payments",
      "/pos-transactions",
      "/pos-payments",
      "/outlet-tables",
      "/reservations",
      "/reservation-calendar",
      "/table-board",
      "/sync-queue",
      "/sync-history",
      "/pwa-settings",
      "/item-groups",
      "/items",
      "/prices",
      "/items-prices",
      "/supplies",
      "/fixed-assets",
      "/inventory-settings",
      "/audit-logs",
      "/companies",
      "/outlets",
      "/users",
      "/roles",
      "/module-roles",
      "/modules",
      "/outlet-settings",
      "/static-pages",
      "/platform-settings",
    ];

    expectedRoutes.forEach((routePath) => {
      it(`should have route defined for ${routePath}`, () => {
        const route = findBreadcrumbRoute(routePath, BREADCRUMB_ROUTES);
        assert.notStrictEqual(route, null);
        assert.strictEqual(typeof route?.label, "string");
      });
    });

    it("should have parent relationships for nested routes", () => {
      const itemDetailsRoute = findBreadcrumbRoute("/items/123", BREADCRUMB_ROUTES);
      assert.strictEqual(itemDetailsRoute?.parent, "/items");
      assert.strictEqual(itemDetailsRoute?.hasParams, true);

      const itemPricesRoute = findBreadcrumbRoute("/items/123/prices", BREADCRUMB_ROUTES);
      assert.strictEqual(itemPricesRoute?.parent, "/items/:id");
      assert.strictEqual(itemPricesRoute?.hasParams, true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle route with UUID-like id", () => {
      const route = findBreadcrumbRoute(
        "/items/550e8400-e29b-41d4-a716-446655440000",
        BREADCRUMB_ROUTES
      );
      assert.notStrictEqual(route, null);
      assert.strictEqual(route?.label, "Item Details");
    });

    it("should handle route with numeric id", () => {
      const route = findBreadcrumbRoute("/items/123456", BREADCRUMB_ROUTES);
      assert.notStrictEqual(route, null);
      assert.strictEqual(route?.label, "Item Details");
    });

    it("should handle route with alphanumeric id", () => {
      const route = findBreadcrumbRoute("/items/abc123XYZ", BREADCRUMB_ROUTES);
      assert.notStrictEqual(route, null);
      assert.strictEqual(route?.label, "Item Details");
    });

    it("should handle case sensitivity in routes", () => {
      const route = findBreadcrumbRoute("/Items/123", BREADCRUMB_ROUTES);
      // Routes are case-sensitive, so this shouldn't match
      assert.strictEqual(route, null);
    });
  });
});
