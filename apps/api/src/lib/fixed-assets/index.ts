// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { toRfc3339Required } from "@jurnapod/shared";
import { getDbPool } from "../db.js";
import {
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "../master-data-errors.js";

type FixedAssetRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number | null;
  category_id: number | null;
  asset_tag: string | null;
  name: string;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_cost: string | number | null;
  is_active: number;
  updated_at: string;
};

type FixedAssetCategoryRow = RowDataPacket & {
  id: number;
  company_id: number;
  code: string;
  name: string;
  depreciation_method: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
  useful_life_months: number;
  residual_value_pct: string | number;
  expense_account_id: number | null;
  accum_depr_account_id: number | null;
  is_active: number;
  updated_at: string;
};

type AccessCheckRow = RowDataPacket & { id: number };

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

const mysqlDuplicateErrorCode = 1062;
const mysqlForeignKeyErrorCode = 1452;

const fixedAssetAuditActions = {
  categoryCreate: "MASTER_DATA_FIXED_ASSET_CATEGORY_CREATE",
  categoryUpdate: "MASTER_DATA_FIXED_ASSET_CATEGORY_UPDATE",
  categoryDelete: "MASTER_DATA_FIXED_ASSET_CATEGORY_DELETE",
  assetCreate: "MASTER_DATA_FIXED_ASSET_CREATE",
  assetUpdate: "MASTER_DATA_FIXED_ASSET_UPDATE",
  assetDelete: "MASTER_DATA_FIXED_ASSET_DELETE"
} as const;

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

async function recordFixedAssetAuditLog(
  executor: QueryExecutor,
  input: {
    companyId: number;
    outletId: number | null;
    actor: MutationAuditActor | undefined;
    action: (typeof fixedAssetAuditActions)[keyof typeof fixedAssetAuditActions];
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await executor.execute(
    `INSERT INTO audit_logs (
       company_id,
       outlet_id,
       user_id,
       action,
       result,
       success,
       ip_address,
       payload_json
     ) VALUES (?, ?, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [input.companyId, input.outletId, input.actor?.userId ?? null, input.action, JSON.stringify(input.payload)]
  );
}

function normalizeFixedAsset(row: FixedAssetRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    category_id: row.category_id == null ? null : Number(row.category_id),
    asset_tag: row.asset_tag,
    name: row.name,
    serial_number: row.serial_number,
    purchase_date: row.purchase_date ? row.purchase_date : null,
    purchase_cost: row.purchase_cost == null ? null : Number(row.purchase_cost),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  };
}

function normalizeFixedAssetCategory(row: FixedAssetCategoryRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    depreciation_method: row.depreciation_method,
    useful_life_months: Number(row.useful_life_months),
    residual_value_pct: Number(row.residual_value_pct),
    expense_account_id: row.expense_account_id == null ? null : Number(row.expense_account_id),
    accum_depr_account_id: row.accum_depr_account_id == null ? null : Number(row.accum_depr_account_id),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  };
}

async function ensureCompanyAccountExists(
  executor: QueryExecutor,
  companyId: number,
  accountId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM accounts
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [accountId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Account not found for company");
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

async function ensureCompanyFixedAssetCategoryExists(
  executor: QueryExecutor,
  companyId: number,
  categoryId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM fixed_asset_categories
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [categoryId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Fixed asset category not found for company");
  }
}

async function ensureUserHasOutletAccess(
  executor: QueryExecutor,
  userId: number,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<AccessCheckRow[]>(
    `SELECT 1
     FROM users u
     WHERE u.id = ?
       AND u.company_id = ?
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
             AND ura.outlet_id = ?
         )
       )
     LIMIT 1`,
    [userId, companyId, outletId]
  );

  if (rows.length === 0) {
    throw new DatabaseForbiddenError("User cannot access outlet");
  }
}

async function findFixedAssetCategoryByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  categoryId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<FixedAssetCategoryRow[]>(
    `SELECT id, company_id, code, name, depreciation_method, useful_life_months, residual_value_pct,
            expense_account_id, accum_depr_account_id, is_active, updated_at
     FROM fixed_asset_categories
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, categoryId]
  );

  if (!rows[0]) return null;
  return normalizeFixedAssetCategory(rows[0]);
}

