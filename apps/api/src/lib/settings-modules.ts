// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "./db";
import { sql } from "kysely";

/**
 * POS module explicit settings
 */
export interface PosModuleSettings {
  pos_enabled: boolean;
  pos_offline_mode: boolean;
  pos_receipt_template: string;
  pos_auto_sync: boolean;
  pos_sync_interval_seconds: number;
  pos_require_auth: boolean;
  pos_allow_discount_after_tax: boolean;
  pos_default_payment_method_id: number | null;
  pos_tip_adjustment_enabled: boolean;
}

/**
 * Inventory module explicit settings
 */
export interface InventoryModuleSettings {
  inventory_enabled: boolean;
  inventory_multi_warehouse: boolean;
  inventory_warehouses: unknown | null;
  inventory_auto_reorder: boolean;
  inventory_low_stock_threshold: number;
  inventory_default_asset_account_id: number | null;
  inventory_default_cogs_account_id: number | null;
}

/**
 * Sales module explicit settings
 */
export interface SalesModuleSettings {
  sales_enabled: boolean;
  sales_tax_mode: "inclusive" | "exclusive" | "mixed";
  sales_default_tax_rate_id: number | null;
  sales_allow_partial_pay: boolean;
  sales_credit_limit_enabled: boolean;
  sales_default_price_list_id: number | null;
  sales_default_income_account_id: number | null;
}

/**
 * Purchasing module explicit settings
 */
export interface PurchasingModuleSettings {
  purchasing_enabled: boolean;
  purchasing_approval_workflow: boolean;
  purchasing_default_tax_rate_id: number | null;
  purchasing_default_expense_account_id: number | null;
  purchasing_credit_limit_enabled: boolean;
}

/**
 * Module settings for a company (legacy interface for backward compatibility)
 */
export interface ModuleSettings {
  code: string;
  name: string;
  enabled: boolean;
  config_json: string | null;
}

/**
 * Extended module settings with explicit typed columns
 */
export interface ExtendedModuleSettings extends ModuleSettings {
  pos_settings: PosModuleSettings | null;
  inventory_settings: InventoryModuleSettings | null;
  sales_settings: SalesModuleSettings | null;
  purchasing_settings: PurchasingModuleSettings | null;
}

/**
 * Error thrown when a module code doesn't exist
 */
export class ModuleNotFoundError extends Error {
  constructor(code: string) {
    super(`Module ${code} not found`);
    this.name = "ModuleNotFoundError";
  }
}

/**
 * List all modules for a company with their settings.
 *
 * @param companyId - The company ID
 * @returns Array of module settings ordered by code
 */
export async function listCompanyModules(
  companyId: number
): Promise<ModuleSettings[]> {
  const db = getDb();

  const rows = await sql<{ code: string; name: string; enabled: number; config_json: string | null }>`
    SELECT m.code, m.name, cm.enabled, cm.config_json
    FROM modules m
    INNER JOIN company_modules cm ON cm.module_id = m.id
    WHERE cm.company_id = ${companyId}
    ORDER BY m.code ASC
  `.execute(db);

  return rows.rows.map((row) => ({
    code: row.code,
    name: row.name,
    enabled: Boolean(row.enabled),
    config_json: row.config_json
  }));
}

/**
 * List all modules for a company with extended explicit typed settings.
 *
 * @param companyId - The company ID
 * @returns Array of extended module settings ordered by code
 */
