// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "./db";
import type { KyselySchema } from "@jurnapod/db";
import { AuditService } from "@jurnapod/modules-platform";
import { NumericIdSchema, RoleSchema } from "@jurnapod/shared";
import { hashPassword, type PasswordHashPolicy } from "./password-hash";
import { getAppEnv } from "./env";
import { toRfc3339Required } from "@jurnapod/shared";

export class UserNotFoundError extends Error {}
export class UserEmailExistsError extends Error {}
export class RoleNotFoundError extends Error {}
export class RoleLevelViolationError extends Error {}
export class RoleScopeViolationError extends Error {}
export class OutletNotFoundError extends Error {}
export class SuperAdminProtectionError extends Error {}

export type UserProfile = {
  id: number;
  company_id: number;
  name: string | null;
  email: string;
  is_active: boolean;
  global_roles: string[];
  outlet_role_assignments: {
    outlet_id: number;
    outlet_code: string;
    outlet_name: string;
    role_codes: string[];
  }[];
  created_at?: string;
  updated_at?: string;
};

type UserActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

type UserRow = {
  id: number;
  company_id: number;
  name: string | null;
  email: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
};

export type RoleRow = {
  id: number;
  code: string;
  name: string;
  company_id?: number | null;
  is_global?: number | null;
  role_level?: number | null;
};

type RoleSnapshot = {
  id: number;
  role_level: number;
  is_global: number;
};

function buildAuditContext(companyId: number, actor: UserActor) {
  return {
    company_id: companyId,
    user_id: actor.userId,
    outlet_id: actor.outletId ?? null,
    ip_address: actor.ipAddress ?? null
  };
}

