// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { getDb } from "./db";
import { getAppEnv } from "./env";
import { hashPassword, needsRehash, verifyPassword, type PasswordHashPolicy } from "./password-hash";
import { authClient } from "./auth-client.js";
import {
  ROLE_CODES,
  type RoleCode,
  type ModulePermission,
  MODULE_PERMISSION_BITS,
  buildPermissionMask,
} from "@jurnapod/auth";

// Re-export types that are used by other modules in the API
export { ROLE_CODES };
export type { RoleCode, ModulePermission };
export { MODULE_PERMISSION_BITS, buildPermissionMask };

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

type UserLoginRow = {
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

type LoginAuditResult = "SUCCESS" | "FAIL";

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

async function checkUserHasSuperAdminRole(userId: number): Promise<boolean> {
  const db = getDb();
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

async function findUserForLogin(
  companyCode: string,
  email: string
): Promise<UserLoginRow | null> {
  const db = getDb();
  
  // Query WITHOUT deleted_at check to allow SUPER_ADMIN login when company is deleted
  const row = await db
    .selectFrom("users as u")
    .innerJoin("companies as c", "c.id", "u.company_id")
    .where("c.code", "=", companyCode)
    .where("u.email", "=", email)
    .select(["u.id", "u.company_id", "u.email", "u.password_hash", "u.is_active", "c.deleted_at"])
    .executeTakeFirst();

  if (!row) return null;

  // If company deleted, only SUPER_ADMIN can login
  if (row.deleted_at !== null) {
    const isSuperAdmin = await checkUserHasSuperAdminRole(row.id);
    if (!isSuperAdmin) {
      return null;
    }
  }

  return row;
}

async function signAccessToken(user: AccessTokenUser): Promise<string> {
  return authClient.tokens.signAccessToken(user);
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
  const db = getDb();
  
  await db
    .updateTable("users")
    .set({
      password_hash: nextPasswordHash,
      updated_at: new Date()
    })
    .where("id", "=", user.id)
    .where("company_id", "=", user.company_id)
    .where("password_hash", "=", user.password_hash)
    .execute();
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

export async function findActiveUserTokenProfile(
  userId: number,
  companyId: number
): Promise<AccessTokenUser | null> {
  return authClient.rbac.getUserForTokenVerification(userId, companyId);
}

export async function findActiveUserById(
  userId: number,
  companyId: number
): Promise<AuthenticatedUser | null> {
  return authClient.rbac.getUserWithRoles(userId, companyId);
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
  const db = getDb();
  const success = record.reason === "success";
  const normalizedResult = success ? "SUCCESS" : "FAIL";
  const status = success ? 1 : 0; // Using status codes: 1=SUCCESS, 0=FAIL
  
  // For failed logins without valid company, use null to avoid FK constraint violation
  // Audit logs are immutable and must be writeable even for invalid company attempts
  const companyId = record.companyId ?? null;
  const userId = record.userId ?? null;
  
  await db
    .insertInto("audit_logs")
    .values({
      company_id: companyId,
      outlet_id: null,
      user_id: userId,
      action: "AUTH_LOGIN",
      result: normalizedResult,
      success: success ? 1 : 0, // Legacy success field for backward compatibility
      status: status,
      ip_address: record.ipAddress,
      payload_json: JSON.stringify({
        company_code: record.companyCode,
        email: record.email,
        reason: record.reason,
        user_agent: record.userAgent
      })
    })
    .execute();
}

export async function userHasOutletAccess(
  userId: number,
  companyId: number,
  outletId: number
): Promise<boolean> {
  return authClient.rbac.hasOutletAccess(userId, companyId, outletId);
}

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
  return authClient.rbac.checkAccess(options);
}

export async function listUserOutletIds(userId: number, companyId: number): Promise<number[]> {
  return authClient.rbac.listUserOutletIds(userId, companyId);
}
