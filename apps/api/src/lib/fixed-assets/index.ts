// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { toRfc3339Required } from "@jurnapod/shared";
import { getDb, type KyselySchema } from "../db.js";
import {
  DatabaseConflictError,
  DatabaseReferenceError
} from "../master-data-errors.js";
import {
  isMysqlError,
  mysqlDuplicateErrorCode,
  mysqlForeignKeyErrorCode,
  recordMasterDataAuditLog
} from "../shared/master-data-utils.js";
import { ensureUserHasOutletAccess } from "../shared/common-utils.js";

type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

const fixedAssetAuditActions = {
  categoryCreate: "MASTER_DATA_FIXED_ASSET_CATEGORY_CREATE",
  categoryUpdate: "MASTER_DATA_FIXED_ASSET_CATEGORY_UPDATE",
  categoryDelete: "MASTER_DATA_FIXED_ASSET_CATEGORY_DELETE",
  assetCreate: "MASTER_DATA_FIXED_ASSET_CREATE",
  assetUpdate: "MASTER_DATA_FIXED_ASSET_UPDATE",
  assetDelete: "MASTER_DATA_FIXED_ASSET_DELETE"
} as const;

async function recordFixedAssetAuditLog(
  db: KyselySchema,
  input: {
    companyId: number;
    outletId: number | null;
    actor: MutationAuditActor | undefined;
    action: (typeof fixedAssetAuditActions)[keyof typeof fixedAssetAuditActions];
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await recordMasterDataAuditLog(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    actor: input.actor,
    action: input.action,
    payload: input.payload
  });
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function normalizeFixedAsset(row: {
  id: number;
  company_id: number;
  outlet_id: number | null;
  category_id: number | null;
  asset_tag: string | null;
  name: string;
  serial_number: string | null;
  purchase_date: Date | string | null;
  purchase_cost: string | number | null;
  is_active: number;
  updated_at: Date | string;
}) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    category_id: row.category_id == null ? null : Number(row.category_id),
    asset_tag: row.asset_tag,
    name: row.name,
    serial_number: row.serial_number,
    purchase_date: row.purchase_date ? (typeof row.purchase_date === "string" ? row.purchase_date : row.purchase_date.toISOString().slice(0, 10)) : null,
    purchase_cost: row.purchase_cost == null ? null : Number(row.purchase_cost),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  };
}

function normalizeFixedAssetCategory(row: {
  id: number;
  company_id: number;
  code: string;
  name: string;
  depreciation_method: string;
  useful_life_months: number;
  residual_value_pct: string | number;
  expense_account_id: number | null;
  accum_depr_account_id: number | null;
  is_active: number;
  updated_at: Date | string;
}) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    depreciation_method: row.depreciation_method as "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS",
    useful_life_months: Number(row.useful_life_months),
    residual_value_pct: Number(row.residual_value_pct),
    expense_account_id: row.expense_account_id == null ? null : Number(row.expense_account_id),
    accum_depr_account_id: row.accum_depr_account_id == null ? null : Number(row.accum_depr_account_id),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  };
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

async function ensureCompanyFixedAssetCategoryExists(
  db: KyselySchema,
  companyId: number,
  categoryId: number
): Promise<void> {
  const row = await db
    .selectFrom("fixed_asset_categories")
    .where("id", "=", categoryId)
    .where("company_id", "=", companyId)
    .limit(1)
    .select("id")
    .executeTakeFirst();

  if (!row) {
    throw new DatabaseReferenceError("Fixed asset category not found for company");
  }
}

async function findFixedAssetCategoryByIdWithExecutor(
  db: KyselySchema,
  companyId: number,
  categoryId: number
) {
  // Note: FOR UPDATE handled by transaction
  const row = await db
    .selectFrom("fixed_asset_categories")
    .where("company_id", "=", companyId)
    .where("id", "=", categoryId)
    .limit(1)
    .select([
      "id", "company_id", "code", "name", "depreciation_method", "useful_life_months",
      "residual_value_pct", "expense_account_id", "accum_depr_account_id", "is_active", "updated_at"
    ])
    .executeTakeFirst();

  if (!row) return null;
  return normalizeFixedAssetCategory(row);
}

async function findFixedAssetByIdWithExecutor(
  db: KyselySchema,
  companyId: number,
  assetId: number
) {
  // Note: FOR UPDATE handled by transaction
  const row = await db
    .selectFrom("fixed_assets")
    .where("company_id", "=", companyId)
    .where("id", "=", assetId)
    .limit(1)
    .select([
      "id", "company_id", "outlet_id", "category_id", "asset_tag", "name",
      "serial_number", "purchase_date", "purchase_cost", "is_active", "updated_at"
    ])
    .executeTakeFirst();

  if (!row) return null;
  return normalizeFixedAsset(row);
}

