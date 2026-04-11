// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Period Close Workspace Service
 *
 * Composition layer that aggregates status from all Epic 32 components:
 * - Story 32.1: Fiscal year close procedure (FiscalYearService)
 * - Story 32.2: Reconciliation dashboard (ReconciliationDashboardService)
 * - Story 32.3: Trial balance validation (TrialBalanceService)
 * - Story 32.4: Period transition audit (PeriodTransitionAuditService)
 *
 * This is a stateless service that evaluates each checklist item live.
 */

export class FiscalYearNotFoundError extends Error {
  constructor(public readonly fiscalYearId: number, public readonly companyId: number) {
    super(`Fiscal year ${fiscalYearId} not found for company ${companyId}`);
    this.name = "FiscalYearNotFoundError";
  }
}

import type { KyselySchema } from "@jurnapod/db";
import { getDb } from "./db.js";
import {
  FiscalYearService,
  type FiscalYearStatusResult,
  type FiscalYearDbClient,
  type FiscalYearSettingsPort,
} from "@jurnapod/modules-accounting/fiscal-year";
import { ReconciliationDashboardService } from "@jurnapod/modules-accounting/reconciliation";
import { TrialBalanceService, type PreCloseCheckItem } from "@jurnapod/modules-accounting/trial-balance";
import { AuditService } from "@jurnapod/modules-platform";
import { PeriodTransitionAuditService, PERIOD_TRANSITION_ACTION } from "@jurnapod/modules-platform/audit/period-transition";
import { KyselySettingsAdapter } from "@jurnapod/modules-platform/settings";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Workspace status values
 */
export type PeriodCloseWorkspaceStatus = "OPEN" | "IN_PROGRESS" | "PENDING_APPROVAL" | "CLOSED";

/**
 * Checklist item status values
 */
export type ChecklistItemStatus = "pending" | "passed" | "failed" | "skipped";

/**
 * Individual checklist item in the workspace
 */
export interface ChecklistItem {
  id: string;
  label: string;
  status: ChecklistItemStatus;
  detail_url: string;
  error_message?: string;
}

/**
 * Period close workspace data structure
 */
export interface PeriodCloseWorkspace {
  fiscal_year_id: number;
  current_period: number;
  status: PeriodCloseWorkspaceStatus;
  checklist: ChecklistItem[];
  completed_steps: number;
  total_steps: number;
}

/**
 * Query parameters for workspace
 */
export interface PeriodCloseWorkspaceQuery {
  companyId: number;
  fiscalYearId: number;
}

// =============================================================================
// PERIOD CLOSE WORKSPACE SERVICE
// =============================================================================

export class PeriodCloseWorkspaceService {
  private readonly db: KyselySchema;
  private readonly fiscalYearService: FiscalYearService;
  private readonly reconciliationService: ReconciliationDashboardService;
  private readonly trialBalanceService: TrialBalanceService;
  private readonly auditService: PeriodTransitionAuditService;

  constructor(db?: KyselySchema) {
    this.db = db ?? getDb();
    
    // Create settings port for fiscal year service
    const settingsPort = this.createSettingsPort();
    
    // Create fiscal year service instance
    this.fiscalYearService = new FiscalYearService(
      this.db as FiscalYearDbClient,
      settingsPort
    );
    
    // Create other service instances
    this.reconciliationService = new ReconciliationDashboardService(this.db);
    this.trialBalanceService = new TrialBalanceService(this.db);
    const auditSvc = new AuditService(this.db);
    this.auditService = new PeriodTransitionAuditService(this.db, auditSvc);
  }

  /**
   * Create settings port implementation
   */
  private createSettingsPort(): FiscalYearSettingsPort {
    const adapter = new KyselySettingsAdapter(this.db);
    return {
      async resolveBoolean(
        companyId: number,
        key: string,
        options?: { outletId?: number }
      ): Promise<boolean> {
        const value = await adapter.resolve<boolean>(companyId, key as any, {
          outletId: options?.outletId
        });
        return Boolean(value);
      }
    };
  }