export async function listCompanyModulesExtended(
  companyId: number
): Promise<ExtendedModuleSettings[]> {
  const db = getDb();

  const rows = await sql<{
    code: string;
    name: string;
    enabled: number;
    config_json: string | null;
    pos_enabled: number;
    pos_offline_mode: number;
    pos_receipt_template: string;
    pos_auto_sync: number;
    pos_sync_interval_seconds: number;
    pos_require_auth: number;
    pos_allow_discount_after_tax: number;
    pos_default_payment_method_id: number | null;
    pos_tip_adjustment_enabled: number;
    inventory_enabled: number;
    inventory_multi_warehouse: number;
    inventory_warehouses: string | null;
    inventory_auto_reorder: number;
    inventory_low_stock_threshold: number;
    inventory_default_asset_account_id: number | null;
    inventory_default_cogs_account_id: number | null;
    sales_enabled: number;
    sales_tax_mode: string;
    sales_default_tax_rate_id: number | null;
    sales_allow_partial_pay: number;
    sales_credit_limit_enabled: number;
    sales_default_price_list_id: number | null;
    sales_default_income_account_id: number | null;
    purchasing_enabled: number;
    purchasing_approval_workflow: number;
    purchasing_default_tax_rate_id: number | null;
    purchasing_default_expense_account_id: number | null;
    purchasing_credit_limit_enabled: number;
  }>`
    SELECT 
      m.code, m.name, cm.enabled, cm.config_json,
      cm.pos_enabled, cm.pos_offline_mode, cm.pos_receipt_template,
      cm.pos_auto_sync, cm.pos_sync_interval_seconds, cm.pos_require_auth,
      cm.pos_allow_discount_after_tax, cm.pos_default_payment_method_id, cm.pos_tip_adjustment_enabled,
      cm.inventory_enabled, cm.inventory_multi_warehouse, cm.inventory_warehouses,
      cm.inventory_auto_reorder, cm.inventory_low_stock_threshold,
      cm.inventory_default_asset_account_id, cm.inventory_default_cogs_account_id,
      cm.sales_enabled, cm.sales_tax_mode, cm.sales_default_tax_rate_id,
      cm.sales_allow_partial_pay, cm.sales_credit_limit_enabled,
      cm.sales_default_price_list_id, cm.sales_default_income_account_id,
      cm.purchasing_enabled, cm.purchasing_approval_workflow,
      cm.purchasing_default_tax_rate_id, cm.purchasing_default_expense_account_id,
      cm.purchasing_credit_limit_enabled
    FROM modules m
    INNER JOIN company_modules cm ON cm.module_id = m.id
    WHERE cm.company_id = ${companyId}
    ORDER BY m.code ASC
  `.execute(db);

  return rows.rows.map((row) => ({
    code: row.code,
    name: row.name,
    enabled: Boolean(row.enabled),
    config_json: row.config_json,
    pos_settings: row.code === "pos" ? {
      pos_enabled: Boolean(row.pos_enabled),
      pos_offline_mode: Boolean(row.pos_offline_mode),
      pos_receipt_template: row.pos_receipt_template,
      pos_auto_sync: Boolean(row.pos_auto_sync),
      pos_sync_interval_seconds: row.pos_sync_interval_seconds,
      pos_require_auth: Boolean(row.pos_require_auth),
      pos_allow_discount_after_tax: Boolean(row.pos_allow_discount_after_tax),
      pos_default_payment_method_id: row.pos_default_payment_method_id,
      pos_tip_adjustment_enabled: Boolean(row.pos_tip_adjustment_enabled)
    } : null,
    inventory_settings: row.code === "inventory" ? {
      inventory_enabled: Boolean(row.inventory_enabled),
      inventory_multi_warehouse: Boolean(row.inventory_multi_warehouse),
      inventory_warehouses: row.inventory_warehouses ? JSON.parse(row.inventory_warehouses) : null,
      inventory_auto_reorder: Boolean(row.inventory_auto_reorder),
      inventory_low_stock_threshold: row.inventory_low_stock_threshold,
      inventory_default_asset_account_id: row.inventory_default_asset_account_id,
      inventory_default_cogs_account_id: row.inventory_default_cogs_account_id
    } : null,
    sales_settings: row.code === "sales" ? {
      sales_enabled: Boolean(row.sales_enabled),
      sales_tax_mode: row.sales_tax_mode as "inclusive" | "exclusive" | "mixed",
      sales_default_tax_rate_id: row.sales_default_tax_rate_id,
      sales_allow_partial_pay: Boolean(row.sales_allow_partial_pay),
      sales_credit_limit_enabled: Boolean(row.sales_credit_limit_enabled),
      sales_default_price_list_id: row.sales_default_price_list_id,
      sales_default_income_account_id: row.sales_default_income_account_id
    } : null,
    purchasing_settings: row.code === "purchasing" ? {
      purchasing_enabled: Boolean(row.purchasing_enabled),
      purchasing_approval_workflow: Boolean(row.purchasing_approval_workflow),
      purchasing_default_tax_rate_id: row.purchasing_default_tax_rate_id,
      purchasing_default_expense_account_id: row.purchasing_default_expense_account_id,
      purchasing_credit_limit_enabled: Boolean(row.purchasing_credit_limit_enabled)
    } : null
  }));
}

/**
 * Get module ID by module code.
 * Returns null if module doesn't exist.
 *
 * @param code - The module code
 * @returns Module ID or null if not found
 */