function passwordHashPolicyFromEnv(): PasswordHashPolicy {
  const env = getAppEnv();
  return {
    defaultAlgorithm: env.auth.password.defaultAlgorithm,
    bcryptRounds: env.auth.password.bcryptRounds,
    argon2MemoryKb: env.auth.password.argon2MemoryKb,
    argon2TimeCost: env.auth.password.argon2TimeCost,
    argon2Parallelism: env.auth.password.argon2Parallelism
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function sendRoleChangeNotification(companyId: number, userId: number, newRoles: string[]): Promise<void> {
  console.log(`[NOTIFICATION] User ${userId} roles changed to: ${newRoles.join(", ")} (company ${companyId})`);
}

async function findUserRowById(
  db: KyselySchema,
  companyId: number,
  userId: number
): Promise<UserRow | null> {
  const row = await db
    .selectFrom('users')
    .where('id', '=', userId)
    .where('company_id', '=', companyId)
    .select(['id', 'company_id', 'name', 'email', 'is_active', 'created_at', 'updated_at'])
    .executeTakeFirst();

  return row ?? null;
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
    .selectFrom('roles')
    .where('code', 'in', roleCodes)
    .select(['id', 'code', 'is_global', 'role_level'])
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
    .selectFrom('user_role_assignments as ura')
    .innerJoin('roles as r', 'r.id', 'ura.role_id')
    .innerJoin('users as u', 'u.id', 'ura.user_id')
    .where('u.id', '=', userId)
    .where('u.company_id', '=', companyId)
    .where('u.is_active', '=', 1)
    .where('ura.outlet_id', 'is', null)
    .select((eb) => [eb.fn.max('r.role_level').as('max_level')])
    .executeTakeFirst();

  const maxLevel = row?.max_level;
  return Number(maxLevel ?? 0);
}

async function userHasSuperAdminRole(
  db: KyselySchema,
  userId: number
): Promise<boolean> {
  // SUPER_ADMIN is a global role - no company_id check needed
  const row = await db
    .selectFrom('user_role_assignments as ura')
    .innerJoin('roles as r', 'r.id', 'ura.role_id')
    .where('ura.user_id', '=', userId)
    .where('r.code', '=', 'SUPER_ADMIN')
    .where('ura.outlet_id', 'is', null)
    .select(['ura.id'])
    .executeTakeFirst();

  return row !== undefined;
}

async function ensureSuperAdminTargetManagedBySelf(
  db: KyselySchema,
  actorUserId: number,
  targetUserId: number
): Promise<void> {
  const targetIsSuperAdmin = await userHasSuperAdminRole(db, targetUserId);
  if (!targetIsSuperAdmin) {
    return;
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
    .selectFrom('outlets')
    .where('company_id', '=', companyId)
    .where('id', 'in', outletIds)
    .select(['id'])
    .execute();

  if (rows.length !== outletIds.length) {
    throw new OutletNotFoundError("Outlet not found");
  }
}

async function hydrateUserGlobalRoles(
  db: KyselySchema,
  userIds: number[]
): Promise<Map<number, string[]>> {
  const roleMap = new Map<number, string[]>();
  if (userIds.length === 0) {
    return roleMap;
  }

  const rows = await db
    .selectFrom('user_role_assignments as ura')
    .innerJoin('roles as r', 'r.id', 'ura.role_id')
    .where('ura.user_id', 'in', userIds)
    .where('r.is_global', '=', 1)
    .where('ura.outlet_id', 'is', null)
    .orderBy('r.code', 'asc')
    .select(['ura.user_id', 'r.code'])
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
  userIds: number[]
): Promise<Map<number, UserProfile["outlet_role_assignments"]>> {
  const assignmentMap = new Map<number, UserProfile["outlet_role_assignments"]>();
  if (userIds.length === 0) {
    return assignmentMap;
  }

  const rows = await db
    .selectFrom('user_role_assignments as ura')
    .innerJoin('outlets as o', 'o.id', 'ura.outlet_id')
    .innerJoin('roles as r', 'r.id', 'ura.role_id')
    .where('ura.user_id', 'in', userIds)
    .where('ura.outlet_id', 'is not', null)
    .orderBy('o.id', 'asc')
    .orderBy('r.code', 'asc')
    .select(['ura.user_id', 'o.id as outlet_id', 'o.code as outlet_code', 'o.name as outlet_name', 'r.code as role_code'])
    .execute();

  const userOutletMap = new Map<number, Map<number, UserProfile["outlet_role_assignments"][number]>>();

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

export class CrossCompanyAccessError extends Error {}

export async function listUsers(
  companyId: number,
  actor: { userId: number; companyId: number },
  filters?: { isActive?: boolean; search?: string }
) {
  const db = getDb();

  // Cross-company access check: only SUPER_ADMIN can list users from other companies
  if (companyId !== actor.companyId) {
    const isSuperAdmin = await userHasSuperAdminRole(db, actor.userId);
    if (!isSuperAdmin) {
      throw new CrossCompanyAccessError("Cannot list users from another company");
    }
  }

  let query = db
    .selectFrom('users')
    .where('company_id', '=', companyId)
    .select(['id', 'company_id', 'name', 'email', 'is_active', 'created_at', 'updated_at']);

  if (typeof filters?.isActive === "boolean") {
    query = query.where('is_active', '=', filters.isActive ? 1 : 0);
  }

  if (filters?.search) {
    query = query.where('email', 'like', `%${filters.search}%`);
  }

  query = query.orderBy('id', 'asc');

  const rows = await query.execute();
  const baseUsers = rows.map((row) => normalizeUserRow(row));
  const userIds = baseUsers.map((user) => user.id);

  const [globalRolesMap, outletRolesMap] = await Promise.all([
    hydrateUserGlobalRoles(db, userIds),
    hydrateUserOutletRoleAssignments(db, userIds)
  ]);

  return baseUsers.map((user) => ({
    ...user,
    global_roles: globalRolesMap.get(user.id) ?? [],
    outlet_role_assignments: outletRolesMap.get(user.id) ?? []
  }));
}

export async function findUserById(companyId: number, userId: number, db?: KyselySchema): Promise<UserProfile | null> {
  const database = db ?? getDb();
  const user = await findUserRowById(database, companyId, userId);
  if (!user) {
    return null;
  }

  const [globalRolesMap, outletRolesMap] = await Promise.all([
    hydrateUserGlobalRoles(database, [user.id]),
    hydrateUserOutletRoleAssignments(database, [user.id])
  ]);

  return {
    ...normalizeUserRow(user),
    global_roles: globalRolesMap.get(user.id) ?? [],
    outlet_role_assignments: outletRolesMap.get(user.id) ?? []
  };
}

/**
 * Create a user with minimal setup (no role assignments, no audit).
 * Use this for testing - it only inserts the user row.
 * For production use, use createUser() which includes roles and audit.
 */
export async function createUserBasic(params: {
  companyId: number;
  email: string;
  password?: string;
  name?: string;
  isActive?: boolean;
}, db?: KyselySchema): Promise<{ id: number; email: string }> {
  const database = db ?? getDb();

  const emailNormalized = normalizeEmail(params.email);
  const name = params.name?.trim() ?? null;
  const isActive = params.isActive ?? false;

  const existingRow = await database
    .selectFrom('users')
    .where('company_id', '=', params.companyId)
    .where('email', '=', emailNormalized)
    .select(['id'])
    .executeTakeFirst();

  if (existingRow) {
    throw new UserEmailExistsError("Email already exists");
  }

  const policy = passwordHashPolicyFromEnv();
  const passwordToHash = params.password ?? generateTempPassword();
  const passwordHash = await hashPassword(passwordToHash, policy);

  const result = await database
    .insertInto('users')
    .values({
      company_id: params.companyId,
      name: name,
      email: emailNormalized,
      password_hash: passwordHash,
      is_active: isActive ? 1 : 0
    })
    .executeTakeFirst();

  return {
    id: Number(result.insertId),
    email: emailNormalized
  };
}

export async function createUser(params: {
  companyId: number;
  name?: string;
  email: string;
  password?: string;
  roleCodes?: string[];
  outletIds?: number[];
  outletRoleAssignments?: Array<{ outletId: number; roleCodes: string[] }>;
  isActive?: boolean;
  actor: UserActor;
}): Promise<UserProfile> {
  const db = getDb();
  const auditService = new AuditService(db);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  return await db.transaction().execute(async (trx) => {
    // Use createUserBasic to insert the user row
    const created = await createUserBasic({
      companyId: params.companyId,
      email: params.email,
      password: params.password,
      name: params.name,
      isActive: params.isActive
    }, trx);

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
      // Get existing global role IDs for this user
      const existingRows = await trx
        .selectFrom('user_role_assignments')
        .where('user_id', '=', userId)
        .where('outlet_id', 'is', null)
        .select(['role_id'])
        .execute();

      const existingRoleIds = new Set(existingRows.map((row) => Number(row.role_id)));

      // Filter out roles that already exist
      const newGlobalRoleCodes = globalRoleCodes.filter((code) => {
        const roleId = roleMap.get(code)?.id ?? 0;
        return !existingRoleIds.has(roleId);
      });

      // Only insert if there are new roles
      if (newGlobalRoleCodes.length > 0) {
        for (const code of newGlobalRoleCodes) {
          await trx
            .insertInto('user_role_assignments')
            .values({
              user_id: userId,
              role_id: roleMap.get(code)?.id ?? 0,
              outlet_id: null,
              company_id: params.companyId
            })
            .execute();
        }
      }
    }

    // SELECT → INSERT pattern for outlet roles
    if (outletRoleAssignments.length > 0) {
      const assignmentOutletIds = outletRoleAssignments.map((assignment) => assignment.outletId);
      await ensureOutletIdsExist(trx, params.companyId, assignmentOutletIds);

      // Get all existing outlet role assignments for this user
      const allOutletIds = [...new Set(outletRoleAssignments.map(a => a.outletId))];

      const existingRows = await trx
        .selectFrom('user_role_assignments')
        .where('user_id', '=', userId)
        .where('outlet_id', 'in', allOutletIds)
        .select(['outlet_id', 'role_id'])
        .execute();

      // Build set of existing (outlet_id, role_id) pairs
      const existingPairs = new Set(
        existingRows.map((row) => `${Number(row.outlet_id)}:${Number(row.role_id)}`)
      );

      // Filter out assignments that already exist
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
            newOutletRoleValues.push({ user_id: userId, outlet_id: assignment.outletId, role_id: roleSnapshot.id, company_id: params.companyId });
          }
        }
      }

      // Only insert if there are new assignments
      for (const roleValue of newOutletRoleValues) {
        await trx
          .insertInto('user_role_assignments')
          .values(roleValue)
          .execute();
      }
    }

    await auditService.logCreate(auditContext, "user", userId, {
      email,
      is_active: isActive,
      global_roles: globalRoleCodes,
      outlet_role_assignments: outletRoleAssignments
    });

    const user = await findUserById(params.companyId, userId, trx);
    if (!user) {
      throw new UserNotFoundError("User not found after creation");
    }

    return user;
  });
}

