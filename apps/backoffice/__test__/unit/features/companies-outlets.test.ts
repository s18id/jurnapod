// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, expect, it } from "vitest";

import { PERMISSION_BITS, type UserPermissionEntry } from "@/lib/auth/permissions";
import {
  buildScopeSummary,
  companyStatusLabel,
  DEFAULT_ADMIN_TIMEZONE,
  getCompanyActionGates,
  getOutletActionGates,
  isCompanyInactive,
  mutationInvalidationResource,
  normalizeAdminTimezone,
  outletStatusLabel,
} from "@/features/companies-outlets/admin-helpers";
import { companyQueryKeys, outletQueryKeys } from "@/features/companies-outlets/api";

const companyManagePermissions: UserPermissionEntry[] = [
  { module: "platform", resource: "companies", mask: PERMISSION_BITS.READ | PERMISSION_BITS.MANAGE },
];

const companyReadPermissions: UserPermissionEntry[] = [
  { module: "platform", resource: "companies", mask: PERMISSION_BITS.READ },
];

const outletManagePermissions: UserPermissionEntry[] = [
  { module: "platform", resource: "outlets", mask: PERMISSION_BITS.READ | PERMISSION_BITS.MANAGE },
];

describe("company/outlet permission gates", () => {
  it("blocks COMPANY_ADMIN-style company creation without SUPER_ADMIN backend semantics", () => {
    const gates = getCompanyActionGates(
      companyManagePermissions,
      { companyId: 10, isSuperAdmin: false },
      10,
    );

    expect(gates.view).toBe(true);
    expect(gates.create).toBe(false);
    expect(gates.edit).toBe(true);
  });

  it("requires platform.companies.MANAGE for create/edit affordances", () => {
    const gates = getCompanyActionGates(
      companyReadPermissions,
      { companyId: 10, isSuperAdmin: true },
      10,
    );

    expect(gates.view).toBe(true);
    expect(gates.create).toBe(false);
    expect(gates.edit).toBe(false);
  });

  it("blocks cross-company company patch affordance", () => {
    const gates = getCompanyActionGates(
      companyManagePermissions,
      { companyId: 10, isSuperAdmin: true },
      99,
    );

    expect(gates.create).toBe(true);
    expect(gates.edit).toBe(false);
  });

  it("requires platform.outlets.MANAGE for outlet create/edit", () => {
    const gates = getOutletActionGates(
      outletManagePermissions,
      { companyId: 10, isSuperAdmin: false },
      10,
    );

    expect(gates.view).toBe(true);
    expect(gates.create).toBe(true);
    expect(gates.edit).toBe(true);
  });

  it("blocks outlet operations outside actor company for non-SUPER_ADMIN", () => {
    const gates = getOutletActionGates(
      outletManagePermissions,
      { companyId: 10, isSuperAdmin: false },
      99,
    );

    expect(gates.view).toBe(false);
    expect(gates.create).toBe(false);
    expect(gates.edit).toBe(false);
  });
});

describe("scope display helpers", () => {
  it("marks deleted or explicitly inactive companies as inactive", () => {
    expect(isCompanyInactive({ id: 1, code: "A", name: "A", deleted_at: "2026-01-01T00:00:00.000Z" })).toBe(true);
    expect(isCompanyInactive({ id: 2, code: "B", name: "B", is_active: false })).toBe(true);
    expect(companyStatusLabel({ id: 3, code: "C", name: "C" })).toBe("Active");
  });

  it("uses current outlet switcher state in scope summary", () => {
    const scope = buildScopeSummary({
      company: { id: 10, code: "TEN", name: "Tenant" },
      fallbackCompanyId: 99,
      currentOutlet: { id: 7, code: "MAIN", name: "Main Outlet" },
    });

    expect(scope.companyId).toBe(10);
    expect(scope.companyName).toBe("Tenant");
    expect(scope.outletName).toBe("Main Outlet");
    expect(scope.status).toBe("Active");
  });

  it("formats outlet active state", () => {
    expect(outletStatusLabel({ id: 1, company_id: 10, code: "A", name: "A", is_active: true })).toBe("Active");
    expect(outletStatusLabel({ id: 2, company_id: 10, code: "B", name: "B", is_active: false })).toBe("Inactive");
  });

  it("normalizes empty admin timezone input to the deterministic UTC default", () => {
    expect(DEFAULT_ADMIN_TIMEZONE).toBe("UTC");
    expect(normalizeAdminTimezone(undefined)).toBe("UTC");
    expect(normalizeAdminTimezone(null)).toBe("UTC");
    expect(normalizeAdminTimezone("   ")).toBe("UTC");
    expect(normalizeAdminTimezone("Asia/Jakarta")).toBe("Asia/Jakarta");
  });
});

describe("TanStack Query cache keys", () => {
  it("exposes canonical invalidation resources for mutations", () => {
    expect(mutationInvalidationResource("company")).toBe("companies");
    expect(mutationInvalidationResource("outlet")).toBe("outlets");
  });

  it("uses platform resource query keys for company/outlet caches", () => {
    expect(companyQueryKeys.all).toEqual(["platform", "companies"]);
    expect(companyQueryKeys.list()).toEqual(["platform", "companies", "list"]);
    expect(outletQueryKeys.list(10)).toEqual(["platform", "outlets", "list", { companyId: 10 }]);
  });
});
