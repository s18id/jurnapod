// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "./db";
import type { KyselySchema } from "@jurnapod/db";
import { AuditService } from "@jurnapod/modules-platform";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";
import { sql } from "kysely";

export class CompanyNotFoundError extends Error {}
export class CompanyCodeExistsError extends Error {}
export class CompanyDeactivatedError extends Error {}
export class CompanyAlreadyActiveError extends Error {}

const DEFAULT_OUTLET_CODE = "MAIN";
const DEFAULT_OUTLET_NAME = "Main Outlet";

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

const MODULE_DEFINITIONS = [
  {
    code: "platform",
    name: "Platform",
    description: "Core platform services"
  },
  {
    code: "pos",
    name: "POS",
    description: "Point of sale"
  },
  {
    code: "sales",
    name: "Sales",
    description: "Sales invoices"
  },
  {
    code: "payments",
    name: "Payments",
    description: "Payment processing and management"
  },
  {
    code: "inventory",
    name: "Inventory",
    description: "Stock movements and recipes"
  },
  {
    code: "purchasing",
    name: "Purchasing",
    description: "Purchasing and payables"
  },
  {
    code: "reports",
    name: "Reports",
    description: "Reporting and analytics"
  },
  {
    code: "settings",
    name: "Settings",
    description: "Settings and configuration"
  },
  {
    code: "accounts",
    name: "Accounts",
    description: "Chart of accounts"
  },
  {
    code: "journals",
    name: "Journals",
    description: "Journal entries and posting"
  }
] as const;

const COMPANY_MODULE_DEFAULTS = [
  { code: "platform", enabled: true, config: {} },
  { code: "pos", enabled: true, config: { payment_methods: ["CASH"] } },
  { code: "sales", enabled: true, config: {} },
  { code: "inventory", enabled: true, config: { level: 0 } },
  { code: "purchasing", enabled: false, config: {} },
  { code: "reports", enabled: true, config: {} },
  { code: "settings", enabled: true, config: {} },
  { code: "accounts", enabled: true, config: {} },
  { code: "journals", enabled: true, config: {} }
] as const;

const ROLE_DEFINITIONS = [
  { code: "SUPER_ADMIN", name: "Super Admin", isGlobal: true, roleLevel: 100 },
  { code: "OWNER", name: "Owner", isGlobal: true, roleLevel: 90 },
  { code: "COMPANY_ADMIN", name: "Company Admin", isGlobal: true, roleLevel: 80 },
  { code: "ADMIN", name: "Admin", isGlobal: false, roleLevel: 60 },
  { code: "ACCOUNTANT", name: "Accountant", isGlobal: false, roleLevel: 40 },
  { code: "CASHIER", name: "Cashier", isGlobal: false, roleLevel: 20 }
] as const;