export async function updateUserEmail(params: {
  companyId: number;
  userId: number;
  email: string;
  actor: UserActor;
}): Promise<UserProfile> {
  const db = getDb();
  const auditService = new AuditService(db);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  return await db.transaction().execute(async (trx) => {
    await ensureUserExists(trx, params.companyId, params.userId);

    await ensureSuperAdminTargetManagedBySelf(
      trx,
      params.actor.userId,
      params.userId
    );

    const user = await ensureUserExists(trx, params.companyId, params.userId);
    const email = normalizeEmail(params.email);

    if (user.email !== email) {
      const existingRow = await trx
        .selectFrom('users')
        .where('company_id', '=', params.companyId)
        .where('email', '=', email)
        .select(['id'])
        .executeTakeFirst();

      if (existingRow) {
        throw new UserEmailExistsError("Email already exists");
      }

      await trx
        .updateTable('users')
        .set({ email, updated_at: new Date() })
        .where('id', '=', params.userId)
        .where('company_id', '=', params.companyId)
        .execute();

      await auditService.logUpdate(
        auditContext,
        "user",
        params.userId,
        { email: user.email },
        { email }
      );
    }

    const updated = await findUserById(params.companyId, params.userId, trx);
    if (!updated) {
      throw new UserNotFoundError("User not found after update");
    }

    return updated;
  });
}

