import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import type { SyncPullResponse } from "@jurnapod/shared";
import { SyncPullConfigSchema } from "@jurnapod/shared";
import { getDbPool } from "./db";

type ItemRow = RowDataPacket & {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  is_active: number;
  updated_at: Date;
};

type ItemPriceRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  item_id: number;
  price: string | number;
  is_active: number;
  updated_at: Date;
};

type SupplyRow = RowDataPacket & {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  unit: string;
  is_active: number;
  updated_at: Date;
};

type FixedAssetRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number | null;
  category_id: number | null;
  asset_tag: string | null;
  name: string;
  serial_number: string | null;
  purchase_date: Date | null;
  purchase_cost: string | number | null;
  is_active: number;
  updated_at: Date;
};

type FixedAssetCategoryRow = RowDataPacket & {
  id: number;
  company_id: number;
  code: string;
  name: string;
  depreciation_method: "STRAIGHT_LINE";
  useful_life_months: number;
  residual_value_pct: string | number;
  is_active: number;
  updated_at: Date;
};

type VersionRow = RowDataPacket & {
  current_version: number;
};

type FeatureFlagRow = RowDataPacket & {
  key: string;
  enabled: number;
  config_json: string;
};

const mysqlDuplicateErrorCode = 1062;
const mysqlForeignKeyErrorCode = 1452;

const masterDataAuditActions = {
  itemCreate: "MASTER_DATA_ITEM_CREATE",
  itemUpdate: "MASTER_DATA_ITEM_UPDATE",
  itemDelete: "MASTER_DATA_ITEM_DELETE",
  itemPriceCreate: "MASTER_DATA_ITEM_PRICE_CREATE",
  itemPriceUpdate: "MASTER_DATA_ITEM_PRICE_UPDATE",
  itemPriceDelete: "MASTER_DATA_ITEM_PRICE_DELETE",
  supplyCreate: "MASTER_DATA_SUPPLY_CREATE",
  supplyUpdate: "MASTER_DATA_SUPPLY_UPDATE",
  supplyDelete: "MASTER_DATA_SUPPLY_DELETE",
  fixedAssetCreate: "MASTER_DATA_FIXED_ASSET_CREATE",
  fixedAssetUpdate: "MASTER_DATA_FIXED_ASSET_UPDATE",
  fixedAssetDelete: "MASTER_DATA_FIXED_ASSET_DELETE",
  fixedAssetCategoryCreate: "MASTER_DATA_FIXED_ASSET_CATEGORY_CREATE",
  fixedAssetCategoryUpdate: "MASTER_DATA_FIXED_ASSET_CATEGORY_UPDATE",
  fixedAssetCategoryDelete: "MASTER_DATA_FIXED_ASSET_CATEGORY_DELETE"
} as const;

type MasterDataAuditAction = (typeof masterDataAuditActions)[keyof typeof masterDataAuditActions];

type MutationAuditActor = {
  userId: number;
};

type AccessCheckRow = RowDataPacket & {
  id: number;
};

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

export class DatabaseConflictError extends Error {}
export class DatabaseReferenceError extends Error {}
export class DatabaseForbiddenError extends Error {}

const syncTaxConfigSchema = z.object({
  rate: z.coerce.number().finite().min(0).optional(),
  inclusive: z.coerce.boolean().optional()
});

const syncPaymentMethodsConfigSchema = z
  .array(z.string().trim().min(1))
  .or(z.object({ methods: z.array(z.string().trim().min(1)) }))
  .optional();

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

async function recordMasterDataAuditLog(
  executor: QueryExecutor,
  input: {
    companyId: number;
    outletId: number | null;
    actor: MutationAuditActor | undefined;
    action: MasterDataAuditAction;
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
       ip_address,
       payload_json
     ) VALUES (?, ?, ?, ?, 'SUCCESS', NULL, ?)`,
    [
      input.companyId,
      input.outletId,
      input.actor?.userId ?? null,
      input.action,
      JSON.stringify(input.payload)
    ]
  );
}

function normalizeItem(row: ItemRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    type: row.item_type,
    is_active: row.is_active === 1,
    updated_at: new Date(row.updated_at).toISOString()
  };
}

function normalizeItemPrice(row: ItemPriceRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    item_id: Number(row.item_id),
    price: Number(row.price),
    is_active: row.is_active === 1,
    updated_at: new Date(row.updated_at).toISOString()
  };
}

function normalizeSupply(row: SupplyRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    is_active: row.is_active === 1,
    updated_at: new Date(row.updated_at).toISOString()
  };
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
    purchase_date: row.purchase_date ? new Date(row.purchase_date).toISOString() : null,
    purchase_cost: row.purchase_cost == null ? null : Number(row.purchase_cost),
    is_active: row.is_active === 1,
    updated_at: new Date(row.updated_at).toISOString()
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
    is_active: row.is_active === 1,
    updated_at: new Date(row.updated_at).toISOString()
  };
}

async function ensureCompanyItemExists(
  executor: QueryExecutor,
  companyId: number,
  itemId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM items
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [itemId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Item not found for company");
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

async function findItemByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  itemId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<ItemRow[]>(
    `SELECT id, company_id, sku, name, item_type, is_active, updated_at
     FROM items
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, itemId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizeItem(rows[0]);
}

