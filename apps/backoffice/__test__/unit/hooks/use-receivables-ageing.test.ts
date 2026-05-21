// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, expect, it, vi } from "vitest";

import {
  aggregateReceivablesAgeingCustomers,
  buildReceivablesAgeingReportPath,
} from "../../../src/hooks/use-receivables-ageing";
import {
  buildReceivablesAgeingExportPath,
  canExportReceivablesAgeing,
  executeReceivablesAgeingCsvExport,
  formatReceivablesExportError,
} from "../../../src/components/reports/receivables-ageing/ageing-export-button";
import { buildNextReceivablesAgeingFilters } from "../../../src/components/reports/receivables-ageing/ageing-filters";
import type { apiStreamingRequest } from "../../../src/lib/api-client";
import type { downloadStreamingResponse } from "../../../src/hooks/use-export";
import type { ReceivablesAgeingReport } from "../../../src/types/reports/receivables-ageing";

describe("useReceivablesAgeing contract helpers", () => {
  it("formats streaming export auth and server errors for user-visible display", () => {
    expect(formatReceivablesExportError(401)).toContain("session expired");
    expect(formatReceivablesExportError(403)).toContain("accounting.reports ANALYZE");
    expect(formatReceivablesExportError(500)).toContain("server");
  });

  it("builds the verified receivables ageing API path without unsupported customer_id", () => {
    expect(buildReceivablesAgeingReportPath({ asOfDate: "2026-05-21", outletId: 12 })).toBe(
      "/reports/receivables-ageing?as_of_date=2026-05-21&outlet_id=12"
    );
    expect(buildReceivablesAgeingReportPath({ asOfDate: "2026-05-21", outletId: null })).toBe(
      "/reports/receivables-ageing?as_of_date=2026-05-21"
    );
  });

  it("builds the verified receivables ageing CSV export path", () => {
    expect(buildReceivablesAgeingExportPath({ asOfDate: "2026-05-21", outletId: 12 })).toBe(
      "/reports/receivables-ageing/export?as_of_date=2026-05-21&format=csv&outlet_id=12"
    );
    expect(buildReceivablesAgeingExportPath({ asOfDate: "2026-05-21", outletId: null })).toBe(
      "/reports/receivables-ageing/export?as_of_date=2026-05-21&format=csv"
    );
  });

  it("keeps ageing filters controlled by deriving next parent filter state", () => {
    const current = { asOfDate: "2026-05-21", outletId: 12 };
    expect(buildNextReceivablesAgeingFilters(current, { asOfDate: "2026-05-31" })).toEqual({
      asOfDate: "2026-05-31",
      outletId: 12,
    });
    expect(buildNextReceivablesAgeingFilters(current, { outletId: null })).toEqual({
      asOfDate: "2026-05-21",
      outletId: null,
    });
  });

  it("aggregates API customer_display_name fields", () => {
    const report: ReceivablesAgeingReport = {
      filters: { outlet_ids: [1], as_of_date: "2026-05-21" },
      buckets: { current: 10, "1_30_days": 20, "31_60_days": 0, "61_90_days": 0, over_90_days: 0 },
      total_outstanding: 30,
      invoices: [
        {
          invoice_id: 1,
          invoice_no: "SI-1",
          customer_id: 7,
          customer_code: "C-7",
          customer_type: 1,
          customer_display_name: "Customer Seven",
          outlet_id: 1,
          outlet_name: "Main",
          invoice_date: "2026-05-01",
          due_date: "2026-05-10",
          outstanding_amount: 20,
          days_overdue: 11,
          age_bucket: "1_30_days",
          overdue: true,
        },
        {
          invoice_id: 2,
          invoice_no: "SI-2",
          customer_id: 7,
          customer_code: "C-7",
          customer_type: 1,
          customer_display_name: "Customer Seven",
          outlet_id: 1,
          outlet_name: "Main",
          invoice_date: "2026-05-20",
          due_date: "2026-05-30",
          outstanding_amount: 10,
          days_overdue: 0,
          age_bucket: "current",
          overdue: false,
        },
      ],
    };

    expect(aggregateReceivablesAgeingCustomers(report)).toEqual([
      {
        customer_key: "customer:7",
        customer_id: 7,
        customer_name: "Customer Seven",
        customer_code: "C-7",
        current: 10,
        bucket_1_30: 20,
        bucket_31_60: 0,
        bucket_61_90: 0,
        bucket_90_plus: 0,
        total_outstanding: 30,
      },
    ]);
  });

  it("allows receivables ageing CSV export for an auditable zero-row report", () => {
    const report: ReceivablesAgeingReport = {
      filters: { outlet_ids: [], as_of_date: "2026-05-21" },
      buckets: { current: 0, "1_30_days": 0, "31_60_days": 0, "61_90_days": 0, over_90_days: 0 },
      total_outstanding: 0,
      invoices: [],
    };

    expect(canExportReceivablesAgeing(null)).toBe(false);
    expect(canExportReceivablesAgeing(report)).toBe(true);
  });

  it("executes receivables ageing streaming export and uses server filename", async () => {
    const response = new Response("customer,total\n", {
      status: 200,
      headers: { "content-disposition": 'attachment; filename="receivables-ageing-2026-05-21.csv"' },
    });
    const request = vi.fn(async () => response) as unknown as typeof apiStreamingRequest;
    const download = vi.fn(async () => ({ fileSize: 15, usedBlobFallback: true })) as unknown as typeof downloadStreamingResponse;

    await expect(executeReceivablesAgeingCsvExport({
      path: "/reports/receivables-ageing/export?as_of_date=2026-05-21&format=csv",
      fallbackFilename: "fallback.csv",
      request,
      download,
    })).resolves.toEqual({ ok: true });

    expect(request).toHaveBeenCalledWith(
      "/reports/receivables-ageing/export?as_of_date=2026-05-21&format=csv",
      { method: "GET" }
    );
    expect(download).toHaveBeenCalledWith(response, "receivables-ageing-2026-05-21.csv", "csv", expect.any(Function));
  });

  it("returns visible receivables ageing export errors for 401, 403, 500, and network failures", async () => {
    const download = vi.fn(async () => ({ fileSize: 0, usedBlobFallback: true })) as unknown as typeof downloadStreamingResponse;
    for (const [status, messagePart] of [
      [401, "session expired"],
      [403, "accounting.reports ANALYZE"],
      [500, "server"],
    ] as const) {
      const request = vi.fn(async () => new Response(null, { status })) as unknown as typeof apiStreamingRequest;
      const result = await executeReceivablesAgeingCsvExport({
        path: "/reports/receivables-ageing/export?as_of_date=2026-05-21&format=csv",
        fallbackFilename: "receivables-ageing.csv",
        request,
        download,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(messagePart);
    }

    const request = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof apiStreamingRequest;
    await expect(executeReceivablesAgeingCsvExport({
      path: "/reports/receivables-ageing/export?as_of_date=2026-05-21&format=csv",
      fallbackFilename: "receivables-ageing.csv",
      request,
      download,
    })).resolves.toEqual({ ok: false, error: "Failed to fetch" });
  });
});
