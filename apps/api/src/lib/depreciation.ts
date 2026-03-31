// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { getDb, type KyselySchema } from "./db";
import { postDepreciationRunToJournal } from "./depreciation-posting";
import { toRfc3339Required } from "@jurnapod/shared";

type MutationActor = {
  userId: number;
};

export type DepreciationPlan = {
  id: number;
  company_id: number;
  asset_id: number;
  outlet_id: number | null;
  method: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
  start_date: string;
  useful_life_months: number;
  salvage_value: number;
  purchase_cost_snapshot: number;
  expense_account_id: number;
  accum_depr_account_id: number;
  status: "DRAFT" | "ACTIVE" | "VOID";
  created_at: string;
  updated_at: string;
};

export type DepreciationRun = {
  id: number;
  company_id: number;
  plan_id: number;
  period_year: number;
  period_month: number;
  run_date: string;
  amount: number;
  journal_batch_id: number | null;
  status: "POSTED" | "VOID";
  created_at: string;
  updated_at: string;
};

export class DatabaseConflictError extends Error {}
export class DatabaseReferenceError extends Error {}
export class DatabaseForbiddenError extends Error {}
export class DepreciationPlanStatusError extends Error {}
export class DepreciationPlanValidationError extends Error {}

const mysqlDuplicateErrorCode = 1062;
const MONEY_SCALE = 100;

function normalizeMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function formatDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getLastDayOfMonth(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
}

function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

async function ensureCompanyOutletExists(
  db: KyselySchema,
  companyId: number,
  outletId: number
): Promise<void> {
  const row = await db
    .selectFrom("outlets")
    .where("id", "=", outletId)
    .where("company_id", "=", companyId)
    .limit(1)
    .select("id")
    .executeTakeFirst();

  if (!row) {
    throw new DatabaseReferenceError("Outlet not found for company");
  }
}

async function ensureUserHasOutletAccess(
  db: KyselySchema,
  userId: number,
  companyId: number,
  outletId: number
): Promise<void> {
  const row = await sql`
    SELECT 1
    FROM users u
    WHERE u.id = ${userId}
      AND u.company_id = ${companyId}
      AND u.is_active = 1
      AND (
        EXISTS (
          SELECT 1
          FROM user_role_assignments ura
          INNER JOIN roles r ON r.id = ura.role_id
          WHERE ura.user_id = u.id
            AND r.is_global = 1
            AND ura.outlet_id IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM user_role_assignments ura
          WHERE ura.user_id = u.id
            AND ura.outlet_id = ${outletId}
        )
      )
    LIMIT 1
  `.execute(db);

  if (!row.rows.length) {
    throw new DatabaseForbiddenError("User cannot access outlet");
  }
}

async function ensureCompanyAccountExists(
  db: KyselySchema,
  companyId: number,
  accountId: number
): Promise<void> {
  const row = await db
    .selectFrom("accounts")
    .where("id", "=", accountId)
    .where("company_id", "=", companyId)
    .limit(1)
    .select("id")
    .executeTakeFirst();

  if (!row) {
    throw new DatabaseReferenceError("Account not found for company");
  }
}

async function findFixedAssetWithExecutor(
  db: KyselySchema,
  companyId: number,
  assetId: number
): Promise<{
  id: number;
  company_id: number;
  outlet_id: number | null;
  purchase_date: Date | string | null;
  purchase_cost: string | number | null;
} | null> {
  const row = await db
    .selectFrom("fixed_assets")
    .where("company_id", "=", companyId)
    .where("id", "=", assetId)
    .limit(1)
    .select(["id", "company_id", "outlet_id", "purchase_date", "purchase_cost"])
    .executeTakeFirst();

  return row ?? null;
}

