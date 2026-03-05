// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RowDataPacket } from "mysql2";
import { getDbPool } from "../../../../../src/lib/db";
import { getAppEnv } from "../../../../../src/lib/env";
import { createEmailToken } from "../../../../../src/lib/email-tokens";
import { buildVerifyEmail } from "../../../../../src/lib/email-templates";
import { queueEmail } from "../../../../../src/lib/email-outbox";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { successResponse, errorResponse } from "../../../../../src/lib/response";
import { buildEmailLink } from "../../../../../src/lib/email-link-builder";

type UserRow = RowDataPacket & {
  id: number;
  company_id: number;
  email: string;
};

type CompanyRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
};

export const POST = withAuth(
  async (request, auth) => {
    try {
      const pool = getDbPool();
      const env = getAppEnv();

      const [userRows] = await pool.execute<UserRow[]>(
        `SELECT id, company_id, email FROM users WHERE id = ? AND company_id = ? LIMIT 1`,
        [auth.userId, auth.companyId]
      );

      if (userRows.length === 0) {
        return errorResponse("NOT_FOUND", "User not found", 404);
      }

      const user = userRows[0];

      const [companyRows] = await pool.execute<CompanyRow[]>(
        `SELECT id, code, name FROM companies WHERE id = ? LIMIT 1`,
        [auth.companyId]
      );

      const company = companyRows[0];

      const { token } = await createEmailToken({
        companyId: company.id,
        userId: user.id,
        email: user.email,
        type: "VERIFY_EMAIL",
        createdBy: auth.userId
      });

      const actionUrl = buildEmailLink("/verify-email", token);
      const template = buildVerifyEmail({
        userName: user.email.split("@")[0],
        companyName: company.name,
        actionUrl,
        expiryHours: env.email.tokenTtl.verifyEmailMinutes / 60
      });

      await queueEmail({
        companyId: company.id,
        userId: user.id,
        toEmail: user.email,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      return successResponse({ message: "Verification email sent successfully" });
    } catch (error) {
      console.error("POST /api/auth/email/verify/request failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to send verification email", 500);
    }
  },
  [
    requireAccess({
      roles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"],
      module: "users",
      permission: "read"
    })
  ]
);
