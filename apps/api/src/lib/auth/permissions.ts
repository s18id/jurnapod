// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "../db.js";
import { sql } from "kysely";
import { MODULE_PERMISSION_BITS, type ModulePermission } from "../auth.js";
import type { Kysely } from "kysely";
import type { DatabaseSchema } from "@jurnapod/db";

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
 * @param _connection - Optional database connection (deprecated, uses singleton)
 * @returns true if user can manage company defaults
 */
export async function canManageCompanyDefaults(
  userId: number,
  companyId: number,
  module: string,
  permission: ModulePermission = "create",
  _connection?: Kysely<DatabaseSchema>
): Promise<boolean> {
  const db = getDb();
  const permissionBit = MODULE_PERMISSION_BITS[permission];

  const row = await db
    .selectFrom("user_role_assignments as ura")
    .innerJoin("roles as r", "r.id", "ura.role_id")
    .innerJoin("module_roles as mr", "mr.role_id", "r.id")
    .where("ura.user_id", "=", userId)
    .where("r.is_global", "=", 1)
    .where("ura.outlet_id", "is", null)
    .where("mr.module", "=", module)
    .where("mr.company_id", "=", companyId)
    .where(sql`(${sql`mr.permission_mask`} & ${sql`${permissionBit}`})`, "<>", 0)
    .select(["ura.id"])
    .executeTakeFirst();

  return row !== undefined;
}
