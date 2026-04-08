// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item service implementation.
 * 
 * All methods require company_id scoping as a fundamental invariant.
 */

import { sql } from "kysely";
import { toRfc3339Required } from "@jurnapod/shared";
import { withTransactionRetry, type Transaction } from "@jurnapod/db";
import type { KyselySchema } from "@jurnapod/db";
import type { ItemService } from "../interfaces/item-service.js";
import type { Item, ItemVariantStats, MutationAuditActor, ItemType } from "../interfaces/index.js";
import { InventoryConflictError, InventoryReferenceError } from "../errors.js";
import { getInventoryDb } from "../db.js";

// Re-export types for convenience
export type { Item, ItemVariantStats, ItemType };
export type { MutationAuditActor } from "../interfaces/shared.js";

const itemAuditActions = {
  create: "MASTER_DATA_ITEM_CREATE",
  update: "MASTER_DATA_ITEM_UPDATE",
  delete: "MASTER_DATA_ITEM_DELETE"
} as const;

async function recordItemAuditLog(
  db: KyselySchema,
  input: {
    companyId: number;
    actor: MutationAuditActor | undefined;
    action: (typeof itemAuditActions)[keyof typeof itemAuditActions];
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await sql`
    INSERT INTO audit_logs (
      company_id,
      outlet_id,
      user_id,
      action,
      result,
      success,
      ip_address,
      payload_json
    ) VALUES (
      ${input.companyId},
      NULL,
      ${input.actor?.userId ?? null},
      ${input.action},
      'SUCCESS',
      1,
      NULL,
      ${JSON.stringify(input.payload)}
    )
  `.execute(db);
}

type NormalizedItem = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  item_group_id: number | null;
  barcode: string | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: boolean;
  updated_at: string;
};

function normalizeItem(row: {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  item_type: string;
  item_group_id: number | null;
  barcode: string | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: number;
  updated_at: string | Date;
}): NormalizedItem {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    type: row.item_type as "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE",
    item_group_id: row.item_group_id == null ? null : Number(row.item_group_id),
    barcode: row.barcode,
    cogs_account_id: row.cogs_account_id == null ? null : Number(row.cogs_account_id),
    inventory_asset_account_id: row.inventory_asset_account_id == null ? null : Number(row.inventory_asset_account_id),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at)
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
    .select("id")
    .executeTakeFirst();

  if (!row) {
    throw new InventoryReferenceError("Account not found for company");
  }
}

async function ensureCompanyItemGroupExists(
  db: KyselySchema,
  companyId: number,
  groupId: number
): Promise<void> {
  const row = await db
    .selectFrom("item_groups")
    .where("id", "=", groupId)
    .where("company_id", "=", companyId)
    .select("id")
    .executeTakeFirst();

  if (!row) {
    throw new InventoryReferenceError("Item group not found for company");
  }
}

type ItemRowForNormalize = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  item_type: string;
  item_group_id: number | null;
  barcode: string | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: number;
  updated_at: string | Date;
};

async function findItemByIdWithTransaction(
  db: Transaction | KyselySchema,
  companyId: number,
  itemId: number,
  options?: { forUpdate?: boolean }
): Promise<NormalizedItem | null> {
  let row: ItemRowForNormalize | undefined;
  
  if (options?.forUpdate) {
    const rows = await sql<ItemRowForNormalize>`
      SELECT id, company_id, sku, name, item_type, item_group_id, barcode, cogs_account_id, inventory_asset_account_id, is_active, updated_at
      FROM items
      WHERE company_id = ${companyId} AND id = ${itemId}
      LIMIT 1 FOR UPDATE
    `.execute(db);
    row = rows.rows[0];
  } else {
    const result = await db
      .selectFrom("items")
      .where("company_id", "=", companyId)
      .where("id", "=", itemId)
      .select([
        "id",
        "company_id",
        "sku",
        "name",
        "item_type",
        "item_group_id",
        "barcode",
        "cogs_account_id",
        "inventory_asset_account_id",
        "is_active",
        "updated_at"
      ])
      .executeTakeFirst();
    row = result as ItemRowForNormalize | undefined;
  }

  if (!row) {
    return null;
  }

  return normalizeItem(row);
}

/**
 * Item service implementation.
 */
export class ItemServiceImpl implements ItemService {
  async listItems(companyId: number, filters?: { isActive?: boolean }): Promise<Item[]> {
    const db = getInventoryDb();

    let query = db
      .selectFrom("items")
      .where("company_id", "=", companyId)
      .select([
        "id",
        "company_id",
        "sku",
        "name",
        "item_type",
        "item_group_id",
        "barcode",
        "cogs_account_id",
        "inventory_asset_account_id",
        "is_active",
        "updated_at"
      ]);

    if (typeof filters?.isActive === "boolean") {
      query = query.where("is_active", "=", filters.isActive ? 1 : 0);
    }

    const rows = await query.orderBy("id", "asc").execute();
    return rows.map(normalizeItem);
  }

  async findItemById(companyId: number, itemId: number): Promise<Item | null> {
    const db = getInventoryDb();
    return findItemByIdWithTransaction(db, companyId, itemId);
  }

