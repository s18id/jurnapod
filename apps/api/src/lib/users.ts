// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { AuditService } from "@jurnapod/modules-platform";
import { NumericIdSchema, RoleSchema } from "@jurnapod/shared";
import { hashPassword, type PasswordHashPolicy } from "./password-hash";
import { getDbPool } from "./db";
import { getAppEnv } from "./env";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";

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

type UserRow = RowDataPacket & {
  id: number;
  company_id: number;
  name: string | null;
  email: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type RoleRow = RowDataPacket & {
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

type RoleJoinRow = RowDataPacket & {
  user_id: number;
  code: string;
};

type OutletRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
};

type OutletJoinRow = RowDataPacket & {
  user_id: number;
  outlet_id: number;
  code: string;
  name: string;
};

type OutletRoleJoinRow = RowDataPacket & {
  user_id: number;
  outlet_id: number;
  outlet_code: string;
  outlet_name: string;
  role_code: string;
};

class ConnectionAuditDbClient {
  constructor(private readonly connection: PoolConnection) {}

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params || []);
    return rows as T[];
  }

  async execute(
    sql: string,
    params?: any[]
  ): Promise<{ affectedRows: number; insertId?: number }> {
    const [result] = await this.connection.execute<ResultSetHeader>(sql, params || []);
    return {
      affectedRows: result.affectedRows,
      insertId: result.insertId
    };
  }

  async begin(): Promise<void> {
    // No-op: transaction is managed by caller.
  }

  async commit(): Promise<void> {
    // No-op: transaction is managed by caller.
  }

  async rollback(): Promise<void> {
    // No-op: transaction is managed by caller.
  }
}

function createAuditServiceForConnection(connection: PoolConnection): AuditService {
  const dbClient = new ConnectionAuditDbClient(connection);
  return new AuditService(dbClient);
}

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
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  companyId: number,
  userId: number
): Promise<UserRow | null> {
  const [rows] = await connection.execute<UserRow[]>(
    `SELECT id, company_id, name, email, is_active, created_at, updated_at
     FROM users
     WHERE id = ? AND company_id = ?
     LIMIT 1`,
    [userId, companyId]
  );

  return rows[0] ?? null;
}

async function ensureUserExists(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  companyId: number,
  userId: number
): Promise<UserRow> {
  const user = await findUserRowById(connection, companyId, userId);
  if (!user) {
    throw new UserNotFoundError("User not found");
  }

  return user;
}

async function ensureRoleCodesExist(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  roleCodes: string[]
): Promise<Map<string, RoleSnapshot>> {
  if (roleCodes.length === 0) {
    return new Map();
  }

  const placeholders = roleCodes.map(() => "?").join(", ");
  const [rows] = await connection.execute<RoleRow[]>(
    `SELECT id, code, is_global, role_level
     FROM roles
     WHERE code IN (${placeholders})`,
    roleCodes
  );

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
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  companyId: number,
  userId: number
): Promise<number> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT MAX(r.role_level) AS max_level
     FROM user_role_assignments ura
     INNER JOIN roles r ON r.id = ura.role_id
     INNER JOIN users u ON u.id = ura.user_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
       AND ura.outlet_id IS NULL`,
    [userId, companyId]
  );

  const maxLevel = rows[0]?.max_level;
  return Number(maxLevel ?? 0);
}

async function userHasSuperAdminRole(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  companyId: number,
  userId: number
): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT 1
     FROM user_role_assignments ura
     INNER JOIN roles r ON r.id = ura.role_id
     INNER JOIN users u ON u.id = ura.user_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND r.code = 'SUPER_ADMIN'
       AND ura.outlet_id IS NULL
     LIMIT 1`,
    [userId, companyId]
  );

  return rows.length > 0;
}

