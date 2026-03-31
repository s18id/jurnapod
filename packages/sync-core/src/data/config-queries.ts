// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { KyselySchema } from "@jurnapod/db";

export type CompanyConfigQueryResult = {
  company_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  tax_id: string | null;
  legal_name: string | null;
  currency_code: string | null;
  timezone: string | null;
  created_at: string;
};

/**
 * Get company configuration.
 */
export async function getCompanyConfig(
  db: KyselySchema,
  companyId: number
): Promise<CompanyConfigQueryResult | null> {
  const result = await db
    .selectFrom('companies')
    .selectAll()
    .where('id', '=', companyId)
    .executeTakeFirst();
  
  if (!result) return null;
  
  const row = result as any;
  return {
    company_id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
    city: row.city,
    postal_code: row.postal_code,
    tax_id: row.tax_id,
    legal_name: row.legal_name,
    currency_code: row.currency_code,
    timezone: row.timezone,
    created_at: row.created_at.toISOString()
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
  db: KyselySchema,
  companyId: number
): Promise<ModuleSettingQueryResult[]> {
  const result = await db
    .selectFrom('company_modules as cm')
    .innerJoin('modules as m', 'm.id', 'cm.module_id')
    .select(['m.id', 'm.code', 'cm.enabled', 'cm.config_json'])
    .where('cm.company_id', '=', companyId)
    .execute();
  
  return result.map((row: any) => ({
    module_id: Number(row.id),
    module_code: row.code,
    enabled: row.enabled === 1,
    config_json: row.config_json
  }));
}

/**
 * Get a specific module setting for a company.
 */
export async function getModuleSetting(
  db: KyselySchema,
  companyId: number,
  moduleCode: string
): Promise<ModuleSettingQueryResult | null> {
  const result = await db
    .selectFrom('company_modules as cm')
    .innerJoin('modules as m', 'm.id', 'cm.module_id')
    .select(['m.id', 'm.code', 'cm.enabled', 'cm.config_json'])
    .where('cm.company_id', '=', companyId)
    .where('m.code', '=', moduleCode)
    .executeTakeFirst();
  
  if (!result) return null;
  
  const row = result as any;
  return {
    module_id: Number(row.id),
    module_code: row.code,
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
  db: KyselySchema,
  companyId: number
): Promise<FeatureFlagQueryResult[]> {
  const result = await db
    .selectFrom('feature_flags')
    .selectAll()
    .where('company_id', '=', companyId)
    .execute();
  
  return result.map((row: any) => ({
    key: row.key,
    enabled: row.enabled === 1
  }));
}

/**
 * Get feature flags matching a prefix (e.g., 'pos.%', 'backoffice.%').
 */
export async function getFeatureFlagsByPrefix(
  db: KyselySchema,
  companyId: number,
  prefix: string
): Promise<FeatureFlagQueryResult[]> {
  const result = await db
    .selectFrom('feature_flags')
    .selectAll()
    .where('company_id', '=', companyId)
    .where('key', 'like', `${prefix}%`)
    .execute();
  
  return result.map((row: any) => ({
    key: row.key,
    enabled: row.enabled === 1
  }));
}