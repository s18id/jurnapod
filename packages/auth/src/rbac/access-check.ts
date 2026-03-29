/**
 * RBAC access check implementation
 */
import type {
  AuthDbAdapter,
  AuthConfig,
  AccessCheckOptions,
  AccessCheckResult,
  AuthenticatedUser,
  AccessTokenUser,
  RoleCode,
  ModulePermission,
} from '../types.js';
import { MODULE_PERMISSION_BITS, ROLE_CODES } from '../types.js';

const roleCodeSet = new Set<string>(ROLE_CODES);

export class RBACManager {
  constructor(
    private adapter: AuthDbAdapter,
    private _config: AuthConfig
  ) {}

  /**
   * Main access check - evaluates role, permission, and outlet access in a single query.
   * Returns null if user doesn't exist or is inactive.
   */
  async checkAccess(options: AccessCheckOptions): Promise<AccessCheckResult | null> {
    const { userId, companyId, allowedRoles, module, permission, outletId } = options;

    const selectParts: string[] = [
      `EXISTS(
         SELECT 1
         FROM user_role_assignments ura
         INNER JOIN roles r ON r.id = ura.role_id
         WHERE ura.user_id = u.id
           AND r.code = "SUPER_ADMIN"
           AND ura.outlet_id IS NULL
       ) AS is_super_admin`
    ];

    selectParts.push(
      `EXISTS(
         SELECT 1
         FROM user_role_assignments ura
         INNER JOIN roles r ON r.id = ura.role_id
         WHERE ura.user_id = u.id
           AND r.is_global = 1
           AND ura.outlet_id IS NULL
       ) AS has_global_role`
    );

    const params: Array<string | number> = [];

    // Role check
    if (allowedRoles && allowedRoles.length > 0) {
      const rolePlaceholders = allowedRoles.map(() => "?").join(", ");
      if (typeof outletId === "number") {
        selectParts.push(
          `(
             EXISTS(
               SELECT 1 FROM user_role_assignments ura
               INNER JOIN roles r ON r.id = ura.role_id
               WHERE ura.user_id = u.id
                 AND r.is_global = 1 AND ura.outlet_id IS NULL
                 AND r.code IN (${rolePlaceholders})
             ) OR EXISTS(
               SELECT 1 FROM user_role_assignments ura
               INNER JOIN roles r ON r.id = ura.role_id
               INNER JOIN outlets o ON o.id = ura.outlet_id
               WHERE ura.user_id = u.id AND ura.outlet_id = ?
                 AND o.company_id = u.company_id
                 AND r.code IN (${rolePlaceholders})
             )
           ) AS has_role`
        );
        params.push(...allowedRoles, outletId, ...allowedRoles);
      } else {
        selectParts.push(
          `(
             EXISTS(
               SELECT 1 FROM user_role_assignments ura
               INNER JOIN roles r ON r.id = ura.role_id
               WHERE ura.user_id = u.id
                 AND r.is_global = 1 AND ura.outlet_id IS NULL
                 AND r.code IN (${rolePlaceholders})
             ) OR EXISTS(
               SELECT 1 FROM user_role_assignments ura
               INNER JOIN roles r ON r.id = ura.role_id
               INNER JOIN outlets o ON o.id = ura.outlet_id
               WHERE ura.user_id = u.id AND o.company_id = u.company_id
                 AND r.code IN (${rolePlaceholders})
             )
           ) AS has_role`
        );
        params.push(...allowedRoles, ...allowedRoles);
      }
    }

    // Permission check
    if (module && permission) {
      const permissionBit = MODULE_PERMISSION_BITS[permission];
      if (typeof outletId === "number") {
        selectParts.push(
          `(
             EXISTS(
               SELECT 1 FROM user_role_assignments ura
               INNER JOIN roles r ON r.id = ura.role_id
               INNER JOIN module_roles mr ON mr.role_id = r.id
               WHERE ura.user_id = u.id AND r.is_global = 1
                 AND ura.outlet_id IS NULL AND mr.module = ?
                 AND mr.company_id = u.company_id
                 AND (mr.permission_mask & ?) <> 0
             ) OR EXISTS(
               SELECT 1 FROM user_role_assignments ura
               INNER JOIN roles r ON r.id = ura.role_id
               INNER JOIN module_roles mr ON mr.role_id = r.id
               INNER JOIN outlets o ON o.id = ura.outlet_id
               WHERE ura.user_id = u.id AND ura.outlet_id = ?
                 AND o.company_id = u.company_id AND mr.module = ?
                 AND mr.company_id = u.company_id
                 AND (mr.permission_mask & ?) <> 0
             )
           ) AS has_permission`
        );
        params.push(module, permissionBit, outletId, module, permissionBit);
      } else {
        selectParts.push(
          `(
             EXISTS(
               SELECT 1 FROM user_role_assignments ura
               INNER JOIN roles r ON r.id = ura.role_id
               INNER JOIN module_roles mr ON mr.role_id = r.id
               WHERE ura.user_id = u.id AND r.is_global = 1
                 AND ura.outlet_id IS NULL AND mr.module = ?
                 AND mr.company_id = u.company_id
                 AND (mr.permission_mask & ?) <> 0
             ) OR EXISTS(
               SELECT 1 FROM user_role_assignments ura
               INNER JOIN roles r ON r.id = ura.role_id
               INNER JOIN module_roles mr ON mr.role_id = r.id
               INNER JOIN outlets o ON o.id = ura.outlet_id
               WHERE ura.user_id = u.id AND o.company_id = u.company_id
                 AND mr.module = ? AND mr.company_id = u.company_id
                 AND (mr.permission_mask & ?) <> 0
             )
           ) AS has_permission`
        );
        params.push(module, permissionBit, module, permissionBit);
      }
    }

    // Outlet access check
    if (typeof outletId === "number") {
      selectParts.push(
        `EXISTS(
           SELECT 1 FROM user_role_assignments ura
           INNER JOIN outlets o ON o.id = ura.outlet_id
           WHERE ura.user_id = u.id AND ura.outlet_id = ?
             AND o.company_id = u.company_id
         ) AS has_outlet_access`
      );
      params.push(outletId);
    }

    const rows = await this.adapter.queryAll<{
      is_super_admin: number;
      has_global_role?: number | null;
      has_role?: number | null;
      has_permission?: number | null;
      has_outlet_access?: number | null;
    }>(
      `SELECT ${selectParts.join(", ")}
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       WHERE u.id = ? AND u.company_id = ?
         AND u.is_active = 1 AND c.deleted_at IS NULL
       LIMIT 1`,
      [...params, userId, companyId]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      isSuperAdmin: Boolean(row.is_super_admin),
      hasGlobalRole: Boolean(row.has_global_role),
      hasRole: Boolean(row.has_role),
      hasPermission: Boolean(row.has_permission),
      hasOutletAccess: Boolean(row.has_outlet_access)
    };
  }

