// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { KyselySchema } from "@jurnapod/db";
import { toUtcIso } from "@jurnapod/shared";

export type OutletTableQueryResult = {
  table_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
  updated_at: string;
};

/**
 * Get outlet tables for sync.
 */
export async function getOutletTablesForSync(
  db: KyselySchema,
  companyId: number,
  outletId: number
): Promise<OutletTableQueryResult[]> {
  const result = await db
    .selectFrom('outlet_tables')
    .select(['id', 'code', 'name', 'zone', 'capacity', 'status', 'updated_at'])
    .where('company_id', '=', companyId)
    .where('outlet_id', '=', outletId)
    .orderBy('code')
    .execute();
  
  return result.map((row) => ({
    table_id: Number(row.id),
    code: row.code,
    name: row.name,
    zone: row.zone,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status as OutletTableQueryResult['status'],
    updated_at: toUtcIso.dateLike(row.updated_at as Date) as string
  }));
}

/**
 * Get outlet tables changed since a specific version for incremental sync.
 */
export async function getOutletTablesChangedSince(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  updatedSince: string
): Promise<OutletTableQueryResult[]> {
  const result = await db
    .selectFrom('outlet_tables')
    .select(['id', 'code', 'name', 'zone', 'capacity', 'status', 'updated_at'])
    .where('company_id', '=', companyId)
    .where('outlet_id', '=', outletId)
    .where('updated_at', '>=', updatedSince as any)
    .orderBy('code')
    .execute();
  
  return result.map((row) => ({
    table_id: Number(row.id),
    code: row.code,
    name: row.name,
    zone: row.zone,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status as OutletTableQueryResult['status'],
    updated_at: toUtcIso.dateLike(row.updated_at as Date) as string
  }));
}
