// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { APP_ROUTES, filterRoutesByModules, findRoute, userCanAccessRoute } from "./routes";

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
    assert.ok(route, "Route should exist");
    assert.strictEqual(userCanAccessRoute(["ACCOUNTANT"], route!), true);
  });
});
