// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

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
  db: KyselySchema,
  userId: number,
  companyId: number
): Promise<boolean> {
  // Using raw SQL for LIKE query - Kysely's query builder doesn't have native LIKE support
  // This is one case where sql`` is appropriate due to the LIKE pattern
  const result = await sql`
    SELECT 1
    FROM users u
    INNER JOIN user_role_assignments ura ON ura.user_id = u.id
    INNER JOIN roles r ON r.id = ura.role_id
    WHERE u.id = ${userId}
      AND u.company_id = ${companyId}
      AND LOWER(r.name) LIKE '%cashier%'
    LIMIT 1
  `.execute(db);

  return result.rows.length > 0;
}