function normalizePlan(row: {
  id: number;
  company_id: number;
  asset_id: number;
  outlet_id: number | null;
  method: string;
  start_date: string | Date;
  useful_life_months: number;
  salvage_value: string | number;
  purchase_cost_snapshot: string | number;
  expense_account_id: number;
  accum_depr_account_id: number;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
}): DepreciationPlan {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    asset_id: Number(row.asset_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    method: row.method as DepreciationPlan["method"],
    start_date: formatDateOnly(row.start_date),
    useful_life_months: Number(row.useful_life_months),
    salvage_value: Number(row.salvage_value),
    purchase_cost_snapshot: Number(row.purchase_cost_snapshot),
    expense_account_id: Number(row.expense_account_id),
    accum_depr_account_id: Number(row.accum_depr_account_id),
    status: row.status as DepreciationPlan["status"],
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

function normalizeRun(row: {
  id: number;
  company_id: number;
  plan_id: number;
  period_year: number;
  period_month: number;
  run_date: string | Date;
  amount: string | number;
  journal_batch_id: number | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
}): DepreciationRun {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    plan_id: Number(row.plan_id),
    period_year: Number(row.period_year),
    period_month: Number(row.period_month),
    run_date: formatDateOnly(row.run_date),
    amount: Number(row.amount),
    journal_batch_id: row.journal_batch_id == null ? null : Number(row.journal_batch_id),
    status: row.status as DepreciationRun["status"],
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

async function findPlanByIdWithExecutor(
  db: KyselySchema,
  companyId: number,
  planId: number,
  options?: { forUpdate?: boolean }
): Promise<DepreciationPlan | null> {
  // Note: FOR UPDATE is handled by the transaction, no need for explicit clause
  const row = await db
    .selectFrom("asset_depreciation_plans")
    .where("company_id", "=", companyId)
    .where("id", "=", planId)
    .limit(1)
    .select([
      "id", "company_id", "asset_id", "outlet_id", "method", "start_date",
      "useful_life_months", "salvage_value", "purchase_cost_snapshot",
      "expense_account_id", "accum_depr_account_id", "status", "created_at", "updated_at"
    ])
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return normalizePlan(row);
}

async function findLatestPlanByFixedAssetWithExecutor(
  db: KyselySchema,
  companyId: number,
  assetId: number,
  options?: { includeVoid?: boolean }
): Promise<DepreciationPlan | null> {
  let query = db
    .selectFrom("asset_depreciation_plans")
    .where("company_id", "=", companyId)
    .where("asset_id", "=", assetId)
    .orderBy("id", "desc")
    .limit(1)
    .select([
      "id", "company_id", "asset_id", "outlet_id", "method", "start_date",
      "useful_life_months", "salvage_value", "purchase_cost_snapshot",
      "expense_account_id", "accum_depr_account_id", "status", "created_at", "updated_at"
    ]);

  if (!options?.includeVoid) {
    query = query.where("status", "!=", "VOID");
  }

  const row = await query.executeTakeFirst();
  if (!row) {
    return null;
  }

  return normalizePlan(row);
}

async function countPostedRunsWithExecutor(
  db: KyselySchema,
  planId: number
): Promise<number> {
  const row = await db
    .selectFrom("asset_depreciation_runs")
    .where("plan_id", "=", planId)
    .where("status", "=", "POSTED")
    .select((eb) => eb.fn.countAll().as("total"))
    .executeTakeFirst();

  return Number(row?.total ?? 0);
}

async function getPostedRunSummaryWithExecutor(
  db: KyselySchema,
  planId: number
): Promise<{ totalCount: number; totalAmount: number }> {
  const result = await sql<{ total_count: number; total_amount: number }>`
    SELECT 
      COUNT(*) AS total_count,
      COALESCE(SUM(amount), 0) AS total_amount
    FROM asset_depreciation_runs
    WHERE plan_id = ${planId}
      AND status = 'POSTED'
  `.execute(db);

  const row = result.rows[0];
  return {
    totalCount: Number(row?.total_count ?? 0),
    totalAmount: Number(row?.total_amount ?? 0)
  };
}

async function findRunByPlanPeriodWithExecutor(
  db: KyselySchema,
  companyId: number,
  planId: number,
  periodYear: number,
  periodMonth: number
): Promise<DepreciationRun | null> {
  const row = await db
    .selectFrom("asset_depreciation_runs")
    .where("company_id", "=", companyId)
    .where("plan_id", "=", planId)
    .where("period_year", "=", periodYear)
    .where("period_month", "=", periodMonth)
    .limit(1)
    .select([
      "id", "company_id", "plan_id", "period_year", "period_month", "run_date",
      "amount", "journal_batch_id", "status", "created_at", "updated_at"
    ])
    .executeTakeFirst();

  return row ? normalizeRun(row) : null;
}

function ensureValidPlanAmounts(cost: number, salvage: number) {
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

function comparePeriodToStart(startDate: string, periodYear: number, periodMonth: number): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const startKey = start.getUTCFullYear() * 12 + start.getUTCMonth() + 1;
  const periodKey = periodYear * 12 + periodMonth;
  return periodKey - startKey;
}

export async function getLatestDepreciationPlan(companyId: number, assetId: number) {
  const db = getDb();
  return findLatestPlanByFixedAssetWithExecutor(db, companyId, assetId);
}

export async function createDepreciationPlan(
  companyId: number,
  input: {
    asset_id: number;
    outlet_id?: number;
    method: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
    start_date?: string;
    useful_life_months: number;
    salvage_value: number;
    purchase_cost_snapshot?: number;
    expense_account_id: number;
    accum_depr_account_id: number;
    status?: "DRAFT" | "ACTIVE" | "VOID";
  },
  actor?: MutationActor
): Promise<DepreciationPlan> {
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    const fixed_assets = await findFixedAssetWithExecutor(trx, companyId, input.asset_id);
    if (!fixed_assets) {
      throw new DatabaseReferenceError("FixedAsset not found");
    }

    await ensureCompanyAccountExists(trx, companyId, input.expense_account_id);
    await ensureCompanyAccountExists(trx, companyId, input.accum_depr_account_id);

    const outletId =
      typeof input.outlet_id === "number"
        ? input.outlet_id
        : fixed_assets.outlet_id == null
          ? null
          : Number(fixed_assets.outlet_id);

    if (typeof outletId === "number") {
      await ensureCompanyOutletExists(trx, companyId, outletId);
      if (actor) {
        await ensureUserHasOutletAccess(trx, actor.userId, companyId, outletId);
      }
    }

    const startDate = input.start_date ?? (fixed_assets.purchase_date ? formatDateOnly(fixed_assets.purchase_date) : null);
    if (!startDate) {
      throw new DepreciationPlanValidationError("Start date is required");
    }

    const purchaseCostSnapshot =
      typeof input.purchase_cost_snapshot === "number"
        ? input.purchase_cost_snapshot
        : fixed_assets.purchase_cost == null
          ? null
          : Number(fixed_assets.purchase_cost);
    if (purchaseCostSnapshot == null) {
      throw new DepreciationPlanValidationError("Purchase cost is required");
    }

    ensureValidPlanAmounts(purchaseCostSnapshot, input.salvage_value);

    const status = input.status ?? "DRAFT";

    const result = await trx
      .insertInto("asset_depreciation_plans")
      .values({
        company_id: companyId,
        asset_id: input.asset_id,
        outlet_id: outletId,
        method: input.method,
        start_date: parseDateOnly(startDate),
        useful_life_months: input.useful_life_months,
        salvage_value: input.salvage_value,
        purchase_cost_snapshot: purchaseCostSnapshot,
        expense_account_id: input.expense_account_id,
        accum_depr_account_id: input.accum_depr_account_id,
        status: status
      })
      .executeTakeFirst();

    const planId = Number(result.insertId);
    const plan = await findPlanByIdWithExecutor(trx, companyId, planId);
    if (!plan) {
      throw new Error("Created depreciation plan not found");
    }

    return plan;
  });
}

export async function updateDepreciationPlan(
  companyId: number,
  planId: number,
  input: {
    outlet_id?: number;
    method?: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
    start_date?: string;
    useful_life_months?: number;
    salvage_value?: number;
    expense_account_id?: number;
    accum_depr_account_id?: number;
    status?: "DRAFT" | "ACTIVE" | "VOID";
  },
  actor?: MutationActor
): Promise<DepreciationPlan | null> {
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    const current = await findPlanByIdWithExecutor(trx, companyId, planId, {
      forUpdate: true
    });
    if (!current) {
      return null;
    }

    if (actor && current.outlet_id != null) {
      await ensureUserHasOutletAccess(trx, actor.userId, companyId, current.outlet_id);
    }

    const postedRuns = await countPostedRunsWithExecutor(trx, planId);
    const isOnlyStatusChange =
      postedRuns > 0 &&
      Object.keys(input).every((key) => key === "status") &&
      input.status === "VOID";

    if (postedRuns > 0 && !isOnlyStatusChange) {
      throw new DepreciationPlanStatusError("Plan has posted runs");
    }

    const updateData: Record<string, unknown> = {};

    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(trx, companyId, input.outlet_id);
      if (actor) {
        await ensureUserHasOutletAccess(trx, actor.userId, companyId, input.outlet_id);
      }
      updateData.outlet_id = input.outlet_id;
    }

    if (typeof input.method === "string") {
      updateData.method = input.method;
    }

    if (typeof input.start_date === "string") {
      updateData.start_date = parseDateOnly(input.start_date);
    }

    if (typeof input.useful_life_months === "number") {
      updateData.useful_life_months = input.useful_life_months;
    }

    if (typeof input.salvage_value === "number") {
      ensureValidPlanAmounts(current.purchase_cost_snapshot, input.salvage_value);
      updateData.salvage_value = input.salvage_value;
    }

    if (typeof input.expense_account_id === "number") {
      await ensureCompanyAccountExists(trx, companyId, input.expense_account_id);
      updateData.expense_account_id = input.expense_account_id;
    }

    if (typeof input.accum_depr_account_id === "number") {
      await ensureCompanyAccountExists(trx, companyId, input.accum_depr_account_id);
      updateData.accum_depr_account_id = input.accum_depr_account_id;
    }

    if (typeof input.status === "string") {
      updateData.status = input.status;
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    await trx
      .updateTable("asset_depreciation_plans")
      .set(updateData)
      .where("company_id", "=", companyId)
      .where("id", "=", planId)
      .execute();

    return findPlanByIdWithExecutor(trx, companyId, planId);
  });
}

