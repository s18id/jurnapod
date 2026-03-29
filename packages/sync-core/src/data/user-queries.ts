// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Check if a user is a cashier in a company.
 * 
 * A user is a cashier if:
 * 1. They belong to the company (Users.company_id = companyId)
 * 2. They have a role assignment where Roles.name contains 'cashier' (case-insensitive)
 * 
 * Uses the Users table for company membership (each user has exactly one company_id).
 * Uses UserRoleAssignments + Roles tables for role checking.
 */
export async function isCashierInCompany(
  db: DbConn,
  userId: number,
  companyId: number
): Promise<boolean> {
  const row = await db.queryOne<RowDataPacket>(
    `SELECT 1
     FROM users u
     INNER JOIN user_role_assignments ura ON ura.user_id = u.id
     INNER JOIN roles r ON r.id = ura.role_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND LOWER(r.name) LIKE '%cashier%'
     LIMIT 1`,
    [userId, companyId]
  );

  return row !== null;
}
