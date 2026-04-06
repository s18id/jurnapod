// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { APP_ROUTES, filterRoutesByModules, findRoute, normalizeHashPath, userCanAccessRoute, DEFAULT_ROUTE_PATH } from "./routes";

describe("table-board route", () => {
  test("is registered with POS module requirement", () => {
    const route = findRoute("/table-board");
    assert.ok(route, "Route should exist");
    assert.strictEqual(route?.requiredModule, "pos");
  });

  test("is filtered out when pos module is disabled", () => {
    const filtered = filterRoutesByModules(APP_ROUTES, { pos: false });
    const route = filtered.find((item) => item.path === "/table-board");
    assert.strictEqual(route, undefined);
  });

  test("is accessible for owner role", () => {
    const route = findRoute("/table-board");
    assert.ok(route, "Route should exist");
    assert.strictEqual(userCanAccessRoute(["OWNER"], route!), true);
  });

  test("is accessible for cashier role", () => {
    const route = findRoute("/table-board");
    assert.ok(route, "Route should exist");
    assert.strictEqual(userCanAccessRoute(["CASHIER"], route!), true);
  });
});

describe("reservation-calendar route", () => {
  test("is registered with POS module requirement", () => {
    const route = findRoute("/reservation-calendar");
    assert.ok(route, "Route should exist");
    assert.strictEqual(route?.requiredModule, "pos");
  });

  test("is filtered out when pos module is disabled", () => {
    const filtered = filterRoutesByModules(APP_ROUTES, { pos: false });
    const route = filtered.find((item) => item.path === "/reservation-calendar");
    assert.strictEqual(route, undefined);
  });

  test("is accessible for accountant role", () => {
    const route = findRoute("/reservation-calendar");
    assert.ok(route, "Reservation calendar route should exist");
    assert.strictEqual(userCanAccessRoute(["ACCOUNTANT"], route!), true);
  });
});

describe("normalizeHashPath", () => {
  test("should return default route for empty hash", () => {
    assert.strictEqual(normalizeHashPath(""), DEFAULT_ROUTE_PATH);
    assert.strictEqual(normalizeHashPath("#"), DEFAULT_ROUTE_PATH);
  });

  test("should return default route for root hash", () => {
    assert.strictEqual(normalizeHashPath("/"), DEFAULT_ROUTE_PATH);
    assert.strictEqual(normalizeHashPath("#/"), DEFAULT_ROUTE_PATH);
  });

  test("should extract path from hash with leading #", () => {
    assert.strictEqual(normalizeHashPath("#/items"), "/items");
    assert.strictEqual(normalizeHashPath("#/users/123"), "/users/123");
    assert.strictEqual(normalizeHashPath("#/items/prices"), "/items/prices");
  });

  test("should handle hash without leading #", () => {
    assert.strictEqual(normalizeHashPath("/items"), "/items");
    assert.strictEqual(normalizeHashPath("/users/123"), "/users/123");
  });

  test("should preserve query params (not stripped by this function)", () => {
    // Note: normalizeHashPath only handles the hash path, query params are read from window.location.search separately
    assert.strictEqual(normalizeHashPath("#/items?outlet=123"), "/items?outlet=123");
    assert.strictEqual(normalizeHashPath("#/prices?tab=details"), "/prices?tab=details");
  });

  test("should handle hash with leading # and no whitespace", () => {
    assert.strictEqual(normalizeHashPath("#/items"), "/items");
  });

  test("should ensure leading slash for paths without it", () => {
    assert.strictEqual(normalizeHashPath("items"), "/items");
    assert.strictEqual(normalizeHashPath("items/123"), "/items/123");
  });

  test("should handle deeply nested routes", () => {
    assert.strictEqual(normalizeHashPath("#/items/123/prices"), "/items/123/prices");
    assert.strictEqual(normalizeHashPath("#/users/456/edit"), "/users/456/edit");
  });

  test("should handle special characters in route params", () => {
    assert.strictEqual(normalizeHashPath("#/items/abc_123"), "/items/abc_123");
    assert.strictEqual(normalizeHashPath("#/items/abc-123"), "/items/abc-123");
  });
});
