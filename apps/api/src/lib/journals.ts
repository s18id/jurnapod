// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { Pool, PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import {
  JournalsService,
  type JournalsDbClient
} from "@jurnapod/modules-accounting";
import type {
  ManualJournalEntryCreateRequest,
  JournalBatchResponse,
  JournalListQuery
} from "@jurnapod/shared";
import { getDbPool } from "./db";

/**
 * MySQL adapter for JournalsDbClient
 */
class MySQLJournalsDbClient implements JournalsDbClient {
  constructor(private readonly pool: Pool) {}
  
  private txConnection: PoolConnection | null = null;

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const conn = this.txConnection ?? this.pool;
    const [rows] = await conn.execute<RowDataPacket[]>(sql, params || []);
    return rows as T[];
  }

  async execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }> {
    const conn = this.txConnection ?? this.pool;
    const [result] = await conn.execute<ResultSetHeader>(sql, params || []);
    return {
      affectedRows: result.affectedRows,
      insertId: result.insertId
    };
  }

  async begin(): Promise<void> {
    if (!this.txConnection) {
      this.txConnection = await this.pool.getConnection();
      await this.txConnection.beginTransaction();
    }
  }

  async commit(): Promise<void> {
    if (this.txConnection) {
      await this.txConnection.commit();
      this.txConnection.release();
      this.txConnection = null;
    }
  }

  async rollback(): Promise<void> {
    if (this.txConnection) {
      await this.txConnection.rollback();
      this.txConnection.release();
      this.txConnection = null;
    }
  }
}

/**
 * Shared DB client for both journals and audit
 */
class SharedMySQLDbClient extends MySQLJournalsDbClient {
  // Inherits all methods
}

/**
 * Create JournalsService instance with MySQL adapter and audit service
 */
function createJournalsService(): JournalsService {
  const pool = getDbPool();
  const sharedDbClient = new SharedMySQLDbClient(pool);
  
  // Import AuditService class
  const { AuditService } = require("@jurnapod/modules-platform");
  
  // Create audit service with the SAME db client to share transactions
  const auditService = new AuditService(sharedDbClient);
  
  // Adapter for audit service (journals only need logCreate)
  const auditServiceAdapter = {
    logCreate: async (context: any, entityType: string, entityId: string | number, payload: Record<string, any>) => {
      return auditService.logCreate(context, entityType as any, entityId, payload);
    },
    logUpdate: async () => { throw new Error("Not implemented for journals"); },
    logDeactivate: async () => { throw new Error("Not implemented for journals"); },
    logReactivate: async () => { throw new Error("Not implemented for journals"); }
  };
  
  return new JournalsService(sharedDbClient, auditServiceAdapter);
}

// Singleton instance
let journalsServiceInstance: JournalsService | null = null;

function getJournalsService(): JournalsService {
  if (!journalsServiceInstance) {
    journalsServiceInstance = createJournalsService();
  }
  return journalsServiceInstance;
}

/**
 * Export service methods
 */
export async function createManualJournalEntry(
  data: ManualJournalEntryCreateRequest,
  userId?: number
): Promise<JournalBatchResponse> {
  const service = getJournalsService();
  return service.createManualEntry(data, userId);
}

export async function getJournalBatch(
  batchId: number,
  companyId: number
): Promise<JournalBatchResponse> {
  const service = getJournalsService();
  return service.getJournalBatch(batchId, companyId);
}

export async function listJournalBatches(
  filters: JournalListQuery
): Promise<JournalBatchResponse[]> {
  const service = getJournalsService();
  return service.listJournalBatches(filters);
}

/**
 * Export error classes
 */
export {
  JournalNotBalancedError,
  JournalNotFoundError,
  InvalidJournalLineError
} from "@jurnapod/modules-accounting";
