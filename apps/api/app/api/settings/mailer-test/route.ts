// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getMailer, MailerError } from "../../../../src/lib/mailer";
import { readClientIp } from "../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import { getAuditService } from "../../../../src/lib/audit";

const testMailSchema = z
  .object({
    to: z.string().email().max(191),
    subject: z.string().min(1).max(500),
    html: z.string().optional(),
    text: z.string().optional()
  })
  .strict()
  .refine((data) => data.html || data.text, {
    message: "At least one of html or text body is required"
  });

// Simple in-memory rate limiter for test endpoint
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5; // 5 emails per minute per user

function checkRateLimit(userId: number): boolean {
  const key = `user:${userId}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS
    });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count += 1;
  return true;
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      // Rate limit check
      if (!checkRateLimit(auth.userId)) {
        return errorResponse(
          "RATE_LIMIT_EXCEEDED",
          "Too many test emails. Please wait before trying again.",
          429
        );
      }

      const payload = await request.json();
      const input = testMailSchema.parse(payload);

      const mailer = await getMailer();
      await mailer.sendMail({
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text
      });

      // Audit log (using "setting" entity type for mailer test actions)
      const auditService = getAuditService();
      await auditService.logAction(
        {
          company_id: auth.companyId,
          user_id: auth.userId,
          outlet_id: null,
          ip_address: readClientIp(request)
        },
        "setting",
        "mailer_test",
        "CREATE", // CREATE action for test email send
        {
          action: "mailer_test",
          to: input.to,
          subject: input.subject,
          has_html: !!input.html,
          has_text: !!input.text
        }
      );

      return successResponse({ message: "Test email sent successfully" });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof MailerError) {
        console.error("POST /api/settings/mailer-test mailer error", {
          message: error.message,
          cause: error.cause
        });
        return errorResponse("MAILER_ERROR", error.message, 500);
      }

      console.error("POST /api/settings/mailer-test failed", error);
      return errorResponse("MAILER_ERROR", "Failed to send test email", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "update" })]
);