  /**
   * Get the period close workspace for a fiscal year.
   * Evaluates all checklist items live by calling upstream services.
   */
  async getWorkspace(query: PeriodCloseWorkspaceQuery): Promise<PeriodCloseWorkspace> {
    const { companyId, fiscalYearId } = query;

    // Get fiscal year info using package service
    const fiscalYear = await this.fiscalYearService.getFiscalYearById(companyId, fiscalYearId);
    if (!fiscalYear) {
      throw new FiscalYearNotFoundError(fiscalYearId, companyId);
    }

    // Determine current period number (1-12, or 0 for full year)
    const currentPeriod = 0; // Full year close for now

    // Determine workspace status based on fiscal year status
    const workspaceStatus = await this.mapFiscalYearStatusToWorkspace(
      companyId,
      fiscalYearId,
      fiscalYear.status
    );

    // Evaluate all checklist items
    const checklist: ChecklistItem[] = await Promise.all([
      this.checkReconciliation(companyId, fiscalYearId),
      this.checkTrialBalanceBalanced(companyId, fiscalYearId),
      this.checkNoGlImbalances(companyId, fiscalYearId),
      this.checkVarianceThreshold(companyId, fiscalYearId),
      this.checkAuditTrail(companyId, fiscalYearId),
      this.checkFiscalYearClose(companyId, fiscalYearId),
    ]);

    // Calculate completed steps
    const completedSteps = checklist.filter(
      (item) => item.status === "passed" || item.status === "skipped"
    ).length;

    return {
      fiscal_year_id: fiscalYearId,
      current_period: currentPeriod,
      status: workspaceStatus,
      checklist,
      completed_steps: completedSteps,
      total_steps: checklist.length,
    };
  }

  /**
   * Map fiscal year status to workspace status
   */
  private async mapFiscalYearStatusToWorkspace(
    companyId: number,
    fiscalYearId: number,
    fiscalYearStatus: string
  ): Promise<PeriodCloseWorkspaceStatus> {
    // If fiscal year is CLOSED, workspace is CLOSED
    if (fiscalYearStatus.toUpperCase() === "CLOSED") {
      return "CLOSED";
    }

    // Check for close request status to determine IN_PROGRESS or PENDING_APPROVAL
    const fyStatus: FiscalYearStatusResult = await this.fiscalYearService.getFiscalYearStatus(
      companyId,
      fiscalYearId
    );

    if (fyStatus.closeRequestStatus === "IN_PROGRESS") {
      return "IN_PROGRESS";
    }

    if (fyStatus.closeRequestStatus === "PENDING") {
      return "PENDING_APPROVAL";
    }

    return "OPEN";
  }

  /**
   * Check reconciliation status (Story 32.2)
   * - PASS: All key accounts reconciled
   * - FAIL: Variances detected
   * - SKIPPED: No accounts to reconcile
   */
  private async checkReconciliation(
    companyId: number,
    fiscalYearId: number
  ): Promise<ChecklistItem> {
    const itemId = "reconciliation";
    const detailUrl = `/admin/dashboards/reconciliation?fiscal_year_id=${fiscalYearId}`;

    try {
      const dashboard = await this.reconciliationService.getDashboard({
        companyId,
        fiscalYearId,
        includeDrilldown: false,
      });

      // Check if there are any unreconciled or variance accounts
      const hasUnreconciled = dashboard.summary.unreconciled > 0;
      const hasVariance = dashboard.summary.withVariance > 0;

      if (hasUnreconciled || hasVariance) {
        return {
          id: itemId,
          label: "GL vs Subledger variance",
          status: "failed",
          detail_url: detailUrl,
          error_message: `${dashboard.summary.withVariance} account(s) with variance, ${dashboard.summary.unreconciled} unreconciled`,
        };
      }

      return {
        id: itemId,
        label: "GL vs Subledger variance",
        status: "passed",
        detail_url: detailUrl,
      };
    } catch (error) {
      return {
        id: itemId,
        label: "GL vs Subledger variance",
        status: "failed",
        detail_url: detailUrl,
        error_message: error instanceof Error ? error.message : "Failed to check reconciliation",
      };
    }
  }

