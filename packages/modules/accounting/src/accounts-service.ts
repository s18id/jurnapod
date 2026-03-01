// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  AccountCreateRequest,
  AccountListQuery,
  AccountResponse,
  AccountTreeNode,
  AccountUpdateRequest
} from "@jurnapod/shared";

/**
 * Database client interface for dependency injection
 * Should support parameterized queries and transactions
 */
export interface AccountsDbClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }>;
  begin?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
}

/**
 * Custom error classes for domain-specific errors
 */
export class AccountCodeExistsError extends Error {
  constructor(code: string, companyId: number) {
    super(`Account code '${code}' already exists in company ${companyId}`);
    this.name = "AccountCodeExistsError";
  }
}

export class CircularReferenceError extends Error {
  constructor(accountId: number, parentId: number) {
    super(`Circular reference detected: account ${accountId} cannot have parent ${parentId}`);
    this.name = "CircularReferenceError";
  }
}

export class AccountInUseError extends Error {
  constructor(accountId: number, reason: string) {
    super(`Account ${accountId} is in use: ${reason}`);
    this.name = "AccountInUseError";
  }
}

export class AccountNotFoundError extends Error {
  constructor(accountId: number, companyId: number) {
    super(`Account ${accountId} not found in company ${companyId}`);
    this.name = "AccountNotFoundError";
  }
}

export class ParentAccountCompanyMismatchError extends Error {
  constructor(parentId: number, companyId: number) {
    super(`Parent account ${parentId} does not belong to company ${companyId}`);
    this.name = "ParentAccountCompanyMismatchError";
  }
}

export class AccountTypeCompanyMismatchError extends Error {
  constructor(accountTypeId: number, companyId: number) {
    super(`Account type ${accountTypeId} does not belong to company ${companyId}`);
    this.name = "AccountTypeCompanyMismatchError";
  }
}

/**
 * Audit service interface for dependency injection
 */
export interface AuditServiceInterface {
  logCreate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload: Record<string, any>
  ): Promise<void>;
  logUpdate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    before: Record<string, any>,
    after: Record<string, any>
  ): Promise<void>;
  logDeactivate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload?: Record<string, any>
  ): Promise<void>;
  logReactivate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload?: Record<string, any>
  ): Promise<void>;
}

/**
 * AccountsService
 * Framework-agnostic business logic for Chart of Accounts management
 */
export class AccountsService {
  constructor(
    private readonly db: AccountsDbClient,
    private readonly auditService?: AuditServiceInterface
  ) {}

