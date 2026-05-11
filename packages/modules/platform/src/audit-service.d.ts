import type { AuditAction, AuditEntityType, AuditResult, AuditStatusCode } from "@jurnapod/shared";
import { type KyselySchema } from "@jurnapod/db";
/**
 * Database client interface for audit logging
 * Should support Kysely queries and transactions
 */
export interface AuditDbClient extends KyselySchema {
}
/**
 * Context for audit operations
 */
export interface AuditContext {
    company_id: number;
    user_id: number;
    outlet_id?: number | null;
    ip_address?: string | null;
}
/**
 * AuditService
 * Framework-agnostic service for audit logging
 *
 * Stores audit logs for all master data changes and important operations
 * according to AGENTS.md requirements.
 */
export declare class AuditService {
    private readonly db;
    constructor(db: AuditDbClient);
    /**
     * Log entity creation
     */
    logCreate(context: AuditContext, entityType: AuditEntityType, entityId: string | number, payload: Record<string, any>): Promise<void>;
    /**
     * Log entity update with before/after changes
     */
    logUpdate(context: AuditContext, entityType: AuditEntityType, entityId: string | number, before: Record<string, any>, after: Record<string, any>): Promise<void>;
    /**
     * Log entity deletion
     */
    logDelete(context: AuditContext, entityType: AuditEntityType, entityId: string | number, payload: Record<string, any>): Promise<void>;
    /**
     * Log entity deactivation (soft delete)
     */
    logDeactivate(context: AuditContext, entityType: AuditEntityType, entityId: string | number, payload?: Record<string, any>): Promise<void>;
    /**
     * Log entity reactivation
     */
    logReactivate(context: AuditContext, entityType: AuditEntityType, entityId: string | number, payload?: Record<string, any>): Promise<void>;
    /**
     * Generic log method for custom actions
     */
    logAction(context: AuditContext, entityType: AuditEntityType, entityId: string | number, action: AuditAction, payload?: Record<string, any>, result?: AuditResult, status?: AuditStatusCode): Promise<void>;
    /**
     * Internal method to write audit log entry
     */
    private log;
    /**
     * Compute changed fields between before and after states
     * Returns only the fields that changed with their before/after values
     */
    private computeChanges;
}
//# sourceMappingURL=audit-service.d.ts.map