// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDbPool } from "./db";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

/**
 * Module settings for a company
 */
export interface ModuleSettings {
  code: string;
  name: string;
  enabled: boolean;
  config_json: string | null;
}

/**
 * Error thrown when a module code doesn't exist
 */
export class ModuleNotFoundError extends Error {
  constructor(code: string) {
    super(`Module ${code} not found`);
    this.name = "ModuleNotFoundError";
  }
}

type ModuleRow = RowDataPacket & {
  id: number;
};

type CompanyModuleRow = RowDataPacket & {
  code: string;
  name: string;
  enabled: number;
  config_json: string | null;
};

type EnabledRow = RowDataPacket & {
  enabled: number;
};

/**
 * List all modules for a company with their settings.
 *
 * @param companyId - The company ID
 * @param connection - Optional database connection for transaction support
 * @returns Array of module settings ordered by code
 */
export async function listCompanyModules(
  companyId: number,
  connection?: PoolConnection
): Promise<ModuleSettings[]> {
  const db = connection || getDbPool();

  const [rows] = await db.execute<CompanyModuleRow[]>(
    `SELECT m.code, m.name, cm.enabled, cm.config_json
     FROM modules m
     INNER JOIN company_modules cm ON cm.module_id = m.id
     WHERE cm.company_id = ?
     ORDER BY m.code ASC`,
    [companyId]
  );

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    enabled: Boolean(row.enabled),
    config_json: row.config_json
  }));
}

/**
 * Get module ID by module code.
 * Returns null if module doesn't exist.
 *
 * @param code - The module code
 * @param connection - Optional database connection for transaction support
 * @returns Module ID or null if not found
 */
export async function getModuleIdByCode(
  code: string,
  connection?: PoolConnection
): Promise<number | null> {
  const db = connection || getDbPool();

  const [rows] = await db.execute<ModuleRow[]>(
    `SELECT id FROM modules WHERE code = ? LIMIT 1`,
    [code]
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0].id;
}

/**
 * Update or insert company module settings.
 * Uses ON DUPLICATE KEY UPDATE for upsert behavior.
 *
 * @param companyId - The company ID
 * @param moduleCode - The module code
 * @param enabled - Whether the module is enabled
 * @param configJson - Optional JSON configuration string
 * @param connection - Optional database connection for transaction support
 * @throws ModuleNotFoundError - If the module code doesn't exist
 */
export async function updateCompanyModule(
  companyId: number,
  moduleCode: string,
  enabled: boolean,
  configJson: string | null,
  connection?: PoolConnection
): Promise<void> {
  const db = connection || getDbPool();

  // First get the module ID by code
  const moduleId = await getModuleIdByCode(moduleCode, connection);

  if (moduleId === null) {
    throw new ModuleNotFoundError(moduleCode);
  }

  await db.execute<ResultSetHeader>(
    `INSERT INTO company_modules (company_id, module_id, enabled, config_json, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       config_json = VALUES(config_json),
       updated_at = CURRENT_TIMESTAMP`,
    [companyId, moduleId, enabled ? 1 : 0, configJson]
  );
}

/**
 * Check if a module is enabled for a company.
 *
 * @param companyId - The company ID
 * @param moduleCode - The module code
 * @returns True if module is enabled, false otherwise
 */
export async function isModuleEnabled(
  companyId: number,
  moduleCode: string
): Promise<boolean> {
  const pool = getDbPool();

  const [rows] = await pool.execute<EnabledRow[]>(
    `SELECT cm.enabled
     FROM company_modules cm
     INNER JOIN modules m ON m.id = cm.module_id
     WHERE cm.company_id = ? AND m.code = ?`,
    [companyId, moduleCode]
  );

  if (rows.length === 0) {
    return false;
  }

  return Boolean(rows[0].enabled);
}
