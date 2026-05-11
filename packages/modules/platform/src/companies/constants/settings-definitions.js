// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
/**
 * Settings definitions for company configuration.
 * These are env-backed defaults that can be overridden per-company.
 */
function parsePositiveInt(value, fallback, key) {
    if (value == null || value.length === 0) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${key} must be a non-negative integer`);
    }
    return parsed;
}
function parseMinInt(value, fallback, key, minValue) {
    const parsed = parsePositiveInt(value, fallback, key);
    if (parsed < minValue) {
        throw new Error(`${key} must be >= ${minValue}`);
    }
    return parsed;
}
function parseBoolean(value, fallback, key) {
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
function parseCostingMethod(value, fallback, key) {
    if (value == null || value.length === 0) {
        return fallback;
    }
    const normalized = value.trim().toUpperCase();
    if (normalized === "AVG" || normalized === "FIFO" || normalized === "LIFO") {
        return normalized;
    }
    throw new Error(`${key} must be AVG, FIFO, or LIFO`);
}
// FIX(47.5-WP-A1): Parse AP period-close guardrail enum
function parsePeriodCloseGuardrail(value, fallback, key) {
    if (value == null || value.length === 0) {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "strict" || normalized === "override_allowed") {
        return normalized;
    }
    throw new Error(`${key} must be strict or override_allowed`);
}
export const SETTINGS_DEFINITIONS = [
    {
        key: "feature.pos.auto_sync_enabled",
        valueType: "boolean",
        envKey: "JP_FEATURE_POS_AUTO_SYNC_ENABLED",
        parse: (value) => parseBoolean(value, true, "JP_FEATURE_POS_AUTO_SYNC_ENABLED")
    },
    {
        key: "feature.pos.sync_interval_seconds",
        valueType: "int",
        envKey: "JP_FEATURE_POS_SYNC_INTERVAL_SECONDS",
        parse: (value) => parseMinInt(value, 60, "JP_FEATURE_POS_SYNC_INTERVAL_SECONDS", 5)
    },
    {
        key: "feature.sales.tax_included_default",
        valueType: "boolean",
        envKey: "JP_FEATURE_SALES_TAX_INCLUDED_DEFAULT",
        parse: (value) => parseBoolean(value, false, "JP_FEATURE_SALES_TAX_INCLUDED_DEFAULT")
    },
    {
        key: "feature.inventory.allow_backorder",
        valueType: "boolean",
        envKey: "JP_FEATURE_INVENTORY_ALLOW_BACKORDER",
        parse: (value) => parseBoolean(value, false, "JP_FEATURE_INVENTORY_ALLOW_BACKORDER")
    },
    {
        key: "feature.purchasing.require_approval",
        valueType: "boolean",
        envKey: "JP_FEATURE_PURCHASING_REQUIRE_APPROVAL",
        parse: (value) => parseBoolean(value, true, "JP_FEATURE_PURCHASING_REQUIRE_APPROVAL")
    },
    {
        key: "inventory.low_stock_threshold",
        valueType: "int",
        envKey: "JP_INVENTORY_LOW_STOCK_THRESHOLD",
        parse: (value) => parsePositiveInt(value, 5, "JP_INVENTORY_LOW_STOCK_THRESHOLD")
    },
    {
        key: "inventory.reorder_point",
        valueType: "int",
        envKey: "JP_INVENTORY_REORDER_POINT",
        parse: (value) => parsePositiveInt(value, 10, "JP_INVENTORY_REORDER_POINT")
    },
    {
        key: "accounting.allow_multiple_open_fiscal_years",
        valueType: "boolean",
        envKey: "JP_ACCOUNTING_ALLOW_MULTIPLE_OPEN_FISCAL_YEARS",
        parse: (value) => parseBoolean(value, false, "JP_ACCOUNTING_ALLOW_MULTIPLE_OPEN_FISCAL_YEARS")
    },
    // FIX(47.5-WP-A1): AP period-close guardrail — strict blocks, override_allowed allows reason-based bypass
    {
        key: "accounting.ap_period_close_guardrail",
        valueType: "enum",
        envKey: "JP_ACCOUNTING_AP_PERIOD_CLOSE_GUARDRAIL",
        parse: (value) => parsePeriodCloseGuardrail(value, "strict", "JP_ACCOUNTING_AP_PERIOD_CLOSE_GUARDRAIL")
    },
    {
        key: "inventory.allow_negative_stock",
        valueType: "boolean",
        envKey: "JP_INVENTORY_ALLOW_NEGATIVE_STOCK",
        parse: (value) => parseBoolean(value, false, "JP_INVENTORY_ALLOW_NEGATIVE_STOCK")
    },
    {
        key: "inventory.costing_method",
        valueType: "enum",
        envKey: "JP_INVENTORY_COSTING_METHOD",
        parse: (value) => parseCostingMethod(value, "AVG", "JP_INVENTORY_COSTING_METHOD")
    },
    {
        key: "inventory.standard_variance_account_id",
        valueType: "int",
        envKey: "JP_INVENTORY_STANDARD_VARIANCE_ACCOUNT_ID",
        parse: (value) => parsePositiveInt(value, 0, "JP_INVENTORY_STANDARD_VARIANCE_ACCOUNT_ID")
    },
    {
        key: "inventory.warn_on_negative",
        valueType: "boolean",
        envKey: "JP_INVENTORY_WARN_ON_NEGATIVE",
        parse: (value) => parseBoolean(value, true, "JP_INVENTORY_WARN_ON_NEGATIVE")
    }
];
export function getSettingByKey(key) {
    return SETTINGS_DEFINITIONS.find(s => s.key === key);
}
//# sourceMappingURL=settings-definitions.js.map