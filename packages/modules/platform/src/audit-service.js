// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
import { sql } from "kysely";
import { AuditStatus } from "@jurnapod/shared";
import { isDeadlockError } from "@jurnapod/db";
/**
 * AuditService
 * Framework-agnostic service for audit logging
 *
 * Stores audit logs for all master data changes and important operations
 * according to AGENTS.md requirements.
 */
export class AuditService {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Log entity creation
     */
    async logCreate(context, entityType, entityId, payload) {
        return this.log({
            ...context,
            entity_type: entityType,
            entity_id: String(entityId),
            action: "CREATE",
            result: "SUCCESS",
            status: AuditStatus.SUCCESS,
            payload
        });
    }
    /**
     * Log entity update with before/after changes
     */
    async logUpdate(context, entityType, entityId, before, after) {
        // Only include fields that actually changed
        const changes = this.computeChanges(before, after);
        return this.log({
            ...context,
            entity_type: entityType,
            entity_id: String(entityId),
            action: "UPDATE",
            result: "SUCCESS",
            status: AuditStatus.SUCCESS,
            changes: {
                before: changes.before,
                after: changes.after
            }
        });
    }
    /**
     * Log entity deletion
     */
    async logDelete(context, entityType, entityId, payload) {
        return this.log({
            ...context,
            entity_type: entityType,
            entity_id: String(entityId),
            action: "DELETE",
            result: "SUCCESS",
            status: AuditStatus.SUCCESS,
            payload
        });
    }
    /**
     * Log entity deactivation (soft delete)
     */
    async logDeactivate(context, entityType, entityId, payload) {
        return this.log({
            ...context,
            entity_type: entityType,
            entity_id: String(entityId),
            action: "DEACTIVATE",
            result: "SUCCESS",
            status: AuditStatus.SUCCESS,
            payload: payload || {}
        });
    }
    /**
     * Log entity reactivation
     */
    async logReactivate(context, entityType, entityId, payload) {
        return this.log({
            ...context,
            entity_type: entityType,
            entity_id: String(entityId),
            action: "REACTIVATE",
            result: "SUCCESS",
            status: AuditStatus.SUCCESS,
            payload: payload || {}
        });
    }
    /**
     * Generic log method for custom actions
     */
    async logAction(context, entityType, entityId, action, payload, result = "SUCCESS", status = AuditStatus.SUCCESS) {
        return this.log({
            ...context,
            entity_type: entityType,
            entity_id: String(entityId),
            action,
            result,
            status,
            payload: payload || {}
        });
    }
    /**
     * Internal method to write audit log entry
     */
    async log(entry) {
        const inTransaction = this.db.isTransaction;
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                await sql `
          INSERT INTO audit_logs (
            company_id, outlet_id, user_id, entity_type, entity_id,
            action, result, success, status, ip_address, payload_json, changes_json, created_at
          )
          VALUES (
            ${entry.company_id},
            ${entry.outlet_id ?? null},
            ${entry.user_id},
            ${entry.entity_type},
            ${entry.entity_id},
            ${entry.action},
            ${entry.result},
            ${entry.result === "SUCCESS" ? 1 : 0},
            ${entry.status ?? (entry.result === "SUCCESS" ? AuditStatus.SUCCESS : AuditStatus.FAIL)},
            ${entry.ip_address ?? null},
            ${JSON.stringify(entry.payload || {})},
            ${entry.changes ? JSON.stringify(entry.changes) : null},
            NOW()
          )
        `.execute(this.db);
                return;
            }
            catch (error) {
                const shouldRetry = isDeadlockError(error) && attempt < maxAttempts;
                if (shouldRetry) {
                    await delay(25 * attempt);
                    continue;
                }
                if (inTransaction) {
                    throw error;
                }
                console.error("[AuditService] Failed to write audit log:", error);
                console.error("[AuditService] Entry details:", {
                    entity_type: entry.entity_type,
                    entity_id: entry.entity_id,
                    action: entry.action,
                    user_id: entry.user_id
                });
                return;
            }
        }
    }
    /**
     * Compute changed fields between before and after states
     * Returns only the fields that changed with their before/after values
     */
    computeChanges(before, after) {
        const changedBefore = {};
        const changedAfter = {};
        // Check all fields in 'after' object
        for (const key of Object.keys(after)) {
            // Skip if values are the same
            if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
                changedBefore[key] = before[key];
                changedAfter[key] = after[key];
            }
        }
        // Check for removed fields (present in before but not in after)
        for (const key of Object.keys(before)) {
            if (!(key in after)) {
                changedBefore[key] = before[key];
                changedAfter[key] = undefined;
            }
        }
        return {
            before: changedBefore,
            after: changedAfter
        };
    }
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=audit-service.js.map