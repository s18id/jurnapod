// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { Pool, PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import {
  AccountsService,
  type AccountsDbClient
} from "@jurnapod/modules-accounting";
import type {
  AccountResponse,
  AccountCreateRequest,
  AccountUpdateRequest,
  AccountListQuery,
  AccountTreeNode
} from "@jurnapod/shared";
import { getDbPool } from "./db";
import { getAuditService } from "./audit";

/**
 * MySQL adapter for AccountsDbClient with transaction support
 */
class MySQLAccountsDbClient implements AccountsDbClient {
  private connection: PoolConnection | null = null;

  constructor(private readonly pool: Pool) {}

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const executor = this.connection || this.pool;
    const [rows] = await executor.execute<RowDataPacket[]>(sql, params || []);
    return rows as T[];
  }

  async execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }> {
    const executor = this.connection || this.pool;
    const [result] = await executor.execute<ResultSetHeader>(sql, params || []);
    return {
      affectedRows: result.affectedRows,
      insertId: result.insertId
    };
  }

  async begin(): Promise<void> {
    if (this.connection) {
      throw new Error("Transaction already in progress");
    }
    this.connection = await this.pool.getConnection();
    await this.connection.beginTransaction();
  }

  async commit(): Promise<void> {
    if (!this.connection) {
      throw new Error("No transaction in progress");
    }
    try {
      await this.connection.commit();
    } finally {
      this.connection.release();
      this.connection = null;
    }
  }

  async rollback(): Promise<void> {
    if (!this.connection) {
      throw new Error("No transaction in progress");
    }
    try {
      await this.connection.rollback();
    } finally {
      this.connection.release();
      this.connection = null;
    }
  }
}

/**
 * Audit service interface (matches AccountsService expectations)
 */
interface AuditServiceInterface {
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
 * Adapter to make AuditService compatible with AuditServiceInterface
 * The platform AuditService uses AuditEntityType enum, but the interface expects string
 */
class AuditServiceAdapter implements AuditServiceInterface {
  constructor(private readonly auditService: ReturnType<typeof getAuditService>) {}

  async logCreate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload: Record<string, any>
  ): Promise<void> {
    return this.auditService.logCreate(context, entityType as any, entityId, payload);
  }

  async logUpdate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    before: Record<string, any>,
    after: Record<string, any>
  ): Promise<void> {
    return this.auditService.logUpdate(context, entityType as any, entityId, before, after);
  }

  async logDeactivate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload?: Record<string, any>
  ): Promise<void> {
    return this.auditService.logDeactivate(context, entityType as any, entityId, payload);
  }

  async logReactivate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload?: Record<string, any>
  ): Promise<void> {
    return this.auditService.logReactivate(context, entityType as any, entityId, payload);
  }
}

/**
 * Shared DB client that implements both AccountsDbClient and AuditDbClient
 * This allows both services to share the same connection during transactions
 */
class SharedMySQLDbClient extends MySQLAccountsDbClient {
  // Inherits all methods from MySQLAccountsDbClient
  // which already implements both query, execute, begin, commit, rollback
}

/**
 * Create AccountsService instance with MySQL adapter and audit service
 * Both services share the same db client to support transactions
 */
function createAccountsService(): AccountsService {
  const pool = getDbPool();
  const sharedDbClient = new SharedMySQLDbClient(pool);
  
  // Import AuditService class
  const { AuditService } = require("@jurnapod/modules-platform");
  
  // Create audit service with the SAME db client to share transactions
  const auditService = new AuditService(sharedDbClient);
  const auditServiceAdapter = new AuditServiceAdapter(auditService);
  
  return new AccountsService(sharedDbClient, auditServiceAdapter);
}

// Singleton instance
let accountsServiceInstance: AccountsService | null = null;

function getAccountsService(): AccountsService {
  if (!accountsServiceInstance) {
    accountsServiceInstance = createAccountsService();
  }
  return accountsServiceInstance;
}

/**
 * Export service methods
 */
export async function listAccounts(query: AccountListQuery): Promise<AccountResponse[]> {
  const service = getAccountsService();
  return service.listAccounts(query);
}

export async function getAccountById(accountId: number, companyId: number): Promise<AccountResponse> {
  const service = getAccountsService();
  return service.getAccountById(accountId, companyId);
}

export async function createAccount(data: AccountCreateRequest, userId?: number): Promise<AccountResponse> {
  const service = getAccountsService();
  return service.createAccount(data, userId);
}

export async function updateAccount(
  accountId: number,
  data: AccountUpdateRequest,
  companyId: number,
  userId?: number
): Promise<AccountResponse> {
  const service = getAccountsService();
  return service.updateAccount(accountId, data, companyId, userId);
}

export async function deactivateAccount(accountId: number, companyId: number, userId?: number): Promise<AccountResponse> {
  const service = getAccountsService();
  return service.deactivateAccount(accountId, companyId, userId);
}

export async function reactivateAccount(accountId: number, companyId: number, userId?: number): Promise<AccountResponse> {
  const service = getAccountsService();
  return service.reactivateAccount(accountId, companyId, userId);
}

export async function getAccountTree(companyId: number, includeInactive = false): Promise<AccountTreeNode[]> {
  const service = getAccountsService();
  return service.getAccountTree(companyId, includeInactive);
}

export async function isAccountInUse(accountId: number, companyId: number): Promise<boolean> {
  const service = getAccountsService();
  return service.isAccountInUse(accountId, companyId);
}

/**
 * Export error classes
 */
export {
  AccountCodeExistsError,
  CircularReferenceError,
  AccountInUseError,
  AccountNotFoundError,
  ParentAccountCompanyMismatchError,
  AccountTypeCompanyMismatchError
} from "@jurnapod/modules-accounting";
