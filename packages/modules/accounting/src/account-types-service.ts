// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  AccountTypeCreateRequest,
  AccountTypeListQuery,
  AccountTypeResponse,
  AccountTypeUpdateRequest
} from "@jurnapod/shared";
import type { AuditServiceInterface } from "./accounts-service";
import type { KyselySchema } from "@jurnapod/db";

/**
 * Database client interface for dependency injection
 * Should support Kysely queries and transactions
 */
export interface AccountTypesDbClient extends KyselySchema {}

/**
 * Custom error classes for domain-specific errors
 */
export class AccountTypeNameExistsError extends Error {
  code = "ACCOUNT_TYPE_NAME_EXISTS";
  constructor(name: string, companyId: number) {
    super(`Account type '${name}' already exists in company ${companyId}`);
    this.name = "AccountTypeNameExistsError";
  }
}

export class AccountTypeNotFoundError extends Error {
  code = "ACCOUNT_TYPE_NOT_FOUND";
  constructor(accountTypeId: number, companyId: number) {
    super(`Account type ${accountTypeId} not found in company ${companyId}`);
    this.name = "AccountTypeNotFoundError";
  }
}

export class AccountTypeInUseError extends Error {
  code = "ACCOUNT_TYPE_IN_USE";
  constructor(accountTypeId: number) {
    super(`Account type ${accountTypeId} is in use by one or more accounts`);
    this.name = "AccountTypeInUseError";
  }
}

/**
 * AccountTypesService
 * Framework-agnostic business logic for Account Types management
 */
export class AccountTypesService {
  constructor(
    private readonly db: AccountTypesDbClient,
    private readonly auditService?: AuditServiceInterface
  ) {}

  /**
   * List account types with optional filtering (Migrated to Kysely)
   */
  async listAccountTypes(filters: AccountTypeListQuery): Promise<AccountTypeResponse[]> {
    const { company_id, category, is_active, search } = filters;

    let query = this.db
      .selectFrom('account_types')
      .where('company_id', '=', company_id);

    if (category) {
      query = query.where('category', '=', category);
    }

    if (is_active !== undefined) {
      query = query.where('is_active', '=', is_active ? 1 : 0);
    }

    if (search) {
      query = query.where('name', 'like', `%${search}%`);
    }

    const rows = await query
      .select([
        'id',
        'company_id',
        'name',
        'category',
        'normal_balance',
        'report_group',
        'is_active',
        'created_at',
        'updated_at'
      ])
      .orderBy('category', 'asc')
      .orderBy('name', 'asc')
      .execute();

    return this.mapRowsToAccountTypeResponses(rows as any[]);
  }

  /**
   * Get single account type by ID (Migrated to Kysely)
   */
  async getAccountTypeById(accountTypeId: number, companyId: number): Promise<AccountTypeResponse> {
    const row = await this.db
      .selectFrom('account_types')
      .where('id', '=', accountTypeId)
      .where('company_id', '=', companyId)
      .select([
        'id',
        'company_id',
        'name',
        'category',
        'normal_balance',
        'report_group',
        'is_active',
        'created_at',
        'updated_at'
      ])
      .executeTakeFirst();

    if (!row) {
      throw new AccountTypeNotFoundError(accountTypeId, companyId);
    }

    return this.mapRowToAccountTypeResponse(row as any);
  }

  /**
   * Create a new account type with validation (Migrated to Kysely)
   */
  async createAccountType(data: AccountTypeCreateRequest, userId?: number): Promise<AccountTypeResponse> {
    // Validate name uniqueness
    await this.validateAccountTypeName(data.name, data.company_id);

    const result = await this.db.transaction().execute(async (trx) => {
      const insertResult = await trx
        .insertInto('account_types')
        .values({
          company_id: data.company_id,
          name: data.name,
          category: data.category ?? null,
          normal_balance: data.normal_balance ?? null,
          report_group: data.report_group ?? null,
          is_active: data.is_active ? 1 : 0
        })
        .executeTakeFirst();

      const accountTypeId = Number(insertResult.insertId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logCreate(
          { company_id: data.company_id, user_id: userId },
          "account_type",
          accountTypeId,
          {
            name: data.name,
            category: data.category,
            normal_balance: data.normal_balance,
            report_group: data.report_group
          }
        );
      }

      return accountTypeId;
    });

    // Return the created account type
    return this.getAccountTypeById(result, data.company_id);
  }