export async function setUserRoles(params: {
  companyId: number;
  userId: number;
  roleCodes: string[];
  outletId?: number;
  actor: UserActor;
}): Promise<UserProfile> {
  const db = getDb();
  const auditService = new AuditService(db);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  return await db.transaction().execute(async (trx) => {
    await ensureUserExists(trx, params.companyId, params.userId);

    await ensureSuperAdminTargetManagedBySelf(
      trx,
      params.actor.userId,
      params.userId
    );

    const roleCodes = params.roleCodes.map((role) => RoleSchema.parse(role));

    // Get role info if provided
    let roleMap: Map<string, { id: number; role_level: number; is_global: number }> = new Map();
    if (roleCodes.length > 0) {
      const roleRows = await ensureRoleCodesExist(trx, roleCodes);
      roleMap = roleRows;
    }

    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      trx,
      params.companyId,
      params.actor.userId
    );

    // Validate role level
    const requestedMaxLevel = Math.max(0, ...roleCodes.map((code) => roleMap.get(code)?.role_level ?? 0));
    if (requestedMaxLevel >= actorMaxLevel) {
      throw new RoleLevelViolationError("Insufficient role level to assign this role");
    }

    // Validate role scope: global roles cannot be outlet-scoped and vice versa
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

    // Handle outlet role assignment
    if (isOutletAssignment) {
      const outletId = NumericIdSchema.parse(params.outletId);
      await ensureOutletIdsExist(trx, params.companyId, [outletId]);

      // Get current outlet roles
      const beforeRows = await trx
        .selectFrom('user_role_assignments as ura')
        .innerJoin('roles as r', 'r.id', 'ura.role_id')
        .where('ura.user_id', '=', params.userId)
        .where('ura.outlet_id', '=', outletId)
        .orderBy('r.code', 'asc')
        .select(['r.code'])
        .execute();

      const beforeRoles = beforeRows.map((row) => row.code);

      await trx
        .deleteFrom('user_role_assignments')
        .where('user_id', '=', params.userId)
        .where('outlet_id', '=', outletId)
        .execute();

      // Insert new outlet roles
      if (roleCodes.length > 0) {
        for (const code of roleCodes) {
          await trx
            .insertInto('user_role_assignments')
            .values({
              user_id: params.userId,
              outlet_id: outletId,
              role_id: roleMap.get(code)?.id ?? 0,
              company_id: params.companyId
            })
            .execute();
        }
      }

      await auditService.logUpdate(
        auditContext,
        "user",
        params.userId,
        { outlet_id: outletId, role_codes: beforeRoles },
        { outlet_id: outletId, role_codes: roleCodes }
      );
    } else {
      // Handle global role - update user_role_assignments (outlet_id = NULL)
      const beforeRoles =
        (await hydrateUserGlobalRoles(trx, [params.userId])).get(params.userId) ?? [];

      // Delete existing global role assignments
      await trx
        .deleteFrom('user_role_assignments')
        .where('user_id', '=', params.userId)
        .where('outlet_id', 'is', null)
        .execute();

      // Insert new global role assignment(s)
      if (roleCodes.length > 0) {
        for (const code of roleCodes) {
          await trx
            .insertInto('user_role_assignments')
            .values({
              user_id: params.userId,
              role_id: roleMap.get(code)?.id ?? 0,
              outlet_id: null,
              company_id: params.companyId
            })
            .execute();
        }
      }

      await auditService.logUpdate(
        auditContext,
        "user",
        params.userId,
        { global_roles: beforeRoles },
        { global_roles: roleCodes }
      );
    }

    await sendRoleChangeNotification(params.companyId, params.userId, roleCodes);

    const updated = await findUserById(params.companyId, params.userId, trx);
    if (!updated) {
      throw new UserNotFoundError("User not found after role update");
    }

    return updated;
  });
}