export async function listFixedAssetCategories(companyId: number, filters?: { isActive?: boolean }) {
  const db = getDb();

  let query = db
    .selectFrom("fixed_asset_categories")
    .where("company_id", "=", companyId)
    .select([
      "id", "company_id", "code", "name", "depreciation_method", "useful_life_months",
      "residual_value_pct", "expense_account_id", "accum_depr_account_id", "is_active", "updated_at"
    ])
    .orderBy("id", "asc");

  if (typeof filters?.isActive === "boolean") {
    query = query.where("is_active", "=", filters.isActive ? 1 : 0);
  }

  const rows = await query.execute();
  return rows.map(normalizeFixedAssetCategory);
}

export async function findFixedAssetCategoryById(companyId: number, categoryId: number) {
  const db = getDb();
  return findFixedAssetCategoryByIdWithExecutor(db, companyId, categoryId);
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
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    try {
      if (typeof input.expense_account_id === "number") {
        await ensureCompanyAccountExists(trx, companyId, input.expense_account_id);
      }
      if (typeof input.accum_depr_account_id === "number") {
        await ensureCompanyAccountExists(trx, companyId, input.accum_depr_account_id);
      }

      const result = await trx
        .insertInto("fixed_asset_categories")
        .values({
          company_id: companyId,
          code: input.code,
          name: input.name,
          depreciation_method: input.depreciation_method ?? "STRAIGHT_LINE",
          useful_life_months: input.useful_life_months,
          residual_value_pct: input.residual_value_pct ?? 0,
          expense_account_id: input.expense_account_id ?? null,
          accum_depr_account_id: input.accum_depr_account_id ?? null,
          is_active: input.is_active === false ? 0 : 1
        })
        .executeTakeFirst();

      const category = await findFixedAssetCategoryByIdWithExecutor(trx, companyId, Number(result.insertId));
      if (!category) throw new Error("Created fixed asset category not found");

      await recordFixedAssetAuditLog(trx, {
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
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    const updateData: Record<string, unknown> = {};

    if (typeof input.code === "string") {
      updateData.code = input.code;
    }
    if (typeof input.name === "string") {
      updateData.name = input.name;
    }
    if (typeof input.depreciation_method === "string") {
      updateData.depreciation_method = input.depreciation_method;
    }
    if (typeof input.useful_life_months === "number") {
      updateData.useful_life_months = input.useful_life_months;
    }
    if (typeof input.residual_value_pct === "number") {
      updateData.residual_value_pct = input.residual_value_pct;
    }
    if (typeof input.is_active === "boolean") {
      updateData.is_active = input.is_active ? 1 : 0;
    }

    if (input.expense_account_id !== undefined) {
      if (typeof input.expense_account_id === "number") {
        await ensureCompanyAccountExists(trx, companyId, input.expense_account_id);
      }
      updateData.expense_account_id = input.expense_account_id;
    }

    if (input.accum_depr_account_id !== undefined) {
      if (typeof input.accum_depr_account_id === "number") {
        await ensureCompanyAccountExists(trx, companyId, input.accum_depr_account_id);
      }
      updateData.accum_depr_account_id = input.accum_depr_account_id;
    }

    const before = await findFixedAssetCategoryByIdWithExecutor(trx, companyId, categoryId);
    if (!before) return null;
    if (Object.keys(updateData).length === 0) return before;

    try {
      await trx
        .updateTable("fixed_asset_categories")
        .set(updateData)
        .where("company_id", "=", companyId)
        .where("id", "=", categoryId)
        .execute();

      const category = await findFixedAssetCategoryByIdWithExecutor(trx, companyId, categoryId);
      if (!category) return null;

      await recordFixedAssetAuditLog(trx, {
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
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    const before = await findFixedAssetCategoryByIdWithExecutor(trx, companyId, categoryId);
    if (!before) return false;

    await trx
      .deleteFrom("fixed_asset_categories")
      .where("company_id", "=", companyId)
      .where("id", "=", categoryId)
      .execute();

    await recordFixedAssetAuditLog(trx, {
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
  const db = getDb();

  let query = db
    .selectFrom("fixed_assets")
    .where("company_id", "=", companyId)
    .select([
      "id", "company_id", "outlet_id", "category_id", "asset_tag", "name",
      "serial_number", "purchase_date", "purchase_cost", "is_active", "updated_at"
    ])
    .orderBy("id", "asc");

  if (typeof filters?.outletId === "number") {
    query = query.where("outlet_id", "=", filters.outletId);
  }

  if (filters?.allowedOutletIds !== undefined) {
    if (filters.allowedOutletIds.length > 0) {
      query = query.where((eb) =>
        eb.or([
          eb("outlet_id", "is", null),
          eb("outlet_id", "in", filters.allowedOutletIds!)
        ])
      );
    } else {
      query = query.where("outlet_id", "is", null);
    }
  }

  if (typeof filters?.isActive === "boolean") {
    query = query.where("is_active", "=", filters.isActive ? 1 : 0);
  }

  const rows = await query.execute();
  return rows.map(normalizeFixedAsset);
}

export async function findFixedAssetById(companyId: number, assetId: number) {
  const db = getDb();
  return findFixedAssetByIdWithExecutor(db, companyId, assetId);
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
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(trx, companyId, input.outlet_id);
      if (actor) await ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
    }

    if (typeof input.category_id === "number") {
      await ensureCompanyFixedAssetCategoryExists(trx, companyId, input.category_id);
    }

    try {
      const result = await trx
        .insertInto("fixed_assets")
        .values({
          company_id: companyId,
          outlet_id: input.outlet_id ?? null,
          category_id: input.category_id ?? null,
          asset_tag: input.asset_tag ?? null,
          name: input.name,
          serial_number: input.serial_number ?? null,
          purchase_date: parseDateOnly(input.purchase_date),
          purchase_cost: input.purchase_cost ?? null,
          is_active: input.is_active === false ? 0 : 1
        })
        .executeTakeFirst();

      const fixedAsset = await findFixedAssetByIdWithExecutor(trx, companyId, Number(result.insertId));
      if (!fixedAsset) throw new Error("Created fixed_assets not found");

      await recordFixedAssetAuditLog(trx, {
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
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    const updateData: Record<string, unknown> = {};

    if (Object.hasOwn(input, "asset_tag")) {
      updateData.asset_tag = input.asset_tag ?? null;
    }
    if (typeof input.name === "string") {
      updateData.name = input.name;
    }
    if (Object.hasOwn(input, "serial_number")) {
      updateData.serial_number = input.serial_number ?? null;
    }
    if (Object.hasOwn(input, "purchase_date")) {
      updateData.purchase_date = input.purchase_date ?? null;
    }
    if (Object.hasOwn(input, "purchase_cost")) {
      updateData.purchase_cost = input.purchase_cost ?? null;
    }
    if (typeof input.is_active === "boolean") {
      updateData.is_active = input.is_active ? 1 : 0;
    }

    const before = await findFixedAssetByIdWithExecutor(trx, companyId, assetId);
    if (!before) return null;

    if (actor && before.outlet_id != null) {
      await ensureUserHasOutletAccess(actor.userId, companyId, before.outlet_id);
    }

    if (Object.hasOwn(input, "outlet_id")) {
      if (typeof input.outlet_id === "number") {
        await ensureCompanyOutletExists(trx, companyId, input.outlet_id);
        if (actor) await ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
      }
      updateData.outlet_id = input.outlet_id ?? null;
    }

    if (Object.hasOwn(input, "category_id")) {
      if (typeof input.category_id === "number") {
        await ensureCompanyFixedAssetCategoryExists(trx, companyId, input.category_id);
      }
      updateData.category_id = input.category_id ?? null;
    }

    if (Object.keys(updateData).length === 0) return before;

    try {
      await trx
        .updateTable("fixed_assets")
        .set(updateData)
        .where("company_id", "=", companyId)
        .where("id", "=", assetId)
        .execute();

      const fixedAsset = await findFixedAssetByIdWithExecutor(trx, companyId, assetId);
      if (!fixedAsset) return null;

      await recordFixedAssetAuditLog(trx, {
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
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    const before = await findFixedAssetByIdWithExecutor(trx, companyId, assetId);
    if (!before) return false;

    if (actor && before.outlet_id != null) {
      await ensureUserHasOutletAccess(actor.userId, companyId, before.outlet_id);
    }

    await trx
      .deleteFrom("fixed_assets")
      .where("company_id", "=", companyId)
      .where("id", "=", assetId)
      .execute();

    await recordFixedAssetAuditLog(trx, {
      companyId,
      outletId: before.outlet_id,
      actor,
      action: fixedAssetAuditActions.assetDelete,
      payload: { equipment_id: before.id, before }
    });

    return true;
  });
}
