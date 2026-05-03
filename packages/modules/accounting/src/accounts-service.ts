// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  AccountCreateRequest,
  AccountListQuery,
  AccountResponse,
  AccountTreeNode,
  AccountUpdateRequest
} from "@jurnapod/shared";
import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { withTransactionRetry } from "@jurnapod/db";
import { toUtcIso } from "@jurnapod/shared";

/**
 * Database client interface for dependency injection
 * Should support Kysely queries and transactions
 */
export interface AccountsDbClient extends KyselySchema {}

/**
 * Custom error classes for domain-specific errors
 */
export class AccountCodeExistsError extends Error {
  code = "ACCOUNT_CODE_EXISTS";
  constructor(code: string, companyId: number) {
    super(`Account code '${code}' already exists in company ${companyId}`);
    this.name = "AccountCodeExistsError";
  }
}

export class CircularReferenceError extends Error {
  code = "ACCOUNT_CIRCULAR_REFERENCE";
  constructor(accountId: number, parentId: number) {
    super(`Circular reference detected: account ${accountId} cannot have parent ${parentId}`);
    this.name = "CircularReferenceError";
  }
}

export class AccountInUseError extends Error {
  code = "ACCOUNT_IN_USE";
  constructor(accountId: number, reason: string) {
    super(`Account ${accountId} is in use: ${reason}`);
    this.name = "AccountInUseError";
  }
}

export class AccountNotFoundError extends Error {
  code = "ACCOUNT_NOT_FOUND";
  constructor(accountId: number, companyId: number) {
    super(`Account ${accountId} not found in company ${companyId}`);
    this.name = "AccountNotFoundError";
  }
}

export class ParentAccountCompanyMismatchError extends Error {
  code = "PARENT_ACCOUNT_COMPANY_MISMATCH";
  constructor(parentId: number, companyId: number) {
    super(`Parent account ${parentId} does not belong to company ${companyId}`);
    this.name = "ParentAccountCompanyMismatchError";
  }
}

export class AccountTypeCompanyMismatchError extends Error {
  code = "ACCOUNT_TYPE_COMPANY_MISMATCH";
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

    let query = this.db
      .selectFrom('accounts')
      .where('company_id', '=', company_id)
      .select([
        'id', 'company_id', 'code', 'name', 'type_name', 'normal_balance', 'report_group',
        'parent_account_id', 'account_type_id', 'is_group', 'is_payable', 'is_active', 'created_at', 'updated_at'
      ])
      .orderBy('code', 'asc');

    if (is_active !== undefined) {
      query = query.where('is_active', '=', is_active ? 1 : 0);
    }

    if (is_payable !== undefined) {
      query = query.where('is_payable', '=', is_payable ? 1 : 0);
    }

    if (report_group) {
      if (report_group === "PL") {
        query = query.where((eb) => eb.or([
          eb('report_group', '=', 'PL'),
          eb('report_group', '=', 'LR')
        ]));
      } else {
        query = query.where('report_group', '=', report_group);
      }
    }

    if (parent_account_id !== undefined) {
      if (parent_account_id === null) {
        query = query.where('parent_account_id', 'is', null);
      } else {
        query = query.where('parent_account_id', '=', parent_account_id);
      }
    }

    if (search) {
      const searchPattern = `%${search}%`;
      query = query.where((eb) => eb.or([
        eb('code', 'like', searchPattern),
        eb('name', 'like', searchPattern)
      ]));
    }