async function userHasRoleCode(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  companyId: number,
  userId: number,
  roleCode: string
): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT 1
     FROM user_role_assignments ura
     INNER JOIN roles r ON r.id = ura.role_id
     INNER JOIN users u ON u.id = ura.user_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND r.code = ?
       AND ura.outlet_id IS NULL
     LIMIT 1`,
    [userId, companyId, roleCode]
  );

  return rows.length > 0;
}

async function ensureSuperAdminTargetManagedBySelf(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  companyId: number,
  actorUserId: number,
  targetUserId: number
): Promise<void> {
  const targetIsSuperAdmin = await userHasSuperAdminRole(connection, companyId, targetUserId);
  if (!targetIsSuperAdmin) {
    return;
  }

  const actorIsSelf = actorUserId === targetUserId;
  const actorIsSuperAdmin = await userHasRoleCode(connection, companyId, actorUserId, "SUPER_ADMIN");

  if (!actorIsSelf || !actorIsSuperAdmin) {
    throw new SuperAdminProtectionError("Only SUPER_ADMIN user can manage their own account");
  }
}

async function ensureOutletIdsExist(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  companyId: number,
  outletIds: number[]
): Promise<void> {
  if (outletIds.length === 0) {
    return;
  }

  const placeholders = outletIds.map(() => "?").join(", ");
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id
     FROM outlets
     WHERE company_id = ? AND id IN (${placeholders})`,
    [companyId, ...outletIds]
  );

  if (rows.length !== outletIds.length) {
    throw new OutletNotFoundError("Outlet not found");
  }
}

async function syncUserOutletsFromRoles(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  userId: number
): Promise<void> {
  await connection.execute<ResultSetHeader>(
    `DELETE uo
     FROM user_outlets uo
     LEFT JOIN user_role_assignments ura
       ON ura.user_id = uo.user_id
      AND ura.outlet_id = uo.outlet_id
     WHERE uo.user_id = ?
       AND ura.user_id IS NULL`,
    [userId]
  );

  await connection.execute<ResultSetHeader>(
    `INSERT IGNORE INTO user_outlets (user_id, outlet_id)
     SELECT DISTINCT user_id, outlet_id
     FROM user_role_assignments
     WHERE user_id = ?
       AND outlet_id IS NOT NULL`,
    [userId]
  );
}

async function hydrateUserGlobalRoles(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  userIds: number[]
): Promise<Map<number, string[]>> {
  const roleMap = new Map<number, string[]>();
  if (userIds.length === 0) {
    return roleMap;
  }

  const placeholders = userIds.map(() => "?").join(", ");
  const [rows] = await connection.execute<RoleJoinRow[]>(
    `SELECT ura.user_id, r.code
     FROM user_role_assignments ura
     INNER JOIN roles r ON r.id = ura.role_id
     WHERE ura.user_id IN (${placeholders})
       AND r.is_global = 1
       AND ura.outlet_id IS NULL
     ORDER BY r.code ASC`,
    userIds
  );

  for (const row of rows) {
    const userId = Number(row.user_id);
    const list = roleMap.get(userId) ?? [];
    list.push(row.code);
    roleMap.set(userId, list);
  }

  return roleMap;
}