export async function setUserOutlets(params: {
  companyId: number;
  userId: number;
  outletIds: number[];
  actor: UserActor;
}): Promise<UserProfile> {
  const db = getDb();
  const auditService = new AuditService(db);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  return await db.transaction().execute(async (trx) => {
    await ensureUserExists(trx, params.companyId, params.userId);

    await ensureSuperAdminTargetManagedBySelf(
      trx,
      params.actor.userId,
      params.userId
    );

    const beforeRows = await trx
      .selectFrom('user_role_assignments')
      .where('user_id', '=', params.userId)
      .where('outlet_id', 'is not', null)
      .select(['outlet_id'])
      .execute();

    const beforeOutletIds = beforeRows.map((row) => Number(row.outlet_id));
    const outletIds = params.outletIds.map((outletId) => NumericIdSchema.parse(outletId));
    
    if (outletIds.length > 0) {
      await ensureOutletIdsExist(trx, params.companyId, outletIds);
    }

    if (outletIds.length === 0) {
      await trx
        .deleteFrom('user_role_assignments')
        .where('user_id', '=', params.userId)
        .where('outlet_id', 'is not', null)
        .execute();
    } else {
      await trx
        .deleteFrom('user_role_assignments')
        .where('user_id', '=', params.userId)
        .where('outlet_id', 'is not', null)
        .where('outlet_id', 'not in', outletIds)
        .execute();
    }

    await auditService.logUpdate(
      auditContext,
      "user",
      params.userId,
      { outlet_ids: beforeOutletIds },
      { outlet_ids: outletIds }
    );

    const updated = await findUserById(params.companyId, params.userId, trx);
    if (!updated) {
      throw new UserNotFoundError("User not found after outlet update");
    }

    return updated;
  });
}

export async function setUserPassword(params: {
  companyId: number;
  userId: number;
  password: string;
  actor: UserActor;
}): Promise<void> {
  const db = getDb();
  const auditService = new AuditService(db);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  await db.transaction().execute(async (trx) => {
    await ensureSuperAdminTargetManagedBySelf(
      trx,
      params.actor.userId,
      params.userId
    );

    const policy = passwordHashPolicyFromEnv();
    const passwordHash = await hashPassword(params.password, policy);
    
    // First check user exists
    const userExists = await trx
      .selectFrom('users')
      .where('id', '=', params.userId)
      .where('company_id', '=', params.companyId)
      .select(['id'])
      .executeTakeFirst();

    if (!userExists) {
      throw new UserNotFoundError("User not found");
    }

    await trx
      .updateTable('users')
      .set({ password_hash: passwordHash, updated_at: new Date() })
      .where('id', '=', params.userId)
      .where('company_id', '=', params.companyId)
      .execute();

    await auditService.logAction(auditContext, "user", params.userId, "UPDATE", {
      password_reset: true
    });
  });
}

