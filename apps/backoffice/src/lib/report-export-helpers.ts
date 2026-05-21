// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { fromUtcIso, nowUTC } from "@jurnapod/shared";
import { Temporal } from "@js-temporal/polyfill";

import { apiStreamingRequest } from "./api-client";
import { downloadStreamingResponse } from "../hooks/use-export";

type QueryValue = string | number | null | undefined;

function appendQuery(params: URLSearchParams, key: string, value: QueryValue): void {
  if (value === null || value === undefined || value === "") return;
  params.set(key, String(value));
}

function buildPath(path: string, entries: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    appendQuery(params, key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function currentDateOnly(): string {
  return fromUtcIso.dateOnly(nowUTC());
}

export function currentYearStartDateOnly(): string {
  const current = Temporal.PlainDate.from(currentDateOnly());
  return Temporal.PlainDate.from({ year: current.year, month: 1, day: 1 }).toString();
}

export function daysBeforeCurrentDateOnly(days: number): string {
  return Temporal.PlainDate.from(currentDateOnly()).subtract({ days }).toString();
}

export type TrialBalanceQuery = {
  outletId: number;
  dateFrom: string;
  dateTo: string;
};

export function buildTrialBalanceReportPath(query: TrialBalanceQuery): string {
  return buildPath("/reports/trial-balance", {
    outlet_id: query.outletId,
    date_from: query.dateFrom,
    date_to: query.dateTo,
  });
}

export function buildTrialBalanceExportPath(query: TrialBalanceQuery): string {
  return buildPath("/reports/trial-balance/export", {
    outlet_id: query.outletId,
    date_from: query.dateFrom,
    date_to: query.dateTo,
    format: "csv",
  });
}

export type GeneralLedgerQuery = {
  outletId: number;
  accountId: number;
  dateFrom: string;
  dateTo: string;
  lineLimit: number;
  lineOffset: number;
};

export function buildGeneralLedgerReportPath(query: GeneralLedgerQuery): string {
  return buildPath("/reports/general-ledger", {
    outlet_id: query.outletId,
    account_id: query.accountId > 0 ? query.accountId : undefined,
    date_from: query.dateFrom,
    date_to: query.dateTo,
    line_limit: query.lineLimit,
    line_offset: query.lineOffset,
  });
}

export function buildGeneralLedgerExportPath(query: GeneralLedgerQuery): string {
  return buildPath("/reports/general-ledger/export", {
    outlet_id: query.outletId,
    account_id: query.accountId > 0 ? query.accountId : undefined,
    date_from: query.dateFrom,
    date_to: query.dateTo,
    line_limit: query.lineLimit,
    line_offset: query.lineOffset,
    format: "csv",
  });
}

export type APAgingQuery = {
  asOfDate: string;
};

export function buildAPAgingReportPath(query: APAgingQuery): string {
  return buildPath("/purchasing/reports/ap-aging", {
    as_of_date: query.asOfDate,
  });
}

export function buildAPAgingExportPath(query: APAgingQuery): string {
  return buildPath("/purchasing/reports/ap-aging/export", {
    as_of_date: query.asOfDate,
    format: "csv",
  });
}

export function extractCsvFilename(contentDisposition: string | null, fallback: string): string {
  const filenameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  return filenameMatch?.[1]?.replace(/["']/g, "") ?? fallback;
}

export function formatReportExportError(reportName: string, status: number): string {
  if (status === 401) return "Your session expired. Sign in again before exporting the report.";
  if (status === 403) return `You do not have permission to export ${reportName}.`;
  if (status >= 500) return `${reportName} export failed on the server. Try again or narrow the report filters.`;
  return `${reportName} export failed with status ${status}.`;
}

export async function readReportExportError(response: Response, reportName: string): Promise<string> {
  const fallback = formatReportExportError(reportName, response.status);
  const payload = await response.json().catch(() => null) as { error?: { message?: string }; data?: { message?: string }; message?: string } | null;
  return payload?.error?.message ?? payload?.data?.message ?? payload?.message ?? fallback;
}

export async function executeReportCsvExport(input: {
  path: string;
  reportName: string;
  fallbackFilename: string;
  request: typeof apiStreamingRequest;
  download: typeof downloadStreamingResponse;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await input.request(input.path, { method: "GET" });
    if (!response.ok) {
      return { ok: false, error: await readReportExportError(response, input.reportName) };
    }
    const filename = extractCsvFilename(response.headers.get("content-disposition"), input.fallbackFilename);
    await input.download(response, filename, "csv", () => undefined);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : `${input.reportName} export failed due to a network error.` };
  }
}