async function findFixedAssetByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  assetId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<FixedAssetRow[]>(
    `SELECT id, company_id, outlet_id, category_id, asset_tag, name, serial_number, purchase_date, purchase_cost,
            is_active, updated_at
     FROM fixed_assets
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, assetId]
  );

  if (!rows[0]) return null;
  return normalizeFixedAsset(rows[0]);
}

export async function listFixedAssetCategories(companyId: number, filters?: { isActive?: boolean }) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];
  let sql =
    "SELECT id, company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, expense_account_id, accum_depr_account_id, is_active, updated_at FROM fixed_asset_categories WHERE company_id = ?";

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";
  const [rows] = await pool.execute<FixedAssetCategoryRow[]>(sql, values);
  return rows.map(normalizeFixedAssetCategory);
}

export async function findFixedAssetCategoryById(companyId: number, categoryId: number) {
  const pool = getDbPool();
  return findFixedAssetCategoryByIdWithExecutor(pool, companyId, categoryId);
}

export async function createFixedAssetCategory(
  companyId: number,
  input: {
    code: string;
    name: string;
    depreciation_method?: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
    useful_life_months: number;
    residual_value_pct?: number;
    expense_account_id?: number | null;
    accum_depr_account_id?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    try {
      if (typeof input.expense_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.expense_account_id);
      }
      if (typeof input.accum_depr_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.accum_depr_account_id);
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO fixed_asset_categories (
           company_id, code, name, depreciation_method, useful_life_months, residual_value_pct,
           expense_account_id, accum_depr_account_id, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          input.code,
          input.name,
          input.depreciation_method ?? "STRAIGHT_LINE",
          input.useful_life_months,
          input.residual_value_pct ?? 0,
          input.expense_account_id ?? null,
          input.accum_depr_account_id ?? null,
          input.is_active === false ? 0 : 1
        ]
      );

      const category = await findFixedAssetCategoryByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!category) throw new Error("Created fixed asset category not found");

      await recordFixedAssetAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: fixedAssetAuditActions.categoryCreate,
        payload: { fixed_asset_category_id: category.id, after: category }
      });

      return category;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate fixed asset category");
      }
      throw error;
    }
  });
}

export async function updateFixedAssetCategory(
  companyId: number,
  categoryId: number,
  input: {
    code?: string;
    name?: string;
    depreciation_method?: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
    useful_life_months?: number;
    residual_value_pct?: number;
    expense_account_id?: number | null;
    accum_depr_account_id?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (typeof input.code === "string") {
    fields.push("code = ?");
    values.push(input.code);
  }
  if (typeof input.name === "string") {
    fields.push("name = ?");
    values.push(input.name);
  }
  if (typeof input.depreciation_method === "string") {
    fields.push("depreciation_method = ?");
    values.push(input.depreciation_method);
  }
  if (typeof input.useful_life_months === "number") {
    fields.push("useful_life_months = ?");
    values.push(input.useful_life_months);
  }
  if (typeof input.residual_value_pct === "number") {
    fields.push("residual_value_pct = ?");
    values.push(input.residual_value_pct);
  }
  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  return withTransaction(async (connection) => {
    if (input.expense_account_id !== undefined) {
      if (typeof input.expense_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.expense_account_id);
      }
      fields.push("expense_account_id = ?");
      values.push(input.expense_account_id);
    }

    if (input.accum_depr_account_id !== undefined) {
      if (typeof input.accum_depr_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.accum_depr_account_id);
      }
      fields.push("accum_depr_account_id = ?");
      values.push(input.accum_depr_account_id);
    }

    const before = await findFixedAssetCategoryByIdWithExecutor(connection, companyId, categoryId, { forUpdate: true });
    if (!before) return null;
    if (fields.length === 0) return before;

    values.push(companyId, categoryId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE fixed_asset_categories
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const category = await findFixedAssetCategoryByIdWithExecutor(connection, companyId, categoryId);
      if (!category) return null;

      await recordFixedAssetAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: fixedAssetAuditActions.categoryUpdate,
        payload: { fixed_asset_category_id: category.id, before, after: category }
      });

      return category;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate fixed asset category");
      }
      throw error;
    }
  });
}

export async function deleteFixedAssetCategory(
  companyId: number,
  categoryId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const before = await findFixedAssetCategoryByIdWithExecutor(connection, companyId, categoryId, { forUpdate: true });
    if (!before) return false;

    await connection.execute<ResultSetHeader>(
      `DELETE FROM fixed_asset_categories
       WHERE company_id = ?
         AND id = ?`,
      [companyId, categoryId]
    );

    await recordFixedAssetAuditLog(connection, {
      companyId,
      outletId: null,
      actor,
      action: fixedAssetAuditActions.categoryDelete,
      payload: { fixed_asset_category_id: before.id, before }
    });

    return true;
  });
}

export async function listFixedAssets(
  companyId: number,
  filters?: { outletId?: number; isActive?: boolean; allowedOutletIds?: number[] }
) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];
  let sql =
    "SELECT id, company_id, outlet_id, category_id, asset_tag, name, serial_number, purchase_date, purchase_cost, is_active, updated_at FROM fixed_assets WHERE company_id = ?";

  if (typeof filters?.outletId === "number") {
    sql += " AND outlet_id = ?";
    values.push(filters.outletId);
  }

  if (filters?.allowedOutletIds !== undefined) {
    if (filters.allowedOutletIds.length > 0) {
      const placeholders = filters.allowedOutletIds.map(() => "?").join(", ");
      sql += ` AND (outlet_id IS NULL OR outlet_id IN (${placeholders}))`;
      values.push(...filters.allowedOutletIds);
    } else {
      sql += " AND outlet_id IS NULL";
    }
  }

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";
  const [rows] = await pool.execute<FixedAssetRow[]>(sql, values);
  return rows.map(normalizeFixedAsset);
}

export async function findFixedAssetById(companyId: number, assetId: number) {
  const pool = getDbPool();
  return findFixedAssetByIdWithExecutor(pool, companyId, assetId);
}

export async function createFixedAsset(
  companyId: number,
  input: {
    outlet_id?: number | null;
    category_id?: number | null;
    asset_tag?: string | null;
    name: string;
    serial_number?: string | null;
    purchase_date?: string | null;
    purchase_cost?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
      if (actor) await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
    }

    if (typeof input.category_id === "number") {
      await ensureCompanyFixedAssetCategoryExists(connection, companyId, input.category_id);
    }

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO fixed_assets (
           company_id, outlet_id, category_id, asset_tag, name, serial_number, purchase_date, purchase_cost, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          input.outlet_id ?? null,
          input.category_id ?? null,
          input.asset_tag ?? null,
          input.name,
          input.serial_number ?? null,
          input.purchase_date ?? null,
          input.purchase_cost ?? null,
          input.is_active === false ? 0 : 1
        ]
      );

      const fixedAsset = await findFixedAssetByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!fixedAsset) throw new Error("Created fixed_assets not found");

      await recordFixedAssetAuditLog(connection, {
        companyId,
        outletId: fixedAsset.outlet_id,
        actor,
        action: fixedAssetAuditActions.assetCreate,
        payload: { equipment_id: fixedAsset.id, after: fixedAsset }
      });

      return fixedAsset;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate fixed_assets");
      }
      if (isMysqlError(error) && error.errno === mysqlForeignKeyErrorCode) {
        throw new DatabaseReferenceError("Invalid company references");
      }
      throw error;
    }
  });
}

export async function updateFixedAsset(
  companyId: number,
  assetId: number,
  input: {
    outlet_id?: number | null;
    category_id?: number | null;
    asset_tag?: string | null;
    name?: string;
    serial_number?: string | null;
    purchase_date?: string | null;
    purchase_cost?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (Object.hasOwn(input, "asset_tag")) {
    fields.push("asset_tag = ?");
    values.push(input.asset_tag ?? null);
  }
  if (typeof input.name === "string") {
    fields.push("name = ?");
    values.push(input.name);
  }
  if (Object.hasOwn(input, "serial_number")) {
    fields.push("serial_number = ?");
    values.push(input.serial_number ?? null);
  }
  if (Object.hasOwn(input, "purchase_date")) {
    fields.push("purchase_date = ?");
    values.push(input.purchase_date ?? null);
  }
  if (Object.hasOwn(input, "purchase_cost")) {
    fields.push("purchase_cost = ?");
    values.push(input.purchase_cost ?? null);
  }
  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  return withTransaction(async (connection) => {
    const before = await findFixedAssetByIdWithExecutor(connection, companyId, assetId, { forUpdate: true });
    if (!before) return null;

    if (actor && before.outlet_id != null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    if (Object.hasOwn(input, "outlet_id")) {
      if (typeof input.outlet_id === "number") {
        await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
        if (actor) await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
      }
      fields.push("outlet_id = ?");
      values.push(input.outlet_id ?? null);
    }

    if (Object.hasOwn(input, "category_id")) {
      if (typeof input.category_id === "number") {
        await ensureCompanyFixedAssetCategoryExists(connection, companyId, input.category_id);
      }
      fields.push("category_id = ?");
      values.push(input.category_id ?? null);
    }

    if (fields.length === 0) return before;

    values.push(companyId, assetId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE fixed_assets
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const fixedAsset = await findFixedAssetByIdWithExecutor(connection, companyId, assetId);
      if (!fixedAsset) return null;

      await recordFixedAssetAuditLog(connection, {
        companyId,
        outletId: fixedAsset.outlet_id,
        actor,
        action: fixedAssetAuditActions.assetUpdate,
        payload: { equipment_id: fixedAsset.id, before, after: fixedAsset }
      });

      return fixedAsset;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate fixed_assets");
      }
      if (isMysqlError(error) && error.errno === mysqlForeignKeyErrorCode) {
        throw new DatabaseReferenceError("Invalid company references");
      }
      throw error;
    }
  });
}

export async function deleteFixedAsset(
  companyId: number,
  assetId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const before = await findFixedAssetByIdWithExecutor(connection, companyId, assetId, { forUpdate: true });
    if (!before) return false;

    if (actor && before.outlet_id != null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM fixed_assets
       WHERE company_id = ?
         AND id = ?`,
      [companyId, assetId]
    );

    await recordFixedAssetAuditLog(connection, {
      companyId,
      outletId: before.outlet_id,
      actor,
      action: fixedAssetAuditActions.assetDelete,
      payload: { equipment_id: before.id, before }
    });

    return true;
  });
}
