// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, ModuleSchema, ModuleRoleUpdateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { listModuleRoles, setModuleRolePermission, ModuleRoleNotFoundError } from "../../../../../../src/lib/users";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";

function parseParams(request: Request): { roleId: number; moduleName: string } {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const roleIdRaw = parts[parts.length - 2];
  const moduleRaw = parts[parts.length - 1];
  return {
    roleId: NumericIdSchema.parse(roleIdRaw),
    moduleName: ModuleSchema.parse(moduleRaw)
  };
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const { roleId, moduleName } = parseParams(request);
      const moduleRoles = await listModuleRoles({
        companyId: auth.companyId,
        roleId,
        module: moduleName
      });
      if (moduleRoles.length === 0) {
        return errorResponse("NOT_FOUND", "Module role not found", 404);
      }
      return successResponse(moduleRoles[0]);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof ModuleRoleNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      console.error("GET /api/settings/module-roles/:roleId/:module failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Module role permission update failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER", "ADMIN"], module: "settings", permission: "read" })]
);

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const { roleId, moduleName } = parseParams(request);
      const body = await request.json();
      const input = ModuleRoleUpdateRequestSchema.parse(body);

      const moduleRole = await setModuleRolePermission({
        companyId: auth.companyId,
        roleId,
        module: moduleName,
        permissionMask: input.permission_mask
      });

      return successResponse(moduleRole);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      console.error("PUT /api/settings/module-roles/:roleId/:module failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Module role permission update failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "update" })]
);
