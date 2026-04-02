// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Thin adapter - core implementation moved to @jurnapod/modules-platform

// Re-export types from platform module
export type { SuperAdminAuditAction, SuperAdminAuditParams } from "@jurnapod/modules-platform/audit";

// Import the platform implementation
import { 
  auditSuperAdminCrossCompanyWrite as platformAuditSuperAdminCrossCompanyWrite,
  type SuperAdminAuditParams 
} from "@jurnapod/modules-platform/audit";
import { getDb } from "./db";

/**
 * Log a SUPER_ADMIN cross-company write operation to the audit trail.
 * 
 * This is a thin adapter that delegates to @jurnapod/modules-platform
 */
export async function auditSuperAdminCrossCompanyWrite(
  params: SuperAdminAuditParams
): Promise<void> {
  const db = getDb();
  return platformAuditSuperAdminCrossCompanyWrite(db, params);
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
