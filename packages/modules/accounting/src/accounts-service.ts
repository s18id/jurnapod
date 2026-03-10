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
      if (report_group === "PL") {
        sql += ` AND report_group IN ('PL', 'LR')`;
      } else {
        sql += ` AND report_group = ?`;
        params.push(report_group);
      }
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

    // Validate account type if provided (optional template metadata)
    if (data.account_type_id) {
      await this.validateAccountType(data.account_type_id, data.company_id);
    }

    // Resolve effective classification: accounts table is runtime source of truth
    // Priority per field: explicit input > template (account_type_id) > inheritance from parent
    // Each field is resolved independently (per-field inheritance)
    let effectiveTypeName: string | null = data.type_name ?? null;
    let effectiveNormalBalance: string | null = data.normal_balance ?? null;
    let effectiveReportGroup: string | null = data.report_group ?? null;

    // Gather potential sources once (template and ancestor)
    let templateMeta: { name: string; normal_balance: string | null; report_group: string | null } | null = null;
    let ancestorMeta: { name: string; normal_balance: string | null; report_group: string | null } | null = null;

    if (data.account_type_id) {
      templateMeta = await this.getAccountTypeMetadata(data.account_type_id, data.company_id);
    }

    if (data.parent_account_id) {
      ancestorMeta = await this.findNearestAncestorWithType(data.parent_account_id, data.company_id);
    }

    // Resolve each field independently: explicit > template > ancestor > null
    if (effectiveTypeName === null && (templateMeta || ancestorMeta)) {
      effectiveTypeName = templateMeta?.name ?? ancestorMeta?.name ?? null;
    }

    if (effectiveNormalBalance === null && (templateMeta || ancestorMeta)) {
      effectiveNormalBalance = templateMeta?.normal_balance ?? ancestorMeta?.normal_balance ?? null;
    }

    if (effectiveReportGroup === null && (templateMeta || ancestorMeta)) {
      effectiveReportGroup = templateMeta?.report_group ?? ancestorMeta?.report_group ?? null;
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      const params = [
        data.company_id,
        data.code,
        data.name,
        data.account_type_id ?? null,
        effectiveTypeName,
        effectiveNormalBalance,
        effectiveReportGroup,
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
            parent_account_id: data.parent_account_id,
            effective_type_name: effectiveTypeName
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

    // Track classification state for inheritance resolution
    let newParentId = before.parent_account_id;
    const hasExplicitClassification = 
      (data.type_name !== undefined) || 
      (data.normal_balance !== undefined) || 
      (data.report_group !== undefined);
    
    // Track if we're clearing classification to re-enable inheritance
    const isClearingClassification = 
      (data.type_name === null) || 
      (data.normal_balance === null) || 
      (data.report_group === null);

    if (data.code !== undefined) {
      await this.validateAccountCode(data.code, companyId, accountId);
      updateFields.push("code = ?");
      params.push(data.code);
    }

    if (data.name !== undefined) {
      updateFields.push("name = ?");
      params.push(data.name);
    }

    // Handle account_type_id as optional template metadata only
    if (data.account_type_id !== undefined) {
      if (data.account_type_id !== null) {
        await this.validateAccountType(data.account_type_id, companyId);
      }
      updateFields.push("account_type_id = ?");
      params.push(data.account_type_id);
    }

    // Handle explicit classification fields (primary source of truth)
    // These take priority over any inheritance
    if (data.type_name !== undefined && data.type_name !== null) {
      updateFields.push("type_name = ?");
      params.push(data.type_name);
    }

    if (data.normal_balance !== undefined && data.normal_balance !== null) {
      updateFields.push("normal_balance = ?");
      params.push(data.normal_balance);
    }

    if (data.report_group !== undefined && data.report_group !== null) {
      updateFields.push("report_group = ?");
      params.push(data.report_group);
    }

    if (data.parent_account_id !== undefined) {
      if (data.parent_account_id !== null) {
        await this.validateParentAccount(data.parent_account_id, accountId, companyId);
      }
      updateFields.push("parent_account_id = ?");
      params.push(data.parent_account_id);
      newParentId = data.parent_account_id;
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

    // Inheritance resolution: if classification was cleared or parent changed while inheriting
    const isInheritingClassification = 
      !before.type_name && !before.normal_balance && !before.report_group;

    // Detect "likely inherited" on parent change:
    // If parent changed and classification fields not explicitly provided,
    // check if current values match old ancestor classification
    let likelyInherited = false;
    if (data.parent_account_id !== undefined && !hasExplicitClassification && !isInheritingClassification) {
      // Get old ancestor classification (from before.parent_account_id)
      const oldAncestor = before.parent_account_id 
        ? await this.findNearestAncestorWithType(before.parent_account_id, companyId)
        : null;
      
      if (oldAncestor) {
        // Compare current values with old ancestor - if they match, likely inherited
        const matchesOldAncestor = 
          (before.type_name === oldAncestor.name || (!before.type_name && !oldAncestor.name)) &&
          (before.normal_balance === oldAncestor.normal_balance || (!before.normal_balance && !oldAncestor.normal_balance)) &&
          (before.report_group === oldAncestor.report_group || (!before.report_group && !oldAncestor.report_group));
        
        likelyInherited = matchesOldAncestor;
      }
    }

    const shouldRecomputeOnReparent =
      data.parent_account_id !== undefined && (isInheritingClassification || likelyInherited);
    const shouldResolveTypeName =
      data.type_name === null || (shouldRecomputeOnReparent && data.type_name === undefined);
    const shouldResolveNormalBalance =
      data.normal_balance === null || (shouldRecomputeOnReparent && data.normal_balance === undefined);
    const shouldResolveReportGroup =
      data.report_group === null || (shouldRecomputeOnReparent && data.report_group === undefined);

    const needsInheritanceResolution =
      isClearingClassification ||
      shouldRecomputeOnReparent;

    if (needsInheritanceResolution) {
      const updatedFieldsSet = new Set(updateFields.map(f => f.split(" = ?")[0]));
      const templateAccountTypeId =
        data.account_type_id !== undefined ? data.account_type_id : before.account_type_id;

      if (templateAccountTypeId) {
        const typeMeta = await this.getAccountTypeMetadata(templateAccountTypeId, companyId);
        if (typeMeta) {
          if (shouldResolveTypeName && !updatedFieldsSet.has("type_name")) {
            updateFields.push("type_name = ?");
            params.push(typeMeta.name);
            updatedFieldsSet.add("type_name");
          }
          if (shouldResolveNormalBalance && !updatedFieldsSet.has("normal_balance")) {
            updateFields.push("normal_balance = ?");
            params.push(typeMeta.normal_balance);
            updatedFieldsSet.add("normal_balance");
          }
          if (shouldResolveReportGroup && !updatedFieldsSet.has("report_group")) {
            updateFields.push("report_group = ?");
            params.push(typeMeta.report_group);
            updatedFieldsSet.add("report_group");
          }
        }
      }

      if (newParentId) {
        const ancestor = await this.findNearestAncestorWithType(newParentId, companyId);
        if (ancestor) {
          if (shouldResolveTypeName && !updatedFieldsSet.has("type_name")) {
            updateFields.push("type_name = ?");
            params.push(ancestor.name);
            updatedFieldsSet.add("type_name");
          }
          if (shouldResolveNormalBalance && !updatedFieldsSet.has("normal_balance")) {
            updateFields.push("normal_balance = ?");
            params.push(ancestor.normal_balance);
            updatedFieldsSet.add("normal_balance");
          }
          if (shouldResolveReportGroup && !updatedFieldsSet.has("report_group")) {
            updateFields.push("report_group = ?");
            params.push(ancestor.report_group);
            updatedFieldsSet.add("report_group");
          }
        } else if (!templateAccountTypeId) {
          if (shouldResolveTypeName && !updatedFieldsSet.has("type_name")) {
            updateFields.push("type_name = ?");
            params.push(null);
            updatedFieldsSet.add("type_name");
          }
          if (shouldResolveNormalBalance && !updatedFieldsSet.has("normal_balance")) {
            updateFields.push("normal_balance = ?");
            params.push(null);
            updatedFieldsSet.add("normal_balance");
          }
          if (shouldResolveReportGroup && !updatedFieldsSet.has("report_group")) {
            updateFields.push("report_group = ?");
            params.push(null);
            updatedFieldsSet.add("report_group");
          }
        }
      } else {
        const hasTemplateApplied = 
          updatedFieldsSet.has("type_name") || 
          updatedFieldsSet.has("normal_balance") || 
          updatedFieldsSet.has("report_group");
        
        if (!hasTemplateApplied && !templateAccountTypeId) {
          if (shouldResolveTypeName && !updatedFieldsSet.has("type_name")) {
            updateFields.push("type_name = ?");
            params.push(null);
            updatedFieldsSet.add("type_name");
          }
          if (shouldResolveNormalBalance && !updatedFieldsSet.has("normal_balance")) {
            updateFields.push("normal_balance = ?");
            params.push(null);
            updatedFieldsSet.add("normal_balance");
          }
          if (shouldResolveReportGroup && !updatedFieldsSet.has("report_group")) {
            updateFields.push("report_group = ?");
            params.push(null);
            updatedFieldsSet.add("report_group");
          }
        }
      }
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
   * Get account type metadata (name, normal_balance, report_group) by ID
   * Used to derive legacy mirror fields from explicit account_type_id
   */
  async getAccountTypeMetadata(
    accountTypeId: number,
    companyId: number
  ): Promise<{ name: string; normal_balance: string | null; report_group: string | null } | null> {
    const sql = `
      SELECT name, normal_balance, report_group
      FROM account_types
      WHERE id = ? AND company_id = ?
      LIMIT 1
    `;

    const rows = await this.db.query<{
      name: string;
      normal_balance: string | null;
      report_group: string | null;
    }>(sql, [accountTypeId, companyId]);

    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  }

  /**
   * Find the nearest ancestor account that has explicit classification fields
   * Returns the classification from accounts table (runtime source of truth)
   * This is the accounts-first approach: inheritance from parent account rows
   */
  async findNearestAncestorWithType(
    parentAccountId: number | null,
    companyId: number
  ): Promise<{ account_type_id: number; name: string; normal_balance: string | null; report_group: string | null } | null> {
    if (!parentAccountId) {
      return null;
    }

    const visited = new Set<number>();
    let currentId: number | null = parentAccountId;

    while (currentId !== null) {
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);

      // Look for accounts with explicit classification fields directly
      const sql = `
        SELECT id, account_type_id, parent_account_id, name, type_name, normal_balance, report_group
        FROM accounts
        WHERE id = ? AND company_id = ?
        LIMIT 1
      `;

      type AncestorRow = {
        id: number;
        account_type_id: number | null;
        parent_account_id: number | null;
        name: string;
        type_name: string | null;
        normal_balance: string | null;
        report_group: string | null;
      };
      const rows: AncestorRow[] = await this.db.query<AncestorRow>(sql, [currentId, companyId]);

      if (rows.length === 0) {
        return null;
      }

      const account: AncestorRow = rows[0];
      
      // Check if this account has explicit classification (from accounts table)
      const hasClassification = account.type_name || account.normal_balance || account.report_group;
      if (hasClassification) {
        return {
          account_type_id: account.account_type_id ?? 0,
          name: account.type_name || account.name,
          normal_balance: account.normal_balance,
          report_group: account.report_group
        };
      }

      // Also check if account has a template attached that has values
      if (account.account_type_id) {
        const typeMeta = await this.getAccountTypeMetadata(account.account_type_id, companyId);
        if (typeMeta && (typeMeta.normal_balance || typeMeta.report_group)) {
          return {
            account_type_id: account.account_type_id,
            name: typeMeta.name,
            normal_balance: typeMeta.normal_balance,
            report_group: typeMeta.report_group
          };
        }
      }

      currentId = account.parent_account_id;
    }

    return null;
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
      report_group: this.normalizeReportGroup(row.report_group),
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
