// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError, z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "../../../../../src/lib/db";
import { hashPassword } from "../../../../../src/lib/password-hash";
import { getAppEnv } from "../../../../../src/lib/env";
import {
  validateAndConsumeToken,
  EmailTokenExpiredError,
  EmailTokenUsedError,
  EmailTokenInvalidError
} from "../../../../../src/lib/email-tokens";
import { successResponse, errorResponse } from "../../../../../src/lib/response";
import { getAuditService } from "../../../../../src/lib/audit";
import { readClientIp } from "../../../../../src/lib/request-meta";



const requestSchema = z
  .object({
    token: z.string().trim().min(1).max(500),
    new_password: z.string().min(8).max(100)
  })
  .strict();

function passwordHashPolicyFromEnv() {
  const env = getAppEnv();
  return {
    defaultAlgorithm: env.auth.password.defaultAlgorithm,
    bcryptRounds: env.auth.password.bcryptRounds,
    argon2MemoryKb: env.auth.password.argon2MemoryKb,
    argon2TimeCost: env.auth.password.argon2TimeCost,
    argon2Parallelism: env.auth.password.argon2Parallelism
  };
}

export async function POST(request: Request) {
  const pool = getDbPool();
  let connection: PoolConnection | undefined;

  try {
    const payload = await request.json();
    const input = requestSchema.parse(payload);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    let tokenInfo;
    try {
      tokenInfo = await validateAndConsumeToken(connection, input.token, "PASSWORD_RESET");
    } catch (error) {
      await connection.rollback();
      connection.release();
      
      if (error instanceof EmailTokenExpiredError || error instanceof EmailTokenUsedError || error instanceof EmailTokenInvalidError) {
        return errorResponse("INVALID_TOKEN", "Invalid or expired token", 400);
      }
      throw error;
    }

    const policy = passwordHashPolicyFromEnv();
    const passwordHash = await hashPassword(input.new_password, policy);

    await connection.execute(
      `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [passwordHash, tokenInfo.userId]
    );

    await connection.commit();
    connection.release();

    // Audit log after successful commit
    try {
      const auditService = getAuditService();
      await auditService.logAction(
        {
          company_id: tokenInfo.companyId,
          user_id: tokenInfo.userId,
          outlet_id: null,
          ip_address: readClientIp(request)
        },
        "user",
        tokenInfo.userId,
        "UPDATE",
        { action: "password_reset_confirmed", email: tokenInfo.email }
      );
    } catch (auditError) {
      console.error("Failed to write audit log for password reset confirm", auditError);
      // Don't fail the request if audit fails
    }

    return successResponse({ message: "Password has been reset successfully" });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
        connection.release();
      } catch (rollbackError) {
        console.error("Rollback failed", rollbackError);
      }
    }

    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("POST /api/auth/password-reset/confirm failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to reset password", 500);
  }
}
