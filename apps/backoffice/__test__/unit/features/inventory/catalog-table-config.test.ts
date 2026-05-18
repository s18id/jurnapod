import { describe, expect, it } from "vitest";

import {
  readEntityTableColumnVisibility,
  resolveEntityTableVisibleColumnIds,
  writeEntityTableColumnVisibility,
} from "@/components/data-grid";
import {
  CATALOG_COLUMN_SCHEMA_VERSION,
  renderPriceScopeSummary,
  catalogItemTableConfig,
  catalogPriceTableConfig,
  getCatalogColumnVisibilityStorageKey,
  type CatalogPriceRow,
} from "@/features/inventory/catalog-table-config";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("quota exceeded");
  }
}

describe("catalog table config", () => {
  it("uses versioned catalog localStorage keys", () => {
    expect(getCatalogColumnVisibilityStorageKey("items")).toBe("jurnapod.catalog.items.columns.v1");
    expect(getCatalogColumnVisibilityStorageKey("prices", 2)).toBe("jurnapod.catalog.prices.columns.v2");
  });

  it("defines required item columns and mobile essential columns", () => {
    const columnIds = catalogItemTableConfig.columns.map((column) => column.id);
    expect(columnIds).toEqual(expect.arrayContaining(["selection", "sku", "name", "type", "status", "updated_at"]));
    expect(catalogItemTableConfig.essentialColumnIds).toEqual(expect.arrayContaining(["sku", "name", "type", "status"]));
    expect(catalogItemTableConfig.columnVisibility.hideChooserOnMobile).toBe(true);
  });

  it("defines required price columns with ScopeBadge-compatible scope metadata", () => {
    const columnIds = catalogPriceTableConfig.columns.map((column) => column.id);
    expect(columnIds).toEqual(expect.arrayContaining(["selection", "item", "sku", "scope", "price", "status", "updated_at"]));
    expect(catalogPriceTableConfig.essentialColumnIds).toEqual(expect.arrayContaining(["item", "sku", "scope", "price", "status"]));
  });

  it("defines bulk actions compatible with EntityTable batch actions", () => {
    expect(catalogItemTableConfig.bulkActions.map((action) => action.id)).toEqual(["export", "activate", "deactivate"]);
    expect(catalogPriceTableConfig.bulkActions.map((action) => action.id)).toEqual(["export", "deactivate"]);
  });

  it("labels non-null outlet prices as outlet scope even when hasOverride is undefined", () => {
    const row: CatalogPriceRow = {
      id: 1,
      company_id: 10,
      outlet_id: 77,
      item_id: 20,
      price: 1000,
      is_active: true,
      updated_at: "2026-05-18T00:00:00Z",
      outletName: "Main",
    };

    const element = renderPriceScopeSummary(row) as { props: { label: string } };
    expect(element.props.label).toBe("Outlet: Main");
  });
});

describe("EntityTable column visibility helpers", () => {
  it("persists and reads matching schema versions", () => {
    const storage = new MemoryStorage();
    const key = getCatalogColumnVisibilityStorageKey("items");

    writeEntityTableColumnVisibility(storage, key, CATALOG_COLUMN_SCHEMA_VERSION, ["sku", "name"]);

    expect(readEntityTableColumnVisibility(storage, key, CATALOG_COLUMN_SCHEMA_VERSION)).toEqual(["sku", "name"]);
  });

  it("resets to defaults when stored schema version mismatches", () => {
    const storage = new MemoryStorage();
    const key = getCatalogColumnVisibilityStorageKey("items");
    storage.setItem(key, JSON.stringify({ version: 999, visibleColumnIds: ["sku"] }));

    expect(readEntityTableColumnVisibility(storage, key, CATALOG_COLUMN_SCHEMA_VERSION)).toBeUndefined();
    expect(resolveEntityTableVisibleColumnIds(catalogItemTableConfig.columns, catalogItemTableConfig.columnVisibility, storage)).toEqual(
      catalogItemTableConfig.columnVisibility.defaultVisibleColumnIds
    );
  });

  it("does not throw when column visibility storage write fails", () => {
    const storage = new ThrowingStorage();
    const key = getCatalogColumnVisibilityStorageKey("items");

    expect(() => writeEntityTableColumnVisibility(storage, key, CATALOG_COLUMN_SCHEMA_VERSION, ["sku"])).not.toThrow();
  });
});
