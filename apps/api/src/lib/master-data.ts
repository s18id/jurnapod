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
  itemPriceDelete: "MASTER_DATA_ITEM_PRICE_DELETE"
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
