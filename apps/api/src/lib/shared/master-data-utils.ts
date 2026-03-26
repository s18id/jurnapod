// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "../db.js";
import { DatabaseForbiddenError } from "../master-data-errors.js";
import { ensureUserHasOutletAccess as commonUtilsEnsureUserHasOutletAccess } from "./common-utils.js";

// Re-export for backward compatibility - prefer importing from common-utils directly
export const ensureUserHasOutletAccess = commonUtilsEnsureUserHasOutletAccess;

/**
 * MySQL duplicate entry error code (1062)
 * Used for detecting unique constraint violations
 */
export const mysqlDuplicateErrorCode = 1062;

/**
 * MySQL foreign key error code (1452)
 * Used for detecting foreign key constraint violations
 */
export const mysqlForeignKeyErrorCode = 1452;

/**
 * Type guard for mysql2-style errors used by duplicate / FK handling.
 */
export function isMysqlError(error: unknown): error is { errno: number; code?: string; message?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "errno" in error &&
    typeof (error as { errno?: unknown }).errno === "number"
  );
}

/**
 * Transaction wrapper that handles begin/commit/rollback automatically
 */
export async function withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

type AuditLogInput = {
  companyId: number;
  outletId: number | null;
  actor: MutationAuditActor | undefined;
  action: string;
  payload: Record<string, unknown>;
};

/**
 * Generic master-data audit log recorder for successful mutations.
 * Failure-path audit logging should use a different helper so callers do not
 * accidentally persist `success=1` / `result='SUCCESS'` for failed operations.
 */
export async function recordMasterDataAuditLog(
  executor: { execute: PoolConnection["execute"] },
  input: AuditLogInput
): Promise<void> {
  await executor.execute(
    `INSERT INTO audit_logs (
       company_id,
       outlet_id,
       user_id,
       action,
       result,
       success,
       ip_address,
       payload_json
     ) VALUES (?, ?, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [input.companyId, input.outletId, input.actor?.userId ?? null, input.action, JSON.stringify(input.payload)]
  );
}


