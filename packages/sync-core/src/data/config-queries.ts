// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";

export type CompanyConfigQueryResult = {
  company_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_number: string | null;
  currency_code: string;
  timezone: string;
  fiscal_year_start: number;
  accounting_method: "CASH" | "ACCRUAL";
  multi_outlet_enabled: boolean;
  created_at: string;
};

/**
 * Get company configuration.
 */
export async function getCompanyConfig(
  db: DbConn,
  companyId: number
): Promise<CompanyConfigQueryResult | null> {
  const row = await db.queryOne<RowDataPacket>(
    `SELECT id AS company_id, name, email, phone, address, tax_number, 
            currency_code, timezone, fiscal_year_start, accounting_method,
            multi_outlet_enabled, created_at
     FROM companies 
     WHERE id = ?`,
    [companyId]
  );
  
  if (!row) return null;
  
  return {
    company_id: Number(row.company_id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    tax_number: row.tax_number,
    currency_code: row.currency_code,
    timezone: row.timezone,
    fiscal_year_start: Number(row.fiscal_year_start),
    accounting_method: row.accounting_method,
    multi_outlet_enabled: row.multi_outlet_enabled === 1,
    created_at: row.created_at
  };
}

export type ModuleSettingQueryResult = {
  module_id: number;
  module_code: string;
  enabled: boolean;
  config_json: string | null;
};

/**
 * Get module settings for a company.
 */
export async function getModuleSettings(
  db: DbConn,
  companyId: number
): Promise<ModuleSettingQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT m.id AS module_id, m.code AS module_code, cm.enabled, cm.config_json
     FROM company_modules cm
     INNER JOIN modules m ON m.id = cm.module_id
     WHERE cm.company_id = ?`,
    [companyId]
  );
  
  return rows.map((row) => ({
    module_id: Number(row.module_id),
    module_code: row.module_code,
    enabled: row.enabled === 1,
    config_json: row.config_json
  }));
}

/**
 * Get a specific module setting for a company.
 */
export async function getModuleSetting(
  db: DbConn,
  companyId: number,
  moduleCode: string
): Promise<ModuleSettingQueryResult | null> {
  const row = await db.queryOne<RowDataPacket>(
    `SELECT m.id AS module_id, m.code AS module_code, cm.enabled, cm.config_json
     FROM company_modules cm
     INNER JOIN modules m ON m.id = cm.module_id
     WHERE cm.company_id = ? AND m.code = ?`,
    [companyId, moduleCode]
  );
  
  if (!row) return null;
  
  return {
    module_id: Number(row.module_id),
    module_code: row.module_code,
    enabled: row.enabled === 1,
    config_json: row.config_json
  };
}

export type FeatureFlagQueryResult = {
  key: string;
  enabled: boolean;
};

/**
 * Get all feature flags for a company.
 */
export async function getFeatureFlags(
  db: DbConn,
  companyId: number
): Promise<FeatureFlagQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT \`key\`, enabled FROM feature_flags WHERE company_id = ?`,
    [companyId]
  );
  
  return rows.map((row) => ({
    key: row.key,
    enabled: row.enabled === 1
  }));
}

/**
 * Get feature flags matching a prefix (e.g., 'pos.%', 'backoffice.%').
 */
export async function getFeatureFlagsByPrefix(
  db: DbConn,
  companyId: number,
  prefix: string
): Promise<FeatureFlagQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT \`key\`, enabled FROM feature_flags WHERE company_id = ? AND \`key\` LIKE ?`,
    [companyId, `${prefix}%`]
  );
  
  return rows.map((row) => ({
    key: row.key,
    enabled: row.enabled === 1
  }));
}
