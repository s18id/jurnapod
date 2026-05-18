import { describe, expect, it } from "vitest";

import {
  calculatePriceDifferencePercent,
  derivePriceBuckets,
  filterPriceRows,
  getPriceActionAvailability,
  getPrimaryOutletOverride,
  getPriceScopeLabel,
  mapDefaultPrices,
  resolveAllOutletPriceRows,
  resolveOutletPriceRows,
  type ItemPrice,
} from "@/features/prices/price-resolution";
import type { Item } from "@/hooks/use-items";

const product: Item = {
  id: 10,
  company_id: 1,
  sku: "PROD-001",
  name: "Product One",
  type: "PRODUCT",
  item_group_id: null,
  barcode: null,
  barcode_type: null,
  cogs_account_id: null,
  inventory_asset_account_id: null,
  is_active: true,
  updated_at: "2026-05-18T00:00:00Z",
};

const defaultPrice: ItemPrice = {
  id: 100,
  company_id: 1,
  outlet_id: null,
  item_id: product.id,
  price: 10000,
  is_active: true,
  updated_at: "2026-05-18T00:00:00Z",
};

const outletOverride: ItemPrice = {
  id: 101,
  company_id: 1,
  outlet_id: 7,
  item_id: product.id,
  price: 12000,
  is_active: true,
  updated_at: "2026-05-18T00:00:00Z",
};

const secondOutletOverride: ItemPrice = {
  id: 102,
  company_id: 1,
  outlet_id: 8,
  item_id: product.id,
  price: 13000,
  is_active: true,
  updated_at: "2026-05-18T00:00:00Z",
};

const newerOutletOverride: ItemPrice = {
  id: 103,
  company_id: 1,
  outlet_id: 9,
  item_id: product.id,
  price: 14000,
  is_active: true,
  updated_at: "2026-05-19T00:00:00Z",
};

const inactiveNewestOutletOverride: ItemPrice = {
  id: 104,
  company_id: 1,
  outlet_id: 6,
  item_id: product.id,
  price: 9000,
  is_active: false,
  updated_at: "2026-05-20T00:00:00Z",
};

const itemMap = new Map([[product.id, product]]);

