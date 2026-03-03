// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError, z } from "zod";
import type { RowDataPacket } from "mysql2";
import { getDbPool } from "../../../../src/lib/db";
import { getAppEnv } from "../../../../src/lib/env";
import { createEmailToken } from "../../../../src/lib/email-tokens";
import { buildPasswordResetEmail } from "../../../../src/lib/email-templates";
import { queueEmail } from "../../../../src/lib/email-outbox";
import { successResponse, errorResponse } from "../../../../src/lib/response";
import {
  buildPasswordResetThrottleKeys,
  checkPasswordResetAllowed,
  recordPasswordResetAttempt
} from "../../../../src/lib/password-reset-throttle";
import { buildEmailLink } from "../../../../src/lib/email-link-builder";



const requestSchema = z
  .object({
    company_code: z.string().trim().min(1).max(50),
    email: z.string().trim().email().max(191)
  })
  .strict();

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

function readClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) {
      return ip;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : null;
}

function readUserAgent(request: Request): string | null {
  const userAgent = request.headers.get("user-agent")?.trim();
  return userAgent && userAgent.length > 0 ? userAgent : null;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const input = requestSchema.parse(payload);
    const pool = getDbPool();
    const env = getAppEnv();
    const ipAddress = readClientIp(request);
    const userAgent = readUserAgent(request);

    // Check rate limit before any DB operations
    const throttleKeys = buildPasswordResetThrottleKeys({
      email: input.email,
      ipAddress
    });

    const rateLimitCheck = await checkPasswordResetAllowed(throttleKeys);
    if (!rateLimitCheck.allowed) {
      return errorResponse(
        "RATE_LIMIT_EXCEEDED",
        "Too many password reset requests. Please try again later.",
        429,
        rateLimitCheck.retryAfterSeconds
          ? { "Retry-After": rateLimitCheck.retryAfterSeconds.toString() }
          : undefined
      );
    }

    const [companyRows] = await pool.execute<CompanyRow[]>(
      `SELECT id, code, name FROM companies WHERE code = ? LIMIT 1`,
      [input.company_code]
    );

    if (companyRows.length === 0) {
      // Still record attempt even if company doesn't exist (prevent enumeration)
      await recordPasswordResetAttempt({ keys: throttleKeys, ipAddress, userAgent });
      return successResponse({ message: "If the email exists, a reset link will be sent" });
    }

    const company = companyRows[0];

    const [userRows] = await pool.execute<UserRow[]>(
      `SELECT id, company_id, email FROM users WHERE company_id = ? AND email = ? LIMIT 1`,
      [company.id, input.email.toLowerCase()]
    );

    if (userRows.length === 0) {
      // Still record attempt even if user doesn't exist (prevent enumeration)
      await recordPasswordResetAttempt({ keys: throttleKeys, ipAddress, userAgent });
      return successResponse({ message: "If the email exists, a reset link will be sent" });
    }

    const user = userRows[0];

    const { token } = await createEmailToken({
      companyId: company.id,
      userId: user.id,
      email: user.email,
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    const actionUrl = buildEmailLink("/reset-password", token);
    const template = buildPasswordResetEmail({
      userName: user.email.split("@")[0],
      companyName: company.name,
      actionUrl,
      expiryHours: env.email.tokenTtl.passwordResetMinutes / 60
    });

    await queueEmail({
      companyId: company.id,
      userId: user.id,
      toEmail: user.email,
      subject: template.subject,
      html: template.html,
      text: template.text
    });

    // Record successful password reset request
    await recordPasswordResetAttempt({ keys: throttleKeys, ipAddress, userAgent });

    return successResponse({ message: "If the email exists, a reset link will be sent" });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("POST /api/auth/password-reset/request failed", error);
    return errorResponse(
      "INTERNAL_SERVER_ERROR",
      "Failed to process password reset request",
      500
    );
  }
}
