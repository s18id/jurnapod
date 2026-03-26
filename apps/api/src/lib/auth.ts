// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { SignJWT } from "jose";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { z } from "zod";
import { getDbPool } from "./db";
import { getAppEnv } from "./env";
import { hashPassword, needsRehash, verifyPassword, type PasswordHashPolicy } from "./password-hash";

const DUMMY_BCRYPT_HASH =
  "$2a$12$M7v0M3yiY6L6HhM0iK0Qx.hoXrn1eSxn/OI8hM6SxQ0V4zH5mA8Pe";

const loginRequestSchema = z
  .object({
    companyCode: z.string().trim().min(1).max(32).optional(),
    company_code: z.string().trim().min(1).max(32).optional(),
    email: z.string().trim().email().max(191),
    password: z.string().min(1).max(255)
  })
  .transform((value) => ({
    companyCode: value.companyCode ?? value.company_code ?? "",
    email: value.email.toLowerCase(),
    password: value.password
  }))
  .refine((value) => value.companyCode.length > 0, {
    message: "companyCode is required",
    path: ["companyCode"]
  });

type LoginRequest = z.infer<typeof loginRequestSchema>;

type LoginSuccess = {
  success: true;
  accessToken: string;
  expiresInSeconds: number;
  userId: number;
  companyId: number;
};

type LoginFailure = {
  success: false;
  userId: number | null;
  companyId: number | null;
};

type LoginResult = LoginSuccess | LoginFailure;

type UserLoginRow = RowDataPacket & {
  id: number;
  company_id: number;
  email: string;
  password_hash: string;
  is_active: number;
};

export type AccessTokenUser = {
  id: number;
  company_id: number;
  email: string;
};

type UserProfileRow = RowDataPacket & {
  id: number;
  company_id: number;
  email: string;
  company_timezone: string | null;
  is_active: number;
};

type UserRoleRow = RowDataPacket & {
  code: string;
};

type UserOutletRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
};

export type AuthenticatedUser = {
  id: number;
  company_id: number;
  email: string;
  company_timezone: string | null;
  roles: RoleCode[];
  global_roles: RoleCode[];
  outlet_role_assignments: {
    outlet_id: number;
    outlet_code: string;
    outlet_name: string;
    role_codes: RoleCode[];
  }[];
  outlets: {
    id: number;
    code: string;
    name: string;
  }[];
};