export async function getModuleIdByCode(
  code: string
): Promise<number | null> {
  const db = getDb();

  const rows = await sql<{ id: number }>`
    SELECT id FROM modules WHERE code = ${code} LIMIT 1
  `.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  return rows.rows[0].id;
}

/**
 * Update or insert company module settings.
 * Uses ON DUPLICATE KEY UPDATE for upsert behavior.
 *
 * @param companyId - The company ID
 * @param moduleCode - The module code
 * @param enabled - Whether the module is enabled
 * @param configJson - Optional JSON configuration string
 * @throws ModuleNotFoundError - If the module code doesn't exist
 */
export async function updateCompanyModule(
  companyId: number,
  moduleCode: string,
  enabled: boolean,
  configJson: string | null
): Promise<void> {
  const db = getDb();

  // First get the module ID by code
  const moduleId = await getModuleIdByCode(moduleCode);

  if (moduleId === null) {
    throw new ModuleNotFoundError(moduleCode);
  }

  // null configJson means "preserve existing" — never write NULL to NOT NULL column
  if (configJson === null) {
    await sql`
      UPDATE company_modules
      SET enabled = ${enabled ? 1 : 0}, updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ${companyId} AND module_id = ${moduleId}
    `.execute(db);
  } else {
    await sql`
      INSERT INTO company_modules (company_id, module_id, enabled, config_json, updated_at)
      VALUES (${companyId}, ${moduleId}, ${enabled ? 1 : 0}, ${configJson}, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        enabled = VALUES(enabled),
        config_json = VALUES(config_json),
        updated_at = CURRENT_TIMESTAMP
    `.execute(db);
  }
}

/**
 * Update company module settings with explicit typed columns.
 * Uses ON DUPLICATE KEY UPDATE for upsert behavior.
 *
 * @param companyId - The company ID
 * @param moduleCode - The module code
 * @param settings - The explicit module settings
 * @throws ModuleNotFoundError - If the module code doesn't exist
 */
