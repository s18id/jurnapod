// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * SUPER_ADMIN Cross-Company Audit Logging
 * 
 * This module provides audit logging for SUPER_ADMIN users performing
 * cross-company write operations.
 * 
 * Policy: Only write operations (POST, PATCH, PUT, DELETE) are logged.
 * Read operations (GET) are not logged.
 * 
 * See: docs/SUPER_ADMIN_POLICY.md
 */

import { getDbPool } from "./db";

export type SuperAdminAuditAction =
  | "CREATE_COMPANY"
  | "UPDATE_COMPANY"
  | "DELETE_COMPANY"
  | "CREATE_OUTLET"
  | "UPDATE_OUTLET"
  | "DELETE_OUTLET"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "DELETE_USER"
  | "UPDATE_SETTING";

export type SuperAdminAuditParams = {
  userId: number;
  targetCompanyId: number;
  action: SuperAdminAuditAction;
  entityType: string;
  entityId: number | string | null;
  changes: Record<string, unknown>;
  outletId?: number | null;
  ipAddress?: string | null;
};

/**
 * Log a SUPER_ADMIN cross-company write operation to the audit trail.
 * 
 * This function should be called for all SUPER_ADMIN operations where:
 * - The operation is a write (POST, PATCH, PUT, DELETE)
 * - The target company_id differs from the user's company_id
 * 
 * @param params Audit log parameters
 * @returns Promise that resolves when the log is written
 * 
 * @example
 * ```typescript
 * if (access.isSuperAdmin && targetCompanyId !== auth.companyId) {
 *   await auditSuperAdminCrossCompanyWrite({
 *     userId: auth.userId,
 *     targetCompanyId,
 *     action: "UPDATE_COMPANY",
 *     entityType: "company",
 *     entityId: targetCompanyId,
 *     changes: input,
 *     ipAddress: clientIp
 *   });
 * }
 * ```
 */
export async function auditSuperAdminCrossCompanyWrite(
  params: SuperAdminAuditParams
): Promise<void> {
  const pool = getDbPool();

  try {
    const payloadJson = JSON.stringify({
      changes: params.changes,
      reason: "SUPER_ADMIN_CROSS_COMPANY_WRITE"
    });
    const changesJson = JSON.stringify(params.changes);

    await pool.execute(
      `INSERT INTO audit_logs (
        company_id,
        user_id,
        outlet_id,
        action,
        result,
        success,
        entity_type,
        entity_id,
        payload_json,
        changes_json,
        ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.targetCompanyId,
        params.userId,
        params.outletId ?? null,
        params.action,
        "SUCCESS",
        1,
        params.entityType,
        params.entityId != null ? String(params.entityId) : null,
        payloadJson,
        changesJson,
        params.ipAddress ?? null
      ]
    );
  } catch (error) {
    // Log but don't throw - audit logging failures should not block operations
    console.error("Failed to log SUPER_ADMIN cross-company audit trail", {
      error,
      userId: params.userId,
      targetCompanyId: params.targetCompanyId,
      action: params.action,
      entityType: params.entityType
    });
  }
}

/**
 * Check if an operation requires SUPER_ADMIN audit logging.
 * 
 * Returns true if:
 * - User has SUPER_ADMIN role
 * - Target company differs from user's company
 * 
 * @param isSuperAdmin Whether the user has SUPER_ADMIN role
 * @param userCompanyId Authenticated user's company_id
 * @param targetCompanyId Target company_id for the operation
 * @returns True if audit logging is required
 */
export function requiresSuperAdminAudit(
  isSuperAdmin: boolean,
  userCompanyId: number,
  targetCompanyId: number
): boolean {
  return isSuperAdmin && userCompanyId !== targetCompanyId;
}