  /**
   * Get full user profile with all roles and outlet assignments.
   * Returns null if user doesn't exist or is inactive.
   */
  async getUserWithRoles(userId: number, companyId: number): Promise<AuthenticatedUser | null> {
    // Get user basic info
    const userRows = await this.adapter.queryAll<{
      id: number;
      company_id: number;
      email: string;
      company_timezone: string | null;
    }>(
      `SELECT u.id, u.company_id, u.email, c.timezone AS company_timezone
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       WHERE u.id = ? AND u.company_id = ? AND u.is_active = 1 AND c.deleted_at IS NULL
       LIMIT 1`,
      [userId, companyId]
    );

    if (userRows.length === 0) {
      return null;
    }

    const userRow = userRows[0];

    // Get global roles (outlet_id IS NULL, is_global = 1)
    const globalRoleRows = await this.adapter.queryAll<{ code: string }>(
      `SELECT r.code
       FROM user_role_assignments ura
       INNER JOIN roles r ON r.id = ura.role_id
       WHERE ura.user_id = ? AND ura.outlet_id IS NULL AND r.is_global = 1`,
      [userId]
    );
    const global_roles = globalRoleRows.map((r) => r.code as RoleCode);

    // Get outlet-specific roles
    const outletRoleRows = await this.adapter.queryAll<{
      outlet_id: number;
      outlet_code: string;
      outlet_name: string;
      role_codes: string;
    }>(
      `SELECT
         o.id AS outlet_id,
         o.code AS outlet_code,
         o.name AS outlet_name,
         GROUP_CONCAT(DISTINCT r.code ORDER BY r.code SEPARATOR ',') AS role_codes
       FROM user_role_assignments ura
       INNER JOIN outlets o ON o.id = ura.outlet_id
       INNER JOIN roles r ON r.id = ura.role_id
       WHERE ura.user_id = ? AND o.company_id = ? AND ura.outlet_id IS NOT NULL
       GROUP BY o.id, o.code, o.name`,
      [userId, companyId]
    );

    const outlet_role_assignments = outletRoleRows.map((row) => ({
      outlet_id: row.outlet_id,
      outlet_code: row.outlet_code,
      outlet_name: row.outlet_name,
      role_codes: row.role_codes ? (row.role_codes.split(',') as RoleCode[]) : [],
    }));

    // Collect all unique roles (global + outlet-specific)
    const allRoleCodes = new Set<RoleCode>([
      ...global_roles,
      ...outlet_role_assignments.flatMap((a) => a.role_codes),
    ]);
    const roles = Array.from(allRoleCodes);

    // Build outlets list (unique outlets from assignments)
    const outletsMap = new Map<number, { id: number; code: string; name: string }>();
    for (const assignment of outlet_role_assignments) {
      if (!outletsMap.has(assignment.outlet_id)) {
        outletsMap.set(assignment.outlet_id, {
          id: assignment.outlet_id,
          code: assignment.outlet_code,
          name: assignment.outlet_name,
        });
      }
    }
    const outlets = Array.from(outletsMap.values());

    return {
      id: userRow.id,
      company_id: userRow.company_id,
      email: userRow.email,
      company_timezone: userRow.company_timezone,
      roles,
      global_roles,
      outlet_role_assignments,
      outlets,
    };
  }

