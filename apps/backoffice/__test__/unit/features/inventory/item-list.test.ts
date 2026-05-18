import { describe, expect, it } from "vitest";

import { getItemActionAvailability, mapItemsToCatalogRows } from "@/features/items/item-list";
import type { ItemGroup } from "@/hooks/use-item-groups";
import type { Item } from "@/hooks/use-items";

const item: Item = {
  id: 1,
  company_id: 10,
  sku: "PROD-001",
  name: "Product A",
  type: "PRODUCT",
  item_group_id: 5,
  barcode: null,
  barcode_type: null,
  cogs_account_id: null,
  inventory_asset_account_id: null,
  is_active: true,
  updated_at: "2026-05-18T00:00:00Z",
};

const group: ItemGroup = {
  id: 5,
  company_id: 10,
  parent_id: null,
  code: "FOOD",
  name: "Food",
  is_active: true,
  updated_at: "2026-05-18T00:00:00Z",
};

describe("item list helpers", () => {
  it("maps items to catalog rows with group and variant metadata", () => {
    const rows = mapItemsToCatalogRows(
      [item],
      new Map([[group.id, group]]),
      new Map([[item.id, { item_id: item.id, total_stock: 12, variant_count: 3, has_variants: true }]])
    );

    expect(rows[0]?.groupName).toBe("Food");
    expect(rows[0]?.totalStock).toBe(12);
    expect(rows[0]?.variantCount).toBe(3);
  });

  it("keeps stock metadata empty when an item has no variants", () => {
    const rows = mapItemsToCatalogRows(
      [item],
      new Map([[group.id, group]]),
      new Map([[item.id, { item_id: item.id, total_stock: 0, variant_count: 0, has_variants: false }]])
    );

    expect(rows[0]?.totalStock).toBeUndefined();
    expect(rows[0]?.variantCount).toBeUndefined();
  });

  it("hides write/deactivate actions for READ-only inventory users", () => {
    const actions = getItemActionAvailability(item, { canUpdate: false, canDelete: false });

    expect(actions).toEqual({
      canEdit: false,
      canManageRecipe: false,
      canManageVariants: false,
      canManageBarcodeImages: false,
      canDeactivate: false,
    });
  });

  it("exposes recipe management only for update-capable RECIPE items", () => {
    const actions = getItemActionAvailability(
      { ...item, type: "RECIPE" },
      { canUpdate: true, canDelete: true }
    );

    expect(actions.canEdit).toBe(true);
    expect(actions.canManageRecipe).toBe(true);
    expect(actions.canManageVariants).toBe(true);
    expect(actions.canManageBarcodeImages).toBe(true);
    expect(actions.canDeactivate).toBe(true);
  });

  it("hides deactivate for inactive items even when DELETE permission is present", () => {
    const actions = getItemActionAvailability(
      { ...item, is_active: false },
      { canUpdate: true, canDelete: true }
    );

    expect(actions.canDeactivate).toBe(false);
  });
});
