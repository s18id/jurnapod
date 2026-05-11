import type { AuditLogQuery, AuditLogResponse } from "@jurnapod/shared";
import type { KyselySchema } from "@jurnapod/db";
type AuditDbClient = KyselySchema;
type AuditLogRow = {
    id: number;
    company_id: number | null;
    outlet_id: number | null;
    user_id: number | null;
    entity_type: string | null;
    entity_id: string | null;
    action: string;
    result: "SUCCESS" | "FAIL";
    success: number;
    status: number;
    ip_address: string | null;
    payload_json: string;
    changes_json: string | null;
    created_at: string;
};
/**
 * Normalize audit log row to response format
 */
export declare function normalizeAuditLog(row: AuditLogRow): AuditLogResponse;
/**
 * Query audit logs with filters
 *
 * @param db Database client
 * @param query Query filters
 * @returns Paginated audit logs with total count
 */
export declare function queryAuditLogs(db: AuditDbClient, query: AuditLogQuery): Promise<{
    total: number;
    logs: AuditLogResponse[];
}>;
export {};
//# sourceMappingURL=query.d.ts.map