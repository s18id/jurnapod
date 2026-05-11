import type { KyselySchema } from "@jurnapod/db";
type AuditDbClient = KyselySchema;
export type SuperAdminAuditAction = "CREATE_COMPANY" | "UPDATE_COMPANY" | "DELETE_COMPANY" | "CREATE_OUTLET" | "UPDATE_OUTLET" | "DELETE_OUTLET" | "CREATE_USER" | "UPDATE_USER" | "DELETE_USER" | "UPDATE_SETTING";
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
 * @param db Database client
 * @param params Audit log parameters
 * @returns Promise that resolves when the log is written
 *
 * @example
 * ```typescript
 * if (access.isSuperAdmin && targetCompanyId !== auth.companyId) {
 *   await auditSuperAdminCrossCompanyWrite(db, {
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
export declare function auditSuperAdminCrossCompanyWrite(db: AuditDbClient, params: SuperAdminAuditParams): Promise<void>;
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
export declare function requiresSuperAdminAudit(isSuperAdmin: boolean, userCompanyId: number, targetCompanyId: number): boolean;
export {};
//# sourceMappingURL=super-admin.d.ts.map