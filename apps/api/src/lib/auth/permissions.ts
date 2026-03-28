// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDbPool } from "../db.js";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import { MODULE_PERMISSION_BITS, type ModulePermission } from "../auth.js";

type AccessCheckRow = RowDataPacket & {
  id: number;
};

/**
 * Check if user can manage company defaults for a module using bitmask permission system.
 * Company defaults require:
 * 1. A global role assignment (outlet_id IS NULL)
 * 2. The appropriate permission bit set in module_roles.permission_mask
 *
 * @param userId - User ID
 * @param companyId - Company ID
 * @param module - Module name (e.g., 'inventory')
 * @param permission - Required permission (create, read, update, delete)
 * @param connection - Optional database connection for transaction scoping
 * @returns true if user can manage company defaults
 */
export async function canManageCompanyDefaults(
  userId: number,
  companyId: number,
  module: string,
  permission: ModulePermission = "create",
  connection?: PoolConnection
): Promise<boolean> {
  const pool = connection ?? getDbPool();
  const permissionBit = MODULE_PERMISSION_BITS[permission];

  const [rows] = await pool.execute<AccessCheckRow[]>(
    `SELECT 1
     FROM user_role_assignments ura
     INNER JOIN roles r ON r.id = ura.role_id
     INNER JOIN module_roles mr ON mr.role_id = r.id
     WHERE ura.user_id = ?
       AND r.is_global = 1
       AND ura.outlet_id IS NULL
       AND mr.module = ?
       AND mr.company_id = ?
       AND (mr.permission_mask & ?) <> 0
     LIMIT 1`,
    [userId, module, companyId, permissionBit]
  );

  return rows.length > 0;
}
