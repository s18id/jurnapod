// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { toRfc3339Required } from "@jurnapod/shared";
import { getDbPool } from "../db.js";
import { DatabaseConflictError, DatabaseReferenceError } from "../master-data-errors.js";
import {
  isMysqlError,
  mysqlDuplicateErrorCode,
  recordMasterDataAuditLog,
  withTransaction
} from "../shared/master-data-utils.js";

type ItemRow = RowDataPacket & {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  item_group_id: number | null;
  barcode: string | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: number;
  updated_at: string;
};

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

const itemAuditActions = {
  create: "MASTER_DATA_ITEM_CREATE",
  update: "MASTER_DATA_ITEM_UPDATE",
  delete: "MASTER_DATA_ITEM_DELETE"
} as const;

async function recordItemAuditLog(
  executor: QueryExecutor,
  input: {
    companyId: number;
    actor: MutationAuditActor | undefined;
    action: (typeof itemAuditActions)[keyof typeof itemAuditActions];
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await recordMasterDataAuditLog(executor, {
    companyId: input.companyId,
    outletId: null,
    actor: input.actor,
    action: input.action,
    payload: input.payload
  });
}

function normalizeItem(row: ItemRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    type: row.item_type,
    item_group_id: row.item_group_id == null ? null : Number(row.item_group_id),
    barcode: row.barcode,
    cogs_account_id: row.cogs_account_id == null ? null : Number(row.cogs_account_id),
    inventory_asset_account_id: row.inventory_asset_account_id == null ? null : Number(row.inventory_asset_account_id),
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

async function ensureCompanyItemGroupExists(
  executor: QueryExecutor,
  companyId: number,
  groupId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM item_groups
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [groupId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Item group not found for company");
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
    `SELECT id, company_id, sku, name, item_type, item_group_id, cogs_account_id, inventory_asset_account_id, is_active, updated_at
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

export async function listItems(companyId: number, filters?: { isActive?: boolean }) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, sku, name, item_type, item_group_id, barcode, cogs_account_id, inventory_asset_account_id, is_active, updated_at FROM items WHERE company_id = ?";

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
    item_group_id?: number | null;
    cogs_account_id?: number | null;
    inventory_asset_account_id?: number | null;
    is_active?: boolean;
    track_stock?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    try {
      if (typeof input.item_group_id === "number") {
        await ensureCompanyItemGroupExists(connection, companyId, input.item_group_id);
      }

      if (typeof input.cogs_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.cogs_account_id);
      }

      if (typeof input.inventory_asset_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.inventory_asset_account_id);
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, sku, name, item_type, item_group_id, cogs_account_id, inventory_asset_account_id, is_active, track_stock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          input.sku ?? null,
          input.name,
          input.type,
          input.item_group_id ?? null,
          input.cogs_account_id ?? null,
          input.inventory_asset_account_id ?? null,
          input.is_active === false ? 0 : 1,
          input.track_stock === true ? 1 : 0
        ]
      );

      const item = await findItemByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!item) {
        throw new Error("Created item not found");
      }

      await recordItemAuditLog(connection, {
        companyId,
        actor,
        action: itemAuditActions.create,
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
    item_group_id?: number | null;
    cogs_account_id?: number | null;
    inventory_asset_account_id?: number | null;
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

  if (Object.hasOwn(input, "item_group_id") && input.item_group_id !== undefined) {
    fields.push("item_group_id = ?");
    values.push(typeof input.item_group_id === "number" ? input.item_group_id : null);
  }

  if (Object.hasOwn(input, "cogs_account_id") && input.cogs_account_id !== undefined) {
    fields.push("cogs_account_id = ?");
    values.push(input.cogs_account_id ?? null);
  }

  if (Object.hasOwn(input, "inventory_asset_account_id") && input.inventory_asset_account_id !== undefined) {
    fields.push("inventory_asset_account_id = ?");
    values.push(input.inventory_asset_account_id ?? null);
  }

  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  if (fields.length === 0) {
    throw new Error("No fields to update");
  }

  values.push(companyId, itemId);

  return withTransaction(async (connection) => {
    try {
      if (typeof input.item_group_id === "number") {
        await ensureCompanyItemGroupExists(connection, companyId, input.item_group_id);
      }

      if (typeof input.cogs_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.cogs_account_id);
      }

      if (typeof input.inventory_asset_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.inventory_asset_account_id);
      }

      const beforeItem = await findItemByIdWithExecutor(connection, companyId, itemId);
      if (!beforeItem) {
        throw new DatabaseReferenceError("Item not found");
      }

      await connection.execute(`UPDATE items SET ${fields.join(", ")} WHERE company_id = ? AND id = ?`, values);

      const item = await findItemByIdWithExecutor(connection, companyId, itemId);
      if (!item) {
        throw new Error("Updated item not found");
      }

      if (typeof input.is_active === "boolean" && input.is_active === false) {
        await connection.execute<ResultSetHeader>(
          `UPDATE item_prices SET is_active = 0 WHERE item_id = ? AND company_id = ?`,
          [itemId, companyId]
        );
      }

      await recordItemAuditLog(connection, {
        companyId,
        actor,
        action: itemAuditActions.update,
        payload: {
          item_id: itemId,
          before: beforeItem,
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

    await recordItemAuditLog(connection, {
      companyId,
      actor,
      action: itemAuditActions.delete,
      payload: {
        item_id: before.id,
        before
      }
    });

    return true;
  });
}

export type ItemVariantStats = {
  item_id: number;
  variant_count: number;
  total_stock: number;
  has_variants: boolean;
};

export async function getItemVariantStats(companyId: number, itemIds: number[]): Promise<ItemVariantStats[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const pool = getDbPool();
  const placeholders = itemIds.map(() => "?").join(",");

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       i.id as item_id,
       COALESCE(COUNT(iv.id), 0) as variant_count,
       COALESCE(SUM(iv.stock_quantity), 0) as total_stock
     FROM items i
     LEFT JOIN item_variants iv ON iv.item_id = i.id
     WHERE i.company_id = ? AND i.id IN (${placeholders})
     GROUP BY i.id
     ORDER BY i.id ASC`,
    [companyId, ...itemIds]
  );

  return rows.map((row) => ({
    item_id: Number(row.item_id),
    variant_count: Number(row.variant_count),
    total_stock: Number(row.total_stock),
    has_variants: Number(row.variant_count) > 0
  }));
}
