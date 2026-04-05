// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { InsertResult } from "kysely";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";

import {
  MODULE_DEFINITIONS,
  COMPANY_MODULE_DEFAULTS,
  ROLE_DEFINITIONS,
  MODULE_ROLE_DEFAULTS,
  SETTINGS_DEFINITIONS
} from "../constants/index.js";

import type {
  CompanyResponse,
  CompanyRow,
  CompanyActor,
  CreateCompanyInput,
  CreateCompanyInputWithActor,
  UpdateCompanyInput,
  ListCompaniesInput,
  GetCompanyInput,
  DeactivateCompanyInput,
  ReactivateCompanyInput
} from "../types/index.js";

import {
  CompanyNotFoundError,
  CompanyCodeExistsError,
  CompanyDeactivatedError,
  CompanyAlreadyActiveError
} from "../interfaces/index.js";

import { AuditService } from "../../audit-service.js";

const DEFAULT_OUTLET_CODE = "MAIN";
const DEFAULT_OUTLET_NAME = "Main Outlet";

/**
 * Build audit context for company operations.
 */
function buildAuditContext(companyId: number, actor: CompanyActor) {
  return {
    company_id: companyId,
    user_id: actor.userId,
    outlet_id: actor.outletId ?? null,
    ip_address: actor.ipAddress ?? null
  };
}

/**
 * Normalize a company database row to API response format.
 */
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

/**
 * Ensure a default outlet exists for the company.
 * Creates MAIN outlet if it doesn't exist.
 */
async function ensureDefaultOutlet(
  db: KyselySchema,
  companyId: number
): Promise<number> {
  const companyRow = await db
    .selectFrom('companies')
    .where('id', '=', companyId)
    .select(['timezone'])
    .executeTakeFirst();

  const companyTimezone = companyRow?.timezone ?? 'UTC';

  const result = await sql`
    INSERT INTO outlets (company_id, code, name, timezone)
    VALUES (${companyId}, ${DEFAULT_OUTLET_CODE}, ${DEFAULT_OUTLET_NAME}, ${companyTimezone})
    ON DUPLICATE KEY UPDATE
      id = LAST_INSERT_ID(id),
      timezone = COALESCE(timezone, VALUES(timezone))
  `.execute(db);

  let insertId = 0;
  if ('insertId' in result && result.insertId !== undefined) {
    insertId = Number(result.insertId);
  }
  
  if (insertId === 0) {
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

  return insertId > 0 ? insertId : companyId;
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
 * CompanyService - Handles company CRUD operations and provisioning.
 * This service requires a database connection to be passed in.
 */
export class CompanyService {
  constructor(private db: KyselySchema) {}

  /**
   * Create a company with minimal setup (no bootstrap defaults).
   * Use this for testing - it only inserts the company row.
   * For production use, use createCompany() which includes bootstrap.
   */
  async createCompanyBasic(params: CreateCompanyInput): Promise<{ id: number; code: string; name: string }> {
    const existing = await this.db
      .selectFrom('companies')
      .where('code', '=', params.code)
      .select(['id'])
      .executeTakeFirst();

    if (existing) {
      throw new CompanyCodeExistsError(`Company with code ${params.code} already exists`);
    }

    const result = await this.db
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
  async createCompany(params: CreateCompanyInputWithActor): Promise<CompanyResponse> {
    const auditService = new AuditService(this.db);

    try {
      await this.db.transaction().execute(async (trx) => {
        const created = await this.createCompanyBasic({
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

      const companyId = await this.db
        .selectFrom('companies')
        .where('code', '=', params.code)
        .select(['id'])
        .executeTakeFirst()
        .then(row => row ? Number(row.id) : 0);

      if (companyId === 0) {
        throw new CompanyNotFoundError(`Company not found after creation`);
      }

      const auditContext = buildAuditContext(companyId, params.actor);

      const rows = await this.db
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
  async listCompanies(params: ListCompaniesInput = {}): Promise<CompanyResponse[]> {
    let query = this.db
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
  async getCompany(params: GetCompanyInput): Promise<CompanyResponse> {
    const includeDeleted = params.includeDeleted ?? false;
    
    let query = this.db
      .selectFrom('companies')
      .where('id', '=', params.companyId)
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
      throw new CompanyNotFoundError(`Company with id ${params.companyId} not found`);
    }

    return normalizeCompanyRow(row);
  }

  /**
   * Update a company
   */
  async updateCompany(params: UpdateCompanyInput): Promise<CompanyResponse> {
    const auditService = new AuditService(this.db);

    return await this.db.transaction().execute(async (trx) => {
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
   * Delete a company (soft delete via deactivation)
   */
  async deleteCompany(params: { companyId: number; actor: CompanyActor }): Promise<void> {
    await this.deactivateCompany(params);
  }

  /**
   * Deactivate a company (soft delete)
   */
  async deactivateCompany(params: DeactivateCompanyInput): Promise<CompanyResponse> {
    const auditService = new AuditService(this.db);

    return await this.db.transaction().execute(async (trx) => {
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

  /**
   * Reactivate a deactivated company
   */
  async reactivateCompany(params: ReactivateCompanyInput): Promise<CompanyResponse> {
    const auditService = new AuditService(this.db);

    return await this.db.transaction().execute(async (trx) => {
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
}