  async createItem(
    companyId: number,
    input: {
      sku?: string | null;
      name: string;
      type: ItemType;
      item_group_id?: number | null;
      cogs_account_id?: number | null;
      inventory_asset_account_id?: number | null;
      is_active?: boolean;
      track_stock?: boolean;
    },
    actor?: MutationAuditActor
  ): Promise<Item> {
    const db = getInventoryDb();

    return withTransactionRetry(db, async (trx) => {
      try {
        if (typeof input.item_group_id === "number") {
          await ensureCompanyItemGroupExists(trx, companyId, input.item_group_id);
        }

        if (typeof input.cogs_account_id === "number") {
          await ensureCompanyAccountExists(trx, companyId, input.cogs_account_id);
        }

        if (typeof input.inventory_asset_account_id === "number") {
          await ensureCompanyAccountExists(trx, companyId, input.inventory_asset_account_id);
        }

        const result = await trx
          .insertInto("items")
          .values({
            company_id: companyId,
            sku: input.sku ?? null,
            name: input.name,
            item_type: input.type,
            item_group_id: input.item_group_id ?? null,
            cogs_account_id: input.cogs_account_id ?? null,
            inventory_asset_account_id: input.inventory_asset_account_id ?? null,
            is_active: input.is_active === false ? 0 : 1,
            track_stock: input.track_stock === true ? 1 : 0
          })
          .executeTakeFirst();

        const item = await findItemByIdWithTransaction(trx, companyId, Number(result.insertId));
        if (!item) {
          throw new Error("Created item not found");
        }

        await recordItemAuditLog(trx, {
          companyId,
          actor,
          action: itemAuditActions.create,
          payload: {
            item_id: item.id,
            after: item
          }
        });

        return item;
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'errno' in error && error.errno === 1062) {
          throw new InventoryConflictError("Duplicate item");
        }
        throw error;
      }
    });
  }

  async updateItem(
    companyId: number,
    itemId: number,
    input: {
      sku?: string | null;
      name?: string;
      type?: ItemType;
      item_group_id?: number | null;
      cogs_account_id?: number | null;
      inventory_asset_account_id?: number | null;
      is_active?: boolean;
    },
    actor?: MutationAuditActor
  ): Promise<Item> {
    const db = getInventoryDb();

    return withTransactionRetry(db, async (trx) => {
      try {
        if (typeof input.item_group_id === "number") {
          await ensureCompanyItemGroupExists(trx, companyId, input.item_group_id);
        }

        if (typeof input.cogs_account_id === "number") {
          await ensureCompanyAccountExists(trx, companyId, input.cogs_account_id);
        }

        if (typeof input.inventory_asset_account_id === "number") {
          await ensureCompanyAccountExists(trx, companyId, input.inventory_asset_account_id);
        }

        const beforeItem = await findItemByIdWithTransaction(trx, companyId, itemId);
        if (!beforeItem) {
          throw new InventoryReferenceError("Item not found");
        }

        const updates: Record<string, unknown> = {};

        if (Object.hasOwn(input, "sku")) {
          updates.sku = input.sku ?? null;
        }

        if (typeof input.name === "string") {
          updates.name = input.name;
        }

        if (typeof input.type === "string") {
          updates.item_type = input.type;
        }

        if (Object.hasOwn(input, "item_group_id") && input.item_group_id !== undefined) {
          updates.item_group_id = typeof input.item_group_id === "number" ? input.item_group_id : null;
        }

        if (Object.hasOwn(input, "cogs_account_id") && input.cogs_account_id !== undefined) {
          updates.cogs_account_id = input.cogs_account_id ?? null;
        }

        if (Object.hasOwn(input, "inventory_asset_account_id") && input.inventory_asset_account_id !== undefined) {
          updates.inventory_asset_account_id = input.inventory_asset_account_id ?? null;
        }

        if (typeof input.is_active === "boolean") {
          updates.is_active = input.is_active ? 1 : 0;
        }

        if (Object.keys(updates).length === 0) {
          throw new Error("No fields to update");
        }

        await trx
          .updateTable("items")
          .set(updates)
          .where("company_id", "=", companyId)
          .where("id", "=", itemId)
          .execute();

        const item = await findItemByIdWithTransaction(trx, companyId, itemId);
        if (!item) {
          throw new Error("Updated item not found");
        }

        if (typeof input.is_active === "boolean" && input.is_active === false) {
          await trx
            .updateTable("item_prices")
            .set({ is_active: 0 })
            .where("item_id", "=", itemId)
            .where("company_id", "=", companyId)
            .execute();
        }

        await recordItemAuditLog(trx, {
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
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'errno' in error && error.errno === 1062) {
          throw new InventoryConflictError("Duplicate item");
        }
        throw error;
      }
    });
  }

  async deleteItem(companyId: number, itemId: number, actor?: MutationAuditActor): Promise<boolean> {
    const db = getInventoryDb();

    return withTransactionRetry(db, async (trx) => {
      const before = await findItemByIdWithTransaction(trx, companyId, itemId, {
        forUpdate: true
      });
      if (!before) {
        return false;
      }

      await trx
        .deleteFrom("items")
        .where("company_id", "=", companyId)
        .where("id", "=", itemId)
        .execute();

      await recordItemAuditLog(trx, {
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

  async getItemVariantStats(companyId: number, itemIds: number[]): Promise<ItemVariantStats[]> {
    if (itemIds.length === 0) {
      return [];
    }

    const db = getInventoryDb();

    const rows = await sql<{ item_id: number; variant_count: number; total_stock: number }>`
      SELECT 
        i.id as item_id,
        COALESCE(COUNT(iv.id), 0) as variant_count,
        COALESCE(SUM(iv.stock_quantity), 0) as total_stock
      FROM items i
      LEFT JOIN item_variants iv ON iv.item_id = i.id
      WHERE i.company_id = ${companyId} AND i.id IN (${sql.join(itemIds.map(id => sql`${id}`))})
      GROUP BY i.id
      ORDER BY i.id ASC
    `.execute(db);

    return rows.rows.map((row) => ({
      item_id: Number(row.item_id),
      variant_count: Number(row.variant_count),
      total_stock: Number(row.total_stock),
      has_variants: Number(row.variant_count) > 0
    }));
  }
}

// Default instance for convenience
export const itemService = new ItemServiceImpl();