const MODULE_ROLE_DEFAULTS = [
  { roleCode: "SUPER_ADMIN", module: "companies", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "users", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "roles", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "outlets", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "accounts", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "journals", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "cash_bank", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "sales", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "payments", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "inventory", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "purchasing", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "reports", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "settings", permissionMask: 15 },
  { roleCode: "SUPER_ADMIN", module: "pos", permissionMask: 15 },
  { roleCode: "OWNER", module: "companies", permissionMask: 15 },
  { roleCode: "OWNER", module: "users", permissionMask: 15 },
  { roleCode: "OWNER", module: "roles", permissionMask: 15 },
  { roleCode: "OWNER", module: "outlets", permissionMask: 15 },
  { roleCode: "OWNER", module: "accounts", permissionMask: 15 },
  { roleCode: "OWNER", module: "journals", permissionMask: 15 },
  { roleCode: "OWNER", module: "cash_bank", permissionMask: 15 },
  { roleCode: "OWNER", module: "sales", permissionMask: 15 },
  { roleCode: "OWNER", module: "payments", permissionMask: 15 },
  { roleCode: "OWNER", module: "inventory", permissionMask: 15 },
  { roleCode: "OWNER", module: "purchasing", permissionMask: 15 },
  { roleCode: "OWNER", module: "reports", permissionMask: 15 },
  { roleCode: "OWNER", module: "settings", permissionMask: 15 },
  { roleCode: "OWNER", module: "pos", permissionMask: 15 },
  { roleCode: "COMPANY_ADMIN", module: "companies", permissionMask: 0 },
  { roleCode: "COMPANY_ADMIN", module: "users", permissionMask: 15 },
  { roleCode: "COMPANY_ADMIN", module: "roles", permissionMask: 0 },
  { roleCode: "COMPANY_ADMIN", module: "outlets", permissionMask: 15 },
  { roleCode: "COMPANY_ADMIN", module: "accounts", permissionMask: 15 },
  { roleCode: "COMPANY_ADMIN", module: "journals", permissionMask: 15 },
  { roleCode: "COMPANY_ADMIN", module: "cash_bank", permissionMask: 15 },
  { roleCode: "COMPANY_ADMIN", module: "sales", permissionMask: 15 },
  { roleCode: "COMPANY_ADMIN", module: "payments", permissionMask: 15 },
  { roleCode: "COMPANY_ADMIN", module: "inventory", permissionMask: 15 },
  { roleCode: "COMPANY_ADMIN", module: "purchasing", permissionMask: 0 },
  { roleCode: "COMPANY_ADMIN", module: "reports", permissionMask: 2 },
  { roleCode: "COMPANY_ADMIN", module: "settings", permissionMask: 6 },
  { roleCode: "COMPANY_ADMIN", module: "pos", permissionMask: 15 },
  { roleCode: "ADMIN", module: "companies", permissionMask: 2 },
  { roleCode: "ADMIN", module: "users", permissionMask: 15 },
  { roleCode: "ADMIN", module: "roles", permissionMask: 2 },
  { roleCode: "ADMIN", module: "outlets", permissionMask: 15 },
  { roleCode: "ADMIN", module: "accounts", permissionMask: 15 },
  { roleCode: "ADMIN", module: "journals", permissionMask: 15 },
  { roleCode: "ADMIN", module: "cash_bank", permissionMask: 15 },
  { roleCode: "ADMIN", module: "sales", permissionMask: 15 },
  { roleCode: "ADMIN", module: "payments", permissionMask: 15 },
  { roleCode: "ADMIN", module: "inventory", permissionMask: 15 },
  { roleCode: "ADMIN", module: "purchasing", permissionMask: 15 },
  { roleCode: "ADMIN", module: "reports", permissionMask: 2 },
  { roleCode: "ADMIN", module: "settings", permissionMask: 6 },
  { roleCode: "ADMIN", module: "pos", permissionMask: 15 },
  { roleCode: "CASHIER", module: "companies", permissionMask: 0 },
  { roleCode: "CASHIER", module: "users", permissionMask: 0 },
  { roleCode: "CASHIER", module: "roles", permissionMask: 0 },
  { roleCode: "CASHIER", module: "outlets", permissionMask: 2 },
  { roleCode: "CASHIER", module: "accounts", permissionMask: 0 },
  { roleCode: "CASHIER", module: "journals", permissionMask: 0 },
  { roleCode: "CASHIER", module: "cash_bank", permissionMask: 0 },
  { roleCode: "CASHIER", module: "sales", permissionMask: 3 },
  { roleCode: "CASHIER", module: "payments", permissionMask: 3 },
  { roleCode: "CASHIER", module: "inventory", permissionMask: 2 },
  { roleCode: "CASHIER", module: "purchasing", permissionMask: 0 },
  { roleCode: "CASHIER", module: "reports", permissionMask: 2 },
  { roleCode: "CASHIER", module: "settings", permissionMask: 0 },
  { roleCode: "CASHIER", module: "pos", permissionMask: 3 },
  { roleCode: "ACCOUNTANT", module: "companies", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "users", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "roles", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "outlets", permissionMask: 2 },
  { roleCode: "ACCOUNTANT", module: "accounts", permissionMask: 2 },
  { roleCode: "ACCOUNTANT", module: "journals", permissionMask: 2 },
  { roleCode: "ACCOUNTANT", module: "cash_bank", permissionMask: 3 },
  { roleCode: "ACCOUNTANT", module: "sales", permissionMask: 2 },
  { roleCode: "ACCOUNTANT", module: "payments", permissionMask: 2 },
  { roleCode: "ACCOUNTANT", module: "inventory", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "purchasing", permissionMask: 2 },
  { roleCode: "ACCOUNTANT", module: "reports", permissionMask: 2 },
  { roleCode: "ACCOUNTANT", module: "settings", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "pos", permissionMask: 2 }
] as const;

