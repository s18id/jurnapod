// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ExportEntityType, ExportFilters, ExportProgress } from "../hooks/use-export";

export const LARGE_EXPORT_ROW_WARNING_THRESHOLD = 10_000;

export type ExportScopeChip = {
  key: keyof ExportFilters;
  label: string;
  value: string;
};

export function buildExportScopeChips(
  entityType: ExportEntityType,
  filters: ExportFilters
): ExportScopeChip[] {
  const chips: ExportScopeChip[] = [];

  if (filters.search?.trim()) {
    chips.push({ key: "search", label: "Search", value: filters.search.trim() });
  }
  if (filters.type) {
    chips.push({ key: "type", label: "Type", value: filters.type });
  }
  if (filters.groupId) {
    chips.push({ key: "groupId", label: "Group", value: String(filters.groupId) });
  }
  if (filters.status !== null && filters.status !== undefined) {
    chips.push({ key: "status", label: "Status", value: filters.status ? "Active" : "Inactive" });
  }
  if (filters.outletId) {
    chips.push({ key: "outletId", label: "Outlet", value: String(filters.outletId) });
  }
  if (filters.viewMode) {
    chips.push({ key: "viewMode", label: "View", value: filters.viewMode.replace("_", " ") });
  }
  if (filters.scopeFilter) {
    chips.push({ key: "scopeFilter", label: "Scope", value: filters.scopeFilter });
  }
  if (entityType === "prices" && filters.dateFrom) {
    chips.push({ key: "dateFrom", label: "From", value: filters.dateFrom });
  }
  if (entityType === "prices" && filters.dateTo) {
    chips.push({ key: "dateTo", label: "To", value: filters.dateTo });
  }

  return chips;
}

export function clearExportScopeFilter(filters: ExportFilters, key: keyof ExportFilters): ExportFilters {
  return {
    ...filters,
    [key]: key === "groupId" || key === "status" || key === "scopeFilter" ? null : undefined,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(1)} MiB`;
}

export function getProgressDisplay(progress: ExportProgress | null): {
  value: number | undefined;
  label: string;
  indeterminate: boolean;
} {
  if (!progress || progress.phase === "preparing") {
    return { value: undefined, label: "Preparing export...", indeterminate: true };
  }
  if (progress.phase === "complete") {
    return { value: 100, label: "Download complete", indeterminate: false };
  }
  if (progress.phase === "error") {
    return { value: 0, label: progress.error ?? "Export failed", indeterminate: false };
  }

  const bytesReceived = progress.bytesReceived ?? progress.bytesWritten ?? 0;
  if (progress.totalBytes && progress.percentage !== null && progress.percentage !== undefined) {
    return {
      value: progress.percentage,
      label: `Downloading... ${formatBytes(bytesReceived)} of ${formatBytes(progress.totalBytes)}`,
      indeterminate: false,
    };
  }

  return {
    value: undefined,
    label: bytesReceived > 0 ? `Downloading... ${formatBytes(bytesReceived)} received` : "Downloading...",
    indeterminate: true,
  };
}

export function shouldShowLargeExportWarning(input: {
  estimatedRowCount: number;
  progress: ExportProgress | null;
}): boolean {
  const hasHighEstimatedRows = input.estimatedRowCount >= LARGE_EXPORT_ROW_WARNING_THRESHOLD;
  const hasUnknownStreamingLength = input.progress?.phase === "streaming" && input.progress.totalBytes === null;
  return hasHighEstimatedRows || hasUnknownStreamingLength;
}

export function getLargeExportWarningMessage(estimatedRowCount: number): string {
  const rowText = estimatedRowCount > 0 ? ` Current scope estimates ${estimatedRowCount.toLocaleString()} rows.` : "";
  return `Large exports may use browser memory when direct-to-disk streaming is unavailable.${rowText} CSV is recommended for high-row exports; Excel is limited server-side to 50,000 rows.`;
}

export function getExportDialogLayout(isMobile: boolean): {
  fullScreen: boolean;
  contentWrap: "wrap" | "nowrap";
  dividerOrientation: "horizontal" | "vertical";
  actionsGrow: boolean;
} {
  return {
    fullScreen: isMobile,
    contentWrap: isMobile ? "wrap" : "nowrap",
    dividerOrientation: isMobile ? "horizontal" : "vertical",
    actionsGrow: isMobile,
  };
}