  /**
   * Check trial balance is balanced (Story 32.3)
   * - PASS: Total debits equals total credits
   * - FAIL: Trial balance is unbalanced
   */
  private async checkTrialBalanceBalanced(
    companyId: number,
    fiscalYearId: number
  ): Promise<ChecklistItem> {
    const itemId = "trial_balance";
    const detailUrl = `/admin/dashboards/trial-balance/validate?fiscal_year_id=${fiscalYearId}`;

    try {
      const validation = await this.trialBalanceService.runPreCloseValidation({
        companyId,
        fiscalYearId,
      });

      const tbCheck = validation.checks.find((c: PreCloseCheckItem) => c.id === "trial_balance_balanced");
      if (!tbCheck) {
        return {
          id: itemId,
          label: "Trial balance balanced",
          status: "failed",
          detail_url: detailUrl,
          error_message: "Trial balance check not found in validation results",
        };
      }

      if (tbCheck.status === "PASS") {
        return {
          id: itemId,
          label: "Trial balance balanced",
          status: "passed",
          detail_url: detailUrl,
        };
      }

      return {
        id: itemId,
        label: "Trial balance balanced",
        status: "failed",
        detail_url: detailUrl,
        error_message: tbCheck.detail ?? "Trial balance is unbalanced",
      };
    } catch (error) {
      return {
        id: itemId,
        label: "Trial balance balanced",
        status: "failed",
        detail_url: detailUrl,
        error_message: error instanceof Error ? error.message : "Failed to check trial balance",
      };
    }
  }

  /**
   * Check no GL imbalances exist (Story 32.3)
   * - PASS: All journal batches are balanced
   * - FAIL: Imbalanced batches detected
   */
  private async checkNoGlImbalances(
    companyId: number,
    fiscalYearId: number
  ): Promise<ChecklistItem> {
    const itemId = "gl_imbalance";
    const detailUrl = `/admin/dashboards/trial-balance/validate?fiscal_year_id=${fiscalYearId}`;

    try {
      const validation = await this.trialBalanceService.runPreCloseValidation({
        companyId,
        fiscalYearId,
      });

      const glCheck = validation.checks.find((c: PreCloseCheckItem) => c.id === "no_gl_imbalances");
      if (!glCheck) {
        return {
          id: itemId,
          label: "No GL imbalances",
          status: "failed",
          detail_url: detailUrl,
          error_message: "GL imbalance check not found in validation results",
        };
      }

      if (glCheck.status === "PASS") {
        return {
          id: itemId,
          label: "No GL imbalances",
          status: "passed",
          detail_url: detailUrl,
        };
      }

      return {
        id: itemId,
        label: "No GL imbalances",
        status: "failed",
        detail_url: detailUrl,
        error_message: glCheck.detail ?? "GL imbalances detected",
      };
    } catch (error) {
      return {
        id: itemId,
        label: "No GL imbalances",
        status: "failed",
        detail_url: detailUrl,
        error_message: error instanceof Error ? error.message : "Failed to check GL imbalances",
      };
    }
  }

  /**
   * Check all variances are under threshold (Story 32.3)
   * - PASS: All account variances within threshold
   * - FAIL: Critical variances detected
   */
  private async checkVarianceThreshold(
    companyId: number,
    fiscalYearId: number
  ): Promise<ChecklistItem> {
    const itemId = "variance_threshold";
    const detailUrl = `/admin/dashboards/trial-balance/validate?fiscal_year_id=${fiscalYearId}`;

    try {
      const validation = await this.trialBalanceService.runPreCloseValidation({
        companyId,
        fiscalYearId,
      });

      const varianceCheck = validation.checks.find((c: PreCloseCheckItem) => c.id === "variance_threshold");
      if (!varianceCheck) {
        return {
          id: itemId,
          label: "All variance under threshold",
          status: "failed",
          detail_url: detailUrl,
          error_message: "Variance threshold check not found in validation results",
        };
      }

      if (varianceCheck.status === "PASS" || varianceCheck.status === "WARNING") {
        return {
          id: itemId,
          label: "All variance under threshold",
          status: "passed",
          detail_url: detailUrl,
        };
      }

      return {
        id: itemId,
        label: "All variance under threshold",
        status: "failed",
        detail_url: detailUrl,
        error_message: varianceCheck.detail ?? "Variance threshold exceeded",
      };
    } catch (error) {
      return {
        id: itemId,
        label: "All variance under threshold",
        status: "failed",
        detail_url: detailUrl,
        error_message: error instanceof Error ? error.message : "Failed to check variance threshold",
      };
    }
  }

