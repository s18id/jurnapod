// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection, QueryResult } from "mysql2/promise";
import { AuditService } from "@jurnapod/modules-platform";
import { getDbPool } from "./db";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";
import { newKyselyConnection } from "@jurnapod/db";

export class CompanyNotFoundError extends Error {}
export class CompanyCodeExistsError extends Error {}
export class CompanyDeactivatedError extends Error {}
export class CompanyAlreadyActiveError extends Error {}

type IdRow = RowDataPacket & {
  id: number;
};

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

type CompanyRow = RowDataPacket & {
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

class ConnectionAuditDbClient {
  constructor(private readonly connection: PoolConnection) {}

  get kysely() {
    return newKyselyConnection(this.connection);
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params || []);
    return rows as T[];
  }

  async execute(
    sql: string,
    params?: any[]
  ): Promise<{ affectedRows: number; insertId?: number }> {
    const [result] = await this.connection.execute<ResultSetHeader>(sql, params || []);
    return {
      affectedRows: result.affectedRows,
      insertId: result.insertId
    };
  }

  async begin(): Promise<void> {
    // No-op: transaction is managed by caller.
  }

  async commit(): Promise<void> {
    // No-op: transaction is managed by caller.
  }

  async rollback(): Promise<void> {
    // No-op: transaction is managed by caller.
  }
}

function createAuditServiceForConnection(connection: PoolConnection): AuditService {
  const dbClient = new ConnectionAuditDbClient(connection);
  return new AuditService(dbClient);
}

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
  connection: PoolConnection,
  companyId: number
): Promise<number> {
  // Get company timezone to inherit
  const [companyRows] = await connection.execute<CompanyRow[]>(
    `SELECT timezone FROM companies WHERE id = ?`,
    [companyId]
  );
  
  const companyTimezone = companyRows[0]?.timezone ?? 'UTC';
  
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO outlets (company_id, code, name, timezone)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       timezone = COALESCE(timezone, VALUES(timezone))`,
    [companyId, DEFAULT_OUTLET_CODE, DEFAULT_OUTLET_NAME, companyTimezone]
  );

  return Number(result.insertId);
}

async function upsertRole(
  connection: PoolConnection,
  roleCode: string,
  roleName: string,
  isGlobal: boolean,
  roleLevel: number
): Promise<number> {
  const [existing] = await connection.execute<IdRow[]>(
    `SELECT id FROM roles WHERE code = ?`,
    [roleCode]
  );

  if (existing.length > 0) {
    const id = existing.map(a => a.id)[0]
    return id
  }

  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO roles (code, name, is_global, role_level)
     VALUES (?, ?, ?, ?)`,
    [roleCode, roleName, isGlobal ? 1 : 0, roleLevel]
  );

  return Number(result.insertId);
}

async function ensureRoles(connection: PoolConnection): Promise<Record<string, number>> {
  const roleIds: Record<string, number> = {};
  for (const role of ROLE_DEFINITIONS) {
    roleIds[role.code] = await upsertRole(
      connection,
      role.code,
      role.name,
      role.isGlobal,
      role.roleLevel
    );
  }
  return roleIds;
}

async function upsertModule(
  connection: PoolConnection,
  moduleCode: string,
  moduleName: string,
  moduleDescription: string | null
): Promise<number> {
  await connection.execute(
    `INSERT INTO modules (code, name, description)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       description = VALUES(description),
       updated_at = CURRENT_TIMESTAMP`,
    [moduleCode, moduleName, moduleDescription]
  );

  // Use SELECT to get the ID since INSERT ... ON DUPLICATE KEY UPDATE
  // returns insertId=0 when an update occurs (not the existing row's ID)
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id FROM modules WHERE code = ?`,
    [moduleCode]
  );

  return rows[0].id;
}

async function ensureModules(connection: PoolConnection): Promise<Record<string, number>> {
  const moduleIds: Record<string, number> = {};
  for (const moduleEntry of MODULE_DEFINITIONS) {
    moduleIds[moduleEntry.code] = await upsertModule(
      connection,
      moduleEntry.code,
      moduleEntry.name,
      moduleEntry.description
    );
  }
  return moduleIds;
}

async function ensureCompanyModules(
  connection: PoolConnection,
  companyId: number,
  moduleIds: Record<string, number>,
  actorUserId: number
): Promise<void> {
  for (const moduleEntry of COMPANY_MODULE_DEFAULTS) {
    const moduleId = moduleIds[moduleEntry.code];
    if (!moduleId) {
      throw new Error(`module id not found for ${moduleEntry.code}`);
    }

    await connection.execute(
      `INSERT IGNORE INTO company_modules (
         company_id,
         module_id,
         enabled,
         config_json,
         created_by_user_id,
         updated_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        moduleId,
        moduleEntry.enabled ? 1 : 0,
        JSON.stringify(moduleEntry.config ?? {}),
        actorUserId,
        actorUserId
      ]
    );
  }
}

