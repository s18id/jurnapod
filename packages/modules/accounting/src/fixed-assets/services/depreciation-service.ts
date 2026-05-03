// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Depreciation Service for Fixed Assets
 *
 * Handles depreciation plan management and run execution.
 * Implements full parity to apps/api/src/lib/depreciation.ts.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { toUtcIso, fromUtcIso } from "@jurnapod/shared";
import type {
  DepreciationPlan,
  DepreciationPlanCreateInput,
  DepreciationPlanFilters,
  DepreciationPlanUpdateInput,
  DepreciationRun,
  DepreciationRunCreateInput,
  DepreciationRunFilters,
  DepreciationRunResult,
  DepreciationMethod,
} from "../interfaces/types.js";
import type { FixedAssetRepository } from "../repositories/index.js";
import type { FixedAssetPorts } from "../interfaces/fixed-asset-ports.js";
import type { DepreciationPlan as PostingDepreciationPlan, DepreciationRun as PostingDepreciationRun } from "../../posting/index.js";
import { postDepreciationRun } from "../../posting/index.js";
import {
  DepreciationPlanNotFoundError,
  DepreciationPlanStatusError,
  DepreciationPlanValidationError,
  DepreciationRunNotFoundError,
} from "../errors.js";
import { normalizeMoney } from "../../posting/common.js";

// =============================================================================
// Constants & Types
// =============================================================================

const MONEY_SCALE = 100;
const MYSQL_DUPLICATE_ERROR_CODE = 1062;

export type MutationAuditActor = {
  userId: number;
};

export interface DepreciationServiceOptions {
  repository: FixedAssetRepository;
  ports: FixedAssetPorts;
}

/**
 * Result of executing a depreciation run for a period
 */
export type PeriodRunResult = {
  runs: DepreciationRunResult[];
  processedCount: number;
  skippedCount: number;
};

// =============================================================================
// Helper Functions
// =============================================================================

function normalizeMoneyValue(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function formatDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return fromUtcIso.dateOnly(toUtcIso.dateLike(value) as string);
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getLastDayOfMonth(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  return fromUtcIso.dateOnly(toUtcIso.dateLike(date) as string);
}

function comparePeriodToStart(startDate: string, periodYear: number, periodMonth: number): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const startKey = start.getUTCFullYear() * 12 + start.getUTCMonth() + 1;
  const periodKey = periodYear * 12 + periodMonth;
  return periodKey - startKey;
}

function ensureValidPlanAmounts(cost: number, salvage: number): void {
  if (!Number.isFinite(cost) || cost < 0) {
    throw new DepreciationPlanValidationError("Invalid purchase cost");
  }
  if (!Number.isFinite(salvage) || salvage < 0) {
    throw new DepreciationPlanValidationError("Invalid salvage value");
  }
  if (salvage > cost) {
    throw new DepreciationPlanValidationError("Salvage value exceeds purchase cost");
  }
}

function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

// =============================================================================
// Normalization Helpers
// =============================================================================

function normalizePlan(row: Record<string, unknown>): DepreciationPlan {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    asset_id: Number(row.asset_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    method: row.method as DepreciationMethod,
    start_date: row.start_date instanceof Date ? row.start_date : new Date(row.start_date as string),
    useful_life_months: Number(row.useful_life_months),
    salvage_value: Number(row.salvage_value),
    purchase_cost_snapshot: Number(row.purchase_cost_snapshot),
    expense_account_id: Number(row.expense_account_id),
    accum_depr_account_id: Number(row.accum_depr_account_id),
    status: row.status as DepreciationPlan["status"],
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at as string),
    updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at as string),
  };
}

function normalizeRun(row: Record<string, unknown>): DepreciationRun {
  return {
    id: Number(row.id),
    plan_id: Number(row.plan_id),
    company_id: Number(row.company_id),
    run_date: row.run_date instanceof Date ? row.run_date : new Date(row.run_date as string),
    period_year: Number(row.period_year),
    period_month: Number(row.period_month),
    amount: Number(row.amount),
    journal_batch_id: row.journal_batch_id == null ? null : Number(row.journal_batch_id),
    status: row.status as DepreciationRun["status"],
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at as string),
    updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at as string),
  };
}

