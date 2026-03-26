// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ItemType } from "@jurnapod/shared";

import { parseDelimited, parseImportBoolean } from "../lib/import/delimited";

export type NormalizedItemImportRow = {
  sku: string | null;
  name: string;
  type: ItemType;
  item_group_code: string | null;
  is_active: boolean;
  is_active_raw: string;
};

export type ItemImportPlanRow = {
  rowIndex: number;
  original: NormalizedItemImportRow;
  action: "CREATE" | "ERROR";
  error?: string;
};

export type ItemImportSummary = {
  create: number;
  error: number;
  total: number;
};

type ExistingItem = {
  sku: string | null;
};

type ExistingItemGroup = {
  code: string | null;
};

const VALID_TYPES: ItemType[] = ["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"];

const HEADER_ALIASES: Record<string, "sku" | "name" | "type" | "item_group_code" | "is_active"> = {
  sku: "sku",
  code: "sku",
  name: "name",
  nama: "name",
  type: "type",
  jenis: "type",
  item_group_code: "item_group_code",
  group_code: "item_group_code",
  kode_grup: "item_group_code",
  is_active: "is_active",
  active: "is_active",
  status: "is_active"
};

function normalizeHeaderName(name: string): keyof typeof HEADER_ALIASES | null {
  const key = name.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? null;
}

export function parseItemImportRows(text: string): NormalizedItemImportRow[] {
  const parsed = parseDelimited(text);
  if (parsed.length < 2) return [];
  const header = parsed[0];
  const body = parsed.slice(1);

  return body.map((cells) => {
    const row: NormalizedItemImportRow = {
      sku: null,
      name: "",
      type: "PRODUCT",
      item_group_code: null,
      is_active: true,
      is_active_raw: ""
    };

    header.forEach((column, index) => {
      const field = normalizeHeaderName(column);
      const value = (cells[index] ?? "").trim();

      if (field === "sku") row.sku = value || null;
      if (field === "name") row.name = value;
      if (field === "type") row.type = (value.toUpperCase() as ItemType) || "PRODUCT";
      if (field === "item_group_code") row.item_group_code = value || null;
      if (field === "is_active") {
        row.is_active_raw = value;
        row.is_active = parseImportBoolean(value) ?? true;
      }
    });

    return row;
  });
}

export function buildItemImportPlan(rows: NormalizedItemImportRow[], existingItems: ExistingItem[], groups: ExistingItemGroup[]): ItemImportPlanRow[] {
  const skuMap = new Set(existingItems.map((item) => item.sku?.toLowerCase()).filter(Boolean) as string[]);
  const groupMap = new Set(groups.map((group) => group.code?.toLowerCase()).filter(Boolean) as string[]);
  const fileSkuSet = new Set<string>();

  return rows.map((row, index) => {
    if (!row.name.trim()) {
      return { rowIndex: index, original: row, action: "ERROR", error: "Name is required" };
    }
    if (!VALID_TYPES.includes(row.type)) {
      return { rowIndex: index, original: row, action: "ERROR", error: "Invalid type" };
    }
    if (row.sku) {
      const skuKey = row.sku.toLowerCase();
      if (fileSkuSet.has(skuKey)) {
        return { rowIndex: index, original: row, action: "ERROR", error: "Duplicate SKU in file" };
      }
      fileSkuSet.add(skuKey);
      if (skuMap.has(skuKey)) {
        return { rowIndex: index, original: row, action: "ERROR", error: "SKU already exists" };
      }
    }
    if (row.item_group_code && !groupMap.has(row.item_group_code.toLowerCase())) {
      return { rowIndex: index, original: row, action: "ERROR", error: "Item group code not found" };
    }
    if (row.is_active_raw && parseImportBoolean(row.is_active_raw) === null) {
      return { rowIndex: index, original: row, action: "ERROR", error: "Invalid is_active value" };
    }
    return { rowIndex: index, original: row, action: "CREATE" };
  });
}

export function computeItemImportSummary(plan: ItemImportPlanRow[]): ItemImportSummary {
  return {
    create: plan.filter((row) => row.action === "CREATE").length,
    error: plan.filter((row) => row.action === "ERROR").length,
    total: plan.length
  };
}
