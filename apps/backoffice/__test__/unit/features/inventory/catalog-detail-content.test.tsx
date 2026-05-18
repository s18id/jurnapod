import { describe, expect, it } from "vitest";

import {
  CatalogItemDetailContent,
  CatalogPriceDetailContent,
  getCatalogItemDetailFields,
  getCatalogPriceDetailFields,
  getCatalogPriceScopeLabel,
} from "@/features/inventory/catalog-detail-content";
import type { CatalogItemRow, CatalogPriceRow } from "@/features/inventory/catalog-table-config";

const item: CatalogItemRow = {
  id: 1,
  company_id: 10,
  sku: "SKU-001",
  name: "Latte",
  type: "PRODUCT",
  item_group_id: 5,
  barcode: null,
  barcode_type: null,
  cogs_account_id: null,
  inventory_asset_account_id: null,
  is_active: true,
  updated_at: "2026-05-18T00:00:00Z",
  groupName: "Beverage",
};

const defaultPrice: CatalogPriceRow = {
  id: 2,
  company_id: 10,
  outlet_id: null,
  item_id: 1,
  price: 25000,
  is_active: true,
  updated_at: "2026-05-18T00:00:00Z",
  item: { id: 1, sku: "SKU-001", name: "Latte" },
  hasOverride: false,
};

const outletPrice: CatalogPriceRow = {
  ...defaultPrice,
  id: 3,
  outlet_id: 99,
  hasOverride: true,
  outletName: "Main",
};

const rawOutletPriceWithoutHasOverride: CatalogPriceRow = {
  ...defaultPrice,
  id: 4,
  outlet_id: 88,
  hasOverride: undefined,
  outletName: "Branch",
};

describe("catalog detail content mappers", () => {
  it("maps item fields for vertical detail drawer layout", () => {
    const fields = getCatalogItemDetailFields(item);

    expect(fields.map((field) => field.label)).toEqual(["SKU", "Name", "Type", "Status", "Group", "Updated At"]);
    expect(fields.find((field) => field.label === "Status")?.value).toBe("Active");
  });

  it("maps default and outlet-specific price scope labels", () => {
    expect(getCatalogPriceScopeLabel(defaultPrice)).toBe("Default");
    expect(getCatalogPriceScopeLabel(outletPrice)).toBe("Outlet: Main");
  });

  it("treats non-null outlet_id as outlet scope when hasOverride is undefined", () => {
    expect(getCatalogPriceScopeLabel(rawOutletPriceWithoutHasOverride)).toBe("Outlet: Branch");
  });

  it("maps price fields with currency and scope", () => {
    const fields = getCatalogPriceDetailFields(outletPrice);

    expect(fields.find((field) => field.label === "Scope")?.value).toBe("Outlet: Main");
    expect(String(fields.find((field) => field.label === "Price")?.value)).toContain("25.000");
  });

  it("exports DetailDrawer-ready content components", () => {
    expect(CatalogItemDetailContent).toBeDefined();
    expect(CatalogPriceDetailContent).toBeDefined();
  });
});
