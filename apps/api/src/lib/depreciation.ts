import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "./db";
import { postDepreciationRunToJournal } from "./depreciation-posting";

type FixedAssetRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number | null;
  purchase_date: Date | string | null;
  purchase_cost: string | number | null;
};

type DepreciationPlanRow = RowDataPacket & {
  id: number;
  company_id: number;
  asset_id: number;
  outlet_id: number | null;
  method: "STRAIGHT_LINE";
  start_date: Date | string;
  useful_life_months: number;
  salvage_value: string | number;
  purchase_cost_snapshot: string | number;
  expense_account_id: number;
  accum_depr_account_id: number;
  status: "DRAFT" | "ACTIVE" | "VOID";
  created_at: Date;
  updated_at: Date;
};

type DepreciationRunRow = RowDataPacket & {
  id: number;
  company_id: number;
  plan_id: number;
  period_year: number;
  period_month: number;
  run_date: Date | string;
  amount: string | number;
  journal_batch_id: number | null;
  status: "POSTED" | "VOID";
  created_at: Date;
  updated_at: Date;
};

type AccessCheckRow = RowDataPacket & {
  id: number;
};

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

type MutationActor = {
  userId: number;
};

export type DepreciationPlan = {
  id: number;
  company_id: number;
  asset_id: number;
  outlet_id: number | null;
  method: "STRAIGHT_LINE";
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

function getLastDayOfMonth(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
}

function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

async function withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureCompanyOutletExists(
  executor: QueryExecutor,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM outlets
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [outletId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Outlet not found for company");
  }
}

async function ensureUserHasOutletAccess(
  executor: QueryExecutor,
  userId: number,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<AccessCheckRow[]>(
    `SELECT u.id
     FROM users u
     INNER JOIN user_outlets uo ON uo.user_id = u.id
     INNER JOIN outlets o ON o.id = uo.outlet_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
       AND uo.outlet_id = ?
       AND o.company_id = ?
     LIMIT 1`,
    [userId, companyId, outletId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseForbiddenError("User cannot access outlet");
  }
}

async function findFixedAssetWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  assetId: number
): Promise<FixedAssetRow | null> {
  const [rows] = await executor.execute<FixedAssetRow[]>(
    `SELECT id, company_id, outlet_id, purchase_date, purchase_cost
     FROM fixed_assets
     WHERE company_id = ?
       AND id = ?
     LIMIT 1`,
    [companyId, assetId]
  );

  return rows[0] ?? null;
}

function normalizePlan(row: DepreciationPlanRow): DepreciationPlan {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    asset_id: Number(row.asset_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    method: row.method,
    start_date: formatDateOnly(row.start_date),
    useful_life_months: Number(row.useful_life_months),
    salvage_value: Number(row.salvage_value),
    purchase_cost_snapshot: Number(row.purchase_cost_snapshot),
    expense_account_id: Number(row.expense_account_id),
    accum_depr_account_id: Number(row.accum_depr_account_id),
    status: row.status,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString()
  };
}

function normalizeRun(row: DepreciationRunRow): DepreciationRun {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    plan_id: Number(row.plan_id),
    period_year: Number(row.period_year),
    period_month: Number(row.period_month),
    run_date: formatDateOnly(row.run_date),
    amount: Number(row.amount),
    journal_batch_id: row.journal_batch_id == null ? null : Number(row.journal_batch_id),
    status: row.status,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString()
  };
}

