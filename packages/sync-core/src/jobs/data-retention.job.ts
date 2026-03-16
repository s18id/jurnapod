// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { Pool, Connection } from "mysql2/promise";

/**
 * Retention policy configuration for a table
 */
export interface RetentionPolicy {
  /** Table name to purge */
  table: string;
  /** Number of days to retain data */
  retentionDays: number;
  /** Date column to use for retention calculation */
  dateColumn: string;
  /** If set, archive to this table instead of deleting */
  archiveTable?: string;
  /** Additional WHERE clause conditions (e.g., "AND sync_status = 'COMPLETED'") */
  additionalWhere?: string;
}

/**
 * Result of a single table purge operation
 */
export interface PurgeResult {
  table: string;
  recordsAffected: number;
  dateRange: {
    from: Date;
    to: Date;
  };
  archived: boolean;
  archiveTable?: string;
  error?: string;
}

/**
 * Summary result of all retention operations
 */
export interface RetentionResult {
  success: boolean;
  timestamp: Date;
  totalRecordsAffected: number;
  results: PurgeResult[];
  errors: string[];
}

/**
 * Default retention policies for sync tables
 */
export const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  {
    table: "sync_operations",
    retentionDays: 30,
    dateColumn: "started_at",
  },
  {
    table: "backoffice_sync_queue",
    retentionDays: 7,
    dateColumn: "created_at",
    additionalWhere: "AND sync_status IN ('SUCCESS', 'FAILED')",
  },
  {
    table: "sync_audit_events",
    retentionDays: 90,
    dateColumn: "created_at",
    archiveTable: "sync_audit_events_archive",
  },
];

/**
 * Data retention job that purges old data from sync tables
 * based on configured retention policies.
 */
export class DataRetentionJob {
  private pool: Pool;
  private policies: RetentionPolicy[];

  constructor(pool: Pool, policies: RetentionPolicy[] = DEFAULT_RETENTION_POLICIES) {
    this.pool = pool;
    this.policies = policies;
  }

  /**
   * Execute all retention policies and return summary
   */
  async run(): Promise<RetentionResult> {
    const timestamp = new Date();
    const results: PurgeResult[] = [];
    const errors: string[] = [];
    let totalRecordsAffected = 0;

    this.logActivity(`Starting data retention job at ${timestamp.toISOString()}`);

    for (const policy of this.policies) {
      try {
        const recordsAffected = await this.purgeTable(policy);
        totalRecordsAffected += recordsAffected;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(`Failed to purge ${policy.table}: ${errorMessage}`);
        this.logActivity(
          `ERROR: Failed to purge ${policy.table}: ${errorMessage}`
        );
      }
    }

    const success = errors.length === 0;

    this.logActivity(
      `Data retention job completed. Total records affected: ${totalRecordsAffected}, Errors: ${errors.length}`
    );

    return {
      success,
      timestamp,
      totalRecordsAffected,
      results,
      errors,
    };
  }

  /**
   * Purge records from a single table based on retention policy
   */
  private async purgeTable(policy: RetentionPolicy): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    this.logActivity(
      `Purging ${policy.table}: records older than ${cutoffDate.toISOString()}`
    );

    try {
      if (policy.archiveTable) {
        // Archive then delete
        return await this.archiveAndDelete(policy, cutoffDate);
      } else {
        // Just delete
        return await this.deleteOnly(policy, cutoffDate);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logActivity(`ERROR purging ${policy.table}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Archive records to archive table then delete from main table
   * Uses a transaction for atomicity
   */
  private async archiveAndDelete(
    policy: RetentionPolicy,
    cutoffDate: Date
  ): Promise<number> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // First, insert into archive table
      const insertSql = `
        INSERT INTO ${policy.archiveTable}
        SELECT *, NOW() as archived_at
        FROM ${policy.table}
        WHERE ${policy.dateColumn} < ?
        ${policy.additionalWhere || ""}
      `;

      const [insertResult] = await connection.execute(insertSql, [cutoffDate]);
      const insertedCount = (insertResult as { affectedRows: number }).affectedRows || 0;

      if (insertedCount > 0) {
        // Then delete from main table
        const deleteSql = `
          DELETE FROM ${policy.table}
          WHERE ${policy.dateColumn} < ?
          ${policy.additionalWhere || ""}
        `;

        const [deleteResult] = await connection.execute(deleteSql, [cutoffDate]);
        const deletedCount = (deleteResult as { affectedRows: number }).affectedRows || 0;

        await connection.commit();

        this.logActivity(
          `Archived ${insertedCount} and deleted ${deletedCount} records from ${policy.table}`
        );

        return deletedCount;
      } else {
        await connection.commit();
        return 0;
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete records without archiving
   */
  private async deleteOnly(
    policy: RetentionPolicy,
    cutoffDate: Date
  ): Promise<number> {
    const sql = `
      DELETE FROM ${policy.table}
      WHERE ${policy.dateColumn} < ?
      ${policy.additionalWhere || ""}
    `;

    const [result] = await this.pool.execute(sql, [cutoffDate]);
    const info = result as { affectedRows: number };
    const deletedCount = info.affectedRows || 0;

    this.logActivity(
      `Deleted ${deletedCount} records from ${policy.table}`
    );

    return deletedCount;
  }

  /**
   * Archive events older than the specified number of days
   * @param olderThanDays - Archive events older than this many days
   * @returns Number of events archived
   */
  async archiveEvents(olderThanDays: number): Promise<number> {
    const policy: RetentionPolicy = {
      table: "sync_audit_events",
      retentionDays: olderThanDays,
      dateColumn: "created_at",
      archiveTable: "sync_audit_events_archive",
    };

    return this.purgeTable(policy);
  }

  /**
   * Log purge activity for auditing
   */
  private logActivity(message: string): void {
    // In production, this should write to a proper logging system
    // For now, console.log is sufficient
    console.log(`[DataRetentionJob] ${message}`);
  }
}

/**
 * Convenience function to run the data retention job
 * @param pool - Database pool to use
 * @param policies - Optional custom retention policies
 * @returns Retention result summary
 */
export async function runDataRetentionJob(
  pool: Pool,
  policies?: RetentionPolicy[]
): Promise<RetentionResult> {
  const job = new DataRetentionJob(pool, policies);
  return job.run();
}

// Singleton instance - will be initialized with pool by the API
let _dataRetentionJob: DataRetentionJob | null = null;

/**
 * Get or create the singleton DataRetentionJob instance
 * Must be initialized with setDataRetentionJobPool before use
 */
export function getDataRetentionJob(): DataRetentionJob {
  if (!_dataRetentionJob) {
    throw new Error(
      "DataRetentionJob not initialized. Call setDataRetentionJobPool(pool) first."
    );
  }
  return _dataRetentionJob;
}

/**
 * Initialize the DataRetentionJob singleton with a database pool
 * Should be called once during application startup
 */
export function setDataRetentionJobPool(pool: Pool): void {
  _dataRetentionJob = new DataRetentionJob(pool);
}
