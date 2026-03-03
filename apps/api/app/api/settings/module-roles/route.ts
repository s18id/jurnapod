// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ModuleSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { listModuleRoles } from "../../../../src/lib/users";
import { errorResponse, successResponse } from "../../../../src/lib/response";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const roleIdParam = url.searchParams.get("role_id");
      const moduleParam = url.searchParams.get("module");

      const roleId = roleIdParam ? NumericIdSchema.parse(roleIdParam) : undefined;
      const moduleName = moduleParam ? ModuleSchema.parse(moduleParam) : undefined;

      const moduleRoles = await listModuleRoles({
        companyId: auth.companyId,
        roleId,
        module: moduleName
      });
      return successResponse(moduleRoles);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      console.error("GET /api/settings/module-roles failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Module roles request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER", "ADMIN"], module: "settings", permission: "read" })]
);
