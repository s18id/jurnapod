// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { KyselySchema } from "@jurnapod/db";
import { toUtcIso } from "@jurnapod/shared";

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
export async function getVariantsForSync(db: KyselySchema, companyId: number): Promise<ItemVariantQueryResult[]> {
  const result = await db
    .selectFrom('item_variants as iv')
    .innerJoin('items as i', 'i.id', 'iv.item_id')
    .select(['iv.id', 'iv.company_id', 'iv.item_id', 'iv.sku', 'iv.variant_name', 'iv.price_override', 'iv.stock_quantity', 'iv.is_active', 'iv.updated_at'])
    .where('iv.company_id', '=', companyId)
    .where('i.is_active', '=', 1)
    .where('iv.is_active', '=', 1)
    .orderBy('iv.item_id')
    .orderBy('iv.variant_name')
    .execute();
  
  return result.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    item_id: Number(row.item_id),
    sku: row.sku,
    variant_name: row.variant_name,
    price_override: row.price_override == null ? null : Number(row.price_override),
    stock_quantity: row.stock_quantity == null ? null : Number(row.stock_quantity),
    is_active: row.is_active === 1,
    updated_at: toUtcIso.dateLike(row.updated_at as Date) as string
  }));
}

/**
 * Get variants changed since a specific version for incremental sync.
 */
export async function getVariantsChangedSince(
  db: KyselySchema,
  companyId: number,
  updatedSince: string
): Promise<ItemVariantQueryResult[]> {
  const result = await db
    .selectFrom('item_variants as iv')
    .innerJoin('items as i', 'i.id', 'iv.item_id')
    .select(['iv.id', 'iv.company_id', 'iv.item_id', 'iv.sku', 'iv.variant_name', 'iv.price_override', 'iv.stock_quantity', 'iv.is_active', 'iv.updated_at'])
    .where('iv.company_id', '=', companyId)
    .where('iv.updated_at', '>=', updatedSince as any)
    .where('i.is_active', '=', 1)
    .where('iv.is_active', '=', 1)
    .orderBy('iv.item_id')
    .orderBy('iv.variant_name')
    .execute();
  
  return result.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    item_id: Number(row.item_id),
    sku: row.sku,
    variant_name: row.variant_name,
    price_override: row.price_override == null ? null : Number(row.price_override),
    stock_quantity: row.stock_quantity == null ? null : Number(row.stock_quantity),
    is_active: row.is_active === 1,
    updated_at: toUtcIso.dateLike(row.updated_at as Date) as string
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
 * Uses item_prices table with variant_id IS NOT NULL filter.
 * Returns outlet-specific prices first, then company-default prices (no outlet).
 */
export async function getVariantPricesForOutlet(
  db: KyselySchema,
  companyId: number,
  outletId: number
): Promise<VariantPriceQueryResult[]> {
  const result = await db
    .selectFrom('item_prices as ip')
    .select(['ip.id', 'ip.item_id', 'ip.variant_id', 'ip.outlet_id', 'ip.price', 'ip.is_active', 'ip.updated_at'])
    .where('ip.company_id', '=', companyId)
    .where('ip.variant_id', 'is not', null)
    .where('ip.is_active', '=', 1)
    .where((eb) => eb.or([
      eb('ip.outlet_id', '=', outletId),
      eb('ip.outlet_id', 'is', null)
    ]))
    .orderBy('ip.item_id')
    .orderBy('ip.variant_id')
    .orderBy('ip.outlet_id', 'desc')
    .execute();
  
  return result.map((row) => ({
    id: Number(row.id),
    item_id: Number(row.item_id),
    variant_id: row.variant_id == null ? null : Number(row.variant_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    price: Number(row.price),
    is_active: row.is_active === 1,
    updated_at: toUtcIso.dateLike(row.updated_at as Date) as string
  }));
}
