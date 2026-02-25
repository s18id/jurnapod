import type {
  AccountTypeCreateRequest,
  AccountTypeListQuery,
  AccountTypeResponse,
  AccountTypeUpdateRequest
} from "@jurnapod/shared";
import type { AuditServiceInterface } from "./accounts-service";

/**
 * Database client interface for dependency injection
 * Should support parameterized queries and transactions
 */
export interface AccountTypesDbClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }>;
  begin?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
}

/**
 * Custom error classes for domain-specific errors
 */
export class AccountTypeNameExistsError extends Error {
  constructor(name: string, companyId: number) {
    super(`Account type '${name}' already exists in company ${companyId}`);
    this.name = "AccountTypeNameExistsError";
  }
}

export class AccountTypeNotFoundError extends Error {
  constructor(accountTypeId: number, companyId: number) {
    super(`Account type ${accountTypeId} not found in company ${companyId}`);
    this.name = "AccountTypeNotFoundError";
  }
}

export class AccountTypeInUseError extends Error {
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
   * List account types with optional filtering
   */
  async listAccountTypes(filters: AccountTypeListQuery): Promise<AccountTypeResponse[]> {
    const { company_id, category, is_active, search } = filters;

    let sql = `
      SELECT 
        id, company_id, name, category, normal_balance, report_group,
        is_active, created_at, updated_at
      FROM account_types
      WHERE company_id = ?
    `;
    const params: any[] = [company_id];

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (is_active !== undefined) {
      sql += ` AND is_active = ?`;
      params.push(is_active ? 1 : 0);
    }

    if (search) {
      sql += ` AND name LIKE ?`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern);
    }

    sql += ` ORDER BY category ASC, name ASC`;

