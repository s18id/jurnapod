// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Validation Library
 *
 * Validation functions for import operations.
 * Separates validation concerns from import route.
 */

import { getDbPool } from "../db.js";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of SKU existence check
 */
export interface SkuCheckResult {
  exists: boolean;
  itemId?: number;
}

/**
 * Result of item existence check by SKU
 */
export interface ItemCheckResult {
  exists: boolean;
  itemId?: number;
}

// ============================================================================
// SKU Validation
// ============================================================================

/**
 * Check if a SKU already exists in the company.
 * Used for validating item imports to prevent duplicate SKUs.
 *
 * @param companyId - Company ID to scope the check
 * @param sku - SKU to check
 * @param connection - Optional database connection for transactions
 * @returns Result with exists flag and item ID if found
 */
export async function checkSkuExists(
  companyId: number,
  sku: string,
  connection?: PoolConnection
): Promise<SkuCheckResult> {
  const db = connection || getDbPool();

  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM items WHERE company_id = ? AND sku = ? LIMIT 1",
    [companyId, sku]
  );

  if (rows.length === 0) {
    return { exists: false };
  }

  return {
    exists: true,
    itemId: rows[0].id
  };
}

// ============================================================================
// Item Validation
// ============================================================================

/**
 * Check if an item exists by SKU.
 * Used for validating price imports (prices need existing items).
 *
 * @param companyId - Company ID to scope the check
 * @param sku - Item SKU to check
 * @param connection - Optional database connection for transactions
 * @returns Result with exists flag and item ID if found
 */
export async function checkItemExistsBySku(
  companyId: number,
  sku: string,
  connection?: PoolConnection
): Promise<ItemCheckResult> {
  // Same implementation as checkSkuExists but semantically different use case
  const result = await checkSkuExists(companyId, sku, connection);
  return {
    exists: result.exists,
    itemId: result.itemId
  };
}

// ============================================================================
// Batch Validation
// ============================================================================

/**
 * Check existence of multiple SKUs in batch.
 * More efficient than individual checks for large datasets.
 *
 * @param companyId - Company ID to scope the check
 * @param skus - Array of SKUs to check
 * @param connection - Optional database connection for transactions
 * @returns Map of SKU to item ID (only existing SKUs are in the map)
 */
export async function batchCheckSkusExist(
  companyId: number,
  skus: string[],
  connection?: PoolConnection
): Promise<Map<string, number>> {
  const db = connection || getDbPool();
  const result = new Map<string, number>();

  if (skus.length === 0) {
    return result;
  }

  const placeholders = skus.map(() => "?").join(",");
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT sku, id FROM items WHERE company_id = ? AND sku IN (${placeholders})`,
    [companyId, ...skus]
  );

  for (const row of rows) {
    result.set(String(row.sku), Number(row.id));
  }

  return result;
}
