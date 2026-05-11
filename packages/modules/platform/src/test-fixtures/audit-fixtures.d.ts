import type { KyselySchema } from "@jurnapod/db";
import type { AuditEntityType } from "@jurnapod/shared";
/**
 * Fixture for audit_logs table (platform domain).
 *
 * Creates an audit log entry through the production AuditService.
 * Uses `logAction()` to support arbitrary action strings needed
 * by test callers (e.g., story-specific sentinel actions).
 */
export interface AuditLogFixture {
    id: number;
}
export interface CreateTestAuditLogOpts {
    companyId: number;
    userId: number;
    action: string;
    success: boolean;
    result?: string;
    payloadJson?: string;
    /** Entity type for the audit entry. Defaults to "setting". */
    entityType?: AuditEntityType;
    /** Affected entity ID. Defaults to 0. */
    entityId?: string | number;
    /** Outlet ID. Defaults to null. */
    outletId?: number | null;
}
export declare function createTestAuditLog(db: KyselySchema, opts: CreateTestAuditLogOpts): Promise<AuditLogFixture>;
//# sourceMappingURL=audit-fixtures.d.ts.map