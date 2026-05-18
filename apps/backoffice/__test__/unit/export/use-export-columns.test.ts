import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockApiRequest } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiRequest: mockApiRequest,
}));

import { fetchExportColumns, normalizeExportColumnsResponse } from "@/hooks/use-export-columns";

describe("useExportColumns API helpers", () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
  });

  it("fetches dynamic item export columns from the backend contract", async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        entityType: "items",
        columns: [
          { key: "sku", header: "SKU", fieldType: "string" },
          { key: "is_active", header: "Active", fieldType: "boolean" },
        ],
        defaultColumns: ["sku"],
      },
    });

    const result = await fetchExportColumns("items");

    expect(mockApiRequest).toHaveBeenCalledWith("/export/items/columns");
    expect(result.columns).toEqual([
      expect.objectContaining({ key: "sku", group: "Basic Info" }),
      expect.objectContaining({ key: "is_active", group: "Status" }),
    ]);
    expect(result.defaultColumns).toEqual(["sku"]);
  });

  it("preserves backend-provided groups and falls back missing fieldType to string", () => {
    const result = normalizeExportColumnsResponse("prices", {
      success: true,
      data: {
        entityType: "prices",
        columns: [{ key: "custom", header: "Custom", group: "Custom Group" }],
        defaultColumns: ["custom"],
      },
    });

    expect(result.columns[0]).toEqual({
      key: "custom",
      header: "Custom",
      group: "Custom Group",
      fieldType: "string",
    });
  });
});