  /**
   * Check period transition audit trail is recorded (Story 32.4)
   * - PASS: Period transition audit exists for this fiscal year (already closed)
   * - PASS: Close request is IN_PROGRESS (audit will be created during close)
   * - FAIL: No audit trail and no active close request
   */
  private async checkAuditTrail(
    companyId: number,
    fiscalYearId: number
  ): Promise<ChecklistItem> {
    const itemId = "audit_trail";
    const detailUrl = `/audit/period-transitions?fiscal_year_id=${fiscalYearId}`;

    try {
      // First check if fiscal year is already closed
      const fiscalYear = await this.fiscalYearService.getFiscalYearById(companyId, fiscalYearId);
      const isAlreadyClosed = fiscalYear?.status?.toUpperCase() === "CLOSED";

      if (isAlreadyClosed) {
        // Fiscal year is already closed - check for CLOSE audit record
        const auditResult = await this.auditService.queryAudits({
          company_id: companyId,
          fiscal_year_id: fiscalYearId,
          limit: 1,
        });

        const closeAuditExists = auditResult.transitions.some(
          (t) => t.action === PERIOD_TRANSITION_ACTION.CLOSE
        );

        if (closeAuditExists) {
          return {
            id: itemId,
            label: "Period transition audit recorded",
            status: "passed",
            detail_url: detailUrl,
          };
        }

        // Closed but no audit record - this is an error state
        return {
          id: itemId,
          label: "Period transition audit recorded",
          status: "failed",
          detail_url: detailUrl,
          error_message: "Fiscal year is closed but no period transition audit found",
        };
      }

      // Not yet closed - check if close request is IN_PROGRESS
      const fyStatus = await this.fiscalYearService.getFiscalYearStatus(companyId, fiscalYearId);
      const hasInProgressCloseRequest = fyStatus.closeRequestStatus === "IN_PROGRESS";

      if (hasInProgressCloseRequest) {
        // Close is in progress - audit will be created at completion.
        // Keep this item pending until an actual CLOSE audit record exists.
        return {
          id: itemId,
          label: "Period transition audit recorded",
          status: "pending",
          detail_url: detailUrl,
        };
      }

      // No audit record and no active close request
      return {
        id: itemId,
        label: "Period transition audit recorded",
        status: "failed",
        detail_url: detailUrl,
        error_message: "No period transition audit records found and no close request in progress",
      };
    } catch (error) {
      return {
        id: itemId,
        label: "Period transition audit recorded",
        status: "failed",
        detail_url: detailUrl,
        error_message: error instanceof Error ? error.message : "Failed to check audit trail",
      };
    }
  }

  /**
   * Check fiscal year close is approved (Story 32.1)
   * - PASS: Fiscal year is closed or close request succeeded
   * - FAIL: Fiscal year not closed or close request pending/failed
   */
  private async checkFiscalYearClose(
    companyId: number,
    fiscalYearId: number
  ): Promise<ChecklistItem> {
    const itemId = "fiscal_year_close";
    const detailUrl = `/fiscal-years/${fiscalYearId}/status`;

    try {
      const fyStatus: FiscalYearStatusResult = await this.fiscalYearService.getFiscalYearStatus(
        companyId,
        fiscalYearId
      );

      // Check if fiscal year is already closed
      if (fyStatus.status === "CLOSED") {
        return {
          id: itemId,
          label: "Fiscal year close approved",
          status: "passed",
          detail_url: detailUrl,
        };
      }

      // Check if there's a successful close request
      if (
        fyStatus.closeRequestStatus === "SUCCEEDED" ||
        fyStatus.closeRequestStatus === "IN_PROGRESS"
      ) {
        return {
          id: itemId,
          label: "Fiscal year close approved",
          status: fyStatus.closeRequestStatus === "SUCCEEDED" ? "passed" : "pending",
          detail_url: detailUrl,
        };
      }

      // Fiscal year is open and no successful close request
      return {
        id: itemId,
        label: "Fiscal year close approved",
        status: "pending",
        detail_url: detailUrl,
      };
    } catch (error) {
      return {
        id: itemId,
        label: "Fiscal year close approved",
        status: "failed",
        detail_url: detailUrl,
        error_message: error instanceof Error ? error.message : "Failed to check fiscal year close status",
      };
    }
  }
}

/**
 * Get period close workspace (convenience function)
 */
export async function getPeriodCloseWorkspace(
  query: PeriodCloseWorkspaceQuery
): Promise<PeriodCloseWorkspace> {
  const service = new PeriodCloseWorkspaceService();
  return service.getWorkspace(query);
}