async function findItemPriceByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  itemPriceId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<ItemPriceRow[]>(
    `SELECT id, company_id, outlet_id, item_id, price, is_active, updated_at
     FROM item_prices
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, itemPriceId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizeItemPrice(rows[0]);
}

async function findSupplyByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  supplyId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<SupplyRow[]>(
    `SELECT id, company_id, sku, name, unit, is_active, updated_at
     FROM supplies
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, supplyId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizeSupply(rows[0]);
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
            is_active, updated_at
     FROM fixed_asset_categories
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, categoryId]
  );

  if (!rows[0]) {
    return null;
  }

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

  if (!rows[0]) {
    return null;
  }

  return normalizeFixedAsset(rows[0]);
}

export async function listItems(companyId: number, filters?: { isActive?: boolean }) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, sku, name, item_type, is_active, updated_at FROM items WHERE company_id = ?";

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";

  const [rows] = await pool.execute<ItemRow[]>(sql, values);
  return rows.map(normalizeItem);
}

export async function findItemById(companyId: number, itemId: number) {
  const pool = getDbPool();
  return findItemByIdWithExecutor(pool, companyId, itemId);
}

export async function createItem(
  companyId: number,
  input: {
    sku?: string | null;
    name: string;
    type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, sku, name, item_type, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [companyId, input.sku ?? null, input.name, input.type, input.is_active === false ? 0 : 1]
      );

      const item = await findItemByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!item) {
        throw new Error("Created item not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.itemCreate,
        payload: {
          item_id: item.id,
          after: item
        }
      });

      return item;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate item");
      }

      throw error;
    }
  });
}

export async function updateItem(
  companyId: number,
  itemId: number,
  input: {
    sku?: string | null;
    name?: string;
    type?: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (Object.hasOwn(input, "sku")) {
    fields.push("sku = ?");
    values.push(input.sku ?? null);
  }

  if (typeof input.name === "string") {
    fields.push("name = ?");
    values.push(input.name);
  }

  if (typeof input.type === "string") {
    fields.push("item_type = ?");
    values.push(input.type);
  }

  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  return withTransaction(async (connection) => {
    const before = await findItemByIdWithExecutor(connection, companyId, itemId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    if (fields.length === 0) {
      return before;
    }

    values.push(companyId, itemId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE items
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const item = await findItemByIdWithExecutor(connection, companyId, itemId);
      if (!item) {
        return null;
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.itemUpdate,
        payload: {
          item_id: item.id,
          before,
          after: item
        }
      });

      return item;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate item");
      }

      throw error;
    }
  });
}

