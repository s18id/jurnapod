// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
/**
 * Period Transition Audit Trail
 *
 * Records and queries period/fiscal year status transitions for compliance.
 * Uses the existing audit_logs table with period-transition-specific fields.
 */
import { sql } from "kysely";
import { toUtcIso } from "@jurnapod/shared";
/**
 * Period transition action types
 */
export const PERIOD_TRANSITION_ACTION = {
    OPEN: "PERIOD_OPEN",
    ADJUST: "PERIOD_ADJUST",
    CLOSE: "PERIOD_CLOSE",
    REOPEN: "PERIOD_REOPEN"
};
/**
 * Period status values
 */
export const PERIOD_STATUS = {
    OPEN: "OPEN",
    ADJUSTED: "ADJUSTED",
    CLOSED: "CLOSED"
};
/**
 * PeriodTransitionAuditService
 *
 * Service for recording and querying period/fiscal year status transitions.
 */
export class PeriodTransitionAuditService {
    db;
    auditService;
    constructor(db, auditService) {
        this.db = db;
        this.auditService = auditService;
    }
    /**
     * Log a period transition to the audit trail.
     *
     * @param context - Audit context (company, user, outlet, IP)
     * @param fiscalYearId - Fiscal year ID
     * @param periodNumber - Period number (1-12, or 0 for full year)
     * @param action - Transition action type
     * @param priorState - State before transition
     * @param newState - State after transition
     * @param metadata - Additional metadata (journal_entry_ids, notes, etc.)
     */
    async logTransition(context, fiscalYearId, periodNumber, action, priorState, newState, metadata = {}) {
        const payload = {
            fiscal_year_id: fiscalYearId,
            period_number: periodNumber,
            prior_state: priorState,
            new_state: newState,
            ...metadata
        };
        // Entity ID format: {fiscalYearId}-{periodNumber}
        // Note: "period_transition" is a valid entity type for audit logging even though
        // it's not in the limited AuditEntityType enum. Using type assertion since the
        // underlying logAction method accepts any string entity type at runtime.
        // Similarly, PeriodTransitionAction values are valid action strings at runtime.
        await this.auditService.logAction(context, "period_transition", `${fiscalYearId}-${periodNumber}`, action, payload);
    }
    /**
     * Query period transition audit logs with filters.
     *
     * @param query - Query filters
     * @returns Paginated results with total count
     */
    async queryAudits(query) {
        // Build conditions using Kysely sql template tag
        const conditions = [];
        // Always filter by company_id and entity_type for period transitions
        conditions.push(sql `company_id = ${query.company_id}`);
        conditions.push(sql `entity_type = 'period_transition'`);
        if (query.fiscal_year_id) {
            // Use portable JSON extraction for MySQL/MariaDB compatibility
            conditions.push(sql `JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.fiscal_year_id')) = ${String(query.fiscal_year_id)}`);
        }
        if (query.period_number !== undefined) {
            // Use portable JSON extraction for MySQL/MariaDB compatibility
            conditions.push(sql `JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.period_number')) = ${String(query.period_number)}`);
        }
        if (query.actor_user_id) {
            conditions.push(sql `user_id = ${query.actor_user_id}`);
        }
        if (query.action) {
            conditions.push(sql `action = ${query.action}`);
        }
        if (query.from_date) {
            conditions.push(sql `created_at >= ${query.from_date}`);
        }
        if (query.to_date) {
            conditions.push(sql `created_at <= ${query.to_date}`);
        }
        // Filter by success only (not result)
        conditions.push(sql `success = 1`);
        const whereClause = sql.join(conditions, sql ` AND `);
        // Get total count
        const countResult = await sql `
      SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}
    `.execute(this.db);
        const total = Number(countResult.rows[0]?.total ?? 0);
        // Get paginated results
        const limit = query.limit ?? 100;
        const offset = query.offset ?? 0;
        const rows = await sql `
      SELECT id, company_id, user_id, action, payload_json, created_at
      FROM audit_logs
      WHERE ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(this.db);
        const transitions = rows.rows.map((row) => {
            const payload = JSON.parse(row.payload_json);
            return {
                id: Number(row.id),
                company_id: Number(row.company_id),
                actor_user_id: Number(row.user_id),
                fiscal_year_id: payload.fiscal_year_id,
                period_number: payload.period_number,
                action: row.action,
                prior_state: payload.prior_state,
                new_state: payload.new_state,
                metadata: payload,
                created_at: toUtcIso.dateLike(row.created_at)
            };
        });
        return { total, transitions };
    }
    /**
     * Get a single period transition audit record by ID.
     *
     * @param companyId - Company ID for tenant isolation
     * @param auditId - Audit log ID
     * @returns Period transition record or null if not found
     */
    async getAuditById(companyId, auditId) {
        const row = await sql `
      SELECT id, company_id, user_id, action, payload_json, created_at
      FROM audit_logs
      WHERE id = ${auditId}
        AND company_id = ${companyId}
        AND entity_type = 'period_transition'
        AND success = 1
    `.execute(this.db);
        if (row.rows.length === 0) {
            return null;
        }
        const firstRow = row.rows[0];
        const payload = JSON.parse(firstRow.payload_json);
        return {
            id: Number(firstRow.id),
            company_id: Number(firstRow.company_id),
            actor_user_id: Number(firstRow.user_id),
            fiscal_year_id: payload.fiscal_year_id,
            period_number: payload.period_number,
            action: firstRow.action,
            prior_state: payload.prior_state,
            new_state: payload.new_state,
            metadata: payload,
            created_at: toUtcIso.dateLike(firstRow.created_at)
        };
    }
}
//# sourceMappingURL=period-transition.js.map