// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { escapeCsvCell, rowsToCsv, downloadCsv } from "../lib/import/csv";

type ItemForExport = {
  id: number;
  sku: string | null;
  name: string;
  type: string;
  item_group_id: number | null;
  is_active: boolean;
  updated_at: string;
};

type ItemGroupForExport = {
  id: number;
  code: string | null;
  name: string;
};

type PriceForExport = {
  id: number;
  item_id: number;
  outlet_id: number | null;
  price: number;
  is_active: boolean;
  updated_at: string;
};

function getGroupCode(groups: ItemGroupForExport[], groupId: number | null): string {
  if (!groupId) return "";
  const group = groups.find((g) => g.id === groupId);
  return group?.code ?? "";
}

function getGroupName(groups: ItemGroupForExport[], groupId: number | null): string {
  if (!groupId) return "";
  const group = groups.find((g) => g.id === groupId);
  return group?.name ?? "";
}

export function buildItemsCsv(items: ItemForExport[], groups: ItemGroupForExport[]): string {
  const headers = ["id", "sku", "name", "type", "item_group_code", "item_group_name", "is_active", "updated_at"];
  const rows = items.map((item) => [
    item.id,
    item.sku ?? "",
    item.name,
    item.type,
    getGroupCode(groups, item.item_group_id),
    getGroupName(groups, item.item_group_id),
    item.is_active ? "true" : "false",
    item.updated_at
  ]);
  return rowsToCsv(headers, rows);
}

export function downloadItemsCsv(items: ItemForExport[], groups: ItemGroupForExport[]): void {
  const csv = buildItemsCsv(items, groups);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  downloadCsv(csv, `items-filtered-${date}.csv`);
}

export function buildPricesCsv(
  prices: PriceForExport[],
  items: ItemForExport[],
  pricingViewMode: "defaults" | "outlet",
  selectedOutletId: number
): string {
  const headers = ["id", "item_sku", "item_name", "scope", "outlet_id", "price", "is_active", "updated_at"];
  const rows = prices.map((price) => {
    const item = items.find((i) => i.id === price.item_id);
    const scope = price.outlet_id === null ? "default" : "outlet";
    return [
      price.id,
      item?.sku ?? "",
      item?.name ?? "",
      scope,
      price.outlet_id ?? "",
      price.price,
      price.is_active ? "true" : "false",
      price.updated_at
    ];
  });
  return rowsToCsv(headers, rows);
}

export function downloadPricesCsv(
  prices: PriceForExport[],
  items: ItemForExport[],
  pricingViewMode: "defaults" | "outlet",
  selectedOutletId: number
): void {
  const csv = buildPricesCsv(prices, items, pricingViewMode, selectedOutletId);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const mode = pricingViewMode === "defaults" ? "defaults" : `outlet-${selectedOutletId}`;
  downloadCsv(csv, `prices-filtered-${mode}-${date}.csv`);
}
