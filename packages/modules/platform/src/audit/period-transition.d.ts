import type { KyselySchema } from "@jurnapod/db";
import { AuditService } from "../audit-service";
export interface PeriodTransitionAuditLogger {
    logAction: AuditService["logAction"];
}
/**
 * Period transition action types
 */
export declare const PERIOD_TRANSITION_ACTION: {
    readonly OPEN: "PERIOD_OPEN";
    readonly ADJUST: "PERIOD_ADJUST";
    readonly CLOSE: "PERIOD_CLOSE";
    readonly REOPEN: "PERIOD_REOPEN";
};
export type PeriodTransitionAction = (typeof PERIOD_TRANSITION_ACTION)[keyof typeof PERIOD_TRANSITION_ACTION];
/**
 * Period status values
 */
export declare const PERIOD_STATUS: {
    readonly OPEN: "OPEN";
    readonly ADJUSTED: "ADJUSTED";
    readonly CLOSED: "CLOSED";
};
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
export declare class PeriodTransitionAuditService {
    private readonly db;
    private readonly auditService;
    constructor(db: KyselySchema, auditService: PeriodTransitionAuditLogger);
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
    logTransition(context: PeriodTransitionContext, fiscalYearId: number, periodNumber: number, action: PeriodTransitionAction, priorState: PeriodStatus, newState: PeriodStatus, metadata?: Record<string, unknown>): Promise<void>;
    /**
     * Query period transition audit logs with filters.
     *
     * @param query - Query filters
     * @returns Paginated results with total count
     */
    queryAudits(query: PeriodTransitionAuditQuery): Promise<{
        total: number;
        transitions: PeriodTransitionAuditRecord[];
    }>;
    /**
     * Get a single period transition audit record by ID.
     *
     * @param companyId - Company ID for tenant isolation
     * @param auditId - Audit log ID
     * @returns Period transition record or null if not found
     */
    getAuditById(companyId: number, auditId: number): Promise<PeriodTransitionAuditRecord | null>;
}
export {};
//# sourceMappingURL=period-transition.d.ts.map