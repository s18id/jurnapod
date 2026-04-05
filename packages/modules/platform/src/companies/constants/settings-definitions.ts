// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Settings definitions for company configuration.
 * These are env-backed defaults that can be overridden per-company.
 */

function parsePositiveInt(value: string | undefined, fallback: number, key: string): number {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }

  return parsed;
}

function parseMinInt(
  value: string | undefined,
  fallback: number,
  key: string,
  minValue: number
): number {
  const parsed = parsePositiveInt(value, fallback, key);
  if (parsed < minValue) {
    throw new Error(`${key} must be >= ${minValue}`);
  }
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean, key: string): boolean {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new Error(`${key} must be "true" or "false"`);
}

function parseCostingMethod(
  value: string | undefined,
  fallback: string,
  key: string
): string {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "AVG" || normalized === "FIFO" || normalized === "LIFO") {
    return normalized;
  }

  throw new Error(`${key} must be AVG, FIFO, or LIFO`);
}

export const SETTINGS_DEFINITIONS = [
  {
    key: "feature.pos.auto_sync_enabled",
    valueType: "boolean",
    envKey: "JP_FEATURE_POS_AUTO_SYNC_ENABLED",
    parse: (value: string | undefined) => parseBoolean(value, true, "JP_FEATURE_POS_AUTO_SYNC_ENABLED")
  },
  {
    key: "feature.pos.sync_interval_seconds",
    valueType: "int",
    envKey: "JP_FEATURE_POS_SYNC_INTERVAL_SECONDS",
    parse: (value: string | undefined) =>
      parseMinInt(value, 60, "JP_FEATURE_POS_SYNC_INTERVAL_SECONDS", 5)
  },
  {
    key: "feature.sales.tax_included_default",
    valueType: "boolean",
    envKey: "JP_FEATURE_SALES_TAX_INCLUDED_DEFAULT",
    parse: (value: string | undefined) =>
      parseBoolean(value, false, "JP_FEATURE_SALES_TAX_INCLUDED_DEFAULT")
  },
  {
    key: "feature.inventory.allow_backorder",
    valueType: "boolean",
    envKey: "JP_FEATURE_INVENTORY_ALLOW_BACKORDER",
    parse: (value: string | undefined) =>
      parseBoolean(value, false, "JP_FEATURE_INVENTORY_ALLOW_BACKORDER")
  },
  {
    key: "feature.purchasing.require_approval",
    valueType: "boolean",
    envKey: "JP_FEATURE_PURCHASING_REQUIRE_APPROVAL",
    parse: (value: string | undefined) =>
      parseBoolean(value, true, "JP_FEATURE_PURCHASING_REQUIRE_APPROVAL")
  },
  {
    key: "inventory.low_stock_threshold",
    valueType: "int",
    envKey: "JP_INVENTORY_LOW_STOCK_THRESHOLD",
    parse: (value: string | undefined) =>
      parsePositiveInt(value, 5, "JP_INVENTORY_LOW_STOCK_THRESHOLD")
  },
  {
    key: "inventory.reorder_point",
    valueType: "int",
    envKey: "JP_INVENTORY_REORDER_POINT",
    parse: (value: string | undefined) =>
      parsePositiveInt(value, 10, "JP_INVENTORY_REORDER_POINT")
  },
  {
    key: "accounting.allow_multiple_open_fiscal_years",
    valueType: "boolean",
    envKey: "JP_ACCOUNTING_ALLOW_MULTIPLE_OPEN_FISCAL_YEARS",
    parse: (value: string | undefined) =>
      parseBoolean(value, false, "JP_ACCOUNTING_ALLOW_MULTIPLE_OPEN_FISCAL_YEARS")
  },
  {
    key: "inventory.allow_negative_stock",
    valueType: "boolean",
    envKey: "JP_INVENTORY_ALLOW_NEGATIVE_STOCK",
    parse: (value: string | undefined) =>
      parseBoolean(value, false, "JP_INVENTORY_ALLOW_NEGATIVE_STOCK")
  },
  {
    key: "inventory.costing_method",
    valueType: "enum",
    envKey: "JP_INVENTORY_COSTING_METHOD",
    parse: (value: string | undefined) =>
      parseCostingMethod(value, "AVG", "JP_INVENTORY_COSTING_METHOD")
  },
  {
    key: "inventory.warn_on_negative",
    valueType: "boolean",
    envKey: "JP_INVENTORY_WARN_ON_NEGATIVE",
    parse: (value: string | undefined) =>
      parseBoolean(value, true, "JP_INVENTORY_WARN_ON_NEGATIVE")
  }
] as const;

export type SettingDefinition = (typeof SETTINGS_DEFINITIONS)[number];

export function getSettingByKey(key: string): SettingDefinition | undefined {
  return SETTINGS_DEFINITIONS.find(s => s.key === key);
}
