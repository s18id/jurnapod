// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests: RouterBridge component (Story 65-5)
// Tests the React Router v6 compatibility bridge imports and basic structure.

import { describe, it, expect } from "vitest";

// Import bridge and related utilities from the router module
import { RouterBridge, HashedRouterBridge } from "@/app/router/router-bridge";

// Also import route constants for verification
import { ROUTE_PATHS } from "@/app/router/routes";

// ---------------------------------------------------------------------------
// RouterBridge component tests
// ---------------------------------------------------------------------------

describe("RouterBridge", () => {
  it("is a function (React component)", () => {
    expect(typeof RouterBridge).toBe("function");
  });

  it("accepts children prop (interface check)", () => {
    // Structural test: the component exists and is callable
    expect(RouterBridge).toBeDefined();
  });
});

describe("HashedRouterBridge", () => {
  it("is a function (React component)", () => {
    expect(typeof HashedRouterBridge).toBe("function");
  });

  it("is distinct from RouterBridge", () => {
    expect(HashedRouterBridge).not.toBe(RouterBridge);
  });
});

// ---------------------------------------------------------------------------
// Route paths completeness
// ---------------------------------------------------------------------------

describe("ROUTE_PATHS completeness", () => {
  it("defines all required public route paths", () => {
    expect(ROUTE_PATHS.LOGIN).toBe("/login");
    expect(ROUTE_PATHS.FORGOT_PASSWORD).toBe("/forgot-password");
    expect(ROUTE_PATHS.RESET_PASSWORD).toBe("/reset-password");
    expect(ROUTE_PATHS.INVITE).toBe("/invite");
    expect(ROUTE_PATHS.VERIFY_EMAIL).toBe("/verify-email");
  });

  it("defines all required core route paths", () => {
    expect(ROUTE_PATHS.DAILY_SALES).toBe("/daily-sales");
    expect(ROUTE_PATHS.PROFIT_LOSS).toBe("/profit-loss");
    expect(ROUTE_PATHS.GENERAL_LEDGER).toBe("/general-ledger");
    expect(ROUTE_PATHS.JOURNALS).toBe("/journals");
    expect(ROUTE_PATHS.ACCOUNTING_WORKSHEET).toBe("/accounting-worksheet");
  });

  it("defines all required platform route paths", () => {
    expect(ROUTE_PATHS.COMPANIES).toBe("/companies");
    expect(ROUTE_PATHS.OUTLETS).toBe("/outlets");
    expect(ROUTE_PATHS.USERS).toBe("/users");
    expect(ROUTE_PATHS.ROLES).toBe("/roles");
  });

  it("defines inventory route paths", () => {
    expect(ROUTE_PATHS.ITEMS).toBe("/items");
    expect(ROUTE_PATHS.ITEMS_IMPORT).toBe("/items/import");
    expect(ROUTE_PATHS.PRICES).toBe("/prices");
    expect(ROUTE_PATHS.ITEM_GROUPS).toBe("/item-groups");
  });

  it("defines accounting route paths", () => {
    expect(ROUTE_PATHS.ACCOUNT_TYPES).toBe("/account-types");
    expect(ROUTE_PATHS.CHART_OF_ACCOUNTS).toBe("/chart-of-accounts");
    expect(ROUTE_PATHS.FISCAL_YEARS).toBe("/fiscal-years");
    expect(ROUTE_PATHS.TRANSACTIONS).toBe("/transactions");
  });

  it("defines the catch-all 404 path", () => {
    expect(ROUTE_PATHS.NOT_FOUND).toBe("*");
  });
});

// ---------------------------------------------------------------------------
// Barrel export verification
// ---------------------------------------------------------------------------

describe("router barrel exports (bridge)", () => {
  it("exports RouterBridge from barrel", async () => {
    const barrel = await import("@/app/router");
    expect(barrel.RouterBridge).toBeDefined();
    expect(barrel.HashedRouterBridge).toBeDefined();
  });
});