  /**
   * Update an existing account type (Migrated to Kysely)
   */
  async updateAccountType(
    accountTypeId: number,
    data: AccountTypeUpdateRequest,
    companyId: number,
    userId?: number
  ): Promise<AccountTypeResponse> {
    // Verify account type exists and get before state
    const before = await this.getAccountTypeById(accountTypeId, companyId);

    const updates: Record<string, any> = {};

    if (data.name !== undefined) {
      await this.validateAccountTypeName(data.name, companyId, accountTypeId);
      updates.name = data.name;
    }

    if (data.category !== undefined) {
      updates.category = data.category;
    }

    if (data.normal_balance !== undefined) {
      updates.normal_balance = data.normal_balance;
    }

    if (data.report_group !== undefined) {
      updates.report_group = data.report_group;
    }

    if (data.is_active !== undefined) {
      updates.is_active = data.is_active ? 1 : 0;
    }

    if (Object.keys(updates).length === 0) {
      // No fields to update, return current account type
      return this.getAccountTypeById(accountTypeId, companyId);
    }

    const after = await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('account_types')
        .set(updates)
        .where('id', '=', accountTypeId)
        .where('company_id', '=', companyId)
        .execute();

      // Fetch updated account type
      const updated = await this.getAccountTypeById(accountTypeId, companyId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logUpdate(
          { company_id: companyId, user_id: userId },
          "account_type",
          accountTypeId,
          before,
          updated
        );
      }

      return updated;
    });

    return after;
  }

  /**
   * Deactivate account type (soft delete) (Migrated to Kysely)
   */
  async deactivateAccountType(accountTypeId: number, companyId: number, userId?: number): Promise<AccountTypeResponse> {
    // Verify account type exists
    await this.getAccountTypeById(accountTypeId, companyId);

    // Check if account type is in use
    const inUse = await this.isAccountTypeInUse(accountTypeId, companyId);
    if (inUse) {
      throw new AccountTypeInUseError(accountTypeId);
    }

    const accountType = await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('account_types')
        .set({ is_active: 0 })
        .where('id', '=', accountTypeId)
        .where('company_id', '=', companyId)
        .execute();

      const updated = await this.getAccountTypeById(accountTypeId, companyId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logDeactivate(
          { company_id: companyId, user_id: userId },
          "account_type",
          accountTypeId,
          { name: updated.name }
        );
      }

      return updated;
    });

    return accountType;
  }

  /**
   * Check if account type is referenced by any accounts (Migrated to Kysely)
   */
  async isAccountTypeInUse(accountTypeId: number, companyId: number): Promise<boolean> {
    const result = await this.db
      .selectFrom('accounts')
      .where('account_type_id', '=', accountTypeId)
      .where('company_id', '=', companyId)
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    return Number(result?.count ?? 0) > 0;
  }

  /**
   * Validate account type name uniqueness (Migrated to Kysely)
   */
  async validateAccountTypeName(
    name: string,
    companyId: number,
    excludeAccountTypeId?: number
  ): Promise<void> {
    let query = this.db
      .selectFrom('account_types')
      .where('company_id', '=', companyId)
      .where('name', '=', name);

    if (excludeAccountTypeId !== undefined) {
      query = query.where('id', '!=', excludeAccountTypeId);
    }

    const row = await query.select('id').executeTakeFirst();

    if (row) {
      throw new AccountTypeNameExistsError(name, companyId);
    }
  }

  /**
   * Normalize report_group value for compatibility
   * Legacy data may contain 'LR' (Laba Rugi), normalize to canonical 'PL'
   */
  private normalizeReportGroup(reportGroup: string | null): "NRC" | "PL" | null {
    if (reportGroup === "LR") {
      return "PL";
    }
    if (reportGroup === "NRC" || reportGroup === "PL") {
      return reportGroup;
    }
    return null;
  }

  /**
   * Map database row to AccountTypeResponse
   */
  private mapRowToAccountTypeResponse(row: any): AccountTypeResponse {
    return {
      id: row.id,
      company_id: row.company_id,
      name: row.name,
      category: row.category,
      normal_balance: row.normal_balance,
      report_group: this.normalizeReportGroup(row.report_group),
      is_active: Boolean(row.is_active),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
    };
  }

  /**
   * Map database rows to AccountTypeResponse array
   */
  private mapRowsToAccountTypeResponses(rows: any[]): AccountTypeResponse[] {
    return rows.map((row: any) => this.mapRowToAccountTypeResponse(row));
  }
}
