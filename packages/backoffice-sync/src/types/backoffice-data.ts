// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";

// REALTIME Tier - Live dashboard data
export const BackofficeRealtimeDataSchema = z.object({
  live_sales_metrics: z.object({
    total_sales_today: z.number().nonnegative(),
    transaction_count_today: z.number().nonnegative(),
    active_orders_count: z.number().nonnegative(),
    occupied_tables_count: z.number().nonnegative(),
    revenue_this_hour: z.number().nonnegative(),
    avg_transaction_value: z.number().nonnegative(),
    last_updated: z.string().datetime()
  }),
  system_alerts: z.array(z.object({
    id: z.string().uuid(),
    type: z.enum(["ERROR", "WARNING", "INFO"]),
    module: z.string(),
    message: z.string(),
    created_at: z.string().datetime(),
    acknowledged: z.boolean()
  })),
  staff_activity: z.array(z.object({
    user_id: NumericIdSchema,
    user_name: z.string(),
    outlet_id: NumericIdSchema,
    last_action: z.string(),
    last_seen: z.string().datetime(),
    status: z.enum(["ACTIVE", "IDLE", "OFFLINE"])
  }))
});

// OPERATIONAL Tier - Recent business activity
export const BackofficeOperationalDataSchema = z.object({
  recent_transactions: z.array(z.object({
    transaction_id: z.string().uuid(),
    outlet_id: NumericIdSchema,
    cashier_user_id: NumericIdSchema,
    cashier_name: z.string(),
    total_amount: z.number().nonnegative(),
    payment_methods: z.array(z.string()),
    transaction_at: z.string().datetime(),
    status: z.enum(["COMPLETED", "VOID", "REFUND"]),
    table_id: NumericIdSchema.nullable(),
    guest_count: z.number().positive().nullable()
  })),
  inventory_alerts: z.array(z.object({
    item_id: NumericIdSchema,
    item_name: z.string(),
    current_stock: z.number().nonnegative(),
    minimum_stock: z.number().nonnegative(),
    alert_level: z.enum(["LOW", "OUT_OF_STOCK", "EXPIRED"]),
    last_updated: z.string().datetime()
  })).optional(),
  payment_reconciliation: z.array(z.object({
    outlet_id: NumericIdSchema,
    payment_method: z.string(),
    expected_amount: z.number(),
    actual_amount: z.number().nullable(),
    variance: z.number(),
    reconciled_at: z.string().datetime().nullable(),
    status: z.enum(["PENDING", "RECONCILED", "VARIANCE_REPORTED"])
  }))
});

// MASTER Tier - Comprehensive catalog and configuration
export const BackofficeMasterDataSchema = z.object({
  data_version: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: NumericIdSchema,
    sku: z.string().nullable(),
    name: z.string(),
    description: z.string(),
    type: z.enum(["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"]),
    item_group_id: NumericIdSchema.nullable(),
    cost_price: z.number().nonnegative(),
    selling_price: z.number().nonnegative(),
    supplier_id: NumericIdSchema.nullable(),
    supplier_name: z.string().nullable(),
    barcode: z.string().nullable(),
    images: z.array(z.string()),
    is_active: z.boolean(),
    stock_quantity: z.number().nonnegative().nullable(),
    minimum_stock: z.number().nonnegative().nullable(),
    accounting_code: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    created_by: z.string(),
    modified_by: z.string()
  })),
  customers: z.array(z.object({
    id: NumericIdSchema,
    name: z.string(),
    email: z.string().email().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    loyalty_points: z.number().nonnegative(),
    total_spent: z.number().nonnegative(),
    visit_count: z.number().nonnegative(),
    last_visit: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    is_active: z.boolean()
  })),
  suppliers: z.array(z.object({
    id: NumericIdSchema,
    name: z.string(),
    contact_name: z.string().nullable(),
    email: z.string().email().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    payment_terms: z.string().nullable(),
    is_active: z.boolean(),
    created_at: z.string().datetime()
  })),
  chart_of_accounts: z.array(z.object({
    id: NumericIdSchema,
    code: z.string(),
    name: z.string(),
    account_type: z.string(),
    parent_id: NumericIdSchema.nullable(),
    is_active: z.boolean(),
    balance: z.number()
  }))
});

