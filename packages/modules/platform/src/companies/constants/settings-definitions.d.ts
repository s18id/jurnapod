export declare const SETTINGS_DEFINITIONS: readonly [{
    readonly key: "feature.pos.auto_sync_enabled";
    readonly valueType: "boolean";
    readonly envKey: "JP_FEATURE_POS_AUTO_SYNC_ENABLED";
    readonly parse: (value: string | undefined) => boolean;
}, {
    readonly key: "feature.pos.sync_interval_seconds";
    readonly valueType: "int";
    readonly envKey: "JP_FEATURE_POS_SYNC_INTERVAL_SECONDS";
    readonly parse: (value: string | undefined) => number;
}, {
    readonly key: "feature.sales.tax_included_default";
    readonly valueType: "boolean";
    readonly envKey: "JP_FEATURE_SALES_TAX_INCLUDED_DEFAULT";
    readonly parse: (value: string | undefined) => boolean;
}, {
    readonly key: "feature.inventory.allow_backorder";
    readonly valueType: "boolean";
    readonly envKey: "JP_FEATURE_INVENTORY_ALLOW_BACKORDER";
    readonly parse: (value: string | undefined) => boolean;
}, {
    readonly key: "feature.purchasing.require_approval";
    readonly valueType: "boolean";
    readonly envKey: "JP_FEATURE_PURCHASING_REQUIRE_APPROVAL";
    readonly parse: (value: string | undefined) => boolean;
}, {
    readonly key: "inventory.low_stock_threshold";
    readonly valueType: "int";
    readonly envKey: "JP_INVENTORY_LOW_STOCK_THRESHOLD";
    readonly parse: (value: string | undefined) => number;
}, {
    readonly key: "inventory.reorder_point";
    readonly valueType: "int";
    readonly envKey: "JP_INVENTORY_REORDER_POINT";
    readonly parse: (value: string | undefined) => number;
}, {
    readonly key: "accounting.allow_multiple_open_fiscal_years";
    readonly valueType: "boolean";
    readonly envKey: "JP_ACCOUNTING_ALLOW_MULTIPLE_OPEN_FISCAL_YEARS";
    readonly parse: (value: string | undefined) => boolean;
}, {
    readonly key: "accounting.ap_period_close_guardrail";
    readonly valueType: "enum";
    readonly envKey: "JP_ACCOUNTING_AP_PERIOD_CLOSE_GUARDRAIL";
    readonly parse: (value: string | undefined) => string;
}, {
    readonly key: "inventory.allow_negative_stock";
    readonly valueType: "boolean";
    readonly envKey: "JP_INVENTORY_ALLOW_NEGATIVE_STOCK";
    readonly parse: (value: string | undefined) => boolean;
}, {
    readonly key: "inventory.costing_method";
    readonly valueType: "enum";
    readonly envKey: "JP_INVENTORY_COSTING_METHOD";
    readonly parse: (value: string | undefined) => string;
}, {
    readonly key: "inventory.standard_variance_account_id";
    readonly valueType: "int";
    readonly envKey: "JP_INVENTORY_STANDARD_VARIANCE_ACCOUNT_ID";
    readonly parse: (value: string | undefined) => number;
}, {
    readonly key: "inventory.warn_on_negative";
    readonly valueType: "boolean";
    readonly envKey: "JP_INVENTORY_WARN_ON_NEGATIVE";
    readonly parse: (value: string | undefined) => boolean;
}];
export type SettingDefinition = (typeof SETTINGS_DEFINITIONS)[number];
export declare function getSettingByKey(key: string): SettingDefinition | undefined;
//# sourceMappingURL=settings-definitions.d.ts.map