export async function setUserActiveState(params: {
  companyId: number;
  userId: number;
  isActive: boolean;
  actor: UserActor;
}): Promise<UserProfile> {
  const db = getDb();
  const auditService = new AuditService(db);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  return await db.transaction().execute(async (trx) => {
    // Prevent deactivating SUPER_ADMIN users (including self, for safety)
    if (!params.isActive) {
      const isSuperAdmin = await userHasSuperAdminRole(
        trx,
        params.userId
      );
      if (isSuperAdmin) {
        throw new SuperAdminProtectionError(
          "Cannot deactivate SUPER_ADMIN user"
        );
      }
    }

    // For reactivate, ensure only self SUPER_ADMIN can reactivate SUPER_ADMIN
    if (params.isActive) {
      await ensureSuperAdminTargetManagedBySelf(
        trx,
        params.actor.userId,
        params.userId
      );
    }

    // First check user exists
    const userExists = await trx
      .selectFrom('users')
      .where('id', '=', params.userId)
      .where('company_id', '=', params.companyId)
      .select(['id'])
      .executeTakeFirst();

    if (!userExists) {
      throw new UserNotFoundError("User not found");
    }

    await trx
      .updateTable('users')
      .set({ is_active: params.isActive ? 1 : 0, updated_at: new Date() })
      .where('id', '=', params.userId)
      .where('company_id', '=', params.companyId)
      .execute();

    if (params.isActive) {
      await auditService.logReactivate(auditContext, "user", params.userId, {
        is_active: true
      });
    } else {
      await auditService.logDeactivate(auditContext, "user", params.userId, {
        is_active: false
      });
    }

    const updated = await findUserById(params.companyId, params.userId, trx);
    if (!updated) {
      throw new UserNotFoundError("User not found after update");
    }

    return updated;
  });
}

export async function listRoles(
  companyId: number,
  isSuperAdmin: boolean = false,
  filterCompanyId?: number
): Promise<
  Array<{ id: number; code: string; name: string; company_id: number | null; is_global: boolean; role_level: number }>
> {
  const db = getDb();

  let query = db
    .selectFrom('roles')
    .select(['id', 'code', 'name', 'company_id', 'is_global', 'role_level'])
    .orderBy('company_id', 'asc')
    .orderBy('code', 'asc');

  if (isSuperAdmin) {
    if (filterCompanyId !== undefined) {
      query = query.where((eb) => eb.or([
        eb('company_id', '=', filterCompanyId),
        eb('company_id', 'is', null)
      ]));
    }
  } else {
    query = query.where((eb) => eb.or([
      eb('company_id', '=', companyId),
      eb('company_id', 'is', null)
    ]));
  }

  const rows = await query.execute();

  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
    company_id: row.company_id ? Number(row.company_id) : null,
    is_global: Boolean(row.is_global),
    role_level: Number(row.role_level ?? 0)
  }));
}

export async function getRole(roleId: number): Promise<{
  id: number;
  code: string;
  name: string;
  is_global: boolean;
  role_level: number;
}> {
  const db = getDb();

  const row = await db
    .selectFrom('roles')
    .where('id', '=', roleId)
    .select(['id', 'code', 'name', 'is_global', 'role_level'])
    .executeTakeFirst();

  if (!row) {
    throw new RoleNotFoundError(`Role with id ${roleId} not found`);
  }

  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    is_global: Boolean(row.is_global),
    role_level: Number(row.role_level ?? 0)
  };
}

export async function getRoleWithPermissions(params: {
  roleId: number;
  companyId: number;
}): Promise<{
  id: number;
  code: string;
  name: string;
  is_global: boolean;
  role_level: number;
  permissions: ModuleRoleResponse[];
}> {
  const role = await getRole(params.roleId);
  const permissions = await listModuleRoles({
    companyId: params.companyId,
    roleId: params.roleId
  });

  return {
    ...role,
    permissions
  };
}

export async function createRole(params: {
  companyId: number;
  code: string;
  name: string;
  roleLevel?: number;
  actor: UserActor;
}): Promise<{ id: number; code: string; name: string; company_id: number | null; is_global: boolean; role_level: number }> {
  const db = getDb();
  const auditService = new AuditService(db);

  return await db.transaction().execute(async (trx) => {
    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      trx,
      params.companyId,
      params.actor.userId
    );
    const newRoleLevel = params.roleLevel ?? 0;

    if (newRoleLevel >= actorMaxLevel) {
      throw new RoleLevelViolationError("Cannot create role with level equal to or higher than your own role level");
    }

    // Check if role code already exists for this company
    const existing = await trx
      .selectFrom('roles')
      .where('company_id', '=', params.companyId)
      .where('code', '=', params.code)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new Error(`Role with code ${params.code} already exists`);
    }

    // Insert role with company_id
    const result = await trx
      .insertInto('roles')
      .values({
        code: params.code,
        name: params.name,
        company_id: params.companyId,
        role_level: newRoleLevel
      })
      .executeTakeFirst();

    const roleId = Number(result.insertId);
    const auditContext = buildAuditContext(params.companyId, params.actor);

    await auditService.logCreate(auditContext, "setting", roleId, {
      type: "role",
      code: params.code,
      name: params.name,
      company_id: params.companyId,
      role_level: newRoleLevel
    });

    return {
      id: roleId,
      code: params.code,
      name: params.name,
      company_id: params.companyId,
      is_global: false,
      role_level: newRoleLevel
    };
  });
}