export async function updateCompanyModuleExplicit(
  companyId: number,
  moduleCode: string,
  settings: {
    enabled: boolean;
    pos_settings?: Partial<PosModuleSettings>;
    inventory_settings?: Partial<InventoryModuleSettings>;
    sales_settings?: Partial<SalesModuleSettings>;
    purchasing_settings?: Partial<PurchasingModuleSettings>;
  }
): Promise<void> {
  const db = getDb();

  // First get the module ID by code
  const moduleId = await getModuleIdByCode(moduleCode);

  if (moduleId === null) {
    throw new ModuleNotFoundError(moduleCode);
  }

  // Build dynamic update based on module code
  const updates: string[] = ["enabled = VALUES(enabled)", "updated_at = CURRENT_TIMESTAMP"];

  if (moduleCode === "pos" && settings.pos_settings) {
    const ps = settings.pos_settings;
    if (ps.pos_enabled !== undefined) updates.push(`pos_enabled = ${ps.pos_enabled ? 1 : 0}`);
    if (ps.pos_offline_mode !== undefined) updates.push(`pos_offline_mode = ${ps.pos_offline_mode ? 1 : 0}`);
    if (ps.pos_receipt_template !== undefined) updates.push(`pos_receipt_template = '${ps.pos_receipt_template.replace(/'/g, "\\'")}'`);
    if (ps.pos_auto_sync !== undefined) updates.push(`pos_auto_sync = ${ps.pos_auto_sync ? 1 : 0}`);
    if (ps.pos_sync_interval_seconds !== undefined) updates.push(`pos_sync_interval_seconds = ${ps.pos_sync_interval_seconds}`);
    if (ps.pos_require_auth !== undefined) updates.push(`pos_require_auth = ${ps.pos_require_auth ? 1 : 0}`);
    if (ps.pos_allow_discount_after_tax !== undefined) updates.push(`pos_allow_discount_after_tax = ${ps.pos_allow_discount_after_tax ? 1 : 0}`);
    if (ps.pos_default_payment_method_id !== undefined) updates.push(`pos_default_payment_method_id = ${ps.pos_default_payment_method_id}`);
    if (ps.pos_tip_adjustment_enabled !== undefined) updates.push(`pos_tip_adjustment_enabled = ${ps.pos_tip_adjustment_enabled ? 1 : 0}`);
  }

  if (moduleCode === "inventory" && settings.inventory_settings) {
    const is = settings.inventory_settings;
    if (is.inventory_enabled !== undefined) updates.push(`inventory_enabled = ${is.inventory_enabled ? 1 : 0}`);
    if (is.inventory_multi_warehouse !== undefined) updates.push(`inventory_multi_warehouse = ${is.inventory_multi_warehouse ? 1 : 0}`);
    if (is.inventory_warehouses !== undefined) updates.push(`inventory_warehouses = ${is.inventory_warehouses ? JSON.stringify(is.inventory_warehouses) : 'NULL'}`);
    if (is.inventory_auto_reorder !== undefined) updates.push(`inventory_auto_reorder = ${is.inventory_auto_reorder ? 1 : 0}`);
    if (is.inventory_low_stock_threshold !== undefined) updates.push(`inventory_low_stock_threshold = ${is.inventory_low_stock_threshold}`);
    if (is.inventory_default_asset_account_id !== undefined) updates.push(`inventory_default_asset_account_id = ${is.inventory_default_asset_account_id}`);
    if (is.inventory_default_cogs_account_id !== undefined) updates.push(`inventory_default_cogs_account_id = ${is.inventory_default_cogs_account_id}`);
  }

  if (moduleCode === "sales" && settings.sales_settings) {
    const ss = settings.sales_settings;
    if (ss.sales_enabled !== undefined) updates.push(`sales_enabled = ${ss.sales_enabled ? 1 : 0}`);
    if (ss.sales_tax_mode !== undefined) updates.push(`sales_tax_mode = '${ss.sales_tax_mode}'`);
    if (ss.sales_default_tax_rate_id !== undefined) updates.push(`sales_default_tax_rate_id = ${ss.sales_default_tax_rate_id}`);
    if (ss.sales_allow_partial_pay !== undefined) updates.push(`sales_allow_partial_pay = ${ss.sales_allow_partial_pay ? 1 : 0}`);
    if (ss.sales_credit_limit_enabled !== undefined) updates.push(`sales_credit_limit_enabled = ${ss.sales_credit_limit_enabled ? 1 : 0}`);
    if (ss.sales_default_price_list_id !== undefined) updates.push(`sales_default_price_list_id = ${ss.sales_default_price_list_id}`);
    if (ss.sales_default_income_account_id !== undefined) updates.push(`sales_default_income_account_id = ${ss.sales_default_income_account_id}`);
  }

  if (moduleCode === "purchasing" && settings.purchasing_settings) {
    const ps = settings.purchasing_settings;
    if (ps.purchasing_enabled !== undefined) updates.push(`purchasing_enabled = ${ps.purchasing_enabled ? 1 : 0}`);
    if (ps.purchasing_approval_workflow !== undefined) updates.push(`purchasing_approval_workflow = ${ps.purchasing_approval_workflow ? 1 : 0}`);
    if (ps.purchasing_default_tax_rate_id !== undefined) updates.push(`purchasing_default_tax_rate_id = ${ps.purchasing_default_tax_rate_id}`);
    if (ps.purchasing_default_expense_account_id !== undefined) updates.push(`purchasing_default_expense_account_id = ${ps.purchasing_default_expense_account_id}`);
    if (ps.purchasing_credit_limit_enabled !== undefined) updates.push(`purchasing_credit_limit_enabled = ${ps.purchasing_credit_limit_enabled ? 1 : 0}`);
  }

  const updateClause = updates.join(", ");

  await sql`
    INSERT INTO company_modules (company_id, module_id, enabled, config_json, updated_at)
    VALUES (${companyId}, ${moduleId}, ${settings.enabled ? 1 : 0}, '{}', CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      ${sql.raw(updateClause)}
  `.execute(db);
}

/**
 * Check if a module is enabled for a company.
 *
 * @param companyId - The company ID
 * @param moduleCode - The module code
 * @returns True if module is enabled, false otherwise
 */
export async function isModuleEnabled(
  companyId: number,
  moduleCode: string
): Promise<boolean> {
  const db = getDb();

  const rows = await sql<{ enabled: number }>`
    SELECT cm.enabled
    FROM company_modules cm
    INNER JOIN modules m ON m.id = cm.module_id
    WHERE cm.company_id = ${companyId} AND m.code = ${moduleCode}
  `.execute(db);

  if (rows.rows.length === 0) {
    return false;
  }

  return Boolean(rows.rows[0].enabled);
}
