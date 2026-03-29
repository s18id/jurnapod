// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";

/**
 * Get current sync data version for a company.
 * This is the version tracking for sync_data_versions table.
 */
export async function getSyncDataVersion(db: DbConn, companyId: number): Promise<number> {
  const row = await db.queryOne<RowDataPacket & { current_version: number }>(
    `SELECT current_version FROM sync_data_versions WHERE company_id = ?`,
    [companyId]
  );
  return Number(row?.current_version ?? 0);
}

/**
 * Increment sync data version for a company.
 * Returns the new version number.
 */
export async function incrementSyncDataVersion(db: DbConn, companyId: number): Promise<number> {
  await db.execute(
    `INSERT INTO sync_data_versions (company_id, current_version) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE current_version = current_version + 1`,
    [companyId]
  );
  return getSyncDataVersion(db, companyId);
}