async function ensureModuleRoles(
  connection: PoolConnection,
  companyId: number,
  roleIds: Record<string, number>
): Promise<void> {
  for (const roleEntry of MODULE_ROLE_DEFAULTS) {
    const roleId = roleIds[roleEntry.roleCode];
    if (!roleId) {
      throw new Error(`role id not found for ${roleEntry.roleCode}`);
    }

    await connection.execute(
      `INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
       VALUES (?, ?, ?, ?)`,
      [companyId, roleId, roleEntry.module, roleEntry.permissionMask]
    );
  }
}

async function ensureCompanySettings(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  actorUserId: number
): Promise<void> {
  for (const setting of SETTINGS_DEFINITIONS) {
    const rawValue = process.env[setting.envKey];
    const parsedValue = setting.parse(rawValue);
    const valueJson = JSON.stringify(parsedValue);

    await connection.execute(
      `INSERT IGNORE INTO company_settings (
         company_id,
         outlet_id,
         \`key\`,
         value_type,
         value_json,
         created_by_user_id,
         updated_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [companyId, outletId, setting.key, setting.valueType, valueJson, actorUserId, actorUserId]
    );
  }
}

async function ensureDefaultFiscalYear(
  connection: PoolConnection,
  companyId: number,
  actorUserId: number
): Promise<void> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id
     FROM fiscal_years
     WHERE company_id = ?
     LIMIT 1`,
    [companyId]
  );

  if (rows.length > 0) {
    return;
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const code = `FY${year}`;
  const name = `Fiscal Year ${year}`;

  await connection.execute(
    `INSERT INTO fiscal_years (
       company_id,
       code,
       name,
       start_date,
       end_date,
       status,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    [companyId, code, name, startDate, endDate, actorUserId, actorUserId]
  );
}

const DEFAULT_NUMBERING_TEMPLATES = [
  { doc_type: "SALES_INVOICE", pattern: "INV/{{yy}}{{mm}}/{{seq4}}", reset_period: "MONTHLY" },
  { doc_type: "SALES_PAYMENT", pattern: "PAY/{{yy}}{{mm}}/{{seq4}}", reset_period: "MONTHLY" },
  { doc_type: "SALES_ORDER", pattern: "SO/{{yy}}{{mm}}/{{seq4}}", reset_period: "MONTHLY" },
  { doc_type: "CREDIT_NOTE", pattern: "CN/{{yy}}{{mm}}/{{seq4}}", reset_period: "MONTHLY" }
];

async function ensureNumberingTemplates(
  connection: PoolConnection,
  companyId: number
): Promise<void> {
  for (const template of DEFAULT_NUMBERING_TEMPLATES) {
    const [existing] = await connection.execute(
      `SELECT id FROM numbering_templates WHERE company_id = ? AND outlet_id IS NULL AND doc_type = ?`,
      [companyId, template.doc_type]
    );
    if ((existing as any[]).length === 0) {
      await connection.execute(
        `INSERT INTO numbering_templates (company_id, outlet_id, scope_key, doc_type, pattern, reset_period, current_value, is_active)
         VALUES (?, NULL, 0, ?, ?, ?, 0, 1)`,
        [companyId, template.doc_type, template.pattern, template.reset_period]
      );
    }
  }
}

async function bootstrapCompanyDefaults(
  connection: PoolConnection,
  params: { companyId: number; actor: CompanyActor }
): Promise<void> {
  const outletId = await ensureDefaultOutlet(connection, params.companyId);
  const roleIds = await ensureRoles(connection);
  const moduleIds = await ensureModules(connection);

  await ensureCompanyModules(connection, params.companyId, moduleIds, params.actor.userId);
  await ensureModuleRoles(connection, params.companyId, roleIds);
  await ensureCompanySettings(connection, params.companyId, outletId, params.actor.userId);
  await ensureDefaultFiscalYear(connection, params.companyId, params.actor.userId);
  await ensureNumberingTemplates(connection, params.companyId);
}

async function ensureCompanyExists(
  connection: PoolConnection,
  companyId: number,
  options?: { includeDeleted?: boolean }
): Promise<CompanyRow> {
  const includeDeleted = options?.includeDeleted ?? false;
  const [rows] = await connection.execute<CompanyRow[]>(
    `SELECT id, code, name, legal_name, tax_id, email, phone, timezone, currency_code, address_line1, address_line2, city, postal_code, created_at, updated_at, deleted_at
     FROM companies
     WHERE id = ?
     ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
    [companyId]
  );

  if (rows.length === 0) {
    throw new CompanyNotFoundError(`Company with id ${companyId} not found`);
  }

  return rows[0];
}

/**
 * Create a new company
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Check if code already exists
    const [existing] = await connection.execute<CompanyRow[]>(
      `SELECT id FROM companies WHERE code = ?`,
      [params.code]
    );

    if (existing.length > 0) {
      throw new CompanyCodeExistsError(`Company with code ${params.code} already exists`);
    }

    // Insert company with profile fields
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO companies (code, name, legal_name, tax_id, email, phone, timezone, currency_code, address_line1, address_line2, city, postal_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.code,
        params.name,
        params.legal_name ?? null,
        params.tax_id ?? null,
        params.email ?? null,
        params.phone ?? null,
        params.timezone ?? 'UTC',
        params.currency_code ?? 'IDR',
        params.address_line1 ?? null,
        params.address_line2 ?? null,
        params.city ?? null,
        params.postal_code ?? null
      ]
    );

    const companyId = Number(result.insertId);

    await bootstrapCompanyDefaults(connection, {
      companyId,
      actor: params.actor
    });
    const auditContext = buildAuditContext(companyId, params.actor);

    const [rows] = await connection.execute<CompanyRow[]>(
      `SELECT id, code, name, legal_name, tax_id, email, phone, timezone, currency_code, address_line1, address_line2, city, postal_code, created_at, updated_at, deleted_at
       FROM companies
       WHERE id = ?`,
      [companyId]
    );

    const createdCompany = rows[0];
    if (!createdCompany) {
      throw new CompanyNotFoundError(`Company with id ${companyId} not found`);
    }

    await auditService.logCreate(auditContext, "company", companyId, {
      code: createdCompany.code,
      name: createdCompany.name
    });

    await connection.commit();

    return normalizeCompanyRow(createdCompany);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * List companies (optionally scoped to a company id)
 */
export async function listCompanies(params: {
  companyId?: number;
  includeDeleted?: boolean;
}): Promise<CompanyResponse[]> {
  const pool = getDbPool();
  const conditions: string[] = [];
  const values: Array<number> = [];
  if (params.companyId) {
    conditions.push("id = ?");
    values.push(params.companyId);
  }
  if (!params.includeDeleted) {
    conditions.push("deleted_at IS NULL");
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.execute<CompanyRow[]>(
    `SELECT id, code, name, legal_name, tax_id, email, phone, timezone, currency_code, address_line1, address_line2, city, postal_code, created_at, updated_at, deleted_at
     FROM companies
     ${whereClause}
     ORDER BY name ASC`,
    values
  );

  return rows.map((row) => normalizeCompanyRow(row));
}

/**
 * Get a single company by ID
 */
export async function getCompany(
  companyId: number,
  options?: { includeDeleted?: boolean }
): Promise<CompanyResponse> {
  const pool = getDbPool();
  const includeDeleted = options?.includeDeleted ?? false;
  const [rows] = await pool.execute<CompanyRow[]>(
    `SELECT id, code, name, legal_name, tax_id, email, phone, timezone, currency_code, address_line1, address_line2, city, postal_code, created_at, updated_at, deleted_at
     FROM companies
     WHERE id = ?
     ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
    [companyId]
  );

  if (rows.length === 0) {
    throw new CompanyNotFoundError(`Company with id ${companyId} not found`);
  }

  return normalizeCompanyRow(rows[0]);
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    const currentCompany = await ensureCompanyExists(connection, params.companyId, {
      includeDeleted: true
    });

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (params.name !== undefined && params.name !== currentCompany.name) {
      updates.push("name = ?");
      values.push(params.name);
    }
    if (params.legal_name !== undefined && params.legal_name !== currentCompany.legal_name) {
      updates.push("legal_name = ?");
      values.push(params.legal_name);
    }
    if (params.tax_id !== undefined && params.tax_id !== currentCompany.tax_id) {
      updates.push("tax_id = ?");
      values.push(params.tax_id);
    }
    if (params.email !== undefined && params.email !== currentCompany.email) {
      updates.push("email = ?");
      values.push(params.email);
    }
    if (params.phone !== undefined && params.phone !== currentCompany.phone) {
      updates.push("phone = ?");
      values.push(params.phone);
    }
    if (params.timezone !== undefined && params.timezone !== currentCompany.timezone) {
      updates.push("timezone = ?");
      values.push(params.timezone);
    }
    if (params.currency_code !== undefined && params.currency_code !== currentCompany.currency_code) {
      updates.push("currency_code = ?");
      values.push(params.currency_code);
    }
    if (params.address_line1 !== undefined && params.address_line1 !== currentCompany.address_line1) {
      updates.push("address_line1 = ?");
      values.push(params.address_line1);
    }
    if (params.address_line2 !== undefined && params.address_line2 !== currentCompany.address_line2) {
      updates.push("address_line2 = ?");
      values.push(params.address_line2);
    }
    if (params.city !== undefined && params.city !== currentCompany.city) {
      updates.push("city = ?");
      values.push(params.city);
    }
    if (params.postal_code !== undefined && params.postal_code !== currentCompany.postal_code) {
      updates.push("postal_code = ?");
      values.push(params.postal_code);
    }

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      values.push(params.companyId);

      await connection.execute(
        `UPDATE companies SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

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

    await connection.commit();

    const [rows] = await connection.execute<CompanyRow[]>(
      `SELECT id, code, name, legal_name, tax_id, email, phone, timezone, currency_code, address_line1, address_line2, city, postal_code, created_at, updated_at, deleted_at
       FROM companies WHERE id = ?`,
      [params.companyId]
    );

    if (rows.length === 0) {
      throw new CompanyNotFoundError(`Company with id ${params.companyId} not found`);
    }

    return normalizeCompanyRow(rows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();
    const company = await ensureCompanyExists(connection, params.companyId, {
      includeDeleted: true
    });

    if (company.deleted_at) {
      throw new CompanyDeactivatedError("Company is already deactivated");
    }

    await connection.execute(
      `UPDATE companies
       SET deleted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND deleted_at IS NULL`,
      [params.companyId]
    );

    const auditContext = buildAuditContext(params.companyId, params.actor);
    await auditService.logDeactivate(auditContext, "company", params.companyId, {
      code: company.code,
      name: company.name,
      forced: true
    });

    await connection.commit();

    const [rows] = await connection.execute<CompanyRow[]>(
      `SELECT id, code, name, legal_name, tax_id, email, phone, address_line1, address_line2, city, postal_code, created_at, updated_at, deleted_at
       FROM companies WHERE id = ?`,
      [params.companyId]
    );

    return normalizeCompanyRow(rows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function reactivateCompany(params: {
  companyId: number;
  actor: CompanyActor;
}): Promise<CompanyResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();
    const company = await ensureCompanyExists(connection, params.companyId, {
      includeDeleted: true
    });

    if (!company.deleted_at) {
      throw new CompanyAlreadyActiveError("Company is already active");
    }

    await connection.execute(
      `UPDATE companies
       SET deleted_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [params.companyId]
    );

    const auditContext = buildAuditContext(params.companyId, params.actor);
    await auditService.logReactivate(auditContext, "company", params.companyId, {
      code: company.code,
      name: company.name
    });

    await connection.commit();

    const [rows] = await connection.execute<CompanyRow[]>(
      `SELECT id, code, name, legal_name, tax_id, email, phone, address_line1, address_line2, city, postal_code, created_at, updated_at, deleted_at
       FROM companies WHERE id = ?`,
      [params.companyId]
    );

    return normalizeCompanyRow(rows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
