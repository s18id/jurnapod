import type { Pool, PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { AuditService, type AuditDbClient } from "@jurnapod/modules-platform";
import { getDbPool } from "./db";

/**
 * MySQL adapter for AuditDbClient with transaction support
 */
class MySQLAuditDbClient implements AuditDbClient {
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
 * Create AuditService instance with MySQL adapter
 */
function createAuditService(): AuditService {
  const pool = getDbPool();
  const dbClient = new MySQLAuditDbClient(pool);
  return new AuditService(dbClient);
}

// Singleton instance
let auditServiceInstance: AuditService | null = null;

/**
 * Get singleton AuditService instance
 */
export function getAuditService(): AuditService {
  if (!auditServiceInstance) {
    auditServiceInstance = createAuditService();
  }
  return auditServiceInstance;
}
