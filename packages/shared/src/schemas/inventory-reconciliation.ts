// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
// Description: Shared Zod schemas for inventory reconciliation endpoints

import { z } from "zod";

/**
 * Inventory Reconciliation Settings Update Schema
 * Body for PUT /accounting/reports/inventory-reconciliation/settings
 */
export const InventoryReconciliationSettingsUpdateSchema = z.object({
  account_ids: z
    .array(z.number().int().positive())
    .min(1, "At least one account is required")
    .max(50, "Maximum 50 accounts allowed")
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "Account IDs must be unique",
    }),
});

/**
 * Inventory Reconciliation Settings Response Schema
 */
export const InventoryReconciliationSettingsResponseSchema = z.object({
  account_ids: z.array(z.number().int().positive()),
  source: z.enum(["settings", "fallback_company_default", "none"]),
});

/**
 * Inventory Reconciliation Summary Query Schema
 */
export const InventoryReconciliationSummaryQuerySchema = z.object({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
});

/**
 * Inventory Reconciliation Summary Response Schema
 */
export const InventoryReconciliationSummaryResponseSchema = z.object({
  as_of_date: z.string(),
  inventory_subledger_balance: z.string(),
  gl_control_balance: z.string(),
  variance: z.string(),
  configured_account_ids: z.array(z.number().int().positive()),
  account_source: z.enum(["settings", "fallback_company_default", "none"]),
  currency: z.string(),
});

/**
 * Inventory Reconciliation Drilldown Query Schema
 */
export const InventoryReconciliationDrilldownQuerySchema = z.object({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  movement_type: z.enum(["receipt", "adjustment", "sale", "transfer", "refund"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

// Type exports
export type InventoryReconciliationSettingsUpdate = z.infer<typeof InventoryReconciliationSettingsUpdateSchema>;
export type InventoryReconciliationSettingsResponse = z.infer<typeof InventoryReconciliationSettingsResponseSchema>;
export type InventoryReconciliationSummaryQuery = z.infer<typeof InventoryReconciliationSummaryQuerySchema>;
export type InventoryReconciliationSummaryResponse = z.infer<typeof InventoryReconciliationSummaryResponseSchema>;
export type InventoryReconciliationDrilldownQuery = z.infer<typeof InventoryReconciliationDrilldownQuerySchema>;