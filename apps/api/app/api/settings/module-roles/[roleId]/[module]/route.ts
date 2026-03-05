// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, ModuleSchema, ModuleRoleUpdateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../../src/lib/request-meta";
import {
  getRole,
  listModuleRoles,
  setModuleRolePermission,
  ModuleRoleNotFoundError,
  RoleNotFoundError
} from "../../../../../../src/lib/users";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";

const LOCKED_ROLE_CODES = new Set(["SUPER_ADMIN", "OWNER"]);
const FULL_PERMISSION_MASK = 15;

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

      const role = await getRole(roleId);
      const permissionMask = LOCKED_ROLE_CODES.has(role.code)
        ? FULL_PERMISSION_MASK
        : input.permission_mask;

      const moduleRole = await setModuleRolePermission({
        companyId: auth.companyId,
        roleId,
        module: moduleName,
        permissionMask,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(moduleRole);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof RoleNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      console.error("PUT /api/settings/module-roles/:roleId/:module failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Module role permission update failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "settings", permission: "update" })]
);
