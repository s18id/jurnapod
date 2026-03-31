// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Validation Library
 *
 * Validation functions for import operations.
 * Separates validation concerns from import route.
 */

import { getDb } from "../db.js";

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
 * @returns Result with exists flag and item ID if found
 */
export async function checkSkuExists(
  companyId: number,
  sku: string
): Promise<SkuCheckResult> {
  const db = getDb();

  const row = await db
    .selectFrom("items")
    .select(["id"])
    .where("company_id", "=", companyId)
    .where("sku", "=", sku)
    .executeTakeFirst();

  if (!row) {
    return { exists: false };
  }

  return {
    exists: true,
    itemId: row.id
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
 * @returns Result with exists flag and item ID if found
 */
export async function checkItemExistsBySku(
  companyId: number,
  sku: string
): Promise<ItemCheckResult> {
  // Same implementation as checkSkuExists but semantically different use case
  const result = await checkSkuExists(companyId, sku);
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
 * @returns Map of SKU to item ID (only existing SKUs are in the map)
 */
export async function batchCheckSkusExist(
  companyId: number,
  skus: string[]
): Promise<Map<string, number>> {
  const db = getDb();
  const result = new Map<string, number>();

  if (skus.length === 0) {
    return result;
  }

  const rows = await db
    .selectFrom("items")
    .select(["sku", "id"])
    .where("company_id", "=", companyId)
    .where("sku", "in", skus)
    .execute();

  for (const row of rows) {
    if (row.sku !== null) {
      result.set(row.sku, row.id);
    }
  }

  return result;
}
