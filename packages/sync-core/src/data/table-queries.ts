// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";
import { toRfc3339Required } from "@jurnapod/shared";

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
  db: DbConn,
  companyId: number,
  outletId: number
): Promise<OutletTableQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, code, name, zone, capacity, status, updated_at
     FROM outlet_tables 
     WHERE company_id = ? AND outlet_id = ?
     ORDER BY code ASC`,
    [companyId, outletId]
  );
  
  return rows.map((row) => ({
    table_id: Number(row.id),
    code: row.code,
    name: row.name,
    zone: row.zone,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status,
    updated_at: toRfc3339Required(row.updated_at)
  }));
}

/**
 * Get outlet tables changed since a specific version for incremental sync.
 */
export async function getOutletTablesChangedSince(
  db: DbConn,
  companyId: number,
  outletId: number,
  updatedSince: string
): Promise<OutletTableQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, code, name, zone, capacity, status, updated_at
     FROM outlet_tables 
     WHERE company_id = ? AND outlet_id = ? AND updated_at >= ?
     ORDER BY code ASC`,
    [companyId, outletId, updatedSince]
  );
  
  return rows.map((row) => ({
    table_id: Number(row.id),
    code: row.code,
    name: row.name,
    zone: row.zone,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status,
    updated_at: toRfc3339Required(row.updated_at)
  }));
}
