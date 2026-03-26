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

type ItemPriceRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  price: string | number;
  is_active: number;
  updated_at: string;
  item_group_id?: number | null;
  item_group_name?: string | null;
};

type AccessCheckRow = RowDataPacket & {
  id: number;
};

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

const mysqlDuplicateErrorCode = 1062;
const mysqlForeignKeyErrorCode = 1452;

const itemPriceAuditActions = {
  create: "MASTER_DATA_ITEM_PRICE_CREATE",
  update: "MASTER_DATA_ITEM_PRICE_UPDATE",
  delete: "MASTER_DATA_ITEM_PRICE_DELETE"
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

async function recordItemPriceAuditLog(
  executor: QueryExecutor,
  input: {
    companyId: number;
    outletId: number | null;
    actor: MutationAuditActor | undefined;
    action: (typeof itemPriceAuditActions)[keyof typeof itemPriceAuditActions];
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

function normalizeItemPrice(row: ItemPriceRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    item_id: Number(row.item_id),
    price: Number(row.price),
    is_active: row.is_active === 1,
    item_group_id: row.item_group_id == null ? null : Number(row.item_group_id),
    item_group_name: row.item_group_name ?? null,
    updated_at: toRfc3339Required(row.updated_at)
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

export async function listItemPrices(
  companyId: number,
  filters?: { outletId?: number; outletIds?: readonly number[]; isActive?: boolean; includeDefaults?: boolean }
) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT ip.id, ip.company_id, ip.outlet_id, ip.item_id, ip.price, ip.is_active, ip.updated_at, i.item_group_id, ig.name AS item_group_name " +
    "FROM item_prices ip " +
    "INNER JOIN items i ON i.id = ip.item_id AND i.company_id = ip.company_id " +
    "LEFT JOIN item_groups ig ON ig.id = i.item_group_id AND ig.company_id = ip.company_id " +
    "WHERE ip.company_id = ?";

  if (typeof filters?.outletId === "number") {
    if (filters.includeDefaults !== false) {
      sql += " AND (ip.outlet_id = ? OR ip.outlet_id IS NULL)";
      values.push(filters.outletId);
    } else {
      sql += " AND ip.outlet_id = ?";
      values.push(filters.outletId);
    }
  } else if (Array.isArray(filters?.outletIds)) {
    if (filters.outletIds.length === 0) {
      return [];
    }

    const outletPlaceholders = filters.outletIds.map(() => "?").join(", ");
    if (filters.includeDefaults !== false) {
      sql += ` AND (ip.outlet_id IN (${outletPlaceholders}) OR ip.outlet_id IS NULL)`;
      values.push(...filters.outletIds);
    } else {
      sql += ` AND ip.outlet_id IN (${outletPlaceholders})`;
      values.push(...filters.outletIds);
    }
  }

  if (typeof filters?.isActive === "boolean") {
    sql += " AND ip.is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY ip.outlet_id IS NULL ASC, ip.outlet_id DESC, ip.id ASC";

  const [rows] = await pool.execute<ItemPriceRow[]>(sql, values);
  return rows.map(normalizeItemPrice);
}

export async function listEffectiveItemPricesForOutlet(
  companyId: number,
  outletId: number,
  filters?: { isActive?: boolean }
) {
  const pool = getDbPool();
  const values: Array<number> = [outletId, outletId, companyId];

  let sql = `
    SELECT 
      COALESCE(override.id, def.id) AS id,
      COALESCE(override.company_id, def.company_id) AS company_id,
      COALESCE(override.outlet_id, ?) AS outlet_id,
      COALESCE(override.item_id, def.item_id) AS item_id,
      COALESCE(override.price, def.price) AS price,
      COALESCE(override.is_active, def.is_active) AS is_active,
      COALESCE(override.updated_at, def.updated_at) AS updated_at,
      i.item_group_id,
      ig.name AS item_group_name,
      CASE WHEN override.id IS NOT NULL THEN 1 ELSE 0 END AS is_override
    FROM items i
    LEFT JOIN item_prices override ON override.item_id = i.id 
      AND override.company_id = i.company_id 
      AND override.outlet_id = ?
    LEFT JOIN item_prices def ON def.item_id = i.id 
      AND def.company_id = i.company_id 
      AND def.outlet_id IS NULL
    LEFT JOIN item_groups ig ON ig.id = i.item_group_id AND ig.company_id = i.company_id
    WHERE i.company_id = ?
      AND (override.id IS NOT NULL OR def.id IS NOT NULL)
  `;

  if (typeof filters?.isActive === "boolean") {
    sql += " AND COALESCE(override.is_active, def.is_active) = ?";
    values.push(filters.isActive ? 1 : 0);
    sql += " AND i.is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY i.id ASC";

  const [rows] = await pool.execute<(ItemPriceRow & { is_override: number })[]>(sql, values);
  return rows.map((row) => {
    const normalized = normalizeItemPrice(row);
    return {
      ...normalized,
      outlet_id: normalized.outlet_id ?? outletId,
      is_override: row.is_override === 1
    };
  });
}

export async function findItemPriceById(companyId: number, itemPriceId: number) {
  const pool = getDbPool();
  return findItemPriceByIdWithExecutor(pool, companyId, itemPriceId);
}

export async function createItemPrice(
  companyId: number,
  input: {
    item_id: number;
    outlet_id: number | null;
    price: number;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    if (input.outlet_id === null && actor && actor.canManageCompanyDefaults !== true) {
      throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
    }

    await ensureCompanyItemExists(connection, companyId, input.item_id);

    if (input.outlet_id !== null) {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
    }

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [companyId, input.outlet_id, input.item_id, input.price, input.is_active === false ? 0 : 1]
      );

      const itemPrice = await findItemPriceByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!itemPrice) {
        throw new Error("Created item price not found");
      }

      await recordItemPriceAuditLog(connection, {
        companyId,
        outletId: itemPrice.outlet_id,
        actor,
        action: itemPriceAuditActions.create,
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
    outlet_id?: number | null;
    price?: number;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const fields: string[] = [];
  const values: Array<number | null> = [];

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

    if (actor && before.outlet_id !== null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    if (actor && before.outlet_id === null && actor.canManageCompanyDefaults !== true) {
      throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
    }

    if (typeof input.item_id === "number") {
      await ensureCompanyItemExists(connection, companyId, input.item_id);
      fields.push("item_id = ?");
      values.push(input.item_id);
    }

    if (Object.hasOwn(input, "outlet_id")) {
      if (input.outlet_id === null) {
        if (actor && actor.canManageCompanyDefaults !== true) {
          throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
        }
        fields.push("outlet_id = ?");
        values.push(null);
      } else if (typeof input.outlet_id === "number") {
        if (actor) {
          await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
        }
        await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
        fields.push("outlet_id = ?");
        values.push(input.outlet_id);
      }
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

      await recordItemPriceAuditLog(connection, {
        companyId,
        outletId: itemPrice.outlet_id,
        actor,
        action: itemPriceAuditActions.update,
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

    if (actor && before.outlet_id !== null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    if (actor && before.outlet_id === null && actor.canManageCompanyDefaults !== true) {
      throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM item_prices
       WHERE company_id = ?
         AND id = ?`,
      [companyId, itemPriceId]
    );

    await recordItemPriceAuditLog(connection, {
      companyId,
      outletId: before.outlet_id,
      actor,
      action: itemPriceAuditActions.delete,
      payload: {
        item_price_id: before.id,
        before
      }
    });

    return true;
  });
}