// =============================================================================
// DepreciationService
// =============================================================================

/**
 * DepreciationService provides business logic for asset depreciation.
 */
export class DepreciationService {
  private readonly repo: FixedAssetRepository;
  private readonly ports: FixedAssetPorts;

  constructor(options: DepreciationServiceOptions) {
    this.repo = options.repository;
    this.ports = options.ports;
  }

  /**
   * List depreciation plans.
   */
  async listPlans(
    companyId: number,
    filters?: DepreciationPlanFilters
  ): Promise<DepreciationPlan[]> {
    return this.repo.listDepreciationPlans(companyId, filters);
  }

  /**
   * Get a depreciation plan by ID.
   */
  async getPlanById(planId: number, companyId: number): Promise<DepreciationPlan | null> {
    const plan = await this.repo.findDepreciationPlanById(planId, companyId);
    if (!plan) return null;
    return normalizePlan(plan as unknown as Record<string, unknown>);
  }

  /**
   * Get the depreciation plan for a fixed asset.
   */
  async getPlanByAssetId(assetId: number, companyId: number): Promise<DepreciationPlan | null> {
    const plan = await this.repo.findDepreciationPlanByAssetId(assetId, companyId);
    if (!plan) return null;
    return normalizePlan(plan as unknown as Record<string, unknown>);
  }

  /**
   * Create a new depreciation plan.
   */
  async createDepreciationPlan(
    companyId: number,
    assetId: number,
    input: {
      outlet_id?: number | null;
      method: DepreciationMethod;
      start_date?: string;
      useful_life_months: number;
      salvage_value: number;
      purchase_cost_snapshot?: number;
      expense_account_id: number;
      accum_depr_account_id: number;
      status?: "DRAFT" | "ACTIVE" | "VOID";
    },
    actor?: MutationAuditActor
  ): Promise<DepreciationPlan> {
    // Validate asset exists
    const asset = await this.repo.findAssetById(assetId, companyId);
    if (!asset) {
      throw new DepreciationPlanValidationError("FixedAsset not found");
    }

    // Validate accounts exist
    await this.ensureAccountExists(companyId, input.expense_account_id);
    await this.ensureAccountExists(companyId, input.accum_depr_account_id);

    // Determine outlet
    const outletId =
      typeof input.outlet_id === "number"
        ? input.outlet_id
        : asset.outlet_id == null
          ? null
          : Number(asset.outlet_id);

    // Validate outlet access
    if (typeof outletId === "number" && actor) {
      const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
        actor.userId,
        companyId,
        outletId
      );
      if (!hasAccess) {
        throw new DepreciationPlanValidationError("User cannot access outlet");
      }
    }

    // Determine start date
    const startDateStr = input.start_date ?? (asset.purchase_date ? formatDateOnly(asset.purchase_date) : null);
    if (!startDateStr) {
      throw new DepreciationPlanValidationError("Start date is required");
    }

    // Determine purchase cost
    const purchaseCostSnapshot =
      typeof input.purchase_cost_snapshot === "number"
        ? input.purchase_cost_snapshot
        : asset.purchase_cost == null
          ? null
          : Number(asset.purchase_cost);
    if (purchaseCostSnapshot == null) {
      throw new DepreciationPlanValidationError("Purchase cost is required");
    }

    // Validate amounts
    ensureValidPlanAmounts(purchaseCostSnapshot, input.salvage_value);

    const status = input.status ?? "DRAFT";