  /**
   * List accounts with optional filtering
   */
  async listAccounts(filters: AccountListQuery): Promise<AccountResponse[]> {
    const { company_id, is_active, is_payable, report_group, parent_account_id, search } = filters;

    let sql = `
      SELECT 
        id, company_id, code, name, type_name, normal_balance, report_group,
        parent_account_id, account_type_id, is_group, is_payable, is_active, created_at, updated_at
      FROM accounts
      WHERE company_id = ?
    `;
    const params: any[] = [company_id];

    if (is_active !== undefined) {
      sql += ` AND is_active = ?`;
      params.push(is_active ? 1 : 0);
    }

    if (is_payable !== undefined) {
      sql += ` AND is_payable = ?`;
      params.push(is_payable ? 1 : 0);
    }

    if (report_group) {
      sql += ` AND report_group = ?`;
      params.push(report_group);
    }

    if (parent_account_id !== undefined) {
      if (parent_account_id === null) {
        sql += ` AND parent_account_id IS NULL`;
      } else {
        sql += ` AND parent_account_id = ?`;
        params.push(parent_account_id);
      }
    }

    if (search) {
      sql += ` AND (code LIKE ? OR name LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    sql += ` ORDER BY code ASC`;

    const rows = await this.db.query<AccountResponse>(sql, params);
    return this.mapRowsToAccountResponses(rows);
  }

  /**
   * Get single account by ID
   */
  async getAccountById(accountId: number, companyId: number): Promise<AccountResponse> {
    const sql = `
      SELECT 
        id, company_id, code, name, account_type_id, type_name, normal_balance, report_group,
        parent_account_id, is_group, is_payable, is_active, created_at, updated_at
      FROM accounts
      WHERE id = ? AND company_id = ?
      LIMIT 1
    `;

    const rows = await this.db.query<AccountResponse>(sql, [accountId, companyId]);

    if (rows.length === 0) {
      throw new AccountNotFoundError(accountId, companyId);
    }

    return this.mapRowToAccountResponse(rows[0]);
  }

  /**
   * Create a new account with validation
   */
  async createAccount(data: AccountCreateRequest, userId?: number): Promise<AccountResponse> {
    // Validate account code uniqueness
    await this.validateAccountCode(data.code, data.company_id);

    // Validate parent account if provided
    if (data.parent_account_id) {
      await this.validateParentAccount(data.parent_account_id, null, data.company_id);
    }

    // Validate account type if provided
    if (data.account_type_id) {
      await this.validateAccountType(data.account_type_id, data.company_id);
    }

    // Use transaction if supported
    const useTransaction = this.db.begin && this.db.commit && this.db.rollback;
    
    try {
      if (useTransaction) {
        await this.db.begin!();
      }

      const sql = `
        INSERT INTO accounts (
          company_id, code, name, account_type_id, type_name, normal_balance, report_group,
          parent_account_id, is_group, is_payable, is_active, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      const params = [
        data.company_id,
        data.code,
        data.name,
        data.account_type_id ?? null,
        data.type_name ?? null,
        data.normal_balance ?? null,
        data.report_group ?? null,
        data.parent_account_id ?? null,
        data.is_group ? 1 : 0,
        data.is_payable ? 1 : 0,
        data.is_active ? 1 : 0
      ];

      const result = await this.db.execute(sql, params);
      const accountId = result.insertId!;

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logCreate(
          { company_id: data.company_id, user_id: userId },
          "account",
          accountId,
          {
            code: data.code,
            name: data.name,
            account_type_id: data.account_type_id,
            parent_account_id: data.parent_account_id
          }
        );
      }

      if (useTransaction) {
        await this.db.commit!();
      }

      // Return the created account
      return this.getAccountById(accountId, data.company_id);
    } catch (error) {
      if (useTransaction) {
        await this.db.rollback!();
      }
      throw error;
    }
  }