export async function updateRole(params: {
  companyId: number;
  roleId: number;
  name?: string;
  actor: UserActor;
}): Promise<{ id: number; code: string; name: string; is_global: boolean; role_level: number }> {
  const db = getDb();
  const auditService = new AuditService(db);

  return await db.transaction().execute(async (trx) => {
    // Get current role
    const currentRole = await trx
      .selectFrom('roles')
      .where('id', '=', params.roleId)
      .select(['id', 'code', 'name', 'is_global', 'role_level'])
      .executeTakeFirst();

    if (!currentRole) {
      throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
    }

    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      trx,
      params.companyId,
      params.actor.userId
    );
    const targetLevel = Number(currentRole.role_level ?? 0);

    if (targetLevel > actorMaxLevel) {
      throw new RoleLevelViolationError("Insufficient role level to update this role");
    }

    // Build update
    if (params.name && params.name !== currentRole.name) {
      await trx
        .updateTable('roles')
        .set({ name: params.name })
        .where('id', '=', params.roleId)
        .execute();

      const auditContext = buildAuditContext(params.companyId, params.actor);
      await auditService.logUpdate(
        auditContext,
        "setting",
        params.roleId,
        { name: currentRole.name },
        { name: params.name }
      );
    }

    return {
      id: Number(currentRole.id),
      code: currentRole.code,
      name: params.name ?? currentRole.name,
      is_global: Boolean(currentRole.is_global),
      role_level: Number(currentRole.role_level ?? 0)
    };
  });
}

export async function deleteRole(params: {
  companyId: number;
  roleId: number;
  actor: UserActor;
}): Promise<void> {
  const db = getDb();
  const auditService = new AuditService(db);

  await db.transaction().execute(async (trx) => {
    // Get current role
    const role = await trx
      .selectFrom('roles')
      .where('id', '=', params.roleId)
      .select(['id', 'code', 'name', 'role_level'])
      .executeTakeFirst();

    if (!role) {
      throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
    }

    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      trx,
      params.companyId,
      params.actor.userId
    );
    const targetLevel = Number(role.role_level ?? 0);

    if (targetLevel > actorMaxLevel) {
      throw new RoleLevelViolationError("Insufficient role level to delete this role");
    }

    // Check if role is in use
    const userRolesCount = await trx
      .selectFrom('user_role_assignments')
      .where('role_id', '=', params.roleId)
      .select((eb) => [eb.fn.count('id').as('count')])
      .executeTakeFirst();

    const count = Number(userRolesCount?.count ?? 0);
    if (count > 0) {
      throw new Error(`Cannot delete role ${role.code}: ${count} users are assigned to this role`);
    }

    // Delete role
    await trx
      .deleteFrom('roles')
      .where('id', '=', params.roleId)
      .execute();

    const auditContext = buildAuditContext(params.companyId, params.actor);
    await auditService.logDelete(auditContext, "setting", params.roleId, {
      type: "role",
      code: role.code,
      name: role.name
    });
  });
}

export async function listOutlets(
  companyId: number
): Promise<Array<{ id: number; code: string; name: string }>> {
  const db = getDb();
  const rows = await db
    .selectFrom('outlets')
    .where('company_id', '=', companyId)
    .orderBy('id', 'asc')
    .select(['id', 'code', 'name'])
    .execute();

  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name
  }));
}

export type ModuleRoleResponse = {
  id: number;
  role_id: number;
  role_code: string;
  module: string;
  permission_mask: number;
  created_at: string;
  updated_at: string;
};