describe("price resolution helpers", () => {
  it("maps company defaults to effective default rows", () => {
    const rows = mapDefaultPrices([defaultPrice], itemMap);

    expect(rows[0]?.hasOverride).toBe(false);
    expect(rows[0]?.defaultPrice).toBe(10000);
    expect(rows[0]?.effectivePrice).toBe(10000);
    expect(rows[0]?.item?.sku).toBe("PROD-001");
  });

  it("resolves outlet override as effective price while preserving default price", () => {
    const rows = resolveOutletPriceRows({
      companyDefaults: [defaultPrice],
      outletPrices: [outletOverride],
      itemMap,
      selectedOutletName: "Main Outlet",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.hasOverride).toBe(true);
    expect(rows[0]?.defaultPrice).toBe(10000);
    expect(rows[0]?.effectivePrice).toBe(12000);
    expect(rows[0]?.outletName).toBe("Main Outlet");
  });

  it("derives default and outlet buckets from the current legacy item-prices list response", () => {
    const buckets = derivePriceBuckets([defaultPrice, outletOverride]);

    expect(buckets.defaults.map((price) => price.id)).toEqual([100]);
    expect(buckets.outletOverrides.map((price) => price.id)).toEqual([101]);
  });

  it("resolves all-outlets rows with compact override summaries", () => {
    const rows = resolveAllOutletPriceRows({
      companyDefaults: [defaultPrice],
      outletPrices: [outletOverride],
      itemMap,
      outlets: [{ id: 7, name: "Main Outlet" }],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.defaultPrice).toBe(10000);
    expect(rows[0]?.hasOverride).toBe(true);
    expect(rows[0]?.outletOverrides).toEqual([
      {
        outletId: 7,
        outletName: "Main Outlet",
        priceId: 101,
        price: 12000,
        isActive: true,
        updatedAt: "2026-05-18T00:00:00Z",
      },
    ]);
  });

  it("resolves all-outlets override-only rows with deterministic active recency ordering", () => {
    const rows = resolveAllOutletPriceRows({
      companyDefaults: [],
      outletPrices: [inactiveNewestOutletOverride, outletOverride, newerOutletOverride, secondOutletOverride],
      itemMap,
      outlets: [{ id: 6, name: "Inactive Outlet" }, { id: 7, name: "Main Outlet" }, { id: 8, name: "Second Outlet" }, { id: 9, name: "Newer Outlet" }],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.defaultPrice).toBeUndefined();
    expect(rows[0]?.id).toBe(103);
    expect(rows[0]?.outlet_id).toBeNull();
    expect(rows[0]?.effectivePrice).toBe(14000);
    expect(rows[0]?.outletOverrides?.map((override) => override.outletName)).toEqual(["Newer Outlet", "Main Outlet", "Second Outlet", "Inactive Outlet"]);
    expect(getPrimaryOutletOverride(rows[0]?.outletOverrides)?.priceId).toBe(103);
  });

  it("filters by search, scope, and active status", () => {
    const rows = resolveOutletPriceRows({
      companyDefaults: [defaultPrice],
      outletPrices: [outletOverride],
      itemMap,
      selectedOutletName: "Main Outlet",
    });

    expect(filterPriceRows(rows, { search: "prod", scope: "override", status: true, viewMode: "outlet" })).toHaveLength(1);
    expect(filterPriceRows(rows, { search: "missing", scope: "override", status: true, viewMode: "outlet" })).toHaveLength(0);
    expect(filterPriceRows(rows, { scope: "default", status: true, viewMode: "outlet" })).toHaveLength(0);
  });

  it("gates mutation actions with canonical inventory.items UPDATE UX permission", () => {
    const overrideRow = resolveOutletPriceRows({
      companyDefaults: [defaultPrice],
      outletPrices: [outletOverride],
      itemMap,
    })[0]!;

    expect(getPriceActionAvailability(overrideRow, false, "outlet")).toEqual({
      canEdit: false,
      canSetOverride: false,
      canRemoveOverride: false,
      canDeleteDefault: false,
    });
    expect(getPriceActionAvailability(overrideRow, true, "outlet").canRemoveOverride).toBe(true);
    expect(getPriceActionAvailability(overrideRow, true, "all_outlets").canRemoveOverride).toBe(false);
    expect(getPriceActionAvailability({ ...defaultPrice, hasOverride: false, effectivePrice: 10000, defaultPrice: 10000 }, true, "defaults").canDeleteDefault).toBe(true);
  });

  it("formats scope labels and handles zero default difference safely", () => {
    expect(getPriceScopeLabel({ hasOverride: false, outlet_id: null })).toBe("Default");
    expect(getPriceScopeLabel({ hasOverride: true, outlet_id: 7, outletName: "Main Outlet" })).toBe("Outlet: Main Outlet");
    expect(getPriceScopeLabel({ defaultPrice: 10000, hasOverride: true, outlet_id: null, outletOverrides: [{ outletId: 7, priceId: 101, price: 12000, isActive: true, updatedAt: "2026-05-18T00:00:00Z" }] })).toBe("Default + Overrides");
    expect(getPriceScopeLabel({ defaultPrice: undefined, hasOverride: true, outlet_id: null, outletOverrides: [{ outletId: 7, priceId: 101, price: 12000, isActive: true, updatedAt: "2026-05-18T00:00:00Z" }] })).toBe("Overrides Only");
    expect(calculatePriceDifferencePercent(0, 12000)).toBe(0);
    expect(calculatePriceDifferencePercent(10000, 12000)).toBe(20);
  });

  it("handles empty resolution inputs", () => {
    expect(mapDefaultPrices([], itemMap)).toEqual([]);
    expect(resolveOutletPriceRows({ companyDefaults: [], outletPrices: [], itemMap })).toEqual([]);
    expect(resolveAllOutletPriceRows({ companyDefaults: [], outletPrices: [], itemMap, outlets: [] })).toEqual([]);
  });
});
