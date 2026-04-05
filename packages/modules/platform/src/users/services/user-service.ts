// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import { toRfc3339Required } from "@jurnapod/shared";
import type { UserProfile, UserRow, UserOutletRoleAssignment } from "../types/user.js";
import type { RoleSnapshot } from "../types/role.js";
import {
  UserNotFoundError,
  UserEmailExistsError,
  RoleNotFoundError,
  RoleLevelViolationError,
  RoleScopeViolationError,
  OutletNotFoundError,
  SuperAdminProtectionError,
  CrossCompanyAccessError,
  SuperAdminAlreadyExistsError
} from "./errors.js";
import { AuditService } from "../../audit-service.js";

/**
 * ============================================================================
 * SUPER_ADMIN CROSS-COMPANY ACCESS MODEL
 * ============================================================================
 * 
 * Role Scope Definitions:
 * - SUPER_ADMIN: Platform-wide global role. Can access ANY company.
 *   No company_id filter in user_role_assignments. Cross-company operations
 *   are logged via auditSuperAdminCrossCompanyWrite().
 * 
 * - OWNER, COMPANY_ADMIN: Platform-defined roles (isGlobal=true) but 
 *   scoped to their own company via company_id in user_role_assignments.
 *   Cannot perform cross-company operations.
 * 
 * - ADMIN, ACCOUNTANT, CASHIER: Per-company roles (isGlobal=false).
 * 
 * Access Control Pattern:
 *   if (targetCompanyId !== actorCompanyId) {
 *     if (!userHasSuperAdminRole(db, actorUserId)) {
 *       throw new CrossCompanyAccessError(...);
 *     }
 *     // Log via auditSuperAdminCrossCompanyWrite() for SUPER_ADMIN writes
 *   }
 * 
 * IMPORTANT: userHasSuperAdminRole() checks globally without company_id
 * because SUPER_ADMIN has no company association. All other role checks
 * MUST include company_id filtering.
 * ============================================================================
 */

/**
 * Build audit context for audit logging.
 */
function buildAuditContext(
  companyId: number,
  actorUserId: number,
  outletId?: number | null,
  ipAddress?: string | null
) {
  return {
    company_id: companyId,
    user_id: actorUserId,
    outlet_id: outletId ?? null,
    ip_address: ipAddress ?? null
  };
}

type UserActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Escapes LIKE special characters (`%`, `_`, `\`) in user input.
 * Treats user-entered wildcards as literal characters.
 */
function escapeLikePattern(input: string): string {
  if (!input) return "";
  return input.replace(/[%_\\]/g, (char) => `\\${char}`);
}

async function findUserRowById(
  db: KyselySchema,
  companyId: number,
  userId: number
): Promise<UserRow | null> {
  const row = await db
    .selectFrom("users")
    .where("id", "=", userId)
    .where("company_id", "=", companyId)
    .select(["id", "company_id", "name", "email", "is_active", "created_at", "updated_at"])
    .executeTakeFirst();

  return (row as UserRow | undefined) ?? null;
}

async function ensureUserExists(
  db: KyselySchema,
  companyId: number,
  userId: number
): Promise<UserRow> {
  const user = await findUserRowById(db, companyId, userId);
  if (!user) {
    throw new UserNotFoundError("User not found");
  }
  return user;
}

async function ensureRoleCodesExist(
  db: KyselySchema,
  roleCodes: string[]
): Promise<Map<string, RoleSnapshot>> {
  if (roleCodes.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom("roles")
    .where("code", "in", roleCodes)
    .select(["id", "code", "is_global", "role_level"])
    .execute();

  const map = new Map<string, RoleSnapshot>();
  for (const row of rows) {
    map.set(row.code, {
      id: Number(row.id),
      is_global: Number(row.is_global ?? 0),
      role_level: Number(row.role_level ?? 0)
    });
  }

  if (map.size !== roleCodes.length) {
    throw new RoleNotFoundError("Role not found");
  }

  return map;
}

async function getUserMaxRoleLevelForConnection(
  db: KyselySchema,
  companyId: number,
  userId: number
): Promise<number> {
  const row = await db
    .selectFrom("user_role_assignments as ura")
    .innerJoin("roles as r", "r.id", "ura.role_id")
    .innerJoin("users as u", "u.id", "ura.user_id")
    .where("u.id", "=", userId)
    .where("u.company_id", "=", companyId)
    .where("u.is_active", "=", 1)
    .where("ura.outlet_id", "is", null)
    .select((eb) => [eb.fn.max("r.role_level").as("max_level")])
    .executeTakeFirst();

  const maxLevel = row?.max_level;
  return Number(maxLevel ?? 0);
}

/**
 * Check if a user has the SUPER_ADMIN global role.
 * 
 * SUPER_ADMIN is a platform-wide global role — no company_id filter.
 * This function checks globally across all companies.
 * 
 * Use this to determine if a user can perform cross-company operations.
 * Business logic layer should enforce company boundary checks separately.
 */
async function userHasSuperAdminRole(
  db: KyselySchema,
  userId: number
): Promise<boolean> {
  const row = await db
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
 * Check if any SUPER_ADMIN already exists in the system (global, across all companies).
 * Used to enforce the "only one SUPER_ADMIN" rule.
 */
async function hasExistingSuperAdmin(db: KyselySchema): Promise<boolean> {
  const row = await db
    .selectFrom("user_role_assignments as ura")
    .innerJoin("roles as r", "r.id", "ura.role_id")
    .where("r.code", "=", "SUPER_ADMIN")
    .where("ura.outlet_id", "is", null)
    .select(["ura.id"])
    .limit(1)
    .executeTakeFirst();

  return row !== undefined;
}

async function userHasRoleCode(
  db: KyselySchema,
  companyId: number,
  userId: number,
  roleCode: string
): Promise<boolean> {
  const row = await db
    .selectFrom("user_role_assignments as ura")
    .innerJoin("roles as r", "r.id", "ura.role_id")
    .innerJoin("users as u", "u.id", "ura.user_id")
    .where("u.id", "=", userId)
    .where("u.company_id", "=", companyId)
    .where("r.code", "=", roleCode)
    .where("ura.outlet_id", "is", null)
    .select(["ura.id"])
    .executeTakeFirst();

  return row !== undefined;
}

/**
 * Ensure a SUPER_ADMIN target can only be managed by themselves.
 * 
 * @param db - Database client
 * @param companyId - Company context (for audit/error messages only)
 * @param actorUserId - The user performing the action
 * @param targetUserId - The user being managed
 * 
 * Business rule: Only a SUPER_ADMIN can manage another SUPER_ADMIN,
 * and they can only manage themselves (not other SUPER_ADMINs).
 */
async function ensureSuperAdminTargetManagedBySelf(
  db: KyselySchema,
  companyId: number,
  actorUserId: number,
  targetUserId: number
): Promise<void> {
  const targetIsSuperAdmin = await userHasSuperAdminRole(db, targetUserId);
  if (!targetIsSuperAdmin) {
    return; // Target is not SUPER_ADMIN, no special protection needed
  }

  const actorIsSelf = actorUserId === targetUserId;
  const actorIsSuperAdmin = await userHasSuperAdminRole(db, actorUserId);

  if (!actorIsSelf || !actorIsSuperAdmin) {
    throw new SuperAdminProtectionError("Only SUPER_ADMIN user can manage their own account");
  }
}

async function ensureOutletIdsExist(
  db: KyselySchema,
  companyId: number,
  outletIds: number[]
): Promise<void> {
  if (outletIds.length === 0) {
    return;
  }

  const rows = await db
    .selectFrom("outlets")
    .where("company_id", "=", companyId)
    .where("id", "in", outletIds)
    .select(["id"])
    .execute();

  if (rows.length !== outletIds.length) {
    throw new OutletNotFoundError("Outlet not found");
  }
}

async function hydrateUserGlobalRoles(
  db: KyselySchema,
  companyId: number,
  userIds: number[]
): Promise<Map<number, string[]>> {
  const roleMap = new Map<number, string[]>();
  if (userIds.length === 0) {
    return roleMap;
  }

  const rows = await db
    .selectFrom("user_role_assignments as ura")
    .innerJoin("roles as r", "r.id", "ura.role_id")
    .innerJoin("users as u", "u.id", "ura.user_id")
    .where("ura.user_id", "in", userIds)
    .where("u.company_id", "=", companyId)
    .where("r.is_global", "=", 1)
    .where("ura.outlet_id", "is", null)
    .orderBy("r.code", "asc")
    .select(["ura.user_id", "r.code"])
    .execute();

  for (const row of rows) {
    const userId = Number(row.user_id);
    const list = roleMap.get(userId) ?? [];
    list.push(row.code);
    roleMap.set(userId, list);
  }

  return roleMap;
}

async function hydrateUserOutletRoleAssignments(
  db: KyselySchema,
  companyId: number,
  userIds: number[]
): Promise<Map<number, UserOutletRoleAssignment[]>> {
  const assignmentMap = new Map<number, UserOutletRoleAssignment[]>();
  if (userIds.length === 0) {
    return assignmentMap;
  }

  const rows = await db
    .selectFrom("user_role_assignments as ura")
    .innerJoin("outlets as o", "o.id", "ura.outlet_id")
    .innerJoin("roles as r", "r.id", "ura.role_id")
    .where("ura.user_id", "in", userIds)
    .where("o.company_id", "=", companyId)  // Tenant isolation: filter by company
    .where("ura.outlet_id", "is not", null)
    .orderBy("o.id", "asc")
    .orderBy("r.code", "asc")
    .select(["ura.user_id", "o.id as outlet_id", "o.code as outlet_code", "o.name as outlet_name", "r.code as role_code"])
    .execute();

  const userOutletMap = new Map<number, Map<number, UserOutletRoleAssignment>>();

  for (const row of rows) {
    const userId = Number(row.user_id);
    const outletId = Number(row.outlet_id);
    const outletAssignments = userOutletMap.get(userId) ?? new Map();
    let assignment = outletAssignments.get(outletId);
    if (!assignment) {
      assignment = {
        outlet_id: outletId,
        outlet_code: row.outlet_code,
        outlet_name: row.outlet_name,
        role_codes: []
      };
      outletAssignments.set(outletId, assignment);
      userOutletMap.set(userId, outletAssignments);
    }
    assignment.role_codes.push(row.role_code);
  }

  for (const [userId, outletAssignments] of userOutletMap.entries()) {
    assignmentMap.set(userId, [...outletAssignments.values()]);
  }

  return assignmentMap;
}

function normalizeUserRow(row: UserRow): Omit<UserProfile, "global_roles" | "outlet_role_assignments"> {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    name: row.name,
    email: row.email,
    is_active: row.is_active === 1,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// =============================================================================
// UserService
// =============================================================================

export class UserService {
  constructor(
    private readonly db: KyselySchema,
    private readonly auditService: AuditService = new AuditService(db)
  ) {}

  /**
   * List users for a company.
   */
  async listUsers(
    companyId: number,
    actor: { userId: number; companyId: number },
    filters?: { isActive?: boolean; search?: string }
  ): Promise<UserProfile[]> {
    if (companyId !== actor.companyId) {
      const isSuperAdmin = await userHasSuperAdminRole(this.db, actor.userId);
      if (!isSuperAdmin) {
        throw new CrossCompanyAccessError("Cannot list users from another company");
      }
    }

    let query = this.db
      .selectFrom("users")
      .where("company_id", "=", companyId)
      .select(["id", "company_id", "name", "email", "is_active", "created_at", "updated_at"]);

    if (typeof filters?.isActive === "boolean") {
      query = query.where("is_active", "=", filters.isActive ? 1 : 0);
    }

    if (filters?.search) {
      query = query.where("email", "like", `%${escapeLikePattern(filters.search)}%`);
    }

    query = query.orderBy("id", "asc");

    const rows = await query.execute();
    const baseUsers = rows.map((row) => normalizeUserRow(row as UserRow));
    const userIds = baseUsers.map((user) => user.id);

    const [globalRolesMap, outletRolesMap] = await Promise.all([
      hydrateUserGlobalRoles(this.db, companyId, userIds),
      hydrateUserOutletRoleAssignments(this.db, companyId, userIds)
    ]);

    return baseUsers.map((user) => ({
      ...user,
      global_roles: globalRolesMap.get(user.id) ?? [],
      outlet_role_assignments: outletRolesMap.get(user.id) ?? []
    }));
  }

  /**
   * Find a user by ID.
   * 
   * Access control:
   * - If actor's companyId matches target companyId: allow
   * - If actor's companyId differs (cross-company): only SUPER_ADMIN bypasses
   */
  async findUserById(
    companyId: number,
    userId: number,
    actor: { userId: number; companyId: number }
  ): Promise<UserProfile | null> {
    // Cross-company access check: only SUPER_ADMIN can view users from other companies
    if (actor.companyId !== companyId) {
      const isSuperAdmin = await userHasSuperAdminRole(this.db, actor.userId);
      if (!isSuperAdmin) {
        throw new CrossCompanyAccessError("Cannot access users from another company");
      }
    }

    const user = await findUserRowById(this.db, companyId, userId);
    if (!user) {
      return null;
    }

    const [globalRolesMap, outletRolesMap] = await Promise.all([
      hydrateUserGlobalRoles(this.db, companyId, [user.id]),
      hydrateUserOutletRoleAssignments(this.db, companyId, [user.id])
    ]);

    return {
      ...normalizeUserRow(user),
      global_roles: globalRolesMap.get(user.id) ?? [],
      outlet_role_assignments: outletRolesMap.get(user.id) ?? []
    };
  }

  /**
   * Create a user with minimal setup (no role assignments, no audit).
   * Use createUser() for production use with roles and audit.
   */
  async createUserBasic(params: {
    companyId: number;
    email: string;
    passwordHash: string;
    name?: string;
    isActive?: boolean;
  }): Promise<{ id: number; email: string }> {
    const emailNormalized = normalizeEmail(params.email);
    const name = params.name?.trim() ?? null;
    const isActive = params.isActive ?? false;

    try {
      const result = await this.db
        .insertInto("users")
        .values({
          company_id: params.companyId,
          name: name,
          email: emailNormalized,
          password_hash: params.passwordHash,
          is_active: isActive ? 1 : 0
        })
        .executeTakeFirst();

      return {
        id: Number(result.insertId),
        email: emailNormalized
      };
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "ER_DUP_ENTRY"
      ) {
        throw new UserEmailExistsError("Email already exists");
      }
      throw error;
    }
  }

  /**
   * Create a user with role assignments and audit logging.
   */
  async createUser(params: {
    companyId: number;
    name?: string;
    email: string;
    passwordHash: string;
    roleCodes?: string[];
    outletIds?: number[];
    outletRoleAssignments?: Array<{ outletId: number; roleCodes: string[] }>;
    isActive?: boolean;
    actor: UserActor;
  }): Promise<UserProfile> {
    const { RoleSchema } = await import("@jurnapod/shared");
    const { NumericIdSchema } = await import("@jurnapod/shared");

    return await this.db.transaction().execute(async (trx) => {
      const created = await this.createUserBasicTx(
        {
          companyId: params.companyId,
          email: params.email,
          passwordHash: params.passwordHash,
          name: params.name,
          isActive: params.isActive
        },
        trx
      );

      const userId = created.id;
      const email = created.email;
      const isActive = params.isActive ?? false;
      const roleCodes = (params.roleCodes ?? []).map((role) => RoleSchema.parse(role));
      const outletIds = (params.outletIds ?? []).map((outletId) => NumericIdSchema.parse(outletId));
      const outletRoleAssignments = (params.outletRoleAssignments ?? []).map((assignment) => ({
        outletId: NumericIdSchema.parse(assignment.outletId),
        roleCodes: assignment.roleCodes.map((role) => RoleSchema.parse(role))
      }));

      const combinedRoleCodes = new Set<string>(roleCodes);
      for (const assignment of outletRoleAssignments) {
        for (const roleCode of assignment.roleCodes) {
          combinedRoleCodes.add(roleCode);
        }
      }

      const roleMap = await ensureRoleCodesExist(trx, [...combinedRoleCodes]);
      const actorMaxLevel = await getUserMaxRoleLevelForConnection(
        trx,
        params.companyId,
        params.actor.userId
      );
      const requestedMaxLevel = Math.max(
        0,
        ...[...combinedRoleCodes].map((code) => roleMap.get(code)?.role_level ?? 0)
      );

      if (requestedMaxLevel >= actorMaxLevel) {
        throw new RoleLevelViolationError("Insufficient role level to assign requested roles");
      }

      const globalRoleCodes = roleCodes.filter((code) => roleMap.get(code)?.is_global === 1);
      const nonGlobalRoleCodes = roleCodes.filter((code) => roleMap.get(code)?.is_global !== 1);

      if (globalRoleCodes.length > 1) {
        throw new RoleScopeViolationError("A user can only have one global role");
      }

      if (outletRoleAssignments.length === 0 && nonGlobalRoleCodes.length > 0) {
        if (outletIds.length === 0) {
          throw new RoleScopeViolationError("Outlet roles require outlet assignments");
        }
        for (const outletId of outletIds) {
          outletRoleAssignments.push({ outletId, roleCodes: nonGlobalRoleCodes });
        }
      }

      // SELECT → INSERT pattern for global roles
      if (globalRoleCodes.length > 0) {
        const existingRows = await trx
          .selectFrom("user_role_assignments")
          .where("user_id", "=", userId)
          .where("outlet_id", "is", null)
          .select(["role_id"])
          .execute();

        const existingRoleIds = new Set(existingRows.map((row) => Number(row.role_id)));

        const newGlobalRoleCodes = globalRoleCodes.filter((code) => {
          const roleId = roleMap.get(code)?.id ?? 0;
          return !existingRoleIds.has(roleId);
        });

        if (newGlobalRoleCodes.length > 0) {
          // SUPER_ADMIN uniqueness is enforced by DB UNIQUE constraint on
          // (user_id, role_id, outlet_id) where outlet_id IS NULL.
          // The DB will reject a second SUPER_ADMIN assignment with a duplicate key error.
          // We catch and rethrow as SuperAdminAlreadyExistsError for a clear API error.
          try {
            for (const code of newGlobalRoleCodes) {
              await trx
                .insertInto("user_role_assignments")
                .values({
                  user_id: userId,
                  role_id: roleMap.get(code)?.id ?? 0,
                  outlet_id: null,
                  company_id: params.companyId
                })
                .execute();
            }
          } catch (error: unknown) {
            if (
              error instanceof Error &&
              (error.message?.includes("Duplicate entry") || error.message?.includes("ER_DUP_ENTRY"))
            ) {
              throw new SuperAdminAlreadyExistsError();
            }
            throw error;
          }
        }
      }

      // SELECT → INSERT pattern for outlet roles
      if (outletRoleAssignments.length > 0) {
        const assignmentOutletIds = outletRoleAssignments.map((assignment) => assignment.outletId);
        await ensureOutletIdsExist(trx, params.companyId, assignmentOutletIds);

        const allOutletIds = [...new Set(outletRoleAssignments.map((a) => a.outletId))];

        const existingRows = await trx
          .selectFrom("user_role_assignments")
          .where("user_id", "=", userId)
          .where("outlet_id", "in", allOutletIds)
          .select(["outlet_id", "role_id"])
          .execute();

        const existingPairs = new Set(
          existingRows.map((row) => `${Number(row.outlet_id)}:${Number(row.role_id)}`)
        );

        const newOutletRoleValues: Array<{ user_id: number; outlet_id: number; role_id: number; company_id: number }> = [];
        for (const assignment of outletRoleAssignments) {
          for (const roleCode of assignment.roleCodes) {
            const roleSnapshot = roleMap.get(roleCode);
            if (!roleSnapshot) {
              throw new RoleNotFoundError("Role not found");
            }
            if (roleSnapshot.is_global === 1) {
              throw new RoleScopeViolationError("Global roles cannot be assigned per outlet");
            }

            const pairKey = `${assignment.outletId}:${roleSnapshot.id}`;
            if (!existingPairs.has(pairKey)) {
              newOutletRoleValues.push({
                user_id: userId,
                outlet_id: assignment.outletId,
                role_id: roleSnapshot.id,
                company_id: params.companyId
              });
            }
          }
        }

        for (const roleValue of newOutletRoleValues) {
          await trx
            .insertInto("user_role_assignments")
            .values(roleValue)
            .execute();
        }
      }

      const user = await this.findUserByIdTx(params.companyId, userId, trx);
      if (!user) {
        throw new UserNotFoundError("User not found after creation");
      }

      const auditContext = buildAuditContext(
        params.companyId,
        params.actor.userId,
        params.actor.outletId,
        params.actor.ipAddress
      );
      await this.auditService.logCreate(auditContext, "user", userId, {
        email,
        is_active: isActive,
        global_roles: globalRoleCodes,
        outlet_role_assignments: outletRoleAssignments
      });

      return user;
    });
  }

  /**
   * Find user by ID within a transaction.
   */
  private async findUserByIdTx(companyId: number, userId: number, db: KyselySchema): Promise<UserProfile | null> {
    const user = await findUserRowById(db, companyId, userId);
    if (!user) {
      return null;
    }

    const [globalRolesMap, outletRolesMap] = await Promise.all([
      hydrateUserGlobalRoles(db, companyId, [user.id]),
      hydrateUserOutletRoleAssignments(db, companyId, [user.id])
    ]);

    return {
      ...normalizeUserRow(user),
      global_roles: globalRolesMap.get(user.id) ?? [],
      outlet_role_assignments: outletRolesMap.get(user.id) ?? []
    };
  }

  /**
   * Create user basic within a transaction.
   */
  private async createUserBasicTx(
    params: {
      companyId: number;
      email: string;
      passwordHash: string;
      name?: string;
      isActive?: boolean;
    },
    db: KyselySchema
  ): Promise<{ id: number; email: string }> {
    const emailNormalized = normalizeEmail(params.email);
    const name = params.name?.trim() ?? null;
    const isActive = params.isActive ?? false;

    const existingRow = await db
      .selectFrom("users")
      .where("company_id", "=", params.companyId)
      .where("email", "=", emailNormalized)
      .select(["id"])
      .executeTakeFirst();

    if (existingRow) {
      throw new UserEmailExistsError("Email already exists");
    }

    const result = await db
      .insertInto("users")
      .values({
        company_id: params.companyId,
        name: name,
        email: emailNormalized,
        password_hash: params.passwordHash,
        is_active: isActive ? 1 : 0
      })
      .executeTakeFirst();

    return {
      id: Number(result.insertId),
      email: emailNormalized
    };
  }

  /**
   * Update user email.
   */
  async updateUserEmail(params: {
    companyId: number;
    userId: number;
    email: string;
    actor: UserActor;
  }): Promise<UserProfile> {
    return await this.db.transaction().execute(async (trx) => {
      await ensureUserExists(trx, params.companyId, params.userId);

      await ensureSuperAdminTargetManagedBySelf(
        trx,
        params.companyId,
        params.actor.userId,
        params.userId
      );

      const user = await ensureUserExists(trx, params.companyId, params.userId);
      const email = normalizeEmail(params.email);
      const auditContext = buildAuditContext(
        params.companyId,
        params.actor.userId,
        params.actor.outletId,
        params.actor.ipAddress
      );

      if (user.email !== email) {
        const existingRow = await trx
          .selectFrom("users")
          .where("company_id", "=", params.companyId)
          .where("email", "=", email)
          .select(["id"])
          .executeTakeFirst();

        if (existingRow) {
          throw new UserEmailExistsError("Email already exists");
        }

        await trx
          .updateTable("users")
          .set({ email, updated_at: new Date() })
          .where("id", "=", params.userId)
          .where("company_id", "=", params.companyId)
          .execute();

        await this.auditService.logUpdate(
          auditContext,
          "user",
          params.userId,
          { email: user.email },
          { email }
        );
      }

      const updated = await this.findUserByIdTx(params.companyId, params.userId, trx);
      if (!updated) {
        throw new UserNotFoundError("User not found after update");
      }

      return updated;
    });
  }

  /**
   * Set user roles (global or outlet-scoped).
   */
  async setUserRoles(params: {
    companyId: number;
    userId: number;
    roleCodes: string[];
    outletId?: number;
    actor: UserActor;
  }): Promise<UserProfile> {
    const { RoleSchema, NumericIdSchema } = await import("@jurnapod/shared");

    return await this.db.transaction().execute(async (trx) => {
      await ensureUserExists(trx, params.companyId, params.userId);

      await ensureSuperAdminTargetManagedBySelf(
        trx,
        params.companyId,
        params.actor.userId,
        params.userId
      );

      const roleCodes = params.roleCodes.map((role) => RoleSchema.parse(role));

      let roleMap: Map<string, { id: number; role_level: number; is_global: number }> = new Map();
      if (roleCodes.length > 0) {
        const roleRows = await ensureRoleCodesExist(trx, roleCodes);
        roleMap = roleRows as Map<string, { id: number; role_level: number; is_global: number }>;
      }

      const actorMaxLevel = await getUserMaxRoleLevelForConnection(
        trx,
        params.companyId,
        params.actor.userId
      );

      const requestedMaxLevel = Math.max(
        0,
        ...roleCodes.map((code) => roleMap.get(code)?.role_level ?? 0)
      );
      if (requestedMaxLevel >= actorMaxLevel) {
        throw new RoleLevelViolationError("Insufficient role level to assign this role");
      }

      const isOutletAssignment = typeof params.outletId === "number";
      if (roleCodes.length > 0) {
        const globalRoles = roleCodes.filter((code) => roleMap.get(code)?.is_global === 1);
        const nonGlobalRoles = roleCodes.filter((code) => roleMap.get(code)?.is_global !== 1);

        if (isOutletAssignment && globalRoles.length > 0) {
          throw new RoleScopeViolationError("Global roles cannot be assigned per outlet");
        }

        if (!isOutletAssignment && nonGlobalRoles.length > 0) {
          throw new RoleScopeViolationError("Outlet-scoped roles require outlet assignments");
        }

        if (!isOutletAssignment && globalRoles.length > 1) {
          throw new RoleScopeViolationError("A user can only have one global role");
        }
      }

      const auditContext = buildAuditContext(
        params.companyId,
        params.actor.userId,
        params.actor.outletId,
        params.actor.ipAddress
      );

      if (isOutletAssignment) {
        const outletId = NumericIdSchema.parse(params.outletId);
        await ensureOutletIdsExist(trx, params.companyId, [outletId]);

        const beforeRows = await trx
          .selectFrom("user_role_assignments as ura")
          .innerJoin("roles as r", "r.id", "ura.role_id")
          .where("ura.user_id", "=", params.userId)
          .where("ura.outlet_id", "=", outletId)
          .orderBy("r.code", "asc")
          .select(["r.code"])
          .execute();

        const beforeRoles = beforeRows.map((row) => row.code);

        await trx
          .deleteFrom("user_role_assignments")
          .where("user_id", "=", params.userId)
          .where("outlet_id", "=", outletId)
          .execute();

        if (roleCodes.length > 0) {
          for (const code of roleCodes) {
            await trx
              .insertInto("user_role_assignments")
              .values({
                user_id: params.userId,
                outlet_id: outletId,
                role_id: roleMap.get(code)?.id ?? 0,
                company_id: params.companyId
              })
              .execute();
          }
        }

        await this.auditService.logUpdate(
          auditContext,
          "user",
          params.userId,
          { outlet_id: outletId, role_codes: beforeRoles },
          { outlet_id: outletId, role_codes: roleCodes }
        );
      } else {
        const beforeRoles =
          (await hydrateUserGlobalRoles(trx, params.companyId, [params.userId])).get(params.userId) ?? [];

        // Prevent assigning SUPER_ADMIN to a user who doesn't already have it
        // if another user already holds the SUPER_ADMIN role globally
        const isNewSuperAdminAssignment =
          roleCodes.includes("SUPER_ADMIN") && !beforeRoles.includes("SUPER_ADMIN");

        if (isNewSuperAdminAssignment) {
          const alreadyHasSuperAdmin = await hasExistingSuperAdmin(trx);
          if (alreadyHasSuperAdmin) {
            throw new SuperAdminAlreadyExistsError();
          }
        }

        await trx
          .deleteFrom("user_role_assignments")
          .where("user_id", "=", params.userId)
          .where("outlet_id", "is", null)
          .execute();

        if (roleCodes.length > 0) {
          // DB will reject duplicate SUPER_ADMIN assignment via unique constraint.
          // Catch and rethrow as SuperAdminAlreadyExistsError for clear API error.
          try {
            for (const code of roleCodes) {
              await trx
                .insertInto("user_role_assignments")
                .values({
                  user_id: params.userId,
                  outlet_id: null,
                  role_id: roleMap.get(code)?.id ?? 0,
                  company_id: params.companyId
                })
                .execute();
            }
          } catch (error: unknown) {
            if (
              error instanceof Error &&
              (error.message?.includes("Duplicate entry") || error.message?.includes("ER_DUP_ENTRY"))
            ) {
              throw new SuperAdminAlreadyExistsError();
            }
            throw error;
          }
        }

        await this.auditService.logUpdate(
          auditContext,
          "user",
          params.userId,
          { global_roles: beforeRoles },
          { global_roles: roleCodes }
        );
      }

      const updated = await this.findUserByIdTx(params.companyId, params.userId, trx);
      if (!updated) {
        throw new UserNotFoundError("User not found after role update");
      }

      return updated;
    });
  }

  /**
   * Set user outlets (replace all outlet role assignments).
   */
  async setUserOutlets(params: {
    companyId: number;
    userId: number;
    outletIds: number[];
    actor: UserActor;
  }): Promise<UserProfile> {
    const { NumericIdSchema } = await import("@jurnapod/shared");

    return await this.db.transaction().execute(async (trx) => {
      await ensureUserExists(trx, params.companyId, params.userId);

      await ensureSuperAdminTargetManagedBySelf(
        trx,
        params.companyId,
        params.actor.userId,
        params.userId
      );

      const beforeRows = await trx
        .selectFrom("user_role_assignments")
        .where("user_id", "=", params.userId)
        .where("outlet_id", "is not", null)
        .select(["outlet_id"])
        .execute();

      const beforeOutletIds = beforeRows.map((row) => Number(row.outlet_id));
      const outletIds = params.outletIds.map((outletId) => NumericIdSchema.parse(outletId));

      if (outletIds.length > 0) {
        await ensureOutletIdsExist(trx, params.companyId, outletIds);
      }

      if (outletIds.length === 0) {
        await trx
          .deleteFrom("user_role_assignments")
          .where("user_id", "=", params.userId)
          .where("outlet_id", "is not", null)
          .execute();
      } else {
        await trx
          .deleteFrom("user_role_assignments")
          .where("user_id", "=", params.userId)
          .where("outlet_id", "is not", null)
          .where("outlet_id", "not in", outletIds)
          .execute();
      }

      const updated = await this.findUserByIdTx(params.companyId, params.userId, trx);
      if (!updated) {
        throw new UserNotFoundError("User not found after outlet update");
      }

      return updated;
    });
  }

  /**
   * Set user password.
   */
  async setUserPassword(params: {
    companyId: number;
    userId: number;
    passwordHash: string;
    actor: UserActor;
  }): Promise<void> {
    return await this.db.transaction().execute(async (trx) => {
      await ensureSuperAdminTargetManagedBySelf(
        trx,
        params.companyId,
        params.actor.userId,
        params.userId
      );

      const userExists = await trx
        .selectFrom("users")
        .where("id", "=", params.userId)
        .where("company_id", "=", params.companyId)
        .select(["id"])
        .executeTakeFirst();

      if (!userExists) {
        throw new UserNotFoundError("User not found");
      }

      await trx
        .updateTable("users")
        .set({ password_hash: params.passwordHash, updated_at: new Date() })
        .where("id", "=", params.userId)
        .where("company_id", "=", params.companyId)
        .execute();

      const auditContext = buildAuditContext(
        params.companyId,
        params.actor.userId,
        params.actor.outletId,
        params.actor.ipAddress
      );
      await this.auditService.logAction(auditContext, "user", params.userId, "UPDATE", {
        password_reset: true
      });
    });
  }

  /**
   * Set user active state (activate/deactivate).
   */
  async setUserActiveState(params: {
    companyId: number;
    userId: number;
    isActive: boolean;
    actor: UserActor;
  }): Promise<UserProfile> {
    return await this.db.transaction().execute(async (trx) => {
      if (!params.isActive) {
        const isSuperAdmin = await userHasSuperAdminRole(trx, params.userId);
        if (isSuperAdmin) {
          throw new SuperAdminProtectionError("Cannot deactivate SUPER_ADMIN user");
        }
      }

      if (params.isActive) {
      await ensureSuperAdminTargetManagedBySelf(
        trx,
        params.companyId,
        params.actor.userId,
        params.userId
      );
      }

      const userExists = await trx
        .selectFrom("users")
        .where("id", "=", params.userId)
        .where("company_id", "=", params.companyId)
        .select(["id"])
        .executeTakeFirst();

      if (!userExists) {
        throw new UserNotFoundError("User not found");
      }

      await trx
        .updateTable("users")
        .set({ is_active: params.isActive ? 1 : 0, updated_at: new Date() })
        .where("id", "=", params.userId)
        .where("company_id", "=", params.companyId)
        .execute();

      const auditContext = buildAuditContext(
        params.companyId,
        params.actor.userId,
        params.actor.outletId,
        params.actor.ipAddress
      );

      if (params.isActive) {
        await this.auditService.logReactivate(auditContext, "user", params.userId, {
          is_active: true
        });
      } else {
        await this.auditService.logDeactivate(auditContext, "user", params.userId, {
          is_active: false
        });
      }

      const updated = await this.findUserByIdTx(params.companyId, params.userId, trx);
      if (!updated) {
        throw new UserNotFoundError("User not found after update");
      }

      return updated;
    });
  }
}