    const rows = await this.db.query<AccountTypeResponse>(sql, params);
    return this.mapRowsToAccountTypeResponses(rows);
  }

  /**
   * Get single account type by ID
   */
  async getAccountTypeById(accountTypeId: number, companyId: number): Promise<AccountTypeResponse> {
    const sql = `
      SELECT 
        id, company_id, name, category, normal_balance, report_group,
        is_active, created_at, updated_at
      FROM account_types
      WHERE id = ? AND company_id = ?
      LIMIT 1
    `;

    const rows = await this.db.query<AccountTypeResponse>(sql, [accountTypeId, companyId]);

    if (rows.length === 0) {
      throw new AccountTypeNotFoundError(accountTypeId, companyId);
    }

    return this.mapRowToAccountTypeResponse(rows[0]);
  }

  /**
   * Create a new account type with validation
   */
  async createAccountType(data: AccountTypeCreateRequest, userId?: number): Promise<AccountTypeResponse> {
    // Validate name uniqueness
    await this.validateAccountTypeName(data.name, data.company_id);

    // Use transaction if supported
    const useTransaction = this.db.begin && this.db.commit && this.db.rollback;
    
    try {
      if (useTransaction) {
        await this.db.begin!();
      }

      const sql = `
        INSERT INTO account_types (
          company_id, name, category, normal_balance, report_group,
          is_active, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      const params = [
        data.company_id,
        data.name,
        data.category ?? null,
        data.normal_balance ?? null,
        data.report_group ?? null,
        data.is_active ? 1 : 0
      ];

      const result = await this.db.execute(sql, params);
      const accountTypeId = result.insertId!;

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

      if (useTransaction) {
        await this.db.commit!();
      }

      // Return the created account type
      return this.getAccountTypeById(accountTypeId, data.company_id);
    } catch (error) {
      if (useTransaction) {
        await this.db.rollback!();
      }
      throw error;
    }
  }

  /**
   * Update an existing account type
   */
  async updateAccountType(
    accountTypeId: number,
    data: AccountTypeUpdateRequest,
    companyId: number,
    userId?: number
  ): Promise<AccountTypeResponse> {
    // Verify account type exists and get before state
    const before = await this.getAccountTypeById(accountTypeId, companyId);

    const updateFields: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      await this.validateAccountTypeName(data.name, companyId, accountTypeId);
      updateFields.push("name = ?");
      params.push(data.name);
    }

    if (data.category !== undefined) {
      updateFields.push("category = ?");
      params.push(data.category);
    }

    if (data.normal_balance !== undefined) {
      updateFields.push("normal_balance = ?");
      params.push(data.normal_balance);
    }

    if (data.report_group !== undefined) {
      updateFields.push("report_group = ?");
      params.push(data.report_group);
    }

    if (data.is_active !== undefined) {
      updateFields.push("is_active = ?");
      params.push(data.is_active ? 1 : 0);
    }

    if (updateFields.length === 0) {
      // No fields to update, return current account type
      return this.getAccountTypeById(accountTypeId, companyId);
    }

    updateFields.push("updated_at = NOW()");

    // Use transaction if supported
    const useTransaction = this.db.begin && this.db.commit && this.db.rollback;
    
    try {
      if (useTransaction) {
        await this.db.begin!();
      }

      const sql = `
        UPDATE account_types
        SET ${updateFields.join(", ")}
        WHERE id = ? AND company_id = ?
      `;

      params.push(accountTypeId, companyId);
      await this.db.execute(sql, params);

      // Fetch updated account type
      const after = await this.getAccountTypeById(accountTypeId, companyId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logUpdate(
          { company_id: companyId, user_id: userId },
          "account_type",
          accountTypeId,
          before,
          after
        );
      }

      if (useTransaction) {
        await this.db.commit!();
      }

      return after;
    } catch (error) {
      if (useTransaction) {
        await this.db.rollback!();
      }
      throw error;
    }
  }

  /**
   * Deactivate account type (soft delete)
   */
  async deactivateAccountType(accountTypeId: number, companyId: number, userId?: number): Promise<AccountTypeResponse> {
    // Verify account type exists
    await this.getAccountTypeById(accountTypeId, companyId);

    // Check if account type is in use
    const inUse = await this.isAccountTypeInUse(accountTypeId, companyId);
    if (inUse) {
      throw new AccountTypeInUseError(accountTypeId);
    }

    // Use transaction if supported
    const useTransaction = this.db.begin && this.db.commit && this.db.rollback;
    
    try {
      if (useTransaction) {
        await this.db.begin!();
      }

      const sql = `
        UPDATE account_types
        SET is_active = 0, updated_at = NOW()
        WHERE id = ? AND company_id = ?
      `;

      await this.db.execute(sql, [accountTypeId, companyId]);

      const accountType = await this.getAccountTypeById(accountTypeId, companyId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logDeactivate(
          { company_id: companyId, user_id: userId },
          "account_type",
          accountTypeId,
          { name: accountType.name }
        );
      }

      if (useTransaction) {
        await this.db.commit!();
      }

      return accountType;
    } catch (error) {
      if (useTransaction) {
        await this.db.rollback!();
      }
      throw error;
    }
  }

  /**
   * Check if account type is referenced by any accounts
   */
  async isAccountTypeInUse(accountTypeId: number, companyId: number): Promise<boolean> {
    const sql = `
      SELECT COUNT(*) as count
      FROM accounts
      WHERE account_type_id = ? AND company_id = ?
      LIMIT 1
    `;

    const rows = await this.db.query<{ count: number }>(sql, [accountTypeId, companyId]);
    return rows.length > 0 && rows[0].count > 0;
  }

  /**
   * Validate account type name uniqueness
   */
  async validateAccountTypeName(
    name: string,
    companyId: number,
    excludeAccountTypeId?: number
  ): Promise<void> {
    let sql = `
      SELECT id
      FROM account_types
      WHERE company_id = ? AND name = ?
    `;
    const params: any[] = [companyId, name];

    if (excludeAccountTypeId !== undefined) {
      sql += ` AND id != ?`;
      params.push(excludeAccountTypeId);
    }

    sql += ` LIMIT 1`;

    const rows = await this.db.query<{ id: number }>(sql, params);

    if (rows.length > 0) {
      throw new AccountTypeNameExistsError(name, companyId);
    }
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
      report_group: row.report_group,
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
