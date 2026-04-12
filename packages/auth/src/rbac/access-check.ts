/**
 * RBAC access check implementation using Kysely query builder
 */
import { sql } from 'kysely';
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
   * Main access check - evaluates role, permission, and outlet access.
   * Returns null if user doesn't exist or is inactive.
   * SUPER_ADMIN bypasses company deleted_at check — platform-wide access.
   */
  async checkAccess(options: AccessCheckOptions): Promise<AccessCheckResult | null> {
    const { userId, companyId, allowedRoles, module, resource, permission, outletId } = options;

    // Check SUPER_ADMIN first — global lookup, no company_id filter
    // SUPER_ADMIN bypasses company deleted_at check since they are platform-wide
    const isSuperAdmin = await this.isSuperAdminUser(userId);

    // Build user existence query
    let userQuery = this.adapter.db
      .selectFrom('users as u')
      .innerJoin('companies as c', 'c.id', 'u.company_id')
      .where('u.id', '=', userId)
      .where('u.company_id', '=', companyId)
      .where('u.is_active', '=', 1);

    // SUPER_ADMIN bypasses company deleted_at check — platform-wide role
    if (!isSuperAdmin) {
      userQuery = userQuery.where('c.deleted_at', 'is', null);
    }

    const userExists = await userQuery.select(['u.id']).executeTakeFirst();

    if (!userExists) {
      return null;
    }

    // Check has global role
    const hasGlobalRole = await this.adapter.db
      .selectFrom('user_role_assignments as ura')
      .innerJoin('roles as r', 'r.id', 'ura.role_id')
      .where('ura.user_id', '=', userId)
      .where('ura.company_id', '=', companyId)
      .where('r.is_global', '=', 1)
      .where('ura.outlet_id', 'is', null)
      .select(['ura.id'])
      .executeTakeFirst();

    let hasRole = false;
    let hasPermission = false;
    let hasOutletAccess = false;

    // Role check if allowedRoles specified
    if (allowedRoles && allowedRoles.length > 0) {
      if (typeof outletId === 'number') {
        // Check global role match
        const globalRoleMatch = await this.adapter.db
          .selectFrom('user_role_assignments as ura')
          .innerJoin('roles as r', 'r.id', 'ura.role_id')
          .where('ura.user_id', '=', userId)
          .where('ura.company_id', '=', companyId)
          .where('r.is_global', '=', 1)
          .where('ura.outlet_id', 'is', null)
          .where('r.code', 'in', allowedRoles)
          .select(['ura.id'])
          .executeTakeFirst();

        // Check outlet-specific role match
        const outletRoleMatch = await this.adapter.db
          .selectFrom('user_role_assignments as ura')
          .innerJoin('roles as r', 'r.id', 'ura.role_id')
          .where('ura.user_id', '=', userId)
          .where('ura.company_id', '=', companyId)
          .where('ura.outlet_id', '=', outletId)
          .where('r.code', 'in', allowedRoles)
          .select(['ura.id'])
          .executeTakeFirst();

        hasRole = Boolean(globalRoleMatch) || Boolean(outletRoleMatch);
      } else {
        // No outletId - check global roles across user's outlets
        const globalRoleMatch = await this.adapter.db
          .selectFrom('user_role_assignments as ura')
          .innerJoin('roles as r', 'r.id', 'ura.role_id')
          .where('ura.user_id', '=', userId)
          .where('ura.company_id', '=', companyId)
          .where('r.code', 'in', allowedRoles)
          .select(['ura.id'])
          .executeTakeFirst();

        hasRole = Boolean(globalRoleMatch);
      }
    }

    // Permission check — SUPER_ADMIN bypasses bitmask lookup entirely
    if (module && permission) {
      if (isSuperAdmin) {
        hasPermission = true;
      } else {
        const permissionBit = MODULE_PERMISSION_BITS[permission];

        if (typeof outletId === 'number') {
          // Check global permission with bitmask check
          // For resource-level ACL: ONLY match specific resource (no fallback to module-level NULL)
          const res = resource ?? null;
          const globalPermMatch = await this.adapter.db
            .selectFrom('user_role_assignments as ura')
            .innerJoin('roles as r', 'r.id', 'ura.role_id')
            .innerJoin('module_roles as mr', 'mr.role_id', 'r.id')
            .where('ura.user_id', '=', userId)
            .where('ura.company_id', '=', companyId)
            .where('r.is_global', '=', 1)
            .where('ura.outlet_id', 'is', null)
            .where('mr.module', '=', module)
            .where(res !== null
              ? sql<boolean>`${sql`mr.resource`} = ${res}`
              : sql<boolean>`${sql`mr.resource`} IS NULL`)
            .where('mr.company_id', '=', companyId)
            .where(sql`(${sql`mr.permission_mask`} & ${sql`${permissionBit}`})`, '<>', 0)
            .select(['mr.id'])
            .executeTakeFirst();

          // Check outlet permission with bitmask check
          const outletPermMatch = await this.adapter.db
            .selectFrom('user_role_assignments as ura')
            .innerJoin('roles as r', 'r.id', 'ura.role_id')
            .innerJoin('module_roles as mr', 'mr.role_id', 'r.id')
            .where('ura.user_id', '=', userId)
            .where('ura.company_id', '=', companyId)
            .where('ura.outlet_id', '=', outletId)
            .where('mr.module', '=', module)
            .where(res !== null
              ? sql<boolean>`${sql`mr.resource`} = ${res}`
              : sql<boolean>`${sql`mr.resource`} IS NULL`)
            .where('mr.company_id', '=', companyId)
            .where(sql`(${sql`mr.permission_mask`} & ${sql`${permissionBit}`})`, '<>', 0)
            .select(['mr.id'])
            .executeTakeFirst();

          hasPermission = Boolean(globalPermMatch) || Boolean(outletPermMatch);
        } else {
          // No outletId - check global permissions with bitmask check
          // For resource-level ACL: ONLY match specific resource (no fallback to module-level NULL)
          const res = resource ?? null;
          const globalPermMatch = await this.adapter.db
            .selectFrom('user_role_assignments as ura')
            .innerJoin('roles as r', 'r.id', 'ura.role_id')
            .innerJoin('module_roles as mr', 'mr.role_id', 'r.id')
            .where('ura.user_id', '=', userId)
            .where('ura.company_id', '=', companyId)
            .where('mr.module', '=', module)
            .where(res !== null
              ? sql<boolean>`${sql`mr.resource`} = ${res}`
              : sql<boolean>`${sql`mr.resource`} IS NULL`)
            .where('mr.company_id', '=', companyId)
            .where(sql`(${sql`mr.permission_mask`} & ${sql`${permissionBit}`})`, '<>', 0)
            .select(['mr.id'])
            .executeTakeFirst();

          hasPermission = Boolean(globalPermMatch);
        }
      }
    }

    // Outlet access check
    if (typeof outletId === 'number') {
      const outletAccess = await this.adapter.db
        .selectFrom('user_role_assignments as ura')
        .where('ura.user_id', '=', userId)
        .where('ura.company_id', '=', companyId)
        .where('ura.outlet_id', '=', outletId)
        .select(['ura.id'])
        .executeTakeFirst();

      hasOutletAccess = Boolean(outletAccess);
    }

    return {
      isSuperAdmin: Boolean(isSuperAdmin),
      hasGlobalRole: Boolean(hasGlobalRole),
      hasRole,
      hasPermission,
      hasOutletAccess
    };
  }

  /**
   * Get full user profile with all roles and outlet assignments.
   * Returns null if user doesn't exist or is inactive.
   * SUPER_ADMIN can access even if company is deleted.
   */
  async getUserWithRoles(userId: number, companyId: number): Promise<AuthenticatedUser | null> {
    // Get user basic info using query builder (without deleted_at filter)
    const userRow = await this.adapter.db
      .selectFrom('users as u')
      .innerJoin('companies as c', 'c.id', 'u.company_id')
      .where('u.id', '=', userId)
      .where('u.company_id', '=', companyId)
      .where('u.is_active', '=', 1)
      .select(['u.id', 'u.company_id', 'u.email', 'c.timezone as company_timezone', 'c.deleted_at'])
      .executeTakeFirst();

    if (!userRow) {
      return null;
    }

    // If company is deleted, only SUPER_ADMIN can proceed
    if (userRow.deleted_at !== null) {
      const isSuperAdmin = await this.isSuperAdminUser(userId);
      if (!isSuperAdmin) {
        return null;
      }
    }

    // Get global roles (outlet_id IS NULL, is_global = 1)
    const globalRoleRows = await this.adapter.db
      .selectFrom('user_role_assignments as ura')
      .innerJoin('roles as r', 'r.id', 'ura.role_id')
      .where('ura.user_id', '=', userId)
      .where('ura.company_id', '=', companyId)
      .where('ura.outlet_id', 'is', null)
      .where('r.is_global', '=', 1)
      .select(['r.code'])
      .execute();

    const global_roles = globalRoleRows.map((r) => r.code as RoleCode);

    // Get outlet-specific roles - use ura.company_id for tenant scoping
    const outletRoleRows = await this.adapter.db
      .selectFrom('user_role_assignments as ura')
      .innerJoin('outlets as o', 'o.id', 'ura.outlet_id')
      .where('ura.user_id', '=', userId)
      .where('ura.company_id', '=', companyId)
      .where('ura.outlet_id', 'is not', null)
      .groupBy(['o.id', 'o.code', 'o.name'])
      .select([
        'o.id as outlet_id',
        'o.code as outlet_code',
        'o.name as outlet_name',
      ])
      .execute();

    // For each outlet, get roles separately
    const outlet_role_assignments = await Promise.all(
      outletRoleRows.map(async (row) => {
        const roles = await this.adapter.db
          .selectFrom('user_role_assignments as ura')
          .innerJoin('roles as r', 'r.id', 'ura.role_id')
          .where('ura.user_id', '=', userId)
          .where('ura.outlet_id', '=', row.outlet_id)
          .select(['r.code'])
          .execute();

        return {
          outlet_id: row.outlet_id,
          outlet_code: row.outlet_code,
          outlet_name: row.outlet_name,
          role_codes: roles.map((r) => r.code as RoleCode),
        };
      })
    );

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
   * SUPER_ADMIN can access even if company is deleted.
   */
  async getUserForTokenVerification(userId: number, companyId: number): Promise<AccessTokenUser | null> {
    const row = await this.adapter.db
      .selectFrom('users as u')
      .innerJoin('companies as c', 'c.id', 'u.company_id')
      .where('u.id', '=', userId)
      .where('u.company_id', '=', companyId)
      .where('u.is_active', '=', 1)
      .select(['u.id', 'u.company_id', 'u.email', 'c.deleted_at'])
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    // If company is deleted, only SUPER_ADMIN can proceed
    if (row.deleted_at !== null) {
      const isSuperAdmin = await this.isSuperAdminUser(userId);
      if (!isSuperAdmin) {
        return null;
      }
    }

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
    // Check if user is SUPER_ADMIN (global lookup — no company_id filter)
    const superAdmin = await this.isSuperAdminUser(userId);
    if (superAdmin) {
      return true;
    }

    // Check if user has global role
    const globalRole = await this.adapter.db
      .selectFrom('user_role_assignments as ura')
      .innerJoin('roles as r', 'r.id', 'ura.role_id')
      .where('ura.user_id', '=', userId)
      .where('ura.company_id', '=', companyId)
      .where('r.is_global', '=', 1)
      .where('ura.outlet_id', 'is', null)
      .select(['ura.id'])
      .executeTakeFirst();

    if (globalRole) {
      return true;
    }

    // Check if user has outlet-specific assignment
    const outletAssignment = await this.adapter.db
      .selectFrom('user_role_assignments as ura')
      .where('ura.user_id', '=', userId)
      .where('ura.company_id', '=', companyId)
      .where('ura.outlet_id', '=', outletId)
      .select(['ura.id'])
      .executeTakeFirst();

    return Boolean(outletAssignment);
  }

  /**
   * Get list of outlet IDs that the user has access to.
   * Includes outlets from outlet-specific role assignments.
   * Does not include global access (SUPER_ADMIN should check differently).
   */
  async listUserOutletIds(userId: number, companyId: number): Promise<number[]> {
    // Use company_id for tenant scoping
    const rows = await this.adapter.db
      .selectFrom('user_role_assignments as ura')
      .where('ura.user_id', '=', userId)
      .where('ura.company_id', '=', companyId)
      .where('ura.outlet_id', 'is not', null)
      .groupBy('ura.outlet_id')
      .select(['ura.outlet_id'])
      .execute();

    return rows.map((r) => r.outlet_id as number);
  }

  /**
   * Check if user has SUPER_ADMIN global role.
   * Queries user_role_assignments WITHOUT company_id filter because
   * SUPER_ADMIN is a platform-wide role, not scoped to any company.
   */
  private async isSuperAdminUser(userId: number): Promise<boolean> {
    const row = await this.adapter.db
      .selectFrom("user_role_assignments as ura")
      .innerJoin("roles as r", "r.id", "ura.role_id")
      .where("ura.user_id", "=", userId)
      .where("r.code", "=", "SUPER_ADMIN")
      .where("ura.outlet_id", "is", null)
      .select(["ura.id"])
      .executeTakeFirst();
    return row !== undefined;
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
    permission?: ModulePermission,
    resource?: string
  ): Promise<boolean> {
    // Check if user is SUPER_ADMIN (global lookup — no company_id filter)
    const superAdmin = await this.isSuperAdminUser(userId);
    if (superAdmin) {
      return true;
    }

    // If no specific permission required, just check for any global role with module access
    // For resource-level ACL: ONLY match specific resource (no fallback to module-level NULL)
    if (!permission) {
      const res = resource ?? null;
      const moduleAccess = await this.adapter.db
        .selectFrom('user_role_assignments as ura')
        .innerJoin('roles as r', 'r.id', 'ura.role_id')
        .innerJoin('module_roles as mr', 'mr.role_id', 'r.id')
        .where('ura.user_id', '=', userId)
        .where('ura.company_id', '=', companyId)
        .where('r.is_global', '=', 1)
        .where('ura.outlet_id', 'is', null)
        .where('mr.module', '=', module)
        .where(res !== null
          ? sql<boolean>`${sql`mr.resource`} = ${res}`
          : sql<boolean>`${sql`mr.resource`} IS NULL`)
        .where('mr.company_id', '=', companyId)
        .select(['mr.id'])
        .executeTakeFirst();

      return Boolean(moduleAccess);
    }

    // Check for specific permission bit
    // For resource-level ACL: ONLY match specific resource (no fallback to module-level NULL)
    const res = resource ?? null;
    const moduleAccess = await this.adapter.db
      .selectFrom('user_role_assignments as ura')
      .innerJoin('roles as r', 'r.id', 'ura.role_id')
      .innerJoin('module_roles as mr', 'mr.role_id', 'r.id')
      .where('ura.user_id', '=', userId)
      .where('ura.company_id', '=', companyId)
      .where('r.is_global', '=', 1)
      .where('ura.outlet_id', 'is', null)
        .where('mr.module', '=', module)
        .where(res !== null
          ? sql<boolean>`${sql`mr.resource`} = ${res}`
          : sql<boolean>`${sql`mr.resource`} IS NULL`)
        .where('mr.company_id', '=', companyId)
        .select(['mr.permission_mask'])
      .execute();

    if (moduleAccess.length === 0) {
      return false;
    }

    // Check if any permission_mask has the required bit
    const permissionBit = MODULE_PERMISSION_BITS[permission];
    return moduleAccess.some((row) => {
      const mask = Number(row.permission_mask);
      return (mask & permissionBit) !== 0;
    });
  }
}
