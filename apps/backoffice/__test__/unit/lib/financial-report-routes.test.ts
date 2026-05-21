// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, expect, it } from "vitest";

import { APP_ROUTES, findRoute } from "@/app/routes";
import { getFinancialReportRoutePageExport, ROUTE_PATHS } from "@/app/router/routes";
import { PERMISSION_BITS } from "@/lib/auth/permissions";

describe("financial report route metadata and render wiring", () => {
  it("registers accounting report routes with accounting.reports ANALYZE", () => {
    for (const path of [ROUTE_PATHS.TRIAL_BALANCE, ROUTE_PATHS.GENERAL_LEDGER, ROUTE_PATHS.RECEIVABLES_AGEING]) {
      expect(findRoute(path)?.permission).toEqual({
        module: "accounting",
        resource: "reports",
        permissionMask: PERMISSION_BITS.ANALYZE,
      });
    }
  });

  it("registers AP ageing as purchasing.reports ANALYZE and purchasing-module gated", () => {
    const route = findRoute(ROUTE_PATHS.PURCHASING_AP_AGING);

    expect(route?.requiredModule).toBe("purchasing");
    expect(route?.permission).toEqual({
      module: "purchasing",
      resource: "reports",
      permissionMask: PERMISSION_BITS.ANALYZE,
    });
  });

  it("maps financial report routes to the page exports consumed by AppRouter", () => {
    expect(getFinancialReportRoutePageExport(ROUTE_PATHS.TRIAL_BALANCE)).toBe("TrialBalancePage");
    expect(getFinancialReportRoutePageExport(ROUTE_PATHS.GENERAL_LEDGER)).toBe("GeneralLedgerPage");
    expect(getFinancialReportRoutePageExport(ROUTE_PATHS.PURCHASING_AP_AGING)).toBe("APAgingPage");
    expect(getFinancialReportRoutePageExport(ROUTE_PATHS.RECEIVABLES_AGEING)).toBe("ReceivablesAgeingPage");
  });

  it("keeps Trial Balance separate from Journals navigation", () => {
    expect(APP_ROUTES.find((item) => item.path === ROUTE_PATHS.TRIAL_BALANCE)?.label).toBe("Trial Balance");
    expect(APP_ROUTES.find((item) => item.path === ROUTE_PATHS.JOURNALS)?.label).toBe("Journals");
  });
});