export async function runDepreciationPlan(
  companyId: number,
  input: {
    plan_id: number;
    period_year: number;
    period_month: number;
    run_date?: string;
  },
  actor?: MutationActor
): Promise<{ run: DepreciationRun; duplicate: boolean }> {
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    const plan = await findPlanByIdWithExecutor(trx, companyId, input.plan_id, {
      forUpdate: true
    });
    if (!plan) {
      throw new DatabaseReferenceError("Depreciation plan not found");
    }

    if (plan.status !== "ACTIVE") {
      throw new DepreciationPlanStatusError("Plan is not active");
    }

    if (actor && plan.outlet_id != null) {
      await ensureUserHasOutletAccess(trx, actor.userId, companyId, plan.outlet_id);
    }

    const periodOffset = comparePeriodToStart(plan.start_date, input.period_year, input.period_month);
    if (periodOffset < 0) {
      throw new DepreciationPlanValidationError("Run period is before plan start date");
    }
    if (periodOffset >= plan.useful_life_months) {
      throw new DepreciationPlanValidationError("Run period exceeds useful life");
    }

    const summary = await getPostedRunSummaryWithExecutor(trx, plan.id);
    const accumulated = summary.totalAmount;

    const depreciableBase = plan.purchase_cost_snapshot - plan.salvage_value;
    ensureValidPlanAmounts(plan.purchase_cost_snapshot, plan.salvage_value);

    const remainingBase = plan.purchase_cost_snapshot - plan.salvage_value - accumulated;
    if (remainingBase <= 0) {
      throw new DepreciationPlanValidationError("Asset is fully depreciated");
    }

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

    const amount = normalizeMoney(Math.min(rawAmount, remainingBase));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new DepreciationPlanValidationError("Depreciation amount is invalid for period");
    }

    const runDate = input.run_date ?? getLastDayOfMonth(input.period_year, input.period_month);

    try {
      const result = await trx
        .insertInto("asset_depreciation_runs")
        .values({
          company_id: companyId,
          plan_id: input.plan_id,
          period_year: input.period_year,
          period_month: input.period_month,
          run_date: parseDateOnly(runDate),
          amount: amount,
          journal_batch_id: null,
          status: "POSTED"
        })
        .executeTakeFirst();

      const runId = Number(result.insertId);
      const run = await findRunByPlanPeriodWithExecutor(
        trx,
        companyId,
        input.plan_id,
        input.period_year,
        input.period_month
      );
      if (!run) {
        throw new Error("Created depreciation run not found");
      }

      const postingResult = await postDepreciationRunToJournal(trx, plan, run);

      await trx
        .updateTable("asset_depreciation_runs")
        .set({ journal_batch_id: Number(postingResult.journal_batch_id) })
        .where("company_id", "=", companyId)
        .where("id", "=", run.id)
        .execute();

      const updatedRun = await findRunByPlanPeriodWithExecutor(
        trx,
        companyId,
        input.plan_id,
        input.period_year,
        input.period_month
      );
      if (!updatedRun) {
        throw new Error("Updated depreciation run not found");
      }

      return { run: updatedRun, duplicate: false };
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        const existing = await findRunByPlanPeriodWithExecutor(
          trx,
          companyId,
          input.plan_id,
          input.period_year,
          input.period_month
        );
        if (!existing) {
          throw new Error("Duplicate depreciation run not found");
        }
        return { run: existing, duplicate: true };
      }

      throw error;
    }
  });
}

export async function getDepreciationPlanForFixedAsset(
  companyId: number,
  assetId: number
): Promise<DepreciationPlan | null> {
  const db = getDb();
  return findLatestPlanByFixedAssetWithExecutor(db, companyId, assetId);
}
