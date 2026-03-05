// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError, z } from "zod";
import type { RowDataPacket } from "mysql2";
import { NumericIdSchema } from "@jurnapod/shared";
import { getDbPool } from "../../../../../src/lib/db";
import { getAppEnv } from "../../../../../src/lib/env";
import { createEmailToken } from "../../../../../src/lib/email-tokens";
import { buildUserInviteEmail } from "../../../../../src/lib/email-templates";
import { queueEmail } from "../../../../../src/lib/email-outbox";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { successResponse, errorResponse } from "../../../../../src/lib/response";
import { getAuditService } from "../../../../../src/lib/audit";
import { buildEmailLink } from "../../../../../src/lib/email-link-builder";

type UserRow = RowDataPacket & {
  id: number;
  company_id: number;
  email: string;
  is_active: number;
};

type CompanyRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
};

export const POST = withAuth(
  async (request, auth) => {
    try {
      const pathname = new URL(request.url).pathname;
      const parts = pathname.split("/").filter(Boolean);
      const userIdRaw = parts[parts.indexOf("users") + 1];
      const userId = NumericIdSchema.parse(userIdRaw);
      const pool = getDbPool();
      const env = getAppEnv();

      const [userRows] = await pool.execute<UserRow[]>(
        `SELECT id, company_id, email, is_active FROM users WHERE id = ? AND company_id = ? LIMIT 1`,
        [userId, auth.companyId]
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
        type: "INVITE",
        createdBy: auth.userId
      });

      const actionUrl = buildEmailLink("/invite", token);
      const template = buildUserInviteEmail({
        userName: user.email.split("@")[0],
        companyName: company.name,
        actionUrl,
        expiryHours: env.email.tokenTtl.inviteMinutes / 60
      });

      await queueEmail({
        companyId: company.id,
        userId: user.id,
        toEmail: user.email,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      // Audit log (non-blocking)
      try {
        const auditService = getAuditService();
        await auditService.logAction(
          {
            company_id: auth.companyId,
            user_id: auth.userId,
            outlet_id: null,
            ip_address: readClientIp(request)
          },
          "user",
          user.id,
          "UPDATE",
          { action: "invite_sent", email: user.email }
        );
      } catch (auditError) {
        console.error("Failed to write audit log for invite send", auditError);
        // Don't fail the request if audit fails
      }

      return successResponse({ message: "Invitation email sent successfully" });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("POST /api/users/:id/invite failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to send invitation", 500);
    }
  },
  [
    requireAccess({
      roles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN"],
      module: "users",
      permission: "update"
    })
  ]
);