  /**
   * Get minimal user data needed for JWT token verification.
   * Returns null if user doesn't exist or is inactive.
   */
  async getUserForTokenVerification(userId: number, companyId: number): Promise<AccessTokenUser | null> {
    const rows = await this.adapter.queryAll<{
      id: number;
      company_id: number;
      email: string;
    }>(
      `SELECT u.id, u.company_id, u.email
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       WHERE u.id = ? AND u.company_id = ? AND u.is_active = 1 AND c.deleted_at IS NULL
       LIMIT 1`,
      [userId, companyId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      company_id: row.company_id,
      email: row.email,
    };
  }

  /**
   * Check if user has access to a specific outlet.
   * Returns true if user is SUPER_ADMIN, has global role, or has outlet-specific assignment.
   */
  async hasOutletAccess(userId: number, companyId: number, outletId: number): Promise<boolean> {
    const rows = await this.adapter.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
       LEFT JOIN roles r ON r.id = ura.role_id
       LEFT JOIN outlets o ON o.id = ura.outlet_id
       WHERE u.id = ? AND u.company_id = ? AND u.is_active = 1 AND c.deleted_at IS NULL
         AND (
           r.code = "SUPER_ADMIN"
           OR (r.is_global = 1 AND ura.outlet_id IS NULL)
           OR (ura.outlet_id = ? AND o.company_id = ?)
         )`,
      [userId, companyId, outletId, companyId]
    );

    return rows.length > 0 && rows[0].count > 0;
  }

  /**
   * Get list of outlet IDs that the user has access to.
   * Includes outlets from outlet-specific role assignments.
   * Does not include global access (SUPER_ADMIN should check differently).
   */
  async listUserOutletIds(userId: number, companyId: number): Promise<number[]> {
    const rows = await this.adapter.queryAll<{ outlet_id: number }>(
      `SELECT DISTINCT ura.outlet_id
       FROM user_role_assignments ura
       INNER JOIN outlets o ON o.id = ura.outlet_id
       WHERE ura.user_id = ? AND o.company_id = ? AND ura.outlet_id IS NOT NULL`,
      [userId, companyId]
    );

    return rows.map((r) => r.outlet_id);
  }

  /**
   * Check if user can manage company defaults for a specific module and permission.
   * This checks module_roles entries for the user's global roles.
   * Returns true if user has the required permission bit in any of their global roles.
   */
  async canManageCompanyDefaults(
    userId: number,
    companyId: number,
    module: string,
    permission?: ModulePermission
  ): Promise<boolean> {
    // First check if user is SUPER_ADMIN (bypasses all checks)
    const superAdminRows = await this.adapter.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM user_role_assignments ura
       INNER JOIN roles r ON r.id = ura.role_id
       WHERE ura.user_id = ?
         AND r.code = "SUPER_ADMIN"
         AND ura.outlet_id IS NULL`,
      [userId]
    );

    if (superAdminRows.length > 0 && superAdminRows[0].count > 0) {
      return true;
    }

    // If no specific permission required, just check for any global role with module access
    if (!permission) {
      const rows = await this.adapter.queryAll<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM user_role_assignments ura
         INNER JOIN roles r ON r.id = ura.role_id
         INNER JOIN module_roles mr ON mr.role_id = r.id
         WHERE ura.user_id = ? AND mr.company_id = ?
           AND r.is_global = 1 AND ura.outlet_id IS NULL
           AND mr.module = ?`,
        [userId, companyId, module]
      );
      return rows.length > 0 && rows[0].count > 0;
    }

    // Check for specific permission bit
    const permissionBit = MODULE_PERMISSION_BITS[permission];
    const rows = await this.adapter.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM user_role_assignments ura
       INNER JOIN roles r ON r.id = ura.role_id
       INNER JOIN module_roles mr ON mr.role_id = r.id
       WHERE ura.user_id = ? AND mr.company_id = ?
         AND r.is_global = 1 AND ura.outlet_id IS NULL
         AND mr.module = ?
         AND (mr.permission_mask & ?) <> 0`,
      [userId, companyId, module, permissionBit]
    );

    return rows.length > 0 && rows[0].count > 0;
  }
}