export class ModuleRoleNotFoundError extends Error {}

export async function listModuleRoles(params: {
  companyId: number;
  roleId?: number;
  module?: string;
}): Promise<ModuleRoleResponse[]> {
  const db = getDb();

  let query = db
    .selectFrom('module_roles as mr')
    .innerJoin('roles as r', 'r.id', 'mr.role_id')
    .where('mr.company_id', '=', params.companyId)
    .select([
      'mr.id', 'mr.role_id', 'r.code as role_code', 'mr.module',
      'mr.permission_mask', 'mr.created_at', 'mr.updated_at'
    ])
    .orderBy('r.code', 'asc')
    .orderBy('mr.module', 'asc');

  if (params.roleId) {
    query = query.where('mr.role_id', '=', params.roleId);
  }
  if (params.module) {
    query = query.where('mr.module', '=', params.module);
  }

  const rows = await query.execute();

  return rows.map((row) => ({
    id: Number(row.id),
    role_id: Number(row.role_id),
    role_code: row.role_code,
    module: row.module,
    permission_mask: Number(row.permission_mask ?? 0),
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  }));
}

export async function setModuleRolePermission(params: {
  companyId: number;
  roleId: number;
  module: string;
  permissionMask: number;
  actor: UserActor;
}): Promise<ModuleRoleResponse> {
  const db = getDb();
  const auditService = new AuditService(db);

  return await db.transaction().execute(async (trx) => {
    const roleRows = await trx
      .selectFrom('roles')
      .where('id', '=', params.roleId)
      .select(['id', 'code', 'is_global', 'role_level'])
      .execute();

    if (roleRows.length === 0) {
      throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
    }

    const role = roleRows[0];
    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      trx,
      params.companyId,
      params.actor.userId
    );
    const targetLevel = Number(role.role_level ?? 0);

    if (targetLevel > actorMaxLevel) {
      throw new RoleLevelViolationError("Insufficient role level to update module roles");
    }

    const permissionMask = role.is_global ? 15 : params.permissionMask;

    const existing = await trx
      .selectFrom('module_roles')
      .where('company_id', '=', params.companyId)
      .where('role_id', '=', params.roleId)
      .where('module', '=', params.module)
      .select(['id', 'permission_mask'])
      .executeTakeFirst();

    const auditContext = buildAuditContext(params.companyId, params.actor);
    const entityId = `module-role:${params.roleId}:${params.module}`;
    
    if (existing) {
      const currentMask = Number(existing.permission_mask ?? 0);
      await trx
        .updateTable('module_roles')
        .set({ permission_mask: permissionMask })
        .where('company_id', '=', params.companyId)
        .where('role_id', '=', params.roleId)
        .where('module', '=', params.module)
        .execute();

      if (currentMask !== permissionMask) {
        await auditService.logUpdate(
          auditContext,
          "setting",
          entityId,
          { permission_mask: currentMask },
          { permission_mask: permissionMask }
        );
      }
    } else {
      await trx
        .insertInto('module_roles')
        .values({
          company_id: params.companyId,
          role_id: params.roleId,
          module: params.module,
          permission_mask: permissionMask
        })
        .execute();

      await auditService.logCreate(auditContext, "setting", entityId, {
        type: "module_role",
        role_id: params.roleId,
        module: params.module,
        permission_mask: permissionMask
      });
    }

    const rows = await trx
      .selectFrom('module_roles as mr')
      .innerJoin('roles as r', 'r.id', 'mr.role_id')
      .where('mr.company_id', '=', params.companyId)
      .where('mr.role_id', '=', params.roleId)
      .where('mr.module', '=', params.module)
      .select([
        'mr.id', 'mr.role_id', 'r.code as role_code', 'mr.module',
        'mr.permission_mask', 'mr.created_at', 'mr.updated_at'
      ])
      .executeTakeFirst();

    if (!rows) {
      throw new ModuleRoleNotFoundError("Module role not found after update");
    }

    const row = rows;
    return {
      id: Number(row.id),
      role_id: Number(row.role_id),
      role_code: row.role_code,
      module: row.module,
      permission_mask: Number(row.permission_mask ?? 0),
      created_at: toRfc3339Required(row.created_at),
      updated_at: toRfc3339Required(row.updated_at)
    };
  });
}
