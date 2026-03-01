import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { AuditService } from "@jurnapod/modules-platform";
import { NumericIdSchema, RoleSchema } from "@jurnapod/shared";
import { hashPassword, type PasswordHashPolicy } from "./password-hash";
import { getDbPool } from "./db";
import { getAppEnv } from "./env";

export class UserNotFoundError extends Error {}
export class UserEmailExistsError extends Error {}
export class RoleNotFoundError extends Error {}
export class OutletNotFoundError extends Error {}

export type UserProfile = {
  id: number;
  company_id: number;
  email: string;
  is_active: boolean;
  roles: string[];
  outlets: {
    id: number;
    code: string;
    name: string;
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
  email: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
};

type RoleRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
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

async function findUserRowById(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  companyId: number,
  userId: number
): Promise<UserRow | null> {
  const [rows] = await connection.execute<UserRow[]>(
    `SELECT id, company_id, email, is_active, created_at, updated_at
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
): Promise<Map<string, number>> {
  if (roleCodes.length === 0) {
    return new Map();
  }

  const placeholders = roleCodes.map(() => "?").join(", ");
  const [rows] = await connection.execute<RoleRow[]>(
    `SELECT id, code
     FROM roles
     WHERE code IN (${placeholders})`,
    roleCodes
  );

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.code, Number(row.id));
  }

  if (map.size !== roleCodes.length) {
    throw new RoleNotFoundError("Role not found");
  }

  return map;
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

async function hydrateUserRoles(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  userIds: number[]
): Promise<Map<number, string[]>> {
  const roleMap = new Map<number, string[]>();
  if (userIds.length === 0) {
    return roleMap;
  }

  const placeholders = userIds.map(() => "?").join(", ");
  const [rows] = await connection.execute<RoleJoinRow[]>(
    `SELECT ur.user_id, r.code
     FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id IN (${placeholders})
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

async function hydrateUserOutlets(
  connection: PoolConnection | ReturnType<typeof getDbPool>,
  userIds: number[]
): Promise<Map<number, UserProfile["outlets"]>> {
  const outletMap = new Map<number, UserProfile["outlets"]>();
  if (userIds.length === 0) {
    return outletMap;
  }

  const placeholders = userIds.map(() => "?").join(", ");
  const [rows] = await connection.execute<OutletJoinRow[]>(
    `SELECT uo.user_id, o.id AS outlet_id, o.code, o.name
     FROM user_outlets uo
     INNER JOIN outlets o ON o.id = uo.outlet_id
     WHERE uo.user_id IN (${placeholders})
     ORDER BY o.id ASC`,
    userIds
  );

  for (const row of rows) {
    const userId = Number(row.user_id);
    const list = outletMap.get(userId) ?? [];
    list.push({
      id: Number(row.outlet_id),
      code: row.code,
      name: row.name
    });
    outletMap.set(userId, list);
  }

  return outletMap;
}

function normalizeUserRow(row: UserRow): Omit<UserProfile, "roles" | "outlets"> {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    email: row.email,
    is_active: row.is_active === 1,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

export async function listUsers(companyId: number, filters?: { isActive?: boolean; search?: string }) {
  const pool = getDbPool();
  const values: Array<string | number> = [companyId];
  let sql =
    "SELECT id, company_id, email, is_active, created_at, updated_at FROM users WHERE company_id = ?";

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

  const [rolesMap, outletsMap] = await Promise.all([
    hydrateUserRoles(pool, userIds),
    hydrateUserOutlets(pool, userIds)
  ]);

  return baseUsers.map((user) => ({
    ...user,
    roles: rolesMap.get(user.id) ?? [],
    outlets: outletsMap.get(user.id) ?? []
  }));
}

export async function findUserById(companyId: number, userId: number): Promise<UserProfile | null> {
  const pool = getDbPool();
  const user = await findUserRowById(pool, companyId, userId);
  if (!user) {
    return null;
  }

  const [rolesMap, outletsMap] = await Promise.all([
    hydrateUserRoles(pool, [user.id]),
    hydrateUserOutlets(pool, [user.id])
  ]);

  return {
    ...normalizeUserRow(user),
    roles: rolesMap.get(user.id) ?? [],
    outlets: outletsMap.get(user.id) ?? []
  };
}

export async function createUser(params: {
  companyId: number;
  email: string;
  password: string;
  roleCodes?: string[];
  outletIds?: number[];
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
    const isActive = params.isActive ?? true;

    const [existingRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM users WHERE company_id = ? AND email = ? LIMIT 1`,
      [params.companyId, email]
    );

    if (existingRows.length > 0) {
      throw new UserEmailExistsError("Email already exists");
    }

    const policy = passwordHashPolicyFromEnv();
    const passwordHash = await hashPassword(params.password, policy);
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (company_id, email, password_hash, is_active)
       VALUES (?, ?, ?, ?)`,
      [params.companyId, email, passwordHash, isActive ? 1 : 0]
    );

    const userId = Number(result.insertId);
    const roleCodes = (params.roleCodes ?? []).map((role) => RoleSchema.parse(role));
    const outletIds = (params.outletIds ?? []).map((outletId) => NumericIdSchema.parse(outletId));

    if (roleCodes.length > 0) {
      const roleMap = await ensureRoleCodesExist(connection, roleCodes);
      const roleValues = roleCodes.map((code) => [userId, roleMap.get(code) ?? 0]);
      await connection.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ${roleValues
          .map(() => "(?, ?)")
          .join(", ")}`,
        roleValues.flat()
      );
    }

    if (outletIds.length > 0) {
      await ensureOutletIdsExist(connection, params.companyId, outletIds);
      const outletValues = outletIds.map((outletId) => [userId, outletId]);
      await connection.query(
        `INSERT INTO user_outlets (user_id, outlet_id) VALUES ${outletValues
          .map(() => "(?, ?)")
          .join(", ")}`,
        outletValues.flat()
      );
    }

    await auditService.logCreate(auditContext, "user", userId, {
      email,
      is_active: isActive,
      role_codes: roleCodes,
      outlet_ids: outletIds
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
    const email = normalizeEmail(params.email);
    const user = await ensureUserExists(connection, params.companyId, params.userId);

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
  actor: UserActor;
}): Promise<UserProfile> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.companyId, params.actor);

  try {
    await connection.beginTransaction();
    await ensureUserExists(connection, params.companyId, params.userId);
    const beforeRoles = (await hydrateUserRoles(connection, [params.userId])).get(params.userId) ?? [];
    const roleCodes = params.roleCodes.map((role) => RoleSchema.parse(role));
    const roleMap = await ensureRoleCodesExist(connection, roleCodes);

    await connection.execute<ResultSetHeader>(
      `DELETE FROM user_roles WHERE user_id = ?`,
      [params.userId]
    );

    if (roleCodes.length > 0) {
      const roleValues = roleCodes.map((code) => [params.userId, roleMap.get(code) ?? 0]);
      await connection.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ${roleValues
          .map(() => "(?, ?)")
          .join(", ")}`,
        roleValues.flat()
      );
    }

    await auditService.logUpdate(
      auditContext,
      "user",
      params.userId,
      { roles: beforeRoles },
      { roles: roleCodes }
    );

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
    const beforeOutlets =
      (await hydrateUserOutlets(connection, [params.userId])).get(params.userId) ?? [];
    const beforeOutletIds = beforeOutlets.map((outlet) => outlet.id);
    const outletIds = params.outletIds.map((outletId) => NumericIdSchema.parse(outletId));
    await ensureOutletIdsExist(connection, params.companyId, outletIds);

    await connection.execute<ResultSetHeader>(
      `DELETE FROM user_outlets WHERE user_id = ?`,
      [params.userId]
    );

    if (outletIds.length > 0) {
      const outletValues = outletIds.map((outletId) => [params.userId, outletId]);
      await connection.query(
        `INSERT INTO user_outlets (user_id, outlet_id) VALUES ${outletValues
          .map(() => "(?, ?)")
          .join(", ")}`,
        outletValues.flat()
      );
    }

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

export async function listRoles(): Promise<Array<{ id: number; code: string; name: string }>> {
  const pool = getDbPool();
  const [rows] = await pool.execute<RoleRow[]>(
    `SELECT id, code, name
     FROM roles
     ORDER BY code ASC`
  );

  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name
  }));
}

export async function getRole(roleId: number): Promise<{ id: number; code: string; name: string }> {
  const pool = getDbPool();
  const [rows] = await pool.execute<RoleRow[]>(
    `SELECT id, code, name
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
    name: rows[0].name
  };
}

export async function createRole(params: {
  code: string;
  name: string;
}): Promise<{ id: number; code: string; name: string }> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if role code already exists
    const [existing] = await connection.execute<RoleRow[]>(
      `SELECT id FROM roles WHERE code = ?`,
      [params.code]
    );

    if (existing.length > 0) {
      throw new Error(`Role with code ${params.code} already exists`);
    }

    // Insert role
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO roles (code, name) VALUES (?, ?)`,
      [params.code, params.name]
    );

    const roleId = Number(result.insertId);

    await connection.commit();

    return {
      id: roleId,
      code: params.code,
      name: params.name
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateRole(params: {
  roleId: number;
  name?: string;
}): Promise<{ id: number; code: string; name: string }> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get current role
    const [rows] = await connection.execute<RoleRow[]>(
      `SELECT id, code, name FROM roles WHERE id = ?`,
      [params.roleId]
    );

    if (rows.length === 0) {
      throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
    }

    const currentRole = rows[0];

    // Build update
    if (params.name) {
      await connection.execute(
        `UPDATE roles SET name = ? WHERE id = ?`,
        [params.name, params.roleId]
      );
    }

    await connection.commit();

    return {
      id: Number(currentRole.id),
      code: currentRole.code,
      name: params.name ?? currentRole.name
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteRole(params: {
  roleId: number;
}): Promise<void> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get current role
    const [rows] = await connection.execute<RoleRow[]>(
      `SELECT id, code, name FROM roles WHERE id = ?`,
      [params.roleId]
    );

    if (rows.length === 0) {
      throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
    }

    const role = rows[0];

    // Check if role is in use
    const [userRoles] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM user_roles WHERE role_id = ?`,
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
  created_at: Date;
  updated_at: Date;
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
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  }));
}

export async function setModuleRolePermission(params: {
  companyId: number;
  roleId: number;
  module: string;
  permissionMask: number;
}): Promise<ModuleRoleResponse> {
  const pool = getDbPool();

  const [existing] = await pool.execute<ModuleRoleRow[]>(
    `SELECT id FROM module_roles WHERE company_id = ? AND role_id = ? AND module = ?`,
    [params.companyId, params.roleId, params.module]
  );

  if (existing.length > 0) {
    await pool.execute(
      `UPDATE module_roles
       SET permission_mask = ?
       WHERE company_id = ? AND role_id = ? AND module = ?`,
      [params.permissionMask, params.companyId, params.roleId, params.module]
    );
  } else {
    await pool.execute(
      `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
       VALUES (?, ?, ?, ?)`,
      [params.companyId, params.roleId, params.module, params.permissionMask]
    );
  }

  const [rows] = await pool.execute<ModuleRoleRow[]>(
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
  return {
    id: Number(row.id),
    role_id: Number(row.role_id),
    role_code: row.role_code,
    module: row.module,
    permission_mask: Number(row.permission_mask ?? 0),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}
