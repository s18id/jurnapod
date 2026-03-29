// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";
import { toRfc3339Required } from "@jurnapod/shared";

export type ItemQueryResult = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  item_group_id: number | null;
  barcode: string | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: boolean;
  updated_at: string;
};

/**
 * Get all items for a company (for full sync).
 */
export async function getItemsForSync(db: DbConn, companyId: number): Promise<ItemQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, sku, name, item_type, item_group_id, barcode, 
            cogs_account_id, inventory_asset_account_id, is_active, updated_at
     FROM items 
     WHERE company_id = ? AND is_active = 1`,
    [companyId]
  );
  
  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    item_type: row.item_type,
    item_group_id: row.item_group_id == null ? null : Number(row.item_group_id),
    barcode: row.barcode,
    cogs_account_id: row.cogs_account_id == null ? null : Number(row.cogs_account_id),
    inventory_asset_account_id: row.inventory_asset_account_id == null ? null : Number(row.inventory_asset_account_id),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  }));
}

/**
 * Get items changed since a specific version for incremental sync.
 */
export async function getItemsChangedSince(
  db: DbConn,
  companyId: number,
  updatedSince: string
): Promise<ItemQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, sku, name, item_type, item_group_id, barcode, 
            cogs_account_id, inventory_asset_account_id, is_active, updated_at
     FROM items 
     WHERE company_id = ? AND updated_at >= ?`,
    [companyId, updatedSince]
  );
  
  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    item_type: row.item_type,
    item_group_id: row.item_group_id == null ? null : Number(row.item_group_id),
    barcode: row.barcode,
    cogs_account_id: row.cogs_account_id == null ? null : Number(row.cogs_account_id),
    inventory_asset_account_id: row.inventory_asset_account_id == null ? null : Number(row.inventory_asset_account_id),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  }));
}