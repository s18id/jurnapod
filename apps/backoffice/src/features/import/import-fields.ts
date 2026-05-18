// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ImportEntityType } from "../../hooks/use-import";

export type ImportFieldDefinition = {
  value: string;
  label: string;
  required: boolean;
};

const ITEM_FIELDS: ImportFieldDefinition[] = [
  { value: "sku", label: "SKU", required: true },
  { value: "name", label: "Name", required: true },
  { value: "item_type", label: "Item Type", required: true },
  { value: "barcode", label: "Barcode", required: false },
  { value: "item_group_id", label: "Item Group ID", required: false },
  { value: "cogs_account_id", label: "COGS Account ID", required: false },
  { value: "inventory_asset_account_id", label: "Inventory Asset Account ID", required: false },
  { value: "is_active", label: "Active", required: false },
];

const PRICE_FIELDS: ImportFieldDefinition[] = [
  { value: "item_sku", label: "Item SKU", required: true },
  { value: "item_name", label: "Item Name", required: false },
  { value: "outlet_id", label: "Outlet ID", required: false },
  { value: "price", label: "Price", required: true },
  { value: "is_active", label: "Active", required: false },
];

export function getImportFieldDefinitions(entityType: ImportEntityType): ImportFieldDefinition[] {
  return entityType === "items" ? ITEM_FIELDS : PRICE_FIELDS;
}