async function findPlanByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  planId: number,
  options?: { forUpdate?: boolean }
): Promise<DepreciationPlan | null> {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<DepreciationPlanRow[]>(
    `SELECT id, company_id, asset_id, outlet_id, method, start_date, useful_life_months,
            salvage_value, purchase_cost_snapshot, expense_account_id, accum_depr_account_id,
            status, created_at, updated_at
     FROM asset_depreciation_plans
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, planId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizePlan(rows[0]);
}

async function findLatestPlanByFixedAssetWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  assetId: number,
  options?: { includeVoid?: boolean; forUpdate?: boolean }
): Promise<DepreciationPlan | null> {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const values: Array<number | string> = [companyId, assetId];
  let statusClause = "";
  if (!options?.includeVoid) {
    statusClause = " AND status != 'VOID'";
  }

  const [rows] = await executor.execute<DepreciationPlanRow[]>(
    `SELECT id, company_id, asset_id, outlet_id, method, start_date, useful_life_months,
            salvage_value, purchase_cost_snapshot, expense_account_id, accum_depr_account_id,
            status, created_at, updated_at
     FROM asset_depreciation_plans
     WHERE company_id = ?
       AND asset_id = ?${statusClause}
     ORDER BY id DESC
     LIMIT 1${forUpdateClause}`,
    values
  );

  if (!rows[0]) {
    return null;
  }

  return normalizePlan(rows[0]);
}

async function countPostedRunsWithExecutor(
  executor: QueryExecutor,
  planId: number
): Promise<number> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total
     FROM asset_depreciation_runs
     WHERE plan_id = ?
       AND status = 'POSTED'`,
    [planId]
  );

  return Number(rows[0]?.total ?? 0);
}

async function findRunByPlanPeriodWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  planId: number,
  periodYear: number,
  periodMonth: number
): Promise<DepreciationRun | null> {
  const [rows] = await executor.execute<DepreciationRunRow[]>(
    `SELECT id, company_id, plan_id, period_year, period_month, run_date, amount,
            journal_batch_id, status, created_at, updated_at
     FROM asset_depreciation_runs
     WHERE company_id = ?
       AND plan_id = ?
       AND period_year = ?
       AND period_month = ?
     LIMIT 1`,
    [companyId, planId, periodYear, periodMonth]
  );

  return rows[0] ? normalizeRun(rows[0]) : null;
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
  const pool = getDbPool();
  return findLatestPlanByFixedAssetWithExecutor(pool, companyId, assetId);
}

