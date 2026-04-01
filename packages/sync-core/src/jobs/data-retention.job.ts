// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

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
 * Note: sync_operations was dropped in Epic 20 closeout - no longer needed
 */
export const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
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
 * 
 * Uses KyselySchema from @jurnapod/db for all database operations.
 */
export class DataRetentionJob {
  private db: KyselySchema;
  private policies: RetentionPolicy[];

  constructor(db: KyselySchema, policies: RetentionPolicy[] = DEFAULT_RETENTION_POLICIES) {
    this.db = db;
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
        const purgeResult = await this.purgeTable(policy);
        totalRecordsAffected += purgeResult.recordsAffected;
        results.push(purgeResult);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(`Failed to purge ${policy.table}: ${errorMessage}`);
        this.logActivity(
          `ERROR: Failed to purge ${policy.table}: ${errorMessage}`
        );
        // Push a failed result entry
        results.push({
          table: policy.table,
          recordsAffected: 0,
          dateRange: { from: new Date(), to: new Date() },
          archived: !!policy.archiveTable,
          archiveTable: policy.archiveTable,
          error: errorMessage,
        });
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
  private async purgeTable(policy: RetentionPolicy): Promise<PurgeResult> {
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    this.logActivity(
      `Purging ${policy.table}: records older than ${cutoffDate.toISOString()}`
    );

    try {
      if (policy.archiveTable) {
        // Archive then delete
        return await this.archiveAndDelete(policy, cutoffDate, now);
      } else {
        // Just delete
        return await this.deleteOnly(policy, cutoffDate, now);
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
    cutoffDate: Date,
    now: Date
  ): Promise<PurgeResult> {
    return await this.db.transaction().execute(async (trx) => {
      try {
        // First, insert into archive table
        const insertResult = await sql`
          INSERT INTO ${sql.raw(policy.archiveTable!)}
          SELECT *, NOW() as archived_at
          FROM ${sql.raw(policy.table)}
          WHERE ${sql.raw(policy.dateColumn)} < ${cutoffDate}
          ${policy.additionalWhere ? sql.raw(policy.additionalWhere) : sql``}
        `.execute(trx);

        const insertedCount = insertResult.numAffectedRows || 0;

        if (insertedCount > 0) {
          // Then delete from main table
          const deleteResult = await sql`
            DELETE FROM ${sql.raw(policy.table)}
            WHERE ${sql.raw(policy.dateColumn)} < ${cutoffDate}
            ${policy.additionalWhere ? sql.raw(policy.additionalWhere) : sql``}
          `.execute(trx);

          const deletedCount = Number(deleteResult.numAffectedRows || 0);

          this.logActivity(
            `Archived ${insertedCount} and deleted ${deletedCount} records from ${policy.table}`
          );

          return {
            table: policy.table,
            recordsAffected: deletedCount,
            dateRange: { from: cutoffDate, to: now },
            archived: true,
            archiveTable: policy.archiveTable,
          };
        } else {
          return {
            table: policy.table,
            recordsAffected: 0,
            dateRange: { from: cutoffDate, to: now },
            archived: true,
            archiveTable: policy.archiveTable,
          };
        }
      } catch (error) {
        throw error;
      }
    });
  }

  /**
   * Delete records without archiving
   */
  private async deleteOnly(
    policy: RetentionPolicy,
    cutoffDate: Date,
    now: Date
  ): Promise<PurgeResult> {
    const result = await sql`
      DELETE FROM ${sql.raw(policy.table)}
      WHERE ${sql.raw(policy.dateColumn)} < ${cutoffDate}
      ${policy.additionalWhere ? sql.raw(policy.additionalWhere) : sql``}
    `.execute(this.db);
    
    const deletedCount = Number(result.numAffectedRows || 0);

    this.logActivity(
      `Deleted ${deletedCount} records from ${policy.table}`
    );

    return {
      table: policy.table,
      recordsAffected: deletedCount,
      dateRange: { from: cutoffDate, to: now },
      archived: false,
    };
  }

  /**
   * Archive events older than the specified number of days
   * @param olderThanDays - Archive events older than this many days
   * @returns PurgeResult with count of events archived
   */
  async archiveEvents(olderThanDays: number): Promise<PurgeResult> {
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
 * @param db - Database connection (KyselySchema) to use
 * @param policies - Optional custom retention policies
 * @returns Retention result summary
 */
export async function runDataRetentionJob(
  db: KyselySchema,
  policies?: RetentionPolicy[]
): Promise<RetentionResult> {
  const job = new DataRetentionJob(db, policies);
  return job.run();
}

// Singleton instance - will be initialized with db by the API
let _dataRetentionJob: DataRetentionJob | null = null;

/**
 * Get or create the singleton DataRetentionJob instance
 * Must be initialized with setDataRetentionJobDb before use
 */
export function getDataRetentionJob(): DataRetentionJob {
  if (!_dataRetentionJob) {
    throw new Error(
      "DataRetentionJob not initialized. Call setDataRetentionJobDb(db) first."
    );
  }
  return _dataRetentionJob;
}

/**
 * Initialize the DataRetentionJob singleton with a database connection
 * Should be called once during application startup
 */
export function setDataRetentionJobDb(db: KyselySchema): void {
  _dataRetentionJob = new DataRetentionJob(db);
}
