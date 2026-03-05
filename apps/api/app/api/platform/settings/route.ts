// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import {
  ensurePlatformSettingsSeeded,
  getAllPlatformSettings,
  PLATFORM_SETTINGS_KEYS,
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
 * Returns platform settings from DB
 */
export const GET = withAuth(
  async (_request, _auth) => {
    try {
      await ensurePlatformSettingsSeeded();
      const dbSettings = await getAllPlatformSettings();

      const settings: Record<string, any> = {};
      for (const key of PLATFORM_SETTINGS_KEYS) {
        const entry = dbSettings[key];
        settings[key] = entry?.value ?? "";
      }

      return successResponse({ settings });
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
      await ensurePlatformSettingsSeeded();
      const payload = await request.json();
      const input = PlatformSettingsUpdateSchema.parse(payload);

      const currentSettings = await getAllPlatformSettings();
      const hasExistingSmtpPass = currentSettings["mailer.smtp.pass"]?.is_set === true;

      // Validate mailer dependencies
      const validationError = validateMailerDependencies(input.settings, { hasExistingSmtpPass });
      if (validationError) {
        return errorResponse("VALIDATION_ERROR", validationError, 400);
      }

      // Get current settings for audit log
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
      const settings: Record<string, any> = {};
      for (const key of PLATFORM_SETTINGS_KEYS) {
        const entry = updated[key];
        settings[key] = entry?.value ?? "";
      }
      return successResponse({ settings });
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