export const ROLE_CODES = [
  "SUPER_ADMIN",
  "OWNER",
  "COMPANY_ADMIN",
  "ADMIN",
  "CASHIER",
  "ACCOUNTANT"
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

type AccessCheckRow = RowDataPacket & {
  id: number;
};

type LoginAuditResult = "SUCCESS" | "FAIL";

const roleCodeSet = new Set<string>(ROLE_CODES);

export function parseLoginRequest(payload: unknown): LoginRequest {
  return loginRequestSchema.parse(payload);
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

async function findUserForLogin(
  companyCode: string,
  email: string
): Promise<UserLoginRow | null> {
  const pool = getDbPool();
  const [rows] = await pool.execute<UserLoginRow[]>(
    `SELECT u.id, u.company_id, u.email, u.password_hash, u.is_active
     FROM users u
     INNER JOIN companies c ON c.id = u.company_id
     WHERE c.code = ?
       AND c.deleted_at IS NULL
       AND u.email = ?
     LIMIT 1`,
    [companyCode, email]
  );

  return rows[0] ?? null;
}

async function signAccessToken(user: AccessTokenUser): Promise<string> {
  const env = getAppEnv();
  const secret = new TextEncoder().encode(env.auth.accessTokenSecret);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = nowSeconds + env.auth.accessTokenTtlSeconds;

  let jwt = new SignJWT({
    email: user.email,
    company_id: user.company_id
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(user.id))
    .setIssuedAt(nowSeconds)
    .setNotBefore(nowSeconds)
    .setExpirationTime(expiresAt);

  if (env.auth.issuer) {
    jwt = jwt.setIssuer(env.auth.issuer);
  }

  if (env.auth.audience) {
    jwt = jwt.setAudience(env.auth.audience);
  }

  return jwt.sign(secret);
}

export async function issueAccessTokenForUser(
  user: AccessTokenUser
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const accessToken = await signAccessToken(user);
  const env = getAppEnv();

  return {
    accessToken,
    expiresInSeconds: env.auth.accessTokenTtlSeconds
  };
}

async function rehashUserPasswordIfNeeded(
  user: UserLoginRow,
  plainPassword: string,
  policy: PasswordHashPolicy
): Promise<void> {
  const env = getAppEnv();
  if (!env.auth.password.rehashOnLogin || !needsRehash(user.password_hash, policy)) {
    return;
  }

  const nextPasswordHash = await hashPassword(plainPassword, policy);
  const pool = getDbPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE users
     SET password_hash = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND company_id = ?
       AND password_hash = ?`,
    [nextPasswordHash, user.id, user.company_id, user.password_hash]
  );
}

export async function authenticateLogin(request: LoginRequest): Promise<LoginResult> {
  const policy = passwordHashPolicyFromEnv();
  const user = await findUserForLogin(request.companyCode, request.email);
  const passwordHash = user?.password_hash ?? DUMMY_BCRYPT_HASH;
  const passwordMatches = await verifyPassword(request.password, passwordHash);

  if (!user || !user.is_active || !passwordMatches) {
    return {
      success: false,
      userId: user?.id ?? null,
      companyId: user?.company_id ?? null
    };
  }

  await rehashUserPasswordIfNeeded(user, request.password, policy);

  const accessToken = await signAccessToken(user);
  const env = getAppEnv();

  return {
    success: true,
    accessToken,
    expiresInSeconds: env.auth.accessTokenTtlSeconds,
    userId: user.id,
    companyId: user.company_id
  };
}

type UserTokenRow = RowDataPacket & {
  id: number;
  company_id: number;
  email: string;
  is_active: number;
};

export async function findActiveUserTokenProfile(
  userId: number,
  companyId: number
): Promise<AccessTokenUser | null> {
  const pool = getDbPool();
  const [rows] = await pool.execute<UserTokenRow[]>(
    `SELECT u.id, u.company_id, u.email, u.is_active
     FROM users u
     INNER JOIN companies c ON c.id = u.company_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND c.deleted_at IS NULL
     LIMIT 1`,
    [userId, companyId]
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    return null;
  }

  return {
    id: user.id,
    company_id: user.company_id,
    email: user.email
  };
}

async function findUserRoleCodes(userId: number, companyId: number): Promise<RoleCode[]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<UserRoleRow[]>(
    `SELECT DISTINCT r.code
     FROM roles r
     INNER JOIN user_role_assignments ura ON ura.role_id = r.id
     INNER JOIN users u ON u.id = ura.user_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
     ORDER BY r.code ASC`,
    [userId, companyId]
  );

  const roles = new Set<RoleCode>();
  for (const row of rows) {
    if (roleCodeSet.has(row.code)) {
      roles.add(row.code as RoleCode);
    }
  }

  return [...roles];
}

async function findUserOutlets(
  userId: number,
  companyId: number
): Promise<AuthenticatedUser["outlets"]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<UserOutletRow[]>(
    `SELECT o.id, o.code, o.name
     FROM outlets o
     WHERE o.company_id = ?
       AND EXISTS (
         SELECT 1
         FROM user_role_assignments ura
         INNER JOIN roles r ON r.id = ura.role_id
         WHERE ura.user_id = ?
           AND r.is_global = 1
           AND ura.outlet_id IS NULL
       )
     
     UNION
     
     SELECT o.id, o.code, o.name
     FROM outlets o
     INNER JOIN user_role_assignments ura ON ura.outlet_id = o.id
     WHERE ura.user_id = ?
       AND o.company_id = ?
     
     ORDER BY id ASC`,
    [companyId, userId, userId, companyId]
  );

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name
  }));
}

async function findUserGlobalRoleCodes(
  userId: number,
  companyId: number
): Promise<RoleCode[]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<UserRoleRow[]>(
    `SELECT r.code
     FROM roles r
     INNER JOIN user_role_assignments ura ON ura.role_id = r.id
     INNER JOIN users u ON u.id = ura.user_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
       AND r.is_global = 1
       AND ura.outlet_id IS NULL
     ORDER BY r.code ASC`,
    [userId, companyId]
  );

  return rows
    .map((row) => row.code)
    .filter((code): code is RoleCode => roleCodeSet.has(code));
}

async function findUserOutletRoleAssignments(
  userId: number,
  companyId: number
): Promise<AuthenticatedUser["outlet_role_assignments"]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT o.id AS outlet_id,
            o.code AS outlet_code,
            o.name AS outlet_name,
            r.code AS role_code
     FROM user_role_assignments ura
     INNER JOIN outlets o ON o.id = ura.outlet_id
     INNER JOIN roles r ON r.id = ura.role_id
     INNER JOIN users u ON u.id = ura.user_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
       AND ura.outlet_id IS NOT NULL
     ORDER BY o.id ASC, r.code ASC`,
    [userId, companyId]
  );

  const outletMap = new Map<number, AuthenticatedUser["outlet_role_assignments"][number]>();

  for (const row of rows) {
    const roleCode = row.role_code as string;
    if (!roleCodeSet.has(roleCode)) {
      continue;
    }
    const outletId = Number(row.outlet_id);
    let assignment = outletMap.get(outletId);
    if (!assignment) {
      assignment = {
        outlet_id: outletId,
        outlet_code: String(row.outlet_code),
        outlet_name: String(row.outlet_name),
        role_codes: []
      };
      outletMap.set(outletId, assignment);
    }
    assignment.role_codes.push(roleCode as RoleCode);
  }

  return [...outletMap.values()];
}

export async function findActiveUserById(
  userId: number,
  companyId: number
): Promise<AuthenticatedUser | null> {
  const pool = getDbPool();
  const [rows] = await pool.execute<UserProfileRow[]>(
    `SELECT u.id, u.company_id, u.email, c.timezone AS company_timezone, u.is_active
     FROM users u
     INNER JOIN companies c ON c.id = u.company_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND c.deleted_at IS NULL
     LIMIT 1`,
    [userId, companyId]
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    return null;
  }

  const [roles, outlets] = await Promise.all([
    findUserRoleCodes(user.id, user.company_id),
    findUserOutlets(user.id, user.company_id)
  ]);

  const [globalRoles, outletRoleAssignments] = await Promise.all([
    findUserGlobalRoleCodes(user.id, user.company_id),
    findUserOutletRoleAssignments(user.id, user.company_id)
  ]);

  return {
    id: user.id,
    company_id: user.company_id,
    email: user.email,
    company_timezone: user.company_timezone,
    roles,
    global_roles: globalRoles,
    outlet_role_assignments: outletRoleAssignments,
    outlets
  };
}

export type LoginAuditRecord = {
  result: LoginAuditResult;
  companyId: number | null;
  userId: number | null;
  companyCode: string;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  reason: "success" | "invalid_credentials" | "invalid_request" | "internal_error";
};

export async function recordLoginAudit(record: LoginAuditRecord): Promise<void> {
  const pool = getDbPool();
  const success = record.reason === "success";
  const normalizedResult = success ? "SUCCESS" : "FAIL";
  const status = success ? 1 : 0; // Using status codes: 1=SUCCESS, 0=FAIL
  await pool.execute(
    `INSERT INTO audit_logs (
       company_id,
       outlet_id,
       user_id,
       action,
       result,
       success,
       status,
       ip_address,
       payload_json
     ) VALUES (?, NULL, ?, 'AUTH_LOGIN', ?, ?, ?, ?, ?)`,
    [
      record.companyId,
      record.userId,
      normalizedResult,
      success ? 1 : 0, // Legacy success field for backward compatibility
      status,
      record.ipAddress,
      JSON.stringify({
        company_code: record.companyCode,
        email: record.email,
        reason: record.reason,
        user_agent: record.userAgent
      })
    ]
  );
}

async function userIsSuperAdmin(userId: number): Promise<boolean> {
  const pool = getDbPool();
  const [rows] = await pool.execute<AccessCheckRow[]>(
    `SELECT u.id
     FROM users u
     INNER JOIN user_role_assignments ura ON ura.user_id = u.id
     INNER JOIN roles r ON r.id = ura.role_id
     WHERE u.id = ?
       AND u.is_active = 1
       AND r.code = "SUPER_ADMIN"
       AND ura.outlet_id IS NULL
     LIMIT 1`,
    [userId]
  );

  return rows.length > 0;
}

export async function userHasOutletAccess(
  userId: number,
  companyId: number,
  outletId: number
): Promise<boolean> {
  const pool = getDbPool();
  const [rows] = await pool.execute<AccessCheckRow[]>(
    `SELECT 1
     FROM users u
     INNER JOIN companies c ON c.id = u.company_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
       AND c.deleted_at IS NULL
       AND (
         EXISTS (
           SELECT 1
           FROM user_role_assignments ura
           INNER JOIN roles r ON r.id = ura.role_id
           WHERE ura.user_id = u.id
             AND r.is_global = 1
             AND ura.outlet_id IS NULL
         )
         OR EXISTS (
           SELECT 1
           FROM user_role_assignments ura
           WHERE ura.user_id = u.id
             AND ura.outlet_id = ?
         )
       )
     LIMIT 1`,
    [userId, companyId, outletId]
  );

  return rows.length > 0;
}

export type ModulePermission = "create" | "read" | "update" | "delete" | "report";

// Permission bits for module_roles.permission_mask (create=1, read=2, update=4, delete=8, report=16).
export const MODULE_PERMISSION_BITS: Record<ModulePermission, number> = {
  create: 1,
  read: 2,
  update: 4,
  delete: 8,
  report: 16
};

export function buildPermissionMask(params: {
  canCreate?: boolean;
  canRead?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canReport?: boolean;
}): number {
  return (
    (params.canCreate ? MODULE_PERMISSION_BITS.create : 0) |
    (params.canRead ? MODULE_PERMISSION_BITS.read : 0) |
    (params.canUpdate ? MODULE_PERMISSION_BITS.update : 0) |
    (params.canDelete ? MODULE_PERMISSION_BITS.delete : 0) |
    (params.canReport ? MODULE_PERMISSION_BITS.report : 0)
  );
}

type AccessSnapshotRow = RowDataPacket & {
  is_super_admin: number;
  has_global_role?: number | null;
  has_role?: number | null;
  has_permission?: number | null;
  has_outlet_access?: number | null;
};

export type AccessCheckOptions = {
  userId: number;
  companyId: number;
  allowedRoles?: readonly RoleCode[];
  module?: string;
  permission?: ModulePermission;
  outletId?: number;
};

export type AccessCheckResult = {
  isSuperAdmin: boolean;
  hasGlobalRole: boolean;
  hasRole: boolean;
  hasPermission: boolean;
  hasOutletAccess: boolean;
};

export async function checkUserAccess(options: AccessCheckOptions): Promise<AccessCheckResult | null> {
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

  if (allowedRoles && allowedRoles.length > 0) {
    const rolePlaceholders = allowedRoles.map(() => "?").join(", ");
    if (typeof outletId === "number") {
      selectParts.push(
        `(
           EXISTS(
             SELECT 1
             FROM user_role_assignments ura
             INNER JOIN roles r ON r.id = ura.role_id
             WHERE ura.user_id = u.id
               AND r.is_global = 1
               AND ura.outlet_id IS NULL
               AND r.code IN (${rolePlaceholders})
           ) OR EXISTS(
             SELECT 1
             FROM user_role_assignments ura
             INNER JOIN roles r ON r.id = ura.role_id
             INNER JOIN outlets o ON o.id = ura.outlet_id
             WHERE ura.user_id = u.id
               AND ura.outlet_id = ?
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
             SELECT 1
             FROM user_role_assignments ura
             INNER JOIN roles r ON r.id = ura.role_id
             WHERE ura.user_id = u.id
               AND r.is_global = 1
               AND ura.outlet_id IS NULL
               AND r.code IN (${rolePlaceholders})
           ) OR EXISTS(
             SELECT 1
             FROM user_role_assignments ura
             INNER JOIN roles r ON r.id = ura.role_id
             INNER JOIN outlets o ON o.id = ura.outlet_id
             WHERE ura.user_id = u.id
               AND o.company_id = u.company_id
               AND r.code IN (${rolePlaceholders})
           )
         ) AS has_role`
      );
      params.push(...allowedRoles, ...allowedRoles);
    }
  }

  if (module && permission) {
    const permissionBit = MODULE_PERMISSION_BITS[permission];
    if (typeof outletId === "number") {
      selectParts.push(
        `(
           EXISTS(
             SELECT 1
             FROM user_role_assignments ura
             INNER JOIN roles r ON r.id = ura.role_id
             INNER JOIN module_roles mr ON mr.role_id = r.id
             WHERE ura.user_id = u.id
               AND r.is_global = 1
               AND ura.outlet_id IS NULL
               AND mr.module = ?
               AND mr.company_id = u.company_id
               AND (mr.permission_mask & ?) <> 0
           ) OR EXISTS(
             SELECT 1
             FROM user_role_assignments ura
             INNER JOIN roles r ON r.id = ura.role_id
             INNER JOIN module_roles mr ON mr.role_id = r.id
             INNER JOIN outlets o ON o.id = ura.outlet_id
             WHERE ura.user_id = u.id
               AND ura.outlet_id = ?
               AND o.company_id = u.company_id
               AND mr.module = ?
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
             SELECT 1
             FROM user_role_assignments ura
             INNER JOIN roles r ON r.id = ura.role_id
             INNER JOIN module_roles mr ON mr.role_id = r.id
             WHERE ura.user_id = u.id
               AND r.is_global = 1
               AND ura.outlet_id IS NULL
               AND mr.module = ?
               AND mr.company_id = u.company_id
               AND (mr.permission_mask & ?) <> 0
           ) OR EXISTS(
             SELECT 1
             FROM user_role_assignments ura
             INNER JOIN roles r ON r.id = ura.role_id
             INNER JOIN module_roles mr ON mr.role_id = r.id
             INNER JOIN outlets o ON o.id = ura.outlet_id
             WHERE ura.user_id = u.id
               AND o.company_id = u.company_id
               AND mr.module = ?
               AND mr.company_id = u.company_id
               AND (mr.permission_mask & ?) <> 0
           )
         ) AS has_permission`
      );
      params.push(module, permissionBit, module, permissionBit);
    }
  }

  if (typeof outletId === "number") {
    selectParts.push(
      `EXISTS(
         SELECT 1
         FROM user_role_assignments ura
         INNER JOIN outlets o ON o.id = ura.outlet_id
         WHERE ura.user_id = u.id
           AND ura.outlet_id = ?
           AND o.company_id = u.company_id
       ) AS has_outlet_access`
    );
    params.push(outletId);
  }

  const pool = getDbPool();
  const [rows] = await pool.execute<AccessSnapshotRow[]>(
    `SELECT ${selectParts.join(", ")}
     FROM users u
     INNER JOIN companies c ON c.id = u.company_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
       AND c.deleted_at IS NULL
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

export async function listUserOutletIds(userId: number, companyId: number): Promise<number[]> {
  const outlets = await findUserOutlets(userId, companyId);
  return outlets.map((outlet) => outlet.id);
}
