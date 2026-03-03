// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError, z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "../../../../../../src/lib/db";
import {
  validateAndConsumeToken,
  EmailTokenExpiredError,
  EmailTokenUsedError,
  EmailTokenInvalidError
} from "../../../../../../src/lib/email-tokens";
import { successResponse, errorResponse } from "../../../../../../src/lib/response";
import { getAuditService } from "../../../../../../src/lib/audit";
import { readClientIp } from "../../../../../../src/lib/request-meta";



const requestSchema = z
  .object({
    token: z.string().trim().min(1).max(500)
  })
  .strict();

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
      tokenInfo = await validateAndConsumeToken(connection, input.token, "VERIFY_EMAIL");
    } catch (error) {
      await connection.rollback();
      connection.release();
      
      if (error instanceof EmailTokenExpiredError || error instanceof EmailTokenUsedError || error instanceof EmailTokenInvalidError) {
        return errorResponse("INVALID_TOKEN", "Invalid or expired token", 400);
      }
      throw error;
    }

    await connection.execute(
      `UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [tokenInfo.userId]
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
        { action: "email_verified", email: tokenInfo.email }
      );
    } catch (auditError) {
      console.error("Failed to write audit log for email verify confirm", auditError);
      // Don't fail the request if audit fails
    }

    return successResponse({ message: "Email verified successfully" });
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

    console.error("POST /api/auth/email/verify/confirm failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to verify email", 500);
  }
}
