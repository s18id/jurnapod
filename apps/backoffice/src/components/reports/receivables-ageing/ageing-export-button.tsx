// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Button, Stack, Text } from "@mantine/core";
import { IconFileTypeCsv } from "@tabler/icons-react";
import { useState } from "react";

import type { ReceivablesAgeingReport } from "../../../types/reports/receivables-ageing";
import { apiStreamingRequest } from "../../../lib/api-client";
import { downloadStreamingResponse } from "../../../hooks/use-export";

export function formatReceivablesExportError(status: number): string {
  if (status === 401) return "Your session expired. Sign in again before exporting receivables ageing.";
  if (status === 403) return "You do not have accounting.reports ANALYZE permission to export receivables ageing.";
  if (status >= 500) return "Receivables ageing export failed on the server. Try again or narrow the report filters.";
  return `Receivables ageing export failed with status ${status}.`;
}

async function readExportError(response: Response): Promise<string> {
  const fallback = formatReceivablesExportError(response.status);
  const payload = await response.json().catch(() => null) as { error?: { message?: string }; data?: { message?: string }; message?: string } | null;
  return payload?.error?.message ?? payload?.data?.message ?? payload?.message ?? fallback;
}

export function canExportReceivablesAgeing(report: ReceivablesAgeingReport | null): boolean {
  return report !== null;
}

export function buildReceivablesAgeingExportPath(input: { asOfDate: string; outletId?: number | null }): string {
  const params = new URLSearchParams({ as_of_date: input.asOfDate, format: "csv" });
  if (input.outletId) {
    params.set("outlet_id", String(input.outletId));
  }
  return `/reports/receivables-ageing/export?${params.toString()}`;
}

export async function executeReceivablesAgeingCsvExport(input: {
  path: string;
  fallbackFilename: string;
  request: typeof apiStreamingRequest;
  download: typeof downloadStreamingResponse;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await input.request(input.path, { method: "GET" });
    if (!response.ok) {
      return { ok: false, error: await readExportError(response) };
    }

    const contentDisposition = response.headers.get("content-disposition");
    const filenameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const filename = filenameMatch?.[1]?.replace(/["']/g, "") ?? input.fallbackFilename;
    await input.download(response, filename, "csv", () => undefined);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error during receivables ageing export." };
  }
}

interface AgeingExportButtonProps {
  report: ReceivablesAgeingReport | null;
  asOfDate: string;
  outletId?: number | null;
  outletName?: string;
  isLoading?: boolean;
}

/**
 * Export receivables ageing report to CSV
 */
export function AgeingExportButton({
  report,
  asOfDate,
  outletId,
  outletName = "All",
  isLoading,
}: AgeingExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!report) return;

    setExporting(true);
    setExportError(null);
    try {
      const result = await executeReceivablesAgeingCsvExport({
        path: buildReceivablesAgeingExportPath({ asOfDate, outletId }),
        fallbackFilename: `receivables-ageing-${asOfDate}.csv`,
        request: apiStreamingRequest,
        download: downloadStreamingResponse,
      });
      if (!result.ok) setExportError(result.error);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Network error during receivables ageing export.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Stack gap={4} align="flex-end">
      <Button
        variant="light"
        leftSection={<IconFileTypeCsv size={16} />}
        onClick={handleExport}
        loading={exporting || isLoading}
        disabled={!canExportReceivablesAgeing(report)}
        title={`Export ${outletName} receivables ageing CSV`}
      >
        Export CSV
      </Button>
      {exportError ? <Text size="xs" c="red" role="alert">{exportError}</Text> : null}
    </Stack>
  );
}