// ADMIN Tier - System administration and user management
export const BackofficeAdminDataSchema = z.object({
  company_settings: z.object({
    company_id: NumericIdSchema,
    name: z.string(),
    email: z.string().email().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    tax_number: z.string().nullable(),
    currency_code: z.string(),
    timezone: z.string(),
    fiscal_year_start: z.string(),
    accounting_method: z.enum(["ACCRUAL", "CASH"]),
    multi_outlet_enabled: z.boolean(),
    created_at: z.string().datetime()
  }),
  outlets: z.array(z.object({
    id: NumericIdSchema,
    name: z.string(),
    code: z.string().nullable(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    manager_user_id: NumericIdSchema.nullable(),
    manager_name: z.string().nullable(),
    is_active: z.boolean(),
    created_at: z.string().datetime(),
    table_count: z.number().nonnegative(),
    staff_count: z.number().nonnegative()
  })),
  users: z.array(z.object({
    id: NumericIdSchema,
    name: z.string(),
    email: z.string().email(),
    phone: z.string().nullable(),
    is_active: z.boolean(),
    email_verified_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    last_login_at: z.string().datetime().nullable(),
    roles: z.array(z.object({
      outlet_id: NumericIdSchema.nullable(),
      role: z.enum(["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]),
      permissions: z.array(z.string())
    }))
  })),
  tax_settings: z.array(z.object({
    id: NumericIdSchema,
    code: z.string(),
    name: z.string(),
    rate_percent: z.number().nonnegative(),
    is_inclusive: z.boolean(),
    is_default: z.boolean(),
    account_id: NumericIdSchema.nullable(),
    is_active: z.boolean()
  })),
  feature_flags: z.record(z.boolean()),
  system_config: z.record(z.any())
});

// ANALYTICS Tier - Comprehensive reporting and business intelligence
export const BackofficeAnalyticsDataSchema = z.object({
  financial_reports: z.array(z.object({
    report_type: z.enum(["PROFIT_LOSS", "BALANCE_SHEET", "CASH_FLOW", "SALES_SUMMARY"]),
    period_start: z.string().datetime(),
    period_end: z.string().datetime(),
    outlet_id: NumericIdSchema.nullable(),
    generated_at: z.string().datetime(),
    data: z.record(z.any())
  })),
  sales_analytics: z.object({
    daily_sales: z.array(z.object({
      date: z.string(),
      outlet_id: NumericIdSchema,
      total_sales: z.number().nonnegative(),
      transaction_count: z.number().nonnegative(),
      avg_ticket_size: z.number().nonnegative(),
      top_selling_items: z.array(z.object({
        item_id: NumericIdSchema,
        item_name: z.string(),
        quantity_sold: z.number().nonnegative(),
        revenue: z.number().nonnegative()
      }))
    })),
    monthly_trends: z.array(z.object({
      month: z.string(),
      revenue: z.number(),
      growth_rate: z.number(),
      customer_count: z.number().nonnegative(),
      avg_customer_value: z.number().nonnegative()
    }))
  }),
  audit_logs: z.array(z.object({
    id: NumericIdSchema,
    company_id: NumericIdSchema,
    outlet_id: NumericIdSchema.nullable(),
    user_id: NumericIdSchema.nullable(),
    action: z.string(),
    entity_type: z.string().nullable(),
    entity_id: z.string().nullable(),
    success: z.boolean(),
    ip_address: z.string().nullable(),
    user_agent: z.string().nullable(),
    created_at: z.string().datetime(),
    metadata: z.record(z.any()).nullable()
  })),
  reconciliation_data: z.array(z.object({
    id: NumericIdSchema,
    reconciliation_type: z.enum(["CASH", "CARD", "INVENTORY", "JOURNAL"]),
    outlet_id: NumericIdSchema,
    period_start: z.string().datetime(),
    period_end: z.string().datetime(),
    expected_amount: z.number(),
    actual_amount: z.number(),
    variance: z.number(),
    variance_reason: z.string().nullable(),
    reconciled_by: NumericIdSchema.nullable(),
    reconciled_at: z.string().datetime().nullable(),
    status: z.enum(["PENDING", "RECONCILED", "DISPUTED"]),
    notes: z.string().nullable()
  }))
});

// Combined backoffice sync response by tier
export const BackofficeTierDataSchema = z.discriminatedUnion("tier", [
  z.object({ tier: z.literal("REALTIME"), data: BackofficeRealtimeDataSchema }),
  z.object({ tier: z.literal("OPERATIONAL"), data: BackofficeOperationalDataSchema }),
  z.object({ tier: z.literal("MASTER"), data: BackofficeMasterDataSchema }),
  z.object({ tier: z.literal("ADMIN"), data: BackofficeAdminDataSchema }),
  z.object({ tier: z.literal("ANALYTICS"), data: BackofficeAnalyticsDataSchema })
]);

// Type exports
export type BackofficeRealtimeData = z.infer<typeof BackofficeRealtimeDataSchema>;
export type BackofficeOperationalData = z.infer<typeof BackofficeOperationalDataSchema>;
export type BackofficeMasterData = z.infer<typeof BackofficeMasterDataSchema>;
export type BackofficeAdminData = z.infer<typeof BackofficeAdminDataSchema>;
export type BackofficeAnalyticsData = z.infer<typeof BackofficeAnalyticsDataSchema>;
export type BackofficeTierData = z.infer<typeof BackofficeTierDataSchema>;