async function hydrateUserOutletRoleAssignments(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  userIds: number[]
): Promise<Map<number, UserProfile["outlet_role_assignments"]>> {
  const assignmentMap = new Map<number, UserProfile["outlet_role_assignments"]>();
  if (userIds.length === 0) {
    return assignmentMap;
  }

  const placeholders = userIds.map(() => "?").join(", ");
  const [rows] = await connection.execute<OutletRoleJoinRow[]>(
    `SELECT ura.user_id,
            o.id AS outlet_id,
            o.code AS outlet_code,
            o.name AS outlet_name,
            r.code AS role_code
     FROM user_role_assignments ura
     INNER JOIN outlets o ON o.id = ura.outlet_id
     INNER JOIN roles r ON r.id = ura.role_id
     WHERE ura.user_id IN (${placeholders})
       AND ura.outlet_id IS NOT NULL
     ORDER BY o.id ASC, r.code ASC`,
    userIds
  );

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

export async function listUsers(companyId: number, filters?: { isActive?: boolean; search?: string }) {
  const pool = getDbPool();
  const values: Array<string | number> = [companyId];
  let sql =
    "SELECT id, company_id, name, email, is_active, created_at, updated_at FROM users WHERE company_id = ?";

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  if (filters?.search) {
    sql += " AND email LIKE ?";
    values.push(`%${filters.search}%`);
  }

  sql += " ORDER BY id ASC";

  const [rows] = await pool.execute<UserRow[]>(sql, values);
  const baseUsers = rows.map((row) => normalizeUserRow(row));
  const userIds = baseUsers.map((user) => user.id);

  const [globalRolesMap, outletRolesMap] = await Promise.all([
    hydrateUserGlobalRoles(pool, userIds),
    hydrateUserOutletRoleAssignments(pool, userIds)
  ]);

  return baseUsers.map((user) => ({
    ...user,
    global_roles: globalRolesMap.get(user.id) ?? [],
    outlet_role_assignments: outletRolesMap.get(user.id) ?? []
  }));
}

export async function findUserById(companyId: number, userId: number): Promise<UserProfile | null> {
  const pool = getDbPool();
  const user = await findUserRowById(pool, companyId, userId);
  if (!user) {
    return null;
  }

  const [globalRolesMap, outletRolesMap] = await Promise.all([
    hydrateUserGlobalRoles(pool, [user.id]),
    hydrateUserOutletRoleAssignments(pool, [user.id])
  ]);

  return {
    ...normalizeUserRow(user),
    global_roles: globalRolesMap.get(user.id) ?? [],
    outlet_role_assignments: outletRolesMap.get(user.id) ?? []
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  try {
    await connection.beginTransaction();
    const email = normalizeEmail(params.email);
    const name = params.name?.trim() ?? null;
    const isActive = params.isActive ?? false;

    const [existingRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM users WHERE company_id = ? AND email = ? LIMIT 1`,
      [params.companyId, email]
    );

    if (existingRows.length > 0) {
      throw new UserEmailExistsError("Email already exists");
    }

    const policy = passwordHashPolicyFromEnv();
    const passwordToHash = params.password ?? generateTempPassword();
    const passwordHash = await hashPassword(passwordToHash, policy);
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (company_id, name, email, password_hash, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [params.companyId, name, email, passwordHash, isActive ? 1 : 0]
    );

    const userId = Number(result.insertId);
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

    const roleMap = await ensureRoleCodesExist(connection, [...combinedRoleCodes]);
    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      connection,
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

    if (globalRoleCodes.length > 0) {
      const roleValues = globalRoleCodes.map((code) => [userId, roleMap.get(code)?.id ?? 0, null]);
      await connection.query(
        `INSERT INTO user_role_assignments (user_id, role_id, outlet_id) VALUES ${roleValues
          .map(() => "(?, ?, ?)")
          .join(", ")}`,
        roleValues.flat()
      );
    }

    if (outletRoleAssignments.length > 0) {
      const assignmentOutletIds = outletRoleAssignments.map((assignment) => assignment.outletId);
      await ensureOutletIdsExist(connection, params.companyId, assignmentOutletIds);

      const outletRoleValues: Array<Array<number>> = [];
      for (const assignment of outletRoleAssignments) {
        for (const roleCode of assignment.roleCodes) {
          const roleSnapshot = roleMap.get(roleCode);
          if (!roleSnapshot) {
            throw new RoleNotFoundError("Role not found");
          }
          if (roleSnapshot.is_global === 1) {
            throw new RoleScopeViolationError("Global roles cannot be assigned per outlet");
          }
          outletRoleValues.push([userId, assignment.outletId, roleSnapshot.id]);
        }
      }

      if (outletRoleValues.length > 0) {
        await connection.query(
          `INSERT INTO user_role_assignments (user_id, outlet_id, role_id) VALUES ${outletRoleValues
            .map(() => "(?, ?, ?)")
            .join(", ")}`,
          outletRoleValues.flat()
        );
      }
    }

    await syncUserOutletsFromRoles(connection, userId);

    await auditService.logCreate(auditContext, "user", userId, {
      email,
      is_active: isActive,
      global_roles: globalRoleCodes,
      outlet_role_assignments: outletRoleAssignments
    });

    await connection.commit();

    const created = await findUserById(params.companyId, userId);
    if (!created) {
      throw new UserNotFoundError("User not found after creation");
    }

    return created;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateUserEmail(params: {
  companyId: number;
  userId: number;
  email: string;
  actor: UserActor;
}): Promise<UserProfile> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  try {
    await connection.beginTransaction();
    await ensureUserExists(connection, params.companyId, params.userId);

    await ensureSuperAdminTargetManagedBySelf(
      connection,
      params.companyId,
      params.actor.userId,
      params.userId
    );

    const user = await ensureUserExists(connection, params.companyId, params.userId);
    const email = normalizeEmail(params.email);

    if (user.email !== email) {
      const [existingRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM users WHERE company_id = ? AND email = ? LIMIT 1`,
        [params.companyId, email]
      );

      if (existingRows.length > 0) {
        throw new UserEmailExistsError("Email already exists");
      }

      await connection.execute<ResultSetHeader>(
        `UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`,
        [email, params.userId, params.companyId]
      );

      await auditService.logUpdate(
        auditContext,
        "user",
        params.userId,
        { email: user.email },
        { email }
      );
    }

    await connection.commit();
    const updated = await findUserById(params.companyId, params.userId);
    if (!updated) {
      throw new UserNotFoundError("User not found after update");
    }

    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function setUserRoles(params: {
  companyId: number;
  userId: number;
  roleCodes: string[];
  outletId?: number;
  actor: UserActor;
}): Promise<UserProfile> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  try {
    await connection.beginTransaction();
    await ensureUserExists(connection, params.companyId, params.userId);

    await ensureSuperAdminTargetManagedBySelf(
      connection,
      params.companyId,
      params.actor.userId,
      params.userId
    );

    const roleCodes = params.roleCodes.map((role) => RoleSchema.parse(role));
    
    // Get role info if provided
    let roleMap: Map<string, { id: number; role_level: number; is_global: number }> = new Map();
    if (roleCodes.length > 0) {
      const roleRows = await ensureRoleCodesExist(connection, roleCodes);
      roleMap = roleRows;
    }

    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      connection,
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
      await ensureOutletIdsExist(connection, params.companyId, [outletId]);

      // Get current outlet roles
      const [beforeRows] = await connection.execute<RoleJoinRow[]>(
        `SELECT r.code
         FROM user_role_assignments ura
         INNER JOIN roles r ON r.id = ura.role_id
         WHERE ura.user_id = ? AND ura.outlet_id = ?
         ORDER BY r.code ASC`,
        [params.userId, outletId]
      );
      const beforeRoles = beforeRows.map((row) => row.code);

      await connection.execute<ResultSetHeader>(
        `DELETE FROM user_role_assignments WHERE user_id = ? AND outlet_id = ?`,
        [params.userId, outletId]
      );

      // Insert new outlet roles
      if (roleCodes.length > 0) {
        const roleValues = roleCodes.map((code) => [
          params.userId,
          outletId,
          roleMap.get(code)?.id ?? 0
        ]);
        await connection.query(
          `INSERT INTO user_role_assignments (user_id, outlet_id, role_id) VALUES ${roleValues
            .map(() => "(?, ?, ?)")
            .join(", ")}`,
          roleValues.flat()
        );
      }

      await syncUserOutletsFromRoles(connection, params.userId);

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
        (await hydrateUserGlobalRoles(connection, [params.userId])).get(params.userId) ?? [];

      // Delete existing global role assignments
      await connection.execute<ResultSetHeader>(
        `DELETE FROM user_role_assignments WHERE user_id = ? AND outlet_id IS NULL`,
        [params.userId]
      );

      // Insert new global role assignment(s)
      if (roleCodes.length > 0) {
        const roleValues = roleCodes.map((code) => [
          params.userId,
          roleMap.get(code)?.id ?? 0,
          null
        ]);
        await connection.query(
          `INSERT INTO user_role_assignments (user_id, role_id, outlet_id) VALUES ${roleValues
            .map(() => "(?, ?, ?)")
            .join(", ")}`,
          roleValues.flat()
        );
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

    await connection.commit();

    const updated = await findUserById(params.companyId, params.userId);
    if (!updated) {
      throw new UserNotFoundError("User not found after role update");
    }

    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function setUserOutlets(params: {
  companyId: number;
  userId: number;
  outletIds: number[];
  actor: UserActor;
}): Promise<UserProfile> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  try {
    await connection.beginTransaction();
    await ensureUserExists(connection, params.companyId, params.userId);

    await ensureSuperAdminTargetManagedBySelf(
      connection,
      params.companyId,
      params.actor.userId,
      params.userId
    );

    const [beforeRows] = await connection.execute<RowDataPacket[]>(
      `SELECT DISTINCT outlet_id
       FROM user_role_assignments
       WHERE user_id = ?
         AND outlet_id IS NOT NULL`,
      [params.userId]
    );
    const beforeOutletIds = beforeRows.map((row) => Number(row.outlet_id));
    const outletIds = params.outletIds.map((outletId) => NumericIdSchema.parse(outletId));
    if (outletIds.length > 0) {
      await ensureOutletIdsExist(connection, params.companyId, outletIds);
    }

    if (outletIds.length === 0) {
      await connection.execute<ResultSetHeader>(
        `DELETE FROM user_role_assignments WHERE user_id = ? AND outlet_id IS NOT NULL`,
        [params.userId]
      );
    } else {
      const placeholders = outletIds.map(() => "?").join(", ");
      await connection.execute<ResultSetHeader>(
        `DELETE FROM user_role_assignments
         WHERE user_id = ? AND outlet_id IS NOT NULL AND outlet_id NOT IN (${placeholders})`,
        [params.userId, ...outletIds]
      );
    }

    await syncUserOutletsFromRoles(connection, params.userId);

    await auditService.logUpdate(
      auditContext,
      "user",
      params.userId,
      { outlet_ids: beforeOutletIds },
      { outlet_ids: outletIds }
    );

    await connection.commit();

    const updated = await findUserById(params.companyId, params.userId);
    if (!updated) {
      throw new UserNotFoundError("User not found after outlet update");
    }

    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function setUserPassword(params: {
  companyId: number;
  userId: number;
  password: string;
  actor: UserActor;
}): Promise<void> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  try {
    await connection.beginTransaction();

    await ensureSuperAdminTargetManagedBySelf(
      connection,
      params.companyId,
      params.actor.userId,
      params.userId
    );

    const policy = passwordHashPolicyFromEnv();
    const passwordHash = await hashPassword(params.password, policy);
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE users
       SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [passwordHash, params.userId, params.companyId]
    );

    if (result.affectedRows === 0) {
      throw new UserNotFoundError("User not found");
    }

    await auditService.logAction(auditContext, "user", params.userId, "UPDATE", {
      password_reset: true
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function setUserActiveState(params: {
  companyId: number;
  userId: number;
  isActive: boolean;
  actor: UserActor;
}): Promise<UserProfile> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  try {
    await connection.beginTransaction();

    // Prevent deactivating SUPER_ADMIN users (including self, for safety)
    if (!params.isActive) {
      const isSuperAdmin = await userHasSuperAdminRole(
        connection,
        params.companyId,
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
        connection,
        params.companyId,
        params.actor.userId,
        params.userId
      );
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE users
       SET is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [params.isActive ? 1 : 0, params.userId, params.companyId]
    );

    if (result.affectedRows === 0) {
      throw new UserNotFoundError("User not found");
    }

    if (params.isActive) {
      await auditService.logReactivate(auditContext, "user", params.userId, {
        is_active: true
      });
    } else {
      await auditService.logDeactivate(auditContext, "user", params.userId, {
        is_active: false
      });
    }

    await connection.commit();

    const updated = await findUserById(params.companyId, params.userId);
    if (!updated) {
      throw new UserNotFoundError("User not found after update");
    }

    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listRoles(
  companyId: number,
  isSuperAdmin: boolean = false,
  filterCompanyId?: number
): Promise<
  Array<{ id: number; code: string; name: string; company_id: number | null; is_global: boolean; role_level: number }>
> {
  const pool = getDbPool();

  let rows: RoleRow[];

  if (isSuperAdmin) {
    if (filterCompanyId !== undefined) {
      const [result] = await pool.execute<RoleRow[]>(
        `SELECT id, code, name, company_id, is_global, role_level
         FROM roles
         WHERE company_id = ? OR company_id IS NULL
         ORDER BY company_id ASC, code ASC`,
        [filterCompanyId]
      );
      rows = result;
    } else {
      const [result] = await pool.execute<RoleRow[]>(
        `SELECT id, code, name, company_id, is_global, role_level
         FROM roles
         ORDER BY company_id ASC, code ASC`
      );
      rows = result;
    }
  } else {
    const [result] = await pool.execute<RoleRow[]>(
      `SELECT id, code, name, company_id, is_global, role_level
       FROM roles
       WHERE company_id = ? OR company_id IS NULL
       ORDER BY company_id ASC, code ASC`,
      [companyId]
    );
    rows = result;
  }

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
  const pool = getDbPool();
  const [rows] = await pool.execute<RoleRow[]>(
    `SELECT id, code, name, is_global, role_level
     FROM roles
     WHERE id = ?`,
    [roleId]
  );

  if (rows.length === 0) {
    throw new RoleNotFoundError(`Role with id ${roleId} not found`);
  }

  return {
    id: Number(rows[0].id),
    code: rows[0].code,
    name: rows[0].name,
    is_global: Boolean(rows[0].is_global),
    role_level: Number(rows[0].role_level ?? 0)
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      connection,
      params.companyId,
      params.actor.userId
    );
    const newRoleLevel = params.roleLevel ?? 0;

    if (newRoleLevel >= actorMaxLevel) {
      throw new RoleLevelViolationError("Cannot create role with level equal to or higher than your own role level");
    }

    // Check if role code already exists for this company
    const [existing] = await connection.execute<RoleRow[]>(
      `SELECT id FROM roles WHERE company_id = ? AND code = ?`,
      [params.companyId, params.code]
    );

    if (existing.length > 0) {
      throw new Error(`Role with code ${params.code} already exists`);
    }

    // Insert role with company_id
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO roles (code, name, company_id, role_level) VALUES (?, ?, ?, ?)`,
      [params.code, params.name, params.companyId, newRoleLevel]
    );

    const roleId = Number(result.insertId);
    const auditContext = buildAuditContext(params.companyId, params.actor);

    await auditService.logCreate(auditContext, "setting", roleId, {
      type: "role",
      code: params.code,
      name: params.name,
      company_id: params.companyId,
      role_level: newRoleLevel
    });

    await connection.commit();

    return {
      id: roleId,
      code: params.code,
      name: params.name,
      company_id: params.companyId,
      is_global: false,
      role_level: newRoleLevel
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateRole(params: {
  companyId: number;
  roleId: number;
  name?: string;
  actor: UserActor;
}): Promise<{ id: number; code: string; name: string; is_global: boolean; role_level: number }> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Get current role
    const [rows] = await connection.execute<RoleRow[]>(
      `SELECT id, code, name, is_global, role_level FROM roles WHERE id = ?`,
      [params.roleId]
    );

    if (rows.length === 0) {
      throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
    }

    const currentRole = rows[0];

    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      connection,
      params.companyId,
      params.actor.userId
    );
    const targetLevel = Number(currentRole.role_level ?? 0);

    if (targetLevel > actorMaxLevel) {
      throw new RoleLevelViolationError("Insufficient role level to update this role");
    }

    // Build update
    if (params.name && params.name !== currentRole.name) {
      await connection.execute(
        `UPDATE roles SET name = ? WHERE id = ?`,
        [params.name, params.roleId]
      );

      const auditContext = buildAuditContext(params.companyId, params.actor);
      await auditService.logUpdate(
        auditContext,
        "setting",
        params.roleId,
        { name: currentRole.name },
        { name: params.name }
      );
    }

    await connection.commit();

    return {
      id: Number(currentRole.id),
      code: currentRole.code,
      name: params.name ?? currentRole.name,
      is_global: Boolean(currentRole.is_global),
      role_level: Number(currentRole.role_level ?? 0)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteRole(params: {
  companyId: number;
  roleId: number;
  actor: UserActor;
}): Promise<void> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Get current role
    const [rows] = await connection.execute<RoleRow[]>(
      `SELECT id, code, name, role_level FROM roles WHERE id = ?`,
      [params.roleId]
    );

    if (rows.length === 0) {
      throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
    }

    const role = rows[0];

    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      connection,
      params.companyId,
      params.actor.userId
    );
    const targetLevel = Number(role.role_level ?? 0);

    if (targetLevel > actorMaxLevel) {
      throw new RoleLevelViolationError("Insufficient role level to delete this role");
    }

    // Check if role is in use
    const [userRoles] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM user_role_assignments WHERE role_id = ?`,
      [params.roleId]
    );

    if (userRoles[0].count > 0) {
      throw new Error(`Cannot delete role ${role.code}: ${userRoles[0].count} users are assigned to this role`);
    }

    // Delete role
    await connection.execute(
      `DELETE FROM roles WHERE id = ?`,
      [params.roleId]
    );

    const auditContext = buildAuditContext(params.companyId, params.actor);
    await auditService.logDelete(auditContext, "setting", params.roleId, {
      type: "role",
      code: role.code,
      name: role.name
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listOutlets(
  companyId: number
): Promise<Array<{ id: number; code: string; name: string }>> {
  const pool = getDbPool();
  const [rows] = await pool.execute<OutletRow[]>(
    `SELECT id, code, name
     FROM outlets
     WHERE company_id = ?
     ORDER BY id ASC`,
    [companyId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name
  }));
}

type ModuleRoleRow = RowDataPacket & {
  id: number;
  role_id: number;
  role_code: string;
  module: string;
  permission_mask: number;
  created_at: string;
  updated_at: string;
};

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
  const pool = getDbPool();
  const conditions: string[] = [];
  const values: (number | string)[] = [];

  conditions.push("mr.company_id = ?");
  values.push(params.companyId);

  if (params.roleId) {
    conditions.push("mr.role_id = ?");
    values.push(params.roleId);
  }
  if (params.module) {
    conditions.push("mr.module = ?");
    values.push(params.module);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.execute<ModuleRoleRow[]>(
    `SELECT mr.id, mr.role_id, r.code as role_code, mr.module,
            mr.permission_mask, mr.created_at, mr.updated_at
     FROM module_roles mr
     INNER JOIN roles r ON r.id = mr.role_id
     ${whereClause}
     ORDER BY r.code, mr.module`,
    values
  );

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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    const [roleRows] = await connection.execute<RoleRow[]>(
      `SELECT id, code, is_global, role_level FROM roles WHERE id = ?`,
      [params.roleId]
    );

    if (roleRows.length === 0) {
      throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
    }

    const role = roleRows[0];
    const actorMaxLevel = await getUserMaxRoleLevelForConnection(
      connection,
      params.companyId,
      params.actor.userId
    );
    const targetLevel = Number(role.role_level ?? 0);

    if (targetLevel > actorMaxLevel) {
      throw new RoleLevelViolationError("Insufficient role level to update module roles");
    }

    const permissionMask = role.is_global ? 15 : params.permissionMask;

    const [existing] = await connection.execute<ModuleRoleRow[]>(
      `SELECT id, permission_mask
       FROM module_roles
       WHERE company_id = ? AND role_id = ? AND module = ?`,
      [params.companyId, params.roleId, params.module]
    );

    const auditContext = buildAuditContext(params.companyId, params.actor);
    const entityId = `module-role:${params.roleId}:${params.module}`;
    if (existing.length > 0) {
      const currentMask = Number(existing[0].permission_mask ?? 0);
      await connection.execute(
        `UPDATE module_roles
         SET permission_mask = ?
         WHERE company_id = ? AND role_id = ? AND module = ?`,
        [permissionMask, params.companyId, params.roleId, params.module]
      );

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
      await connection.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         VALUES (?, ?, ?, ?)`,
        [params.companyId, params.roleId, params.module, permissionMask]
      );

      await auditService.logCreate(auditContext, "setting", entityId, {
        type: "module_role",
        role_id: params.roleId,
        module: params.module,
        permission_mask: permissionMask
      });
    }

    const [rows] = await connection.execute<ModuleRoleRow[]>(
      `SELECT mr.id, mr.role_id, r.code as role_code, mr.module,
              mr.permission_mask, mr.created_at, mr.updated_at
       FROM module_roles mr
       INNER JOIN roles r ON r.id = mr.role_id
       WHERE mr.company_id = ? AND mr.role_id = ? AND mr.module = ?`,
      [params.companyId, params.roleId, params.module]
    );

    if (rows.length === 0) {
      throw new ModuleRoleNotFoundError("Module role not found after update");
    }

    const row = rows[0];
    await connection.commit();
    return {
      id: Number(row.id),
      role_id: Number(row.role_id),
      role_code: row.role_code,
      module: row.module,
      permission_mask: Number(row.permission_mask ?? 0),
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
