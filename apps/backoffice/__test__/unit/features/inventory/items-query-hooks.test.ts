import { describe, expect, it } from "vitest";

import type { Item } from "@/hooks/use-items";
import {
  applyItemsClientFallback,
  buildItemsSearchParams,
  normalizeItemsListResponse,
  type ItemsQueryParams,
} from "@/hooks/use-items-query";

const baseParams: ItemsQueryParams = { page: 1, limit: 25, status: true };

const items: Item[] = [
  { id: 1, company_id: 10, sku: "PROD-001", name: "Product A", type: "PRODUCT", item_group_id: 1, barcode: null, barcode_type: null, cogs_account_id: null, inventory_asset_account_id: null, is_active: true, updated_at: "2026-05-18T00:00:00Z" },
  { id: 2, company_id: 10, sku: "ING-001", name: "Ingredient A", type: "INGREDIENT", item_group_id: 2, barcode: null, barcode_type: null, cogs_account_id: null, inventory_asset_account_id: null, is_active: true, updated_at: "2026-05-17T00:00:00Z" },
  { id: 3, company_id: 10, sku: "PROD-OLD", name: "Old Product", type: "PRODUCT", item_group_id: 1, barcode: null, barcode_type: null, cogs_account_id: null, inventory_asset_account_id: null, is_active: false, updated_at: "2026-05-16T00:00:00Z" },
];

describe("items TanStack Query helpers", () => {
  it("builds Story 67-2 list query parameters including search and pagination", () => {
    const params = buildItemsSearchParams({
      page: 2,
      limit: 25,
      search: "PROD-",
      type: "PRODUCT",
      status: true,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(params.get("page")).toBe("2");
    expect(params.get("limit")).toBe("25");
    expect(params.get("search")).toBe("PROD-");
    expect(params.get("type")).toBe("PRODUCT");
    expect(params.get("status")).toBe("true");
    expect(params.get("is_active")).toBe("true");
    expect(params.get("sort_by")).toBe("name");
    expect(params.get("sort_order")).toBe("asc");
  });

  it("keeps a client fallback for current non-paginated API responses", () => {
    const filtered = applyItemsClientFallback(items, { ...baseParams, search: "PROD-", type: "PRODUCT" });

    expect(filtered.map((item) => item.id)).toEqual([1]);
  });

  it("normalizes legacy array envelopes to paginated table data", () => {
    const result = normalizeItemsListResponse({ success: true, data: items }, { ...baseParams, limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(1);
  });

  it("preserves server-paginated response shapes when available", () => {
    const result = normalizeItemsListResponse({
      success: true,
      data: { items: [items[0]!], total: 50, page: 2, limit: 25 },
    }, { ...baseParams, page: 2 });

    expect(result.total).toBe(50);
    expect(result.page).toBe(2);
    expect(result.items[0]?.sku).toBe("PROD-001");
  });
});
