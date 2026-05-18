import { describe, expect, it } from "vitest";

import {
  buildExportScopeChips,
  clearExportScopeFilter,
  formatBytes,
  getExportDialogLayout,
  getLargeExportWarningMessage,
  getProgressDisplay,
  shouldShowLargeExportWarning,
} from "@/components/export-dialog-helpers";
import { canShowInventoryExport } from "@/lib/export-permissions";
import type { SessionUser } from "@/lib/session";

function makeUser(mask: number): SessionUser {
  return {
    id: 1,
    company_id: 10,
    email: "test@example.com",
    roles: [],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [],
    permissions: [{ module: "inventory", resource: "items", mask }],
  };
}

describe("ExportDialog helpers", () => {
  it("renders inherited item filter scope as clearable chips", () => {
    const chips = buildExportScopeChips("items", {
      search: "coffee",
      type: "PRODUCT",
      groupId: 5,
      status: true,
    });

    expect(chips).toEqual([
      { key: "search", label: "Search", value: "coffee" },
      { key: "type", label: "Type", value: "PRODUCT" },
      { key: "groupId", label: "Group", value: "5" },
      { key: "status", label: "Status", value: "Active" },
    ]);
  });

  it("clears nullable scope fields without mutating unrelated filters", () => {
    const cleared = clearExportScopeFilter(
      { search: "coffee", status: false, scopeFilter: "default" },
      "status"
    );

    expect(cleared).toEqual({ search: "coffee", status: null, scopeFilter: "default" });
  });

  it("formats determinate and indeterminate progress display", () => {
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(getProgressDisplay({ phase: "preparing" })).toEqual({
      value: undefined,
      label: "Preparing export...",
      indeterminate: true,
    });
    expect(getProgressDisplay({ phase: "streaming", bytesReceived: 512, totalBytes: 1024, percentage: 50 })).toEqual({
      value: 50,
      label: "Downloading... 512 B of 1.0 KiB",
      indeterminate: false,
    });
  });

  it("surfaces large export Blob fallback risk for high-row and unknown-length streams", () => {
    expect(shouldShowLargeExportWarning({ estimatedRowCount: 10_000, progress: null })).toBe(true);
    expect(shouldShowLargeExportWarning({
      estimatedRowCount: 25,
      progress: { phase: "streaming", bytesReceived: 2048, totalBytes: null, percentage: null },
    })).toBe(true);
    expect(getLargeExportWarningMessage(12_500)).toContain("browser memory");
    expect(getLargeExportWarningMessage(12_500)).toContain("50,000 rows");
  });

  it("maps mobile viewport to full-screen export dialog layout", () => {
    expect(getExportDialogLayout(true)).toEqual({
      fullScreen: true,
      contentWrap: "wrap",
      dividerOrientation: "horizontal",
      actionsGrow: true,
    });
    expect(getExportDialogLayout(false).fullScreen).toBe(false);
  });

  it("gates export visibility on inventory.items.READ", () => {
    expect(canShowInventoryExport(makeUser(1))).toBe(true);
    expect(canShowInventoryExport(makeUser(0))).toBe(false);
  });
});
