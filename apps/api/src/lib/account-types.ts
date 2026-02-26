import type { Pool, PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import {
  AccountTypesService,
  type AccountTypesDbClient
} from "@jurnapod/modules-accounting";
import type {
  AccountTypeResponse,
  AccountTypeCreateRequest,
  AccountTypeUpdateRequest,
  AccountTypeListQuery
} from "@jurnapod/shared";
import { getDbPool } from "./db";
import { getAuditService } from "./audit";

/**
 * MySQL adapter for AccountTypesDbClient with transaction support
 */
class MySQLAccountTypesDbClient implements AccountTypesDbClient {
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
 * Audit service interface (matches AccountTypesService expectations)
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
}

/**
 * Adapter to make AuditService compatible with AuditServiceInterface
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
 * Shared DB client that implements both AccountTypesDbClient and AuditDbClient
 * This allows both services to share the same connection during transactions
 */
class SharedMySQLDbClient extends MySQLAccountTypesDbClient {
  // Inherits all methods from MySQLAccountTypesDbClient
  // which already implements both query, execute, begin, commit, rollback
}

/**
 * Create AccountTypesService instance with MySQL adapter and audit service
 * Both services share the same db client to support transactions
 */
function createAccountTypesService(): AccountTypesService {
  const pool = getDbPool();
  const sharedDbClient = new SharedMySQLDbClient(pool);
  
  // Import AuditService class
  const { AuditService } = require("@jurnapod/modules-platform");
  
  // Create audit service with the SAME db client to share transactions
  const auditService = new AuditService(sharedDbClient);
  const auditServiceAdapter = new AuditServiceAdapter(auditService);
  
  return new AccountTypesService(sharedDbClient, auditServiceAdapter);
}

// Singleton instance
let accountTypesServiceInstance: AccountTypesService | null = null;

function getAccountTypesService(): AccountTypesService {
  if (!accountTypesServiceInstance) {
    accountTypesServiceInstance = createAccountTypesService();
  }
  return accountTypesServiceInstance;
}

/**
 * Export service methods
 */
export async function listAccountTypes(query: AccountTypeListQuery): Promise<AccountTypeResponse[]> {
  const service = getAccountTypesService();
  return service.listAccountTypes(query);
}

export async function getAccountTypeById(accountTypeId: number, companyId: number): Promise<AccountTypeResponse> {
  const service = getAccountTypesService();
  return service.getAccountTypeById(accountTypeId, companyId);
}

export async function createAccountType(data: AccountTypeCreateRequest, userId?: number): Promise<AccountTypeResponse> {
  const service = getAccountTypesService();
  return service.createAccountType(data, userId);
}

export async function updateAccountType(
  accountTypeId: number,
  data: AccountTypeUpdateRequest,
  companyId: number,
  userId?: number
): Promise<AccountTypeResponse> {
  const service = getAccountTypesService();
  return service.updateAccountType(accountTypeId, data, companyId, userId);
}

export async function deactivateAccountType(accountTypeId: number, companyId: number, userId?: number): Promise<AccountTypeResponse> {
  const service = getAccountTypesService();
  return service.deactivateAccountType(accountTypeId, companyId, userId);
}

export async function isAccountTypeInUse(accountTypeId: number, companyId: number): Promise<boolean> {
  const service = getAccountTypesService();
  return service.isAccountTypeInUse(accountTypeId, companyId);
}

/**
 * Export error classes
 */
export {
  AccountTypeNameExistsError,
  AccountTypeNotFoundError,
  AccountTypeInUseError
} from "@jurnapod/modules-accounting";