    const rows = await query.execute();
    return this.mapRowsToAccountResponses(rows);
  }

  /**
   * Get single account by ID
   */
  async getAccountById(accountId: number, companyId: number): Promise<AccountResponse> {
    const row = await this.db
      .selectFrom('accounts')
      .where('id', '=', accountId)
      .where('company_id', '=', companyId)
      .select([
        'id', 'company_id', 'code', 'name', 'account_type_id', 'type_name', 'normal_balance', 'report_group',
        'parent_account_id', 'is_group', 'is_payable', 'is_active', 'created_at', 'updated_at'
      ])
      .executeTakeFirst();

    if (!row) {
      throw new AccountNotFoundError(accountId, companyId);
    }

    return this.mapRowToAccountResponse(row);
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

    const accountId = await withTransactionRetry(this.db, async (trx) => {
      const result = await trx
        .insertInto('accounts')
        .values({
          company_id: data.company_id,
          code: data.code,
          name: data.name,
          account_type_id: data.account_type_id ?? null,
          type_name: effectiveTypeName,
          normal_balance: effectiveNormalBalance,
          report_group: effectiveReportGroup,
          parent_account_id: data.parent_account_id ?? null,
          is_group: data.is_group ? 1 : 0,
          is_payable: data.is_payable ? 1 : 0,
          is_active: data.is_active ? 1 : 0
        })
        .executeTakeFirst();

      const newAccountId = Number(result.insertId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logCreate(
          { company_id: data.company_id, user_id: userId },
          "account",
          newAccountId,
          {
            code: data.code,
            name: data.name,
            account_type_id: data.account_type_id,
            parent_account_id: data.parent_account_id,
            effective_type_name: effectiveTypeName
          }
        );
      }

      return newAccountId;
    });

    // Return the created account
    return this.getAccountById(accountId, data.company_id);
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
    const isReparenting = data.parent_account_id !== undefined;

    // Detect likely inherited values per field on parent change.
    // This supports mixed state accounts where some fields are explicit overrides
    // while other fields still mirror inherited ancestor values.
    const oldAncestor = (isReparenting && before.parent_account_id)
      ? await this.findNearestAncestorWithType(before.parent_account_id, companyId)
      : null;

    const isInheritingTypeName = !before.type_name;
    const isInheritingNormalBalance = !before.normal_balance;
    const isInheritingReportGroup = !before.report_group;

    const likelyInheritedTypeName =
      oldAncestor != null &&
      (before.type_name === oldAncestor.name || (!before.type_name && !oldAncestor.name));
    const likelyInheritedNormalBalance =
      oldAncestor != null &&
      (before.normal_balance === oldAncestor.normal_balance || (!before.normal_balance && !oldAncestor.normal_balance));
    const likelyInheritedReportGroup =
      oldAncestor != null &&
      (before.report_group === oldAncestor.report_group || (!before.report_group && !oldAncestor.report_group));

    const shouldRecomputeTypeNameOnReparent =
      isReparenting && data.type_name === undefined && (isInheritingTypeName || likelyInheritedTypeName);
    const shouldRecomputeNormalBalanceOnReparent =
      isReparenting && data.normal_balance === undefined && (isInheritingNormalBalance || likelyInheritedNormalBalance);
    const shouldRecomputeReportGroupOnReparent =
      isReparenting && data.report_group === undefined && (isInheritingReportGroup || likelyInheritedReportGroup);

    const shouldResolveTypeName =
      data.type_name === null || shouldRecomputeTypeNameOnReparent;
    const shouldResolveNormalBalance =
      data.normal_balance === null || shouldRecomputeNormalBalanceOnReparent;
    const shouldResolveReportGroup =
      data.report_group === null || shouldRecomputeReportGroupOnReparent;

    const needsInheritanceResolution =
      isClearingClassification ||
      shouldResolveTypeName ||
      shouldResolveNormalBalance ||
      shouldResolveReportGroup;

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

    // Build params in correct order: field values first, then WHERE values
    const allParams = [...params, accountId, companyId];
    const setClause = updateFields.join(", ");

    const after = await withTransactionRetry(this.db, async (trx) => {
      // Execute update using raw SQL (complex dynamic SQL is already built)
      await sql`UPDATE accounts SET ${sql.raw(setClause)} WHERE id = ${accountId} AND company_id = ${companyId}`.execute(trx);

      // Fetch updated account
      const updated = await this.getAccountById(accountId, companyId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logUpdate(
          { company_id: companyId, user_id: userId },
          "account",
          accountId,
          before,
          updated
        );
      }

      return updated;
    });

    return after;
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

    const account = await withTransactionRetry(this.db, async (trx) => {
      await trx
        .updateTable('accounts')
        .set({ is_active: 0 })
        .where('id', '=', accountId)
        .where('company_id', '=', companyId)
        .execute();

      const deactivated = await this.getAccountById(accountId, companyId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logDeactivate(
          { company_id: companyId, user_id: userId },
          "account",
          accountId,
          { code: deactivated.code, name: deactivated.name }
        );
      }

      return deactivated;
    });

    return account;
  }

  /**
   * Reactivate account
   */
  async reactivateAccount(accountId: number, companyId: number, userId?: number): Promise<AccountResponse> {
    // Verify account exists
    await this.getAccountById(accountId, companyId);

    const account = await withTransactionRetry(this.db, async (trx) => {
      await trx
        .updateTable('accounts')
        .set({ is_active: 1 })
        .where('id', '=', accountId)
        .where('company_id', '=', companyId)
        .execute();

      const reactivated = await this.getAccountById(accountId, companyId);

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logReactivate(
          { company_id: companyId, user_id: userId },
          "account",
          accountId,
          { code: reactivated.code, name: reactivated.name }
        );
      }

      return reactivated;
    });

    return account;
  }

  /**
   * Build hierarchical account tree
   */
  async getAccountTree(companyId: number, includeInactive = false): Promise<AccountTreeNode[]> {
    let query = this.db
      .selectFrom('accounts')
      .where('company_id', '=', companyId)
      .select([
        'id', 'company_id', 'code', 'name', 'account_type_id', 'type_name', 'normal_balance', 'report_group',
        'parent_account_id', 'is_group', 'is_payable', 'is_active', 'created_at', 'updated_at'
      ])
      .orderBy('code', 'asc');

    if (!includeInactive) {
      query = query.where('is_active', '=', 1);
    }

    const rows = await query.execute();
    const accounts = this.mapRowsToAccountResponses(rows);

    // Build tree structure
    return this.buildTree(accounts);
  }

  /**
   * Check if account has journal lines or active child accounts
   */
  async isAccountInUse(accountId: number, companyId: number): Promise<boolean> {
    // Check journal lines
    const journalCount = await this.db
      .selectFrom('journal_lines')
      .where('account_id', '=', accountId)
      .where('company_id', '=', companyId)
      .select((eb) => [eb.fn.count('id').as('count')])
      .executeTakeFirst();

    if (Number(journalCount?.count ?? 0) > 0) {
      return true;
    }

    // Check active child accounts
    const childrenCount = await this.db
      .selectFrom('accounts')
      .where('parent_account_id', '=', accountId)
      .where('company_id', '=', companyId)
      .where('is_active', '=', 1)
      .select((eb) => [eb.fn.count('id').as('count')])
      .executeTakeFirst();

    if (Number(childrenCount?.count ?? 0) > 0) {
      return true;
    }

    return false;
  }

  /**
   * Validate account code uniqueness
   */
  async validateAccountCode(code: string, companyId: number, excludeAccountId?: number): Promise<void> {
    let query = this.db
      .selectFrom('accounts')
      .where('company_id', '=', companyId)
      .where('code', '=', code)
      .select('id');

    if (excludeAccountId !== undefined) {
      query = query.where('id', '!=', excludeAccountId);
    }

    const row = await query.executeTakeFirst();

    if (row) {
      throw new AccountCodeExistsError(code, companyId);
    }
  }

  /**
   * Validate parent account and prevent circular references
   */
  async validateParentAccount(parentId: number, accountId: number | null, companyId: number): Promise<void> {
    // Verify parent account exists and belongs to the same company
    const parentRow = await this.db
      .selectFrom('accounts')
      .where('id', '=', parentId)
      .select(['id', 'company_id'])
      .executeTakeFirst();

    if (!parentRow) {
      throw new AccountNotFoundError(parentId, companyId);
    }

    if (parentRow.company_id !== companyId) {
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
    const row = await this.db
      .selectFrom('account_types')
      .where('id', '=', accountTypeId)
      .select(['id', 'company_id'])
      .executeTakeFirst();

    if (!row) {
      throw new Error(`Account type ${accountTypeId} not found`);
    }

    if (row.company_id !== companyId) {
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
    const row = await this.db
      .selectFrom('account_types')
      .where('id', '=', accountTypeId)
      .where('company_id', '=', companyId)
      .select(['name', 'normal_balance', 'report_group'])
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      name: row.name,
      normal_balance: row.normal_balance,
      report_group: row.report_group
    };
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
      const row = await this.db
        .selectFrom('accounts')
        .where('id', '=', currentId)
        .where('company_id', '=', companyId)
        .select(['id', 'account_type_id', 'parent_account_id', 'name', 'type_name', 'normal_balance', 'report_group'])
        .executeTakeFirst();

      if (!row) {
        return null;
      }

      // Check if this account has explicit classification (from accounts table)
      const hasClassification = row.type_name || row.normal_balance || row.report_group;
      if (hasClassification) {
        return {
          account_type_id: row.account_type_id ?? 0,
          name: row.type_name || row.name,
          normal_balance: row.normal_balance,
          report_group: row.report_group
        };
      }

      // Also check if account has a template attached that has values
      if (row.account_type_id) {
        const typeMeta = await this.getAccountTypeMetadata(row.account_type_id, companyId);
        if (typeMeta && (typeMeta.normal_balance || typeMeta.report_group)) {
          return {
            account_type_id: row.account_type_id,
            name: typeMeta.name,
            normal_balance: typeMeta.normal_balance,
            report_group: typeMeta.report_group
          };
        }
      }

      currentId = row.parent_account_id;
    }

    return null;
  }

  /**
   * Check if potentialDescendant is a descendant of accountId
   */
  private async isDescendantOf(potentialDescendantId: number, accountId: number): Promise<boolean> {
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

      const row = await this.db
        .selectFrom('accounts')
        .where('id', '=', currentId)
        .select('parent_account_id')
        .executeTakeFirst();

      if (!row || row.parent_account_id === null) {
        break;
      }

      currentId = row.parent_account_id;
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
      created_at: toUtcIso.dateLike(row.created_at as Date) as string,
      updated_at: toUtcIso.dateLike(row.updated_at as Date) as string
    };
  }

  /**
   * Map database rows to AccountResponse array
   */
  private mapRowsToAccountResponses(rows: any[]): AccountResponse[] {
    return rows.map((row: any) => this.mapRowToAccountResponse(row));
  }
}
