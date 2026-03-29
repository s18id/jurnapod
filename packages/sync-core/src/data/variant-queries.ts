// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";
import { toRfc3339Required } from "@jurnapod/shared";

export type ItemVariantQueryResult = {
  id: number;
  company_id: number;
  item_id: number;
  sku: string | null;
  variant_name: string | null;
  price_override: number | null;
  stock_quantity: number | null;
  is_active: boolean;
  updated_at: string;
};

/**
 * Get all variants for active items of a company.
 */
export async function getVariantsForSync(db: DbConn, companyId: number): Promise<ItemVariantQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT iv.id, iv.company_id, iv.item_id, iv.sku, iv.variant_name, 
            iv.price_override, iv.stock_quantity, iv.is_active, iv.updated_at
     FROM item_variants iv
     INNER JOIN items i ON i.id = iv.item_id
     WHERE iv.company_id = ? AND i.is_active = 1 AND iv.is_active = 1
     ORDER BY iv.item_id, iv.variant_name`,
    [companyId]
  );
  
  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    item_id: Number(row.item_id),
    sku: row.sku,
    variant_name: row.variant_name,
    price_override: row.price_override == null ? null : Number(row.price_override),
    stock_quantity: row.stock_quantity == null ? null : Number(row.stock_quantity),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  }));
}

/**
 * Get variants changed since a specific version for incremental sync.
 */
export async function getVariantsChangedSince(
  db: DbConn,
  companyId: number,
  updatedSince: string
): Promise<ItemVariantQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT iv.id, iv.company_id, iv.item_id, iv.sku, iv.variant_name, 
            iv.price_override, iv.stock_quantity, iv.is_active, iv.updated_at
     FROM item_variants iv
     INNER JOIN items i ON i.id = iv.item_id
     WHERE iv.company_id = ? AND iv.updated_at >= ? AND i.is_active = 1 AND iv.is_active = 1
     ORDER BY iv.item_id, iv.variant_name`,
    [companyId, updatedSince]
  );
  
  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    item_id: Number(row.item_id),
    sku: row.sku,
    variant_name: row.variant_name,
    price_override: row.price_override == null ? null : Number(row.price_override),
    stock_quantity: row.stock_quantity == null ? null : Number(row.stock_quantity),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  }));
}

export type VariantPriceQueryResult = {
  id: number;
  item_id: number;
  variant_id: number | null;
  outlet_id: number | null;
  price: number;
  is_active: boolean;
  updated_at: string;
};

/**
 * Get variant prices for a specific outlet (outlet-specific + company defaults).
 */
export async function getVariantPricesForOutlet(
  db: DbConn,
  companyId: number,
  outletId: number
): Promise<VariantPriceQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT DISTINCT
       COALESCE(vp.id, dp.id) AS id,
       COALESCE(vp.item_id, dp.item_id) AS item_id,
       COALESCE(vp.variant_id, dp.variant_id) AS variant_id,
       COALESCE(vp.outlet_id, ?) AS outlet_id,
       COALESCE(vp.price, dp.price) AS price,
       COALESCE(vp.is_active, dp.is_active) AS is_active,
       GREATEST(COALESCE(vp.updated_at, '1970-01-01'), COALESCE(dp.updated_at, '1970-01-01')) AS updated_at
     FROM items i
     LEFT JOIN variant_prices vp ON vp.item_id = i.id AND vp.outlet_id = ?
     LEFT JOIN variant_prices dp ON dp.item_id = i.id AND dp.outlet_id IS NULL AND dp.company_id = ?
     WHERE i.company_id = ?
       AND i.is_active = 1
       AND (vp.is_active = 1 OR (vp.id IS NULL AND dp.is_active = 1))
     ORDER BY i.id, variant_id`,
    [outletId, outletId, companyId, companyId]
  );
  
  return rows.map((row) => ({
    id: Number(row.id),
    item_id: Number(row.item_id),
    variant_id: row.variant_id == null ? null : Number(row.variant_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    price: Number(row.price),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  }));
}