export async function deleteItem(
  companyId: number,
  itemId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const before = await findItemByIdWithExecutor(connection, companyId, itemId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM items
       WHERE company_id = ?
         AND id = ?`,
      [companyId, itemId]
    );

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: null,
      actor,
      action: masterDataAuditActions.itemDelete,
      payload: {
        item_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function listItemPrices(
  companyId: number,
  filters?: { outletId?: number; outletIds?: readonly number[]; isActive?: boolean }
) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, outlet_id, item_id, price, is_active, updated_at FROM item_prices WHERE company_id = ?";

  if (typeof filters?.outletId === "number") {
    sql += " AND outlet_id = ?";
    values.push(filters.outletId);
  } else if (Array.isArray(filters?.outletIds)) {
    if (filters.outletIds.length === 0) {
      return [];
    }

    const outletPlaceholders = filters.outletIds.map(() => "?").join(", ");
    sql += ` AND outlet_id IN (${outletPlaceholders})`;
    values.push(...filters.outletIds);
  }

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";

  const [rows] = await pool.execute<ItemPriceRow[]>(sql, values);
  return rows.map(normalizeItemPrice);
}

export async function findItemPriceById(companyId: number, itemPriceId: number) {
  const pool = getDbPool();
  return findItemPriceByIdWithExecutor(pool, companyId, itemPriceId);
}

export async function listSupplies(companyId: number, filters?: { isActive?: boolean }) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, sku, name, unit, is_active, updated_at FROM supplies WHERE company_id = ?";

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";

  const [rows] = await pool.execute<SupplyRow[]>(sql, values);
  return rows.map(normalizeSupply);
}

export async function findSupplyById(companyId: number, supplyId: number) {
  const pool = getDbPool();
  return findSupplyByIdWithExecutor(pool, companyId, supplyId);
}

export async function createSupply(
  companyId: number,
  input: {
    sku?: string | null;
    name: string;
    unit?: string;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO supplies (company_id, sku, name, unit, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [
          companyId,
          input.sku ?? null,
          input.name,
          input.unit?.trim() || "unit",
          input.is_active === false ? 0 : 1
        ]
      );

      const supply = await findSupplyByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!supply) {
        throw new Error("Created supply not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.supplyCreate,
        payload: {
          supply_id: supply.id,
          after: supply
        }
      });

      return supply;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate supply");
      }

      throw error;
    }
  });
}

export async function updateSupply(
  companyId: number,
  supplyId: number,
  input: {
    sku?: string | null;
    name?: string;
    unit?: string;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (Object.hasOwn(input, "sku")) {
    fields.push("sku = ?");
    values.push(input.sku ?? null);
  }

  if (typeof input.name === "string") {
    fields.push("name = ?");
    values.push(input.name);
  }

  if (typeof input.unit === "string") {
    fields.push("unit = ?");
    values.push(input.unit.trim());
  }

  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  return withTransaction(async (connection) => {
    const before = await findSupplyByIdWithExecutor(connection, companyId, supplyId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    if (fields.length === 0) {
      return before;
    }

    values.push(companyId, supplyId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE supplies
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const supply = await findSupplyByIdWithExecutor(connection, companyId, supplyId);
      if (!supply) {
        return null;
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.supplyUpdate,
        payload: {
          supply_id: supply.id,
          before,
          after: supply
        }
      });

      return supply;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate supply");
      }

      throw error;
    }
  });
}

export async function deleteSupply(
  companyId: number,
  supplyId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const before = await findSupplyByIdWithExecutor(connection, companyId, supplyId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM supplies
       WHERE company_id = ?
         AND id = ?`,
      [companyId, supplyId]
    );

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: null,
      actor,
      action: masterDataAuditActions.supplyDelete,
      payload: {
        supply_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function listFixedAssetCategories(
  companyId: number,
  filters?: { isActive?: boolean }
) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, is_active, updated_at FROM fixed_asset_categories WHERE company_id = ?";

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";

  const [rows] = await pool.execute<FixedAssetCategoryRow[]>(sql, values);
  return rows.map(normalizeFixedAssetCategory);
}

export async function findFixedAssetCategoryById(
  companyId: number,
  categoryId: number
) {
  const pool = getDbPool();
  return findFixedAssetCategoryByIdWithExecutor(pool, companyId, categoryId);
}

export async function createFixedAssetCategory(
  companyId: number,
  input: {
    code: string;
    name: string;
    depreciation_method?: "STRAIGHT_LINE";
    useful_life_months: number;
    residual_value_pct?: number;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO fixed_asset_categories (
           company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          input.code,
          input.name,
          input.depreciation_method ?? "STRAIGHT_LINE",
          input.useful_life_months,
          input.residual_value_pct ?? 0,
          input.is_active === false ? 0 : 1
        ]
      );

      const category = await findFixedAssetCategoryByIdWithExecutor(
        connection,
        companyId,
        Number(result.insertId)
      );
      if (!category) {
        throw new Error("Created fixed asset category not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.fixedAssetCategoryCreate,
        payload: {
          fixed_asset_category_id: category.id,
          after: category
        }
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
    depreciation_method?: "STRAIGHT_LINE";
    useful_life_months?: number;
    residual_value_pct?: number;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const fields: string[] = [];
  const values: Array<string | number> = [];

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
    const before = await findFixedAssetCategoryByIdWithExecutor(connection, companyId, categoryId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    if (fields.length === 0) {
      return before;
    }

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
      if (!category) {
        return null;
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.fixedAssetCategoryUpdate,
        payload: {
          fixed_asset_category_id: category.id,
          before,
          after: category
        }
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
    const before = await findFixedAssetCategoryByIdWithExecutor(connection, companyId, categoryId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM fixed_asset_categories
       WHERE company_id = ?
         AND id = ?`,
      [companyId, categoryId]
    );

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: null,
      actor,
      action: masterDataAuditActions.fixedAssetCategoryDelete,
      payload: {
        fixed_asset_category_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function listFixedAssets(
  companyId: number,
  filters?: { outletId?: number; isActive?: boolean }
) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, outlet_id, category_id, asset_tag, name, serial_number, purchase_date, purchase_cost, is_active, updated_at FROM fixed_assets WHERE company_id = ?";

  if (typeof filters?.outletId === "number") {
    sql += " AND outlet_id = ?";
    values.push(filters.outletId);
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
      if (actor) {
        await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
      }
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

      const fixed_assets = await findFixedAssetByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!fixed_assets) {
        throw new Error("Created fixed_assets not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: fixed_assets.outlet_id,
        actor,
        action: masterDataAuditActions.fixedAssetCreate,
        payload: {
          equipment_id: fixed_assets.id,
          after: fixed_assets
        }
      });

      return fixed_assets;
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
    const before = await findFixedAssetByIdWithExecutor(connection, companyId, assetId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    if (actor && before.outlet_id != null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    if (Object.hasOwn(input, "outlet_id")) {
      if (typeof input.outlet_id === "number") {
        await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
        if (actor) {
          await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
        }
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

    if (fields.length === 0) {
      return before;
    }

    values.push(companyId, assetId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE fixed_assets
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const fixed_assets = await findFixedAssetByIdWithExecutor(connection, companyId, assetId);
      if (!fixed_assets) {
        return null;
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: fixed_assets.outlet_id,
        actor,
        action: masterDataAuditActions.fixedAssetUpdate,
        payload: {
          equipment_id: fixed_assets.id,
          before,
          after: fixed_assets
        }
      });

      return fixed_assets;
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
    const before = await findFixedAssetByIdWithExecutor(connection, companyId, assetId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    if (actor && before.outlet_id != null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM fixed_assets
       WHERE company_id = ?
         AND id = ?`,
      [companyId, assetId]
    );

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: before.outlet_id,
      actor,
      action: masterDataAuditActions.fixedAssetDelete,
      payload: {
        equipment_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function createItemPrice(
  companyId: number,
  input: {
    item_id: number;
    outlet_id: number;
    price: number;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    await ensureCompanyItemExists(connection, companyId, input.item_id);
    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [
          companyId,
          input.outlet_id,
          input.item_id,
          input.price,
          input.is_active === false ? 0 : 1
        ]
      );

      const itemPrice = await findItemPriceByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!itemPrice) {
        throw new Error("Created item price not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: itemPrice.outlet_id,
        actor,
        action: masterDataAuditActions.itemPriceCreate,
        payload: {
          item_price_id: itemPrice.id,
          after: itemPrice
        }
      });

      return itemPrice;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate item price");
      }

      if (isMysqlError(error) && error.errno === mysqlForeignKeyErrorCode) {
        throw new DatabaseReferenceError("Invalid company references");
      }

      throw error;
    }
  });
}

export async function updateItemPrice(
  companyId: number,
  itemPriceId: number,
  input: {
    item_id?: number;
    outlet_id?: number;
    price?: number;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const fields: string[] = [];
  const values: Array<number> = [];

  if (typeof input.price === "number") {
    fields.push("price = ?");
    values.push(input.price);
  }

  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  return withTransaction(async (connection) => {
    const before = await findItemPriceByIdWithExecutor(connection, companyId, itemPriceId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    if (typeof input.item_id === "number") {
      await ensureCompanyItemExists(connection, companyId, input.item_id);
      fields.push("item_id = ?");
      values.push(input.item_id);
    }

    if (typeof input.outlet_id === "number") {
      if (actor) {
        await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
      }
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
      fields.push("outlet_id = ?");
      values.push(input.outlet_id);
    }

    if (fields.length === 0) {
      return before;
    }

    values.push(companyId, itemPriceId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE item_prices
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const itemPrice = await findItemPriceByIdWithExecutor(connection, companyId, itemPriceId);
      if (!itemPrice) {
        return null;
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: itemPrice.outlet_id,
        actor,
        action: masterDataAuditActions.itemPriceUpdate,
        payload: {
          item_price_id: itemPrice.id,
          before,
          after: itemPrice
        }
      });

      return itemPrice;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate item price");
      }

      if (isMysqlError(error) && error.errno === mysqlForeignKeyErrorCode) {
        throw new DatabaseReferenceError("Invalid company references");
      }

      throw error;
    }
  });
}

export async function deleteItemPrice(
  companyId: number,
  itemPriceId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const before = await findItemPriceByIdWithExecutor(connection, companyId, itemPriceId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM item_prices
       WHERE company_id = ?
         AND id = ?`,
      [companyId, itemPriceId]
    );

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: before.outlet_id,
      actor,
      action: masterDataAuditActions.itemPriceDelete,
      payload: {
        item_price_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function getCompanyDataVersion(companyId: number): Promise<number> {
  const pool = getDbPool();
  const [rows] = await pool.execute<VersionRow[]>(
    `SELECT current_version
     FROM sync_data_versions
     WHERE company_id = ?
     LIMIT 1`,
    [companyId]
  );

  return Number(rows[0]?.current_version ?? 0);
}

async function readSyncConfig(companyId: number): Promise<SyncPullResponse["config"]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<FeatureFlagRow[]>(
    `SELECT \`key\`, enabled, config_json
     FROM feature_flags
     WHERE company_id = ?
       AND \`key\` IN ('pos.tax', 'pos.payment_methods', 'pos.config')`,
    [companyId]
  );

  let taxRate = 0;
  let taxInclusive = false;
  let paymentMethods: string[] = ["CASH"];

  for (const row of rows) {
    if (row.enabled !== 1) {
      continue;
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(row.config_json);
    } catch {
      parsed = null;
    }

    if (row.key === "pos.tax") {
      const taxConfig = syncTaxConfigSchema.safeParse(parsed);
      if (taxConfig.success) {
        taxRate = taxConfig.data.rate ?? taxRate;
        taxInclusive = taxConfig.data.inclusive ?? taxInclusive;
      }
      continue;
    }

    if (row.key === "pos.payment_methods") {
      const methodsConfig = syncPaymentMethodsConfigSchema.safeParse(parsed);
      if (methodsConfig.success) {
        paymentMethods = Array.isArray(methodsConfig.data)
          ? methodsConfig.data
          : methodsConfig.data?.methods ?? paymentMethods;
      }
      continue;
    }

    if (row.key === "pos.config" && parsed && typeof parsed === "object") {
      const configObject = parsed as Record<string, unknown>;

      const taxConfig = syncTaxConfigSchema.safeParse(configObject.tax);
      if (taxConfig.success) {
        taxRate = taxConfig.data.rate ?? taxRate;
        taxInclusive = taxConfig.data.inclusive ?? taxInclusive;
      }

      const methodsConfig = syncPaymentMethodsConfigSchema.safeParse(
        configObject.payment_methods
      );
      if (methodsConfig.success) {
        paymentMethods = Array.isArray(methodsConfig.data)
          ? methodsConfig.data
          : methodsConfig.data?.methods ?? paymentMethods;
      }
    }
  }

  return SyncPullConfigSchema.parse({
    tax: {
      rate: taxRate,
      inclusive: taxInclusive
    },
    payment_methods: paymentMethods
  });
}

export async function buildSyncPullPayload(
  companyId: number,
  outletId: number,
  sinceVersion: number
): Promise<SyncPullResponse> {
  const currentVersion = await getCompanyDataVersion(companyId);
  const config = await readSyncConfig(companyId);

  if (currentVersion <= sinceVersion) {
    return {
      data_version: currentVersion,
      items: [],
      prices: [],
      config
    };
  }

  const [items, prices] = await Promise.all([
    listItems(companyId, { isActive: true }),
    listItemPrices(companyId, { outletId, isActive: true })
  ]);

  return {
    data_version: currentVersion,
    items: items.map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      type: item.type,
      is_active: item.is_active,
      updated_at: item.updated_at
    })),
    prices: prices.map((price) => ({
      id: price.id,
      item_id: price.item_id,
      outlet_id: price.outlet_id,
      price: price.price,
      is_active: price.is_active,
      updated_at: price.updated_at
    })),
    config
  };
}