  /**
   * Update an existing account
   */
  async updateAccount(accountId: number, data: AccountUpdateRequest, companyId: number, userId?: number): Promise<AccountResponse> {
    // Verify account exists and get before state
    const before = await this.getAccountById(accountId, companyId);

    const updateFields: string[] = [];
    const params: any[] = [];

    if (data.code !== undefined) {
      await this.validateAccountCode(data.code, companyId, accountId);
      updateFields.push("code = ?");
      params.push(data.code);
    }

    if (data.name !== undefined) {
      updateFields.push("name = ?");
      params.push(data.name);
    }

    if (data.account_type_id !== undefined) {
      if (data.account_type_id !== null) {
        await this.validateAccountType(data.account_type_id, companyId);
      }
      updateFields.push("account_type_id = ?");
      params.push(data.account_type_id);
    }

    if (data.type_name !== undefined) {
      updateFields.push("type_name = ?");
      params.push(data.type_name);
    }

    if (data.normal_balance !== undefined) {
      updateFields.push("normal_balance = ?");
      params.push(data.normal_balance);
    }

    if (data.report_group !== undefined) {
      updateFields.push("report_group = ?");
      params.push(data.report_group);
    }

    if (data.parent_account_id !== undefined) {
      if (data.parent_account_id !== null) {
        await this.validateParentAccount(data.parent_account_id, accountId, companyId);
      }
      updateFields.push("parent_account_id = ?");
      params.push(data.parent_account_id);
    }

    if (data.is_group !== undefined) {
      updateFields.push("is_group = ?");
      params.push(data.is_group ? 1 : 0);
    }

    if (data.is_payable !== undefined) {
      updateFields.push("is_payable = ?");
      params.push(data.is_payable ? 1 : 0);
    }

    if (data.is_active !== undefined) {
      updateFields.push("is_active = ?");
      params.push(data.is_active ? 1 : 0);
    }

    if (updateFields.length === 0) {
      // No fields to update, return current account
      return this.getAccountById(accountId, companyId);
    }

    // Use transaction if supported
    const useTransaction = this.db.begin && this.db.commit && this.db.rollback;
    
    try {
      if (useTransaction) {
        await this.db.begin!();
      }

      const sql = `
        UPDATE accounts
        SET ${updateFields.join(", ")}
        WHERE id = ? AND company_id = ?
      `;

      params.push(accountId, companyId);
      await this.db.execute(sql, params);

      // Fetch updated account
      const after = await this.getAccountById(accountId, companyId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logUpdate(
          { company_id: companyId, user_id: userId },
          "account",
          accountId,
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
   * Deactivate account (soft delete)
   */
  async deactivateAccount(accountId: number, companyId: number, userId?: number): Promise<AccountResponse> {
    // Verify account exists
    await this.getAccountById(accountId, companyId);

    // Check if account is in use
    const inUse = await this.isAccountInUse(accountId, companyId);
    if (inUse) {
      throw new AccountInUseError(accountId, "has journal lines or active child accounts");
    }

    // Use transaction if supported
    const useTransaction = this.db.begin && this.db.commit && this.db.rollback;
    
    try {
      if (useTransaction) {
        await this.db.begin!();
      }

      const sql = `
        UPDATE accounts
        SET is_active = 0
        WHERE id = ? AND company_id = ?
      `;

      await this.db.execute(sql, [accountId, companyId]);

      const account = await this.getAccountById(accountId, companyId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logDeactivate(
          { company_id: companyId, user_id: userId },
          "account",
          accountId,
          { code: account.code, name: account.name }
        );
      }

      if (useTransaction) {
        await this.db.commit!();
      }

      return account;
    } catch (error) {
      if (useTransaction) {
        await this.db.rollback!();
      }
      throw error;
    }
  }

  /**
   * Reactivate account
   */
  async reactivateAccount(accountId: number, companyId: number, userId?: number): Promise<AccountResponse> {
    // Verify account exists
    await this.getAccountById(accountId, companyId);

    // Use transaction if supported
    const useTransaction = this.db.begin && this.db.commit && this.db.rollback;
    
    try {
      if (useTransaction) {
        await this.db.begin!();
      }

      const sql = `
        UPDATE accounts
        SET is_active = 1
        WHERE id = ? AND company_id = ?
      `;

      await this.db.execute(sql, [accountId, companyId]);

      const account = await this.getAccountById(accountId, companyId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logReactivate(
          { company_id: companyId, user_id: userId },
          "account",
          accountId,
          { code: account.code, name: account.name }
        );
      }

      if (useTransaction) {
        await this.db.commit!();
      }

      return account;
    } catch (error) {
      if (useTransaction) {
        await this.db.rollback!();
      }
      throw error;
    }
  }

  /**
   * Build hierarchical account tree
   */
  async getAccountTree(companyId: number, includeInactive = false): Promise<AccountTreeNode[]> {
    let sql = `
      SELECT 
        id, company_id, code, name, account_type_id, type_name, normal_balance, report_group,
        parent_account_id, is_group, is_payable, is_active, created_at, updated_at
      FROM accounts
      WHERE company_id = ?
    `;
    const params: any[] = [companyId];

    if (!includeInactive) {
      sql += ` AND is_active = 1`;
    }

    sql += ` ORDER BY code ASC`;

    const rows = await this.db.query<AccountResponse>(sql, params);
    const accounts = this.mapRowsToAccountResponses(rows);

    // Build tree structure
    return this.buildTree(accounts);
  }

  /**
   * Check if account has journal lines or active child accounts
   */
  async isAccountInUse(accountId: number, companyId: number): Promise<boolean> {
    // Check journal lines
    const journalSql = `
      SELECT COUNT(*) as count
      FROM journal_lines
      WHERE account_id = ? AND company_id = ?
      LIMIT 1
    `;

    const journalRows = await this.db.query<{ count: number }>(journalSql, [accountId, companyId]);
    if (journalRows.length > 0 && journalRows[0].count > 0) {
      return true;
    }

    // Check active child accounts
    const childrenSql = `
      SELECT COUNT(*) as count
      FROM accounts
      WHERE parent_account_id = ? AND company_id = ? AND is_active = 1
      LIMIT 1
    `;

    const childrenRows = await this.db.query<{ count: number }>(childrenSql, [accountId, companyId]);
    if (childrenRows.length > 0 && childrenRows[0].count > 0) {
      return true;
    }

    return false;
  }

  /**
   * Validate account code uniqueness
   */
  async validateAccountCode(code: string, companyId: number, excludeAccountId?: number): Promise<void> {
    let sql = `
      SELECT id
      FROM accounts
      WHERE company_id = ? AND code = ?
    `;
    const params: any[] = [companyId, code];

    if (excludeAccountId !== undefined) {
      sql += ` AND id != ?`;
      params.push(excludeAccountId);
    }

    sql += ` LIMIT 1`;

    const rows = await this.db.query<{ id: number }>(sql, params);

    if (rows.length > 0) {
      throw new AccountCodeExistsError(code, companyId);
    }
  }

  /**
   * Validate parent account and prevent circular references
   */
  async validateParentAccount(parentId: number, accountId: number | null, companyId: number): Promise<void> {
    // Verify parent account exists and belongs to the same company
    const parentSql = `
      SELECT id, company_id
      FROM accounts
      WHERE id = ?
      LIMIT 1
    `;

    const parentRows = await this.db.query<{ id: number; company_id: number }>(parentSql, [parentId]);

    if (parentRows.length === 0) {
      throw new AccountNotFoundError(parentId, companyId);
    }

    if (parentRows[0].company_id !== companyId) {
      throw new ParentAccountCompanyMismatchError(parentId, companyId);
    }

    // Prevent self-reference
    if (accountId !== null && parentId === accountId) {
      throw new CircularReferenceError(accountId, parentId);
    }

    // Prevent circular reference (parent cannot be a descendant)
    if (accountId !== null) {
      const isDescendant = await this.isDescendantOf(parentId, accountId);
      if (isDescendant) {
        throw new CircularReferenceError(accountId, parentId);
      }
    }
  }

  /**
   * Validate account type exists and belongs to the same company
   */
  async validateAccountType(accountTypeId: number, companyId: number): Promise<void> {
    const sql = `
      SELECT id, company_id
      FROM account_types
      WHERE id = ?
      LIMIT 1
    `;

    const rows = await this.db.query<{ id: number; company_id: number }>(sql, [accountTypeId]);

    if (rows.length === 0) {
      throw new Error(`Account type ${accountTypeId} not found`);
    }

    if (rows[0].company_id !== companyId) {
      throw new AccountTypeCompanyMismatchError(accountTypeId, companyId);
    }
  }

  /**
   * Check if potentialDescendant is a descendant of accountId
   */
  private async isDescendantOf(potentialDescendantId: number, accountId: number): Promise<boolean> {
    const sql = `
      SELECT parent_account_id
      FROM accounts
      WHERE id = ?
      LIMIT 1
    `;

    let currentId: number | null = potentialDescendantId;
    const visited = new Set<number>();

    while (currentId !== null) {
      // Prevent infinite loops
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);

      if (currentId === accountId) {
        return true;
      }

      const parentRows: Array<{ parent_account_id: number | null }> = await this.db.query<{ parent_account_id: number | null }>(sql, [currentId]);

      if (parentRows.length === 0 || parentRows[0].parent_account_id === null) {
        break;
      }

      currentId = parentRows[0].parent_account_id;
    }

    return false;
  }

  /**
   * Build tree structure from flat account list
   */
  private buildTree(accounts: AccountResponse[]): AccountTreeNode[] {
    const accountMap = new Map<number, AccountTreeNode>();
    const rootAccounts: AccountTreeNode[] = [];

    // Initialize all accounts as tree nodes
    accounts.forEach((account) => {
      accountMap.set(account.id, {
        ...account,
        children: []
      });
    });

    // Build parent-child relationships
    accounts.forEach((account) => {
      const node = accountMap.get(account.id)!;

      if (account.parent_account_id === null) {
        rootAccounts.push(node);
      } else {
        const parent = accountMap.get(account.parent_account_id);
        if (parent) {
          parent.children.push(node);
        } else {
          // Parent not found (orphaned account), add to root
          rootAccounts.push(node);
        }
      }
    });

    return rootAccounts;
  }

  /**
   * Map database row to AccountResponse
   */
  private mapRowToAccountResponse(row: any): AccountResponse {
    return {
      id: row.id,
      company_id: row.company_id,
      code: row.code,
      name: row.name,
      account_type_id: row.account_type_id,
      type_name: row.type_name,
      normal_balance: row.normal_balance,
      report_group: row.report_group,
      parent_account_id: row.parent_account_id,
      is_group: Boolean(row.is_group),
      is_payable: Boolean(row.is_payable),
      is_active: Boolean(row.is_active),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
    };
  }

  /**
   * Map database rows to AccountResponse array
   */
  private mapRowsToAccountResponses(rows: any[]): AccountResponse[] {
    return rows.map((row: any) => this.mapRowToAccountResponse(row));
  }
}
