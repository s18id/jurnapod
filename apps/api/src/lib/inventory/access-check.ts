// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Item Access Check Library
 * 
 * Validates access to inventory items based on company scoping.
 * Items are scoped to companies; outlet scoping is handled at the price level.
 */

import { sql } from "kysely";
import { getDb } from "../db";

/**
 * Result of an item access check
 */
export interface AccessCheckResult {
  /** Whether access is granted */
  hasAccess: boolean;
  /** Reason code when access is denied */
  reason?: "not_found" | "wrong_company";
}

/**
 * Check if a user has access to an inventory item.
 * 
 * Access is granted when:
 * - Item exists
 * - Item belongs to the specified company
 * 
 * Note: Items are company-scoped. Outlet-level access control for items
 * is handled at the item_prices level (where outlet_id is relevant).
 * 
 * @param itemId - Item ID to check
 * @param companyId - Company ID for scoping
 * @returns Access check result with reason if denied
 */
export async function checkItemAccess(
  itemId: number,
  companyId: number
): Promise<AccessCheckResult> {
  const db = getDb();

  const result = await sql`SELECT i.id
     FROM items i
     WHERE i.id = ${itemId}
       AND i.company_id = ${companyId}
     LIMIT 1`.execute(db);

  if (result.rows.length === 0) {
    // Item not found - could be non-existent or belong to different company
    return { hasAccess: false, reason: "not_found" };
  }

  return { hasAccess: true };
}