const SETTINGS_DEFINITIONS = [
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

export type CompanyResponse = {
  id: number;
  code: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  timezone: string | null;
  currency_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CompanyActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

type CompanyRow = {
  id: number;
  code: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  timezone: string | null;
  currency_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function buildAuditContext(companyId: number, actor: CompanyActor) {
  return {
    company_id: companyId,
    user_id: actor.userId,
    outlet_id: actor.outletId ?? null,
    ip_address: actor.ipAddress ?? null
  };
}

function normalizeCompanyRow(row: CompanyRow): CompanyResponse {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    legal_name: row.legal_name,
    tax_id: row.tax_id,
    email: row.email,
    phone: row.phone,
    timezone: row.timezone,
    currency_code: row.currency_code,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
    city: row.city,
    postal_code: row.postal_code,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at),
    deleted_at: toRfc3339(row.deleted_at)
  };
}

async function ensureDefaultOutlet(
  db: KyselySchema,
  companyId: number
): Promise<number> {
  // Get company timezone to inherit
  const companyRow = await db
    .selectFrom('companies')
    .where('id', '=', companyId)
    .select(['timezone'])
    .executeTakeFirst();

  const companyTimezone = companyRow?.timezone ?? 'UTC';

  // Insert outlet with ON DUPLICATE KEY UPDATE using raw SQL (MySQL specific)
  const result = await sql`
    INSERT INTO outlets (company_id, code, name, timezone)
    VALUES (${companyId}, ${DEFAULT_OUTLET_CODE}, ${DEFAULT_OUTLET_NAME}, ${companyTimezone})
    ON DUPLICATE KEY UPDATE
      id = LAST_INSERT_ID(id),
      timezone = COALESCE(timezone, VALUES(timezone))
  `.execute(db);

  // For INSERT...ON DUPLICATE KEY UPDATE with LAST_INSERT_ID, we need to get the ID differently
  // If insertId is available, use it; otherwise query for the outlet
  let insertId = 0;
  if ('insertId' in result && result.insertId !== undefined) {
    insertId = Number(result.insertId);
  }
  
  if (insertId === 0) {
    // Query to get existing outlet
    const existing = await db
      .selectFrom('outlets')
      .where('company_id', '=', companyId)
      .where('code', '=', DEFAULT_OUTLET_CODE)
      .select(['id'])
      .executeTakeFirst();
    if (existing) {
      return Number(existing.id);
    }
  }

  return insertId > 0 ? insertId : companyId; // Fallback
}

async function upsertRole(
  db: KyselySchema,
  roleCode: string,
  roleName: string,
  isGlobal: boolean,
  roleLevel: number
): Promise<number> {
  const existing = await db
    .selectFrom('roles')
    .where('code', '=', roleCode)
    .select(['id'])
    .executeTakeFirst();

  if (existing) {
    return Number(existing.id);
  }

  const result = await db
    .insertInto('roles')
    .values({
      code: roleCode,
      name: roleName,
      is_global: isGlobal ? 1 : 0,
      role_level: roleLevel
    })
    .executeTakeFirst();

  return Number(result.insertId);
}

async function ensureRoles(db: KyselySchema): Promise<Record<string, number>> {
  const roleIds: Record<string, number> = {};
  for (const role of ROLE_DEFINITIONS) {
    roleIds[role.code] = await upsertRole(
      db,
      role.code,
      role.name,
      role.isGlobal,
      role.roleLevel
    );
  }
  return roleIds;
}

async function upsertModule(
  db: KyselySchema,
  moduleCode: string,
  moduleName: string,
  moduleDescription: string | null
): Promise<number> {
  await sql`
    INSERT INTO modules (code, name, description)
    VALUES (${moduleCode}, ${moduleName}, ${moduleDescription})
    ON DUPLICATE KEY UPDATE
      name = VALUES(name)
  `.execute(db);

  const row = await db
    .selectFrom('modules')
    .where('code', '=', moduleCode)
    .select(['id'])
    .executeTakeFirst();
  
  return Number(row!.id);
}

async function ensureModules(db: KyselySchema): Promise<void> {
  for (const module of MODULE_DEFINITIONS) {
    await upsertModule(db, module.code, module.name, module.description);
  }
}

async function upsertSetting(
  db: KyselySchema,
  key: string,
  value: string
): Promise<void> {
  await sql`
    INSERT INTO settings (setting_key, setting_value)
    VALUES (${key}, ${value})
    ON DUPLICATE KEY UPDATE
      setting_value = VALUES(setting_value)
  `.execute(db);
}

async function ensureSettings(db: KyselySchema): Promise<void> {
  for (const setting of SETTINGS_DEFINITIONS) {
    const envValue = process.env[setting.envKey];
    const parsedValue = setting.parse(envValue);
    const stringValue = String(parsedValue);
    await upsertSetting(db, setting.key, stringValue);
  }
}

async function ensureDefaultTaxRate(
  db: KyselySchema,
  companyId: number
): Promise<void> {
  await sql`
    INSERT IGNORE INTO tax_rates (company_id, name, rate, code)
    VALUES (${companyId}, 'VAT', 0.11, 'VAT')
  `.execute(db);
}

async function ensureCompanyModules(
  db: KyselySchema,
  companyId: number
): Promise<void> {
  // First get module IDs
  for (const moduleDefault of COMPANY_MODULE_DEFAULTS) {
    const moduleRow = await db
      .selectFrom('modules')
      .where('code', '=', moduleDefault.code)
      .select(['id'])
      .executeTakeFirst();
    
    if (moduleRow) {
      await sql`
        INSERT IGNORE INTO company_modules (company_id, module_id, enabled, config_json)
        VALUES (${companyId}, ${Number(moduleRow.id)}, ${moduleDefault.enabled ? 1 : 0}, ${JSON.stringify(moduleDefault.config)})
      `.execute(db);
    }
  }
}

async function ensureCompanyModuleRoles(
  db: KyselySchema,
  companyId: number,
  roleIds: Record<string, number>
): Promise<void> {
  for (const moduleRoleDefault of MODULE_ROLE_DEFAULTS) {
    const roleId = roleIds[moduleRoleDefault.roleCode];
    if (!roleId) continue;
    
    // Get module_id first
    const moduleRow = await db
      .selectFrom('modules')
      .where('code', '=', moduleRoleDefault.module)
      .select(['id'])
      .executeTakeFirst();
    
    if (moduleRow) {
      await sql`
        INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
        VALUES (${companyId}, ${roleId}, ${moduleRoleDefault.module}, ${moduleRoleDefault.permissionMask})
      `.execute(db);
    }
  }
}

async function ensureSystemAccounts(
  db: KyselySchema,
  companyId: number
): Promise<void> {
  const accountsToEnsure = [
    { code: "CASH", name: "Cash", type: "ASSET", parentCode: null },
    { code: "BANK", name: "Bank", type: "ASSET", parentCode: null },
    { code: "AR", name: "Accounts Receivable", type: "ASSET", parentCode: null },
    { code: "AP", name: "Accounts Payable", type: "LIABILITY", parentCode: null },
    { code: "SALES", name: "Sales Revenue", type: "REVENUE", parentCode: null },
    { code: "COGS", name: "Cost of Goods Sold", type: "EXPENSE", parentCode: null },
    { code: "INVENTORY", name: "Inventory", type: "ASSET", parentCode: null },
  ];

  for (const accountDef of accountsToEnsure) {
    const existing = await db
      .selectFrom('accounts')
      .where('company_id', '=', companyId)
      .where('code', '=', accountDef.code)
      .select(['id'])
      .executeTakeFirst();

    if (!existing) {
      // Get account_type_id for this type
      const typeRow = await db
        .selectFrom('account_types')
        .where('name', '=', accountDef.type)
        .select(['id'])
        .executeTakeFirst();

      if (typeRow) {
        await db
          .insertInto('accounts')
          .values({
            company_id: companyId,
            code: accountDef.code,
            name: accountDef.name,
            account_type_id: Number(typeRow.id)
          })
          .execute();
      }
    }
  }
}

async function bootstrapCompanyDefaults(
  db: KyselySchema,
  params: {
    companyId: number;
    actor: CompanyActor;
  }
): Promise<void> {
  await ensureDefaultOutlet(db, params.companyId);
  await ensureRoles(db);
  await ensureModules(db);
  await ensureSettings(db);
  await ensureDefaultTaxRate(db, params.companyId);
  await ensureCompanyModules(db, params.companyId);

  // Get role IDs after ensureRoles
  const roleIds: Record<string, number> = {};
  for (const role of ROLE_DEFINITIONS) {
    const row = await db
      .selectFrom('roles')
      .where('code', '=', role.code)
      .select(['id'])
      .executeTakeFirst();
    if (row) {
      roleIds[role.code] = Number(row.id);
    }
  }

  await ensureCompanyModuleRoles(db, params.companyId, roleIds);
  await ensureSystemAccounts(db, params.companyId);
}

async function ensureCompanyExists(
  db: KyselySchema,
  companyId: number,
  options?: { includeDeleted?: boolean }
): Promise<CompanyRow> {
  const includeDeleted = options?.includeDeleted ?? false;
  
  let query = db
    .selectFrom('companies')
    .where('id', '=', companyId)
    .select([
      'id', 'code', 'name', 'legal_name', 'tax_id', 'email', 'phone', 
      'timezone', 'currency_code', 'address_line1', 'address_line2', 
      'city', 'postal_code', 'created_at', 'updated_at', 'deleted_at'
    ]);

  if (!includeDeleted) {
    query = query.where('deleted_at', 'is', null);
  }

  const row = await query.executeTakeFirst();

  if (!row) {
    throw new CompanyNotFoundError(`Company with id ${companyId} not found`);
  }

  return row;
}

/**
 * Create a company with minimal setup (no bootstrap defaults).
 * Use this for testing - it only inserts the company row.
 * For production use, use createCompany() which includes bootstrap.
 */
export async function createCompanyBasic(params: {
  code: string;
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  timezone?: string | null;
  currency_code?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
}, db?: KyselySchema): Promise<{ id: number; code: string; name: string }> {
  const database = db ?? getDb();

  // Check if code already exists
  const existing = await database
    .selectFrom('companies')
    .where('code', '=', params.code)
    .select(['id'])
    .executeTakeFirst();

  if (existing) {
    throw new CompanyCodeExistsError(`Company with code ${params.code} already exists`);
  }

  const result = await database
    .insertInto('companies')
    .values({
      code: params.code,
      name: params.name,
      legal_name: params.legal_name ?? null,
      tax_id: params.tax_id ?? null,
      email: params.email ?? null,
      phone: params.phone ?? null,
      timezone: params.timezone ?? 'UTC',
      currency_code: params.currency_code ?? 'IDR',
      address_line1: params.address_line1 ?? null,
      address_line2: params.address_line2 ?? null,
      city: params.city ?? null,
      postal_code: params.postal_code ?? null
    })
    .executeTakeFirst();

  return {
    id: Number(result.insertId),
    code: params.code,
    name: params.name
  };
}

/**
 * Create a new company with full bootstrap (for production use).
 * For testing, use createCompanyBasic() instead.
 */
export async function createCompany(params: {
  code: string;
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  timezone?: string | null;
  currency_code?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  actor: CompanyActor;
}): Promise<CompanyResponse> {
  const db = getDb();
  const auditService = new AuditService(db);

  try {
    await db.transaction().execute(async (trx) => {
      // Use createCompanyBasic to insert the company row
      const created = await createCompanyBasic({
        code: params.code,
        name: params.name,
        legal_name: params.legal_name,
        tax_id: params.tax_id,
        email: params.email,
        phone: params.phone,
        timezone: params.timezone,
        currency_code: params.currency_code,
        address_line1: params.address_line1,
        address_line2: params.address_line2,
        city: params.city,
        postal_code: params.postal_code
      });

      const companyId = created.id;

      await bootstrapCompanyDefaults(trx, {
        companyId,
        actor: params.actor
      });
    });

    const companyId = await db
      .selectFrom('companies')
      .where('code', '=', params.code)
      .select(['id'])
      .executeTakeFirst()
      .then(row => row ? Number(row.id) : 0);

    if (companyId === 0) {
      throw new CompanyNotFoundError(`Company not found after creation`);
    }

    const auditContext = buildAuditContext(companyId, params.actor);

    const rows = await db
      .selectFrom('companies')
      .where('id', '=', companyId)
      .select([
        'id', 'code', 'name', 'legal_name', 'tax_id', 'email', 'phone',
        'timezone', 'currency_code', 'address_line1', 'address_line2',
        'city', 'postal_code', 'created_at', 'updated_at', 'deleted_at'
      ])
      .executeTakeFirst();

    if (!rows) {
      throw new CompanyNotFoundError(`Company with id ${companyId} not found`);
    }

    const createdCompany = rows;
    await auditService.logCreate(auditContext, "company", companyId, {
      code: createdCompany.code,
      name: createdCompany.name
    });

    return normalizeCompanyRow(createdCompany);
  } catch (error) {
    throw error;
  }
}

/**
 * List companies (optionally scoped to a company id)
 */
export async function listCompanies(params: {
  companyId?: number;
  includeDeleted?: boolean;
}): Promise<CompanyResponse[]> {
  const db = getDb();
  
  let query = db
    .selectFrom('companies')
    .select([
      'id', 'code', 'name', 'legal_name', 'tax_id', 'email', 'phone',
      'timezone', 'currency_code', 'address_line1', 'address_line2',
      'city', 'postal_code', 'created_at', 'updated_at', 'deleted_at'
    ])
    .orderBy('name', 'asc');

  if (params.companyId) {
    query = query.where('id', '=', params.companyId);
  }
  
  if (!params.includeDeleted) {
    query = query.where('deleted_at', 'is', null);
  }

  const rows = await query.execute();

  return rows.map((row) => normalizeCompanyRow(row));
}

/**
 * Get a single company by ID
 */
export async function getCompany(
  companyId: number,
  options?: { includeDeleted?: boolean }
): Promise<CompanyResponse> {
  const db = getDb();
  const includeDeleted = options?.includeDeleted ?? false;
  
  let query = db
    .selectFrom('companies')
    .where('id', '=', companyId)
    .select([
      'id', 'code', 'name', 'legal_name', 'tax_id', 'email', 'phone',
      'timezone', 'currency_code', 'address_line1', 'address_line2',
      'city', 'postal_code', 'created_at', 'updated_at', 'deleted_at'
    ]);

  if (!includeDeleted) {
    query = query.where('deleted_at', 'is', null);
  }

  const row = await query.executeTakeFirst();

  if (!row) {
    throw new CompanyNotFoundError(`Company with id ${companyId} not found`);
  }

  return normalizeCompanyRow(row);
}

/**
 * Update a company
 */
export async function updateCompany(params: {
  companyId: number;
  name?: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  timezone?: string | null;
  currency_code?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  actor: CompanyActor;
}): Promise<CompanyResponse> {
  const db = getDb();
  const auditService = new AuditService(db);

  return await db.transaction().execute(async (trx) => {
    const currentCompany = await ensureCompanyExists(trx, params.companyId, {
      includeDeleted: true
    });

    const updates: Record<string, unknown> = {};

    if (params.name !== undefined && params.name !== currentCompany.name) {
      updates.name = params.name;
    }
    if (params.legal_name !== undefined && params.legal_name !== currentCompany.legal_name) {
      updates.legal_name = params.legal_name;
    }
    if (params.tax_id !== undefined && params.tax_id !== currentCompany.tax_id) {
      updates.tax_id = params.tax_id;
    }
    if (params.email !== undefined && params.email !== currentCompany.email) {
      updates.email = params.email;
    }
    if (params.phone !== undefined && params.phone !== currentCompany.phone) {
      updates.phone = params.phone;
    }
    if (params.timezone !== undefined && params.timezone !== currentCompany.timezone) {
      updates.timezone = params.timezone;
    }
    if (params.currency_code !== undefined && params.currency_code !== currentCompany.currency_code) {
      updates.currency_code = params.currency_code;
    }
    if (params.address_line1 !== undefined && params.address_line1 !== currentCompany.address_line1) {
      updates.address_line1 = params.address_line1;
    }
    if (params.address_line2 !== undefined && params.address_line2 !== currentCompany.address_line2) {
      updates.address_line2 = params.address_line2;
    }
    if (params.city !== undefined && params.city !== currentCompany.city) {
      updates.city = params.city;
    }
    if (params.postal_code !== undefined && params.postal_code !== currentCompany.postal_code) {
      updates.postal_code = params.postal_code;
    }

    if (Object.keys(updates).length > 0) {
      await trx
        .updateTable('companies')
        .set(updates)
        .where('id', '=', params.companyId)
        .execute();

      const auditContext = buildAuditContext(params.companyId, params.actor);
      await auditService.logUpdate(
        auditContext,
        "company",
        params.companyId,
        {
          name: currentCompany.name,
          legal_name: currentCompany.legal_name,
          tax_id: currentCompany.tax_id,
          email: currentCompany.email,
          phone: currentCompany.phone,
          timezone: currentCompany.timezone,
          currency_code: currentCompany.currency_code,
          address_line1: currentCompany.address_line1,
          address_line2: currentCompany.address_line2,
          city: currentCompany.city,
          postal_code: currentCompany.postal_code
        },
        {
          name: params.name ?? currentCompany.name,
          legal_name: params.legal_name ?? currentCompany.legal_name,
          tax_id: params.tax_id ?? currentCompany.tax_id,
          email: params.email ?? currentCompany.email,
          phone: params.phone ?? currentCompany.phone,
          timezone: params.timezone ?? currentCompany.timezone,
          currency_code: params.currency_code ?? currentCompany.currency_code,
          address_line1: params.address_line1 ?? currentCompany.address_line1,
          address_line2: params.address_line2 ?? currentCompany.address_line2,
          city: params.city ?? currentCompany.city,
          postal_code: params.postal_code ?? currentCompany.postal_code
        }
      );
    }

    const rows = await trx
      .selectFrom('companies')
      .where('id', '=', params.companyId)
      .select([
        'id', 'code', 'name', 'legal_name', 'tax_id', 'email', 'phone',
        'timezone', 'currency_code', 'address_line1', 'address_line2',
        'city', 'postal_code', 'created_at', 'updated_at', 'deleted_at'
      ])
      .executeTakeFirst();

    if (!rows) {
      throw new CompanyNotFoundError(`Company with id ${params.companyId} not found`);
    }

    return normalizeCompanyRow(rows);
  });
}

/**
 * Delete a company
 */
export async function deleteCompany(params: {
  companyId: number;
  actor: CompanyActor;
}): Promise<void> {
  await deactivateCompany(params);
}

export async function deactivateCompany(params: {
  companyId: number;
  actor: CompanyActor;
}): Promise<CompanyResponse> {
  const db = getDb();
  const auditService = new AuditService(db);

  return await db.transaction().execute(async (trx) => {
    const company = await ensureCompanyExists(trx, params.companyId, {
      includeDeleted: true
    });

    if (company.deleted_at) {
      throw new CompanyDeactivatedError("Company is already deactivated");
    }

    await trx
      .updateTable('companies')
      .set({
        deleted_at: new Date(),
        updated_at: new Date()
      })
      .where('id', '=', params.companyId)
      .where('deleted_at', 'is', null)
      .execute();

    const auditContext = buildAuditContext(params.companyId, params.actor);
    await auditService.logDeactivate(auditContext, "company", params.companyId, {
      code: company.code,
      name: company.name,
      forced: true
    });

    const rows = await trx
      .selectFrom('companies')
      .where('id', '=', params.companyId)
      .select([
        'id', 'code', 'name', 'legal_name', 'tax_id', 'email', 'phone',
        'timezone', 'currency_code', 'address_line1', 'address_line2', 
        'city', 'postal_code', 'created_at', 'updated_at', 'deleted_at'
      ])
      .executeTakeFirst();

    if (!rows) {
      throw new CompanyNotFoundError(`Company with id ${params.companyId} not found`);
    }

    return normalizeCompanyRow(rows);
  });
}

export async function reactivateCompany(params: {
  companyId: number;
  actor: CompanyActor;
}): Promise<CompanyResponse> {
  const db = getDb();
  const auditService = new AuditService(db);

  return await db.transaction().execute(async (trx) => {
    const company = await ensureCompanyExists(trx, params.companyId, {
      includeDeleted: true
    });

    if (!company.deleted_at) {
      throw new CompanyAlreadyActiveError("Company is already active");
    }

    await trx
      .updateTable('companies')
      .set({
        deleted_at: null,
        updated_at: new Date()
      })
      .where('id', '=', params.companyId)
      .execute();

    const auditContext = buildAuditContext(params.companyId, params.actor);
    await auditService.logReactivate(auditContext, "company", params.companyId, {
      code: company.code,
      name: company.name
    });

    const rows = await trx
      .selectFrom('companies')
      .where('id', '=', params.companyId)
      .select([
        'id', 'code', 'name', 'legal_name', 'tax_id', 'email', 'phone',
        'timezone', 'currency_code', 'address_line1', 'address_line2', 
        'city', 'postal_code', 'created_at', 'updated_at', 'deleted_at'
      ])
      .executeTakeFirst();

    if (!rows) {
      throw new CompanyNotFoundError(`Company with id ${params.companyId} not found`);
    }

    return normalizeCompanyRow(rows);
  });
}