export async function createDepreciationPlan(
  companyId: number,
  input: {
    asset_id: number;
    outlet_id?: number;
    method: "STRAIGHT_LINE";
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
  return withTransaction(async (connection) => {
    const fixed_assets = await findFixedAssetWithExecutor(
      connection,
      companyId,
      input.asset_id
    );
    if (!fixed_assets) {
      throw new DatabaseReferenceError("FixedAsset not found");
    }

    const outletId =
      typeof input.outlet_id === "number"
        ? input.outlet_id
        : fixed_assets.outlet_id == null
          ? null
          : Number(fixed_assets.outlet_id);

    if (typeof outletId === "number") {
      await ensureCompanyOutletExists(connection, companyId, outletId);
      if (actor) {
        await ensureUserHasOutletAccess(connection, actor.userId, companyId, outletId);
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

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO asset_depreciation_plans (
         company_id,
         asset_id,
         outlet_id,
         method,
         start_date,
         useful_life_months,
         salvage_value,
         purchase_cost_snapshot,
         expense_account_id,
         accum_depr_account_id,
         status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        input.asset_id,
        outletId,
        input.method,
        startDate,
        input.useful_life_months,
        input.salvage_value,
        purchaseCostSnapshot,
        input.expense_account_id,
        input.accum_depr_account_id,
        status
      ]
    );

    const planId = Number(result.insertId);
    const plan = await findPlanByIdWithExecutor(connection, companyId, planId);
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
    method?: "STRAIGHT_LINE";
    start_date?: string;
    useful_life_months?: number;
    salvage_value?: number;
    expense_account_id?: number;
    accum_depr_account_id?: number;
    status?: "DRAFT" | "ACTIVE" | "VOID";
  },
  actor?: MutationActor
): Promise<DepreciationPlan | null> {
  return withTransaction(async (connection) => {
    const current = await findPlanByIdWithExecutor(connection, companyId, planId, {
      forUpdate: true
    });
    if (!current) {
      return null;
    }

    if (actor && current.outlet_id != null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, current.outlet_id);
    }

    const postedRuns = await countPostedRunsWithExecutor(connection, planId);
    const isOnlyStatusChange =
      postedRuns > 0 &&
      Object.keys(input).every((key) => key === "status") &&
      input.status === "VOID";

    if (postedRuns > 0 && !isOnlyStatusChange) {
      throw new DepreciationPlanStatusError("Plan has posted runs");
    }

    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
      if (actor) {
        await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
      }
      fields.push("outlet_id = ?");
      values.push(input.outlet_id);
    }

    if (typeof input.method === "string") {
      fields.push("method = ?");
      values.push(input.method);
    }

    if (typeof input.start_date === "string") {
      fields.push("start_date = ?");
      values.push(input.start_date);
    }

    if (typeof input.useful_life_months === "number") {
      fields.push("useful_life_months = ?");
      values.push(input.useful_life_months);
    }

    if (typeof input.salvage_value === "number") {
      ensureValidPlanAmounts(current.purchase_cost_snapshot, input.salvage_value);
      fields.push("salvage_value = ?");
      values.push(input.salvage_value);
    }

    if (typeof input.expense_account_id === "number") {
      fields.push("expense_account_id = ?");
      values.push(input.expense_account_id);
    }

    if (typeof input.accum_depr_account_id === "number") {
      fields.push("accum_depr_account_id = ?");
      values.push(input.accum_depr_account_id);
    }

    if (typeof input.status === "string") {
      fields.push("status = ?");
      values.push(input.status);
    }

    if (fields.length === 0) {
      return current;
    }

    values.push(companyId, planId);

    await connection.execute<ResultSetHeader>(
      `UPDATE asset_depreciation_plans
       SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ?
         AND id = ?`,
      values
    );

    return findPlanByIdWithExecutor(connection, companyId, planId);
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
  return withTransaction(async (connection) => {
    const plan = await findPlanByIdWithExecutor(connection, companyId, input.plan_id, {
      forUpdate: true
    });
    if (!plan) {
      throw new DatabaseReferenceError("Depreciation plan not found");
    }

    if (plan.status !== "ACTIVE") {
      throw new DepreciationPlanStatusError("Plan is not active");
    }

    if (actor && plan.outlet_id != null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, plan.outlet_id);
    }

    if (comparePeriodToStart(plan.start_date, input.period_year, input.period_month) < 0) {
      throw new DepreciationPlanValidationError("Run period is before plan start date");
    }

    const depreciableBase = plan.purchase_cost_snapshot - plan.salvage_value;
    ensureValidPlanAmounts(plan.purchase_cost_snapshot, plan.salvage_value);
    const amount = normalizeMoney(depreciableBase / plan.useful_life_months);

    const runDate = input.run_date ?? getLastDayOfMonth(input.period_year, input.period_month);

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO asset_depreciation_runs (
           company_id,
           plan_id,
           period_year,
           period_month,
           run_date,
           amount,
           journal_batch_id,
           status
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'POSTED')`,
        [
          companyId,
          input.plan_id,
          input.period_year,
          input.period_month,
          runDate,
          amount
        ]
      );

      const runId = Number(result.insertId);
      const run = await findRunByPlanPeriodWithExecutor(
        connection,
        companyId,
        input.plan_id,
        input.period_year,
        input.period_month
      );
      if (!run) {
        throw new Error("Created depreciation run not found");
      }

      const postingResult = await postDepreciationRunToJournal(connection, plan, run);

      await connection.execute<ResultSetHeader>(
        `UPDATE asset_depreciation_runs
         SET journal_batch_id = ?
         WHERE company_id = ?
           AND id = ?`,
        [postingResult.journal_batch_id, companyId, run.id]
      );

      const updatedRun = await findRunByPlanPeriodWithExecutor(
        connection,
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
          connection,
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
  const pool = getDbPool();
  return findLatestPlanByFixedAssetWithExecutor(pool, companyId, assetId);
}
