// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getAppEnv } from "../../../../src/lib/env";
import {
  getAllPlatformSettings,
  setBulkPlatformSettings
} from "../../../../src/lib/platform-settings";
import {
  PlatformSettingsUpdateSchema,
  validateMailerDependencies
} from "../../../../src/lib/platform-settings-schemas";
import { readClientIp } from "../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import { getAuditService } from "../../../../src/lib/audit";

/**
 * GET /api/platform/settings
 * Returns merged view: DB settings + env defaults
 */
export const GET = withAuth(
  async (_request, _auth) => {
    try {
      const env = getAppEnv();
      const dbSettings = await getAllPlatformSettings();

      // Build merged response (DB overrides env)
      const merged: Record<string, any> = {
        "mailer.driver": dbSettings["mailer.driver"]?.value ?? env.mailer.driver,
        "mailer.from_name": dbSettings["mailer.from_name"]?.value ?? env.mailer.fromName,
        "mailer.from_email": dbSettings["mailer.from_email"]?.value ?? env.mailer.fromEmail,
        "mailer.smtp.host": dbSettings["mailer.smtp.host"]?.value ?? env.mailer.smtp.host,
        "mailer.smtp.port": dbSettings["mailer.smtp.port"]?.value ?? String(env.mailer.smtp.port),
        "mailer.smtp.user": dbSettings["mailer.smtp.user"]?.value ?? env.mailer.smtp.user,
        "mailer.smtp.pass": dbSettings["mailer.smtp.pass"]?.value ?? "*****",
        "mailer.smtp.secure": dbSettings["mailer.smtp.secure"]?.value ?? String(env.mailer.smtp.secure),
        "mailer.smtp.tls_reject_unauthorized":
          dbSettings["mailer.smtp.tls_reject_unauthorized"]?.value ??
          String(env.mailer.smtp.tlsRejectUnauthorized)
      };

      // Mark which fields are set in DB vs env
      const metadata: Record<string, { is_set_in_db: boolean; is_sensitive: boolean }> = {};
      for (const key of Object.keys(merged)) {
        metadata[key] = {
          is_set_in_db: dbSettings[key]?.is_set ?? false,
          is_sensitive: dbSettings[key]?.is_sensitive ?? false
        };
      }

      return successResponse({ settings: merged, metadata });
    } catch (error) {
      console.error("GET /api/platform/settings failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Platform settings request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "read" })]
);

/**
 * PUT /api/platform/settings
 * Updates platform settings (partial update)
 */
export const PUT = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = PlatformSettingsUpdateSchema.parse(payload);

      // Validate mailer dependencies
      const validationError = validateMailerDependencies(input.settings);
      if (validationError) {
        return errorResponse("VALIDATION_ERROR", validationError, 400);
      }

      // Get current settings for audit log
      const currentSettings = await getAllPlatformSettings();
      const before: Record<string, any> = {};
      for (const key of Object.keys(input.settings)) {
        before[key] = currentSettings[key]?.value ?? null;
      }

      // Update settings
      await setBulkPlatformSettings({
        settings: input.settings,
        updatedBy: auth.userId
      });

      // Audit log
      const auditService = getAuditService();
      await auditService.logUpdate(
        {
          company_id: auth.companyId,
          user_id: auth.userId,
          outlet_id: null,
          ip_address: readClientIp(request)
        },
        "setting",
        "platform_settings",
        before,
        input.settings
      );

      // Return updated settings
      const updated = await getAllPlatformSettings();
      return successResponse({ settings: updated });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("PUT /api/platform/settings failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Platform settings request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "update" })]
);
