// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { parseDelimited, parseImportBoolean } from "../lib/import/delimited";

export type NormalizedPriceImportRow = {
  item_sku: string;
  price: number;
  price_raw: string;
  is_active: boolean;
  is_active_raw: string;
  scope: "default" | "outlet";
  outlet_id: number | null;
};

export type PriceImportPlanRow = {
  rowIndex: number;
  original: NormalizedPriceImportRow;
  action: "CREATE" | "ERROR";
  error?: string;
};

export type PriceImportSummary = {
  create: number;
  error: number;
  total: number;
};

type ItemRef = { id: number; sku: string | null };
type PriceRef = { item_id: number; outlet_id: number | null };

const HEADER_ALIASES: Record<string, "item_sku" | "price" | "is_active" | "scope" | "outlet_id"> = {
  item_sku: "item_sku",
  sku: "item_sku",
  price: "price",
  harga: "price",
  is_active: "is_active",
  active: "is_active",
  status: "is_active",
  scope: "scope",
  outlet_id: "outlet_id"
};

function normalizeHeaderName(name: string): keyof typeof HEADER_ALIASES | null {
  const key = name.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? null;
}

export function parsePriceImportRows(text: string, defaultOutletId: number): NormalizedPriceImportRow[] {
  const parsed = parseDelimited(text);
  if (parsed.length < 2) return [];
  const header = parsed[0];
  const body = parsed.slice(1);

  return body.map((cells) => {
    const row: NormalizedPriceImportRow = {
      item_sku: "",
      price: 0,
      price_raw: "",
      is_active: true,
      is_active_raw: "",
      scope: "outlet",
      outlet_id: defaultOutletId
    };

    header.forEach((column, index) => {
      const field = normalizeHeaderName(column);
      const value = (cells[index] ?? "").trim();

      if (field === "item_sku") row.item_sku = value;
      if (field === "price") {
        row.price_raw = value;
        row.price = Number(value);
      }
      if (field === "is_active") {
        row.is_active_raw = value;
        row.is_active = parseImportBoolean(value) ?? true;
      }
      if (field === "scope") {
        row.scope = value.toLowerCase() === "default" ? "default" : "outlet";
      }
      if (field === "outlet_id") {
        row.outlet_id = value ? Number(value) : defaultOutletId;
      }
    });

    if (row.scope === "default") {
      row.outlet_id = null;
    }

    return row;
  });
}

export function buildPriceImportPlan(
  rows: NormalizedPriceImportRow[],
  items: ItemRef[],
  existingPrices: PriceRef[],
  allowDefault: boolean
): PriceImportPlanRow[] {
  const itemBySku = new Map(items.filter((item) => item.sku).map((item) => [item.sku!.toLowerCase(), item.id]));
  const existingKey = new Set(existingPrices.map((price) => `${price.item_id}:${price.outlet_id ?? "default"}`));
  const seenFile = new Set<string>();

  return rows.map((row, index) => {
    if (!row.item_sku.trim()) return { rowIndex: index, original: row, action: "ERROR", error: "item_sku is required" };
    const itemId = itemBySku.get(row.item_sku.toLowerCase());
    if (!itemId) return { rowIndex: index, original: row, action: "ERROR", error: "item_sku not found" };
    if (Number.isNaN(row.price) || row.price < 0) {
      return { rowIndex: index, original: row, action: "ERROR", error: "Invalid price" };
    }
    if (row.scope === "default" && !allowDefault) {
      return { rowIndex: index, original: row, action: "ERROR", error: "No permission for default prices" };
    }
    if (row.scope === "outlet" && (row.outlet_id == null || Number.isNaN(row.outlet_id))) {
      return { rowIndex: index, original: row, action: "ERROR", error: "outlet_id required for outlet scope" };
    }
    if (row.is_active_raw && parseImportBoolean(row.is_active_raw) === null) {
      return { rowIndex: index, original: row, action: "ERROR", error: "Invalid is_active value" };
    }

    const key = `${itemId}:${row.scope === "default" ? "default" : row.outlet_id}`;
    if (seenFile.has(key)) {
      return { rowIndex: index, original: row, action: "ERROR", error: "Duplicate price target in file" };
    }
    seenFile.add(key);

    if (existingKey.has(key)) {
      return { rowIndex: index, original: row, action: "ERROR", error: "Price already exists" };
    }

    return { rowIndex: index, original: row, action: "CREATE" };
  });
}

export function computePriceImportSummary(plan: PriceImportPlanRow[]): PriceImportSummary {
  return {
    create: plan.filter((row) => row.action === "CREATE").length,
    error: plan.filter((row) => row.action === "ERROR").length,
    total: plan.length
  };
}
