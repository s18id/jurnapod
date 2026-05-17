// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests: Shared admin primitives — ScopeBadge, DetailDrawer, EntityTable,
// FilterBar adapters (Story 65-7)

import { describe, it, expect } from "vitest";

// FilterBar factory functions + data-grid components
import {
  createSearchFilter,
  createSelectFilter,
  createDateFilter,
  createDateRangeFilter,
  createStatusFilter,
  EntityTable,
  FilterBar,
  DetailDrawer,
  ScopeBadge,
  CompanyBadge,
  OutletBadge,
  StatusBadge,
  ScopeDisplay,
} from "@/components/data-grid";

// Shell exports
import { ShellProvider, useShell, PERMISSION_BITS, hasMinimumPermission, filterNavigation } from "@/app/shell";

// Router exports — import from direct sub-modules (avoid barrel due to vitest ESM resolution)
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
import { ROUTE_PATHS } from "@/app/router/routes";

// ---------------------------------------------------------------------------
// Filter factory tests
// ---------------------------------------------------------------------------

describe("createSearchFilter", () => {
  it("creates a text filter with correct type and defaults", () => {
    const filter = createSearchFilter("search", "Search");
    expect(filter.key).toBe("search");
    expect(filter.type).toBe("text");
    expect(filter.label).toBe("Search");
    expect(filter.placeholder).toContain("Search");
  });

  it("uses custom placeholder when provided", () => {
    const filter = createSearchFilter("q", "Query", "Type here...");
    expect(filter.placeholder).toBe("Type here...");
  });
});

describe("createSelectFilter", () => {
  it("creates a select filter with options", () => {
    const options = [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }];
    const filter = createSelectFilter("status", "Status", options);
    expect(filter.key).toBe("status");
    expect(filter.type).toBe("select");
    expect(filter.options).toEqual(options);
  });
});

describe("createDateFilter", () => {
  it("creates a date filter", () => {
    const filter = createDateFilter("start_date", "Start Date");
    expect(filter.key).toBe("start_date");
    expect(filter.type).toBe("date");
    expect(filter.label).toBe("Start Date");
  });
});

describe("createDateRangeFilter", () => {
  it("creates a date range filter", () => {
    const filter = createDateRangeFilter("date_range", "Date Range");
    expect(filter.key).toBe("date_range");
    expect(filter.type).toBe("daterange");
  });
});

describe("createStatusFilter", () => {
  it("creates a status multi-select filter", () => {
    const options = [{ value: "draft", label: "Draft" }, { value: "posted", label: "Posted" }];
    const filter = createStatusFilter("status", "Status", options);
    expect(filter.key).toBe("status");
    expect(filter.type).toBe("status");
    expect(filter.options).toEqual(options);
  });
});

// ---------------------------------------------------------------------------
// data-grid barrel exports
// ---------------------------------------------------------------------------

describe("data-grid barrel exports", () => {
  it("exports EntityTable", () => {
    expect(EntityTable).toBeDefined();
  });

  it("exports FilterBar", () => {
    expect(FilterBar).toBeDefined();
  });

  it("exports DetailDrawer", () => {
    expect(DetailDrawer).toBeDefined();
  });

  it("exports ScopeBadge and presets", () => {
    expect(ScopeBadge).toBeDefined();
    expect(CompanyBadge).toBeDefined();
    expect(OutletBadge).toBeDefined();
    expect(StatusBadge).toBeDefined();
    expect(ScopeDisplay).toBeDefined();
  });

  it("exports factory functions", () => {
    expect(createSearchFilter).toBeDefined();
    expect(createSelectFilter).toBeDefined();
    expect(createDateFilter).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// shell barrel exports
// ---------------------------------------------------------------------------

describe("shell barrel exports", () => {
  it("exports ShellProvider", () => {
    expect(ShellProvider).toBeDefined();
  });

  it("exports useShell", () => {
    expect(useShell).toBeDefined();
  });

  it("exports permission helpers", () => {
    expect(PERMISSION_BITS).toBeDefined();
    expect(hasMinimumPermission).toBeDefined();
    expect(filterNavigation).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// router barrel exports
// ---------------------------------------------------------------------------

describe("router barrel exports", () => {
  it("exports guard helpers", () => {
    expect(checkAuth).toBeDefined();
    expect(checkRouteAccess).toBeDefined();
    expect(checkResourcePermission).toBeDefined();
    expect(createPermissionGuard).toBeDefined();
  });

  it("exports hash redirect helpers", () => {
    expect(resolveLegacyHash).toBeDefined();
    expect(isLegacyHash).toBeDefined();
    expect(buildHashRedirect).toBeDefined();
    expect(LEGACY_HASH_REDIRECTS).toBeDefined();
  });

  it("exports route constants", () => {
    expect(ROUTE_PATHS).toBeDefined();
    expect(ROUTE_PATHS.LOGIN).toBe("/login");
  });
});