    const createInput: DepreciationPlanCreateInput = {
      company_id: companyId,
      asset_id: assetId,
      outlet_id: outletId,
      method: input.method,
      useful_life_months: input.useful_life_months,
      start_date: parseDateOnly(startDateStr),
      salvage_value: input.salvage_value,
      purchase_cost_snapshot: purchaseCostSnapshot,
      expense_account_id: input.expense_account_id,
      accum_depr_account_id: input.accum_depr_account_id,
      status: status as DepreciationPlan["status"],
    };

    const created = await this.repo.createDepreciationPlan(createInput);
    return normalizePlan(created as unknown as Record<string, unknown>);
  }

  /**
   * Update a depreciation plan.
   */
  async updateDepreciationPlan(
    companyId: number,
    planId: number,
    input: DepreciationPlanUpdateInput,
    actor?: MutationAuditActor
  ): Promise<DepreciationPlan | null> {
    // Get current plan
    const current = await this.repo.findDepreciationPlanById(planId, companyId);
    if (!current) {
      return null;
    }

    const normalizedCurrent = normalizePlan(current as unknown as Record<string, unknown>);

    // Check outlet access
    if (actor && normalizedCurrent.outlet_id != null) {
      const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
        actor.userId,
        companyId,
        normalizedCurrent.outlet_id
      );
      if (!hasAccess) {
        throw new DepreciationPlanValidationError("User cannot access outlet");
      }
    }

    // Check if plan has posted runs - only status change to VOID is allowed
    const postedRuns = await this.repo.countPostedRuns(planId);
    const isOnlyStatusChange =
      postedRuns > 0 &&
      Object.keys(input).every((key) => key === "status") &&
      input.status === "VOID";

    if (postedRuns > 0 && !isOnlyStatusChange) {
      throw new DepreciationPlanStatusError("Plan has posted runs");
    }

    // Build update data
    const updateData: Partial<DepreciationPlan> = {};

    if (input.outlet_id !== undefined) {
      if (typeof input.outlet_id === "number") {
        await this.ensureOutletExists(companyId, input.outlet_id);
        if (actor) {
          await this.ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
        }
      }
      updateData.outlet_id = input.outlet_id;
    }

    if (input.method !== undefined) {
      updateData.method = input.method;
    }

    if (input.start_date !== undefined) {
      updateData.start_date = input.start_date instanceof Date ? input.start_date : new Date(input.start_date);
    }

    if (input.useful_life_months !== undefined) {
      updateData.useful_life_months = input.useful_life_months;
    }

    if (input.salvage_value !== undefined) {
      ensureValidPlanAmounts(normalizedCurrent.purchase_cost_snapshot, input.salvage_value);
      updateData.salvage_value = input.salvage_value;
    }

    if (input.expense_account_id !== undefined) {
      await this.ensureAccountExists(companyId, input.expense_account_id);
      updateData.expense_account_id = input.expense_account_id;
    }

    if (input.accum_depr_account_id !== undefined) {
      await this.ensureAccountExists(companyId, input.accum_depr_account_id);
      updateData.accum_depr_account_id = input.accum_depr_account_id;
    }

    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    if (Object.keys(updateData).length === 0) {
      return normalizedCurrent;
    }

    const updated = await this.repo.updateDepreciationPlan(planId, companyId, updateData);
    return normalizePlan(updated as unknown as Record<string, unknown>);
  }

  /**
   * List depreciation runs for a plan.
   */
  async listRuns(
    companyId: number,
    filters?: DepreciationRunFilters
  ): Promise<DepreciationRun[]> {
    const runs = await this.repo.listDepreciationRuns(companyId, filters);
    return runs.map((run) => normalizeRun(run as unknown as Record<string, unknown>));
  }

  /**
   * Execute depreciation run for a single plan (internal use).
   * Returns the run and whether it was a duplicate.
   */
  private async runDepreciationPlanForSingle(
    companyId: number,
    planId: number,
    periodYear: number,
    periodMonth: number,
    runDate?: string
  ): Promise<DepreciationRunResult> {
    // Get plan
    const planRecord = await this.repo.findDepreciationPlanById(planId, companyId);
    if (!planRecord) {
      throw new DepreciationPlanValidationError("Depreciation plan not found");
    }

    const plan = normalizePlan(planRecord as unknown as Record<string, unknown>);

    if (plan.status !== "ACTIVE") {
      throw new DepreciationPlanStatusError("Plan is not active");
    }

    // Validate period is within useful life
    const periodOffset = comparePeriodToStart(formatDateOnly(plan.start_date), periodYear, periodMonth);
    if (periodOffset < 0) {
      throw new DepreciationPlanValidationError("Run period is before plan start date");
    }
    if (periodOffset >= plan.useful_life_months) {
      throw new DepreciationPlanValidationError("Run period exceeds useful life");
    }

    // Get accumulated depreciation from posted runs
    const summary = await this.repo.getPostedRunSummary(planId);
    const accumulated = summary.totalAmount;

    const depreciableBase = plan.purchase_cost_snapshot - plan.salvage_value;
    ensureValidPlanAmounts(plan.purchase_cost_snapshot, plan.salvage_value);

    const remainingBase = plan.purchase_cost_snapshot - plan.salvage_value - accumulated;
    if (remainingBase <= 0) {
      throw new DepreciationPlanValidationError("Asset is fully depreciated");
    }

    // Calculate depreciation amount based on method
    let rawAmount = 0;
    switch (plan.method) {
      case "STRAIGHT_LINE":
        rawAmount = depreciableBase / plan.useful_life_months;
        break;
      case "DECLINING_BALANCE": {
        const bookValue = plan.purchase_cost_snapshot - accumulated;
        const monthlyRate = 2 / plan.useful_life_months;
        rawAmount = bookValue * monthlyRate;
        break;
      }
      case "SUM_OF_YEARS": {
        const totalPeriods = plan.useful_life_months;
        const remainingPeriods = totalPeriods - periodOffset;
        const sumOfYears = (totalPeriods * (totalPeriods + 1)) / 2;
        rawAmount = depreciableBase * (remainingPeriods / sumOfYears);
        break;
      }
      default:
        throw new DepreciationPlanValidationError("Unsupported depreciation method");
    }

    const amount = normalizeMoneyValue(Math.min(rawAmount, remainingBase));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new DepreciationPlanValidationError("Depreciation amount is invalid for period");
    }

    const finalRunDate = runDate ?? getLastDayOfMonth(periodYear, periodMonth);

    // Create the depreciation run
    try {
      const createInput: DepreciationRunCreateInput = {
        plan_id: planId,
        company_id: companyId,
        run_date: parseDateOnly(finalRunDate),
        period_year: periodYear,
        period_month: periodMonth,
        amount: amount,
        journal_batch_id: null,
        status: "POSTED",
      };

      const created = await this.repo.createDepreciationRun(createInput);
      const run = normalizeRun(created as unknown as Record<string, unknown>);

      // Post to journal
      const postingPlan: PostingDepreciationPlan = {
        id: plan.id,
        company_id: plan.company_id,
        outlet_id: plan.outlet_id,
        expense_account_id: plan.expense_account_id,
        accum_depr_account_id: plan.accum_depr_account_id,
      };

      const postingRun: PostingDepreciationRun = {
        id: run.id,
        company_id: run.company_id,
        plan_id: run.plan_id,
        run_date: formatDateOnly(run.run_date),
        period_year: run.period_year,
        period_month: run.period_month,
        amount: run.amount,
        updated_at: toUtcIso.dateLike(run.updated_at) as string,
      };

      // Execute the posting with fiscal year guard
      const postingResult = await postDepreciationRun(
        this.repo["db"] as KyselySchema,
        {
          ensureDateWithinOpenFiscalYear: (db, companyId, date) =>
            this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, date),
        },
        postingPlan,
        postingRun
      );

      // Update run with journal batch ID
      const updated = await this.repo.updateDepreciationRunStatus(
        run.id,
        companyId,
        "POSTED",
        Number(postingResult.journal_batch_id)
      );

      return { run: normalizeRun(updated as unknown as Record<string, unknown>), duplicate: false };
    } catch (error) {
      if (isMysqlError(error) && error.errno === MYSQL_DUPLICATE_ERROR_CODE) {
        // Duplicate - find existing run
        const existing = await this.repo.findDepreciationRunByPeriod(planId, companyId, periodYear, periodMonth);
        if (!existing) {
          throw new Error("Duplicate depreciation run not found");
        }
        return { run: normalizeRun(existing as unknown as Record<string, unknown>), duplicate: true };
      }
      throw error;
    }
  }

  /**
   * Execute depreciation run for a period (batch - processes all active plans).
   */
  async executeDepreciationRun(
    companyId: number,
    periodKey: string, // Format: "YYYY-MM"
    actor?: MutationAuditActor
  ): Promise<PeriodRunResult> {
    const [yearStr, monthStr] = periodKey.split("-");
    const periodYear = parseInt(yearStr, 10);
    const periodMonth = parseInt(monthStr, 10);

    if (!Number.isFinite(periodYear) || !Number.isFinite(periodMonth)) {
      throw new DepreciationPlanValidationError("Invalid period key format");
    }

    // Get all active plans for the company
    const activePlans = await this.repo.listActiveDepreciationPlans(companyId);

    const runs: DepreciationRunResult[] = [];
    let processedCount = 0;
    let skippedCount = 0;

    for (const planRecord of activePlans) {
      const plan = normalizePlan(planRecord as unknown as Record<string, unknown>);

      try {
        // Check if user has access to the plan's outlet
        if (actor && plan.outlet_id != null) {
          const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
            actor.userId,
            companyId,
            plan.outlet_id
          );
          if (!hasAccess) {
            skippedCount++;
            continue;
          }
        }

        const result = await this.runDepreciationPlanForSingle(
          companyId,
          plan.id,
          periodYear,
          periodMonth
        );

        runs.push(result);
        processedCount++;
      } catch (error) {
        // If it's a duplicate or already processed, skip
        if (error instanceof Error && error.message.includes("Duplicate")) {
          skippedCount++;
          continue;
        }
        // For other errors, we continue processing other plans but don't increment processedCount
        // The error is logged but we continue
        console.error(`Error processing plan ${plan.id}:`, error);
        skippedCount++;
      }
    }

    return { runs, processedCount, skippedCount };
  }

  /**
   * Void a depreciation run.
   */
  async voidRun(runId: number, companyId: number): Promise<DepreciationRun> {
    const run = await this.repo.findDepreciationRunById(runId, companyId);
    if (!run) {
      throw new DepreciationRunNotFoundError();
    }

    const updated = await this.repo.updateDepreciationRunStatus(runId, companyId, "VOID");
    return normalizeRun(updated as unknown as Record<string, unknown>);
  }

  // -------------------------------------------------------------------------
  // Internal Validation Helpers
  // -------------------------------------------------------------------------

  private async ensureAccountExists(companyId: number, accountId: number): Promise<void> {
    const result = await sql`
      SELECT 1 FROM accounts WHERE id = ${accountId} AND company_id = ${companyId} LIMIT 1
    `.execute(this.repo["db"] as KyselySchema);

    if (!result.rows.length) {
      throw new DepreciationPlanValidationError("Account not found for company");
    }
  }

  private async ensureOutletExists(companyId: number, outletId: number): Promise<void> {
    const result = await sql`
      SELECT 1 FROM outlets WHERE id = ${outletId} AND company_id = ${companyId} LIMIT 1
    `.execute(this.repo["db"] as KyselySchema);

    if (!result.rows.length) {
      throw new DepreciationPlanValidationError("Outlet not found for company");
    }
  }

  private async ensureUserHasOutletAccess(userId: number, companyId: number, outletId: number): Promise<void> {
    const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(userId, companyId, outletId);
    if (!hasAccess) {
      throw new DepreciationPlanValidationError("User cannot access outlet");
    }
  }
}
