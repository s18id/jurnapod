// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Period Transition Audit Trail
 * 
 * Records and queries period/fiscal year status transitions for compliance.
 * Uses the existing audit_logs table with period-transition-specific fields.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { AuditService } from "../audit-service";
import { toRfc3339Required, type AuditEntityType, type AuditAction } from "@jurnapod/shared";

export interface PeriodTransitionAuditLogger {
  logAction: AuditService["logAction"];
}

/**
 * Period transition action types
 */
export const PERIOD_TRANSITION_ACTION = {
  OPEN: "PERIOD_OPEN",
  ADJUST: "PERIOD_ADJUST",
  CLOSE: "PERIOD_CLOSE",
  REOPEN: "PERIOD_REOPEN"
} as const;

export type PeriodTransitionAction = (typeof PERIOD_TRANSITION_ACTION)[keyof typeof PERIOD_TRANSITION_ACTION];

/**
 * Period status values
 */
export const PERIOD_STATUS = {
  OPEN: "OPEN",
  ADJUSTED: "ADJUSTED",
  CLOSED: "CLOSED"
} as const;

export type PeriodStatus = (typeof PERIOD_STATUS)[keyof typeof PERIOD_STATUS];

/**
 * Period transition audit log record
 */
export interface PeriodTransitionAuditRecord {
  id: number;
  company_id: number;
  actor_user_id: number;
  fiscal_year_id: number;
  period_number: number;
  action: PeriodTransitionAction;
  prior_state: PeriodStatus;
  new_state: PeriodStatus;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Query filters for period transition audit logs
 */
export interface PeriodTransitionAuditQuery {
  company_id: number;
  fiscal_year_id?: number;
  period_number?: number;
  actor_user_id?: number;
  action?: PeriodTransitionAction;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

/**
 * Context for logging period transitions
 */
interface PeriodTransitionContext {
  company_id: number;
  user_id: number;
  outlet_id?: number | null;
  ip_address?: string | null;
}

/**
 * PeriodTransitionAuditService
 * 
 * Service for recording and querying period/fiscal year status transitions.
 */
export class PeriodTransitionAuditService {
  constructor(private readonly db: KyselySchema, private readonly auditService: PeriodTransitionAuditLogger) {}

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
  async logTransition(
    context: PeriodTransitionContext,
    fiscalYearId: number,
    periodNumber: number,
    action: PeriodTransitionAction,
    priorState: PeriodStatus,
    newState: PeriodStatus,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
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
    await this.auditService.logAction(
      context,
      "period_transition" as AuditEntityType,
      `${fiscalYearId}-${periodNumber}`,
      action as AuditAction,
      payload
    );
  }

  /**
   * Query period transition audit logs with filters.
   * 
   * @param query - Query filters
   * @returns Paginated results with total count
   */
  async queryAudits(
    query: PeriodTransitionAuditQuery
  ): Promise<{ total: number; transitions: PeriodTransitionAuditRecord[] }> {
    // Build conditions using Kysely sql template tag
    const conditions: ReturnType<typeof sql>[] = [];
    
    // Always filter by company_id and entity_type for period transitions
    conditions.push(sql`company_id = ${query.company_id}`);
    conditions.push(sql`entity_type = 'period_transition'`);

    if (query.fiscal_year_id) {
      // Use portable JSON extraction for MySQL/MariaDB compatibility
      conditions.push(sql`JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.fiscal_year_id')) = ${String(query.fiscal_year_id)}`);
    }

    if (query.period_number !== undefined) {
      // Use portable JSON extraction for MySQL/MariaDB compatibility
      conditions.push(sql`JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.period_number')) = ${String(query.period_number)}`);
    }

    if (query.actor_user_id) {
      conditions.push(sql`user_id = ${query.actor_user_id}`);
    }

    if (query.action) {
      conditions.push(sql`action = ${query.action}`);
    }

    if (query.from_date) {
      conditions.push(sql`created_at >= ${query.from_date}`);
    }

    if (query.to_date) {
      conditions.push(sql`created_at <= ${query.to_date}`);
    }

    // Filter by success only (not result)
    conditions.push(sql`success = 1`);

    const whereClause = sql.join(conditions, sql` AND `);

    // Get total count
    const countResult = await sql<{ total: string }>`
      SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}
    `.execute(this.db);
    const total = Number(countResult.rows[0]?.total ?? 0);

    // Get paginated results
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const rows = await sql<{
      id: number;
      company_id: number;
      user_id: number;
      action: string;
      payload_json: string;
      created_at: string;
    }>`
      SELECT id, company_id, user_id, action, payload_json, created_at
      FROM audit_logs
      WHERE ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(this.db);

    const transitions: PeriodTransitionAuditRecord[] = rows.rows.map((row) => {
      const payload = JSON.parse(row.payload_json);
      return {
        id: Number(row.id),
        company_id: Number(row.company_id),
        actor_user_id: Number(row.user_id),
        fiscal_year_id: payload.fiscal_year_id as number,
        period_number: payload.period_number as number,
        action: row.action as PeriodTransitionAction,
        prior_state: payload.prior_state as PeriodStatus,
        new_state: payload.new_state as PeriodStatus,
        metadata: payload,
        created_at: toRfc3339Required(row.created_at)
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
  async getAuditById(
    companyId: number,
    auditId: number
  ): Promise<PeriodTransitionAuditRecord | null> {
    const row = await sql<{
      id: number;
      company_id: number;
      user_id: number;
      action: string;
      payload_json: string;
      created_at: string;
    }>`
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
      fiscal_year_id: payload.fiscal_year_id as number,
      period_number: payload.period_number as number,
      action: firstRow.action as PeriodTransitionAction,
      prior_state: payload.prior_state as PeriodStatus,
      new_state: payload.new_state as PeriodStatus,
      metadata: payload,
      created_at: toRfc3339Required(firstRow.created_at)
    };
  }
}
