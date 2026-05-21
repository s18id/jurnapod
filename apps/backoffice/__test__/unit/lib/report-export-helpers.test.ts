// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAPAgingExportPath,
  buildAPAgingReportPath,
  buildGeneralLedgerExportPath,
  buildGeneralLedgerReportPath,
  buildTrialBalanceExportPath,
  buildTrialBalanceReportPath,
  currentDateOnly,
  currentYearStartDateOnly,
  daysBeforeCurrentDateOnly,
  executeReportCsvExport,
  extractCsvFilename,
  formatReportExportError,
  readReportExportError,
} from "@/lib/report-export-helpers";
import { APP_ROUTES } from "@/app/routes";
import { getFinancialReportRoutePageExport, ROUTE_PATHS } from "@/app/router/routes";
import { PERMISSION_BITS } from "@/lib/auth/permissions";
import type { apiStreamingRequest } from "@/lib/api-client";
import type { downloadStreamingResponse } from "@/hooks/use-export";

describe("report export helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds trial balance JSON and CSV paths from contract fields", () => {
    const query = { outletId: 7, dateFrom: "2026-01-01", dateTo: "2026-01-31" };

    expect(buildTrialBalanceReportPath(query)).toBe(
      "/reports/trial-balance?outlet_id=7&date_from=2026-01-01&date_to=2026-01-31"
    );
    expect(buildTrialBalanceExportPath(query)).toBe(
      "/reports/trial-balance/export?outlet_id=7&date_from=2026-01-01&date_to=2026-01-31&format=csv"
    );
  });

  it("builds general ledger JSON and CSV paths without inventing pagination totals", () => {
    const query = {
      outletId: 9,
      accountId: 12,
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      lineLimit: 50,
      lineOffset: 100,
    };

    expect(buildGeneralLedgerReportPath(query)).toBe(
      "/reports/general-ledger?outlet_id=9&account_id=12&date_from=2026-02-01&date_to=2026-02-28&line_limit=50&line_offset=100"
    );
    expect(buildGeneralLedgerExportPath(query)).toBe(
      "/reports/general-ledger/export?outlet_id=9&account_id=12&date_from=2026-02-01&date_to=2026-02-28&line_limit=50&line_offset=100&format=csv"
    );
    const params = new URLSearchParams(buildGeneralLedgerExportPath(query).split("?")[1]);
    expect(params.get("line_limit")).toBe("50");
    expect(params.get("line_offset")).toBe("100");
    expect(params.has("total")).toBe(false);
    expect(params.has("has_more")).toBe(false);
    expect(params.has("page")).toBe(false);
  });

  it("omits invalid general ledger account ids from contract paths", () => {
    expect(buildGeneralLedgerReportPath({
      outletId: 9,
      accountId: 0,
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      lineLimit: 50,
      lineOffset: 0,
    })).toBe(
      "/reports/general-ledger?outlet_id=9&date_from=2026-02-01&date_to=2026-02-28&line_limit=50&line_offset=0"
    );
  });

  it("builds AP ageing JSON and CSV paths using purchasing contract fields", () => {
    expect(buildAPAgingReportPath({ asOfDate: "2026-03-31" })).toBe(
      "/purchasing/reports/ap-aging?as_of_date=2026-03-31"
    );
    expect(buildAPAgingExportPath({ asOfDate: "2026-03-31" })).toBe(
      "/purchasing/reports/ap-aging/export?as_of_date=2026-03-31&format=csv"
    );
  });

  it("derives deterministic date defaults through canonical helpers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T10:30:00.000Z"));

    expect(currentDateOnly()).toBe("2026-05-21");
    expect(currentYearStartDateOnly()).toBe("2026-01-01");
    expect(daysBeforeCurrentDateOnly(7)).toBe("2026-05-14");
  });

  it("extracts CSV filenames and exposes visible export errors", async () => {
    expect(extractCsvFilename('attachment; filename="trial-balance-2026-01-31.csv"', "fallback.csv")).toBe(
      "trial-balance-2026-01-31.csv"
    );
    expect(formatReportExportError("AP ageing", 403)).toBe("You do not have permission to export AP ageing.");

    const response = new Response(JSON.stringify({ error: { message: "Narrow the filters" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    await expect(readReportExportError(response, "Trial balance")).resolves.toBe("Narrow the filters");
  });

  it("executes report CSV exports with streaming request and content-disposition filename", async () => {
    const response = new Response("a,b\n1,2\n", {
      status: 200,
      headers: { "content-disposition": 'attachment; filename="general-ledger-2026-02-28.csv"' },
    });
    const request = vi.fn(async () => response) as unknown as typeof apiStreamingRequest;
    const download = vi.fn(async () => ({ fileSize: 8, usedBlobFallback: true })) as unknown as typeof downloadStreamingResponse;

    await expect(executeReportCsvExport({
      path: "/reports/general-ledger/export?line_limit=50&line_offset=0&format=csv",
      reportName: "General ledger",
      fallbackFilename: "fallback.csv",
      request,
      download,
    })).resolves.toEqual({ ok: true });

    expect(request).toHaveBeenCalledWith(
      "/reports/general-ledger/export?line_limit=50&line_offset=0&format=csv",
      { method: "GET" }
    );
    expect(download).toHaveBeenCalledWith(response, "general-ledger-2026-02-28.csv", "csv", expect.any(Function));
  });

  it("returns visible report CSV export errors for auth, server, and network failures", async () => {
    const download = vi.fn(async () => ({ fileSize: 0, usedBlobFallback: true })) as unknown as typeof downloadStreamingResponse;
    const forbiddenRequest = vi.fn(async () => new Response(null, { status: 403 })) as unknown as typeof apiStreamingRequest;
    await expect(executeReportCsvExport({
      path: "/reports/trial-balance/export?format=csv",
      reportName: "Trial balance",
      fallbackFilename: "trial-balance.csv",
      request: forbiddenRequest,
      download,
    })).resolves.toEqual({ ok: false, error: "You do not have permission to export Trial balance." });

    const serverRequest = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof apiStreamingRequest;
    await expect(executeReportCsvExport({
      path: "/purchasing/reports/ap-aging/export?format=csv",
      reportName: "AP ageing",
      fallbackFilename: "ap-aging.csv",
      request: serverRequest,
      download,
    })).resolves.toEqual({ ok: false, error: "AP ageing export failed on the server. Try again or narrow the report filters." });

    const networkRequest = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof apiStreamingRequest;
    await expect(executeReportCsvExport({
      path: "/reports/trial-balance/export?format=csv",
      reportName: "Trial balance",
      fallbackFilename: "trial-balance.csv",
      request: networkRequest,
      download,
    })).resolves.toEqual({ ok: false, error: "Failed to fetch" });
  });
});

describe("financial report route metadata", () => {
  it("registers accounting report routes with accounting.reports ANALYZE", () => {
    for (const path of ["/trial-balance", "/general-ledger", "/receivables-ageing"]) {
      const route = APP_ROUTES.find((item) => item.path === path);
      expect(route?.permission).toEqual({
        module: "accounting",
        resource: "reports",
        permissionMask: PERMISSION_BITS.ANALYZE,
      });
    }
  });

  it("registers AP ageing with purchasing.reports ANALYZE", () => {
    const route = APP_ROUTES.find((item) => item.path === "/purchasing/ap-aging");

    expect(route?.requiredModule).toBe("purchasing");
    expect(route?.permission).toEqual({
      module: "purchasing",
      resource: "reports",
      permissionMask: PERMISSION_BITS.ANALYZE,
    });
  });

  it("maps financial report routes to exported page names used by router wiring", () => {
    expect(getFinancialReportRoutePageExport(ROUTE_PATHS.TRIAL_BALANCE)).toBe("TrialBalancePage");
    expect(getFinancialReportRoutePageExport(ROUTE_PATHS.GENERAL_LEDGER)).toBe("GeneralLedgerPage");
    expect(getFinancialReportRoutePageExport(ROUTE_PATHS.PURCHASING_AP_AGING)).toBe("APAgingPage");
    expect(getFinancialReportRoutePageExport(ROUTE_PATHS.RECEIVABLES_AGEING)).toBe("ReceivablesAgeingPage");
  });

  it("registers trial balance as a separate route and keeps journals label scoped to journals", () => {
    expect(APP_ROUTES.find((item) => item.path === "/trial-balance")?.label).toBe("Trial Balance");
    expect(APP_ROUTES.find((item) => item.path === "/journals")?.label).toBe("Journals");
  });
});
