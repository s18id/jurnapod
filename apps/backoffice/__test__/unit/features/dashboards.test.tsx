import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getDashboardRedirectTarget, normalizeHashPath } from "@/app/routes";
import { DashboardCard } from "@/features/dashboards/dashboard-card";
import { getDashboardPermissions, GlobalAdminOverview, type DashboardPermissions } from "@/features/dashboards/global-admin-overview";
import { getScopedDraftCount, getScopedDraftStoragePrefix } from "@/features/dashboards/my-work-panel";
import { getVisibleRefetchInterval } from "@/hooks/use-health-status";
import type { SessionUser } from "@/lib/session";

function render(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

function makeUser(permissions: SessionUser["permissions"]): SessionUser {
  return {
    id: 22,
    company_id: 10,
    email: "dashboard@example.com",
    roles: ["OWNER"],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [],
    permissions,
  };
}

function query(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    dataUpdatedAt: 0,
    ...overrides,
  };
}

const basePermissions: DashboardPermissions = {
  canReadOperations: false,
  canViewPendingExceptions: false,
  canViewAudit: false,
  canViewSettings: false,
  canViewInventory: false,
  canViewAccounting: false,
  canViewPurchasing: false,
};

describe("DashboardCard", () => {
  it("renders loading, empty, error, and API-gap states", () => {
    expect(render(<DashboardCard title="Loading card" state={{ status: "loading" }} />)).toContain("Loading…");
    expect(render(<DashboardCard title="Empty card" state={{ status: "empty", message: "All systems operational" }} />)).toContain("All systems operational");
    expect(render(<DashboardCard title="Error card" state={{ status: "error", message: "Service unavailable", retry: vi.fn() }} />)).toContain("Retry");
    expect(render(<DashboardCard title="Gap card" state={{ status: "api-gap", message: "Approvals workflow not available yet" }} />)).toContain("Approvals workflow not available yet");
  });
});

describe("Layered dashboard permissions", () => {
  it("uses resource-level permissions to show cards and links", () => {
    const user = makeUser([
      { module: "platform", resource: "operations", mask: 1 },
      { module: "platform", resource: "audit", mask: 1 },
      { module: "inventory", resource: "items", mask: 1 },
      { module: "accounting", resource: "reports", mask: 16 },
      { module: "purchasing", resource: "reports", mask: 16 },
      { module: "purchasing", resource: "suppliers", mask: 16 },
    ]);

    expect(getDashboardPermissions(user)).toMatchObject({
      canReadOperations: true,
      canViewAudit: true,
      canViewInventory: true,
      canViewAccounting: true,
      canViewPurchasing: true,
      canViewPendingExceptions: true,
    });
  });

  it("hides permission-gated cards without rendering permission errors", () => {
    const html = render(createElement(GlobalAdminOverview, {
      permissions: basePermissions,
      health: query({ data: { status: "ok", timestamp: "2026-05-19T00:00:00.000Z", subsystems: { database: { status: "healthy" } } } }),
      dashboard: {
        failedJobs: query(),
        recentJobs: query(),
        inventory: query(),
        accounting: query(),
        purchasing: query(),
        pendingExceptions: query(),
      },
    }));

    expect(html).toContain("System Health");
    expect(html).not.toContain("Failed Jobs");
    expect(html).not.toContain("Pending Exceptions");
    expect(html).not.toContain("Forbidden");
  });
});

describe("Dashboard routing and refresh", () => {
  it("redirects old built-in dashboard URLs to the new dashboard", () => {
    expect(getDashboardRedirectTarget("/admin/dashboard")).toBe("/dashboard");
    expect(getDashboardRedirectTarget("/admin/dashboard/financial")).toBe("/dashboard");
    expect(normalizeHashPath("#/admin/dashboard/sync")).toBe("/dashboard");
  });

  it("defaults auto-refresh to visible-tab polling only", () => {
    expect(getVisibleRefetchInterval(true, 60_000)).toBe(60_000);
    expect(getVisibleRefetchInterval(false, 60_000)).toBe(false);
  });
});

describe("My Work drafts", () => {
  it("counts drafts only for the scoped company and user", () => {
    const prefix = getScopedDraftStoragePrefix(10, 22);
    const keys = [
      `${prefix}invoice-1`,
      `${prefix}item-2`,
      `${getScopedDraftStoragePrefix(11, 22)}other-company`,
    ];
    const storage = {
      length: keys.length,
      key: (index: number) => keys[index] ?? null,
    } as Storage;

    expect(getScopedDraftCount(10, 22, storage)).toBe(2);
  });
});
