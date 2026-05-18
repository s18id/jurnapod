import { describe, expect, it, vi } from "vitest";

import {
  buildExportRequestPath,
  buildExportSearchParams,
  describeExportError,
  enforceAtLeastOneColumn,
  readStreamingBlob,
  resolveExportExecutionConfig,
} from "@/hooks/use-export";

describe("export download helpers", () => {
  it("builds backend export query parameters from current scope", () => {
    const params = buildExportSearchParams({
      format: "xlsx",
      selectedColumns: ["sku", "name"],
      filters: {
        search: "coffee",
        type: "PRODUCT",
        groupId: 42,
        status: true,
        outletId: 7,
        viewMode: "outlet",
        scopeFilter: "override",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-18",
      },
    });

    expect(params.get("format")).toBe("xlsx");
    expect(params.get("columns")).toBe("sku,name");
    expect(params.get("search")).toBe("coffee");
    expect(params.get("type")).toBe("PRODUCT");
    expect(params.get("group_id")).toBe("42");
    expect(params.get("is_active")).toBe("true");
    expect(params.get("outlet_id")).toBe("7");
    expect(params.get("view_mode")).toBe("outlet");
    expect(params.get("scope_filter")).toBe("override");
    expect(params.get("date_from")).toBe("2026-05-01");
    expect(params.get("date_to")).toBe("2026-05-18");
  });

  it("tracks streaming bytes and percentage from Content-Length", async () => {
    const progress = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4, 5]));
        controller.close();
      },
    });
    const response = new Response(stream, { headers: { "content-length": "5" } });

    const blob = await readStreamingBlob(response, progress);

    expect(blob.size).toBe(5);
    expect(progress).toHaveBeenNthCalledWith(1, { bytesReceived: 2, totalBytes: 5, percentage: 40 });
    expect(progress).toHaveBeenNthCalledWith(2, { bytesReceived: 5, totalBytes: 5, percentage: 100 });
  });

  it("maps HTTP and network failures to retry-safe messages", () => {
    expect(describeExportError(undefined, new Response(null, { status: 400 }))).toContain("Invalid export selection");
    expect(describeExportError(undefined, new Response(null, { status: 403 }))).toContain("permission");
    expect(describeExportError(new TypeError("Failed to fetch"))).toContain("network error");
  });

  it("resolves retry execution with the previous export params", () => {
    const previous = {
      format: "csv" as const,
      selectedColumns: ["sku"],
      filters: { search: "old" },
    };
    const current = {
      format: "xlsx" as const,
      selectedColumns: ["name"],
      filters: { search: "new" },
    };

    const retryConfig = resolveExportExecutionConfig({ current, retryConfig: previous });

    expect(retryConfig).toEqual(previous);
    expect(buildExportRequestPath("items", retryConfig)).toBe("/export/items?format=csv&columns=sku&search=old");
  });

  it("keeps at least one export column selected", () => {
    expect(enforceAtLeastOneColumn([], ["sku", "name"])).toEqual(["sku"]);
    expect(enforceAtLeastOneColumn(["name"], ["sku", "name"])).toEqual(["name"]);
  });
});
